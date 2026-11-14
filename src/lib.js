export const MAX_TEXT = 60, MAX_NAME = 12;
export const RATE_WINDOW_MS = 60 * 1000, RATE_MAX = 3;
export const MAX_BODY = 4096;

export const BANNED = ['习近平', '共产党', '法轮', '六四', '台独', '港独', '傻逼', '操你', '日你', '尼玛', 'fuck', 'shit', 'nigger'];
export const URL_RE = /https?:\/\/|www\.|\.com|\.cn|加微|加v|薇信|代开|博彩|赌博|贷款|发票/i;

export function clean(s, max) {
  if (typeof s !== 'string') return '';
  return s.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function checkText(text) {
  if (!text) return '心愿内容不能为空';
  if (text.length > MAX_TEXT) return `最多 ${MAX_TEXT} 字`;
  const low = text.toLowerCase();
  for (const w of BANNED) if (low.includes(w.toLowerCase())) return '内容包含不适宜词语';
  if (/[<>{}[\]]/.test(text)) return '请勿使用特殊符号';
  if (URL_RE.test(text)) return '请勿留网址或联系方式';
  if (!/[\u4e00-\u9fa5A-Za-z0-9，。！？、；：,.!?;:'"“”‘’（）()\-—…~～\s]/.test(text)) return '内容包含不支持的字符';
  return null;
}

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function clientIp(req) {
  const f = (req.headers.get('CF-Connecting-IP') || '').trim();
  if (f) return f;
  const xff = (req.headers.get('X-Forwarded-For') || '').split(',')[0].trim();
  return xff || 'unknown';
}

export async function hashIp(ip, salt) {
  const data = new TextEncoder().encode(`${salt || ''}|${ip}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function randId() {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}
