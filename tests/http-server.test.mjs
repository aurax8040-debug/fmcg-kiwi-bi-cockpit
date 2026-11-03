import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const root=new URL('../',import.meta.url);
test('real HTTP gateway serves UI and API but denies source, secrets and foreign origins',async()=>{
 const child=spawn(process.execPath,['server/start.mjs'],{cwd:root,env:{...process.env,HOST:'127.0.0.1',PORT:'0',AI_MODE:'',DIFY_API_KEY:'',DIFY_BASE_URL:'',DEEPSEEK_API_KEY:'',DIFY_DATASET_API_KEY:'',DIFY_DATASET_ID:'',DEMO_ACCESS_TOKEN:''},stdio:['ignore','pipe','pipe']});
 try{
  const port=await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(Error('startup timed out')),10000);child.once('exit',code=>{clearTimeout(timer);reject(Error('server exited '+code));});child.stdout.on('data',buf=>{text+=buf;const m=text.match(/127\.0\.0\.1:(\d+)/);if(m){clearTimeout(timer);resolve(m[1]);}});});
  const base='http://127.0.0.1:'+port;
  const home=await fetch(base);assert.equal(home.status,200);assert.match(await home.text(),/ai-review.js/);
  for(const path of ['/promo-model.js','/ai-review.js','/promo.css','/demo-data/kiwi-promo-data.js'])assert.equal((await fetch(base+path)).status,200,path);
  for(const path of ['/.env','/.env.example','/server/ai.mjs','/tests/ai-review.test.mjs','/.git/config'])assert.equal((await fetch(base+path)).status,404,path);
  assert.equal((await fetch(base+'/api/ai/status',{headers:{Origin:'https://unrelated.test'}})).status,403);
  const status=await(await fetch(base+'/api/ai/status')).json();assert.equal(status.configured,false);
  const response=await fetch(base+'/api/ai/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({store_id:'STORE004',activity_id:'ACT-202610',question:'复盘'})});assert.equal(response.status,503);assert.equal((await response.json()).answer,null);
 }finally{child.kill('SIGTERM');await once(child,'exit');}
});
