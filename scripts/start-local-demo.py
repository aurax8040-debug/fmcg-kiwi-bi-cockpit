#!/usr/bin/env python3
"""Start the same-origin local demo; optionally perform exactly one real review."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
import urllib.request
import urllib.parse
import urllib.error
ROOT = Path(__file__).resolve().parents[1]

def open_local(request, timeout):
    url = request.full_url if isinstance(request, urllib.request.Request) else request
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != 'http' or parsed.hostname not in ('127.0.0.1', 'localhost'):
        raise RuntimeError('启动检查仅允许本机HTTP地址')
    # Local health checks must not be routed through macOS/system HTTP proxies.
    return urllib.request.build_opener(urllib.request.ProxyHandler({})).open(request, timeout=timeout)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--verify-ai', action='store_true', help='启动后进行1次真实模型复盘，可能消耗已有额度')
    parser.add_argument('--check-only', action='store_true', help='仅启动并检查本机服务，不打开浏览器或调用模型')
    args = parser.parse_args()
    if args.check_only and args.verify_ai:
        raise RuntimeError('--check-only不能与--verify-ai同时使用')
    node = shutil.which('node')
    if not node:
        raise RuntimeError('未找到Node.js，需要Node.js 22以上')
    version = subprocess.check_output([node, '--version'], text=True).strip()
    if int(version.lstrip('v').split('.')[0]) < 22:
        raise RuntimeError('当前' + version + '，需要Node.js 22以上')
    base = 'http://127.0.0.1:8788'
    env = dict(os.environ, HOST='127.0.0.1', PORT='8788')
    # Refuse to run verification against an already occupied unrelated server.
    import socket
    with socket.socket() as check:
        try:
            check.bind(('127.0.0.1', 8788))
        except OSError:
            raise RuntimeError('8788端口已被占用；保留原进程，请先确认其用途')
    child = subprocess.Popen([node, 'server/start.mjs'], cwd=ROOT, env=env)
    try:
        ready = False
        last_problem = '尚未收到响应'
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            if child.poll() is not None:
                raise RuntimeError('服务启动失败，请看上方报错')
            try:
                with open_local(base + '/healthz', timeout=1) as response:
                    ready = response.status == 200 and response.read(16) == b'ok'
                    last_problem = '响应不是预期的健康检查结果'
                if ready:
                    break
            except Exception as e:
                last_problem = 'HTTP ' + str(e.code) if isinstance(e, urllib.error.HTTPError) else type(e).__name__
                time.sleep(.25)
        if not ready:
            raise RuntimeError('本机健康检查失败：' + last_problem + '；服务已停止，原配置保留')
        print('本机健康检查通过：' + base + '/healthz', flush=True)
        if args.check_only:
            print('仅检查完成，未调用模型。', flush=True)
            return
        subprocess.run(['open', '-a', 'Google Chrome', base + '/'], check=False)
        print('在Chrome进入「临促活动复盘」。保留此终端；Ctrl+C停止本次后端。', flush=True)
        if args.verify_ai:
            print('开始一次真实复盘：STORE004 / ACT-202610，不自动重试。', flush=True)
            headers = {'Content-Type': 'application/json'}
            from importlib.util import spec_from_file_location, module_from_spec
            spec = spec_from_file_location('connect_local', ROOT / 'scripts/connect-local-dify.py')
            config = module_from_spec(spec)
            spec.loader.exec_module(config)
            token = config.read_env(ROOT / '.env').get('DEMO_ACCESS_TOKEN')
            if token:
                headers['Authorization'] = 'Bearer ' + token
            request = urllib.request.Request(base + '/api/ai/review', headers=headers, data=json.dumps({'store_id': 'STORE004', 'activity_id': 'ACT-202610', 'question': '请复盘本店本次活动，区分事实、证据缺口、待验证假设与人工核查建议。'}).encode())
            try:
                with open_local(request, timeout=210) as response:
                    result = json.load(response)
                print('真实调用状态：', result.get('status'))
                print('工作流运行ID：', result.get('ai', {}).get('request_id'))
                print('知识检索状态：', result.get('rag', {}).get('status'))
                print('Tokens：', result.get('ai', {}).get('usage'))
                from datetime import datetime
                target = ROOT / ('.ai-verification-' + datetime.now().strftime('%Y%m%d-%H%M%S') + '.json')
                config.private_write(target, json.dumps(result, ensure_ascii=False, indent=2))
                print('真实复盘结果已仅保存在本机；页面再次点击会产生另一次调用。', flush=True)
            except Exception as e:
                if isinstance(e, urllib.error.HTTPError):
                    try:
                        body = json.load(e)
                        print('本次真实调用未成功：', body.get('code'), body.get('error'), flush=True)
                        print('工作流运行ID：', body.get('ai', {}).get('request_id'), flush=True)
                    except Exception:
                        print('本次真实调用未成功：HTTP', e.code, flush=True)
                else:
                    print('本次真实调用未成功：', type(e).__name__, flush=True)
                print('未自动重试；页面保持可用。', flush=True)
        child.wait()
    finally:
        if child.poll() is None:
            child.terminate()
            child.wait(timeout=10)

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\n已停止本次后端。')
    except Exception as e:
        print('启动未完成：' + (str(e) if isinstance(e, RuntimeError) else type(e).__name__))
        raise SystemExit(1)
