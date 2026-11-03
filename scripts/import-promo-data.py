"""Import the delivered Mock workbook and the activity/baseline slice of daily POS."""
from pathlib import Path
import argparse, datetime as dt, hashlib, json, csv, io, zipfile
import xml.etree.ElementTree as ET

NS={'x':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
def excel_tables(path):
 with zipfile.ZipFile(path) as z:
  result={}
  for sheet in range(1,12):
   rows=[]
   for r in ET.fromstring(z.read(f'xl/worksheets/sheet{sheet}.xml')).findall('x:sheetData/x:row',NS):
    vals=[]
    for c in r:
     letters=''.join(ch for ch in c.attrib['r'] if ch.isalpha());index=0
     for ch in letters:index=index*26+ord(ch)-64
     while len(vals)<index:vals.append(None)
     v=c.find('x:v',NS);v=v.text if v is not None else None
     if c.attrib.get('t')=='b':v=v=='1'
     elif c.attrib.get('t') not in ('str','s','d') and v is not None:
      v=float(v);v=int(v) if v.is_integer() else v
     vals[index-1]=v
    rows.append(vals)
   headers=rows[0];objects=[]
   for row in rows[1:]:
    o=dict(zip(headers,row+[None]*(len(headers)-len(row))))
    for h,v in o.items():
     if isinstance(v,str) and h.endswith('_date'):
      o[h]=v[:10];continue
     if v is not None and isinstance(v,(float,int)) and h.endswith('_date'):
      o[h]=(dt.datetime(1899,12,30)+dt.timedelta(days=v)).date().isoformat()
     elif isinstance(v,(float,int)) and h in ('arrival_time','leave_time'):
      o[h]=(dt.datetime(1899,12,30)+dt.timedelta(days=v)).isoformat(timespec='seconds')
    objects.append(o)
   result[sheet]=objects
  return result

def main():
 ap=argparse.ArgumentParser();ap.add_argument('workbook',type=Path);ap.add_argument('daily_zip',type=Path);ap.add_argument('--output',type=Path,default=Path('demo-data/kiwi-promo-data.js'));a=ap.parse_args()
 t=excel_tables(a.workbook);stores={s['store_id']:s for s in t[1]};skus={s['sku_id']:s for s in t[2]}
 needed=set();activity_pairs=set()
 for p in t[7]:
  act=next(v for v in t[6] if v['activity_id']==p['activity_id']);start=dt.date.fromisoformat(act['start_date']);end=dt.date.fromisoformat(act['end_date'])
  activity_pairs.add((p['activity_id'],p['store_id']))
  for offset in range((end-start).days+1):
   day=start+dt.timedelta(days=offset)
   for shift in (0,-7):needed.add(((day+dt.timedelta(days=shift)).isoformat(),p['store_id']))
 rows=[];seen=set();counts=0
 with zipfile.ZipFile(a.daily_zip) as z:
  for name in sorted(z.namelist()):
   if not name.endswith('.csv'):continue
   with z.open(name) as raw:
    for r in csv.DictReader(io.TextIOWrapper(raw,encoding='utf-8-sig')):
     counts+=1
     if (r['sales_date'],r['store_id']) not in needed:continue
     key=r['sales_date'],r['store_id'],r['sku_id'];assert key not in seen;seen.add(key)
     assert r['store_id'] in stores and r['sku_id'] in skus and r['store_name']==stores[r['store_id']]['store_name']
     q=int(r['quantity']);te=float(r['sales_te']);assert abs(te-q*skus[r['sku_id']]['te_factor'])<.0001
     rows.append([r['sales_date'],r['store_id'],r['sku_id'],q,float(r['sales_amount_cny']),float(r['cost_amount_cny']),te,r['available_date']])
 assert counts==766500 and len(rows)==len(needed)*15
 assert len({p['store_id'] for p in t[7]})==140 and len(t[6])==12
 visits={v['visit_id']:v for v in t[9]}
 for e in t[10]:assert e['visit_id'] in visits and visits[e['visit_id']]['store_id']==e['store_id']
 for c in t[11]:assert c['visit_id'] in visits and c['sku_id'] in skus and visits[c['visit_id']]['store_id']==c['store_id']
 for f in t[8]:assert (f['activity_id'],f['store_id']) in activity_pairs
 data={'meta':{'data_type':'DEMO_MOCK','workbook_name':a.workbook.name,'workbook_sha256':hashlib.sha256(a.workbook.read_bytes()).hexdigest(),'daily_archive_name':a.daily_zip.name,'daily_archive_sha256':hashlib.sha256(a.daily_zip.read_bytes()).hexdigest(),'source_daily_rows':counts,'embedded_daily_rows':len(rows),'pos_scope':'活动日期及前7天同星期对照；仅载入参与门店。非全年POS全量。'},'stores':t[1],'skus':t[2],'mappings':t[3],'activities':t[6],'participations':t[7],'fees':t[8],'visits':t[9],'executions':t[10],'sku_checks':t[11],'pos_columns':['sales_date','store_id','sku_id','quantity','sales_amount_cny','cost_amount_cny','sales_te','available_date'],'pos':rows}
 a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text('/* Imported from delivered DEMO_MOCK files. */\nglobalThis.KIWI_PROMO_DATA='+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n')
 print(json.dumps({'activities':len(t[6]),'participations':len(t[7]),'stores':len(stores),'daily_records':len(rows),'bytes':a.output.stat().st_size}))

if __name__=='__main__':main()
