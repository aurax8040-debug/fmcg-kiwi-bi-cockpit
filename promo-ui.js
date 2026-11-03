/* Stage 1: real execution of deterministic queries over Mock records. No LLM. */
const promoTools=KiwiPromo.create(globalThis.KIWI_PROMO_DATA);
let promoActivity=promoTools.activities[0].activity_id;
let promoStore=promoTools.participants(promoActivity)[0].store_id;
let lastPromoResult=null;
const pMoney=v=>v===null||v===undefined?'未取得完整数据':'¥'+v.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
const pNumber=v=>v===null||v===undefined?'—':v.toLocaleString('zh-CN',{maximumFractionDigits:2});
const pStatus=s=>s==='COMPLETE'?'完整':s==='PARTIAL'?'部分缺失':'未接入';
function promoMonth(a){return a.start_date.slice(0,7);}
function openPromoReview(aid,sid){
 promoActivity=aid||promoActivity;const list=promoTools.participants(promoActivity);
 promoStore=list.some(p=>p.store_id===(sid||promoStore))?(sid||promoStore):list[0].store_id;
 const store=kiwiModel.stores.get(promoStore),activity=promoTools.activities.find(a=>a.activity_id===promoActivity);
 $('fRange').value=promoMonth(activity);$('fRegion').value=Object.keys(biRegions).find(k=>biRegions[k]===store.war_zone)||'all';$('fKa').value=store.ka_name;
 for(const id of ['fMarket','fGrade','fCategory','fSku','fStore'])$(id).value='all';refreshBIFacets();$('fStore').value=promoStore;
 navigate('promo');
}
function selectPromoActivity(aid){openPromoReview(aid,promoStore);}
function selectPromoStore(sid){openPromoReview(promoActivity,sid);}
function promoExamples(){
 const items=[];
 for(const a of promoTools.activities){for(const p of promoTools.participants(a.activity_id)){
  if(items.length===3)return items;
  const s=promoTools.querySFA({store_id:p.store_id,activity_id:a.activity_id});
  if(!items.some(v=>v.kind==='missing')&&s.status==='PARTIAL')items.push({kind:'missing',label:'缺失证据案例',aid:a.activity_id,sid:p.store_id});
  if(!items.some(v=>v.kind==='issue')&&s.status==='COMPLETE'&&s.executions.some(e=>e.observed_issue))items.push({kind:'issue',label:'现场异常案例',aid:a.activity_id,sid:p.store_id});
  if(!items.some(v=>v.kind==='complete')&&s.status==='COMPLETE'&&s.executions.every(e=>!e.observed_issue))items.push({kind:'complete',label:'记录完整案例',aid:a.activity_id,sid:p.store_id});
 }}return items;
}
const promoCaseButtons=promoExamples();
function renderPromoReview(){
 const container=$('page-promo');if(!container)return;
 let r;try{r=promoTools.queryStoreActivity({activity_id:promoActivity,store_id:promoStore});lastPromoResult=r;}catch(e){container.innerHTML=card('活动查询未完成',`<div class="hint">${esc(e.message)}</div>`);return;}
 const p=r.tpm.plan,tot=r.pos.totals,sfa=r.sfa;
 const feeValue=r.tpm.fees.some(f=>f.actual_cny!==null)?r.tpm.known_actual_cny:null;
 const metric=(name,value,foot)=>`<div class="promo-metric"><span>${name}</span><strong>${value}</strong><small>${foot}</small></div>`;
 const statusClass=r.data_status==='COMPLETE'?'promo-complete':'promo-partial';
 const activitySelect=promoTools.activities.map(a=>`<option value="${a.activity_id}" ${a.activity_id===promoActivity?'selected':''}>${esc(a.activity_name)} · ${a.start_date}～${a.end_date}</option>`).join('');
 const storeSelect=promoTools.participants(promoActivity).map(p=>`<option value="${p.store_id}" ${p.store_id===promoStore?'selected':''}>${esc(p.store.store_name)}</option>`).join('');
 const visitTable=table(['拜访记录','日期','状态','抵达 / 离开','时长'],sfa.visits.map(v=>[esc(v.visit_id),v.visit_date,esc(v.visit_status),`${esc(v.arrival_time||'未记录')} / ${esc(v.leave_time||'未记录')}`,v.duration_minutes===null?'未记录':v.duration_minutes+'分钟']));
 const executionTable=table(['执行记录','位置','面积 / 计划','巡店时到岗 / 计划','赠品实际发放 / 计划','现场记录'],sfa.executions.map(e=>[esc(e.execution_id),esc(e.display_position),`${pNumber(e.display_area_sqm)} / ${pNumber(p.planned_display_area_sqm)}㎡`,`${esc(e.promoter_attendance)}：${pNumber(e.observed_promoters)} / ${pNumber(p.planned_people)}人`,`${pNumber(e.gift_distributed_qty)} / ${pNumber(p.planned_gift_qty)}`,esc(e.observed_issue||'未记录异常') ]));
 const skuTable=table(['商品检查记录','SKU名称','上架','现场价格','缺货观察'],sfa.sku_checks.map(c=>[esc(c.check_id),esc(c.sku_name),c.on_shelf?'已上架':'未上架',c.shelf_price_cny===null?'未记录':pMoney(c.shelf_price_cny),esc(c.stockout_observation)]));
 const dayTable=table(['日期','销售额','销量','TE','已到记录'],r.pos.dates.map(day=>{const rows=r.pos.records.filter(p=>p.sales_date===day);return [day,pMoney(rows.reduce((n,x)=>n+Math.round(x.sales_amount_cny*100),0)/100),pNumber(rows.reduce((n,x)=>n+x.quantity,0)),pNumber(rows.reduce((n,x)=>n+x.sales_te,0)),`${rows.length}/15`];}));
 const fees=table(['费用记录','类型','预算','已记录实际金额','核销状态'],r.tpm.fees.map(f=>[esc(f.fee_id),esc(f.fee_type),pMoney(f.budget_cny),f.actual_cny===null?'未提供':pMoney(f.actual_cny),esc(f.claim_status)]));
 const evidenceIds=[...r.tpm.record_ids,...sfa.record_ids,...r.pos.records.map(x=>x.record_id)];
 container.innerHTML=`<div class="card promo-hero"><div class="promo-title"><div><h3>临促活动复盘 <span class="tag">DEMO_MOCK · 事实与证据</span></h3><div class="hint">选择同一家门店与同一场活动，查询计划、销售和现场记录。当前没有大模型归因。</div></div><span class="promo-status ${statusClass}">${r.data_status} · ${pStatus(r.data_status)}</span></div><div class="promo-toolbar"><label>活动<select class="pill" id="promoActivitySelect" aria-label="复盘活动" onchange="selectPromoActivity(this.value)">${activitySelect}</select></label><label>门店<select class="pill" id="promoStoreSelect" aria-label="复盘门店" onchange="selectPromoStore(this.value)">${storeSelect}</select></label><button class="action sec" onclick="exportPromoEvidence()">导出证据 JSON</button></div><div class="promo-examples">${promoCaseButtons.map(x=>`<button class="action sec" onclick="openPromoReview('${x.aid}','${x.sid}')">${x.label}</button>`).join('')}</div><div class="promo-scope"><b>${esc(r.store.store_name)}</b> · ${esc(r.store.ka_name)} · ${esc(r.store.war_zone)} · ${esc(r.store.store_grade)}级<br>活动 ${r.activity.start_date} 至 ${r.activity.end_date} · POS T+1 截至 ${r.scope.as_of_date} · 复盘覆盖活动全部15个SKU，未套用月度预算。</div></div>
 <div class="promo-metrics">${metric('活动销售额',pMoney(tot.sales_amount_cny),`${r.pos.available_records}/${r.pos.expected_records}条日销售记录`)}${metric('活动销售目标',pMoney(p.sales_target_cny),'TPM模拟计划')}${metric('活动达成率',r.metrics.attainment_rate===null?'不可计算':(r.metrics.attainment_rate*100).toFixed(1)+'%','活动销售 ÷ 同活动目标')}${metric('销售TE',pNumber(tot.sales_te),'包装销量 × 粒数 ÷ 规格')}${metric('已记录活动费用',pMoney(feeValue),r.tpm.missing_actual_fee_count?`${r.tpm.missing_actual_fee_count}条实际金额缺失，非完整费用`:'不据此声称完整ROI')}</div>
 <div class="promo-grid"><div class="card"><h3>① TPM · 活动计划 <span class="tag">${pStatus(r.tpm.status)}</span></h3><div class="body">计划临促 ${p.planned_days}天，${p.planned_people}人；计划赠品 ${p.planned_gift_qty}份；计划陈列 ${p.planned_display_area_sqm}㎡。<br>费用预算 ${pMoney(r.tpm.budget_cny)}，已记录实际 ${pMoney(feeValue)}。</div>${fees}</div><div class="card"><h3>② POS · 活动销售 <span class="tag">${pStatus(r.pos.status)}</span></h3>${dayTable}<div class="body">商品毛利 ${pMoney(tot.gross_profit_cny)}，未扣活动费、物流和税费。<br>上一个周末销售 ${pMoney(r.pos.baseline.totals.sales_amount_cny)}；变化 ${r.pos.change_pct===null?'不可计算':(r.pos.change_pct>=0?'+':'')+r.pos.change_pct.toFixed(1)+'%'}。</div><div class="hint">这是前7天同星期的观察对照，不代表促销贡献或因果增量。</div></div></div>
 <div class="card"><h3>③ SFA · 现场记录 <span class="tag">${pStatus(sfa.status)}</span></h3>${sfa.gaps.length?`<div class="promo-gap">${sfa.gaps.map(esc).join('；')}。保留缺失，不补0、不借用其他门店或其他月份记录。</div>`:''}${sfa.visits.length?visitTable:'<div class="empty">本店本活动无匹配拜访记录。</div>'}${sfa.executions.length?executionTable:'<div class="hint">没有可展示的执行记录。</div>'}<details class="promo-details"><summary>查看本次SKU抽查记录（${sfa.sku_checks.length}条）</summary>${skuTable}</details><div class="hint">${sfa.limitations.map(esc).join('；')}。照片：${sfa.photo_count?'已提供'+sfa.photo_count+'条':'未提供'}。</div></div>
 <div class="card"><h3>查询轨迹与判断边界</h3>${table(['实际执行的数据工具','结果','耗时','统一门店ID','活动ID'],r.trace.map(t=>[t.tool,pStatus(t.status),t.duration_ms+'ms',t.store_id,t.activity_id]))}<div class="body">RAG：未接入；大模型：未调用。以上为模拟数据的确定性查询，当前不输出销售原因或自动行动。</div><details class="promo-details"><summary>展开可追溯业务记录（${evidenceIds.length}条）</summary><div class="promo-record-ids">${evidenceIds.map(x=>`<code>${esc(x)}</code>`).join('')}</div></details><ul class="promo-boundaries">${r.boundaries.map(b=>`<li>${esc(b)}</li>`).join('')}</ul></div>`;
 $('pageTitle').textContent='临促活动复盘';$('pageSub').textContent='POS + TPM + SFA 联合查询 · 模拟数据 · AI/RAG待联调';
}
function exportPromoEvidence(){if(!lastPromoResult)return;const url=URL.createObjectURL(new Blob([JSON.stringify(lastPromoResult,null,2)],{type:'application/json;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`Evidence_${promoActivity}_${promoStore}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}
const promoPage=document.createElement('section');promoPage.id='page-promo';promoPage.className='page';$('page-dash').after(promoPage);
const promoNav=document.createElement('div');promoNav.className='nav-item';promoNav.dataset.page='promo';promoNav.tabIndex=0;promoNav.setAttribute('role','button');promoNav.innerHTML='<span class="icon">▣</span>临促活动复盘';
document.querySelector('.nav-item[data-page="dash"]').after(promoNav);
promoNav.addEventListener('click',()=>openPromoReview(promoActivity,$('fStore').value==='all'?promoStore:$('fStore').value));promoNav.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();promoNav.click();}});
renderWeekendPromoCard=function(){const el=$('weekendPromoCard');if(!el)return;const a=promoTools.activities.find(a=>$('fRange').value==='all'||promoMonth(a)===$('fRange').value);if(!a){el.innerHTML='<div class="hint">所选月份无模拟活动。</div>';return;}
 const ids=new Set(view.selectedStores.map(s=>s.store_id)),ps=promoTools.participants(a.activity_id).filter(p=>ids.has(p.store_id));
 const summary=ps.map(p=>promoTools.queryStoreActivity({activity_id:a.activity_id,store_id:p.store_id}));
 el.innerHTML=`<div class="body"><b>${esc(a.activity_name)}</b><br>${a.start_date} 至 ${a.end_date}<br>当前筛选参与 ${ps.length} 家 · 本活动总计70家；其中 ${summary.filter(r=>r.data_status==='PARTIAL').length} 家证据部分缺失。</div><button class="action" ${ps.length?'':'disabled'} onclick="openPromoReview('${a.activity_id}','${ps[0]?.store_id||''}')">查看活动复盘 →</button><div class="hint">已接入POS、TPM、SFA模拟记录；AI配置与本次调用状态请在活动复盘中查看。</div>`;
};
const beforePromoRender=render;
render=function(){beforePromoRender();if(page==='promo')renderPromoReview();
 for(const id of ['fRange','fRegion','fKa','fMarket','fGrade','fStore','fCategory','fSku','biReset'])$(id).disabled=page==='promo';
 document.querySelector('.bi-extra-filters').style.display=page==='promo'?'none':'';
 const button=$('btnAi');button.disabled=page==='promo';button.textContent=page==='promo'?'AI复盘待接入':'查看经营摘要';
 if(page==='store'&&$('fStore').value!=='all'){
  const sid=$('fStore').value,list=promoTools.storeActivities(sid).filter(a=>$('fRange').value==='all'||promoMonth(a)===$('fRange').value);
  $('page-store').insertAdjacentHTML('afterbegin',card('该门店参与的临促活动',list.length?list.map(a=>`<div class="body">${esc(a.activity_name)} · ${a.start_date}～${a.end_date} <button class="action sec" onclick="openPromoReview('${a.activity_id}','${sid}')">查看复盘 →</button></div>`).join(''):'<div class="hint">所选月份未参加活动，不使用其他活动替代。</div>'));
 }
 if(page==='dash'){
  renderWeekendPromoCard();
  const input=$('inlineChatInput');if(input){input.disabled=true;input.placeholder='请从活动复盘入口调用AI';}
  document.querySelectorAll('.chat-inline-quick button,.chat-inline .chat-input button').forEach(b=>b.disabled=true);
  const bot=$('inlineChatBody')?.querySelector('.msg.bot');if(bot)bot.textContent='POS、TPM、SFA模拟数据已关联。可从左侧“临促活动复盘”查询同店同活动证据，AI配置与本次调用状态请在活动复盘中查看。';
 }
};
render();
