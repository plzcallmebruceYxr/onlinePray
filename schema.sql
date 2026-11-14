-- 祈愿墙 D1 schema
-- 应用：npx wrangler d1 execute online_pray --file=./schema.sql --remote
-- 本地：npx wrangler d1 execute online_pray --file=./schema.sql --local

CREATE TABLE IF NOT EXISTS wishes (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  text       TEXT NOT NULL,
  ip_hash    TEXT NOT NULL,
  created_at INTEGER NOT NULL           -- Unix 毫秒时间戳，与旧版 server.js 的 ts 一致
);

-- 列表查询：最新在前
CREATE INDEX IF NOT EXISTS idx_wishes_created_at ON wishes (created_at DESC);
-- 限流查询：同 ip_hash 最近 60s 的条数
CREATE INDEX IF NOT EXISTS idx_wishes_ip_time ON wishes (ip_hash, created_at);
