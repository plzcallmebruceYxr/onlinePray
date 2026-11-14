import { clean, checkText, hashIp, MAX_TEXT, MAX_NAME } from '../src/lib.js';

let pass = 0, fail = 0;
function eq(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`PASS  ${label}`); }
  else { fail++; console.log(`FAIL  ${label}\n  got : ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`); }
}

console.log('--- clean()');
eq('截断到 60 字', clean('a'.repeat(80), MAX_TEXT).length, 60);
eq('控制字符直接删除（不产生空格）', clean('愿\u0000你\u001f好', MAX_TEXT), '愿你好');
eq('空白折叠+去首尾', clean('  愿   你 好  ', MAX_TEXT), '愿 你 好');
eq('非字符串返回空串', clean(null, MAX_TEXT), '');
eq('name 截断到 12', clean('一二三四五六七八九十十一十二十三', MAX_NAME), '一二三四五六七八九十十一');

console.log('--- checkText()');
eq('空 -> 报错', checkText(''), '心愿内容不能为空');
eq('正常中文通过', checkText('愿家人平安健康'), null);
eq('中英数标点通过', checkText("愿 2026 平安，健康！ok? yes.'"), null);
eq('网址拦截', checkText('看看 www.abc.com'), '请勿留网址或联系方式');
eq('裸域名拦截', checkText('去abc.cn看看'), '请勿留网址或联系方式');
eq('加微拦截', checkText('加微聊'), '请勿留网址或联系方式');
eq('脏词拦截', checkText('fuck this'), '内容包含不适宜词语');
eq('脏词大小写', checkText('FUCK'), '内容包含不适宜词语');
eq('尖括号拦截', checkText('<script>x</script>'), '请勿使用特殊符号');
eq('方括号拦截', checkText('愿[你]好'), '请勿使用特殊符号');
eq('纯 emoji 拦截（不支持字符）', checkText('🙏🙏'), '内容包含不支持的字符');
eq('61 字 -> 长度错误（clean 后仍是 61）', checkText('a'.repeat(61)), '最多 60 字');

console.log('--- hashIp()');
const h1 = await hashIp('1.2.3.4', 'salt');
const h2 = await hashIp('1.2.3.4', 'salt');
const h3 = await hashIp('1.2.3.4', 'other');
eq('同 ip 同盐稳定', h1, h2);
eq('sha256 长度 64', h1.length, 64);
eq('不同盐不同哈希', h1 === h3, false);
eq('不含原始 IP', h1.includes('1.2.3.4'), false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
