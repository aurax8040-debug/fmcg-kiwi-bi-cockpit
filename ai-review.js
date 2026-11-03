/* Credentials for DeepSeek/Dify never enter this browser module. */
let reviewBase=localStorage.getItem('kiwi-ai-backend')||'',reviewAccess='',reviewConnection=null,reviewBusy=false,reviewError='';
const reviewAnswers=new Map();
const reviewKey=()=>promoActivity+'|'+promoStore;
function reviewEndpoint(path){
 if(reviewBase)return reviewBase+path;
 if(['localhost','127.0.0.1','terminal.local'].includes(location.hostname))return path;
 throw Error('请先连接AI后端。GitHub Pages只托管页面，不能直接保管API密钥。');
}
function reviewEvidenceHTML(e){return `<details class="promo-details"><summary>${esc(e.id)} · ${esc(e.source)}${e.type==='knowledge'?' · '+esc(e.document_name):''}</summary><pre class="review-pre">${esc(e.type==='knowledge'?e.content:JSON.stringify(e.value,null,2))}</pre></details>`;}
function reviewAIHTML(r){const a=r.answer;return `<div class="hint">真实调用成功 · ${esc(r.ai.model)} · 请求ID ${esc(r.ai.request_id||'服务未返回')} · ${esc(r.generated_at)}<br>Dify：${r.rag.status==='RETRIEVED'?'检索到'+r.rag.citations.length+'条知识片段':'检索完成，未命中'} · Tokens ${r.ai.usage?.total_tokens??'未返回'} · 输出需人工核验</div><p>${esc(a.summary)}</p>${[['facts','已知事实'],['hypotheses','待验证假设'],['actions','建议核查动作']].map(([k,label])=>`<h4>${label}</h4>${a[k].map(v=>`<p>${esc(v.text)} <small>${v.evidenceIds.map(esc).join(' · ')}</small></p>`).join('')||'<p>本次未生成</p>'}`).join('')}<h4>判断边界</h4><ul>${a.limits.map(v=>`<li>${esc(v)}</li>`).join('')}</ul><details class="promo-details"><summary>核对实际返回的业务证据与Dify引用</summary>${r.evidence.map(reviewEvidenceHTML).join('')}</details><details class="promo-details"><summary>查看真实调用轨迹</summary><pre class="review-pre">${esc(JSON.stringify(r.trace,null,2))}</pre></details>`;}
function renderReviewAI(){
 if(page!=='promo')return;
 let panel=$('reviewAIPanel');if(!panel){panel=document.createElement('div');panel.id='reviewAIPanel';panel.className='card review-ai';$('page-promo').append(panel);}
 const result=reviewAnswers.get(reviewKey()),connected=reviewConnection?.configured;
 const status=!reviewConnection?'尚未连接后端':connected?'服务端配置齐全，点击生成可验证真实调用':'后端已连接，服务凭证尚未配齐';
 panel.innerHTML=`<h3>DeepSeek + Dify 活动复盘 <span class="tag">按需调用</span></h3><div class="hint">Dify检索知识 → DeepSeek结合本店本活动证据回答。密钥由服务端保管；每次点击可能消耗模型或检索额度。</div><div role="status">${status}</div><details class="promo-details"><summary>连接AI后端</summary><form id="reviewBackendForm"><label>后端地址（只填服务地址，不填API密钥）<input id="reviewBackend" aria-label="AI后端地址" placeholder="https://你的后端地址" value="${esc(reviewBase)}"></label><label>演示访问码（如后端要求）<input id="reviewAccess" aria-label="演示访问码" type="password" autocomplete="off" placeholder="访问码只保留在当前页面内存"></label><button class="action sec" type="submit">检查连接</button></form><div class="hint">本机启动完整版时地址留空。这里不能填写DeepSeek或Dify密钥。</div></details><label>复盘问题<textarea id="reviewQuestion" aria-label="AI复盘问题" maxlength="1200">请复盘本店本次活动：区分已知事实、待验证原因、证据缺口和建议核查动作，并引用业务记录与知识依据。</textarea></label><button class="action" id="reviewRun" ${reviewBusy||!connected?'disabled':''}>${reviewBusy?'正在检索与分析…':'生成AI活动复盘'}</button><div class="review-error" role="alert">${esc(reviewError)}</div><div class="review-output">${result?reviewAIHTML(result):'<div class="hint">尚无本店本活动的真实模型结果。</div>'}</div>`;
 $('reviewBackendForm').onsubmit=async e=>{e.preventDefault();try{
  const raw=$('reviewBackend').value.trim();if(raw){const u=new URL(raw);if((u.protocol!=='https:'&&!(['localhost','127.0.0.1'].includes(u.hostname)&&u.protocol==='http:'))||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('请填写HTTPS后端根地址，本机可用http://127.0.0.1:8787');reviewBase=u.origin;}else reviewBase='';
  reviewAccess=$('reviewAccess').value;localStorage.setItem('kiwi-ai-backend',reviewBase);reviewError='';await checkReviewConnection();
 }catch(e){reviewError=e.message;renderReviewAI();}};
 $('reviewRun').onclick=runReviewAI;
 const top=$('btnAi');top.disabled=!connected||reviewBusy;top.textContent=reviewBusy?'正在生成AI复盘':'生成AI活动复盘';top.onclick=null;
 $('pageSub').textContent='POS + TPM + SFA 联合查询 · '+(result?'真实DeepSeek复盘已返回':connected?'DeepSeek + Dify 按需调用':'DeepSeek + Dify 待配置');
 const hero=document.querySelector('#page-promo .promo-hero .hint');if(hero)hero.textContent='上方展示同店同活动的业务事实，下方可按需调用Dify知识检索和DeepSeek复盘。';
 const boundary=[...document.querySelectorAll('#page-promo .body')].find(n=>n.textContent.startsWith('RAG：未接入；'));
 if(boundary)boundary.textContent='以上为确定性数据查询。下方AI复盘会单独展示Dify检索、DeepSeek调用状态和引用；失败不会替换成预设回答。';
}
async function checkReviewConnection(){
 try{const response=await fetch(reviewEndpoint('/api/ai/status'),{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('AI后端不可用（HTTP '+response.status+'）');const body=await response.json();if(typeof body.deepseek!=='boolean'||typeof body.dify!=='boolean')throw Error('地址未返回本项目AI服务');reviewConnection=body;reviewError=body.configured?'':'服务端尚缺：'+[!body.deepseek&&'DeepSeek密钥',!body.dify&&'Dify知识库地址、ID或密钥'].filter(Boolean).join('、');}
 catch(e){reviewConnection=null;reviewError=e.message;}renderReviewAI();
}
async function runReviewAI(){
 if(reviewBusy||!reviewConnection?.configured)return;
 const key=reviewKey(),store_id=promoStore,activity_id=promoActivity,question=$('reviewQuestion').value.trim();
 if(!question){reviewError='请填写复盘问题';renderReviewAI();return;}
 reviewBusy=true;reviewError='';renderReviewAI();
 try{const response=await fetch(reviewEndpoint('/api/ai/review'),{method:'POST',headers:{'Content-Type':'application/json',...(reviewAccess?{Authorization:'Bearer '+reviewAccess}:{})},body:JSON.stringify({store_id,activity_id,question}),signal:AbortSignal.timeout(90000)});const body=await response.json();if(!response.ok||body.status!=='SUCCEEDED')throw Error(body.error||'AI调用失败');if(body.scope?.store_id!==store_id||body.scope?.activity_id!==activity_id)throw Error('响应范围不一致，请重试');reviewAnswers.set(key,body);}
 catch(e){reviewError='本次调用未完成：'+e.message+'。业务数据仍可正常查看。';}
 finally{reviewBusy=false;renderReviewAI();}
}
document.addEventListener('click',e=>{if(page==='promo'&&e.target.closest('#btnAi')){e.preventDefault();e.stopImmediatePropagation();runReviewAI();}},true);
const beforeReviewAIRender=render;render=function(){beforeReviewAIRender();if(page==='promo')renderReviewAI();else $('btnAi').onclick=null;};
const reviewStyle=document.createElement('style');reviewStyle.textContent='.review-ai{margin-top:16px}.review-ai label{display:block;font-size:12px;color:#55617a;margin:12px 0}.review-ai input,.review-ai textarea{display:block;width:100%;box-sizing:border-box;padding:10px;border:1px solid #d8e2f4;border-radius:8px;margin-top:5px;background:white;color:#26314e}.review-ai textarea{min-height:76px}.review-ai form{max-width:680px}.review-ai p{font-size:13px;line-height:1.8;white-space:pre-wrap}.review-ai small{display:block;color:#7184a8;overflow-wrap:anywhere}.review-ai h4{font-size:13px;margin:14px 0 5px}.review-pre{max-height:280px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;background:#f5f7fd;padding:12px;font-size:11px}.review-error{color:#b64358;font-size:12px;margin-top:10px}.review-ai button:disabled{opacity:.5}';document.head.append(reviewStyle);
render();checkReviewConnection();
