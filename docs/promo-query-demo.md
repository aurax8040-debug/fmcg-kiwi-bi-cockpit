# 临促联合查询演示

本轮实现同店、同活动、同日期范围的POS/TPM/SFA数据查询。全部使用已交付的DEMO_MOCK数据，未调用大模型或Dify。

## 数据底座

- 140家门店与BI驾驶舱沿用相同store_id和门店名称。
- 12场活动，每场70家门店，共840条参与记录，每家门店参加6场。
- 数据来自FMCG_140_Stores_POS_TPM_SFA_Mock.xlsx与POS_Daily_140_Stores_12_Months.zip，源文件哈希写在数据meta中。
- 页面仅载入活动日期及前7天同星期的参与门店日POS，共50400条。完整年度POS仍为766500条，未在前端重复载入全量数据。

## 可演示流程

1. 首页左侧打开“临促活动复盘”。
2. 选择活动与参与门店，展示目标、实际、达成率、已记录费用。
3. 对照POS日记录、TPM计划/费用和SFA拜访/执行/SKU抽查。
4. 使用“记录完整”“现场异常”“缺失证据”三个案例入口。
5. 展开业务记录ID和实际查询轨迹，或导出本次证据JSON。
6. 门店下钻页也可进入该店参与的活动。未参与的月份不套用其他活动。

## 可独立调用的查询工具

```bash
node scripts/query-promo.mjs --store STORE002 --activity ACT-202610
```

工具为queryTPM、queryPOS、querySFA和汇总查询queryStoreActivity。返回结构适合后续接入服务端API或Agent编排。当前GitHub Pages是静态站，这些工具在浏览器/Node内执行，不代表已部署独立后端或Agent服务。

重新导入数据：

```bash
python3 scripts/import-promo-data.py /path/FMCG_140_Stores_POS_TPM_SFA_Mock.xlsx /path/POS_Daily_140_Stores_12_Months.zip
```

## 验收边界

- 12项测试覆盖数据同源、840个活动门店组合、T+1、缺失与0值、门店映射、重复键和未完成拜访。
- 缺失POS时活动销售与达成率为null，不用0填补。合法零销量仍可计算0%达成率。
- SFA仅取相同门店、相同活动且在活动日期内的记录，不借用其他门店或月份。
- 到岗仅代表巡店时点，每次SKU检查为3个样本，照片未提供。
- 上周对比不等于促销增量，费用不等于完整ROI。
- 数据完整状态与AI运行状态分开。AI为NOT_RUN，RAG为NOT_CONNECTED，不生成销售原因或伪造知识库引用。
