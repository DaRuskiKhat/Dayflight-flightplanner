/* SimBrief OFP import and timed route interpolation. No credentials or dependencies. */
'use strict';
const SimBrief=(()=>{
 const number=v=>v===null||v===undefined||String(v).trim()===''?null:Number.isFinite(Number(v))?Number(v):null;
 const text=(v,max=160)=>typeof v==='string'||typeof v==='number'?String(v).slice(0,max):'';
 function seconds(v){if(v===null||v===undefined||v==='')return null;if(typeof v==='number'||/^\d+(\.\d+)?$/.test(String(v)))return number(v);const m=String(v).match(/^(\d+):([0-5]\d):([0-5]\d(?:\.\d+)?)$/);return m?+m[1]*3600+ +m[2]*60+ +m[3]:null;}
 function instant(v){if(v===null||v===undefined||v==='')return null;const n=number(v);if(n!==null)return n>1e12?n:n*1000;const s=String(v);return /(?:Z|[+-]\d\d:\d\d)$/.test(s)&&Number.isFinite(Date.parse(s))?Date.parse(s):null;}
 function coord(lat,lon){return lat!==null&&lon!==null&&Math.abs(lat)<=90&&Math.abs(lon)<=180;}
 function airport(raw){const lat=number(raw?.pos_lat),lon=number(raw?.pos_long),code=text(raw?.icao_code,8).toUpperCase();if(!/^[A-Z0-9]{3,8}$/.test(code)||!coord(lat,lon))throw Error('OFP is missing valid departure/destination airport coordinates.');return {code,lat,lon,name:text(raw.name)||code,elevation:number(raw.elevation),offset:number(raw.timezone)};}
 function xmlObject(xml){if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('OFP XML must not contain document types or entities.');const doc=new DOMParser().parseFromString(xml,'application/xml');if(doc.querySelector('parsererror'))throw Error('The OFP XML is not valid.');function read(node){if(!node.children.length)return node.textContent.trim();const out=Object.create(null);for(const child of node.children){const key=child.localName,value=read(child);if(Object.hasOwn(out,key))out[key]=Array.isArray(out[key])?[...out[key],value]:[out[key],value];else out[key]=value;}return out;}return read(doc.documentElement);}
 function parse(value){if(typeof value==='string'){if(value.length>12*1024*1024)throw Error('Choose an OFP under 12 MB.');try{value=value.trim().startsWith('<')?xmlObject(value):JSON.parse(value);}catch(e){throw Error('Cannot read OFP: '+e.message);}}return normalize(value?.OFP||value);}
 function normalize(raw){
  if(!raw||typeof raw!=='object')throw Error('Choose a SimBrief OFP JSON or XML file.');
  if(raw.fetch?.status&&String(raw.fetch.status).toLowerCase()!=='success')throw Error(text(raw.fetch.status));
  const origin=airport(raw.origin),destination=airport(raw.destination),times=raw.times||{},warnings=[];
  let takeoff=instant(times.est_off);
  if(takeoff===null){const out=(instant(times.est_out)??instant(times.sched_out)),taxi=seconds(times.taxi_out);if(out!==null&&taxi!==null){takeoff=out+taxi*1000;warnings.push('Takeoff derived from off-block time plus taxi-out.');}else{takeoff=instant(times.sched_off);warnings.push('Using scheduled takeoff; estimated takeoff was unavailable.');}}
  if(takeoff===null||takeoff<Date.UTC(2020,0,1)||takeoff>=Date.UTC(2101,0,1))throw Error('OFP has no usable takeoff date/time.');
  const landing=instant(times.est_on),enroute=seconds(times.est_time_enroute);let durationSec=enroute;
  if(durationSec===null&&landing!==null)durationSec=(landing-takeoff)/1000;
  if(!durationSec||durationSec<60||durationSec>48*3600)throw Error('OFP airborne duration must be between 1 minute and 48 hours.');
  if(landing!==null&&Math.abs(landing-takeoff-durationSec*1000)>60000)warnings.push('Landing timestamp differs from airborne duration; using airborne duration.');
  let nav=Array.isArray(raw.navlog)?raw.navlog:raw.navlog?.fix||[];if(!Array.isArray(nav))nav=[nav];if(nav.length>3000)throw Error('OFP has too many route fixes.');
  const fixes=[{id:origin.code,lat:origin.lat,lon:origin.lon,elapsed:0,altitude:origin.elevation,stage:'DEP',airway:''}];let running=0,skipped=0,altitudes=0;
  for(const fix of nav){const lat=number(fix?.pos_lat),lon=number(fix?.pos_long),leg=seconds(fix?.time_leg);let elapsed=seconds(fix?.time_total);if(elapsed===null&&leg!==null)elapsed=running+leg;if(elapsed===null||!coord(lat,lon)){skipped++;continue;}running=elapsed;
   if(elapsed<0||elapsed>durationSec+60)throw Error('OFP waypoint times fall outside its airborne duration.');elapsed=Math.min(elapsed,durationSec);
   const last=fixes.at(-1);if(elapsed<last.elapsed)throw Error('OFP waypoint times are out of sequence.');if(elapsed===last.elapsed){if(Math.abs(lat-last.lat)+Math.abs(lon-last.lon)<.03)continue;skipped++;continue;}
   let altitude=number(fix.altitude_feet);if(altitude!==null&&(altitude< -1500||altitude>65000))altitude=null;if(altitude!==null)altitudes++;
   fixes.push({id:text(fix.ident,24)||'FIX',lat,lon,elapsed,altitude,stage:text(fix.stage,8),airway:text(fix.via_airway,24)});
  }
  const routeAvailable=fixes.length>1;
  const last=fixes.at(-1);if(last.elapsed===durationSec){if(Math.abs(last.lat-destination.lat)+Math.abs(last.lon-destination.lon)>.1)warnings.push('Final timed fix is away from the destination; final connection is approximate.');fixes[fixes.length-1]={...last,id:destination.code,lat:destination.lat,lon:destination.lon,altitude:destination.elevation,stage:'ARR'};}
  else fixes.push({id:destination.code,lat:destination.lat,lon:destination.lon,elapsed:durationSec,altitude:destination.elevation,stage:'ARR',airway:''});
  if(skipped)warnings.push(`${skipped} unusable or simultaneous waypoint(s) omitted; connections are approximate.`);
  if(!routeAvailable)warnings.push('No timed waypoint route was supplied. Choose the explicit direct-route fallback to continue.');
  if(!altitudes)warnings.push('No usable waypoint altitudes; the vertical profile is unavailable.');
  else if(fixes.some(f=>f.altitude===null))warnings.push('Missing altitudes are interpolated where bounded by known values.');
  return validate({version:1,origin,destination,takeoff,durationSec,fixes,routeAvailable,profileAvailable:altitudes>0,aircraft:text(raw.aircraft?.icaocode||raw.aircraft?.name,60),callsign:text(raw.atc?.callsign||`${raw.general?.icao_airline||''}${raw.general?.flight_number||''}`,40),generated:instant(raw.params?.time_generated),airac:text(raw.params?.airac,8),route:text(raw.general?.route,6000),warnings});
 }
 function validate(p){if(!p||p.version!==1||!Array.isArray(p.fixes)||p.fixes.length<2||p.fixes.length>3002)throw Error('Saved SimBrief route is invalid.');if(!Number.isFinite(p.takeoff)||p.takeoff<Date.UTC(2020,0,1)||p.takeoff>=Date.UTC(2101,0,1)||!Number.isFinite(p.durationSec)||p.durationSec<60||p.durationSec>172800)throw Error('Saved SimBrief timing is invalid.');for(const point of [p.origin,p.destination])if(!point||!coord(number(point.lat),number(point.lon)))throw Error('Saved SimBrief airport is invalid.');let prev=-1;for(const f of p.fixes){if(!coord(number(f.lat),number(f.lon))||!Number.isFinite(f.elapsed)||f.elapsed<=prev||f.elapsed>p.durationSec||f.altitude!==null&&(!Number.isFinite(f.altitude)||f.altitude< -1500||f.altitude>65000))throw Error('Saved SimBrief waypoint is invalid.');prev=f.elapsed;}if(p.fixes[0].elapsed!==0||prev!==p.durationSec)throw Error('Saved SimBrief route does not span the airborne duration.');return {version:1,origin:{code:text(p.origin.code,8),name:text(p.origin.name),lat:number(p.origin.lat),lon:number(p.origin.lon),elevation:number(p.origin.elevation)},destination:{code:text(p.destination.code,8),name:text(p.destination.name),lat:number(p.destination.lat),lon:number(p.destination.lon),elevation:number(p.destination.elevation)},takeoff:p.takeoff,durationSec:p.durationSec,fixes:p.fixes.map(f=>({id:text(f.id,24),lat:number(f.lat),lon:number(f.lon),elapsed:f.elapsed,altitude:f.altitude,stage:text(f.stage,8),airway:text(f.airway,24)})),routeAvailable:p.routeAvailable===true,profileAvailable:p.profileAvailable===true,aircraft:text(p.aircraft,60),callsign:text(p.callsign,40),generated:Number.isFinite(p.generated)?p.generated:null,airac:text(p.airac,8),route:text(p.route,6000),warnings:Array.isArray(p.warnings)?p.warnings.slice(0,30).map(w=>text(w,240)):[]};}
 function altitudeAt(fixes,i,t){let left=i,right=i+1;while(left>=0&&fixes[left].altitude===null)left--;while(right<fixes.length&&fixes[right].altitude===null)right++;if(left<0||right>=fixes.length)return null;const a=fixes[left],b=fixes[right];return a.altitude+(b.altitude-a.altitude)*Math.max(0,Math.min(1,(t-a.elapsed)/(b.elapsed-a.elapsed)));}
 function position(plan,fraction,interpolate){const time=Math.max(0,Math.min(1,fraction))*plan.durationSec;let lo=0,hi=plan.fixes.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(plan.fixes[m].elapsed<=time)lo=m;else hi=m;}const a=plan.fixes[lo],b=plan.fixes[hi],f=(time-a.elapsed)/(b.elapsed-a.elapsed);return {...interpolate(a,b,Math.max(0,Math.min(1,f))),altitude:altitudeAt(plan.fixes,lo,time),from:a.id,to:b.id,airway:b.airway,stage:b.stage};}
 return {parse,normalize,validate,position,seconds,instant};
})();
if(typeof module!=='undefined')module.exports=SimBrief;
