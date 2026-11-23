# -*- coding: utf-8 -*-
"""轻量 CDP 客户端（无头 Chrome 9637）。
用法：
  http('/json/new?'+urllib.parse.quote(url, safe=''), method='PUT') → tab 信息 dict
  Conn(tab['webSocketDebuggerUrl']).eval(expr) → 字符串（直接返回求值结果）
  Conn(...).eval(expr, await_promise=True) → 支持 Promise
  Conn(...).cmd('Page.captureScreenshot', format='png') → 完整响应，截图数据在 r['result']['data']
"""
import json, socket, base64

try:
    from websocket import create_connection  # websocket-client
except ImportError:
    create_connection = None

DEBUG_HOST = 'localhost'
DEBUG_PORT = 9637


def http(path, method='GET', timeout=10, port=None):
    import http.client
    conn = http.client.HTTPConnection(DEBUG_HOST, port or DEBUG_PORT, timeout=timeout)
    conn.request(method, path)
    r = conn.getresponse()
    body = r.read().decode('utf-8', 'replace')
    conn.close()
    if r.status not in (200, 201, 204):
        raise RuntimeError('HTTP %s %s → %s: %s' % (method, path, r.status, body[:200]))
    if not body.strip():
        return {}
    return json.loads(body)


class Conn:
    def __init__(self, ws_url):
        if create_connection is None:
            raise RuntimeError('需要 websocket-client：pip3 install websocket-client')
        self._ws = create_connection(ws_url, timeout=30, suppress_origin=True)
        self._mid = 0

    def cmd(self, method, **params):
        self._mid += 1
        mid = self._mid
        self._ws.send(json.dumps({'id': mid, 'method': method, 'params': params}))
        while True:
            msg = json.loads(self._ws.recv())
            if msg.get('id') == mid:
                if 'error' in msg:
                    raise RuntimeError(json.dumps(msg['error'])[:300])
                return msg

    def eval(self, expr, await_promise=False):
        p = {'expression': expr, 'returnByValue': True, 'awaitPromise': await_promise}
        if await_promise:
            p['timeout'] = 30000
        r = self.cmd('Runtime.evaluate', **p)
        res = r.get('result', {}).get('result', {})
        if res.get('subtype') == 'error':
            raise RuntimeError(res.get('description', 'eval error')[:400])
        v = res.get('value')
        if isinstance(v, str):
            return v
        return json.dumps(v, ensure_ascii=False) if v is not None else ''
