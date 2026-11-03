#!/usr/bin/env node
/* 真实浏览器交互验证：用 Chrome DevTools Protocol 驱动 headless Chrome，
 * 验证首页 AI 助手三种交互（快捷按钮点击 / Enter 发送 / 箭头发送）都能发出 /api/ai/chat，
 * 并在页面显示结果。用于「不能只验证接口测试」的浏览器级回归。
 *
 * 前置：后端已启动（HOST=127.0.0.1 PORT=8788 node server/start.mjs）。
 * 运行：node scripts/verify-browser.mjs
 */
import { spawn } from 'node:child_process';

const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8788/';
const PORT = 9336;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=/tmp/kiwi-chrome-verify-${Date.now()}`,
  'about:blank',
], { stdio: 'ignore' });

async function getJson(u) { const r = await fetch(u); return r.json(); }

async function main() {
  let targets = null;
  for (let i = 0; i < 30; i++) {
    try { targets = await getJson(`http://127.0.0.1:${PORT}/json`); break; } catch { await sleep(500); }
  }
  if (!targets) throw new Error('CDP 未就绪（Chrome headless 启动失败）');
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));

  let id = 0;
  const pending = new Map();
  let chatReqCount = 0;
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
    if (m.method === 'Network.requestWillBeSent' && m.params.request.url.includes('/api/ai/chat')) chatReqCount++;
  };
  const send = (method, params = {}) => new Promise((res) => {
    const mid = ++id; pending.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

  await send('Network.enable');
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: BASE });
  await sleep(6000);

  const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;

  // 前置断言：快捷按钮渲染、无内联 onclick、发送按钮/输入框存在
  const structure = await evalJs(`(() => {
    const btns = [...document.querySelectorAll('#assistantQuick .assistant-quick-btn')];
    return {
      quickCount: btns.length,
      hasInlineOnclick: btns.some(b => b.hasAttribute('onclick')),
      sendBtn: !!document.querySelector('#inlineChatSend'),
      input: !!document.querySelector('#inlineChatInput'),
    };
  })()`);
  console.log('📋 结构检查:', JSON.stringify(structure));
  if (!structure.quickCount || structure.hasInlineOnclick || !structure.sendBtn || !structure.input) {
    throw new Error('结构检查失败：快捷按钮缺失或仍含内联 onclick，或发送控件缺失');
  }

  // 测试1：快捷按钮点击
  await send('Runtime.evaluate', { expression: `document.querySelector('#assistantQuick .assistant-quick-btn').click()` });
  await sleep(3000);
  const t1 = await evalJs(`document.querySelector('#inlineChatBody').textContent.includes('数据查询')`);
  console.log('【快捷按钮】请求数:', chatReqCount, '| 结果:', t1 ? '✅ 成功' : '❌ 失败');

  // 测试2：输入框 Enter
  const b2 = chatReqCount;
  await send('Runtime.evaluate', { expression: `(()=>{ const i=document.querySelector('#inlineChatInput'); i.value='当前范围销售额、毛利、TE 是多少？'; i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); })()` });
  await sleep(3000);
  const t2 = await evalJs(`document.querySelector('#inlineChatBody').textContent.includes('销售额')`);
  console.log('【Enter 发送】请求增量:', chatReqCount - b2, '| 结果:', t2 ? '✅ 成功' : '❌ 失败');

  // 测试3：箭头发送
  const b3 = chatReqCount;
  await send('Runtime.evaluate', { expression: `(()=>{ const i=document.querySelector('#inlineChatInput'); i.value='当前哪些门店预算达成较差？'; document.querySelector('#inlineChatSend').click(); })()` });
  await sleep(3000);
  const t3 = await evalJs(`document.querySelector('#inlineChatBody').textContent.includes('数据查询')`);
  console.log('【箭头发送】请求增量:', chatReqCount - b3, '| 结果:', t3 ? '✅ 成功' : '❌ 失败');

  console.log(`=== 总计 /api/ai/chat 请求 ${chatReqCount} 次 ===`);
  const ok = t1 && t2 && t3 && chatReqCount >= 3;
  ws.close();
  chrome.kill();
  if (!ok) { console.error('❌ 浏览器交互验证未全部通过'); process.exit(1); }
  console.log('✅ 三种交互方式均通过真实浏览器验证');
}

main().catch((e) => { console.error('❌ 失败:', e.message); chrome.kill(); process.exit(1); });
