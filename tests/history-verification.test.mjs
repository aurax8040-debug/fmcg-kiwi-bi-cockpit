import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile),cwd=new URL('../',import.meta.url);
const evidence=[{id:'POS:one',type:'business'},{id:'KB:one',type:'knowledge'}];
const answer=()=>({summary:'复盘：待人工核查',facts:[{text:'模拟事实',evidenceIds:['POS:one']}],hypotheses:[],actions:[],limits:['非因果结论']});
const analysis=()=>({management_summary:{title:'复盘',conclusion:'待人工核查'},facts:[{text:'模拟事实',citations:['POS:one']}],data_gaps:[],hypotheses:[],recommended_checks:[],boundaries:['非因果结论'],citations:['POS:one']});
async function run(record,success){
 const dir=await mkdtemp(join(tmpdir(),'kiwi-history-')),file=join(dir,'result.json'),text=JSON.stringify(record);
 await writeFile(file,text);
 try{
  if(success){const r=await exec('python3',['scripts/verify-history-run.py','--record',file],{cwd,timeout:10000});assert.match(r.stdout,/引用校验通过/);assert.match(r.stdout,/摘要：复盘：待人工核查/);assert.match(r.stdout,/本次没有新增模型调用/);}
  else await assert.rejects(()=>exec('python3',['scripts/verify-history-run.py','--record',file],{cwd,timeout:10000}),e=>e.code!==0);
  assert.equal(await readFile(file,'utf8'),text,'source result must not be rewritten');
 }finally{await rm(dir,{recursive:true,force:true});}
}
test('saved backend answer is validated directly without requiring legacy data_gaps',()=>run({status:'SUCCEEDED',answer:answer(),evidence,rag:{status:'RETRIEVED'}},true));
test('raw Dify analysis is normalized and validated',()=>run({outputs:{analysis:analysis()},evidence},true));
test('JSON-string Dify analysis displays normalized summary correctly',()=>run({outputs:{analysis:JSON.stringify(analysis())},evidence},true));
test('raw Dify run reads evidence from the original string inputs envelope',()=>run({outputs:{analysis:analysis()},inputs:JSON.stringify({evidence_json:JSON.stringify({evidence,rag_status:'RETRIEVED'})})},true));
test('unknown citation in saved backend answer exits nonzero',()=>{const a=answer();a.facts[0].evidenceIds=['unknown'];return run({answer:a,evidence},false);});
test('knowledge-only store fact in saved backend answer exits nonzero',()=>{const a=answer();a.facts[0].evidenceIds=['KB:one'];return run({answer:a,evidence},false);});
test('invalid raw workflow citation exits nonzero',()=>{const a=analysis();a.citations=['unknown'];return run({outputs:{analysis:a},evidence},false);});
test('record without original evidence cannot claim validation succeeded',()=>run({answer:answer()},false));
