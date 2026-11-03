#!/usr/bin/env python3
"""取回 Dify 历史运行记录并正确校验引用（修复版）。

修复点：旧诊断脚本用 `evidence.get("evidence", [])` 取证据数组，但服务端
成功响应的证据是顶层字段 `evidence`（对象数组，元素含 .id），没有嵌套。
取错层级会得到空数组，导致 normalizeWorkflow 把所有引用判为「未知证据」，
错误地显示成「模型输出结构不完整」。

本脚本的正确做法：
1. 从 /api/ai/review 取回的完整响应里，`evidence` 就是证据数组本体；
2. 把它原样传给 normalizeWorkflow(analysis, evidence)，不要 .get("evidence")。
"""
import argparse
import json
import os
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read_env(path):
    result = {}
    if path.exists():
        for line in path.read_text().splitlines():
            m = re.match(r'\s*(?:export\s+)?([A-Z0-9_]+)\s*=(.*)', line)
            if m:
                result[m[1]] = m[2].strip().strip("'\"")
    return result


def main():
    parser = argparse.ArgumentParser(description='校验一次 Dify 历史复盘结果的引用（不新增模型调用）')
    parser.add_argument('--record', type=Path, help='.ai-verification-*.json 历史结果文件路径')
    args = parser.parse_args()

    env = read_env(ROOT / '.env')

    # 1. 找到历史结果文件
    record = args.record
    if record is None:
        candidates = sorted(ROOT.glob('.ai-verification-*.json'))
        if not candidates:
            raise SystemExit('未找到 .ai-verification-*.json，请先用 --verify-ai 生成一次，或用 --record 指定文件')
        record = candidates[-1]

    data = json.loads(record.read_text())
    analysis = data.get('answer') or data.get('outputs', {}).get('analysis') or data.get('analysis')
    # 2. 关键修复：evidence 就是响应顶层字段，本身就是对象数组，不要 .get("evidence")
    evidence = data.get('evidence', [])

    if not analysis:
        raise SystemExit('记录里没有 analysis/answer 字段')

    js = r'''
const p = JSON.parse(text);
const normalize = (await import('./server/ai.mjs')).normalizeWorkflow;
try {
  const out = normalize(p.analysis, p.evidence);
  console.log('引用校验通过');
  console.log('摘要：' + out.summary);
  console.log('事实条数：' + out.facts.length);
  console.log('假设条数：' + out.hypotheses.length);
  console.log('建议条数：' + out.actions.length);
} catch (e) {
  console.log('具体原因：' + e.message);
  process.exit(1);
}
'''
    check = subprocess.run(
        ['node', '--input-type=module', '-e', js],
        cwd=ROOT,
        input=json.dumps({'analysis': analysis, 'evidence': evidence}),
        text=True,
        capture_output=True,
    )
    message = check.stdout or check.stderr
    for name in ('DIFY_API_KEY', 'DIFY_DATASET_API_KEY'):
        if env.get(name):
            message = message.replace(env[name], '[已隐藏]')
    message = re.sub(r'sk-[A-Za-z0-9_-]+', '[已隐藏]', message)
    print(message[:2500])
    print('知识检索状态：', data.get('rag', {}).get('status', '未记录'))
    print('本次没有新增模型调用。')


if __name__ == '__main__':
    main()
