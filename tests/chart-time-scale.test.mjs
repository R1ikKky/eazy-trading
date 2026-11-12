import test from 'node:test';
import assert from 'node:assert/strict';
import { chartTimeScale, chartDate, defaults } from '../frontend/src/replay/settings-model.ts';
test('both chart axes use times for intraday ticks and budget space for full date labels',()=>{
 const p={...defaults,timezone:'America/New_York',dateFormat:'month-day',weekday:true,hoursFormat:'24'};
 const time=Date.UTC(2026,8,30,14,30)/1000;
 const axis=chartTimeScale(p);
 assert.equal(axis.tickMarkFormatter(time,3),'10:30');
 assert.equal(axis.tickMarkFormatter(time,2),chartDate(time,p,true));
 assert.ok(axis.tickMarkMaxCharacterLength>=chartDate(time,p,true).length);
 const twelve=chartTimeScale({...p,hoursFormat:'12'});
 assert.match(twelve.tickMarkFormatter(time,3),/10:30.*AM/);
});
