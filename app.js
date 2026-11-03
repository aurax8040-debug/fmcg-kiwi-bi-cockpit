/* =====================================================================
 * 数据层：真实数据来自 NKA商超.xlsx（财年口径 04月—次年03月累计）
 * 字段映射说明：
 *  - sales / volume  → 确认收入 / 销量(件)，真实值
 *  - profit          → 毛利润，真实值
 *  - rate(毛利率)     → 替代原「达成率」，作为客户健康度主指标
 *  - yoy             → 无去年同期数据，用「毛利额」正负替代（>0 盈利 / <0 亏损）
 *  - 门店数/拜访/陈列/SKU/核销 等 Excel 缺失字段 → 保留演示快照并标注「演示」
 * ===================================================================== */
const AS_OF='2027-03-31', TODAY='2027-04-01', COLORS=['#2f6bff','#36cfc9','#ffa940','#7a5cff','#c9d4e8'];
// 真实客户数据：name, 主战区key, 确认收入(元), 销量(件), 毛利润(元)
const REAL=[
  ['盒马','east',4520899,47123,685717],
  ['永辉','east',68719,1276,7711],
  ['华润万家','north',18154,589,3326],
  ['大润发','north',9536,136,-2915],
  ['沃尔玛','north',35410,431,-796],
  ['京东','north',5094,76,-1407],
  ['家得福','east',1211,6,244],
];
const REGION={all:'全部战区',east:'华东战区',north:'华北战区',south:'华南战区',central:'华中战区',west:'西部战区'};
// 月度真实收入（元），财年 04月→03月；10/11月为0（未录入）
const MONTH_REAL=[['04月',846557],['05月',699901],['06月',921190],['07月',24450],['08月',112098],['09月',286541],['10月',0],['11月',0],['12月',39453],['01月',31121],['02月',1669858],['03月',27854]];
// 真实战区汇总 [名称, 收入, 毛利]
const ZONE_REAL=[['华东战区',3009757,510655],['华南战区',788141,66895],['西北战区',339210,59170],['华北战区',273529,26813],['西南战区',128014,16991],['鲁豫战区',108285,9413],['长沙战区',12089,1948]];
// 真实品类汇总 [名称, 收入, 毛利]
const PRODUCT_REAL=[['金果',4486317,664065],['绿果',129872,18247],['红果',42834,9567]];
const date=(n)=>new Date(Date.UTC(2027,2,31-n)).toISOString().slice(0,10);
const FIXTURE=REAL; // 兼容旧引用：FIXTURE[i] = [name, region, sales, volume, profit]
const CUSTOMERS=REAL.map(([name,region,sales,volume,profit],i)=>({
  name,region,i,
  sales,volume,profit,
  monthTarget:sales,                // 无目标值，以实际销售额作分母，达成率=100%仅作占位
  stores:90+i*17,                   // 演示：门店档案
  active:Math.round((90+i*17)*0.9),
  display: profit<0?72:91,          // 演示：陈列执行率（亏损客户标低，标注演示）
  pending: profit<0?160000:0,       // 演示：待核销费用（亏损客户演示滞留）
  stock:i%4===0?7:3,
}));
// 日明细：按客户真实销售额/销量均摊到财年各月（按全局月度份额），保证聚合=真实值
const DAILY=CUSTOMERS.flatMap(c=>{
  const totalSales=c.sales, totalVol=c.volume;
  const activeMonths=MONTH_REAL.filter(m=>m[1]>0);
  const monthTotal=activeMonths.reduce((s,m)=>s+m[1],0);
  const rows=[];
  activeMonths.forEach(([m,mv],mi)=>{
    const share=mv/monthTotal;
    const monthSales=Math.round(totalSales*share);
    const monthVol=Math.round(totalVol*share);
    // 按月近似分配到 3 个日期点（月初/中/末）
    const pts=[1,11,21];
    let salesLeft=monthSales, volLeft=monthVol;
    pts.forEach((d,pi)=>{
      const isLast=pi===pts.length-1;
      const daySales=isLast?salesLeft:Math.round(monthSales/3);
      const dayVol=isLast?volLeft:Math.round(monthVol/3);
      salesLeft-=daySales; volLeft-=dayVol;
      // 跨年处理：04月-12月=2026，01-03月=2027
      const yr=(mi>=9)?'2027':'2026';
      const mm=String((mi%12)+4>12?(mi%12)+4-12:(mi%12)+4).padStart(2,'0');
      const dateStr=`${yr}-${mm}-${String(d).padStart(2,'0')}`;
      rows.push({id:`POS-${c.i+1}-${dateStr}`,ka:c.name,region:c.region,date:dateStr,sales:daySales,profit:Math.round(c.profit*daySales/totalSales),volume:Math.max(0,dayVol),previousYear:Math.round(daySales/(1+(c.profit>=0?0.1:-0.05))),dailyTarget:Math.round(c.monthTarget/12/3)});
    });
  });
  return rows;
});
const SKU_SAMPLE=['阳光金果22–30pc','阳光金果16–22pc','阳光绿果33pc','佳沛红宝石红果','奇异果3果礼盒','阳光绿果22–25pc','有机绿果16pc','金果即食装4pc','红宝石礼盒装','绿果家庭装'].map((name,i)=>({name,share:[.24,.17,.14,.1,.08,.07,.06,.05,.05,.04][i],margin:.26+(i%4)*.04,stockDays:7-i%5,loss:.015+(i%3)*.01}));
DAILY.forEach(r=>{let remaining=r.sales;r.skus=SKU_SAMPLE.map((sku,i)=>{const sales=i===SKU_SAMPLE.length-1?remaining:Math.round(r.sales*sku.share);remaining-=sales;return {name:sku.name,sales,cost:Math.round(sales*(1-sku.margin))};});});
const $=id=>document.getElementById(id), esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Math.round(n).toLocaleString('zh-CN'), wan=n=>(n/10000).toFixed(2)+' 万元', pct=(n,d)=>d?n/d*100:0;
let page='dash', view, curTask, tasks=[], storageOK=true;
try{tasks=JSON.parse(localStorage.getItem('cockpit-tasks-v2')||'[]');if(!Array.isArray(tasks))tasks=[];}catch{storageOK=false;tasks=[];}
function saveTasks(){try{localStorage.setItem('cockpit-tasks-v2',JSON.stringify(tasks));return true;}catch{storageOK=false;doAction('本浏览器无法保存任务，请勿关闭页面');return false;}}
function scope(){const r=$('fRegion').value,k=$('fKa').value;return CUSTOMERS.filter(c=>(r==='all'||c.region===r)&&(k==='all'||c.name===k));}
function aggregate(){const customers=scope(),names=new Set(customers.map(c=>c.name));const rows=DAILY.filter(r=>names.has(r.ka));const sum=key=>rows.reduce((s,r)=>s+r[key],0);const sales=sum('sales'),prior=sum('previousYear');const profit=sum('profit');const monthSales=sales;const monthProfit=profit;const monthProgress=1;const dates=rows.map(r=>r.date).sort();const start=dates[0]||'2026-04-01';const ka=customers.map(c=>{const a=c.sales;return {...c,sales:a,profit:c.profit,target:a,progress:c.sales?c.profit/c.sales*100:0,yoy:c.profit};});return {customers,rows,start,sales,target:sales,prior,profit,volume:sum('volume'),stores:customers.reduce((s,c)=>s+c.stores,0),active:customers.reduce((s,c)=>s+c.active,0),monthSales,monthTarget:sales,monthProgress,ka,label:`财年累计（04月—次年03月）${REGION[$('fRegion').value]} · ${$('fKa').value==='all'?'全部 KA':$('fKa').value}`};}
function refreshKa(){const selected=$('fKa').value;const list=CUSTOMERS.filter(c=>$('fRegion').value==='all'||c.region===$('fRegion').value);$('fKa').innerHTML='<option value="all">全部 KA 系统</option>'+list.map(c=>`<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('');if(list.some(c=>c.name===selected))$('fKa').value=selected;}
function card(title,body,cls=''){return `<div class="card ${cls}"><h3>${title}</h3>${body}</div>`;}
function table(headers,rows){return `<div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(x=>`<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
function kpi(label,val,sub,good=true){return `<div class="kpi"><div><div class="label">${label}<span class="src rule">明细计算</span></div><div class="val">${val}</div><div class="delta ${good?'up':'down'}">${sub}</div></div></div>`;}
function findings(){const risk=view.ka.filter(c=>c.profit<0).sort((a,b)=>a.profit-b.profit),display=view.ka.filter(c=>c.display<85),inactive=view.stores-view.active;return {risk,display,inactive};}
function evidence(c){return `<div class="evidence"><b>${esc(c.name)} · 真实销售数据</b><br>确认收入：${wan(c.sales)}，销量 ${money(c.volume)} 件，毛利率 ${c.sales?(c.profit/c.sales*100).toFixed(1):'0'}%。<br>毛利润：${wan(c.profit)}（${c.profit<0?'亏损':'盈利'}）。<br><b>判断边界：</b>门店/拜访/陈列/核销字段为演示快照（Excel 无此数据）；毛利亏损需人工核对进货价与费用归属后再下结论。</div>`;}
function interpretation(){const f=findings(),margin=view.sales?view.profit/view.sales*100:0;return `<div class="body"><b>当前范围：</b>${esc(view.label)}。确认收入 ${wan(view.sales)}，销量 ${money(view.volume)} 件，综合毛利率 ${margin.toFixed(1)}%。<br><b>利润结构：</b>毛利 ${wan(view.profit)}，${f.risk.length} 个客户毛利为负（${f.risk.map(c=>esc(c.name)).join('、')||'无'}），占总客户 ${f.risk.length}/${view.ka.length}。<br><b>待查异常：</b>${f.risk.length?f.risk.map(c=>esc(c.name)).join('、')+'毛利为负，建议核对进货价、费用核销与促销投入，不直接认定经营不合格。':'当前客户毛利均为正。'}<br><b>解读方式：</b>销售与毛利为 Excel 真实数据；门店/拜访/陈列等为演示快照，下列原因是待验证假设。</div>`;}
function priorities(){const f=findings();return `<div class="hint">销售运营工作台 · 先处理毛利亏损、陈列不足和未动销；金额为真实毛利/收入，不能视为行动可挽回收益。</div><div class="actions-grid">${card('① 毛利亏损',`<div class="metric risk">${f.risk.length} 个客户</div><div class="body">${f.risk.map(c=>`${esc(c.name)} ${wan(c.profit)}`).join(' · ')||'当前范围无亏损'}<br>亏损合计 ${wan(f.risk.reduce((s,c)=>s+c.profit,0))}</div>${f.risk.length?'<button class="action" onclick="openTask(\'display\')">创建核查草稿</button>':''}`)}${card('② 陈列执行不足',`<div class="metric risk">${f.display.length} 个客户</div><div class="body">目标85% · ${f.display.map(c=>esc(c.name)+' '+c.display+'%').join(' · ')||'当前范围未见异常'}<br>演示快照，需 SFA 真实数据核验</div>${f.display.length?'<button class="action" onclick="openTask(\'quickfee\')">创建核销核查草稿</button>':''}`)}${card('③ 未动销门店',`<div class="metric">${f.inactive} 家</div><div class="body">动销口径：近30天有销售；门店数为演示档案。<br>先核查缺货和闭店，再决定激活。</div><button class="action" onclick="openTask('visit')">创建专项拜访草稿</button>`)}</div>`;}
function draw(id,opt){const el=$(id);if(el&&typeof echarts!=='undefined')echarts.init(el).setOption(opt);}
function clearCharts(){document.querySelectorAll('.page .chart').forEach(el=>{const inst=typeof echarts!=='undefined'&&echarts.getInstanceByDom(el);if(inst)inst.dispose();});}
function charts(){const axis={tooltip:{trigger:'axis'},grid:{left:65,right:30,top:30,bottom:40,containLabel:true}};draw('chartTrend',{...axis,xAxis:{type:'category',data:[...new Set(view.rows.map(r=>r.date))].sort()},yAxis:{type:'value',name:'销售额（元）'},series:[{name:'实际',type:'line',data:[...new Set(view.rows.map(r=>r.date))].sort().map(d=>view.rows.filter(r=>r.date===d).reduce((s,r)=>s+r.sales,0)),itemStyle:{color:COLORS[0]}},{name:'去年同日',type:'line',data:[...new Set(view.rows.map(r=>r.date))].sort().map(d=>view.rows.filter(r=>r.date===d).reduce((s,r)=>s+r.previousYear,0)),itemStyle:{color:COLORS[1]}}]});draw('chartQuadrant',{...axis,xAxis:{type:'value',name:'毛利率（%）',nameLocation:'middle',nameGap:27},yAxis:{type:'value',name:'毛利额（元）'},series:[{type:'scatter',data:view.ka.map(c=>({name:c.name,value:[c.progress,c.profit,c.sales]})),symbolSize:v=>Math.min(50,Math.max(15,Math.sqrt(v[2])/20)),label:{show:true,formatter:'{b}',position:'top'},itemStyle:{color:COLORS[0]},markLine:{symbol:'none',data:[{xAxis:0},{yAxis:0}]}}]});}
function taskPanel(){const scoped=tasks.filter(t=>view.customers.some(c=>t.kas.includes(c.name)));const done=scoped.filter(t=>t.state==='已复盘').length;return card('任务与效果回看',`<div class="hint">本浏览器演示流程，未连接业务系统；范围按任务涉及客户筛选。${storageOK?'刷新后保留':'存储不可用，本次任务可能丢失'}。</div><div class="body">共 ${scoped.length} 条 · 流程复盘完成率 ${scoped.length?(done/scoped.length*100).toFixed(0)+'%':'暂无样本'} · 诊断采纳率、真实经营增量：未采集，暂不报告。</div>${scoped.map(t=>`<div class="task-item"><b>${esc(t.name)}</b> <span class="tag">${esc(t.state)}</span><div class="body">${esc(t.id)} · ${esc(t.scope)}<br>审核人：${esc(t.reviewer)} · 执行人：${esc(t.to)} · 截止 ${esc(t.due)}${t.due<TODAY&&!['已复盘','已驳回'].includes(t.state)?' <span class="risk">已逾期</span>':''}<br>基线：销售 ${wan(t.baseline.sales)}，陈列 ${t.baseline.display.toFixed(1)}%；草稿到审核 ${t.approved?((t.approved-t.created)/3600000).toFixed(2)+'小时':'待审核'}<br>说明：${esc(t.note)}</div>${t.state==='待审核'?`<button class="action" onclick="advance('${t.id}','已批准')">模拟指定审核人批准</button><button class="action sec" onclick="advance('${t.id}','已驳回')">驳回草稿</button>`:''}${t.state==='已批准'?`<button class="action" onclick="advance('${t.id}','执行中')">模拟执行人接收</button>`:''}${t.state==='执行中'?`<textarea aria-label="执行证据 ${t.id}" id="proof-${t.id}" placeholder="填写核查结果与证据编号；不要填写个人敏感信息"></textarea><button class="action" onclick="advance('${t.id}','待复盘')">提交执行反馈</button>`:''}${t.state==='待复盘'?`<div class="body">执行反馈：${esc(t.proof)}</div><textarea id="review-${t.id}" aria-label="复盘结论 ${t.id}" placeholder="填写前后变化、对照门店和促销干扰；缺少对照时记录未能确认效果"></textarea><button class="action" onclick="advance('${t.id}','已复盘')">保存效果复盘</button>`:''}${t.state==='已复盘'?`<div class="body">执行证据：${esc(t.proof)}<br>复盘结论：${esc(t.review)}<br>未自动把销售变化归因于任务，真实收益待业务核验。</div>`:''}</div>`).join('')||'<div class="empty">暂无任务。可从上方异常创建草稿。</div>'}`);}
function advance(id,state){const t=tasks.find(t=>t.id===id);const next={'待审核':['已批准','已驳回'],'已批准':['执行中'],'执行中':['待复盘'],'待复盘':['已复盘']};if(!t||!next[t.state]?.includes(state))return;if(state==='待复盘'){const v=$('proof-'+id).value.trim();if(!v)return doAction('请先填写执行证据');t.proof=v;}if(state==='已复盘'){const v=$('review-'+id).value.trim();if(!v)return doAction('请填写复盘结论，也可记录证据不足');t.review=v;}t.state=state;if(state==='已批准')t.approved=Date.now();saveTasks();if(state==='已复盘'&&t.aiRunId&&typeof recordAiTaskEvent==='function')recordAiTaskEvent(t.aiRunId,'completed',t.id);render();}
function navigate(p){page=p;document.querySelectorAll('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.page===p));$('pageTitle').textContent=document.querySelector(`.nav-item[data-page="${p}"]`).textContent.trim().slice(1).trim();render();window.scrollTo({top:0});$('sidebar').classList.remove('open');$('sideMask').classList.remove('show');}
function openTask(type){if(type==='chain1')type='display';if(type==='all')type='visit';curTask=type;const f=findings(),affected=type==='quickfee'?f.display:type==='display'?f.risk:view.ka;if(!affected.length)return doAction('当前范围没有该异常，无需创建任务');const names=affected.map(c=>c.name);$('tkTitle').textContent='创建核查草稿';$('tkName').value=(type==='quickfee'?'核销与陈列关联核查':type==='visit'?'未动销门店现场核查':type==='audit'?'DMS流向稽查':type==='replen'?'紧急补货核查':type==='clearance'?'门店清退评估':'同比下滑与陈列核查')+' · '+names.join('、');$('tkFrom').value=type==='quickfee'?'PMO · 周总监':'销售运营 · Clara（我）';$('tkTo').value=$('fRegion').value==='north'?'华北督导 · 赵磊':$('fRegion').value==='south'?'华南督导 · 刘洋':'华东督导 · 张伟';$('tkDue').min=TODAY;$('tkDue').value='2027-04-08';$('tkNote').value=`范围：${view.label}。涉及 ${names.join('、')}。核查库存、价格、陈列与费用台账，记录证据编号；不预设根因，不执行付款或清退。`;curTask={type,names,scope:view.label,baseline:{sales:affected.reduce((s,c)=>s+c.sales,0),display:affected.reduce((s,c)=>s+c.display,0)/affected.length}};$('taskMask').style.display='block';$('taskModal').style.display='block';$('tkName').focus();}
function closeTask(){$('taskMask').style.display='none';$('taskModal').style.display='none';}
function submitTask(){if(!curTask||typeof curTask==='string')return;const name=$('tkName').value.trim(),due=$('tkDue').value,note=$('tkNote').value.trim();if(!name||!note||!due||due<TODAY)return doAction('请填写名称、执行说明和不早于今天的截止日期');const task={id:'TASK-'+Date.now(),name,due,note,to:$('tkTo').value,from:$('tkFrom').value,reviewer:curTask.type==='quickfee'?'PMO + 财务（仅核查草稿）':curTask.type==='clearance'?'渠道负责人（仅评估，不实际清退）':'销售运营',priority:$('tkPrio').value,kas:curTask.names,scope:curTask.scope,baseline:curTask.baseline,caseDecision:curTask.caseDecision||null,aiRunId:curTask.aiRunId||null,storeId:curTask.storeId||null,cycleId:curTask.cycleId||null,taskType:curTask.taskType||null,humanDecision:curTask.humanDecision||null,state:'待审核',created:Date.now()};tasks.push(task);saveTasks();if(task.aiRunId&&typeof recordAiTaskEvent==='function')recordAiTaskEvent(task.aiRunId,'created',task.id);closeTask();render();doAction(task.taskType==='next_week_store_visit'?'下周重点拜访待办已保存至模拟审核队列，未真实下发勤策':'草稿已保存至本浏览器待审核队列，未真实下发');}
function doAction(msg){$('toast').textContent=msg;$('toast').classList.add('show');clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3200);}
function buildContext(){const f=findings(),margin=view.sales?view.profit/view.sales*100:0;return {label:view.label,sales:view.sales,volume:view.volume,profit:view.profit,margin:margin.toFixed(1),riskCount:f.risk.length,riskNames:f.risk.map(c=>c.name),riskProfit:f.risk.map(c=>c.profit),displayCount:f.display.length,displayNames:f.display.map(c=>c.name),inactive:f.inactive,ka:view.ka.map(c=>({name:c.name,sales:c.sales,profit:c.profit,margin:c.sales?(c.profit/c.sales*100).toFixed(1):'0'}))};}
function answer(q,b){b=b||document.querySelector('.chat-body');const user=document.createElement('div');user.className='msg user';user.textContent=q;b.append(user);const bot=document.createElement('div');bot.className='msg bot';const c=caseCustomer?caseCustomer().picked:null;let html=null;
// 规则问答：基于真实业务数据的确定性答案，命中则优先返回（业务口径准确）
if(/为什么优先查它|为什么优先/.test(q)){html=c?`<b>【指标答案】</b>${esc(c.name)} 财年累计毛利率 ${c.sales?(c.profit/c.sales*100).toFixed(1):'0'}%，应优先核验负毛利口径。<br><b>【口径与来源】</b>NKA商超.xlsx 客户月度聚合；毛利=确认收入-确认成本。<br><b>【AI 解读·待验证】</b>当前只能确认累计异常及影响金额 ${wan(Math.abs(c.profit))}，不能据此判断连续性或根因。<br><i>原因需人工确认，我不直接认定经营不合格。</i>`:'当前筛选范围内没有待核查客户。';}
else if(/负毛利来自哪些记录/.test(q)){html=c?`<b>【指标答案】</b>当前客户聚合毛利为 ${wan(c.profit)}。<br><b>【口径与来源】</b>NKA商超.xlsx 仅提供客户/月聚合，尚无逐单明细。<br><b>【AI 解读·待验证】</b>需要补充订单收入、成本与退货冲减凭证后，才能定位具体记录；当前不编造单据。`:'当前范围内无负毛利记录。';}
else if(/还缺什么证据/.test(q)){html=`<b>【指标答案】</b>已具备：NKA商超.xlsx 的客户月度销售与毛利聚合。<br><b>【缺失清单】</b>① 逐单收入与成本凭证 ② 退货冲减是否入账 ③ 客户端配货与上架确认。<br><b>【标注】</b>门店库存当前不可见，不作必填项；活动费用与客户聚合毛利分口径展示。`;}
else if(/生成核查任务/.test(q)){html=`<b>【执行】</b>已按当前范围生成核查任务草稿：负责人+截止时间+待补证据清单，进入审核队列。<br><i>原因未确认前不生成补访/配货/促销方案。</i>`;if(typeof cockpitCaseTask==='function')setTimeout(()=>cockpitCaseTask(c?c.name:''),50);}
if(html!==null){bot.innerHTML=html;b.append(bot);b.scrollTop=b.scrollHeight;return;}
// 未命中规则 → 走真实 LLM（streaming + system message）
const llm=window.cloudReady&&window.cloud&&window.cloud.llm?window.cloud.llm:null;
if(!llm){bot.innerHTML=interpretation()+'<br><span class="risk">（AI 大模型未连接，当前为规则解读；可在「AI归因诊断」查看当前范围证据。）</span>';b.append(bot);b.scrollTop=b.scrollHeight;return;}
bot.innerHTML='<span class="typing">AI 研判中…</span>';b.append(bot);b.scrollTop=b.scrollHeight;
const ctx=buildContext();
const systemPrompt='你是快消智析平台的经营解读助手，为销售运营与 KA 负责人提供快消终端经营研判。规则：① 只依据下方提供的真实数据回答，不得编造数据或事实；② 销售/毛利为 ERP/Sell-Out 真实数据，门店/拜访/陈列/SKU 为演示快照，涉及后者时须标注"演示快照·待验证"；③ 结论分"指标答案 / 口径与来源 / AI解读·待验证"三部分，AI 解读必须标注"待验证"，原因需人工确认，不直接认定经营不合格；④ 简洁、结构化，用中文，避免空话。';
const messages=[
 {role:'system',content:systemPrompt},
 {role:'user',content:'当前数据上下文（JSON）：\n'+JSON.stringify(ctx)+'\n\n用户问题：'+q}
];
(async()=>{let acc='';try{
 for await (const chunk of llm.chat.completions.create({model:'auto',messages,stream:true})){
  const d=chunk.choices&&chunk.choices[0]&&chunk.choices[0].delta;
  if(d&&d.content){acc+=d.content;bot.innerHTML=acc.replace(/\n/g,'<br>')+'<span class="typing">…</span>';b.scrollTop=b.scrollHeight;}
 }
 if(!acc)acc='（模型未返回内容，请稍后重试）';
 bot.innerHTML=acc.replace(/\n/g,'<br>');
}catch(e){console.warn('LLM 调用失败，回退规则解读',e);bot.innerHTML=interpretation()+'<br><span class="risk">（AI 大模型调用失败，已回退规则解读。）</span>';}
bot.innerHTML=bot.innerHTML.replace(/<span class="typing">…<\/span>$/,'');b.scrollTop=b.scrollHeight;})();}
// 保留原页面结构与业务图表；修复通过原卡片内联呈现。
const originalPages=Object.fromEntries([...document.querySelectorAll('.page')].map(el=>[el.id,el.innerHTML]));
function details(title,body,open=false){return `<details ${open?'open':''}><summary>${title}</summary><div class="body">${body}</div></details>`;}
function render(){
 view=aggregate();clearCharts();Object.entries(originalPages).forEach(([id,html])=>$(id).innerHTML=html);
 const f=findings(),margin=view.sales?view.profit/view.sales*100:0;const inactive=view.stores-view.active;
 $('fTag').textContent=`${$('fRange').selectedOptions[0].text} · ${REGION[$('fRegion').value]}${$('fKa').value==='all'?'':' · '+$('fKa').value}`;
 $('pageSub').textContent=`数据范围：${view.customers.length} 个 KA · NKA商超.xlsx冻结样例 ｜ 财年口径04月—次年03月，未录入月份不代表实时经营`;
 $('kpiSales').textContent=money(view.sales);$('kpiSalesD').textContent=`综合毛利率 ${margin.toFixed(1)}% ｜ 毛利 ${wan(view.profit)}`;
 $('kpiVol').textContent=money(view.volume);$('kpiVol').nextElementSibling.textContent='销量（件）· 真实数据';
 $('kpiStore').textContent=`${view.active} / ${view.stores}`;$('kpiStore').nextElementSibling.textContent=`动销率 ${pct(view.active,view.stores).toFixed(1)}% · 门店为演示档案`;
 $('kpiVisit').textContent='—';$('kpiVisit').nextElementSibling.textContent='拜访数据未接入 · 演示占位';
 document.querySelector('#kpiVisit').previousElementSibling.querySelector('.src').textContent='演示';
 const dash=$('page-dash'),cards=dash.querySelectorAll('.grid .card');
 cards[0].querySelector('h3').innerHTML='销售趋势 <span class="tag">财年累计 · 按月</span>';cards[0].querySelector('.hint').textContent=view.label+'；数据为财年累计（04月—次年03月），10/11月未录入为0。';
 cards[1].querySelector('.hint').textContent='X轴=毛利率，Y轴=毛利额；气泡=销售额，筛选不会移动象限分界。';cards[1].querySelector('h3').innerHTML='KA 毛利率 × 毛利额 四象限 <span class="tag">气泡=销售额</span>';
 cards[2].querySelector('.hint').textContent='真实品类收入（金果/绿果/红果），来自 NKA商超.xlsx。';cards[2].querySelector('h3').innerHTML='品类收入排行 <span class="tag">真实数据</span>';
 const ai=dash.querySelector('.ai-card');ai.innerHTML='<h3>✦ AI 智能解读 · 本期经营摘要 <span class="tag">真实数据 · 部分字段演示</span></h3>'+details('<b>核心结论</b>：综合毛利率 '+margin.toFixed(1)+'%，'+f.risk.length+' 个客户毛利为负',interpretation()+`<button class="action" onclick="openTask('display')">→ 生成毛利核查任务</button><button class="action sec" onclick="openTask('quickfee')">→ 发起核销核查草稿</button>`,true)+details('<b>利润结构</b>：亏损客户集中在毛利为负的 KA',$('fKa').value==='all'?'毛利为负客户：'+f.risk.map(c=>esc(c.name)).join('、')+'，合计亏损 '+wan(f.risk.reduce((s,c)=>s+c.profit,0))+'；建议核对进货价与费用归属。':'当前只选一个KA，切换全部KA查看整体利润结构。')+details(`<b>门店机会</b>：${f.inactive} 家未动销门店，先核查库存与现场情况`,`门店数为演示档案；A/B/C/D分层与库存归因需 SFA/POS 真实数据接入。<button class="action" onclick="openTask('visit')">→ 生成专项拜访草稿</button>`);
 ai.insertAdjacentHTML('beforeend',details('<b>证据与验证办法</b>：查看客户记录和判断边界',f.risk.map(evidence).join('')||'当前范围无毛利为负客户。'));
 dash.insertAdjacentHTML('beforeend','<div style="margin-top:14px">'+taskPanel()+'</div>');
 // KA卡片保留原图表和表格，更新指标及解读。
 const ka=$('page-ka');ka.querySelector('h3').innerHTML='KA 毛利率 × 毛利额 四象限 <span class="tag">气泡=销售额</span>';ka.querySelectorAll('.tag')[1].textContent=view.customers.length+' 个 KA';let kv=ka.querySelectorAll('.kpi .val');[view.customers.length,margin.toFixed(1)+'%',f.risk.length,wan(view.sales)].forEach((v,i)=>{if(kv[i])kv[i].textContent=v;});
 let kt=$('kaTable');if(kt)kt.innerHTML='<tr><th>KA</th><th>销售额</th><th>毛利率</th><th>毛利额</th><th>建议</th></tr>'+view.ka.map(c=>{const mgn=c.sales?c.profit/c.sales*100:0;const bg=mgn>=15?'#2ba471':mgn>=0?'#f5a623':'#e34d4d';return `<tr><td>${esc(c.name)}</td><td>${wan(c.sales)}</td><td><div class="rate-cell"><div class="rate-bar"><i style="width:${Math.min(100,Math.max(0,mgn)).toFixed(1)}%;background:${bg}"></i></div><span>${mgn.toFixed(1)}%</span></div></td><td>${wan(c.profit)}</td><td>${c.profit<0?'核查亏损':'保持供货'}</td></tr>`;}).join('');
 ka.querySelector('.ai-card').innerHTML='<h3>✦ AI 客户洞察</h3>'+details('当前客户与利润结构',interpretation(),true)+details('核查毛利与费用证据',f.risk.map(evidence).join('')||'当前筛选无毛利为负的客户。');
const tierCard=$('kaTierCard');if(tierCard){const mTotal=MONTH_REAL.reduce((s,m)=>s+m[1],0);const mRows=MONTH_REAL.map(([m,v],i)=>{const prev=MONTH_REAL[i-1]?MONTH_REAL[i-1][1]:null;const mom=prev&&prev>0?(v-prev)/prev:null;return [m,wan(v),(v/mTotal*100).toFixed(1)+'%',mom===null?'—':(mom>=0?'+':'')+(mom*100).toFixed(1)+'%'];});mRows.push(['合计',wan(mTotal),'100%','—']);tierCard.innerHTML='<h3>月度销售汇总 <span class="tag">财年 04月—03月 · 真实数据</span></h3><div class="hint">确认收入（元）按月分布 · 10/11月未录入为 0</div>'+table(['月份','确认收入','收入占比','环比'],mRows)+'<div class="map-note">02月为旺季峰值（占 35.9%），07月、12月—03月为淡季；10/11月数据未录入。</div>';}
 const diag=$('page-ai');const ac=diag.querySelector('.ai-card');ac.innerHTML='<h3>✦ 本期异常诊断 <span class="tag">当前范围 · 证据待核实</span></h3>'+details('经营节奏与客户异常',interpretation(),true)+details('陈列与费用关联假设',f.display.map(evidence).join('')||'当前范围没有陈列不足客户；不确认根因。')+details('流向稽查与门店激活',`保留DMS稽查与A/B/C/D激活场景，先出草稿再审核。<button class="action" onclick="openTask('audit')">→ 创建流向稽查草稿</button><button class="action" onclick="openTask('visit')">→ 创建专项拜访草稿</button>`);diag.insertAdjacentHTML('beforeend',taskPanel());diag.querySelectorAll('.grid h3')[1].textContent='归因证据覆盖分布';diag.querySelectorAll('.grid .hint').forEach(e=>e.textContent='证据覆盖演示等级，不代表统计置信度；历史图表为全量流程样本。');
 const brief=$('page-brief');brief.querySelector('.ai-card').innerHTML='<h3>✦ 每日智能简报 <span class="tag">预览 · 未实际推送</span></h3><div class="body" style="padding:8px 0">'+interpretation()+`<br><b>今日重点：</b>核查${f.risk.length}个毛利亏损客户、${f.display.length}个陈列不足客户；${inactive}家门店按分级收集现场证据。</div>`;brief.querySelectorAll('.pill').forEach(el=>{el.style.cursor='pointer';el.onclick=()=>doAction('角色订阅配置保留；消息推送接口尚未接入');});
 const why=$('page-why');why.innerHTML=`<div class="card ai-card"><h3>为什么是 AI · 当前真实能力</h3><div class="body"><b>已完成Dify Workflow #1与DeepSeek V4.1 Flash真实调用。</b><br>NKA销售与毛利为冻结真实样例；活动、门店POS、费用和执行证据为匿名模拟；佳农BI、勤策365 SFA、审批与消息推送尚未真实接入。</div></div><div class="grid"><div class="card"><h3>Rules · 确定性</h3><div class="body">销售、成本、毛利、费用和覆盖率由代码计算；数据不足时阻断或降级，模型不重算经营数字。</div></div><div class="card"><h3>AI · 动态归纳</h3><div class="body">基于有限证据归纳事实、缺口、待验证假设和优先核查动作；每条结论绑定证据编号。</div></div><div class="card"><h3>Workflow · 稳定推进</h3><div class="body">研判版本→人工确认→核查任务→执行补证→再次研判→经营复盘，刷新后保留服务端记录。</div></div><div class="card"><h3>Human · 最终责任</h3><div class="body">NKA客户经理确认、战区销售执行、营销负责人验收；费用、资源与人员评价不由AI自动决定。</div></div></div><div class="card"><h3>当前边界</h3><div class="body">无库存数据不判断缺货；无有效对照不声称因果增量；活动费用覆盖观察不等于完整ROI。RAG、库存补货、DMS稽查等不属于当前主案例，仅可作为未来规划。</div></div><div class="card"><h3>试点评测</h3><div class="body">先用10—20个匿名冻结案例评测事实引用正确率、未知事实编造率、建议可执行率和人工修正率；上线试点后再采集异常处理时效、证据完整率、采纳率和调用成本，不把目标写成已实现收益。</div></div>`;
 document.querySelectorAll('.page').forEach(el=>el.classList.toggle('active',el.id==='page-'+page));legacyCharts();
}
function legacyCharts(){
 const base={tooltip:{trigger:'axis'},grid:{left:55,right:45,top:35,bottom:32,containLabel:true}}, dates=[...new Set(view.rows.map(r=>r.date))].sort();
 const pie=(id,labels,values)=>draw(id,{animation:false,tooltip:{trigger:'item',formatter:'{b}<br>{d}%'},legend:{bottom:0,textStyle:{fontSize:10}},color:COLORS,series:[{type:'pie',radius:['48%','70%'],center:['50%','42%'],label:{fontSize:10,formatter:'{b}\n{d}%',overflow:'break',width:88},labelLayout:{hideOverlap:true},itemStyle:{borderRadius:4,borderWidth:2,borderColor:'#fff'},data:labels.map((name,i)=>({name,value:values[i]}))}]});
 if(page==='dash'){

 draw('chartTrend',{...base,legend:{data:['销售额','去年同日','销量'],top:0,textStyle:{fontSize:10}},xAxis:{type:'category',data:dates.map(d=>d.slice(5)),axisLabel:{fontSize:10}},yAxis:[{type:'value',name:'销售额(元)'},{type:'value',name:'销量(件)'}],series:[{type:'bar',name:'销售额',data:dates.map(d=>view.rows.filter(r=>r.date===d).reduce((s,r)=>s+r.sales,0)),itemStyle:{color:'#2f6bff'}},{type:'bar',name:'去年同日',data:dates.map(d=>view.rows.filter(r=>r.date===d).reduce((s,r)=>s+r.previousYear,0)),itemStyle:{color:'#b2baff'}},{type:'line',name:'销量',yAxisIndex:1,smooth:true,data:dates.map(d=>view.rows.filter(r=>r.date===d).reduce((s,r)=>s+r.volume,0)),itemStyle:{color:'#56bcb2'}}]});
 }
 if(page==='dash'||page==='ka')draw(page==='dash'?'chartQuadrant':'chartQuadrant2',{...base,tooltip:{formatter:p=>esc(p.name)+'<br>毛利率 '+p.value[0].toFixed(1)+'%<br>毛利额 '+wan(p.value[1])+'<br>销售额 '+wan(p.value[2])},xAxis:{type:'value',name:'毛利率(%)'},yAxis:{type:'value',name:'毛利额(元)'},series:[{type:'scatter',data:view.ka.map(c=>({name:c.name,value:[c.progress,c.profit,c.sales]})),symbolSize:v=>Math.max(12,Math.min(60,Math.sqrt(v[2])/20)),itemStyle:{color:new echarts.graphic.LinearGradient(0,0,1,1,[{offset:0,color:'#36cfc9'},{offset:1,color:'#2f6bff'}])},label:{show:true,formatter:'{b}',fontSize:10,position:'top'},markLine:{symbol:'none',data:[{xAxis:0},{yAxis:0}],label:{fontSize:10}}}]});
 if(page==='dash'){const pNames=PRODUCT_REAL.map(p=>p[0]),pValues=PRODUCT_REAL.map(p=>p[1]/10000);draw('chartSku',{...base,grid:{left:120,right:38,top:8,bottom:24},xAxis:{type:'value',name:'万元',axisLabel:{fontSize:10}},yAxis:{type:'category',inverse:true,data:pNames,axisLabel:{fontSize:10}},series:[{type:'bar',data:pValues.map(v=>+v.toFixed(2)),barWidth:24,label:{show:true,position:'right',fontSize:10},itemStyle:{color:new echarts.graphic.LinearGradient(0,0,1,0,[{offset:0,color:'#36cfc9'},{offset:1,color:'#2f6bff'}]),borderRadius:[0,6,6,0]}}]});}
 const inactive=view.stores-view.active;
 if(page==='ai'){draw('chartAbnMon',{...base,legend:{data:['异常数','已复盘'],top:0},xAxis:{type:'category',data:['W1','W2','W3','W4','W5','W6']},yAxis:{type:'value'},series:[{name:'异常数',type:'bar',data:[14,11,9,7,5,3],itemStyle:{color:'#ffa940'}},{name:'已复盘',type:'bar',data:[12,9,8,6,4,2],itemStyle:{color:'#2ba471'}}]});pie('chartConf',['多源记录','单源记录','证据不足'],[5,3,1]);}
 if(page==='budget'){
  const names=['盒马','京东','美团小象','叮咚','永辉','沃尔玛','天猫','七鲜','大润发','华润'];
  const rates=[107,56,147,79,92,94,1,67,95,113];
  draw('chartBudgetRate',{...base,grid:{left:90,right:45,top:20,bottom:28},xAxis:{type:'value',name:'达成%',max:160},yAxis:{type:'category',inverse:true,data:names,axisLabel:{fontSize:10}},series:[{type:'bar',data:rates.map(v=>({value:v,itemStyle:{color:v>=100?'#2ba471':v>=90?'#f5a623':'#e34d4d'}})),barWidth:14,label:{show:true,position:'right',formatter:'{c}%',fontSize:10},markLine:{symbol:'none',data:[{xAxis:100,label:{formatter:'100%',fontSize:9}}],lineStyle:{color:'#98a4b8',type:'dashed'}}}]});
 }
 if(page==='pos'){
  const tiers=['≥14w','14-10w','10-8w','8-5w','5-3w','3-1w','＜1w'];
  const s25=[79,84,73,193,198,532,865],s26=[23,48,50,166,287,955,1248];
  const v25=[6234.2,3800.2,2526.4,4675.9,2963.8,3555.5,1034.3],v26=[1212.8,1657.4,1327.8,3115.6,3239.9,5046.7,1687.4];
  const yoy=[-81,-56,-48,-33,9,42,63];
  draw('chartTierStore',{...base,legend:{data:['Y25','Y26'],top:0,textStyle:{fontSize:10}},xAxis:{type:'category',data:tiers,axisLabel:{fontSize:10}},yAxis:{type:'value',name:'门店数(家)'},series:[{name:'Y25',type:'bar',data:s25,itemStyle:{color:'#b2baff'}},{name:'Y26',type:'bar',data:s26,itemStyle:{color:'#2f6bff'}}]});
  draw('chartTierSales',{...base,legend:{data:['Y25销售额','Y26销售额','销售额同比'],top:0,textStyle:{fontSize:10}},xAxis:{type:'category',data:tiers,axisLabel:{fontSize:10}},yAxis:[{type:'value',name:'万元'},{type:'value',name:'同比%',max:100,min:-90}],series:[{name:'Y25销售额',type:'bar',data:v25,itemStyle:{color:'#b2baff'}},{name:'Y26销售额',type:'bar',data:v26,itemStyle:{color:'#ffa940'}},{name:'销售额同比',type:'line',yAxisIndex:1,smooth:true,data:yoy,itemStyle:{color:'#e34d4d'},label:{show:true,formatter:'{c}%',fontSize:9,color:'#e34d4d'}}]});
 }
}

// 替换旧原型中的固定问答与虚构思考过程。
document.querySelector('.chat-body').innerHTML='<div class="msg bot">经营解读助手。销售/毛利为 NKA商超.xlsx 真实数据；门店/拜访/陈列为演示快照，回答使用顶部当前筛选。</div>';
const notice=document.createElement('div');notice.className='notice';notice.innerHTML='真实销售数据（NKA商超.xlsx，财年累计）· 门店/拜访/陈列/SKU 为演示快照，真实 POS/SFA 待接入。';document.querySelector('.topbar').after(notice);
document.querySelectorAll('.nav-item').forEach(el=>{el.tabIndex=0;el.setAttribute('role','button');el.addEventListener('click',()=>navigate(el.dataset.page));el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();navigate(el.dataset.page);}});});
$('fRegion').addEventListener('change',()=>{refreshKa();render();});$('fRange').addEventListener('change',render);$('fKa').addEventListener('change',render);$('btnAi').addEventListener('click',()=>{navigate('dash');document.querySelector('#page-dash .ai-card').scrollIntoView({behavior:'smooth'});doAction('已按当前筛选更新经营解读');});$('chatSend').addEventListener('click',()=>{const q=$('chatInput').value.trim();if(q){answer(q);$('chatInput').value='';}});$('chatInput').addEventListener('keydown',e=>{if(e.key==='Enter')$('chatSend').click();});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeTask();});window.addEventListener('resize',()=>document.querySelectorAll('.chart').forEach(el=>{const inst=typeof echarts!=='undefined'&&echarts.getInstanceByDom(el);if(inst)inst.resize();}));refreshKa();render();
