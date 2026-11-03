import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);require('../demo-data/kiwi-promo-data.js');
const {create}=require('../promo-model.js');const tools=create(globalThis.KIWI_PROMO_DATA);
const args=process.argv.slice(2),get=k=>args[args.indexOf(k)+1];
try{const result=tools.queryStoreActivity({store_id:args.includes('--store')?get('--store'):'STORE002',activity_id:args.includes('--activity')?get('--activity'):'ACT-202610',...(args.includes('--as-of')?{as_of_date:get('--as-of')}:{})});console.log(JSON.stringify(result,null,2));}
catch(e){console.error(JSON.stringify({code:e.code||'QUERY_FAILED',message:e.message}));process.exitCode=1;}
