import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,copyFile,writeFile,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
async function setup({validFields=true}={}){
 const calls=[],id='26c98a30-ef16-45e4-84bc-a8da908a3c4a';
 const server=createServer((req,res)=>{calls.push({path:req.url,method:req.method});res.setHeader('Content-Type','application/json');res.end(JSON.stringify(req.url.endsWith('/info')?{name:'快消智析·KA活动研判',mode:'workflow'}:req.url.endsWith('/parameters')?{user_input_form:(validFields?['activity_id','question','role','evidence_json','data_version']:['question']).map(variable=>({'text-input':{variable}}))}:{id}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const dir=await mkdtemp(join(tmpdir(),'kiwi-local-setup-')),project=join(dir,'project');await mkdir(join(project,'scripts'),{recursive:true});
 await copyFile(new URL('../scripts/connect-local-dify.py',import.meta.url),join(project,'scripts/connect-local-dify.py'));
 await exec('git',['init','--quiet'],{cwd:project});await writeFile(join(project,'.gitignore'),'.env\n.env.*\n');await writeFile(join(project,'.env'),'PRESERVE_THIS=unchanged\n');
 const source=join(dir,'previous.env'),content=`DIFY_API_KEY=test-app-secret\nDIFY_DATASET_API_KEY=test-dataset-secret\nDIFY_BASE_URL=http://127.0.0.1:${server.address().port}/v1\n`;await writeFile(source,content);
 return {calls,id,dir,project,source,content,async close(){await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}};
}
test('Mac setup copies existing local credentials privately without changing old project or invoking models',async()=>{const f=await setup();try{
 const {stdout}=await exec('python3',['scripts/connect-local-dify.py','--source',f.source,'--dataset-id',f.id],{cwd:f.project});
 assert.ok(!stdout.includes('test-app-secret'));assert.ok(!stdout.includes('test-dataset-secret'));assert.equal(await readFile(f.source,'utf8'),f.content);
 const env=await readFile(join(f.project,'.env'),'utf8');assert.match(env,/AI_MODE="dify-workflow"/);assert.match(env,/PRESERVE_THIS="unchanged"/);assert.match(env,/DIFY_DATASET_API_KEY="test-dataset-secret"/);assert.equal((await stat(join(f.project,'.env'))).mode&0o777,0o600);
 assert.ok(f.calls.every(x=>x.method==='GET'));assert.equal(f.calls.length,3);assert.ok(!f.calls.some(x=>/workflows\/run|retrieve/.test(x.path)));
}finally{await f.close();}});
test('Mac setup refuses mismatched workflow before changing any configuration',async()=>{const f=await setup({validFields:false});try{
 await assert.rejects(()=>exec('python3',['scripts/connect-local-dify.py','--source',f.source,'--dataset-id',f.id],{cwd:f.project}),e=>!e.stdout.includes('test-app-secret')&&e.stdout.includes('工作流输入字段不匹配'));
 assert.equal(await readFile(join(f.project,'.env'),'utf8'),'PRESERVE_THIS=unchanged\n');assert.equal(await readFile(f.source,'utf8'),f.content);
}finally{await f.close();}});
test('startup health check reaches loopback directly with broken proxy configuration and makes no AI call',async()=>{
 const cwd=new URL('../',import.meta.url);
 const {stdout}=await exec('python3',['scripts/start-local-demo.py','--check-only'],{cwd,env:{...process.env,http_proxy:'http://127.0.0.1:1',HTTP_PROXY:'http://127.0.0.1:1',https_proxy:'http://127.0.0.1:1',HTTPS_PROXY:'http://127.0.0.1:1',all_proxy:'http://127.0.0.1:1',ALL_PROXY:'http://127.0.0.1:1',no_proxy:'',NO_PROXY:''},timeout:25000});
 assert.match(stdout,/本机健康检查通过/);assert.match(stdout,/未调用模型/);assert.ok(!stdout.includes('开始一次真实复盘'));
});
