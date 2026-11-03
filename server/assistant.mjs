/* Homepage AI经营助手 endpoint: /api/ai/chat
 * Deterministic BI queries + activity review (reuses /api/ai/review chain) + follow-up.
 * Data queries are computed server-side; the model only explains tool results when needed.
 * Never trusts browser-supplied aggregates, never generates SQL/code, whitelist read-only tools.
 */
import {loadBI, validateFilter, biQuery, runBusinessQuery} from './bi.mjs';
import {createAI, configuration} from './ai.mjs';

const fail = (code, message, status = 400) => Object.assign(new Error(message), {code, status});
const json = (v, status = 200) => Response.json(v, {status, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}});

const round2 = n => Math.round(n * 100) / 100;

// ---------- Intent routing (rule-based, whitelist only) ----------
function detectIntent(q){
  const s = q.replace(/\s+/g, '');
  const review = /复盘|临促|周末活动|活动执行|活动复盘/.test(s);
  const followup = /为什么|还缺|还需要|证据|核查|刚才|上一条|上一轮|执行情况/.test(s) && !review;
  const biz = /达成|预算|销售额|销售|毛利|TE|门店|品类|SKU|表现|排名|差距|目标/.test(s);
  // 复盘优先；追问其次；经营查询兜底。
  if (review) return 'review';
  if (followup) return 'followup';
  if (biz) return 'biz';
  return 'biz'; // 未命中也走经营查询兜底，由工具结果决定
}

function bizIntent(q){
  const s = q.replace(/\s+/g, '');
  if (/达成较差|达成差|预算达成|未达标|达成率|落后|差距|哪些门店.*(达成|预算)/.test(s)) return 'underperforming_stores';
  if (/销售额.*毛利.*TE|毛利.*销售额|当前.*销售额|范围.*销售额|多少.*销售|销售.*多少/.test(s)) return 'totals';
  if (/门店.*(表现|销售|品类|SKU)|这家店|某个店|该店|单店/.test(s)) return 'store_detail';
  if (/品类|SKU|商品.*表现|卖得最好|哪个.*商品/.test(s)) return 'category_sku';
  return 'totals';
}

// ---------- Follow-up: keep confirmed scope, never treat model guesses as facts ----------
function followup(question, session){
  if (!session) {
    return {kind: 'followup', query: 'data', status: 'needs_context', summary: '还没有上一轮分析。请先提出一个经营查询或活动复盘问题。'};
  }
  // We only replay the previously *returned evidence* — not model text as new facts.
  const prev = session.last;
  if (!prev) return {kind: 'followup', query: 'data', status: 'needs_context', summary: '没有可追问的上一条分析。'};
  return {
    kind: 'followup',
    query: 'data',
    status: 'ok',
    summary: '以下是上一轮的已返回证据范围，可据此继续核查。',
    question: question,
    scope: prev.scope,
    // 证据缺口 / 建议核查动作只回放结构，不把模型推测当事实
    gaps: prev.gaps || [],
    actions: prev.actions || [],
    evidence: prev.evidence || [],
    note: '追问只回放上一轮已返回的结构化证据与范围；不把模型推测当作新事实，也不自动补全缺失记录。',
  };
}

export function createAssistant({model, env = {}, fetchImpl = fetch, timeoutMs = 120000}){
  const ai = createAI({model, env, fetchImpl, timeoutMs}); // 复用活动复盘链路
  const bi = loadBI();
  const promos = model; // promo-model 实例：storeActivities / participants / queryStoreActivity
  const config = configuration(env);
  const sessions = new Map(); // sessionId -> {last, history}

  // Resolve store & activity within current filter. Returns candidates when ambiguous.
  function resolveReviewTargets(filter, requestedStore, requestedActivity){
    const {data} = bi;
    const storeIds = new Set(bi.model.selectStores(filter).map(s => s.store_id));
    const promoMonth = a => a.start_date.slice(0, 7);
    // 活动范围必须与当前筛选月份一致（月度 BI 与活动 POS/TPM/SFA 同源不同粒度）。
    const monthMatch = a => !filter.month || filter.month === 'all' || promoMonth(a) === filter.month;
    // 活动参与关系来自 promo 数据；门店需在 BI 数据中也有记录（统一门店标识）。
    let storeCandidates = [];
    if (requestedStore) {
      const s = data.stores.find(x => x.store_id === requestedStore);
      storeCandidates = s ? [s] : [];
    } else {
      // 当前筛选下的门店，且参与过活动
      storeCandidates = data.stores.filter(s => storeIds.has(s.store_id));
    }
    const out = [];
    for (const s of storeCandidates) {
      const acts = promos.storeActivities(s.store_id); // 该店参与的活动
      for (const a of acts) {
        if (!monthMatch(a)) continue;
        if (requestedActivity && a.activity_id !== requestedActivity) continue;
        out.push({store_id: s.store_id, store_name: s.store_name, activity_id: a.activity_id, activity_name: a.activity_name, start_date: a.start_date, end_date: a.end_date});
      }
    }
    return out;
  }

  async function handleReview(body, sessionId){
    // 活动复盘：需要明确的 store_id + activity_id。歧义时返回候选，绝不默认 STORE004。
    const requestedStore = body.store_id;
    const requestedActivity = body.activity_id;
    const vf = validateFilter(body.filter || {});
    if (!vf.ok) return json({status: 'NEEDS_CLARIFY', kind: 'review', error: vf.errors.join('；'), candidates: []}, 400);

    // 若用户在问题中/上下文中已明确门店与活动，先校验该组合是否真实存在，
    // 避免把无效的 store+activity 直接交给 review 链路报错。
    if (requestedStore && requestedActivity) {
      const valid = resolveReviewTargets(vf.filter, requestedStore, requestedActivity);
      if (!valid.length) {
        return json({status: 'NEEDS_CLARIFY', kind: 'review', summary: '指定的门店未参与该活动，或该活动不在当前月份范围。请重新选择。', candidates: []}, 200);
      }
      const reviewReq = new Request('http://localhost/api/ai/review', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', ...(body.auth ? {Authorization: body.auth} : {})},
        body: JSON.stringify({store_id: requestedStore, activity_id: requestedActivity, question: body.question}),
      });
      const resp = await ai(reviewReq);
      const r = await resp.json();
      // 记录会话上下文（回放结构化证据，不存模型文本当事实）
      if (r.status === 'SUCCEEDED') {
        sessions.set(sessionId, {last: {
          kind: 'review', scope: r.scope,
          gaps: (r.answer?.limits || []).filter(x => x.startsWith('证据缺口')).map(x => x.replace('证据缺口：', '')),
          actions: (r.answer?.actions || []).map(a => a.text),
          evidence: r.evidence.map(e => ({id: e.id, source: e.source, type: e.type})),
        }});
        return json({status: 'SUCCEEDED', kind: 'review', ...r});
      }
      return json({status: r.status || 'FAILED', kind: 'review', ...r});
    }

    // 门店/活动未明确 → 返回候选列表供用户选择
    const candidates = resolveReviewTargets(vf.filter, requestedStore, requestedActivity);
    if (!candidates.length) {
      return json({status: 'NEEDS_CLARIFY', kind: 'review', summary: '当前筛选下没有可复盘的门店或活动。', candidates: []}, 200);
    }
    // 若候选唯一，可直接执行
    if (candidates.length === 1 && !requestedActivity && requestedStore) {
      return handleReview({...body, store_id: candidates[0].store_id, activity_id: candidates[0].activity_id}, sessionId);
    }
    const sliced = candidates.slice(0, 12);
    return json({
      status: 'NEEDS_CLARIFY', kind: 'review',
      summary: sliced.length > 1
        ? `当前范围有 ${sliced.length} 个可复盘的门店/活动组合，请选择要复盘的目标。`
        : '请确认要复盘的门店与活动。',
      candidates: sliced.map(c => ({store_id: c.store_id, store_name: c.store_name, activity_id: c.activity_id, activity_name: c.activity_name, start_date: c.start_date, end_date: c.end_date})),
    }, 200);
  }

  async function handleBiz(body, sessionId){
    const vf = validateFilter(body.filter || {});
    if (!vf.ok) return json({status: 'FAILED', kind: 'biz', code: 'INVALID_FILTER', error: vf.errors.join('；'), query: 'data'}, 400);
    const intent = bizIntent(body.question);
    const result = runBusinessQuery(intent, vf.filter);
    // 门店查询但未指定门店 → 澄清候选门店，不默认选
    if (result.kind === 'needs_store') {
      return json({status: 'NEEDS_CLARIFY', kind: 'biz', intent, summary: result.summary, candidates: (result.candidates || []).map(c => ({store_id: c.store_id, store_name: c.store_name, ka_name: c.ka_name}))}, 200);
    }
    // 记录会话（仅确定性结果）
    sessions.set(sessionId, {last: {
      kind: 'biz', intent, scope: result.scope || result.label || '',
      gaps: [], actions: [], evidence: [],
    }});
    // 经营查询为确定性代码计算，标注 data query，不伪装成模型分析
    return json({status: 'SUCCEEDED', kind: 'biz', query: 'data', ...result}, 200);
  }

  async function handle(request){
    const path = new URL(request.url).pathname;
    if (path !== '/api/ai/chat') return json({error: '接口不存在'}, 404);
    if (request.method !== 'POST') return json({error: '仅支持POST'}, 405);
    if (env.DEMO_ACCESS_TOKEN && request.headers.get('authorization') !== `Bearer ${env.DEMO_ACCESS_TOKEN}`) return json({error: '请输入演示访问码', code: 'AUTH_REQUIRED'}, 401);

    let body;
    try {
      if (!request.headers.get('content-type')?.includes('application/json')) throw fail('INVALID_REQUEST', '请使用JSON', 415);
      const text = await request.text();
      if (text.length > 8000) throw fail('BODY_TOO_LARGE', '请求过长', 413);
      body = JSON.parse(text);
    } catch (e) { return json({status: 'FAILED', error: e.code ? e.message : 'JSON格式错误'}, e.status || 400); }

    if (typeof body.question !== 'string' || !body.question.trim()) return json({status: 'FAILED', code: 'INVALID_REQUEST', error: '请输入问题'}, 400);
    if (body.question.length > 1200) return json({status: 'FAILED', code: 'INVALID_REQUEST', error: '问题过长'}, 400);

    const sessionId = typeof body.session_id === 'string' ? body.session_id.slice(0, 64) : 'default';
    const intent = detectIntent(body.question);

    try {
      if (intent === 'review') return await handleReview(body, sessionId);
      if (intent === 'followup') {
        const session = sessions.get(sessionId);
        return json({status: 'SUCCEEDED', kind: 'followup', query: 'data', ...followup(body.question, session)}, 200);
      }
      return await handleBiz(body, sessionId);
    } catch (e) {
      return json({status: 'FAILED', code: e.code || 'INTERNAL_ERROR', error: e.message || '服务异常'}, e.status || 500);
    }
  }

  return handle;
}
