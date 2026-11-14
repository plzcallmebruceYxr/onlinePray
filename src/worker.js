/**
 * 心愿墙（原祈愿墙）— Cloudflare Workers + D1 版
 *
 * 路由（与 wall_app/server.js 行为一致）：
 *   GET  /healthz            -> "ok"
 *   GET  /api/wishes?limit=  -> {total, items:[{id,name,text,ts}]} 最新在前
 *   POST /api/wishes {name?,text} -> 201 {ok:true, item}
 * 其余路径交给 Static Assets（public/index.html + assets/bg.jpg）。
 *
 * 与旧版的三处刻意差异：
 *   1. 存储从 append-only JSONL 改为 D1(SQLite) 表 wishes。
 *   2. 限流从进程内 Map 改为查 D1：同 ip_hash 60 秒内写入 ≤3 条。
 *      Worker 多 isolate + 冷启动会丢内存状态，D1 才是持久的。
 *   3. 客户端 IP 只存 sha256 哈希（ip_hash），不落明文。
 */
import {
  MAX_TEXT, MAX_NAME, RATE_WINDOW_MS, RATE_MAX, MAX_BODY,
  clean, checkText, json, clientIp, hashIp, randId,
} from './lib.js';

async function handleGetWishes(request, env) {
  const u = new URL(request.url);
  const raw = parseInt(u.searchParams.get('limit') || '50', 10) || 50;
  const limit = Math.min(Math.max(raw, 1), 200);

  const totalRow = await env.DB.prepare('SELECT COUNT(*) AS n FROM wishes').first();
  const total = Number(totalRow?.n ?? 0);
  const { results } = await env.DB
    .prepare('SELECT id, name, text, created_at FROM wishes ORDER BY created_at DESC, id DESC LIMIT ?1')
    .bind(limit)
    .all();

  const items = (results || []).map(r => ({ id: r.id, name: r.name, text: r.text, ts: r.created_at }));
  return json({ total, items });
}

async function handlePostWish(request, env) {
  const now = Date.now();
  const ipHash = await hashIp(clientIp(request), env.IP_SALT);

  const hit = await env.DB
    .prepare('SELECT COUNT(*) AS n FROM wishes WHERE ip_hash = ?1 AND created_at > ?2')
    .bind(ipHash, now - RATE_WINDOW_MS)
    .first();
  if (Number(hit?.n ?? 0) >= RATE_MAX) return json({ error: '留灯太快了，歇一会儿再来' }, 429);

  let body;
  try { body = await request.text(); } catch { return json({ error: '请求格式有误' }, 400); }
  if (body.length > MAX_BODY) return json({ error: '请求格式有误' }, 400);

  let o;
  try { o = JSON.parse(body || '{}'); } catch { return json({ error: '请求格式有误' }, 400); }

  const text = clean(o.text, MAX_TEXT);
  const name = clean(o.name, MAX_NAME) || '匿名';
  const bad = checkText(text);
  if (bad) return json({ error: bad }, 400);

  const item = { id: randId(), name, text, ts: now };
  try {
    await env.DB
      .prepare('INSERT INTO wishes (id, name, text, ip_hash, created_at) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind(item.id, name, text, ipHash, now)
      .run();
  } catch (e) {
    return json({ error: '心愿暂存失败，请稍后再试' }, 500);
  }
  return json({ ok: true, item }, 201);
}

export default {
  async fetch(request, env) {
    const u = new URL(request.url);
    const p = u.pathname;

    if (p === '/healthz') {
      return new Response('ok', {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    if (p === '/api/wishes' && request.method === 'GET') {
      try { return await handleGetWishes(request, env); }
      catch (e) { return json({ error: '读取失败，请稍后再试' }, 500); }
    }

    if (p === '/api/wishes' && request.method === 'POST') {
      try { return await handlePostWish(request, env); }
      catch (e) { return json({ error: '心愿暂存失败，请稍后再试' }, 500); }
    }

    if (p === '/api/wishes') return json({ error: 'method not allowed' }, 405);

    if (env.ASSETS) return env.ASSETS.fetch(request);
    return json({ error: 'not found' }, 404);
  },
};
