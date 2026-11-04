/* 首页 AI 经营助手：对话式经营查询 + 活动复盘 + 追问。
 * 调用同源 /api/ai/chat；经营查询由服务端确定性计算（标注「数据查询」），
 * 活动复盘复用 /api/ai/review（Dify + DeepSeek，标注真实调用）。
 * 不信任前端汇总数字；密钥不进入浏览器；对话内容按文本安全渲染。
 */
(function(){
  const CHAT_KEY='kiwi-assistant-chat-v1';
  // 会话状态：{session_id, messages:[{role,html?,plain,kind,status,data}], pending}
  let state = {session_id: 'assistant-' + Math.random().toString(36).slice(2,10), messages: [], pending: null, busy: false};
  try {
    const saved = JSON.parse(localStorage.getItem(CHAT_KEY) || 'null');
    if (saved && Array.isArray(saved.messages) && saved.session_id) state = saved;
    else state.session_id = 'assistant-' + Math.random().toString(36).slice(2,10);
  } catch { state = {session_id: 'assistant-' + Math.random().toString(36).slice(2,10), messages: [], pending: null, busy: false}; }

  function save(){ try { localStorage.setItem(CHAT_KEY, JSON.stringify({session_id: state.session_id, messages: state.messages.slice(-40)})); } catch {} }

  // 当前筛选（与服务端 validateFilter 词汇一致）
  function currentFilter(){
    return {
      month: $('fRange')?.value || 'all',
      region: $('fRegion')?.value || 'all',
      ka: $('fKa')?.value || 'all',
      market: $('fMarket')?.value || 'all',
      grade: $('fGrade')?.value || 'all',
      store: $('fStore')?.value || 'all',
      category: $('fCategory')?.value || 'all',
      sku: $('fSku')?.value || 'all',
    };
  }
  function scopeText(){
    const f = currentFilter();
    const month = f.month === 'all' ? '完整12个月' : f.month;
    const region = f.region === 'all' ? '全部战区' : (window.biRegions?.[f.region] || f.region);
    const ka = f.ka === 'all' ? '全部KA' : f.ka;
    return `${month} · ${region} · ${ka}`;
  }

  const esc = window.esc || (s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));
  const money = n => n === null || n === undefined ? '—' : Math.round(n).toLocaleString('zh-CN');
  const wan = n => n === null || n === undefined ? '—' : (n/10000).toFixed(2) + ' 万元';
  const pct = n => n === null || n === undefined ? '—' : (Math.round(n*100)/100).toFixed(2) + '%';

  const WELCOME = '我是 AI 经营助手。可以帮你查当前范围的销售、预算达成与商品表现，或复盘某家门店的临促活动。涉及具体门店/活动时，我会在对话里请你选择，不默认选演示案例。';

  const QUICK = [
    { q: '当前哪些门店预算达成较差？', kind: 'biz' },
    { q: '当前范围销售额、毛利、TE 是多少？', kind: 'biz' },
    { q: '帮我复盘一家门店的周末临促', kind: 'review' },
  ];

  // ---------- 渲染 ----------
  // 快捷问题按钮：用 data-q 属性 + 事件委托绑定，避免内联 onclick 双引号嵌套失效。
  function renderQuick(){
    const el = $('assistantQuick');
    if (!el) return;
    el.innerHTML = QUICK.map((x, i) => `<button type="button" class="assistant-quick-btn" data-q-index="${i}">${esc(x.q)}</button>`).join('');
  }

  function renderWelcome(){
    return `<div class="msg bot assistant-welcome">${esc(WELCOME)}</div>`;
  }

  function renderScope(){
    const el = $('dashboardAiScope');
    if (el) el.textContent = '分析范围：' + scopeText();
  }

  function candidateHTML(c, kind){
    if (kind === 'biz') {
      return `<button class="assistant-candidate" data-kind="biz" data-store="${esc(c.store_id)}"><b>${esc(c.store_name)}</b>${c.ka_name?`<span>${esc(c.ka_name)}</span>`:''}</button>`;
    }
    return `<button class="assistant-candidate" data-kind="review" data-store="${esc(c.store_id)}" data-activity="${esc(c.activity_id)}"><b>${esc(c.store_name)}</b><span>${esc(c.activity_name)} · ${esc(c.start_date)}～${esc(c.end_date)}</span></button>`;
  }

  // 经营查询结果（确定性数据，标注「数据查询」）
  function bizHTML(r){
    let body = `<div class="ai-kind data">数据查询 · 服务端计算</div>`;
    if (r.summary) body += `<div class="ai-conclusion">${esc(r.summary)}</div>`;
    if (r.kind === 'underperforming_stores' && Array.isArray(r.rows)) {
      const rows = r.rows.map(s => `<tr><td>${esc(s.store_name)}</td><td>${esc(s.ka_name)}</td><td>${money(s.sales)}</td><td>${money(s.target)}</td><td class="${s.attainment_pct<90?'negative':'positive'}">${pct(s.attainment_pct)}</td><td>${money(s.gap)}</td></tr>`).join('');
      body += `<div class="table-wrap"><table><thead><tr><th>门店</th><th>KA</th><th>销售额</th><th>预算</th><th>达成率</th><th>差距</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    } else if (r.kind === 'store_detail' && r.store) {
      const s = r.store;
      body += `<div class="table-wrap"><table><thead><tr><th>指标</th><th>值</th></tr></thead><tbody>
        <tr><td>销售额</td><td>${money(s.sales)} 元</td></tr>
        <tr><td>商品毛利</td><td>${money(s.profit)} 元</td></tr>
        <tr><td>销售 TE</td><td>${s.te?.toFixed(2) ?? '—'}</td></tr>
        ${s.attainment_pct!==null&&s.attainment_pct!==undefined?`<tr><td>预算达成率</td><td>${pct(s.attainment_pct)}</td></tr>`:''}
      </tbody></table></div>`;
      if (Array.isArray(r.skus) && r.skus.length) {
        body += `<details><summary>该店 SKU 销售表现（按销售额降序）</summary><div class="table-wrap"><table><thead><tr><th>SKU</th><th>品类</th><th>销售额</th><th>TE</th></tr></thead><tbody>${r.skus.map(sk=>`<tr><td>${esc(sk.sku_name)}</td><td>${esc(sk.category)}</td><td>${money(sk.sales)}</td><td>${sk.te?.toFixed(2) ?? '—'}</td></tr>`).join('')}</tbody></table></div></details>`;
      }
    } else if (r.kind === 'category_sku' && (r.categories || r.skus)) {
      if (r.categories?.length) body += `<details open><summary>品类销售表现</summary><div class="table-wrap"><table><thead><tr><th>品类</th><th>销售额</th><th>毛利</th><th>TE</th></tr></thead><tbody>${r.categories.map(c=>`<tr><td>${esc(c.category)}</td><td>${money(c.sales)}</td><td>${money(c.profit)}</td><td>${c.te?.toFixed(2) ?? '—'}</td></tr>`).join('')}</tbody></table></div></details>`;
      if (r.skus?.length) body += `<details><summary>SKU 销售 TOP10</summary><div class="table-wrap"><table><thead><tr><th>SKU</th><th>品类</th><th>销售额</th><th>TE</th></tr></thead><tbody>${r.skus.map(sk=>`<tr><td>${esc(sk.sku_name)}</td><td>${esc(sk.category)}</td><td>${money(sk.sales)}</td><td>${sk.te?.toFixed(2) ?? '—'}</td></tr>`).join('')}</tbody></table></div></details>`;
    } else if (r.kind === 'totals' && r.totals) {
      const t = r.totals;
      body += `<div class="table-wrap"><table><thead><tr><th>指标</th><th>值</th></tr></thead><tbody>
        <tr><td>销售额</td><td>${money(t.sales)} 元</td></tr>
        <tr><td>商品毛利</td><td>${money(t.profit)} 元</td></tr>
        <tr><td>毛利率</td><td>${t.margin_pct===null?'—':t.margin_pct+'%'}</td></tr>
        <tr><td>销售 TE</td><td>${t.te?.toFixed(2) ?? '—'}</td></tr>
        ${t.attainment_pct!==null&&t.attainment_pct!==undefined?`<tr><td>预算达成率</td><td>${pct(t.attainment_pct)}</td></tr>`:''}
      </tbody></table></div>`;
    }
    if (r.note) body += `<div class="ai-note">${esc(r.note)}</div>`;
    if (r.scope) body += `<div class="ai-scope">${esc(r.scope)}</div>`;
    return body;
  }

  // 活动复盘结果（真实调用）
  function reviewHTML(r){
    const a = r.answer || {};
    let body = `<div class="ai-kind model">真实调用 · ${esc(r.ai?.provider || 'AI 复盘')}</div>`;
    if (r.rag?.status === 'RETRIEVED') body += `<div class="ai-rag">知识检索：命中 ${r.rag.citations?.length || 0} 条</div>`;
    if (a.summary) body += `<div class="ai-conclusion">${esc(a.summary)}</div>`;
    const sec = (label, list) => Array.isArray(list) && list.length ? `<div class="ai-sec"><b>${label}</b>${list.map(v => `<div class="ai-item">${esc(v.text)}${Array.isArray(v.evidenceIds) && v.evidenceIds.length ? ` <small>${v.evidenceIds.map(esc).join(' · ')}</small>` : ''}</div>`).join('')}</div>` : '';
    body += sec('已知事实', a.facts);
    body += sec('待验证假设', a.hypotheses);
    body += sec('建议核查动作', a.actions);
    if (Array.isArray(a.limits) && a.limits.length) body += `<div class="ai-sec"><b>判断边界</b><ul>${a.limits.map(v=>`<li>${esc(v)}</li>`).join('')}</ul></div>`;
    if (Array.isArray(r.evidence) && r.evidence.length) {
      body += `<details><summary>核对实际返回的证据与引用（${r.evidence.length} 条）</summary><div class="ai-evidence">${r.evidence.map(e=>`<div class="ai-ev">${esc(e.id)} · ${esc(e.source)}${e.type==='knowledge'?(' · '+esc(e.document_name||'')):''}</div>`).join('')}</div></details>`;
    }
    if (r.ai?.request_id) body += `<div class="ai-scope">工作流运行 ID：${esc(r.ai.request_id)}${r.ai?.usage?.total_tokens!=null?` · Tokens ${r.ai.usage.total_tokens}`:''}</div>`;
    return body;
  }

  // 澄清（门店/活动选择）
  function clarifyHTML(r){
    const kind = r.kind;
    let body = `<div class="ai-kind clarify">${kind === 'biz' ? '请选择要查看的门店' : '请选择要复盘的目标'}</div>`;
    if (r.summary) body += `<div class="ai-conclusion">${esc(r.summary)}</div>`;
    if (Array.isArray(r.candidates) && r.candidates.length) {
      body += `<div class="assistant-candidates">${r.candidates.slice(0,12).map(c => candidateHTML(c, kind)).join('')}</div>`;
      if (r.candidates.length > 12) body += `<div class="ai-note">仅显示前 12 个候选，可在输入中直接指定门店或活动。</div>`;
    } else {
      body += `<div class="ai-note">当前筛选下没有可选项，请调整上方筛选。</div>`;
    }
    return body;
  }

  // 追问回放（只回放已返回证据，不把模型推测当事实）
  function followupHTML(r){
    let body = `<div class="ai-kind data">追问 · 基于上一轮已返回证据</div>`;
    if (r.summary) body += `<div class="ai-conclusion">${esc(r.summary)}</div>`;
    if (r.scope) body += `<div class="ai-scope">上一轮范围：${esc(typeof r.scope==='object'?JSON.stringify(r.scope):r.scope)}</div>`;
    if (Array.isArray(r.actions) && r.actions.length) body += `<div class="ai-sec"><b>建议核查动作</b><ul>${r.actions.map(a=>`<li>${esc(a)}</li>`).join('')}</ul></div>`;
    if (Array.isArray(r.gaps) && r.gaps.length) body += `<div class="ai-sec"><b>证据缺口</b><ul>${r.gaps.map(g=>`<li>${esc(g)}</li>`).join('')}</ul></div>`;
    if (Array.isArray(r.evidence) && r.evidence.length) body += `<details><summary>已返回证据（${r.evidence.length} 条）</summary><div class="ai-evidence">${r.evidence.map(e=>`<div class="ai-ev">${esc(e.id)} · ${esc(e.source)}</div>`).join('')}</div></details>`;
    if (r.note) body += `<div class="ai-note">${esc(r.note)}</div>`;
    return body;
  }

  function errorHTML(msg, retryable){
    const retryBtn = retryable ? `<button type="button" class="assistant-retry-btn" data-retry="1">↻ 重试</button>` : '';
    return `<div class="ai-kind error">本次未完成</div><div class="ai-conclusion">${esc(msg)}</div><div class="ai-note">可点击重试，不会自动重复计费。${retryBtn}</div>`;
  }

  function render(){
    const b = $('inlineChatBody');
    if (!b) return;
    renderQuick();
    renderScope();
    bindAssistantEvents();
    const msgs = state.messages.length ? state.messages.map(m => {
      if (m.role === 'user') return `<div class="msg user">${esc(m.text)}</div>`;
      return `<div class="msg bot assistant-answer">${m.html || ''}</div>`;
    }).join('') : renderWelcome();
    b.innerHTML = msgs;
    // 绑定澄清候选按钮
    b.querySelectorAll('.assistant-candidate').forEach(btn => {
      btn.addEventListener('click', () => {
        if (state.busy) return;
        const kind = btn.dataset.kind;
        const store_id = btn.dataset.store, activity_id = btn.dataset.activity;
        const storeName = btn.querySelector('b')?.textContent || store_id;
        if (kind === 'biz') {
          // 门店详情查询：带 store 重新查询
          askInline(`查看门店 ${storeName} 的品类与 SKU 表现`, {store_id});
        } else {
          const actName = btn.querySelector('span')?.textContent || activity_id;
          askInline(`复盘活动：${storeName} · ${actName}`, {store_id, activity_id});
        }
      });
    });
    // 绑定重试按钮：复用上次失败时的原始问题与门店/活动
    b.querySelectorAll('.assistant-retry-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (state.busy) return;
        const f = state.lastFailed;
        if (!f || !f.question) return;
        askInline(f.question, { store_id: f.store_id, activity_id: f.activity_id });
      });
    });
    b.scrollTop = b.scrollHeight;
  }

  // ---------- 发送 ----------
  async function askInline(q, extra){
    const inp = $('inlineChatInput'), b = $('inlineChatBody');
    const v = (q || inp.value || '').trim();
    if (!v || state.busy) return;
    if (!q && inp) inp.value = '';
    state.busy = true;

    const question = extra ? v : v;
    const store_id = extra?.store_id;
    const activity_id = extra?.activity_id;

    // 追加用户消息 + loading
    state.messages.push({role: 'user', text: v});
    save();
    render();
    b.insertAdjacentHTML('beforeend', `<div class="msg bot" data-loading><span class="assistant-loading">查询中…</span></div>`);
    b.scrollTop = b.scrollHeight;

    try {
      const filter = currentFilter();
      // 门店详情（biz，无 activity）→ 把门店写入筛选；活动复盘（review）→ 用 body.store_id/activity_id
      if (extra?.store_id && !extra?.activity_id) filter.store = extra.store_id;
      const body = { question, session_id: state.session_id, filter };
      if (extra?.activity_id) { body.store_id = extra.store_id; body.activity_id = extra.activity_id; }
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(200000),
      });
      const r = await response.json().catch(() => ({}));
      const loading = b.querySelector('[data-loading]');
      if (loading) loading.remove();

      let html = '';
      if (r.status === 'SUCCEEDED') {
        // 经营查询带 query:'data'（kind 可能被服务端覆盖为具体业务子类型，如 underperforming_stores/totals/store_detail/category_sku）
        if (r.query === 'data' || r.kind === 'biz') html = bizHTML(r);
        else if (r.kind === 'review') html = reviewHTML(r);
        else if (r.kind === 'followup') html = followupHTML(r);
        else html = `<div class="ai-conclusion">${esc(r.summary || '已完成分析')}</div>`;
      } else if (r.status === 'NEEDS_CLARIFY') {
        html = clarifyHTML(r);
      } else {
        // 失败：保留原始问题与门店/活动，供手动重试（重试时复用同一 scope，不丢用户已选目标）
        state.lastFailed = { question: v, store_id, activity_id };
        // 区分失败阶段，给出可操作的提示（知识库检索失败 vs 工作流调用失败）
        let errMsg = r.error || '服务返回异常';
        if (r.rag?.status === 'FAILED' || r.code === 'Dify_CONNECTION_ERROR') errMsg = '知识库检索失败：' + errMsg;
        else if (r.code === 'DifyWorkflow_CONNECTION_ERROR' || r.code === 'DIFY_WORKFLOW_FAILED') errMsg = '工作流调用失败：' + errMsg;
        html = errorHTML(errMsg, true);
      }
      state.messages.push({role: 'bot', html, text: r.summary || r.error || ''});
      save();
    } catch (e) {
      const loading = b.querySelector('[data-loading]');
      if (loading) loading.remove();
      const msg = e.name === 'TimeoutError' ? '请求超时，请稍后重试' : ('AI 暂时不可用：' + e.message);
      state.lastFailed = { question: v, store_id, activity_id };
      state.messages.push({role: 'bot', html: errorHTML(msg, true), text: msg});
      save();
    } finally {
      state.busy = false;
      render();
      inp?.focus();
    }
  }

  function assistantNewChat(){
    state = {session_id: 'assistant-' + Math.random().toString(36).slice(2,10), messages: [], pending: null, busy: false};
    save();
    render();
    if (typeof doAction === 'function') doAction('已开始新对话');
  }

  // 统一事件绑定：快捷问题、输入 Enter、箭头发送、新对话。
  // 全部走 addEventListener + 事件委托，避免内联 onclick/onkeydown 的双引号嵌套失效，
  // 也避免与 cockpit.js 旧内联属性重复触发。
  function bindAssistantEvents(){
    const quickEl = $('assistantQuick');
    if (quickEl && !quickEl.dataset.bound) {
      quickEl.dataset.bound = '1';
      quickEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.assistant-quick-btn');
        if (!btn || state.busy) return;
        const idx = Number(btn.dataset.qIndex);
        const q = QUICK[idx]?.q;
        if (q) askInline(q);
      });
    }
    const inp = $('inlineChatInput');
    if (inp && !inp.dataset.bound) {
      inp.dataset.bound = '1';
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (!state.busy) askInline();
        }
      });
    }
    const sendBtn = $('inlineChatSend');
    if (sendBtn && !sendBtn.dataset.bound) {
      sendBtn.dataset.bound = '1';
      sendBtn.addEventListener('click', () => { if (!state.busy) askInline(); });
    }
    const newBtn = $('assistantNewChat');
    if (newBtn && !newBtn.dataset.bound) {
      newBtn.dataset.bound = '1';
      newBtn.addEventListener('click', assistantNewChat);
    }
  }

  // 覆盖 cockpit.js 的全局函数（chat-inline 的 input/button 与 render 链都引用全局 askInline / renderDashboardChat）
  window.askInline = askInline;
  window.renderDashboardChat = render;
  window.assistantNewChat = assistantNewChat;

  // 注入样式
  const style = document.createElement('style');
  style.textContent = `
  .chat-inline .chat-inline-body{max-height:420px;overflow-y:auto;display:flex;flex-direction:column;gap:10px;padding:6px 2px;}
  .chat-inline .chat-scope{font-size:11.5px;color:#7a8699;margin-bottom:8px;}
  .chat-inline .msg{max-width:95%;}
  .assistant-quick-btn{display:inline-block;font-size:12px;color:#2f6bff;background:#eef3ff;border:1px solid #cfdcff;border-radius:16px;padding:5px 12px;margin:0 6px 6px 0;cursor:pointer;}
  .assistant-quick-btn:hover{background:#e2ebff;}
  .assistant-toolbar{display:flex;justify-content:flex-end;margin-top:8px;}
  .assistant-new{font-size:11.5px;color:#7a8699;background:none;border:1px solid #e8edf5;border-radius:6px;padding:4px 10px;cursor:pointer;}
  .assistant-retry-btn{display:inline-block;font-size:11.5px;color:#2f6bff;background:#eef3ff;border:1px solid #cfdcff;border-radius:6px;padding:3px 10px;margin-top:6px;cursor:pointer;}
  .assistant-retry-btn:hover{background:#e2ebff;}
  .assistant-new:hover{color:#2f6bff;border-color:#cfdcff;}
  .assistant-answer .ai-kind{font-size:11px;display:inline-block;border-radius:4px;padding:1px 7px;margin-bottom:6px;}
  .assistant-answer .ai-kind.data{background:#e8f5e9;color:#2ba471;}
  .assistant-answer .ai-kind.model{background:#eef3ff;color:#2f6bff;}
  .assistant-answer .ai-kind.clarify{background:#fff3e0;color:#b36b00;}
  .assistant-answer .ai-kind.error{background:#fdecea;color:#e34d4d;}
  .assistant-answer .ai-conclusion{font-size:13px;line-height:1.7;color:#1a2233;margin-bottom:6px;white-space:pre-wrap;}
  .assistant-answer .ai-scope{font-size:11px;color:#7a8699;margin-top:6px;}
  .assistant-answer .ai-note{font-size:11.5px;color:#7a8699;margin-top:6px;line-height:1.6;}
  .assistant-answer .ai-rag{font-size:11px;color:#2ba471;margin-bottom:4px;}
  .assistant-answer .ai-sec{margin-top:8px;font-size:12.5px;}
  .assistant-answer .ai-sec b{color:#33415c;}
  .assistant-answer .ai-sec ul,.assistant-answer .ai-sec ol{margin:4px 0 0 18px;line-height:1.7;}
  .assistant-answer .ai-item{line-height:1.7;color:#55617a;}
  .assistant-answer .ai-item small{color:#98a4b8;display:block;overflow-wrap:anywhere;}
  .assistant-answer .ai-evidence{max-height:180px;overflow-y:auto;background:#f5f8ff;border-radius:8px;padding:8px 10px;}
  .assistant-answer .ai-ev{font-size:11px;color:#55617a;padding:2px 0;overflow-wrap:anywhere;}
  .assistant-candidates{display:grid;gap:6px;margin-top:6px;}
  .assistant-candidate{display:flex;flex-direction:column;gap:2px;text-align:left;font-size:12.5px;background:#fff;border:1px solid #e8edf5;border-radius:8px;padding:8px 10px;cursor:pointer;}
  .assistant-candidate:hover{border-color:#2f6bff;background:#f5f8ff;}
  .assistant-candidate b{color:#1a2233;}
  .assistant-candidate span{font-size:11px;color:#7a8699;}
  .assistant-loading{color:#7a8699;font-size:12px;}
  .assistant-answer .table-wrap{max-height:280px;overflow:auto;}
  .assistant-answer details{margin-top:6px;}
  .assistant-answer details summary{font-size:12px;color:#2f6bff;}
  .assistant-answer .negative{color:#e34d4d;}
  .assistant-answer .positive{color:#2ba471;}
  `;
  document.head.append(style);

  // 首次渲染 + 绑定事件
  bindAssistantEvents();
  render();
})();
