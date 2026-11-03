import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// 前端交互回归测试：验证首页 AI 助手修复后不再出现内联 onclick 双引号嵌套失效，
// 且事件绑定走 addEventListener + data 属性，数据查询用 query:'data' 正确路由到 bizHTML。
// 这些断言针对源码字符串做静态校验，配合真实浏览器 CDP 验证（见 scripts/verify-browser.mjs）。

const assistantUi = await readFile(new URL('../assistant-ui.js', import.meta.url), 'utf8');
const cockpit = await readFile(new URL('../cockpit.js', import.meta.url), 'utf8');

test('快捷问题按钮不再使用内联 onclick（双引号嵌套失效的根因）', () => {
  // 旧代码：onclick="askInline(${JSON.stringify(x.q)})" 会生成双引号嵌套。
  assert.ok(!/onclick="askInline\(\$\{/.test(assistantUi), 'assistant-ui.js 仍含内联 askInline onclick');
  // 新代码：快捷按钮用 data-q-index + 事件委托
  assert.match(assistantUi, /data-q-index/);
  assert.match(assistantUi, /addEventListener\('click'/);
});

test('快捷按钮事件委托读取 QUICK 数组并调用 askInline(q)', () => {
  // 事件委托用 data-q-index 索引 QUICK，避免把问题文本内联进 HTML。
  assert.match(assistantUi, /data-q-index/);
  assert.match(assistantUi, /QUICK\[idx\]\?\.q/);
  assert.match(assistantUi, /askInline\(q\)/);
});

test('输入框 Enter 与发送按钮均通过 addEventListener 绑定，非内联 onkeydown/onclick', () => {
  // cockpit.js 的输入框/发送按钮应移除内联 onkeydown / onclick，交由 assistant-ui 统一绑定。
  assert.ok(!/onkeydown="if\(event\.key==='Enter'\)askInline\(\)"/.test(cockpit), 'cockpit.js 仍含内联 Enter 绑定');
  assert.ok(!/onclick="askInline\(\)"/.test(cockpit), 'cockpit.js 仍含内联箭头发送绑定');
  // 发送按钮提供 id 供 assistant-ui 绑定
  assert.match(cockpit, /id="inlineChatSend"/);
  // assistant-ui 绑定 Enter 与发送按钮
  assert.match(assistantUi, /e\.key === 'Enter'/);
  assert.match(assistantUi, /\$\('inlineChatSend'\)/);
});

test('经营查询按 query:"data" 路由到 bizHTML（兼容服务端覆盖 kind 的业务子类型）', () => {
  // 服务端 handleBiz 返回 {kind:'biz', ...result}，而 result 内含 kind 业务子类型（underperforming_stores 等）
  // 会覆盖外层 kind，因此前端必须用 query:'data' 判断，而非 kind==='biz'。
  assert.match(assistantUi, /r\.query === 'data'/);
  assert.match(assistantUi, /bizHTML\(r\)/);
});

test('新对话按钮通过 addEventListener 绑定，非内联 onclick', () => {
  assert.ok(!/onclick="assistantNewChat\(\)"/.test(cockpit), 'cockpit.js 仍含内联新对话绑定');
  assert.match(assistantUi, /addEventListener\('click', assistantNewChat\)/);
});

test('事件绑定函数在 render 后调用，且用 dataset.bound 防重复绑定', () => {
  assert.match(assistantUi, /function bindAssistantEvents/);
  assert.match(assistantUi, /dataset\.bound/);
  // render 内调用 bindAssistantEvents（DOM 被 cockpit 重建后可重新绑定）
  assert.match(assistantUi, /bindAssistantEvents\(\)/);
});
