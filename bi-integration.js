/* Attach the unified monthly model to the existing cockpit. No model calls. */
const kiwiModel=KiwiBI.create(globalThis.KIWI_BI_DATA);
const biRegions={east:'华东',south:'华南',north:'华北',central:'华中',west:'西部'};
let biTablePage=0;
function biFilters(){return {month:$('fRange').value,region:$('fRegion').value,ka:$('fKa').value,
  market:$('fMarket').value,grade:$('fGrade').value,store:$('fStore').value,category:$('fCategory').value,sku:$('fSku').value};}
function biOptions(id,rows,label){const el=$(id),old=el.value;el.innerHTML=`<option value="all">${label}</option>`+rows.map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join('');el.value=rows.some(r=>r[0]===old)?old:'all';}
function refreshBIFacets(){
  const f=biFilters();
  const regional=kiwiModel.selectStores({region:f.region});
  biOptions('fKa',[...new Set(regional.map(s=>s.ka_name))].map(n=>[n,n]),'全部 KA 系统');
  const regionKa=kiwiModel.selectStores({region:f.region,ka:$('fKa').value});
  biOptions('fMarket',[...new Set(regionKa.map(s=>s.market_department))].map(n=>[n,n]),'全部市场部');
  const storeScope=kiwiModel.selectStores({region:f.region,ka:$('fKa').value,market:$('fMarket').value,grade:f.grade});
  biOptions('fStore',storeScope.map(s=>[s.store_id,s.store_name]),'全部门店');
  const skuScope=KIWI_BI_DATA.skus.filter(s=>$('fCategory').value==='all'||s.category===$('fCategory').value);
  biOptions('fSku',skuScope.map(s=>[s.sku_id,s.sku_name]),'全部 SKU');
}
aggregate=function(){return kiwiModel.summarize(biFilters());};
refreshKa=function(){if($('fMarket'))refreshBIFacets();};
findings=function(){return {risk:view.ka.filter(c=>c.profit<0),display:[],inactive:view.stores-view.active};};
interpretation=function(){return `<div class="body">${esc(view.label)}，销售额 ${wan(view.sales)}，模拟商品毛利 ${wan(view.profit)}，销售 ${view.te.toFixed(2)} TE。<br>全部为合成数据，毛利未扣活动费用、物流和税费。月度数据不支持日/周趋势、同比或促销因果判断。</div>`;};
evidence=function(c){return `<div class="evidence">DEMO_MOCK · ${esc(c.name)} · 销售额 ${wan(c.sales)} · 商品毛利 ${wan(c.profit)}。月度经营摘要；活动级TPM/SFA证据请查看“临促活动复盘”，知识检索待接入。</div>`;};
cockpitRegionRows=function(){return view.regionRows.map(r=>({...r,name:r.key,covered:true}));};
cockpitMap=function(){
  const locations={'华东':[121.47,31.23],'华南':[113.26,23.13],'华北':[116.4,39.9],'华中':[114.31,30.59],'西部':[104.07,30.67]};
  draw('chartCockpitMap',{animation:false,tooltip:{formatter:p=>p.data?`${esc(p.name)}<br>模拟销售 ${wan(p.data.value[2])}`:''},
    geo:{map:'cockpit-china',roam:false,zoom:1.18,center:[104.5,36.2],itemStyle:{areaColor:'#eef2f9',borderColor:'#d5deec'},emphasis:{label:{show:false}},regions:[{name:'南海诸岛',itemStyle:{opacity:0},label:{show:false}}]},
    series:[{type:'scatter',coordinateSystem:'geo',data:view.regionRows.map(r=>({name:r.key,value:[...locations[r.key],r.sales],label:{position:({'华东':'right','华南':'bottom','华北':'top','华中':'top','西部':'left'})[r.key],distance:9}})),symbolSize:18,itemStyle:{color:'#2f6bff'},label:{show:true,position:'bottom',formatter:p=>p.name+'\n'+(p.value[2]/10000).toFixed(1)+'万',fontSize:10}}]});
  const chart=echarts.getInstanceByDom($('chartCockpitMap'));chart?.on('click',p=>{const r=Object.keys(biRegions).find(k=>biRegions[k]===p.name);if(r){$('fRegion').value=$('fRegion').value===r?'all':r;$('fStore').value='all';refreshBIFacets();render();}});
};
renderGroupedTrend=function(){
  if(page!=='dash'||!$('chartTrend'))return;
  const el=$('chartTrend'),parent=el.parentElement,bins=view.trend;
  parent.querySelector('h3').innerHTML='销售趋势 <span class="tag">月度模拟数据</span>';
  parent.querySelector('.hint').textContent=`当前筛选共 ${bins.length} 个月；仅展示月度销售和 TE，无去年同期数据。`;
  parent.querySelector('.trend-switch')?.remove();
  (echarts.getInstanceByDom(el)||echarts.init(el)).setOption({animation:false,tooltip:{trigger:'axis'},legend:{data:['销售额','销售TE'],top:0},grid:{left:58,right:60,top:45,bottom:34,containLabel:true},xAxis:{type:'category',data:bins.map(b=>b.key),axisLabel:{fontSize:10}},yAxis:[{type:'value',name:'万元'},{type:'value',name:'TE'}],series:[{name:'销售额',type:'bar',data:bins.map(b=>b.sales/10000),itemStyle:{color:'#2f6bff'},barMaxWidth:28},{name:'销售TE',type:'line',yAxisIndex:1,data:bins.map(b=>+b.te.toFixed(2)),itemStyle:{color:'#36cfc9'}}]},true);
};
setTrendGrain=function(){doAction('本版数据粒度为月；日、周分析使用完整日明细版。');};
function selectBIStore(id){$('fStore').value=id;biTablePage=0;navigate('store');}
function selectBICategory(name){$('fCategory').value=name;$('fSku').value='all';refreshBIFacets();biTablePage=0;navigate('store');}
function selectBISku(id){$('fCategory').value=kiwiModel.skus.get(id).category;refreshBIFacets();$('fSku').value=id;biTablePage=0;navigate('store');}
screenshotPriorityCard=function(){const low=view.storeRows.filter(s=>s.attainment!==null&&s.attainment<1).sort((a,b)=>a.attainment-b.attainment).slice(0,3);
  return `<div class="card priority-card"><h3>重点门店 <span class="tag">预算差距 · 规则筛选</span></h3><div class="hint">按当前周期达成率排序。销售差距不能直接解释为执行问题。</div>${view.productFiltered?'<div class="body">商品筛选已生效。预算仅有门店月度粒度，暂不计算品类/SKU达成率。</div>':low.map(s=>`<article class="priority-customer"><b>${esc(s.store_name)}</b><div class="body">销售 ${wan(s.sales)} · 模拟预算 ${wan(s.target)}<br>达成率 ${(s.attainment*100).toFixed(1)}% · 差额 ${wan(s.target-s.sales)}</div><button class="action sec" onclick="selectBIStore('${s.store_id}')">查看门店 →</button></article>`).join('')||'<div class="body">当前范围没有低于模拟预算的门店。</div>'}<div class="map-note">POS / TPM / SFA 模拟记录已按门店关联，可进入临促活动复盘核对；Dify待接入，不生成执行归因。</div></div>`;
};
injectKaStoreCard=function(){const el=$('kaStoreSlot');if(!el)return;el.innerHTML='<h3>门店等级分布</h3>'+table(['等级','门店数'],['A','B','C'].map(g=>[g,view.selectedStores.filter(s=>s.store_grade===g).length]));};
loadWeekendPromoReview=async function(){weekendPromoReview=null;weekendPromoLoading=false;renderWeekendPromoCard();};
renderWeekendPromoCard=function(){if($('weekendPromoCard'))$('weekendPromoCard').innerHTML='<div class="hint">PARTIAL：已接入统一POS门店。TPM活动、SFA执行与Dify知识检索尚未完成关联。月度数据不能计算周末临促结果。</div>';};
renderEvaluationMetrics=function(){if($('aiEvaluationCard'))$('aiEvaluationCard').innerHTML='<h3>AI 联调状态 <span class="tag">PARTIAL</span></h3><div class="hint">本轮验收为BI数据与交互。未运行付费模型、四Agent或效果评测，不报告采纳率和准确率。</div>';};
loadEvaluationMetrics=async function(){renderEvaluationMetrics();};
dashboardAiContext=function(){const f=biFilters(),s=f.store!=='all'?kiwiModel.stores.get(f.store):null;return {
  scope:{range:f.month==='all'?'2025-11 至 2026-10':f.month,region:biRegions[f.region]||'全部战区',ka:f.ka==='all'?'全部KA':f.ka,market:f.market,grade:f.grade,category:f.category,sku_id:f.sku},
  metrics:{sales:view.sales,profit:view.profit,volume:view.volume,sales_te:view.te,active_stores:view.active,total_stores:view.stores},
  customers:view.ka.map(c=>({name:c.name,sales:c.sales,profit:c.profit})),sources:[{name:KIWI_BI_DATA.meta.source_filename,truth_label:'DEMO_MOCK 月度汇总'}],
  gaps:['无日/周销售数据','无去年同期数据','TPM/SFA尚未建立有效业务记录映射','本轮未验证Dify连接，不能声称四Agent联合分析已完成'],
  ...(s?{selected_store:{store_id:s.store_id,store_name:s.store_name}}:{})};};
function biDownload(){
  const rows=[['数据性质','月份','KA','战区','市场部','门店','品类','SKU名称','粒数','规格','销量','销售额_元','成本_元','毛利_元','销售TE'],...view.rows.map(r=>['DEMO_MOCK',r.month,r.store.ka_name,r.store.war_zone,r.store.market_department,r.store.store_name,r.sku.category,r.sku.sku_name,r.sku.piece_count,r.sku.size_spec,r.quantity,r.sales_cents/100,r.cost_cents/100,(r.sales_cents-r.cost_cents)/100,r.te])];
  const quote=v=>'"'+String(typeof v==='string'&&/^[=+@-]/.test(v)?"'"+v:v).replace(/"/g,'""')+'"';
  const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(r=>r.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='Kiwi_BI_DEMO_'+$('fRange').value+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function biPaginate(headers,rows){const max=Math.max(0,Math.ceil(rows.length/50)-1);biTablePage=Math.min(biTablePage,max);return table(headers,rows.slice(biTablePage*50,biTablePage*50+50))+`<div class="body">共 ${rows.length} 条 · 第 ${biTablePage+1}/${max+1} 页 <button class="action sec" ${biTablePage===0?'disabled':''} onclick="biTablePage--;render()">上一页</button> <button class="action sec" ${biTablePage===max?'disabled':''} onclick="biTablePage++;render()">下一页</button></div>`;}
function renderBIReports(){
  const titles={'ka':'KA 客户经营','store':'门店经营与商品下钻','pos':'POS 月度数据','bi-detail':'销售明细','bi-month':'月度销售汇总','bi-customer':'客户销售汇总','bi-region':'战区销售汇总','bi-cate':'品类销售分析','budget':'Sell-Out 预算跟进'};
  if(!titles[page])return;
  let headers,rows;
  const skuTable=()=>table(['SKU名称','品类','粒数','规格','销售额','TE'],view.skuRows.map(s=>[`<button class="section-link" onclick="selectBISku('${s.sku_id}')">${esc(s.sku_name)}</button>`,esc(s.category),s.piece_count,s.size_spec+'#',wan(s.sales),s.te.toFixed(2)]));
  if(['store','budget'].includes(page)){
    headers=['门店名称','KA','战区','等级','销售额','商品毛利','销售TE','门店预算','达成率'];rows=view.storeRows.map(s=>[`<button class="section-link" onclick="selectBIStore('${s.store_id}')">${esc(s.store_name)}</button>`,esc(s.ka_name),s.war_zone,s.store_grade,wan(s.sales),wan(s.profit),s.te.toFixed(2),s.target===null?'不可拆分':wan(s.target),s.attainment===null?'—':(s.attainment*100).toFixed(1)+'%']);
  }else if(['pos','bi-detail'].includes(page)){
    headers=['月份','门店','SKU名称','销量','销售额(元)','成本(元)','TE'];rows=view.rows.map(r=>[r.month,esc(r.store.store_name),esc(r.sku.sku_name),r.quantity,(r.sales_cents/100).toFixed(2),(r.cost_cents/100).toFixed(2),r.te.toFixed(4)]);
  }else{
    const data=page==='bi-month'?view.trend:page==='bi-region'?view.regionRows:page==='bi-cate'?view.categoryRows:view.ka;
    headers=['维度','销售额','商品毛利','毛利率','销量(包装单位)','销售TE'];rows=data.map(r=>[page==='bi-cate'?`<button class="section-link" onclick="selectBICategory('${esc(r.key)}')">${esc(r.key)}</button>`:esc(r.name||r.key),wan(r.sales),wan(r.profit),(r.sales?r.profit/r.sales*100:0).toFixed(1)+'%',money(r.volume),r.te.toFixed(2)]);
  }
  $('page-'+page).innerHTML=card(titles[page],`<div class="hint">${esc(view.label)} · 与首页使用同一数据底座和筛选。${view.productFiltered?'商品筛选下不计算门店预算达成率。':''}</div><div class="body"><button class="action sec" onclick="biDownload()">导出当前筛选 CSV</button></div>`+biPaginate(headers,rows))+(page==='store'?card('商品销售明细',skuTable()):'');
  $('pageTitle').textContent=titles[page];
}
const legacyBIRender=render;
render=function(){
  legacyBIRender();
  $('pageSub').textContent=`DEMO_MOCK · ${view.stores} 家门店 · ${view.ka.length} 个KA · ${view.selectedMonths.length}个月 · 月度Sell-Out口径`;
  $('fTag').textContent=view.label;
  $('dataLineage').innerHTML='<b>统一模拟数据：</b>7个KA、140家门店、15个SKU；2025-11至2026-10。销售额为终端Sell-Out，商品毛利=销售额−模拟成本。筛选、预算和图表按同一周期计算。';
  document.querySelector('.notice:not(#dataLineage)')?.remove();
  if(page==='dash'){
    $('pageTitle').textContent='AI 经营驾驶舱';
    document.querySelector('.cockpit-head > span').textContent=view.label;
    const kpi=(icon,label,value,unit,foot)=>`<div class="cockpit-kpi"><div class="cap"><span class="symbol">${icon}</span>${label}</div><div class="number">${value}<span class="unit">${unit}</span></div><div class="foot">${foot}</div></div>`;
    document.querySelector('.cockpit-kpis').innerHTML=kpi('¥','销售额',(view.sales/10000).toFixed(2),'万元',`销量 ${money(view.volume)} 包/箱 · 模拟Sell-Out`)+kpi('◎','商品毛利',(view.profit/10000).toFixed(2),'万元',`毛利率 ${(view.sales?view.profit/view.sales*100:0).toFixed(1)}% · 未扣活动费`)+kpi('♉','预算达成',view.attainment===null?'—':(view.attainment*100).toFixed(1),'%',view.productFiltered?'预算仅有门店月度粒度':'同周期门店模拟预算')+kpi('▦','动销门店',money(view.active),'家',`覆盖 ${view.stores} 家 · 所选月份销量>0`)+kpi('▥','销售TE',view.te.toFixed(2),'TE','销量 × 粒数 ÷ 规格');
    const kaCard=document.querySelector('.cockpit-ka');kaCard.querySelector('.map-note').textContent=`显示 ${Math.min(5,view.ka.length)} / ${view.ka.length} 个KA · 合成演示数据`;
    const mapCard=document.querySelector('.map-card');mapCard.querySelector('h3').innerHTML='战区销售分布 <span class="tag">5大战区 · Mock</span>';mapCard.querySelector('.hint').textContent='点击气泡筛选战区，再次点击恢复全部';mapCard.querySelector('.map-note').textContent='气泡位置为战区示意；金额随月份、KA、门店及商品筛选同步计算。地图轮廓来源沿用原页面。';
    const skuEl=$('chartSku');if(skuEl){const parent=skuEl.closest('.card');parent.querySelector('.hint').textContent='按当前筛选的SKU销售额排序，点击条形下钻；单位万元';const data=view.skuRows.slice(0,10);const chart=echarts.getInstanceByDom(skuEl)||echarts.init(skuEl);chart.setOption({animation:false,tooltip:{trigger:'axis'},grid:{left:170,right:35,top:8,bottom:25,containLabel:true},xAxis:{type:'value',name:'万元'},yAxis:{type:'category',inverse:true,data:data.map(s=>s.sku_name),axisLabel:{fontSize:10}},series:[{type:'bar',data:data.map(s=>s.sales/10000),itemStyle:{color:'#2f6bff'},barMaxWidth:18}]},true);chart.off('click');chart.on('click',p=>selectBISku(data[p.dataIndex].sku_id));}
    const summary=$('cockpit-summary');if(summary)summary.innerHTML='<div class="ai-card">'+interpretation()+'</div>';
    renderWeekendPromoCard();
  }
  renderBIReports();
};
// Add filters in the same visual style; retain the original cockpit layout.
$('fRange').innerHTML='<option value="all">完整12个月</option>'+kiwiModel.months.map(m=>`<option value="${m}">${m}</option>`).join('');
$('fRegion').innerHTML='<option value="all">全部战区</option>'+Object.entries(biRegions).map(([k,n])=>`<option value="${k}">${n}战区</option>`).join('');
const filters=document.createElement('div');filters.className='bi-extra-filters';
filters.innerHTML=[['fMarket','市场部'],['fGrade','门店等级'],['fStore','门店'],['fCategory','品类'],['fSku','SKU']].map(([id,label])=>`<select class="pill" id="${id}" aria-label="${label}"><option value="all">全部${label}</option></select>`).join('')+'<button class="action sec" onclick="biDownload()">导出当前数据</button><button class="action sec" id="biReset">重置筛选</button>';
$('dataLineage').before(filters);
biOptions('fGrade',['A','B','C'].map(n=>[n,n]),'全部等级');biOptions('fCategory',[...new Set(KIWI_BI_DATA.skus.map(s=>s.category))].map(n=>[n,n]),'全部品类');
refreshBIFacets();
for(const id of ['fMarket','fGrade','fStore','fCategory','fSku'])$(id).addEventListener('change',()=>{refreshBIFacets();biTablePage=0;render();});
for(const id of ['fRange','fRegion','fKa'])$(id).addEventListener('change',()=>{refreshBIFacets();biTablePage=0;},{capture:true});
for(const id of ["fRange","fRegion","fKa"])$(id).addEventListener("change",()=>render());
$('biReset').addEventListener('click',()=>{for(const id of ['fRange','fRegion','fKa','fMarket','fGrade','fStore','fCategory','fSku'])$(id).value='all';refreshBIFacets();biTablePage=0;render();});
render();
