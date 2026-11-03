/* Deterministic Mock data tools. No AI/LLM calls and no generated business facts. */
(function(root){
 const dayShift=(day,n)=>{const d=new Date(day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
 const daysBetween=(a,b)=>{const out=[];for(let d=a;d<=b;d=dayShift(d,1))out.push(d);return out;};
 const cents=v=>Math.round(v*100),sum=(rows,key)=>rows.reduce((s,r)=>s+cents(r[key]),0)/100;
 function fail(code,message){const e=new Error(message);e.code=code;throw e;}
 function create(data){
  const stores=new Map(data.stores.map(s=>[s.store_id,s])),skus=new Map(data.skus.map(s=>[s.sku_id,s]));
  const acts=new Map(data.activities.map(a=>[a.activity_id,a]));
  const members=new Map(data.participations.map(p=>[p.activity_id+'|'+p.store_id,p]));
  const pos=new Map(),seen=new Set();
  for(const r of data.pos){const key=r[0]+'|'+r[1]+'|'+r[2];if(seen.has(key))fail('DUPLICATE_POS','日销售记录主键重复');seen.add(key);
   if(!stores.has(r[1])||!skus.has(r[2]))fail('UNKNOWN_FOREIGN_KEY','POS门店或SKU不存在');
   if(!r.slice(3,7).every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0))fail('INVALID_POS','销售数值无效');
   if(Math.abs(r[6]-r[3]*skus.get(r[2]).te_factor)>.0001)fail('INVALID_TE','TE与商品换算不一致');
   const id=r[1]+'|'+r[0];if(!pos.has(id))pos.set(id,[]);pos.get(id).push(r);
  }
  function resolveStore(q){
   let id=q.store_id;
   if(q.source_system&&q.source_store_code){const matches=data.mappings.filter(m=>m.source_system===q.source_system&&m.source_store_code===q.source_store_code);
    if(matches.length!==1)fail('STORE_MAPPING_FAILED','原系统门店编码未唯一匹配');
    if(id&&id!==matches[0].store_id)fail('STORE_MAPPING_CONFLICT','统一门店ID与原系统编码冲突');id=matches[0].store_id;}
   if(!stores.has(id))fail('UNKNOWN_STORE','未找到门店，不使用其他门店记录替代');return stores.get(id);
  }
  function scope(q){const store=resolveStore(q),activity=acts.get(q.activity_id);if(!activity)fail('UNKNOWN_ACTIVITY','活动不存在');
   const plan=members.get(activity.activity_id+'|'+store.store_id);if(!plan)fail('NOT_PARTICIPANT','该门店未参加所选活动');
   return {store,activity,plan,as_of:q.as_of_date||dayShift(activity.end_date,1)};}
  function readPOS(s,dates){
   const expected=dates.length*data.skus.length,raw=dates.flatMap(d=>pos.get(s.store.store_id+'|'+d)||[]),available=raw.filter(r=>r[7]<=s.as_of);
   const totals={sales_amount_cny:available.reduce((n,r)=>n+cents(r[4]),0)/100,cost_amount_cny:available.reduce((n,r)=>n+cents(r[5]),0)/100,quantity:available.reduce((n,r)=>n+r[3],0),sales_te:available.reduce((n,r)=>n+r[6],0)};
   totals.gross_profit_cny=Math.round((totals.sales_amount_cny-totals.cost_amount_cny)*100)/100;
   const complete=available.length===expected;
   return {status:complete?'COMPLETE':'PARTIAL',dates,expected_records:expected,available_records:available.length,missing_or_not_yet_available:expected-available.length,
    totals:complete?totals:{sales_amount_cny:null,cost_amount_cny:null,quantity:null,sales_te:null,gross_profit_cny:null},available_totals:totals,
    records:available.map(r=>({record_id:'POS:'+r[0]+':'+r[1]+':'+r[2],sales_date:r[0],store_id:r[1],sku_id:r[2],sku_name:skus.get(r[2]).sku_name,quantity:r[3],sales_amount_cny:r[4],cost_amount_cny:r[5],sales_te:r[6],available_date:r[7]}))};
  }
  function queryPOS(q){const s=scope(q),dates=daysBetween(s.activity.start_date,s.activity.end_date),current=readPOS(s,dates),baseline=readPOS(s,dates.map(d=>dayShift(d,-7)));
   return {...current,store_id:s.store.store_id,activity_id:s.activity.activity_id,as_of_date:s.as_of,baseline:{...baseline,label:'前7天同星期（上一个周末）'},change_pct:current.status==='COMPLETE'&&baseline.status==='COMPLETE'&&baseline.totals.sales_amount_cny>0?(current.totals.sales_amount_cny/baseline.totals.sales_amount_cny-1)*100:null};}
  function queryTPM(q){const s=scope(q),fees=data.fees.filter(f=>f.activity_id===q.activity_id&&f.store_id===s.store.store_id),known=fees.filter(f=>typeof f.actual_cny==='number'&&Number.isFinite(f.actual_cny));
   return {status:fees.length&&known.length===fees.length?'COMPLETE':'PARTIAL',store_id:s.store.store_id,activity_id:q.activity_id,activity:s.activity,plan:s.plan,fees,budget_cny:sum(fees,'budget_cny'),known_actual_cny:sum(known,'actual_cny'),missing_actual_fee_count:fees.length-known.length,missing_fee_records:!fees.length,
    record_ids:[s.activity.activity_id,s.plan.participation_id,...fees.map(f=>f.fee_id)]};}
  function querySFA(q){const s=scope(q),visits=data.visits.filter(v=>v.store_id===s.store.store_id&&v.activity_id===q.activity_id&&v.visit_date>=s.activity.start_date&&v.visit_date<=s.activity.end_date),ids=new Set(visits.map(v=>v.visit_id));
   const executions=data.executions.filter(e=>ids.has(e.visit_id)&&e.store_id===s.store.store_id&&e.activity_id===q.activity_id);
   const checks=data.sku_checks.filter(c=>ids.has(c.visit_id)&&c.store_id===s.store.store_id);
   const gaps=[];if(!visits.length)gaps.push('活动周期内无匹配拜访记录');if(visits.some(v=>v.visit_status!=='已完成'))gaps.push('存在未完成拜访');if(!executions.length)gaps.push('缺少活动执行记录');if(!checks.length)gaps.push('缺少SKU抽查记录');
   return {status:gaps.length?'PARTIAL':'COMPLETE',store_id:s.store.store_id,activity_id:q.activity_id,visits,executions,sku_checks:checks,gaps,
    photo_count:executions.filter(e=>e.photo_path).length,limitations:['到岗仅代表巡店时点，不代表活动全程','每次抽查3个SKU，不代表全部15个SKU','未提供照片，不进行图片识别或真实性判断'],record_ids:[...visits.map(v=>v.visit_id),...executions.map(e=>e.execution_id),...checks.map(c=>c.check_id)]};}
  function queryStoreActivity(q){const s=scope(q),trace=[];const invoke=(name,fn)=>{const t=Date.now(),r=fn(q);trace.push({tool:name,status:r.status,duration_ms:Date.now()-t,store_id:s.store.store_id,activity_id:q.activity_id});return r;};
   const tpm=invoke('queryTPM',queryTPM),sales=invoke('queryPOS',queryPOS),sfa=invoke('querySFA',querySFA);
   const complete=sales.status==='COMPLETE'&&tpm.status==='COMPLETE'&&sfa.status==='COMPLETE';
   const attainment=sales.status==='COMPLETE'&&tpm.plan.sales_target_cny>0?sales.totals.sales_amount_cny/tpm.plan.sales_target_cny:null;
   return {data_type:'DEMO_MOCK',data_status:complete?'COMPLETE':'PARTIAL',store:s.store,activity:s.activity,scope:{store_id:s.store.store_id,activity_id:q.activity_id,date_from:s.activity.start_date,date_to:s.activity.end_date,as_of_date:s.as_of},
    tpm,pos:sales,sfa,metrics:{attainment_rate:attainment,target_gap_cny:attainment===null?null:Math.round((tpm.plan.sales_target_cny-sales.totals.sales_amount_cny)*100)/100},trace,
    rag:{status:'NOT_CONNECTED',citations:[]},ai:{status:'NOT_RUN',model:null},
    boundaries:['这是模拟业务数据的确定性查询，未调用大模型','月度预算和本次活动目标分开计算','上周对比不是促销增量或因果结论','缺失记录不填0，不据此认定人员缺勤或经营原因']};}
  function participants(aid){return data.participations.filter(p=>p.activity_id===aid).map(p=>({...p,store:stores.get(p.store_id)}));}
  function storeActivities(sid){return data.participations.filter(p=>p.store_id===sid).map(p=>acts.get(p.activity_id)).sort((a,b)=>b.start_date.localeCompare(a.start_date));}
  return {queryStoreActivity,queryPOS,queryTPM,querySFA,resolveStore,participants,storeActivities,activities:[...acts.values()].sort((a,b)=>b.start_date.localeCompare(a.start_date)),data};
 }
 root.KiwiPromo={create,dayShift};if(typeof module!=='undefined'&&module.exports)module.exports=root.KiwiPromo;
})(globalThis);
