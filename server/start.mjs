import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createAI} from './ai.mjs';
import {createAssistant} from './assistant.mjs';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
// Node's env loader preserves variables already configured by the hosting service.
try{process.loadEnvFile(resolve(root,'.env'));}catch(e){if(e.code!=='ENOENT')throw e;}
const host=process.env.HOST||'127.0.0.1',port=Number(process.env.PORT||8787);
if(!['127.0.0.1','localhost','::1'].includes(host)&&!process.env.DEMO_ACCESS_TOKEN)throw Error('公网后端必须配置DEMO_ACCESS_TOKEN');
const sandbox={};vm.runInNewContext(await readFile(resolve(root,'demo-data/kiwi-promo-data.js'),'utf8'),sandbox);
const require=createRequire(import.meta.url),model=require('../promo-model.js').create(sandbox.KIWI_PROMO_DATA);
const ai=createAI({model,env:process.env});
const assistant=createAssistant({model,env:process.env});
const allowed=new Set((process.env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};
const server=createServer(async(req,res)=>{
 try{
  const origin=req.headers.origin;
  const hostname=new URL('http://'+req.headers.host).hostname;
  if(['127.0.0.1','localhost','::1'].includes(host)&&!['localhost','127.0.0.1','[::1]'].includes(hostname)){res.writeHead(403);res.end();return;}
  const originAllowed=!origin||new URL(origin).host===req.headers.host||allowed.has(origin);
  if(!originAllowed){res.writeHead(403);res.end('Origin not allowed');return;}
  const headers={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
  if(origin){headers['Access-Control-Allow-Origin']=origin;headers.Vary='Origin';headers['Access-Control-Allow-Headers']='Content-Type, Authorization';headers['Access-Control-Allow-Methods']='GET, POST, OPTIONS';}
  if(req.method==='OPTIONS'){res.writeHead(204,headers);res.end();return;}
  const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(path==='/healthz'){res.writeHead(200,headers);res.end('ok');return;}
  if(path.startsWith('/api/')){
   let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>8000){res.writeHead(413,headers);res.end();return;}chunks.push(chunk);}
   const request=new Request('http://localhost'+req.url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});
   const response=await (request.url.includes('/api/ai/chat')?assistant(request):ai(request));res.writeHead(response.status,{...Object.fromEntries(response.headers),...headers});res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,headers);res.end();return;}
  const parts=path.split('/');if(parts.some(x=>x.startsWith('.')||['server','tests','scripts','docs','node_modules'].includes(x))){res.writeHead(404,headers);res.end();return;}
  const file=resolve(root,'.'+(path==='/'?'/index.html':path));if(!file.startsWith(root+sep)&&file!==resolve(root,'index.html')){res.writeHead(404,headers);res.end();return;}
  const allowedExt=['.html','.js','.css'];if(!allowedExt.includes(extname(file))||!(await stat(file)).isFile()){res.writeHead(404,headers);res.end();return;}
  const bytes=await readFile(file);res.writeHead(200,{...headers,'Content-Type':mime[extname(file)],'Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:bytes);
 }catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');}
});
server.listen(port,host,()=>console.log(`Kiwi BI + AI: http://${host}:${server.address().port} (keys stay server-side)`));
process.on('SIGTERM',()=>server.close());
