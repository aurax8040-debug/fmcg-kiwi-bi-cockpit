/* Deterministic monthly BI queries over the authoritative server-side dataset.
 * No LLM calls, no browser-supplied aggregates. Currency in integer cents.
 * Loads demo-data/kiwi-bi-monthly.js (KIWI_BI_DATA) and bi-model.js (KiwiBI.create).
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));

const fail = (code, message) => Object.assign(new Error(message), {code});

export const BI_REGIONS = {east:'华东', south:'华南', north:'华北', central:'华中', west:'西部'};

let _bi = null;
export function loadBI(){
  if(_bi) return _bi;
  const sandbox = {};
  // Load data first (defines globalThis.KIWI_BI_DATA), then the model (uses KIWI_BI_DATA).
  vm.runInNewContext(readFileSync(resolve(root, 'demo-data/kiwi-bi-monthly.js'), 'utf8'), sandbox);
  vm.runInNewContext(readFileSync(resolve(root, 'bi-model.js'), 'utf8'), sandbox);
  const data = sandbox.KIWI_BI_DATA;
  const kiwiBI = sandbox.KiwiBI;
  const model = kiwiBI.create(data);
  _bi = {data, model};
  return _bi;
}

const round2 = n => Math.round(n * 100) / 100;
const money = c => c / 100;

// Canonical filter vocabulary. Rejects unknown fields instead of silently ignoring.
const FIELD = {
  month:    {values: () => loadBI().model.months, all: 'all'},
  region:   {values: () => Object.keys(BI_REGIONS), all: 'all'},
  ka:       {values: () => [...new Set(loadBI().data.stores.map(s => s.ka_name))], all: 'all'},
  market:   {values: () => [...new Set(loadBI().data.stores.map(s => s.market_department))], all: 'all'},
  grade:    {values: () => ['A', 'B', 'C'], all: 'all'},
  store:    {values: () => loadBI().data.stores.map(s => s.store_id), all: 'all'},
  category: {values: () => [...new Set(loadBI().data.skus.map(s => s.category))], all: 'all'},
  sku:      {values: () => loadBI().data.skus.map(s => s.sku_id), all: 'all'},
};

// Validate a filter object. Returns {ok, filter, errors[]}. Unknown field names are errors.
export function validateFilter(input = {}) {
  const errors = [];
  const filter = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === '') continue;
    const spec = FIELD[key];
    if (!spec) { errors.push(`不支持的筛选字段：${key}`); continue; }
    if (value === spec.all) { filter[key] = value; continue; }
    if (!spec.values().includes(value)) { errors.push(`筛选「${key}」的值「${value}」不在可用范围内`); continue; }
    filter[key] = value;
  }
  return {ok: errors.length === 0, filter, errors};
}

// Apply the validated filter and summarize. Returns deterministic aggregate + rows.
export function biQuery(filter) {
  const {model, data} = loadBI();
  const view = model.summarize(filter);
  const stores = new Map(data.stores.map(s => [s.store_id, s]));
  const skus = new Map(data.skus.map(s => [s.sku_id, s]));

  const storeRows = view.storeRows.map(s => ({
    store_id: s.store_id,
    store_name: s.name,
    ka_name: s.ka_name,
    war_zone: s.war_zone,
    store_grade: s.store_grade,
    sales: round2(money(s.sales_cents)),
    profit: round2(money(s.profit)),
    te: round2(s.te),
    target: s.target === null ? null : round2(s.target),
    attainment: s.attainment,
    attainment_pct: s.attainment === null ? null : round2(s.attainment * 100),
  }));

  const skuRows = view.skuRows.map(s => ({
    sku_id: s.sku_id,
    sku_name: s.name,
    category: s.category,
    sales: round2(money(s.sales_cents)),
    profit: round2(money(s.profit)),
    te: round2(s.te),
    volume: s.volume,
  }));

  const categoryRows = view.categoryRows.map(c => ({
    category: c.key,
    sales: round2(money(c.sales_cents)),
    profit: round2(money(c.profit)),
    te: round2(c.te),
  }));

  return {
    label: view.label,
    data_type: 'DEMO_MOCK',
    months: view.selectedMonths,
    product_filtered: view.productFiltered,
    total: {
      sales: round2(money(view.sales_cents)),
      profit: round2(money(view.profit)),
      te: round2(view.te),
      volume: view.volume,
      margin_pct: view.sales_cents ? round2((view.sales_cents - view.cost_cents) / view.sales_cents * 100) : null,
      target: view.target === null ? null : round2(view.target),
      attainment_pct: view.attainment === null ? null : round2(view.attainment * 100),
      active_stores: view.active,
      total_stores: view.stores,
    },
    store_rows: storeRows,
    sku_rows: skuRows,
    category_rows: categoryRows,
  };
}

// A deterministic query answering one of the three经营查询 intents.
// Returns a structured result the model (if used) may explain, or the UI renders directly.
export function runBusinessQuery(intent, filter) {
  const q = biQuery(filter);
  const {data, model} = loadBI();

  if (intent === 'underperforming_stores') {
    const rows = q.store_rows.filter(s => s.attainment !== null && s.attainment < 1)
      .sort((a, b) => a.attainment - b.attainment).slice(0, 8);
    return {
      kind: 'underperforming_stores',
      query: 'data',
      summary: rows.length
        ? `当前范围共 ${rows.length} 家门店预算达成率低于 100%（前 ${rows.length} 家按达成率升序）。`
        : '当前范围没有预算达成率低于 100% 的门店。',
      scope: q.label,
      rows: rows.map(s => ({store_id: s.store_id, store_name: s.store_name, ka_name: s.ka_name, war_zone: s.war_zone, sales: s.sales, target: s.target, attainment_pct: s.attainment_pct, gap: s.target === null ? null : round2(s.target - s.sales)})),
      note: '门店预算仅有门店月度粒度；商品筛选下不计算预算达成率。销售差距不能直接解释为执行问题。',
    };
  }

  if (intent === 'totals') {
    return {
      kind: 'totals',
      query: 'data',
      summary: `当前范围销售额 ${q.total.sales.toLocaleString('zh-CN')} 元、商品毛利 ${q.total.profit.toLocaleString('zh-CN')} 元、销售 TE ${q.total.te.toFixed(2)}。`,
      scope: q.label,
      totals: q.total,
      product_filtered: q.product_filtered,
      note: '销售额为终端 Sell-Out 口径；毛利未扣活动费、物流和税费。',
    };
  }

  if (intent === 'store_detail') {
    const storeId = filter.store;
    if (!storeId || storeId === 'all') {
      return {kind: 'needs_store', query: 'data', summary: '请先明确要查看哪一家门店。', candidates: q.store_rows.slice(0, 10).map(s => ({store_id: s.store_id, store_name: s.store_name, ka_name: s.ka_name}))};
    }
    const s = q.store_rows.find(r => r.store_id === storeId);
    if (!s) return {kind: 'empty', query: 'data', summary: '当前范围没有该门店的数据。'};
    const storeSkus = q.sku_rows.slice(0, 8);
    return {
      kind: 'store_detail',
      query: 'data',
      summary: `${s.store_name}（${s.ka_name} · ${s.war_zone}）销售额 ${s.sales.toLocaleString('zh-CN')} 元、商品毛利 ${s.profit.toLocaleString('zh-CN')} 元、销售 TE ${s.te.toFixed(2)}${s.attainment_pct !== null ? `、预算达成率 ${s.attainment_pct}%` : ''}。`,
      scope: q.label,
      store: s,
      skus: storeSkus,
      note: q.product_filtered ? '当前为商品筛选，门店预算达成率不可计算。' : '门店预算为门店月度粒度。',
    };
  }

  if (intent === 'category_sku') {
    return {
      kind: 'category_sku',
      query: 'data',
      summary: '当前范围品类与 SKU 销售表现（按销售额降序）。',
      scope: q.label,
      categories: q.category_rows,
      skus: q.sku_rows.slice(0, 10),
      note: q.product_filtered ? '' : '品类/SKU 下预算仅有门店月度粒度，不计算商品预算达成率。',
    };
  }

  return {kind: 'totals', query: 'data', ...q};
}

export {money, round2};
