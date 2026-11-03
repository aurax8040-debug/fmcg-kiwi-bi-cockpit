import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
// 首页 AI 助手已由 assistant-ui.js 接管为真实对话；renderDashboardAI 现在是空操作，
// 不再禁用首页输入框、不再强制跳转活动复盘页、也不再向助手注入提示。
const source=readFileSync(new URL('../ai-review.js',import.meta.url),'utf8');
const fn=source.slice(source.indexOf('function renderDashboardAI'),source.indexOf('function reviewEvidenceHTML'));

test('renderDashboardAI is a no-op: never disables the homepage input or forces a jump',()=>{
 const nodes={inlineChatBody:{innerHTML:'',append(){},querySelector:()=>null},inlineChatInput:{}};
 let opened=false;
 vm.runInNewContext(fn+';renderDashboardAI();',{page:'dash',reviewConnection:{configured:true},reviewError:'',esc:s=>s,$:id=>nodes[id],document:{querySelector:()=>null},promoActivity:'A',promoStore:'S',openPromoReview:(...a)=>opened=a});
 assert.notEqual(nodes.inlineChatInput.disabled,true);
 assert.equal(opened,false);
 assert.equal(nodes.inlineChatBody.innerHTML,'');
});

test('renderDashboardAI leaves the homepage assistant body untouched regardless of connection state',()=>{
 const nodes={inlineChatBody:{innerHTML:'kept',append(){},querySelector:()=>null},inlineChatInput:{}};
 vm.runInNewContext(fn+';renderDashboardAI();',{page:'dash',reviewConnection:null,reviewError:'err',esc:s=>s,$:id=>nodes[id],document:{querySelector:()=>null}});
 assert.equal(nodes.inlineChatBody.innerHTML,'kept');
});
