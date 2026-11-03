/* Shared deterministic BI calculations. Currency aggregates in integer cents. */
(function(root){
  const regionNames={east:'华东',south:'华南',north:'华北',central:'华中',west:'西部'};
  function create(data){
    const stores=new Map(data.stores.map(s=>[s.store_id,s]));
    const skus=new Map(data.skus.map(s=>[s.sku_id,s]));
    const months=[...new Set(data.pos.map(r=>r[0]))].sort();
    const records=data.pos.map(([month,store_id,sku_id,quantity,sales,cost,te])=>({
      month,store_id,sku_id,quantity,sales_cents:Math.round(sales*100),cost_cents:Math.round(cost*100),te,
      store:stores.get(store_id),sku:skus.get(sku_id)
    }));
    function selectStores(f){return data.stores.filter(s=>
      (!f.region||f.region==='all'||s.war_zone===regionNames[f.region])&&
      (!f.ka||f.ka==='all'||s.ka_name===f.ka)&&
      (!f.market||f.market==='all'||s.market_department===f.market)&&
      (!f.grade||f.grade==='all'||s.store_grade===f.grade)&&
      (!f.store||f.store==='all'||s.store_id===f.store));}
    function summarize(f={}){
      const selectedStores=selectStores(f),ids=new Set(selectedStores.map(s=>s.store_id));
      const selectedMonths=f.month&&f.month!=='all'?[f.month]:months;
      const monthSet=new Set(selectedMonths);
      const rows=records.filter(r=>ids.has(r.store_id)&&monthSet.has(r.month)&&
        (!f.category||f.category==='all'||r.sku.category===f.category)&&
        (!f.sku||f.sku==='all'||r.sku_id===f.sku));
      const scopedBudget=data.budgets.filter(b=>ids.has(b.store_id)&&monthSet.has(b.month));
      const productFiltered=(f.category&&f.category!=='all')||(f.sku&&f.sku!=='all');
      const budgetMap=new Map();for(const b of scopedBudget)budgetMap.set(b.store_id,(budgetMap.get(b.store_id)||0)+Math.round(b.sales_budget_cny*100));
      const add=(a,r)=>{a.sales_cents+=r.sales_cents;a.cost_cents+=r.cost_cents;a.quantity+=r.quantity;a.te+=r.te;return a;};
      const zero=()=>({sales_cents:0,cost_cents:0,quantity:0,te:0});
      const finish=a=>({...a,sales:a.sales_cents/100,cost:a.cost_cents/100,profit:(a.sales_cents-a.cost_cents)/100,volume:a.quantity});
      const total=finish(rows.reduce(add,zero()));
      const group=(getKey)=>{const m=new Map();for(const r of rows){const k=getKey(r);if(!m.has(k))m.set(k,zero());add(m.get(k),r);}return [...m].map(([key,a])=>({key,...finish(a)}));};
      const storeRows=group(r=>r.store_id).map(a=>{const s=stores.get(a.key),target=productFiltered?null:(budgetMap.get(a.key)||0)/100;return {...a,...s,name:s.store_name,target,attainment:target?a.sales/target:null};}).sort((a,b)=>b.sales_cents-a.sales_cents);
      const active=new Set(rows.filter(r=>r.quantity>0).map(r=>r.store_id));
      const kaRows=group(r=>r.store.ka_name).map(a=>({ ...a,name:a.key,stores:selectedStores.filter(s=>s.ka_name===a.key).length,active:selectedStores.filter(s=>s.ka_name===a.key&&active.has(s.store_id)).length,display:null,pending:null,progress:a.sales?a.profit/a.sales*100:0,yoy:null }));
      const target=productFiltered?null:scopedBudget.reduce((n,b)=>n+Math.round(b.sales_budget_cny*100),0)/100;
      const skuRows=group(r=>r.sku_id).map(a=>({...a,...skus.get(a.key),name:skus.get(a.key).sku_name})).sort((a,b)=>b.sales_cents-a.sales_cents);
      const legacyRows=rows.map(r=>({...r,date:r.month+'-01',id:r.month+'-'+r.store_id+'-'+r.sku_id,ka:r.store.ka_name,volume:r.quantity,sales:r.sales_cents/100,profit:(r.sales_cents-r.cost_cents)/100,previousYear:0}));
      return {...total,rows:legacyRows,selectedStores,storeRows,skuRows,categoryRows:group(r=>r.sku.category),regionRows:group(r=>r.store.war_zone),trend:group(r=>r.month).sort((a,b)=>a.key.localeCompare(b.key)),
        ka:kaRows,customers:kaRows,stores:selectedStores.length,active:active.size,target,attainment:target?total.sales/target:null,
        productFiltered,selectedMonths,monthSales:total.sales,monthTarget:target,monthProgress:1,prior:null,start:(selectedMonths[0]||months[0])+'-01',
        label:`${f.month&&f.month!=='all'?f.month:'2025-11 至 2026-10'} · ${regionNames[f.region]||'全部战区'} · ${f.ka&&f.ka!=='all'?f.ka:'全部KA'} · DEMO_MOCK`};
    }
    return {summarize,selectStores,months,stores,skus,data};
  }
  root.KiwiBI={create,regionNames};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.KiwiBI;
})(globalThis);
