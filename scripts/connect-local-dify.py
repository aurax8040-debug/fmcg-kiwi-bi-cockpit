#!/usr/bin/env python3
"""Reuse local credentials without printing them or modifying Dify records."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import urllib.request
import urllib.parse
import uuid
from datetime import datetime

ROOT = Path(__file__).resolve().parents[1]

def read_env(path):
    result = {}
    if path.exists():
        for line in path.read_text().splitlines():
            m = re.match(r'\s*(?:export\s+)?([A-Z0-9_]+)\s*=(.*)', line)
            if m:
                result[m[1]] = m[2].strip().strip("'\"")
    return result

def get_json(base, path, key):
    request = urllib.request.Request(base + path, headers={'Authorization': 'Bearer ' + key})
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.load(response)

def existing_dataset_key(dataset_id, base):
    # Read only tokens belonging to this dataset's existing workspace. Do not create tokens.
    safe_id = str(uuid.UUID(dataset_id))
    sql = "BEGIN READ ONLY; SELECT token FROM api_tokens WHERE type='dataset' AND tenant_id=(SELECT tenant_id FROM datasets WHERE id='" + safe_id + "') ORDER BY created_at DESC LIMIT 10; COMMIT;"
    try:
        result = subprocess.run(['docker', 'exec', '-i', 'docker-db_postgres-1', 'sh', '-c', 'PGPASSWORD="$POSTGRES_PASSWORD" psql -X -qAt -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-dify}" -v ON_ERROR_STOP=1'], input=sql, capture_output=True, text=True, timeout=20)
        if result.returncode:
            return None
        for candidate in result.stdout.splitlines():
            if not candidate.strip() or candidate in ('BEGIN', 'COMMIT'):
                continue
            try:
                data = get_json(base, '/datasets/' + safe_id, candidate.strip())
                if data.get('id') == safe_id:
                    return candidate.strip()
            except Exception:
                continue
    except Exception:
        pass
    return None

def private_write(path, content):
    with tempfile.NamedTemporaryFile(mode='w', dir=path.parent, prefix='.env.stage-', delete=False) as f:
        temporary = Path(f.name)
        os.chmod(temporary, 0o600)
        f.write(content)
    try:
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)

def main():
    parser = argparse.ArgumentParser(description='复用本机Dify配置，不显示密钥，不调用模型')
    parser.add_argument('--source', type=Path, default=Path.home() / 'WorkBuddy/2026-10-12-11-47-53/fmcg-ai-analytics/.env.demo')
    parser.add_argument('--dataset-id', default='')
    args = parser.parse_args()
    destination = ROOT / '.env'
    if destination.is_symlink():
        raise RuntimeError('目标.env是符号链接，停止写入')
    tracked = subprocess.run(['git', 'ls-files', '--', '.env'], cwd=ROOT, capture_output=True, text=True)
    ignored = subprocess.run(['git', 'check-ignore', '--quiet', '.env'], cwd=ROOT, capture_output=True)
    if tracked.returncode or tracked.stdout.strip() or ignored.returncode:
        raise RuntimeError('.env未受Git忽略保护，停止写入')
    source = read_env(args.source)
    key = source.get('DIFY_API_KEY', '')
    if not key:
        raise RuntimeError('原项目没有DIFY_API_KEY')
    base = (source.get('DIFY_BASE_URL') or 'http://127.0.0.1/v1').rstrip('/')
    # This helper is for the observed local Docker deployment only.
    url = urllib.parse.urlparse(base)
    if url.hostname not in ('127.0.0.1', 'localhost') or url.scheme not in ('http', 'https') or url.username or url.password or url.query or url.fragment:
        raise RuntimeError('检测到非本机Dify地址，停止自动复用；请单独核对地址')
    info = get_json(base, '/info', key)
    if info.get('mode') != 'workflow' or 'KA活动研判' not in info.get('name', ''):
        raise RuntimeError('密钥对应的应用不是原KA活动研判工作流')
    parameters = get_json(base, '/parameters', key)
    fields = {field.get('variable') for item in parameters.get('user_input_form', []) for field in item.values() if isinstance(field, dict)}
    expected = {'activity_id', 'question', 'role', 'evidence_json', 'data_version'}
    if not expected.issubset(fields):
        raise RuntimeError('工作流输入字段不匹配，停止写入')
    values = read_env(destination)
    values.update({'AI_MODE': 'dify-workflow', 'DIFY_API_KEY': key, 'DIFY_BASE_URL': base, 'DEEPSEEK_MODEL': 'deepseek-flash', 'HOST': '127.0.0.1', 'PORT': '8788'})
    if args.dataset_id:
        dataset_id = str(uuid.UUID(args.dataset_id))
        values['DIFY_DATASET_ID'] = dataset_id
        dataset_key = source.get('DIFY_DATASET_API_KEY') or values.get('DIFY_DATASET_API_KEY')
        valid = False
        if dataset_key:
            try:
                valid = get_json(base, '/datasets/' + dataset_id, dataset_key).get('id') == dataset_id
            except Exception:
                pass
        if not valid:
            dataset_key = existing_dataset_key(dataset_id, base)
        if dataset_key:
            values['DIFY_DATASET_API_KEY'] = dataset_key
        else:
            values.pop('DIFY_DATASET_API_KEY', None)
    if destination.exists():
        backup = destination.with_name('.env.backup-' + datetime.now().strftime('%Y%m%d-%H%M%S-%f'))
        private_write(backup, destination.read_text())
        print('原.env已在本机备份；备份也受Git忽略保护。')
    lines = ['# Local secrets: do not publish or print.']
    for name, value in values.items():
        if '\n' in value or '\r' in value or '"' in value or '\\' in value:
            raise RuntimeError('配置含特殊字符，停止自动写入')
        lines.append(name + '="' + value + '"')
    private_write(destination, '\n'.join(lines) + '\n')
    print('工作流：' + info['name'] + '，访问验证成功')
    print('已配置本机新版后端；未改动旧项目、Dify工作流或模型配置。')
    print('佳农知识库：' + ('已有可用API密钥，真实检索将在生成复盘时验证' if values.get('DIFY_DATASET_API_KEY') else '未找到可用知识库API密钥；先验证工作流模型，RAG会明确显示未连接'))
    print('下一步：python3 scripts/start-local-demo.py --verify-ai')

if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        # Never print response payloads, subprocess output, or credential values.
        print('配置未完成：' + (str(e) if isinstance(e, RuntimeError) else type(e).__name__))
        raise SystemExit(1)
