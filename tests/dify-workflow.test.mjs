import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createAI} from '../server/ai.mjs';
const sandbox={};vm.runInNewContext(await readFile(new URL('../demo-data/kiwi-promo-data.js',import.meta.url),'utf8'),sandbox);
const model=createRequire(import.meta.url)('../promo-model.js').create(sandbox.KIWI_PROMO_DATA);
const env={AI_MODE:'dify-workflow',DIFY_API_KEY:'test-workflow-secret',DIFY_BASE_URL:'http://localhost/v1'};
const request=(question='复盘本次活动')=>new Request('http://localhost/api/ai/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({store_id:'STORE004',activity_id:'ACT-202610',question})});
const evidenceId='POS:STORE004:ACT-202610';
const legacy=()=>({facts:[{text:'本次销售为模拟业务数据',citations:[evidenceId]}],data_gaps:[],hypotheses:[],recommended_checks:[{text:'人工核对活动证据',citations:[evidenceId]}],boundaries:['非因果结论'],management_summary:{title:'本店活动复盘',conclusion:'请人工核查'},citations:[evidenceId]});
const workflow=analysis=>({workflow_run_id:'workflow-run-test',data:{id:'workflow-run-test',status:'succeeded',outputs:{analysis},total_tokens:155}});
test('existing workflow runs with only its app key and the five observed inputs',async()=>{
 const calls=[];const app=createAI({model,env,fetchImpl:async(url,opt)=>{calls.push({url,opt});return Response.json(workflow(legacy()));}});
 const response=await app(request()),r=await response.json();assert.equal(response.status,200);assert.equal(calls.length,1);assert.equal(calls[0].url,'http://localhost/v1/workflows/run');assert.equal(calls[0].opt.headers.Authorization,'Bearer test-workflow-secret');
 const sent=JSON.parse(calls[0].opt.body);assert.deepEqual(Object.keys(sent.inputs).sort(),['activity_id','data_version','evidence_json','question','role']);assert.equal(sent.response_mode,'blocking');const evidence=JSON.parse(sent.inputs.evidence_json);assert.equal(evidence.data_version,sent.inputs.data_version);assert.equal(evidence.scope.store_id,'STORE004');assert.ok(evidence.trace_ids.includes(evidenceId));assert.ok(!JSON.stringify(r).includes('test-workflow-secret'));
 assert.equal(r.ai.provider,'Dify Workflow');assert.equal(r.ai.model,null);assert.equal(r.ai.request_id,'workflow-run-test');assert.equal(r.ai.usage.total_tokens,155);assert.equal(r.rag.status,'NOT_CONFIGURED');assert.ok(r.answer.limits.some(x=>x.includes('尚未连接')));assert.equal(r.trace.at(-1).tool,'Dify.workflow');
});
test('workflow status distinguishes configured application from absent RAG and unverified model',async()=>{const app=createAI({model,env});const r=await(await app(new Request('http://localhost/api/ai/status'))).json();assert.equal(r.configured,true);assert.equal(r.workflow,true);assert.equal(r.deepseek,false);assert.equal(r.rag,false);assert.equal(r.live_verified,false);});
test('optional real-shaped retrieval is passed to the existing workflow without a second model call',async()=>{
 const calls=[];const app=createAI({model,env:{...env,DIFY_DATASET_API_KEY:'test-dataset-secret',DIFY_DATASET_ID:'dataset-id'},fetchImpl:async(url,opt)=>{calls.push({url,opt});return url.endsWith('/retrieve')?Response.json({records:[{segment:{id:'segment1',document_id:'document1',document:{name:'规范'},content:'核查要求'}}]}):Response.json(workflow(legacy()));}});
 const r=await(await app(request())).json();assert.equal(calls.length,2);assert.equal(r.rag.status,'RETRIEVED');const evidence=JSON.parse(JSON.parse(calls[1].opt.body).inputs.evidence_json);assert.ok(evidence.trace_ids.includes('KB:dataset-id:segment1'));assert.ok(!r.answer.limits.some(x=>x.includes('尚未连接')));
});
test('failed workflow and missing analysis are never converted to success',async()=>{
 for(const raw of [{workflow_run_id:'failed-id',data:{status:'failed',error:'upstream may contain private text'}},{workflow_run_id:'bad-output',data:{status:'succeeded',outputs:{}}}]){
 const app=createAI({model,env,fetchImpl:async()=>Response.json(raw)});const response=await app(request()),r=await response.json();assert.equal(response.status,502);assert.equal(r.answer,null);assert.equal(r.ai.status,'FAILED');assert.equal(r.ai.request_id,raw.workflow_run_id);assert.ok(!JSON.stringify(r).includes('private text'));}
});
test('unknown nested legacy citations are rejected even when top-level citations are valid',async()=>{const a=legacy();a.data_gaps=[{text:'缺证据',citations:['invented']}];const app=createAI({model,env,fetchImpl:async()=>Response.json(workflow(a))});const r=await(await app(request())).json();assert.equal(r.code,'INVALID_AI_OUTPUT');assert.equal(r.answer,null);});
test('workflow input stays below its observed max length and oversized questions do not trigger billing',async()=>{let calls=0;const app=createAI({model,env,fetchImpl:async()=>{calls++;return Response.json(workflow(legacy()));}});assert.equal((await app(request('问'.repeat(801)))).status,400);assert.equal(calls,0);assert.equal((await app(request('问'.repeat(800)))).status,200);});
