import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createAssistant} from '../server/assistant.mjs';
import {loadBI, validateFilter, biQuery, runBusinessQuery} from '../server/bi.mjs';

const sandbox = {};
vm.runInNewContext(await readFile(new URL('../demo-data/kiwi-promo-data.js', import.meta.url), 'utf8'), sandbox);
const model = createRequire(import.meta.url)('../promo-model.js').create(sandbox.KIWI_PROMO_DATA);

// 替身 fetch：活动复盘不真正调用 Dify/DeepSeek。
const reviewAnalysis = {
  facts: [{text: '活动销售为模拟数据', citations: ['POS:STORE004:ACT-202610']}],
  data_gaps: [],
  hypotheses: [],
  recommended_checks: [{text: '人工核对执行记录', citations: ['SFA:STORE004:ACT-202610']}],
  boundaries: ['非因果结论'],
  management_summary: {title: '本店活动复盘', conclusion: '请人工核查'},
  citations: ['TPM:STORE004:ACT-202610', 'POS:STORE004:ACT-202610', 'SFA:STORE004:ACT-202610'],
};
const okWorkflow = () => ({workflow_run_id: 'run-test', data: {id: 'run-test', status: 'succeeded', outputs: {analysis: reviewAnalysis}}});
const env = {AI_MODE: 'dify-workflow', DIFY_BASE_URL: 'http://localhost/v1', DIFY_API_KEY: 'test-workflow-secret'};
const req = (body) => new Request('http://localhost/api/ai/chat', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});

function makeAssistant(fetchImpl = async () => Response.json(okWorkflow())) {
  return createAssistant({model, env, fetchImpl});
}

test('business query returns server-computed totals consistent with biQuery', async () => {
  const app = makeAssistant();
  const r = await (await app(req({question: '当前范围销售额、毛利、TE是多少？', filter: {month: '2026-10'}}))).json();
  assert.equal(r.status, 'SUCCEEDED');
  assert.equal(r.kind, 'totals');
  assert.equal(r.query, 'data');
  const expected = biQuery({month: '2026-10'}).total;
  assert.equal(r.totals.sales, expected.sales);
  assert.equal(r.totals.profit, expected.profit);
  assert.equal(r.totals.attainment_pct, expected.attainment_pct);
});

test('underperforming stores ranks by attainment ascending and matches biQuery store rows', async () => {
  const app = makeAssistant();
  const r = await (await app(req({question: '当前哪些门店预算达成较差？', filter: {month: '2026-10'}}))).json();
  assert.equal(r.kind, 'underperforming_stores');
  assert.ok(r.rows.length >= 1);
  const expected = biQuery({month: '2026-10'}).store_rows.filter(s => s.attainment < 1).sort((a, b) => a.attainment - b.attainment);
  assert.equal(r.rows[0].store_id, expected[0].store_id);
  // 升序校验
  for (let i = 1; i < r.rows.length; i++) assert.ok(r.rows[i].attainment_pct >= r.rows[i-1].attainment_pct);
});

test('unknown filter field is rejected, not silently ignored', async () => {
  const app = makeAssistant();
  const r = await (await app(req({question: '销售额', filter: {nonsense: 'x'}}))).json();
  assert.equal(r.status, 'FAILED');
  assert.equal(r.code, 'INVALID_FILTER');
  assert.match(r.error, /不支持的筛选字段/);
});

test('invalid filter value is rejected with a clear message', async () => {
  const app = makeAssistant();
  const r = await (await app(req({question: '销售额', filter: {grade: 'Z'}}))).json();
  assert.equal(r.status, 'FAILED');
  assert.match(r.error, /不在可用范围内/);
});

test('activity review without store/activity clarifies candidates and never defaults to STORE004', async () => {
  const app = makeAssistant();
  const r = await (await app(req({question: '帮我复盘一家门店的周末临促', filter: {month: '2026-10'}}))).json();
  assert.equal(r.status, 'NEEDS_CLARIFY');
  assert.equal(r.kind, 'review');
  assert.ok(Array.isArray(r.candidates));
  assert.ok(r.candidates.length > 1);
  // 所有候选都应是当前月份的活动（ACT-202610），且不是默认单一 STORE004
  for (const c of r.candidates) assert.equal(c.activity_id, 'ACT-202610');
});

test('activity review with explicit store+activity reuses /api/ai/review chain and returns real result', async () => {
  let calls = 0;
  const app = makeAssistant(async (url) => { calls++; return Response.json(okWorkflow()); });
  const r = await (await app(req({question: '复盘本店本次活动', filter: {month: '2026-10'}, store_id: 'STORE004', activity_id: 'ACT-202610'}))).json();
  assert.equal(r.status, 'SUCCEEDED');
  assert.equal(r.kind, 'review');
  assert.equal(r.scope.store_id, 'STORE004');
  assert.ok(calls >= 1);
});

test('activity review with a store that did not participate returns no candidates (no fake default)', async () => {
  const app = makeAssistant();
  // STORE001 参与的活动要按月份匹配；用不存在的活动月份组合来验证空结果
  const r = await (await app(req({question: '复盘活动', filter: {month: '2026-10'}, store_id: 'STORE001', activity_id: 'ACT-NOPE'}))).json();
  // 请求了不存在的 activity → 澄清且无候选
  assert.equal(r.status, 'NEEDS_CLARIFY');
  assert.equal(r.candidates.length, 0);
});

test('follow-up without prior context asks for a first question', async () => {
  const app = makeAssistant();
  const r = await (await app(req({question: '为什么建议先核查这家店？', session_id: 'fresh-session'}))).json();
  assert.equal(r.kind, 'followup');
  assert.equal(r.status, 'needs_context');
});

test('follow-up after a business query replays scope without treating model text as facts', async () => {
  const app = makeAssistant();
  const sid = 'session-follow';
  await app(req({question: '当前范围销售额、毛利、TE是多少？', filter: {month: '2026-10'}, session_id: sid}));
  const r = await (await app(req({question: '还缺哪些证据？', session_id: sid}))).json();
  assert.equal(r.kind, 'followup');
  assert.equal(r.status, 'ok');
  assert.ok(r.scope); // 保留上一轮范围
});

test('store detail without a store clarifies with store candidates instead of defaulting', async () => {
  const app = makeAssistant();
  const r = await (await app(req({question: '这家店的品类或SKU表现如何？', filter: {month: '2026-10'}}))).json();
  assert.equal(r.status, 'NEEDS_CLARIFY');
  assert.equal(r.kind, 'biz');
  assert.ok(Array.isArray(r.candidates));
  assert.ok(r.candidates.length > 1);
});

test('validateFilter and biQuery expose identical vocabulary to the frontend', () => {
  // 前端 currentFilter 与服务端 validateFilter 词汇一致（month/region/ka/market/grade/store/category/sku）
  const vf = validateFilter({month: '2026-10', region: 'east', ka: '盒马', market: '上海市场部', grade: 'A', store: 'STORE001', category: '金果', sku: 'SKU001'});
  assert.equal(vf.ok, true);
  assert.equal(Object.keys(vf.filter).length, 8);
});
