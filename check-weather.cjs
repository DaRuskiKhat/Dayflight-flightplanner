const assert=require('node:assert/strict'),W=require('./dist/weather.js');
// Categories (FAA thresholds)
assert.equal(W.category(10000,Infinity),'vfr');assert.equal(W.category(10000,3000),'mvfr');assert.equal(W.category(6000,5000),'mvfr');assert.equal(W.category(10000,900),'ifr');assert.equal(W.category(3000,5000),'ifr');assert.equal(W.category(10000,400),'lifr');assert.equal(W.category(800,5000),'lifr');
// METAR decoding: knots/MPS, statute and metric visibility, vertical visibility, negative temps, inHg
let m=W.decodeMetar('KJFK 051051Z 28012G22KT 1 1/2SM BR OVC006 12/11 A2992');assert.deepEqual(m.wind,{dir:280,speed:12,gust:22});assert.ok(Math.abs(m.vis-2414)<1);assert.equal(m.visUnit,'SM');assert.equal(m.ceiling,600);assert.equal(m.category,'ifr');assert.deepEqual(m.qnh,{value:29.92,unit:'inHg'});
m=W.decodeMetar('EGLL 051050Z VRB02KT 0300 FG VV001 08/08 Q1021');assert.equal(m.wind.dir,null);assert.equal(m.vis,300);assert.equal(m.ceiling,100);assert.equal(m.category,'lifr');
m=W.decodeMetar('ZGGG 051030Z 33003MPS CAVOK 26/23 Q1015 NOSIG');assert.equal(m.wind.speed,6);assert.equal(m.cavok,true);assert.equal(m.category,'vfr');
m=W.decodeMetar('LFPG 051030Z 22010KT 9999 SCT012 BKN040 M02/M05 Q1030 TEMPO BKN008');assert.equal(m.temp,-2);assert.equal(m.dew,-5);assert.equal(m.ceiling,4000,'trend groups ignored');assert.equal(m.category,'vfr');
// TAF: FM replacement, TEMPO spells, validity, month rollover
const issued=Date.parse('2026-11-05T08:00:00Z');
const taf=W.decodeTaf('VHHH 050800Z 0509/0615 10010KT 9999 FEW015 SCT025\nFM051800 02012KT 6000 BKN012\nTEMPO 0518/0524 3000 SHRA BKN008\nBECMG 0602/0604 9999 SCT030',issued);
assert.equal(taf.validFrom,Date.parse('2026-11-05T09:00:00Z'));assert.equal(taf.validTo,Date.parse('2026-11-06T15:00:00Z'));
let at=W.tafAt(taf,Date.parse('2026-11-05T12:00:00Z'));assert.equal(at.prevailing.wind.dir,100);assert.equal(at.prevailing.category,'vfr');assert.equal(at.spells.length,0);
at=W.tafAt(taf,Date.parse('2026-11-05T20:00:00Z'));assert.equal(at.prevailing.wind.dir,20);assert.equal(at.prevailing.category,'mvfr');assert.equal(at.spells.length,1);assert.equal(at.spells[0].category,'ifr');
at=W.tafAt(taf,Date.parse('2026-11-06T05:00:00Z'));assert.equal(at.prevailing.vis,10000,'BECMG applied after its period');assert.equal(at.prevailing.category,'vfr');
assert.equal(W.tafAt(taf,Date.parse('2026-11-07T00:00:00Z')).inPeriod,false);
const roll=W.decodeTaf('YSSY 302300Z 3100/0106 18010KT 9999 FEW030',Date.parse('2026-10-30T23:00:00Z'));assert.equal(roll.validTo,Date.parse('2026-11-01T06:00:00Z'),'month rollover');
console.log('Passed: METAR/TAF decoding, flight categories, TAF timing and month rollover.');
