#!/usr/bin/env python3
# 部署：本地目录 → gh-pages 分支根（yukicheng.com = 主页 /）
# 结构：/ = index.html 主页；/shop/ /askbox/ = 子页；/bjd/ /color-card/ /yuki-homepage/ = 重定向；
#       /admin.html = 后台；photos/ icons 等资源原样发布。CNAME（自定义域名）永不动、永不删。
import base64, json, os, time, urllib.request

TOKEN = open(os.path.expanduser("~/.cola/deploy/github_token")).read().strip()
USER, REPO = "chengyuki119", "cola-pages"
API = f"https://api.github.com/repos/{USER}/{REPO}"
SITE_URL = "https://yukicheng.com/"
SRC = "/Users/yz0119/cola/outputs/个人主页网站"
SKIP = {"自己编辑指南.md", ".deploy_to_ghpages.py", ".DS_Store"}
PROTECT = {"CNAME"}  # 自定义域名配置：只存在 gh-pages 根，部署绝不覆盖/删除

def req(method, url, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    r = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": f"Bearer {TOKEN}", "Accept": "application/vnd.github+json",
        "Content-Type": "application/json", "User-Agent": "cola-deploy"})
    try:
        with urllib.request.urlopen(r) as resp:
            body = resp.read()
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")[:300]
        raise RuntimeError(f"{method} {url} -> {e.code}: {body}") from None

files = []
for root, dirs, names in os.walk(SRC):
    dirs[:] = [d for d in dirs if d not in (".git", "node_modules", "icons") and not d.startswith(".")]
    for n in names:
        if n in SKIP or n.startswith("."):
            continue
        files.append((os.path.relpath(os.path.join(root, n), SRC).replace(os.sep, "/"),
                      os.path.join(root, n)))
files.sort()

ref = req("GET", f"{API}/git/ref/heads/gh-pages")
parent = ref["object"]["sha"]
commit = req("GET", f"{API}/git/commits/{parent}")
base_tree = commit["tree"]["sha"]
tree_full = req("GET", f"{API}/git/trees/{base_tree}?recursive=1")
existing = {t["path"] for t in tree_full.get("tree", []) if t.get("type") == "blob"}
print(f"publishing {len(files)} files to gh-pages ROOT (site: {SITE_URL})")

entries, new_paths = [], set()
for rel, p in files:
    content = base64.b64encode(open(p, "rb").read()).decode()
    blob = req("POST", f"{API}/git/blobs", {"content": content, "encoding": "base64"})
    entries.append({"path": rel, "mode": "100644", "type": "blob", "sha": blob["sha"]})
    new_paths.add(rel)
stale = existing - new_paths - PROTECT
for p in sorted(stale):
    entries.append({"path": p, "mode": "100644", "type": "blob", "sha": None})
if stale:
    print(f"  stale delete: {len(stale)} files (CNAME protected)")

tree = req("POST", f"{API}/git/trees", {"base_tree": base_tree, "tree": entries})
c = req("POST", f"{API}/git/commits", {"message": "Deploy to domain root (yukicheng.com) via Cola",
                                       "tree": tree["sha"], "parents": [parent]})
req("PATCH", f"{API}/git/refs/heads/gh-pages", {"sha": c["sha"], "force": False})
print(f"commit {c['sha']}")

for i in range(60):
    b = req("GET", f"{API}/pages/builds/latest")
    if b.get("commit") == c["sha"] and b.get("status") == "built":
        st = urllib.request.urlopen(urllib.request.Request(SITE_URL, headers={"User-Agent": "cola"}))
        if st.status == 200:
            print(f"LIVE: {SITE_URL}")
            break
    elif b.get("commit") == c["sha"] and b.get("status") not in ("building", "built"):
        print("build error:", b.get("message")); break
    time.sleep(5)
