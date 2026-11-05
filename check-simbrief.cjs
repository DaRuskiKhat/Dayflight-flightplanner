const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),SimBrief=require('./dist/simbrief.js');
const raw=JSON.parse(fs.readFileSync('tests/simbrief-synthetic.json','utf8').replace(/^\uFEFF/,''));
const clone=()=>JSON.parse(JSON.stringify(raw));
const plan=SimBrief.parse(raw);
assert.equal(plan.takeoff,Date.parse('2026-11-05T03:00:00Z'));
assert.equal(plan.durationSec,48600);
assert.equal(plan.takeoff+plan.durationSec*1000,Date.parse(raw.times.est_on));
assert.equal(plan.fixes.length,7);
assert.equal(plan.routeAvailable,true);assert.equal(plan.profileAvailable,true);
const context=vm.createContext({Intl,Date,Math,document:{getElementById:()=>({getContext:()=>({})})}});
vm.runInContext(fs.readFileSync('dist/app.js','utf8').split('// UI bindings')[0],context);
const interpolate=(a,b,f)=>{context.testA=a;context.testB=b;context.testF=f;return vm.runInContext('interpolate(testA,testB,testF)',context);};
let p=SimBrief.position(plan,3/13.5,interpolate);
assert(Math.abs(p.lat+10)<1e-8);assert(Math.abs(p.lon-178)<1e-8);assert.equal(p.altitude,33000);
p=SimBrief.position(plan,4.5/13.5,interpolate);assert(Math.abs(p.lon)>170);assert.equal(p.altitude,34000);
p=SimBrief.position(plan,1,interpolate);assert(Math.abs(p.lat-plan.destination.lat)<1e-8);assert.equal(p.altitude,125);
const direct=interpolate(plan.origin,plan.destination,3/13.5);assert(Math.abs(direct.lat+10)>1,'Imported route must differ from direct route at the same elapsed time.');
const n=clone();n.times.est_off=undefined;const derived=SimBrief.parse(n);assert.equal(derived.takeoff,plan.takeoff);assert.match(derived.warnings[0],/taxi-out/);
const numeric=clone();numeric.times.est_off=plan.takeoff/1000;numeric.times.est_on=(plan.takeoff+48600000)/1000;numeric.times.est_time_enroute=48600;numeric.navlog.forEach((f,i)=>f.time_total=SimBrief.seconds(f.time_total));assert.equal(SimBrief.parse(numeric).durationSec,48600);
const legacy=clone();legacy.navlog={fix:legacy.navlog};assert.equal(SimBrief.parse(legacy).fixes.length,7);
const missing=clone();delete missing.navlog;assert.equal(SimBrief.parse(missing).routeAvailable,false);
const sparse=clone();delete sparse.navlog[1].altitude_feet;p=SimBrief.position(SimBrief.parse(sparse),3/13.5,interpolate);assert(p.altitude>33000&&p.altitude<35000);
const none=clone();none.navlog.forEach(f=>delete f.altitude_feet);assert.equal(SimBrief.parse(none).profileAvailable,false);
const bad=clone();bad.navlog[2].time_total='00:10:00';assert.throws(()=>SimBrief.parse(bad),/sequence/);
const tooLate=clone();tooLate.navlog[2].time_total='20:00:00';assert.throws(()=>SimBrief.parse(tooLate),/outside/);
const badAirport=clone();badAirport.origin.pos_lat='';assert.throws(()=>SimBrief.parse(badAirport),/coordinates/);
const noTime=clone();noTime.times={};assert.throws(()=>SimBrief.parse(noTime),/takeoff/);
const corrupt=JSON.parse(JSON.stringify(plan));corrupt.fixes[2].elapsed=-1;assert.throws(()=>SimBrief.validate(corrupt),/waypoint/);
assert.equal(SimBrief.seconds('01:02:03'),3723);assert.equal(SimBrief.seconds('00:60:00'),null);assert.equal(SimBrief.instant('2026-11-05T03:00:00'),null);
const persisted=SimBrief.validate(JSON.parse(JSON.stringify(plan)));assert.equal(persisted.fixes.length,7);
context.SimBrief=SimBrief;context.testPlan=plan;
context.document.getElementById=id=>({value:({date:'2026-11-05',time:'14:00',timingMode:'speed',duration:'480',fromClockMode:'auto',toClockMode:'auto'})[id]||'hidden-manual-draft',checked:true});
vm.runInContext(fs.readFileSync('dist/import-ui.js','utf8'),context);
vm.runInContext("inputSource='simbrief';simbriefPlan=testPlan;manualDraft={privateDraft:'do-not-share'}",context);
let portable=JSON.parse(vm.runInContext('JSON.stringify(planState(true))',context));
assert.equal(portable.from,'YSSY');assert.equal(portable.to,'KLAX');assert.equal(portable.duration,'13.5');
assert(!JSON.stringify(portable).includes('hidden-manual-draft'));assert(!Object.hasOwn(portable,'manualDraft'));
vm.runInContext("inputSource='manual'",context);
portable=JSON.parse(vm.runInContext('JSON.stringify(planState(true))',context));assert.equal(portable.simbrief,null);

// Taxi times: explicit taxi_out/taxi_in, else from off/on-block gaps; older saved plans default to 0.
assert.equal(typeof plan.taxiOutSec,'number');
{const t=clone();t.times.taxi_out='00:15:00';t.times.taxi_in='00:07:00';const tp=SimBrief.parse(t);assert.equal(tp.taxiOutSec,900);assert.equal(tp.taxiInSec,420);
 const g=clone();delete g.times.taxi_out;delete g.times.taxi_in;g.times.est_out=new Date(Date.parse(g.times.est_off)-20*60000).toISOString().replace('.000','');g.times.est_in=new Date(Date.parse(g.times.est_on)+8*60000).toISOString().replace('.000','');const gp=SimBrief.parse(g);assert.equal(gp.taxiOutSec,1200);assert.equal(gp.taxiInSec,480);
 const old=JSON.parse(JSON.stringify(tp));delete old.taxiOutSec;delete old.taxiInSec;const ov=SimBrief.validate(old);assert.equal(ov.taxiOutSec,0);assert.equal(ov.taxiInSec,0);}
// Navlog telemetry: leg values from the fix ending the leg, wind/OAT from the nearest fix, fuel interpolated from takeoff fuel.
assert.equal(plan.telemetryAvailable,false);assert.equal(SimBrief.telemetryAt(plan,.5),null);
{const t=clone();t.params.units='kgs';t.fuel={plan_takeoff:'50000',plan_landing:'8000'};Object.assign(t.navlog[0],{heading_true:'092',track_true:'090',true_airspeed:'480',mach_thousandths:'0.830',groundspeed:'510',wind_dir:'270',wind_spd:'30',oat:'-52',fuel_plan_onboard:'40000'});
 const tp=SimBrief.parse(t),fix=tp.fixes[1];assert.equal(tp.telemetryAvailable,true);assert.equal(tp.fuelUnits,'kg');assert.equal(fix.hdg,92);assert.equal(fix.mach,.83);assert.equal(fix.oat,-52);
 const at=SimBrief.telemetryAt(tp,fix.elapsed/tp.durationSec*.9);assert.equal(at.hdg,92);assert.equal(at.gs,510);assert.equal(at.windSpd,30);assert(at.fuel<50000&&at.fuel>40000,'fuel interpolates between takeoff and first fix');
 assert.equal(SimBrief.telemetryAt(tp,1).fuel,8000);
 const saved=SimBrief.validate(JSON.parse(JSON.stringify(tp)));assert.equal(saved.telemetryAvailable,true);assert.equal(saved.fixes[1].hdg,92);
 const bad=JSON.parse(JSON.stringify(tp));bad.fixes[1].oat=999;assert.equal(SimBrief.validate(bad).fixes[1].oat,null);}
console.log('Passed: SimBrief takeoff/taxi fallbacks, XML-style numeric and JSON-v2 times, timed route/date-line interpolation, altitude gaps, missing routes, invalid data and saved-plan validation, navlog telemetry, taxi times.');
