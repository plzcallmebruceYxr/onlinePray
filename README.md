# 祈愿墙 P1（零依赖 Node）

单容器服务：Node 内置 http，无 npm 依赖，数据落在挂载卷的 `wishes.jsonl`（append-only）。

## 本地跑

```bash
DATA_DIR=./data PORT=8701 node server.js
curl -s localhost:8701/healthz
curl -s -X POST localhost:8701/api/wishes -H 'Content-Type: application/json' -d '{"name":"测试","text":"愿家人平安"}'
curl -s 'localhost:8701/api/wishes?limit=5'
```

## 部署（Northflank）

- 服务类型：Deployment / Service（HTTP）
- 端口：3000（或设 `PORT`）
- 卷：挂到 `/data`，环境变量 `DATA_DIR=/data`
- 静态资源：`public/`（含 `assets/bg.jpg` 背景图）

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/healthz` | 健康检查 |
| GET | `/api/wishes?limit=60` | `{total, items:[{id,name,text,ts}]}` 最新在前 |
| POST | `/api/wishes` | `{name?,text}`，text ≤60 字；同 IP 3 次/分；脏词与网址拦截 |

## 已知边界（P1）

- 频控是进程内内存计数，多副本时按实例各自计
- 脏词表是硬编码最小集，正式版需接审核队列 + 后台管理
- 无删除/举报入口
