# 心愿墙（原祈愿墙）

一个极简的公开留言页：任何人写一句话（≤60 字，可匿名），下面按时间列出。
后端只做四件事：字数/脏词/URL 过滤、同 IP 限流、只存 IP 的 sha256（不存明文 IP）、静态资源与 API 同域。

页面性质声明已内嵌在页脚：文化虚拟空间 · 非宗教场所 · 不提供任何宗教服务。

## 现行部署：Cloudflare Workers + D1 + Static Assets（免费档，未绑卡）

```
.
├── wrangler.example.toml   # 复制为 wrangler.toml 后填三个占位符
├── schema.sql              # D1 建表
├── src/worker.js           # 路由：/api/wishes GET/POST、/healthz
├── src/lib.js              # 文本校验 + 限流键计算（纯函数，可单测）
├── public/index.html       # 前端（只用 textContent 渲染，杜绝注入）
├── public/assets/bg.jpg    # 背景图（本地 AI 生成，无第三方版权链）
└── test/lib.test.mjs       # node --test
```

部署步骤：

```bash
cp wrangler.example.toml wrangler.toml
wrangler d1 create online_pray                 # 记下 database_id 填进 wrangler.toml
wrangler secret put IP_SALT                    # 随机串；不要写进 wrangler.toml
wrangler d1 execute online_pray --remote --file=./schema.sql
wrangler deploy
```

> 沙箱环境里 wrangler 需要可写的 HOME/TMP：
> `XDG_CONFIG_HOME=$PWD/.cfg TMPDIR=$PWD/.tmp WRANGLER_SEND_METRICS=false wrangler deploy`

已知坑（都踩过）：

- 部署前必须完成账号邮箱验证，否则报 `10034 / You need to verify your email address`。
- 首次 deploy 若要注册 `*.workers.dev` 子域，非交互模式下 wrangler 会答 "no"；用 API 注册：
  `PUT /accounts/<account_id>/workers/subdomain` body `{"subdomain":"<name>"}`。
- URL 形如 `<worker名>.<账号子域>.workers.dev`，两段都可改，但方式不同：
  - 改 **worker 名**：改 `wrangler.toml` 的 `name` 后 `wrangler deploy`（等于新建+删旧），
    D1/Secrets 按名字绑定、数据不受影响，但要记得把旧 worker 删掉。
  - 改 **账号子域**：`PUT .../workers/subdomain` 只会「创建」，已有子域时报 `10036`；
    正确顺序是先 `DELETE .../workers/subdomain` 再 `PUT` 新名（本仓库实测可用）。
- 新子域签发证书需要时间，期间 HTTPS 会 `SSL handshake failure`，HTTP 已可用；
  别据此判定 Worker 挂了，先用 `http://` 验证 Worker 本身在服务。
- 改 CSS 后务必确认浏览器实际解析出的规则数（`document.styleSheets[0].cssRules.length`）。
  一个漏掉的 `%)` 会让浏览器从那条起**静默丢弃所有样式规则**，且不报错。

## 备用形态：零依赖 Node（`node/`）

同一套界面与规则的本机版：Node 内置 `http`，无 npm 依赖，数据落在挂载卷的 `wishes.jsonl`（append-only）。
适合放到自己的 VPS/容器里跑（大陆自建需自行处理 ICP 备案与留言实名/先审要求）。

```bash
DATA_DIR=./data PORT=8701 node node/server.js
curl -s localhost:8701/healthz
curl -s -X POST localhost:8701/api/wishes -H 'Content-Type: application/json' -d '{"name":"测试","text":"愿家人平安"}'
curl -s 'localhost:8701/api/wishes?limit=5'
```

`node/Dockerfile` 是这份的镜像定义；`node/public_index.html` 是它配套的旧版页面。
Northflank 等容器平台部署时：端口 `PORT`（默认 3000）、卷挂 `/data` 并设 `DATA_DIR=/data`。

## 接口（两种形态一致）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/healthz` | 健康检查 |
| GET | `/api/wishes?limit=60` | `{total, items:[{id,name,text,ts}]}` 最新在前 |
| POST | `/api/wishes` | `{name?,text}`，text ≤60 字；同 IP 3 次/分；脏词与网址拦截 |

## 数据与隐私

- 留言正文与署名明文存；来源 IP 只存 `sha256(IP + IP_SALT)`，无法反推。
- 无 cookie、无第三方脚本、无分析埋点、无外部 CDN。
- 想清库：`wrangler d1 execute <db> --remote --command "DELETE FROM wishes"`。

## 已知边界

- Node 版频控是进程内内存计数，多副本时按实例各自计；Workers 版把计数写进 D1，跨实例共享。
- 脏词表是硬编码最小集；若要正式上线公开留言，需要审核队列（先审后放）+ 举报/删除入口。
- 无删除/举报入口（若面向公众，这是合规必补项）。
