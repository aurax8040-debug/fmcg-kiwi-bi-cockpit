# DeepSeek + Dify 接入

## 当前交付状态

已实现服务端接口与活动复盘按钮。真实凭证和公网后端未在本环境配置，因此未完成真实API联调；自动测试使用可控HTTP替身，不代表模型已连接。

链路：store_id + activity_id → 服务端重新计算POS/TPM/SFA证据 → Dify已有知识库检索 → DeepSeek生成带引用的复盘 → 校验引用 → 人工审核。

Dify在此承担已有经典知识库的RAG检索。此接口不会创建或修改知识库，也不会执行Dify Workflow；无命中原样显示，不编造条款。之前的工作流应用密钥不能替代知识库API密钥。

## 本机完整演示

Node.js 22以上，无第三方依赖。下载或克隆此仓库，进入目录：

```bash
cp .env.example .env
```

在本机编辑`.env`（不要发到聊天、不要提交Git）：

| 变量 | 来源 |
| --- | --- |
| DEEPSEEK_API_KEY | DeepSeek控制台已有API密钥 |
| DIFY_BASE_URL | Dify知识库Service API中显示的基础地址，包含/v1 |
| DIFY_DATASET_API_KEY | Dify「知识库 → Service API → API Key」，只授权原有知识库 |
| DIFY_DATASET_ID | 该知识库页面URL的/datasets/之后的ID |

`DIFY_BASE_URL`可用Dify Cloud或本机自部署地址。本机服务无法由云端后台访问；若两者在同一电脑运行，直接用本机地址。DEEPSEEK_MODEL默认deepseek-flash，可由服务端覆盖。

```bash
npm start
```

Chrome打开`http://127.0.0.1:8787/`，进入「临促活动复盘」，先检查服务状态，再点击「生成AI活动复盘」。每次点击可能消耗模型和检索额度。不会随筛选自动调用。第一轮建议只验证一个门店与一次问题。

## 公网部署

GitHub Pages继续承载静态大盘；完整服务用`npm start`或所附Dockerfile部署到支持Node HTTP的主机。当前没有配置任何新的托管账号。

公网后端设置`HOST=0.0.0.0`、平台分配的`PORT`、上述四个变量和较长随机`DEMO_ACCESS_TOKEN`。`ALLOWED_ORIGINS=https://aurax8040-debug.github.io`允许现有大盘访问。主机缺少访问码时服务拒绝启动。

在大盘「连接AI后端」填写HTTPS根地址及演示访问码。这里只输入访问码，不输入DeepSeek或Dify API密钥。访问码仅保存在页面内存；后端地址保存在浏览器本地。也可以直接打开完整后端根地址，前后端同源。

## 验证与限制

- `npm test`验证840个门店活动组合及模型网关；模型测试为替身，不消耗额度。
- `/api/ai/status`只检查配置是否存在，不代表远端密钥有效。
- 成功响应返回DeepSeek真实响应ID、模型名、tokens、Dify文档/片段ID与检索内容；调用失败不显示预设成功答案。
- 未知引用、知识条款单独证明经营事实、截断输出被拒绝。引用存在不等于事实语义已被证明，仍需人工核查。
- Dify失败时停止模型调用；DeepSeek失败时保留Dify检索和确定性业务证据。
- 超时无自动重试。单实例最多3次/分钟、20次/天，并发2次；计数在内存中，重启会重置，不适合作为正式生产配额系统。
- 全部业务数字为DEMO_MOCK，知识库可能是真实规则；模型原因保持假设，不自动下发任务或核销费用。

## 本机Codex续接指令

如果凭证保存在以前的Mac项目，让本机Codex执行以下任务即可，不需复制密钥到聊天：

> 在现有fmcg-kiwi-bi-cockpit仓库切换main并拉取最新版本。保留用户改动。检查/Users/liuxiaohua/WorkBuddy/2026-10-12-11-47-53/fmcg-ai-analytics内已有Dify/DeepSeek配置，只报告变量名称及是否存在，绝不打印或提交密钥。把有效配置写入本仓库未跟踪的.env；Dify必须使用原知识库ID和知识库API密钥，不能用工作流应用密钥代替。运行npm test和npm start。先检查/api/ai/status，再对STORE004、ACT-202610执行一次真实复盘，核对DeepSeek响应ID、Dify文档/片段ID和界面结果；失败如实报告，禁止用预设文本替代。保留现有140家门店UI，不修改历史项目，不自行购买托管服务。
