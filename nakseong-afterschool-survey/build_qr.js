// 교실에 붙이거나 나눠 줄 QR 안내장(A4 1쪽) 만들기
// 사용: node build_qr.js <설문 주소> <out.pdf>
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { chromium } = require('playwright');

const [, , url, outPath] = process.argv;
if (!url || !outPath) { console.error('사용: node build_qr.js <설문 주소> <out.pdf>'); process.exit(1); }
const FONT_DIR = path.join(__dirname, 'node_modules', '@fontsource');
const fontCss = ['jua', 'gowun-dodum'].map((f) => `<link rel="stylesheet" href="file://${path.join(FONT_DIR, f, 'index.css')}">`).join('');

(async () => {
  const qr = await QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 0, color: { dark: '#22332a', light: '#ffffff' } });
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">${fontCss}<style>
:root { --ink:#22332a; --soft:#5d6f64; --leaf:#2f8f5b; --sprout:#cfe9c3; --sun:#ffc93c; --paper:#fffdf5; --line:#e4e6d8;
  --display:'Jua','Gowun Dodum',sans-serif; --body:'Gowun Dodum','Jua',sans-serif; }
@page { size: A4; margin: 0; }
* { box-sizing: border-box; margin: 0; }
body { font-family: var(--body); color: var(--ink); background: var(--paper); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 210mm; height: 297mm; padding: 20mm 18mm 16mm; display: flex; flex-direction: column; align-items: center; gap: 9mm; text-align: center; }
.eyebrow { font-size: 13pt; color: var(--soft); letter-spacing: .04em; }
h1 { font-family: var(--display); font-weight: 400; font-size: 40pt; line-height: 1.2; }
h1 em { font-style: normal; color: var(--leaf); }
.qr { background: #fff; border: 1.2mm solid var(--leaf); border-radius: 9mm; padding: 9mm; width: 112mm; height: 112mm; }
.qr svg { width: 100%; height: 100%; display: block; }
.url { font-size: 13pt; color: var(--soft); }
.url b { font-family: ui-monospace, monospace; color: var(--ink); font-weight: 600; letter-spacing: .02em; }
.steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5mm; width: 100%; }
.step { background: var(--sprout); border-radius: 6mm; padding: 6mm 4mm; display: flex; flex-direction: column; align-items: center; gap: 3mm; font-size: 14pt; line-height: 1.45; }
.num { width: 12mm; height: 12mm; border-radius: 50%; background: var(--sun); display: grid; place-items: center; font-family: var(--display); font-size: 18pt; }
.note { margin-top: auto; font-size: 13pt; color: var(--soft); line-height: 1.6; }
.note b { color: var(--ink); font-family: var(--display); font-weight: 400; }
</style></head><body><div class="page">
  <p class="eyebrow">낙성초등학교 방과후학교 · 3~6학년</p>
  <h1>방과후 수업,<br><em>내 생각을 들려줘요</em></h1>
  <div class="qr">${qr}</div>
  <p class="url">QR이 안 되면 주소를 직접 쳐요 &nbsp;<b>${url.replace(/^https?:\/\//, '')}</b></p>
  <div class="steps">
    <div class="step"><span class="num">1</span>카메라로<br>QR을 비춰요</div>
    <div class="step"><span class="num">2</span>나온 주소를<br>눌러요</div>
    <div class="step"><span class="num">3</span>내 생각대로<br>골라요</div>
  </div>
  <p class="note"><b>이름은 쓰지 않아요.</b> 누가 답했는지 아무도 몰라요.<br>정답은 없으니 솔직하게 답해 주세요. 한 사람이 한 번만 답해요.</p>
</div></body></html>`;
  const htmlPath = path.resolve(outPath).replace(/\.pdf$/, '.html');
  fs.writeFileSync(htmlPath, html);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
  await page.goto('file://' + htmlPath);
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.evaluate(() => { const p = document.querySelector('.page'); return p.scrollHeight - p.clientHeight; });
  await page.pdf({ path: outPath, format: 'A4', printBackground: true });
  await page.screenshot({ path: outPath.replace(/\.pdf$/, '.png') });
  await browser.close();
  console.log('overflow px:', overflow);
})();
