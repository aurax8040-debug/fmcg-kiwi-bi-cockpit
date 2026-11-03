import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../ai-review.js',import.meta.url),'utf8');
const fn=source.slice(source.indexOf('function renderDashboardAI'),source.indexOf('function reviewEvidenceHTML'));
function render(connection){
 const nodes={inlineChatBody:{innerHTML:'',append(){}},inlineChatInput:{},dashboardOpenReview:{}};
 const quick={};let opened;
 vm.runInNewContext(fn+';renderDashboardAI();',{page:'dash',reviewConnection:connection,reviewError:'',esc:s=>s,$:id=>nodes[id],document:{querySelector:()=>quick},promoActivity:'A',promoStore:'S',openPromoReview:(...args)=>opened=args});
 nodes.dashboardOpenReview.onclick();assert.deepEqual(opened,['A','S']);
 assert.equal(nodes.inlineChatInput.disabled,true);
 return nodes.inlineChatBody.innerHTML;
}
test('dashboard configured state does not imply successful model call',()=>{const html=render({configured:true});assert.match(html,/配置就绪/);assert.match(html,/验证本次/);assert.doesNotMatch(html,/真实调用成功|尚未接入/);});
test('dashboard distinguishes unreachable backend and missing configuration',()=>{assert.match(render(null),/尚未检测到/);assert.match(render({configured:false}),/配置尚未齐全/);});
