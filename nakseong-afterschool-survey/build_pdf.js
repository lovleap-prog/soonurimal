// 학부모·학생 공유용 PDF 만들기
// 사용: node build_pdf.js <students.csv> <responses.json> <out.pdf> [--sample]
// 강사 관련 문항(q7, t2, c1의 선생님 보기), 수업별 결과, 개방형 원문은 넣지 않는다(교원용 대시보드에만 둔다).
// 학년은 3·4 / 5·6 두 묶음.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const [, , studentsPath, responsesPath, outPath, flag] = process.argv;
const SAMPLE = flag === '--sample';
const FONT_DIR = path.join(__dirname, 'node_modules', '@fontsource');

const num = (v) => { const s = String(v ?? '').trim(); const n = Number(s); return s !== '' && Number.isInteger(n) && n >= 1 && n <= 5 ? n : null; };
const readCsv = (f) => {
  const [h, ...ls] = fs.readFileSync(f, 'utf8').replace(/\r/g, '').trim().split('\n');
  const H = h.split(',');
  return ls.map((l) => { const c = l.split(','); return Object.fromEntries(H.map((k, i) => [k, c[i] === '' || c[i] === undefined ? null : c[i]])); });
};
const students = readCsv(studentsPath).map((s) => ({ rid: String(s.rid).trim(), grade: Number(s.grade), a1: num(s.a1), a2: num(s.a2), a3: num(s.a3) }));
const ITEMS = ['q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10', 'q11'];
const responses = JSON.parse(fs.readFileSync(responsesPath, 'utf8')).map((r) => {
  const q = Object.fromEntries(ITEMS.map((k) => [k, num(r[k])]));
  const contradict = q.q4 != null && q.q10 != null && ((q.q4 >= 4 && q.q10 >= 4) || (q.q4 <= 2 && q.q10 <= 2));
  const answered = ITEMS.map((k) => q[k]).filter((v) => v != null);
  const straight = answered.length >= 6 && answered.every((v) => v === answered[0]);
  return { rid: String(r.rid).trim(), program: String(r.program).trim(), ...q, p1: num(r.p1), q12: r.q12 || null, c1: r.c1 || null, flagged: contradict || straight };
});
const used = responses.filter((r) => !r.flagged);
const flaggedN = responses.length - used.length;

// 세 묶음으로 세기: 그래요(4~5) / 보통(3) / 아니에요(1~2)
const tally = (vals) => { const v = vals.filter((x) => x != null); return { n: v.length, yes: v.filter((x) => x >= 4).length, mid: v.filter((x) => x === 3).length, no: v.filter((x) => x <= 2).length }; };
const low = students.filter((s) => s.grade <= 4), high = students.filter((s) => s.grade >= 5);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dots = (t, cls = '', fit = null) => `<span class="dots ${cls}"${cls && !fit ? '' : ` style="--s:${Math.min(fit ? fit[1] : 6.2, (fit ? fit[0] : 168) / (1.26 * Math.max(1, t.n))).toFixed(2)}mm"`} aria-hidden="true">${'<i class="d yes"></i>'.repeat(t.yes)}${'<i class="d mid"></i>'.repeat(t.mid)}${'<i class="d no"></i>'.repeat(t.no)}</span>`;
const count = (t) => `<span class="count"><b>${t.n}명</b> 중 <b class="hi">${t.yes}명</b></span>`;

const common = [
  ['a1', '방과후 수업 시간이 있는 것이 좋아요', '좋다고 답했어요', 'good'],
  ['a2', '정규 수업이 끝나고 학교에 더 남아 있는 것이 힘들어요', '힘들다고 답했어요', 'care'],
  ['a3', '방과후 수업도 공부하는 시간처럼 느껴져요', '그렇다고 답했어요', 'care'],
].map(([k, text, tail, tone]) => {
  const t = tally(students.map((s) => s[k]));
  return `<div class="stmt ${tone}"><p class="q">“${text}”</p><div class="row">${dots(t)}</div><p class="a">${count(t)}이 ${tail}</p></div>`;
}).join('');

const groupRow = (label, list) => { const t = tally(list.map((s) => s.a1)); return `<div class="grp"><span class="glabel">${label}</span>${dots(t, 'sm')}<span class="gtext">${count(t)}</span></div>`; };

// 바뀌었으면 하는 것: 선생님 관련 보기는 싣지 않는다
const WISH = [['하는 활동이나 배우는 내용', '활동이나 배우는 내용'], ['수업 시간이나 요일', '수업 시간이나 요일'], ['준비물·악기·장소', '준비물·악기·장소'], ['바뀌었으면 하는 것 없음', '지금 그대로 좋아요']];
const withC1 = used.filter((r) => r.c1);
const wishRows = WISH.map(([key, label]) => ({ label, n: withC1.filter((r) => r.c1.split(',').map((s) => s.trim()).includes(key)).length }));
const wishMax = Math.max(1, ...wishRows.map((w) => w.n));
const wish = wishRows.map((w) => `<div class="bar"><span class="bl">${w.label}</span><span class="bt"><i style="width:${(w.n / wishMax) * 100}%"></i></span><span class="bn">${w.n}번</span></div>`).join('');

// 좋았던 것: 낱말 규칙으로 분류한 건수만 (원문은 싣지 않는다)
const LIKE = [['직접 해 보는 것', /직접|해 봤|타는|치는|연주|그리|그린|만들|쳐 봤/], ['할 수 있게 된 것', /할 수 있게|잡을 수 있게|처음으로|배웠|외울 수|됐어요/], ['친구와 함께한 것', /친구|같이|함께/], ['발표와 전시', /발표|공연|걸려|전시/], ['소리와 느낌', /소리|신나|기뻤/]];
const liked = used.filter((r) => r.q12);
const likeRows = LIKE.map(([label, re]) => ({ label, n: liked.filter((r) => re.test(r.q12)).length })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 4);
const likes = likeRows.map((l) => `<span class="chip">${l.label} <b>${l.n}</b></span>`).join('');

// 사진: photos/ 폴더에 넣은 이미지를 3장까지 싣는다(저장소에는 올리지 않는다). 없으면 시안에서만 자리 표시.
const PHOTO_DIR = path.join(__dirname, 'photos');
const photoFiles = fs.existsSync(PHOTO_DIR) ? fs.readdirSync(PHOTO_DIR).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort().slice(0, 3) : [];
const photos = photoFiles.length
  ? `<div class="photos">${photoFiles.map((f) => `<img src="file://${path.join(PHOTO_DIR, f)}" alt="">`).join('')}</div>`
  : SAMPLE ? '<div class="photos"><div class="ph">방과후 수업 사진 자리</div><div class="ph">방과후 수업 사진 자리</div><div class="ph">방과후 수업 사진 자리</div></div>' : '';

const all = tally(students.map((s) => s.a1));
const fontCss = ['jua', 'gowun-dodum'].map((f) => `<link rel="stylesheet" href="file://${path.join(FONT_DIR, f, 'index.css')}">`).join('');

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">${fontCss}<style>
/* 배치: 알림장처럼 위에서 아래로. 학생 한 명 = 동그라미 하나. */
:root { --ink:#22332a; --soft:#5d6f64; --leaf:#2f8f5b; --sprout:#cfe9c3; --sun:#ffc93c; --persimmon:#ef8a4a; --paper:#fffdf5; --line:#e4e6d8; --sky:#e3f1f6;
  --display:'Jua','Gowun Dodum',sans-serif; --body:'Gowun Dodum','Jua',sans-serif; }
@page { size: A4; margin: 0; }
* { box-sizing: border-box; margin: 0; }
body { font-family: var(--body); color: var(--ink); background: var(--paper); font-size: 11pt; line-height: 1.55; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 210mm; height: 297mm; padding: 13mm 14mm 11mm; display: flex; flex-direction: column; gap: 6mm; page-break-after: always; position: relative; overflow: hidden; }
.page:last-child { page-break-after: auto; }
.sample { position: absolute; top: 9mm; right: -17mm; transform: rotate(35deg); background: var(--persimmon); color: #fff; font-family: var(--display); font-size: 10pt; padding: 1.5mm 20mm; letter-spacing: .05em; }
h1 { font-family: var(--display); font-weight: 400; font-size: 27pt; line-height: 1.2; text-wrap: balance; }
h1 em { font-style: normal; color: var(--leaf); }
h2 { font-family: var(--display); font-weight: 400; font-size: 16pt; display: flex; align-items: center; gap: 2.5mm; }
h2::before { content: ""; width: 4.5mm; height: 4.5mm; border-radius: 50%; background: var(--sun); flex: none; }
h3 { font-family: var(--display); font-weight: 400; font-size: 13pt; }
.eyebrow { font-size: 10pt; color: var(--soft); letter-spacing: .04em; }
.who { background: var(--sprout); border-radius: 5mm; padding: 4mm 6mm; display: flex; align-items: center; gap: 5mm; }
.who .big { font-family: var(--display); font-size: 30pt; line-height: 1; color: var(--leaf); white-space: nowrap; }
.who p { font-size: 11pt; }
.lead { font-size: 12.5pt; }
.lead b { font-family: var(--display); font-weight: 400; color: var(--leaf); font-size: 14pt; }
section { display: flex; flex-direction: column; gap: 3.5mm; }
.dots { display: inline-flex; flex-wrap: wrap; gap: calc(var(--s, 6.2mm) * .26); }
.d { width: var(--s, 6.2mm); height: var(--s, 6.2mm); border-radius: 50%; display: block; }
.dots.sm { --s: 3.6mm; gap: 1mm; }
.d.yes { background: var(--leaf); } .d.mid { background: var(--sprout); } .d.no { background: #fff; border: .45mm solid #b9c2b6; }
.care .d.yes { background: var(--persimmon); } .care .d.mid { background: #f9d9c2; }
.stmt { border: .4mm solid var(--line); background: #fff; border-radius: 4mm; padding: 4mm 5mm; display: flex; flex-direction: column; gap: 2.2mm; }
.stmt .q { font-family: var(--display); font-size: 13pt; }
.count b { font-family: var(--display); font-weight: 400; font-size: 13pt; }
.count .hi { color: var(--leaf); } .care .count .hi { color: #c9621f; }
.legend { display: flex; gap: 5mm; font-size: 9.5pt; color: var(--soft); align-items: center; flex-wrap: wrap; }
.legend span { display: inline-flex; align-items: center; gap: 1.5mm; }
.legend .d { --s: 3.6mm; }
.grps { background: var(--sky); border-radius: 4mm; padding: 4mm 5mm; display: flex; flex-direction: column; gap: 2.5mm; }
.grps > p { font-size: 10.5pt; }
.grp { display: grid; grid-template-columns: 22mm 1fr auto; align-items: center; gap: 3mm; }
.glabel { font-family: var(--display); font-size: 11.5pt; }
.two { display: grid; grid-template-columns: 1.15fr 1fr; gap: 5mm; }
.bar { display: grid; grid-template-columns: 40mm 1fr 10mm; align-items: center; gap: 2.5mm; font-size: 10.5pt; }
.bt { height: 4.2mm; background: #eef0e6; border-radius: 2.1mm; overflow: hidden; } .bt i { display: block; height: 100%; background: var(--sun); border-radius: 2.1mm; }
.bn { font-family: var(--display); text-align: right; }
.chips { display: flex; flex-wrap: wrap; gap: 2mm; }
.chip { background: var(--sprout); border-radius: 99mm; padding: 1.2mm 4mm; font-size: 10.5pt; } .chip b { font-family: var(--display); font-weight: 400; color: var(--leaf); margin-left: 1mm; }
.promise { border: .6mm dashed var(--leaf); border-radius: 4mm; padding: 4mm 5mm; display: flex; flex-direction: column; gap: 2mm; flex: 1; min-height: 20mm; }
.promise p { color: var(--soft); font-size: 10.5pt; }
.photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3.5mm; height: 52mm; }
.photos img, .photos .ph { width: 100%; height: 52mm; border-radius: 4mm; object-fit: cover; display: block; }
.photos .ph { background: var(--sky); color: var(--soft); font-size: 10pt; display: grid; place-items: center; }
.note { font-size: 8.8pt; color: var(--soft); line-height: 1.5; margin-top: auto; border-top: .3mm solid var(--line); padding-top: 2.5mm; }
.small { font-size: 9.5pt; color: var(--soft); }
</style></head><body>
<div class="page">
  ${SAMPLE ? '<div class="sample">시안 · 가상 데이터</div>' : ''}
  <header style="display:flex;flex-direction:column;gap:2.5mm">
    <p class="eyebrow">낙성초등학교 방과후학교 설문 결과 · 초등 3~6학년</p>
    <h1>우리 학교 방과후,<br><em>친구들은 이렇게 생각해요</em></h1>
  </header>
  <div class="who"><span class="big">${students.length}명</span><p>방과후 수업을 듣는 3~6학년 친구들이 답했어요.<br>3·4학년 ${low.length}명, 5·6학년 ${high.length}명이에요. 한 사람의 답이 드러나지 않게 모두 합쳐서 보여 줘요.</p></div>
  <section>
    <h2>방과후 시간, 어떻게 느끼나요?</h2>
    <p class="lead">${all.n}명 중 <b>${all.yes}명</b>이 방과후 수업 시간이 있어서 좋다고 답했어요.</p>
    <div class="legend"><span>동그라미 하나가 친구 한 명이에요.</span><span><i class="d yes"></i>그래요</span><span><i class="d mid"></i>보통이에요</span><span><i class="d no"></i>아니에요</span></div>
    ${common}
  </section>
  <section class="grps">
    <p>“방과후 수업 시간이 있는 것이 좋아요”에 <b>그래요</b>라고 답한 친구를 학년별로 보면</p>
    ${groupRow('3·4학년', low)}${groupRow('5·6학년', high)}
  </section>
  <p class="note">‘그래요’는 ‘아주 그래요’와 ‘그래요’를, ‘아니에요’는 ‘아니에요’와 ‘전혀 아니에요’를 합친 것입니다. 학생 수가 적어 한두 명의 답에도 결과가 달라질 수 있으니 큰 흐름만 보아 주세요.</p>
</div>
<div class="page" style="gap:5mm">
  ${SAMPLE ? '<div class="sample">시안 · 가상 데이터</div>' : ''}
  <div class="two">
    <section>
      <h2>바뀌었으면 하는 것</h2>
      <p class="small">듣는 수업마다 여러 개를 고를 수 있었어요. 모든 수업의 답을 합친 숫자예요.</p>
      ${wish}
    </section>
    <section>
      <h2>좋았던 것</h2>
      <p class="small">친구들이 쓴 글에 많이 나온 이야기예요.</p>
      <div class="chips">${likes || '<span class="small">쓴 글이 아직 없어요.</span>'}</div>
    </section>
  </div>
  ${photos}
  <section style="flex:1">
    <h2>학교에서 이렇게 할게요</h2>
    <div class="promise"><p>[학교에서 적을 내용: 설문 결과를 보고 내년 방과후에서 바꾸거나 이어 갈 것]</p></div>
  </section>
  <p class="note">이 자료는 방과후 시간과 활동에 대한 응답을 학교 전체로 모은 것입니다. 수업별 결과는 싣지 않았습니다.${flaggedN ? ` 앞뒤가 맞지 않게 답한 수업 응답 ${flaggedN}건은 빼고 셌습니다.` : ''} 낙성초등학교 방과후학교 담당.</p>
</div>
</body></html>`;

(async () => {
  const htmlPath = path.resolve(outPath).replace(/\.pdf$/, '.html');
  fs.writeFileSync(htmlPath, html);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1 });
  await page.goto('file://' + htmlPath);
  await page.evaluate(() => document.fonts.ready);
  const fonts = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family).filter((v, i, a) => a.indexOf(v) === i));
  const overflow = await page.evaluate(() => [...document.querySelectorAll('.page')].map((p) => p.scrollHeight - p.clientHeight));
  await page.pdf({ path: outPath, format: 'A4', printBackground: true });
  const pages = await page.$$('.page');
  for (let i = 0; i < pages.length; i++) await pages[i].screenshot({ path: outPath.replace(/\.pdf$/, `-p${i + 1}.png`) });
  await browser.close();
  console.log('fonts loaded:', fonts.join(', '), '| overflow px per page:', overflow.join(', '));
})();
