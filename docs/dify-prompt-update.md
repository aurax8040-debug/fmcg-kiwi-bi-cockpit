# Dify LLM 节点 Prompt 更新指引（2026-11-03）

## 背景

接入 DeepSeek + Dify 时，真实调用暴露了 3 类「模型输出偶发不稳定」，都会被代码侧安全防护拦截：

| # | 现象 | 报错 | 处理 |
|---|---|---|---|
| 1 | boundaries 被输出成 `{text,citations}` 对象数组 | 工作流boundaries必须是字符串数组 | 代码已容错 + prompt 强化 |
| 2 | facts/gaps/checks/boundaries 条数超 6 条（实际 7-8 条） | 模型输出结构不完整 | 代码已截断 + prompt 强化 |
| 3 | facts 偶发只引用知识库（KB:）条款 | 知识条款不能单独作为本店经营事实证据 | prompt 强化（安全边界正常工作） |

## 需要在 Dify 界面做的事

登录本地 Dify → 工作室 →「快消智析·KA活动研判」→ 找到 LLM 节点（DeepSeek受控研判）→ 把 System 提示词替换为下方内容。

## 新 System 提示词（直接复制粘贴）

```
你是KA活动经营研判助手。只能使用用户提供的evidence_json。
经营数字不得自行重算。每条事实、缺口、假设、建议都要引用输入trace_ids中的值。
假设必须标记待验证。没有库存证据不得判断缺货；没有有效对照不得声称因果增量；不得自动审批费用或资源。
只输出合法JSON，不要Markdown。字段必须为facts、data_gaps、hypotheses、recommended_checks、boundaries、management_summary、citations。
facts、data_gaps、hypotheses、recommended_checks四项为[{"text":"...","citations":["..."]}]；boundaries必须是纯字符串数组（每项是字符串，不要用对象或引用）；management_summary含title和conclusion；citations为本次使用的全部引用去重集合。
严格数量约束：facts、data_gaps、hypotheses、recommended_checks、boundaries 每项最多6条，超出只保留最关键的6条。
引用约束：facts 每条必须至少引用一个业务证据trace_id（TPM/POS/SFA开头），不得只用知识库（KB开头）条款作为本店经营事实证据；知识条款只能用于hypotheses或recommended_checks作为核查依据。
```

改完后重新「发布」工作流（Dify 界面右上角发布），再运行一次验证。

## 代码侧已做的修复（kiwi-live-mAD04o/server/ai.mjs）

- `normalizeWorkflow`：boundaries 对象数组容错归一为字符串。
- `validateAnswer`：facts/hypotheses/actions/limits 超 6 条时截断到前 6 条，不拒绝。
- 测试新增 `dify-workflow.test.mjs` 用例覆盖上述两处。
