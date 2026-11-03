#!/usr/bin/env python3
"""Validate an existing saved review without calling any model.

Backend answer records use validateAnswer; raw Dify analysis records use
normalizeWorkflow. Evidence is read from the backend response or the original
Dify evidence_json envelope. Source records are never rewritten.
"""
import argparse
import json
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
        candidates = list(ROOT.glob('.ai-verification-*.json'))
        if not candidates:
            raise SystemExit('未找到历史结果文件；请用 --record 指定已有的完整结果，不必重新调用模型')
        record = max(candidates, key=lambda p: p.stat().st_mtime_ns)

    data = json.loads(record.read_text())
    if not isinstance(data, dict):
        raise SystemExit('记录必须是JSON对象')
    if 'answer' in data:
        kind, analysis = 'normalized', data['answer']
    else:
        outputs = data.get('outputs')
        analysis = outputs.get('analysis') if isinstance(outputs, dict) else None
        if analysis is None:
            analysis = data.get('analysis')
        kind = 'workflow'
    inputs = data.get('inputs') or {}
    if isinstance(inputs, str):
        inputs = json.loads(inputs)
    envelope = inputs.get('evidence_json') or {} if isinstance(inputs, dict) else {}
    if isinstance(envelope, str):
        envelope = json.loads(envelope)
    evidence = data.get('evidence')
    if evidence is None and isinstance(envelope, dict):
        evidence = envelope.get('evidence')
    if not isinstance(evidence, list) or not evidence or any(not isinstance(e, dict) or not isinstance(e.get('id'), str) for e in evidence):
        raise SystemExit('记录缺少有效证据数组；请指定包含证据的完整历史结果')
    if analysis is None:
        raise SystemExit('记录里没有有效的 analysis/answer 字段')
    rag = data.get('rag') or {}
    rag_status = rag.get('status') if isinstance(rag, dict) else None
    rag_status = rag_status or data.get('rag_status') or (envelope.get('rag_status') if isinstance(envelope, dict) else None) or '未记录'

    js = r'''
import { readFileSync } from 'node:fs';
const raw = readFileSync(0, 'utf8');
const p = JSON.parse(raw);
const { normalizeWorkflow, validateAnswer } = await import('./server/ai.mjs');
try {
  const out = p.kind === 'normalized'
    ? validateAnswer(p.analysis, p.evidence)
    : normalizeWorkflow(p.analysis, p.evidence);
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
        input=json.dumps({'kind': kind, 'analysis': analysis, 'evidence': evidence}),
        text=True,
        capture_output=True,
    )
    message = check.stdout or check.stderr
    for name in ('DIFY_API_KEY', 'DIFY_DATASET_API_KEY'):
        if env.get(name):
            message = message.replace(env[name], '[已隐藏]')
    message = re.sub(r'sk-[A-Za-z0-9_-]+', '[已隐藏]', message)
    print(message[:2500])
    print('知识检索状态：', rag_status)
    print('本次没有新增模型调用。')
    # 校验失败时返回非零退出码，供调用方感知失败。
    if check.returncode != 0:
        raise SystemExit(check.returncode)


if __name__ == '__main__':
    main()
