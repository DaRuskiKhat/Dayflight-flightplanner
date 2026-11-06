/* METAR/TAF decoding for the airport weather in SimBrief OFPs. No network access; works on the text the OFP already contains. */
'use strict';
const Weather=(()=>{
 const SM=1609.344;
 // Flight category from visibility (metres) and ceiling (feet AGL), FAA thresholds.
 function category(visM,ceilFt){
  const v=Number.isFinite(visM)?visM:Infinity,c=Number.isFinite(ceilFt)?ceilFt:Infinity;
  if(c<500||v<1*SM)return 'lifr';
  if(c<1000||v<3*SM)return 'ifr';
  if(c<=3000||v<=5*SM)return 'mvfr';
  return 'vfr';
 }
 function smToMetres(token){
  const m=token.match(/^(P|M)?(?:(\d+)\s)?(\d+)(?:\/(\d+))?SM$/);if(!m)return null;
  let v=Number(m[3]);if(m[4])v=v/Number(m[4]);if(m[2])v+=Number(m[2]);
  return v*SM;
 }
 // Decode the weather elements of one METAR or TAF group (tokens after the header/time fields).
 function elements(tokens){
  const out={};
  for(let i=0;i<tokens.length;i++){
   const t=tokens[i];
   let m;
   if((m=t.match(/^(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?(KT|MPS|KMH)$/))){
    const f=m[4]==='MPS'?1.943844:m[4]==='KMH'?0.539957:1;
    out.wind={dir:m[1]==='VRB'?null:Number(m[1]),speed:Math.round(Number(m[2])*f),gust:m[3]?Math.round(Number(m[3])*f):null};
   }else if(t==='CAVOK'){out.vis=10000;out.visPlus=true;out.clouds=[];out.cavok=true;}
   else if(/^\d{4}$/.test(t)&&!out.vis){out.vis=t==='9999'?10000:Number(t);out.visPlus=t==='9999';out.visUnit='m';}
   else if(/^\d$/.test(t)&&/^\d\/\dSM$/.test(tokens[i+1]||'')){out.vis=smToMetres(`${t} ${tokens[i+1]}`);out.visUnit='SM';i++;}
   else if(/SM$/.test(t)&&smToMetres(t)!==null){out.vis=smToMetres(t);out.visPlus=t.startsWith('P');out.visUnit='SM';}
   else if((m=t.match(/^(FEW|SCT|BKN|OVC|VV)(\d{3}|\/\/\/)(CB|TCU)?$/))){
    (out.clouds||=[]).push({cover:m[1],height:m[2]==='///'?null:Number(m[2])*100,type:m[3]||''});
   }else if(/^(SKC|CLR|NSC|NCD)$/.test(t))out.clouds=[];
   else if((m=t.match(/^(M?\d{2})\/(M?\d{2})?$/))){
    const c=v=>v==null?null:(v.startsWith('M')?-Number(v.slice(1)):Number(v));out.temp=c(m[1]);out.dew=c(m[2]);
   }else if((m=t.match(/^Q(\d{4})$/)))out.qnh={value:Number(m[1]),unit:'hPa'};
   else if((m=t.match(/^A(\d{4})$/)))out.qnh={value:Number(m[1])/100,unit:'inHg'};
   else if(/^[-+]?(VC)?(MI|BC|PR|DR|BL|SH|TS|FZ)?(DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS)+$/.test(t))(out.wx||=[]).push(t);
  }
  return out;
 }
 function ceilingOf(clouds){
  if(!clouds)return null;
  const layers=clouds.filter(c=>(c.cover==='BKN'||c.cover==='OVC'||c.cover==='VV')&&c.height!==null);
  return layers.length?Math.min(...layers.map(c=>c.height)):Infinity;
 }
 function summarise(e){
  const ceiling=ceilingOf(e.clouds);
  return {...e,ceiling,category:e.vis!==undefined||e.clouds?category(e.vis,ceiling):null};
 }
 function decodeMetar(raw){
  const tokens=String(raw||'').replace(/=+$/,'').trim().split(/\s+/);
  const cut=tokens.findIndex(t=>/^(TEMPO|BECMG|NOSIG|RMK)$/.test(t));
  return summarise(elements(cut>=0?tokens.slice(0,cut):tokens));
 }
 // TAF day/hour fields are relative to the issue time; resolve them to absolute UTC ms (handles month rollover).
 function resolver(issued){
  const base=new Date(issued);
  return (day,hour,minute=0)=>{
   let y=base.getUTCFullYear(),mo=base.getUTCMonth();
   if(day<base.getUTCDate()-15){mo++;if(mo>11){mo=0;y++;}}
   return Date.UTC(y,mo,day,hour,minute);
  };
 }
 function decodeTaf(raw,issued){
  const text=String(raw||'').replace(/=+$/,'').replace(/\s+/g,' ').trim();
  if(!text||!Number.isFinite(issued))return null;
  const at=resolver(issued),tokens=text.split(' ');
  // Split into groups at change indicators.
  const groups=[];let cur={kind:'BASE',tokens:[]};
  for(let i=0;i<tokens.length;i++){
   const t=tokens[i];
   if(/^FM\d{6}$/.test(t)||t==='TEMPO'||t==='BECMG'||/^PROB\d{2}$/.test(t)){
    if(cur.tokens.length||cur.kind!=='BASE')groups.push(cur);
    if(/^PROB\d{2}$/.test(t)&&tokens[i+1]==='TEMPO'){cur={kind:t+' TEMPO',tokens:[]};i++;}
    else cur={kind:/^FM/.test(t)?'FM':t,tokens:/^FM/.test(t)?[t]:[]};
   }else cur.tokens.push(t);
  }
  groups.push(cur);
  const out=[];let validFrom=null,validTo=null;
  for(const g of groups){
   let from=null,to=null,rest=g.tokens;
   if(g.kind==='FM'){const m=g.tokens[0].match(/^FM(\d{2})(\d{2})(\d{2})$/);from=at(+m[1],+m[2],+m[3]);rest=g.tokens.slice(1);}
   const pi=rest.findIndex(t=>/^\d{4}\/\d{4}$/.test(t));
   if(pi>=0){const m=rest[pi].match(/^(\d{2})(\d{2})\/(\d{2})(\d{2})$/);from=at(+m[1],+m[2]);to=at(+m[3],+m[4]);if(g.kind==='BASE'){validFrom=from;validTo=to;}rest=rest.slice(pi+1);}
   out.push({kind:g.kind,from,to,raw:(g.kind==='BASE'||g.kind==='FM'?'':g.kind+' ')+g.tokens.join(' '),el:elements(rest)});
  }
  return {validFrom,validTo,groups:out};
 }
 // Conditions forecast at time t: prevailing (base, FM replacements, completed BECMG changes) plus TEMPO/PROB spells covering t.
 function tafAt(taf,t){
  if(!taf||!taf.groups.length)return null;
  const inPeriod=taf.validFrom!==null&&taf.validTo!==null&&t>=taf.validFrom&&t<=taf.validTo;
  let state={...taf.groups[0].el},source=[taf.groups[0]];
  const spells=[];
  for(const g of taf.groups.slice(1)){
   if(g.kind==='FM'&&g.from<=t){state={...g.el};source=[g];}
   else if(g.kind==='BECMG'&&g.to!==null&&g.to<=t){state={...state,...g.el};source.push(g);}
   else if((g.kind==='TEMPO'||/^PROB/.test(g.kind))&&g.from!==null&&g.to!==null&&t>=g.from&&t<g.to)spells.push({kind:g.kind,raw:g.raw,...summarise(g.el)});
   else if(g.kind==='BECMG'&&g.from!==null&&g.to!==null&&t>=g.from&&t<g.to)spells.push({kind:g.kind,raw:g.raw,...summarise(g.el)});
  }
  return {inPeriod,prevailing:summarise(state),spells,source:source.map(g=>g.raw)};
 }
 return {category,decodeMetar,decodeTaf,tafAt,ceilingOf};
})();
if(typeof module!=='undefined')module.exports=Weather;
