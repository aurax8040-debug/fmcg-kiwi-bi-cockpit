import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);require('../demo-data/kiwi-promo-data.js');require('../demo-data/kiwi-bi-monthly.js');
const {create,dayShift}=require('../promo-model.js');const data=globalThis.KIWI_PROMO_DATA,tools=create(data);
const q={activity_id:'ACT-202610',store_id:'STORE002'};
test('imports all140 stores and preserves shared BI names and SKU identities',()=>{
 assert.equal(data.activities.length,12);assert.equal(data.participations.length,840);assert.equal(new Set(data.participations.map(p=>p.store_id)).size,140);
 assert.equal(data.meta.source_daily_rows,766500);assert.equal(data.pos.length,50400);
 for(const s of data.stores)assert.equal(globalThis.KIWI_BI_DATA.stores.find(x=>x.store_id===s.store_id).store_name,s.store_name);
 for(const s of data.skus)assert.equal(globalThis.KIWI_BI_DATA.skus.find(x=>x.sku_id===s.sku_id).te_factor,s.te_factor);
});
test('same store/activity is used by all3 tools with auditable source IDs, no model call',()=>{
 const r=tools.queryStoreActivity(q);assert.equal(r.data_status,'COMPLETE');assert.equal(r.ai.status,'NOT_RUN');assert.equal(r.rag.status,'NOT_CONNECTED');
 assert.deepEqual(r.trace.map(t=>t.tool),['queryTPM','queryPOS','querySFA']);
 for(const t of [r.pos,r.tpm,r.sfa]){assert.equal(t.store_id,q.store_id);assert.equal(t.activity_id,q.activity_id);}
 assert.equal(r.pos.records.length,30);assert.equal(r.sfa.visits.length,1);assert.equal(r.sfa.sku_checks.length,3);
 const raw=data.pos.filter(p=>p[1]===q.store_id&&p[0]>=r.activity.start_date&&p[0]<=r.activity.end_date);
 assert.equal(Math.round(r.pos.totals.sales_amount_cny*100),raw.reduce((n,p)=>n+Math.round(p[4]*100),0));
 assert.equal(r.metrics.attainment_rate,r.pos.totals.sales_amount_cny/r.tpm.plan.sales_target_cny);
 assert.ok(r.tpm.record_ids.length>=5);assert.ok(r.pos.records.every(p=>p.record_id.includes(q.store_id)));
});
test('same-store previous weekday baseline is separate from activity target and causal lift',()=>{
 const r=tools.queryStoreActivity(q);assert.equal(r.pos.baseline.dates[0],dayShift(r.activity.start_date,-7));
 assert.ok(r.pos.baseline.records.every(x=>x.store_id===q.store_id));
 assert.ok(r.boundaries.some(s=>s.includes('因果')));assert.equal(r.pos.baseline.status,'COMPLETE');
});
test('missing activity visit is PARTIAL and never borrows another month or store',()=>{
 const p=data.participations.find(p=>!data.visits.some(v=>v.activity_id===p.activity_id&&v.store_id===p.store_id));assert.ok(p);
 const r=tools.queryStoreActivity(p);assert.equal(r.data_status,'PARTIAL');assert.equal(r.sfa.visits.length,0);assert.equal(r.sfa.executions.length,0);assert.equal(r.sfa.sku_checks.length,0);assert.ok(r.sfa.gaps.length>0);
});
test('incomplete visits are not accepted as complete execution evidence',()=>{
 const v=data.visits.find(v=>v.activity_id&&v.visit_status==='未完成');assert.ok(v);const r=tools.queryStoreActivity(v);
 assert.equal(r.sfa.status,'PARTIAL');assert.equal(r.sfa.executions.length,0);assert.equal(r.sfa.visits[0].leave_time,null);
});
test('missing POS does not become zero sales or a computed achievement rate',()=>{
 const original=tools.queryPOS(q),id=original.records[0];const d={...data,pos:data.pos.filter(r=>!(r[0]===id.sales_date&&r[1]===id.store_id&&r[2]===id.sku_id))};
 const r=create(d).queryStoreActivity(q);assert.equal(r.pos.status,'PARTIAL');assert.equal(r.pos.available_records,29);assert.equal(r.pos.totals.sales_amount_cny,null);assert.equal(r.metrics.attainment_rate,null);assert.ok(r.pos.available_totals.sales_amount_cny>0);
});
test('observed zero sales is valid data rather than a missing record',()=>{
 const base=tools.queryStoreActivity(q);const d={...data,pos:data.pos.map(r=>r[1]===q.store_id&&r[0]>=base.activity.start_date&&r[0]<=base.activity.end_date?[r[0],r[1],r[2],0,0,0,0,r[7]]:r)};
 const r=create(d).queryStoreActivity(q);assert.equal(r.pos.status,'COMPLETE');assert.equal(r.pos.totals.sales_amount_cny,0);assert.equal(r.metrics.attainment_rate,0);
});
test('T+1 cutoff withholds late records rather than pretending the weekend is complete',()=>{
 const a=tools.queryStoreActivity(q).activity;const r=tools.queryStoreActivity({...q,as_of_date:a.end_date});
 assert.equal(r.pos.status,'PARTIAL');assert.equal(r.pos.available_records,15);assert.equal(r.pos.totals.sales_amount_cny,null);assert.equal(r.metrics.attainment_rate,null);
});
test('store alias resolves exactly, conflicts and nonparticipating stores are rejected',()=>{
 assert.equal(tools.resolveStore({source_system:'POS',source_store_code:'POS_0002'}).store_id,'STORE002');
 assert.throws(()=>tools.resolveStore({store_id:'STORE003',source_system:'POS',source_store_code:'POS_0002'}),{code:'STORE_MAPPING_CONFLICT'});
 assert.throws(()=>tools.queryStoreActivity({...q,store_id:'STORE001'}),{code:'NOT_PARTICIPANT'});
 assert.throws(()=>tools.queryStoreActivity({...q,store_id:'NO-STORE'}),{code:'UNKNOWN_STORE'});
});
test('duplicate POS natural keys are blocked',()=>{assert.throws(()=>create({...data,pos:[...data.pos,data.pos[0]]}),{code:'DUPLICATE_POS'});});
test('fee actual gaps and missing photos remain explicit without fabricated content',()=>{
 const fee=data.fees.find(f=>f.actual_cny===null);const r=tools.queryStoreActivity(fee);
 assert.equal(r.tpm.status,'PARTIAL');assert.ok(r.tpm.missing_actual_fee_count>0);assert.equal(r.sfa.photo_count,0);assert.ok(r.sfa.limitations.some(s=>s.includes('图片')));
});
test('all840 store/activity combinations query without key conflicts',()=>{
 const seen=new Set();for(const p of data.participations){const key=p.activity_id+'|'+p.store_id;assert.ok(!seen.has(key));seen.add(key);
  const r=tools.queryStoreActivity(p);assert.equal(r.pos.status,'COMPLETE');assert.equal(r.pos.available_records,30);assert.ok(r.metrics.attainment_rate!==null);}
});
