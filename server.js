/**
 * 祈愿墙 P1 — 零依赖 Node 服务
 * 存储：append-only JSONL（挂载卷 /data/wishes.jsonl），写入即追加，读时逐行解析，无重写风险。
 * 接口：
 *   GET  /healthz            -> ok
 *   GET  /api/wishes?limit=  -> {total, items:[{id,name,text,ts}]}  最新在前
 *   POST /api/wishes {name?,text}
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'wishes.jsonl');
const PUB = path.join(__dirname, 'public');

const MAX_TEXT = 60, MAX_NAME = 12;
const RATE_WINDOW_MS = 60 * 1000, RATE_MAX = 3;
const hits = new Map(); // ip -> [ts]

// 极简脏词/违规过滤（P1 先挡明显的，后续接审核队列）
const BANNED = ['习近平', '共产党', '法轮', '六四', '台独', '港独', '傻逼', '操你', '日你', '尼玛', 'fuck', 'shit', 'nigger'];
const URL_RE = /https?:\/\/|www\.|\.com|\.cn|加微|加v|薇信|代开|博彩|赌博|贷款|发票/i;

fs.mkdirSync(DATA_DIR, { recursive: true });

function readWishes(limit = 50) {
  let raw = '';
  try { raw = fs.readFileSync(DATA_FILE, 'utf8'); } catch (e) { return { total: 0, items: [] }; }
  const lines = raw.split('\n');
  const items = [];
  let total = 0;
  for (const l of lines) {
    if (!l.trim()) continue;
    try {
      const o = JSON.parse(l);
      total++;
      items.push(o);
    } catch (e) { /* 跳过半行 */ }
  }
  return { total, items: items.slice(-limit).reverse() };
}

function clean(s, max) {
  if (typeof s !== 'string') return '';
  return s.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function checkText(text) {
  if (!text) return '祈愿内容不能为空';
  if (text.length > MAX_TEXT) return `最多 ${MAX_TEXT} 字`;
  const low = text.toLowerCase();
  for (const w of BANNED) if (low.includes(w.toLowerCase())) return '内容包含不适宜词语';
  if (/[<>{}[\]]/.test(text)) return '请勿使用特殊符号';
  if (URL_RE.test(text)) return '请勿留网址或联系方式';
  if (!/[\u4e00-\u9fa5A-Za-z0-9，。！？、；：,.!?;:'"“”‘’（）()\-—…~～\s]/.test(text)) return '内容包含不支持的字符';
  return null;
}

function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) { hits.set(ip, arr); return true; }
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return false;
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp' };

function send(res, code, body, type = 'application/json; charset=utf-8') {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  res.writeHead(code, { 'Content-Type': type, 'Content-Length': buf.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(buf);
}

function clientIp(req) {
  const f = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return f || req.socket.remoteAddress || 'unknown';
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const p = u.pathname;

  if (p === '/healthz') return send(res, 200, 'ok', 'text/plain; charset=utf-8');

  if (p === '/api/wishes' && req.method === 'GET') {
    const limit = Math.min(Math.max(parseInt(u.searchParams.get('limit') || '50', 10) || 50, 1), 200);
    return send(res, 200, readWishes(limit));
  }

  if (p === '/api/wishes' && req.method === 'POST') {
    if (rateLimited(clientIp(req))) return send(res, 429, { error: '祈愿太快了，歇一会儿再来' });
    let body = '';
    req.on('data', d => { body += d; if (body.length > 4096) req.destroy(); });
    req.on('end', () => {
      let o;
      try { o = JSON.parse(body || '{}'); } catch (e) { return send(res, 400, { error: '请求格式有误' }); }
      const text = clean(o.text, MAX_TEXT);
      const name = clean(o.name, MAX_NAME) || '匿名';
      const bad = checkText(text);
      if (bad) return send(res, 400, { error: bad });
      const item = { id: crypto.randomBytes(6).toString('hex'), name, text, ts: Date.now() };
      try {
        fs.appendFileSync(DATA_FILE, JSON.stringify(item) + '\n');
      } catch (e) {
        return send(res, 500, { error: '祈愿暂存失败，请稍后再试' });
      }
      return send(res, 201, { ok: true, item });
    });
    return;
  }

  // 静态文件
  let file = p === '/' ? '/index.html' : p;
  file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(PUB, file);
  if (!full.startsWith(PUB)) return send(res, 403, { error: 'forbidden' });
  fs.readFile(full, (err, buf) => {
    if (err) return send(res, 404, { error: 'not found' });
    send(res, 200, buf, MIME[path.extname(full).toLowerCase()] || 'application/octet-stream');
  });
});

server.listen(PORT, '0.0.0.0', () => console.log(`wish wall on :${PORT} data=${DATA_FILE}`));
