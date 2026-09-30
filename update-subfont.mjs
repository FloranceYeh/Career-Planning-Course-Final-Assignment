import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const WORK = path.join(ROOT, '.subfont-work');
const OUT = path.join(WORK, 'out');
const HTML_FILE = path.join(ROOT, 'index.html');
const CSS_FILE = path.join(ROOT, 'styles.css');
const JS_FILE = path.join(ROOT, 'script.js');
const SUBSET_DIR = path.join(ROOT, 'subfont');
const FONT_FILE = path.join(ROOT, 'fonts', 'LXGWWenKaiMono-Regular.ttf');
const FAMILY = 'LXGWWenKaiMono';
const LINK_RE = /<link rel="stylesheet" href="\/subfont\/fonts-[0-9a-f]+\.css">/;

function die(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------- 依赖定位
function loadSubfont() {
  const candidates = [
    path.join(ROOT, 'node_modules'),
    process.env.APPDATA ? path.join(process.env.APPDATA, 'npm', 'node_modules') : null,
    path.join(path.dirname(process.execPath), 'node_modules'),
    path.join(path.dirname(process.execPath), '..', 'lib', 'node_modules'),
    '/usr/local/lib/node_modules',
    '/usr/lib/node_modules',
  ].filter(Boolean);

  for (const base of candidates) {
    const pkgJson = path.join(base, '@turntrout', 'subfont', 'package.json');
    if (!fs.existsSync(pkgJson)) continue;
    const req = createRequire(pkgJson);
    return req(path.join(base, '@turntrout', 'subfont'));
  }

  // 最后再问一次 npm 全局目录
  try {
    const out = execFileSync(
      process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'npm',
      process.platform === 'win32' ? ['/c', 'npm root -g'] : ['root', '-g'],
      { encoding: 'utf8' }
    ).trim();
    const pkgJson = path.join(out, '@turntrout', 'subfont', 'package.json');
    if (fs.existsSync(pkgJson)) {
      const req = createRequire(pkgJson);
      return req(path.join(out, '@turntrout', 'subfont'));
    }
  } catch {
    /* ignore */
  }

  die(
    '找不到 @turntrout/subfont。请先安装：\n' +
      '  npm install -g @turntrout/subfont\n' +
      `（当前尝试过：${candidates.join('、')}）`
  );
}

for (const f of [HTML_FILE, CSS_FILE, FONT_FILE]) {
  if (!fs.existsSync(f)) die(`缺少文件：${path.relative(ROOT, f)}`);
}

const subfont = loadSubfont();

// ---------------------------------------------------- 1. 准备临时工作副本
fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(path.join(WORK, 'fonts'), { recursive: true });

const html = fs.readFileSync(HTML_FILE, 'utf8');
const existingLink = html.match(LINK_RE);
fs.writeFileSync(path.join(WORK, 'index.html'), existingLink ? html.replace(existingLink[0], '') : html);

let css = fs.readFileSync(CSS_FILE, 'utf8');
css = css.replace(/@font-face\s*\{[^}]*\}\s*/g, ''); // 去掉已有的 @font-face
css = css.replace(new RegExp(`(["'])${FAMILY}__subset\\1`, 'g'), `"${FAMILY}"`);
const fullFontFace = `@font-face {
    font-family: "${FAMILY}";
    src: url("./fonts/${path.basename(FONT_FILE)}") format("truetype");
    font-weight: 400;
    font-style: normal;
    font-display: swap;
}

`;
fs.writeFileSync(path.join(WORK, 'styles.css'), fullFontFace + css);
fs.copyFileSync(FONT_FILE, path.join(WORK, 'fonts', path.basename(FONT_FILE)));

if (!existingLink) console.log('· index.html 里没有子集样式表链接，本次会新插入一个');

// ---------------------------------------------------- 2. 汇总页面上会用到的字
const unescapeHtml = (s) =>
  s.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');
const pageChars = unescapeHtml(html) + (fs.existsSync(JS_FILE) ? fs.readFileSync(JS_FILE, 'utf8') : '');
const extraText = [...new Set(pageChars)].join('');
const printable = (ch) => ch.codePointAt(0) > 0x1f || ch === ' ';

console.log(`· 共 ${[...new Set(pageChars)].filter(printable).length} 个字符需要覆盖`);

// ---------------------------------------------------- 3. 跑 subfont
console.log('· 正在生成子集…');
await subfont(
  {
    inputFiles: [path.join(WORK, 'index.html')],
    root: WORK,
    output: OUT,
    fallbacks: false, // 不做“完整字体兜底”，保持单文件、单次请求
    fontDisplay: 'swap',
    text: extraText, // 见文件头注释：补上 subfont 自己收集不到的字
  },
  console
);

// ---------------------------------------------------- 4. 校验
const generated = fs.readdirSync(path.join(OUT, 'subfont')).filter((f) => /^fonts-[0-9a-f]+\.css$/.test(f));
if (generated.length !== 1) die(`预期生成 1 个 CSS，实际得到：${generated.join(', ') || '（无）'}`);
const newName = generated[0];
const newCss = fs.readFileSync(path.join(OUT, 'subfont', newName), 'utf8');

if ((newCss.match(/@font-face/g) || []).length !== 1) die('生成的 CSS 里 @font-face 数量异常');
const b64 = newCss.match(/base64,([A-Za-z0-9+/=]+)\)/);
if (!b64) die('生成的 CSS 里没有内嵌字体数据');
if (Buffer.from(b64[1].slice(0, 16), 'base64').toString('latin1').slice(0, 4) !== 'wOF2') {
  die('内嵌数据不是合法的 woff2');
}

const ranges = [...newCss.matchAll(/u\+([0-9a-f]+)(?:-([0-9a-f]+))?/gi)].map((m) => [
  parseInt(m[1], 16),
  m[2] ? parseInt(m[2], 16) : parseInt(m[1], 16),
]);
const covered = (cp) => ranges.some(([lo, hi]) => cp >= lo && cp <= hi);
const used = [...new Set(pageChars)].filter(printable);
const missing = used.filter((ch) => !covered(ch.codePointAt(0)));
if (missing.length) die(`子集没有覆盖这些字符：${missing.join(' ')}`);

// ---------------------------------------------------- 5. 安装
const oldFiles = fs.existsSync(SUBSET_DIR)
  ? fs.readdirSync(SUBSET_DIR).filter((f) => /^fonts-[0-9a-f]+\.css$/.test(f))
  : [];
const oldSize = oldFiles.reduce((n, f) => n + fs.statSync(path.join(SUBSET_DIR, f)).size, 0);
fs.mkdirSync(SUBSET_DIR, { recursive: true });
for (const f of oldFiles) fs.rmSync(path.join(SUBSET_DIR, f), { force: true });
fs.copyFileSync(path.join(OUT, 'subfont', newName), path.join(SUBSET_DIR, newName));

const newTag = `<link rel="stylesheet" href="/subfont/${newName}">`;
const live = fs.readFileSync(HTML_FILE, 'utf8');
const updated = existingLink
  ? live.replace(existingLink[0], newTag)
  : live.replace('<link rel="stylesheet" href="./styles.css">', `${newTag}<link rel="stylesheet" href="./styles.css">`);
if (updated === live) die('没能更新 index.html 里的样式表链接，请检查该行是否被改过');
fs.writeFileSync(HTML_FILE, updated);

fs.rmSync(WORK, { recursive: true, force: true });

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`
✔ 完成
  新子集   subfont/${newName}  ${kb(newCss.length)}
  字符数   ${ranges.reduce((n, [lo, hi]) => n + (hi - lo + 1), 0)} 个码位（覆盖页面全部 ${used.length} 个字符）
  旧文件   ${oldFiles.length ? `${oldFiles.join('、')} 已删除（${kb(oldSize)}）` : '无'}
  index.html 链接已指向 /subfont/${newName}
`);
