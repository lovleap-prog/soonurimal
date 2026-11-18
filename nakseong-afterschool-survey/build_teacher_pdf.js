// 교원용 결과 보고서(인쇄용 A4 PDF) 만들기
// 사용: node build_teacher_pdf.js <students.csv> <responses.json> <out.pdf>
// 계산은 dashboard/index.html의 dash.calc를 그대로 불러 써서 대시보드와 숫자가 같다.
// 강사 관련 결과와 학생 글이 들어가므로 교원끼리만 본다. 이름은 넣지 않는다.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const [, , studentsPath, responsesPath, outPath] = process.argv;
if (!studentsPath || !responsesPath || !outPath) {
  console.error('사용: node build_teacher_pdf.js <students.csv> <responses.json> <out.pdf>');
  process.exit(1);
}
const FONT_DIR = path.join(__dirname, 'node_modules', '@fontsource');

/* ---------- 대시보드 계산 불러오기 ---------- */
const dashHtml = fs.readFileSync(path.join(__dirname, 'dashboard', 'index.html'), 'utf8');
const calcSrc = [...dashHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])[0];
const calcs = {};
new Function('dash', calcSrc)({ calc: (id, o) => { calcs[id] = o; } });
const readCsv = (f) => {
  const [h, ...ls] = fs.readFileSync(f, 'utf8').replace(/\r/g, '').trim().split('\n');
  const H = h.split(',');
  return ls.map((l) => { const c = l.split(','); return Object.fromEntries(H.map((k, i) => [k, c[i] ?? ''])); });
};
const data = { students: readCsv(studentsPath), responses: JSON.parse(fs.readFileSync(responsesPath, 'utf8')) };
const run = (id) => { if (!(id in data)) { const c = calcs[id]; data[id] = c.fn(...c.inputs.map(run)); } return data[id]; };
Object.keys(calcs).forEach(run);
const MODE = 'include';
const rows = (id) => data[id].filter((r) => r.mode === MODE);

/* ---------- 도구 ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const PROGRAMS = [['art', '🎨', '미술회화'], ['unicycle', '🚲', '외발자전거'], ['samul', '🥁', '사물놀이'], ['guitar', '🎸', '기타(악기)'], ['violin', '🎻', '바이올린'], ['english', '💬', '영어']];
const pname = Object.fromEntries(PROGRAMS.map(([c, i, n]) => [c, `${i} ${n}`]));
const pshort = Object.fromEntries(PROGRAMS.map(([c, , n]) => [c, n]));
const band = (v) => (v == null ? '' : v >= 62.5 ? 'pos' : v >= 37.5 ? 'mid' : 'neg');
const bandWord = { pos: '긍정', mid: '보통', neg: '부정' };
const TYPE_COLOR = { '만족형': '#2d6a4f', '프로그램 불만형': '#2b8c8c', '막연한 거부감형': '#d99a2b', '전반 불만형': '#a8415b', '중립': '#a9ada3' };
const SPLIT_COLOR = { '둘 다 만족': '#2d6a4f', '강사 쪽 불만': '#d99a2b', '프로그램 쪽 불만': '#2b8c8c', '둘 다 불만': '#a8415b' };
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

const summary = rows('summary')[0];
const students = rows('students_typed');
const scored = data.scored;
const gradeN = [3, 4, 5, 6].map((g) => [g, students.filter((s) => s.grade === g).length]);
const progRows = rows('program_scores');
const splitRows = rows('split_dist');
const c1Rows = rows('c1_reasons');
const common = data.common_counts;
const typeDist = rows('type_dist');

/* ---------- 주요 결과 문장 (숫자로 자동 작성) ---------- */
const findings = [];
{
  const a1 = common.find((c) => c.item === 'a1');
  const vague = students.filter((s) => s.type === '막연한 거부감형').length;
  findings.push(`방과후 시간이 좋다고 답한 학생은 <b>${a1.n}명 중 ${a1.yes}명</b>이고, 좋지 않다고 답한 학생은 ${a1.no}명입니다. 수업은 좋은데 방과후가 싫은 <b>막연한 거부감형은 ${vague}명</b>입니다.`);
  const a3 = common.find((c) => c.item === 'a3'), a2 = common.find((c) => c.item === 'a2');
  findings.push(`방과후가 <b>공부 시간처럼 느껴진다</b>는 학생이 ${a3.n}명 중 ${a3.yes}명으로, 남아 있는 것이 힘들다는 학생(${a2.yes}명)보다 많습니다.`);
  const ranked = progRows.filter((r) => r.n >= 5).sort((a, b) => b.exp - a.exp);
  const top = ranked[0], bottom = ranked[ranked.length - 1];
  const rej = [...progRows].filter((r) => r.rejoin_n >= 5).sort((a, b) => a.rejoin_pct - b.rejoin_pct)[0];
  findings.push(`수업 경험은 <b>${pname[top.program]}</b>이 가장 좋고(환산 ${top.exp}점), <b>${pname[bottom.program]}</b>이 가장 낮습니다(${bottom.exp}점). 내년에도 듣고 싶다는 비율은 ${pname[rej.program]}이 ${rej.rejoin_yes}/${rej.rejoin_n}명(${rej.rejoin_pct}%)으로 가장 낮습니다.`);
  const share = (split) => splitRows.filter((r) => r.program !== '전체' && r.split === split && r.total >= 5).sort((a, b) => b.pct - a.pct)[0];
  const t = share('강사 쪽 불만'), p = share('프로그램 쪽 불만');
  const tc = c1Rows.find((r) => r.program === t.program), tp = progRows.find((r) => r.program === t.program);
  findings.push(`활동은 좋은데 선생님 점수가 낮은 <b>강사 쪽 불만</b>은 ${pname[t.program]}이 ${t.n}/${t.total}건(${t.pct}%)으로 가장 많습니다. 이 수업은 친절(t2) ${tp.t2}점, ‘말투나 태도’를 고른 응답 ${tc.r_attitude_n}건입니다.`);
  const pp = progRows.find((r) => r.program === p.program);
  findings.push(`선생님은 좋은데 활동 점수가 낮은 <b>프로그램 쪽 불만</b>은 ${pname[p.program]}이 ${p.n}/${p.total}건(${p.pct}%)으로 가장 많습니다. 이 수업은 흥미(q4) ${pp.q4}점, 활동 자체(p1) ${pp.p1}점입니다.`);
  const all = c1Rows.find((r) => r.program === '전체');
  const opts = [['r_content', '활동이나 배우는 내용'], ['r_method', '가르치는 방법'], ['r_attitude', '말투나 태도'], ['r_time', '수업 시간이나 요일'], ['r_supply', '준비물·악기·장소']]
    .map(([k, l]) => [l, all[k + '_n']]).sort((a, b) => b[1] - a[1]);
  const hard = [...progRows].sort((a, b) => b.q8_hard - a.q8_hard)[0];
  findings.push(`바뀌었으면 하는 것으로는 <b>${opts[0][0]}</b>(${opts[0][1]}건)이 가장 많고, ${opts[1][0]}(${opts[1][1]}건)이 뒤를 잇습니다. 어렵다는 응답은 ${pname[hard.program]}이 ${hard.q8_hard}건으로 가장 많습니다.`);
}

/* ---------- 1쪽: 개요 ---------- */
const tiles = [
  ['응답 학생', `${summary.students}<small>명</small>`, gradeN.map(([g, n]) => `${g}학년 ${n}`).join(' · ')],
  ['수업 응답', `${summary.responses_used}<small>건</small>`, '학생 × 듣는 수업'],
  ['방과후 시간이 좋아요', `${summary.a1_yes}<small>/ ${summary.a1_n}명</small>`, `환산 ${summary.a1_score}점 · ${bandWord[band(summary.a1_score)]}`],
  ['내적 일관성 α', summary.alpha.toFixed(2), `수업 경험 5문항 · 기준 .70 ${summary.alpha >= 0.7 ? '충족' : '미달'}`],
  ['수렴타당도 r', summary.r.toFixed(2), `수업 경험 × ‘좋아요’ · 기준 .60 ${summary.r >= 0.6 ? '충족' : '미달'}`],
  ['일자 응답', `${summary.straight}<small>건</small>`, '모든 문항 같은 답 · 분석에 포함'],
].map(([l, v, s]) => `<div class="tile"><p class="tl">${l}</p><p class="tv">${v}</p><p class="ts">${s}</p></div>`).join('');

/* ---------- 2쪽: 방과후 인식과 학생 유형 ---------- */
const COMMON_Q = { a1: '방과후 수업 시간이 있는 것이 좋아요.', a2: '정규 수업이 끝나고 학교에 더 남아 있는 것이 힘들어요.', a3: '방과후 수업도 공부하는 시간처럼 느껴져요.' };
const tallyOf = (list, k) => ({ n: list.filter((s) => s[k] != null).length, yes: list.filter((s) => s[k] >= 4).length, mid: list.filter((s) => s[k] === 3).length, no: list.filter((s) => s[k] != null && s[k] <= 2).length });
const dots = (t) => `<span class="dots">${'<i class="d yes"></i>'.repeat(t.yes)}${'<i class="d mid"></i>'.repeat(t.mid)}${'<i class="d no"></i>'.repeat(t.no)}</span>`;
const feel = ['a1', 'a2', 'a3'].map((k) => {
  const groups = [['전체', students], ['3·4학년', students.filter((s) => s.grade <= 4)], ['5·6학년', students.filter((s) => s.grade >= 5)]];
  const lines = groups.map(([label, list]) => { const t = tallyOf(list, k); return `<div class="frow"><span class="fl">${label}</span>${dots(t)}<span class="fn"><b>${t.n}명 중 ${t.yes}명</b> · 보통 ${t.mid} · 아니에요 ${t.no}</span></div>`; }).join('');
  return `<div class="feel"><p class="fq">“${COMMON_Q[k]}” <span class="cap">${k}</span></p>${lines}</div>`;
}).join('');

const TYPES = ['만족형', '프로그램 불만형', '막연한 거부감형', '전반 불만형', '중립'];
const stack = (parts, total, colors, small = false) => `<div class="stack${small ? ' sm' : ''}">${parts.filter(([, n]) => n > 0).map(([k, n]) => `<i style="width:${(n / total) * 100}%;background:${colors[k]}">${n / total >= 0.09 ? `<span>${pct(n, total)}</span>` : ''}</i>`).join('')}</div>`;
const typeBars = ['전체', '3학년', '4학년', '5학년', '6학년'].map((g) => {
  const r = typeDist.filter((t) => t.group === g);
  const total = r[0].total;
  return `<div class="srow"><span class="sl">${g} <small>${total}명${total < 5 ? ' · 적음' : ''}</small></span>${stack(TYPES.map((t) => [t, r.find((x) => x.type === t).n]), total, TYPE_COLOR)}</div>`;
}).join('');
const legend = (list, colors) => `<div class="legend">${list.map((t) => `<span><i style="background:${colors[t]}"></i>${t}</span>`).join('')}</div>`;
const typeCounts = TYPES.map((t) => `<td>${students.filter((s) => s.type === t).length}명</td>`).join('');
const causeRows = rows('cause').filter((c) => c.n > 0 && c.group !== '그 외 학생')
  .map((c) => `<tr><th class="left">${c.group}</th><td>${c.n}명</td><td>${c.a2_score}</td><td>${c.a3_score}</td></tr>`).join('');

/* ---------- 3쪽: 수업별 영역 점수 ---------- */
const COLS = [['p1', '활동 자체', 'p1', 'gp'], ['q7', '전달력', 'q7', 'gt'], ['t2', '친절', 't2', ''], ['q4', '흥미', 'q4', 'gx'], ['q5', '활동', 'q5', ''], ['q6', '성장', 'q6', ''], ['q9', '재수강', 'q9', ''], ['exp', '수업 경험', '5문항', 'strong'], ['q11', '좋아요', 'q11', ''], ['q8', '난이도', '참고', 'ref'], ['q10_r', '짧게 느낌', '참고', 'ref']];
const cell = (r, k, cls) => {
  const v = r[k];
  if (r.n < 5) return `<td class="${cls}"><span class="few">${r[k + '_yes']}/${r[k + '_n']}</span></td>`;
  const b = cls.includes('ref') ? '' : band(v);
  return `<td class="${cls} ${b}">${v ?? '—'}</td>`;
};
const progTable = `<table class="grid"><thead><tr><th class="left">수업</th><th>응답</th>${COLS.map(([, l, s, c]) => `<th class="${c}">${l}<small>${s}</small></th>`).join('')}<th>어렵다 · 쉽다</th></tr></thead><tbody>${
  progRows.map((r) => `<tr><th class="left">${pname[r.program]}</th><td>${r.n}</td>${COLS.map(([k, , , c]) => cell(r, k, c)).join('')}<td class="q8">${r.q8_hard} · ${r.q8_easy}</td></tr>`).join('')}</tbody></table>`;
const rejoin = progRows.map((r) => `<div class="brow"><span class="bl">${pname[r.program]}</span><span class="bt"><i style="width:${r.rejoin_pct}%" class="${band(r.q9)}"></i></span><span class="bn"><b>${r.rejoin_pct}%</b> ${r.rejoin_yes}/${r.rejoin_n}명</span></div>`).join('');
const diffRows = progRows.map((r) => {
  const tot = r.q8_hard + r.q8_right + r.q8_easy;
  return `<div class="srow"><span class="sl">${pshort[r.program]}</span>${stack([['어렵다', r.q8_hard], ['딱 알맞다', r.q8_right], ['쉽다', r.q8_easy]], tot, { '어렵다': '#a8415b', '딱 알맞다': '#2d6a4f', '쉽다': '#d99a2b' }, true)}</div>`;
}).join('');

/* ---------- 4쪽: 프로그램 대 강사 ---------- */
const SPLITS = ['둘 다 만족', '강사 쪽 불만', '프로그램 쪽 불만', '둘 다 불만'];
const splitBars = ['전체', ...PROGRAMS.map(([c]) => c)].map((p) => {
  const r = splitRows.filter((x) => x.program === p);
  const total = r[0]?.total || 0;
  return `<div class="srow"><span class="sl">${p === '전체' ? '전체' : pshort[p]} <small>${total}건</small></span>${stack(SPLITS.map((s) => [s, r.find((x) => x.split === s).n]), total, SPLIT_COLOR)}</div>`;
}).join('');
const C1COLS = [['r_content', '활동·내용', ''], ['r_method', '가르치는 방법', 'tch'], ['r_attitude', '말투·태도', 'tch'], ['r_time', '시간·요일', ''], ['r_supply', '준비물·장소', ''], ['r_none', '없음', '']];
const c1Table = `<table class="grid c1"><thead><tr><th class="left">수업</th><th>응답</th>${C1COLS.map(([, l, c]) => `<th class="${c}">${l}</th>`).join('')}</tr></thead><tbody>${
  c1Rows.map((r) => `<tr><th class="left">${r.program === '전체' ? '전체' : pname[r.program]}</th><td>${r.answered}</td>${C1COLS.map(([k, , c]) => `<td class="${c}${r[k + '_n'] && k !== 'r_none' && r[k] >= 20 ? ' hot' : ''}">${r[k + '_n']}<small>${r[k]}%</small></td>`).join('')}</tr>`).join('')}</tbody></table>`;
const progRead = PROGRAMS.map(([c]) => {
  const p = progRows.find((r) => r.program === c), cr = c1Rows.find((r) => r.program === c);
  const sp = (s) => splitRows.find((r) => r.program === c && r.split === s).n;
  const bits = [];
  bits.push(`활동 점수 ${p.prog} · 선생님 점수 ${p.teach}`);
  if (sp('강사 쪽 불만')) bits.push(`강사 쪽 불만 ${sp('강사 쪽 불만')}건`);
  if (sp('프로그램 쪽 불만')) bits.push(`프로그램 쪽 불만 ${sp('프로그램 쪽 불만')}건`);
  if (sp('둘 다 불만')) bits.push(`둘 다 불만 ${sp('둘 다 불만')}건`);
  if (cr.r_teacher_n) bits.push(`선생님 관련 보기를 고른 응답 ${cr.r_teacher_n}건`);
  return `<li><b>${pname[c]}</b> <span>${bits.join(' · ')}</span></li>`;
}).join('');

/* ---------- 5쪽: 학년별 ---------- */
const gradeTable = `<table class="grid"><thead><tr><th class="left">학년</th><th>학생</th><th>방과후 태도<small>a1</small></th><th>피로<small>a2 · 높을수록 힘듦</small></th><th>공부 인식<small>a3 · 높을수록 공부</small></th><th>수업 경험</th><th>거부감형</th></tr></thead><tbody>${
  rows('grade_scores').map((r) => { const few = r.n < 5; return `<tr><th class="left">${r.grade}학년</th><td>${r.n}명</td><td class="${few ? '' : band(r.a1)}">${r.a1}</td><td>${r.a2}</td><td>${r.a3}</td><td class="${few ? '' : band(r.exp)}">${r.exp}</td><td>${r.vague}명</td></tr>`; }).join('')}</tbody></table>`;
const gpTable = `<table class="grid"><thead><tr><th class="left">학년</th>${PROGRAMS.map(([, i, n]) => `<th>${i} ${n}</th>`).join('')}</tr></thead><tbody>${
  rows('grade_program').map((r) => `<tr><th class="left">${r.grade}학년</th>${PROGRAMS.map(([c]) => {
    const n = r[c + '_n'];
    if (!n) return '<td class="na">—</td>';
    if (r[c] == null) return `<td class="na">비공개<small>${n}명</small></td>`;
    return `<td class="${n >= 5 ? band(r[c]) : ''}">${r[c]}<small>${n}명</small></td>`;
  }).join('')}</tr>`).join('')}</tbody></table>`;

/* ---------- 6쪽 이후: 학생 글 ---------- */
const coded = rows('open_coded');
const trivial = /^(없|딱히\s*없|바라는\s*점\s*없|바뀌.*없|바꾸.*없|바라는점\s*없|.)$|^(없음|없다|없어요|없습니다)[.\s]*$/;
const isTrivial = (t) => trivial.test(t.trim()) || /^(바라는\s*점|바뀌었으면|바뀌면|바꾸었으면).*(없|없음|없다|없습니다)[.\s]*$/.test(t.trim()) || /^딱히\s*없/.test(t.trim());
const voices = PROGRAMS.map(([c]) => {
  const list = (q) => coded.filter((x) => x.program === c && x.question === q && x.shown && x.text && !isTrivial(x.text));
  const hidden = coded.filter((x) => x.program === c && !x.shown).length;
  const ul = (q) => { const l = list(q); return l.length ? `<ul>${l.map((x) => `<li>${esc(x.text.replace(/\s+/g, ' ').trim())}</li>`).join('')}</ul>` : '<p class="none">적은 글이 없어요.</p>'; };
  return `<div class="voice"><h3>${pname[c]}</h3><div class="vcols"><div><h4>좋았던 것 <span class="cap">q12</span></h4>${ul('q12')}</div><div><h4>까닭·바라는 점 <span class="cap">q13</span></h4>${ul('q13')}</div></div>${hidden ? `<p class="cap">수강생 3명 미만인 학년의 글 ${hidden}건은 싣지 않았습니다.</p>` : ''}</div>`;
}).join('');

/* ---------- HTML ---------- */
const today = new Date();
const dateText = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;
const fontCss = ['jua', 'gowun-dodum'].map((f) => `<link rel="stylesheet" href="file://${path.join(FONT_DIR, f, 'index.css')}">`).join('');
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">${fontCss}<style>
:root { --ink:#1e2a1f; --soft:#5d6b5f; --line:#dde4d2; --paper:#ffffff; --tint:#f2f5ec; --leaf:#2d6a4f;
  --pos:#d9eedd; --pos-ink:#1d5a37; --mid:#f5efd6; --mid-ink:#6b5410; --neg:#f6dcdc; --neg-ink:#8e2626;
  --display:'Jua','Gowun Dodum',sans-serif; --body:'Gowun Dodum',sans-serif; }
@page { size: A4; margin: 14mm 14mm 16mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: var(--body); color: var(--ink); font-size: 9.6pt; line-height: 1.55; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
h1 { font-family: var(--display); font-weight: 400; font-size: 24pt; line-height: 1.2; letter-spacing: -.01em; }
h2 { font-family: var(--display); font-weight: 400; font-size: 15pt; margin: 0 0 2.5mm; color: var(--leaf); }
h3 { font-family: var(--display); font-weight: 400; font-size: 11.5pt; margin: 0 0 1.5mm; }
h4 { font-size: 9.4pt; font-weight: 700; margin: 0 0 1mm; color: var(--soft); }
b { font-weight: 700; }
small { font-size: 7.4pt; color: var(--soft); }
.cap { font-size: 7.6pt; color: var(--soft); font-weight: 400; }
.page { break-after: page; }
.page:last-child { break-after: auto; }
section { margin-bottom: 5mm; break-inside: avoid; }
.desc { color: var(--soft); margin-bottom: 3mm; max-width: 170mm; }
.eyebrow { font-size: 9pt; color: var(--soft); letter-spacing: .03em; margin-bottom: 2mm; }
.conf { border: 1.2pt solid #a8415b; color: #6e1f31; border-radius: 2.5mm; padding: 2.5mm 3.5mm; margin: 4mm 0 5mm; font-size: 9pt; }
.conf b { color: #8e2626; }
.meta { width: 100%; border-collapse: collapse; margin-bottom: 5mm; font-size: 9pt; }
.meta th { text-align: left; width: 28mm; color: var(--soft); font-weight: 400; padding: 1.2mm 0; border-bottom: .5pt solid var(--line); vertical-align: top; }
.meta td { padding: 1.2mm 0; border-bottom: .5pt solid var(--line); }
.tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; margin-bottom: 6mm; }
.tile { border: .6pt solid var(--line); border-radius: 2.5mm; padding: 3mm 3.5mm; background: var(--tint); }
.tl { font-size: 8.4pt; color: var(--soft); }
.tv { font-family: var(--display); font-size: 20pt; line-height: 1.15; margin: .5mm 0; }
.tv small { font-family: var(--body); font-size: 9pt; margin-left: 1mm; }
.ts { font-size: 7.8pt; color: var(--soft); }
.findings { padding-left: 5mm; }
.findings li { margin-bottom: 2.2mm; }
.findings li::marker { color: var(--leaf); }
.feel { border: .6pt solid var(--line); border-radius: 2.5mm; padding: 2.2mm 3.5mm; margin-bottom: 2.2mm; }
.fq { font-weight: 700; margin-bottom: 1.5mm; }
.frow { display: grid; grid-template-columns: 16mm 1fr 50mm; align-items: center; gap: 2mm; padding: .3mm 0; }
.fl { font-size: 8.6pt; color: var(--soft); }
.fn { font-size: 8.4pt; text-align: right; }
.dots { display: flex; flex-wrap: wrap; gap: .8mm; }
.d { width: 2.9mm; height: 2.9mm; border-radius: 50%; display: inline-block; }
.d.yes { background: var(--leaf); } .d.mid { background: #9fc9ae; } .d.no { border: .8pt solid var(--leaf); background: #fff; }
.legend { display: flex; flex-wrap: wrap; gap: 1.5mm 4mm; font-size: 8.2pt; margin: 1mm 0 2.5mm; }
.legend i { display: inline-block; width: 3mm; height: 3mm; border-radius: .6mm; margin-right: 1.2mm; vertical-align: -.3mm; }
.srow { display: grid; grid-template-columns: 30mm 1fr; align-items: center; gap: 2mm; margin-bottom: 1.6mm; }
.sl { font-size: 8.8pt; }
.stack { display: flex; height: 6mm; border-radius: 1.2mm; overflow: hidden; background: var(--tint); }
.stack.sm { height: 4.6mm; }
.stack i { display: flex; align-items: center; justify-content: center; color: #fff; font-style: normal; font-size: 7.6pt; font-weight: 700; }
.grid { width: 100%; border-collapse: collapse; font-size: 8.4pt; }
.grid th, .grid td { border-bottom: .5pt solid var(--line); padding: 1.6mm 1.2mm; text-align: center; font-variant-numeric: tabular-nums; }
.grid thead th { font-weight: 700; font-size: 7.8pt; vertical-align: bottom; border-bottom: .9pt solid var(--ink); line-height: 1.25; }
.grid thead th small { display: block; font-weight: 400; }
.grid .left { text-align: left; white-space: nowrap; }
.grid td small { display: block; font-size: 6.8pt; }
.grid td.pos { background: var(--pos); color: var(--pos-ink); } .grid td.mid { background: var(--mid); color: var(--mid-ink); } .grid td.neg { background: var(--neg); color: var(--neg-ink); }
.grid td.strong { font-weight: 700; }
.grid td.ref, .grid th.ref { color: var(--soft); background: #fafaf7; }
.grid th.gp, .grid td.gp, .grid th.gt, .grid td.gt, .grid th.gx, .grid td.gx { border-left: .9pt solid var(--ink); }
.grid td.na { color: var(--soft); }
.grid .few { color: var(--soft); }
.grid.c1 th.tch, .grid.c1 td.tch { font-weight: 700; }
.grid.c1 td.hot { background: var(--mid); }
.bands { display: flex; flex-wrap: wrap; gap: 2mm; font-size: 7.8pt; margin: 2mm 0; }
.bands span { padding: .6mm 2mm; border-radius: 1mm; }
.bands .pos { background: var(--pos); color: var(--pos-ink); } .bands .mid { background: var(--mid); color: var(--mid-ink); } .bands .neg { background: var(--neg); color: var(--neg-ink); }
.brow { display: grid; grid-template-columns: 30mm 1fr 26mm; align-items: center; gap: 2mm; margin-bottom: 1.6mm; }
.bt { height: 4.6mm; background: var(--tint); border-radius: 1mm; overflow: hidden; }
.bt i { display: block; height: 100%; background: var(--leaf); }
.bt i.mid { background: #c9a227; } .bt i.neg { background: #a8415b; }
.bn { font-size: 8.4pt; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
.reads { list-style: none; }
.reads li { padding: 1.3mm 0; border-bottom: .5pt solid var(--line); font-size: 8.8pt; }
.reads li span { color: var(--soft); margin-left: 1.5mm; }
.note { font-size: 8.2pt; color: var(--soft); margin-top: 2mm; }
.voice { border-top: .9pt solid var(--ink); padding-top: 2.5mm; margin-bottom: 5mm; break-inside: avoid; }
.vcols { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
.voice ul { padding-left: 4mm; font-size: 8.6pt; }
.voice li { margin-bottom: 1mm; }
.voice .none { font-size: 8.4pt; color: var(--soft); }
.method p, .method li { font-size: 8.8pt; margin-bottom: 1.6mm; }
.method ul { padding-left: 5mm; }
</style></head><body>

<div class="page">
  <p class="eyebrow">낙성초등학교 방과후학교 · 2026 방과후 인식 설문 · 교원용</p>
  <h1>방과후, 아이들의 생각<br><span style="color:var(--leaf)">교원용 결과 보고</span></h1>
  <p class="conf"><b>교원 전용 자료입니다.</b> 수업별·강사 관련 결과와 학생이 직접 쓴 글이 들어 있습니다. 교원끼리만 보고, 방과후 강사·학부모·학생에게는 그대로 전하지 않습니다. 학부모·학생에게는 학년 묶음 결과만 담은 공유용 자료를 따로 드립니다.</p>
  <table class="meta">
    <tr><th>조사 대상</th><td>3~6학년 방과후 수강생 ${summary.students}명 전원 (${gradeN.map(([g, n]) => `${g}학년 ${n}명`).join(', ')})</td></tr>
    <tr><th>조사 방법</th><td>QR로 여는 Google 설문지, 학생이 직접 응답. 듣는 수업마다 13문항(영어는 3·5학년 추가 설문으로 받음)</td></tr>
    <tr><th>조사 기간</th><td>2026년 11월 13일 ~ 11월 18일</td></tr>
    <tr><th>분석 자료</th><td>공통 문항 ${summary.students}명, 수업 응답 ${summary.responses_used}건 (미술회화·외발자전거·사물놀이·영어 각 24, 기타 16, 바이올린 9)</td></tr>
    <tr><th>만든 날</th><td>${dateText}</td></tr>
  </table>
  <div class="tiles">${tiles}</div>
  <section><h2>주요 결과</h2><ol class="findings">${findings.map((f) => `<li>${f}</li>`).join('')}</ol>
  <p class="note">숫자는 ‘그래요’ 이상(4~5)으로 답한 인원이 중심입니다. 환산 점수는 평균을 0~100으로 바꾼 보조 값이며, 62.5 이상 긍정 · 37.5~62.5 보통 · 37.5 미만 부정으로 읽습니다.</p></section>
</div>

<div class="page">
  <section>
    <h2>1. 방과후 시간, 어떻게 느끼나요</h2>
    <p class="desc">동그라미 하나가 학생 한 명입니다. 진한 색은 ‘그래요’ 이상(4~5), 연한 색은 ‘보통이에요’(3), 빈 동그라미는 ‘아니에요’ 이하(1~2)입니다.</p>
    ${feel}
  </section>
  <section>
    <h2>2. 학생 유형: 수업 때문인가, 방과후 자체 때문인가</h2>
    <p class="desc">방과후 태도(a1)와 수업 경험(3.5 기준)을 교차해 나눕니다. a1이 낮은데 수업 경험은 좋은 <b>막연한 거부감형</b>이 이 설문이 가장 알고 싶은 집단입니다. a1이 ‘보통이에요’인 학생은 중립입니다.</p>
    ${legend(TYPES, TYPE_COLOR)}
    ${typeBars}
    <p class="note">막대 안 숫자는 %입니다. 6학년은 4명이라 비율이 크게 흔들립니다.</p>
    <div class="two" style="margin-top:3mm">
      <div><h3>유형별 인원</h3><table class="grid"><thead><tr>${TYPES.map((t) => `<th>${t}</th>`).join('')}</tr></thead><tbody><tr>${typeCounts}</tr></tbody></table></div>
      <div><h3>유형별 피로·공부 인식 <span class="cap">환산 점수, 높을수록 힘들고 공부처럼 느낌</span></h3><table class="grid"><thead><tr><th class="left">유형</th><th>학생</th><th>피로 a2</th><th>공부 인식 a3</th></tr></thead><tbody>${causeRows}</tbody></table></div>
    </div>
  </section>
</div>

<div class="page">
  <section>
    <h2>3. 수업별 영역 점수</h2>
    <p class="desc">문항별 평균을 0~100점으로 바꾼 값입니다(아주 그래요 100 · 그래요 75 · 보통 50 · 아니에요 25 · 전혀 아니에요 0). 왼쪽부터 프로그램, 강사, 수업 전반 문항입니다. <b>수업 경험</b>은 흥미·활동·성장·전달력·재수강 5문항 평균입니다. 난이도와 ‘짧게 느낌’은 참고로만 봅니다.</p>
    <div class="bands"><span class="pos">긍정 62.5 이상</span><span class="mid">보통 37.5~62.5</span><span class="neg">부정 37.5 미만</span></div>
    ${progTable}
    <p class="note">‘어렵다 · 쉽다’는 난이도에서 어렵다(조금·너무)와 쉽다(조금·너무)를 고른 인원입니다. 응답 5건 미만인 수업은 점수 대신 ‘그래요 이상 인원 / 응답 인원’을 적습니다.</p>
  </section>
  <div class="two">
    <section>
      <h3>내년에도 듣고 싶어요 <span class="cap">q9 ‘그래요’ 이상</span></h3>
      ${rejoin}
    </section>
    <section>
      <h3>수업 내용의 난이도 <span class="cap">q8 인원</span></h3>
      ${legend(['어렵다', '딱 알맞다', '쉽다'], { '어렵다': '#a8415b', '딱 알맞다': '#2d6a4f', '쉽다': '#d99a2b' })}
      ${diffRows}
    </section>
  </div>
</div>

<div class="page">
  <section>
    <h2>4. 수업에 대한 불만, 프로그램 때문인가 강사 때문인가</h2>
    <p class="desc">수업 응답마다 <b>활동 점수</b>(활동 자체 p1, 직접 해 보는 활동 q5 평균)와 <b>선생님 점수</b>(전달력 q7, 친절 t2 평균)를 3.5 기준으로 나눕니다. 활동은 좋은데 선생님 점수만 낮으면 강사 쪽 불만, 선생님은 좋은데 활동 점수만 낮으면 프로그램 쪽 불만입니다. 각 점수는 두 문항뿐이라 아래 표(학생이 직접 고른 것)와 함께 읽습니다.</p>
    ${legend(SPLITS, SPLIT_COLOR)}
    ${splitBars}
  </section>
  <section>
    <h3>바뀌었으면 하는 것 (학생이 고름) <span class="cap">건수와 그 수업 응답 중 비율 · 여러 개 고를 수 있음 · 진한 글씨는 선생님 관련 보기 · 20% 이상 칸 색칠</span></h3>
    ${c1Table}
  </section>
  <section>
    <h3>수업별로 읽기</h3>
    <ul class="reads">${progRead}</ul>
  </section>
</div>

<div class="page">
  <section>
    <h2>5. 학년별로 보기</h2>
    <h3>공통 문항과 수업 경험 <span class="cap">환산 점수</span></h3>
    ${gradeTable}
    <p class="note">피로(a2)·공부 인식(a3)은 높을수록 부정적인 문항이라 색을 칠하지 않았습니다. 학생 5명 미만인 학년도 색을 칠하지 않습니다.</p>
  </section>
  <section>
    <h3>학년 × 수업 수업 경험 <span class="cap">환산 점수 · 작은 숫자는 학생 수</span></h3>
    ${gpTable}
    <p class="note">수강생 3명 미만인 칸은 ‘비공개’로 가립니다. 5명 미만인 칸은 색을 칠하지 않습니다.</p>
  </section>
  <section class="method">
    <h2>6. 계산 방법과 읽을 때 주의할 점</h2>
    <ul>
      <li><b>수업 경험</b> = 흥미(q4)·활동(q5)·성장(q6)·전달력(q7)·재수강(q9) 평균. 학생의 수업 경험은 그 학생이 듣는 수업들의 평균입니다.</li>
      <li><b>바꾼 점:</b> 처음에는 난이도(q8)와 ‘길게 느껴져요’(q10)를 더한 7문항이었으나, 실제 응답에서 두 문항이 다른 문항과 따로 움직여 뺐습니다. 7문항일 때 α .65, ‘좋아요’와의 r .73이었고, 5문항은 α ${summary.alpha.toFixed(2)}, r ${summary.r.toFixed(2)}입니다.</li>
      <li><b>q10 ‘길게 느껴져요’:</b> ‘기다려져요’와 어긋난 응답이 ${summary.contradict}건(${pct(summary.contradict, summary.responses_total)}%)입니다. ‘오래 하고 싶다’로 읽은 학생이 있었던 것으로 보여 점수에는 넣지 않았습니다.</li>
      <li><b>q8 난이도:</b> 쉽다고 답한 학생일수록 수업을 더 좋아했습니다. ‘딱 알맞음’이 가장 좋은 상태라는 가정과 맞지 않아 인원으로만 봅니다.</li>
      <li><b>일자 응답</b>(모든 문항에 같은 답) ${summary.straight}건은 대부분 아주 좋아하는 수업에 ‘아주 그래요’만 고른 경우라 분석에 넣었습니다.</li>
      <li>학생이 스스로 답한 설문이라 그날의 기분이나 문항 이해에 따라 달라질 수 있습니다. 6학년(4명)과 바이올린(9건)처럼 인원이 적은 묶음은 한두 명에 따라 크게 달라집니다.</li>
      <li>강사 관련 결과는 개선 방향을 함께 찾기 위한 자료입니다. 개인 평가 자료로 쓰지 않고, 학생 글은 강사에게 원문 그대로 전하지 않습니다.</li>
    </ul>
  </section>
</div>

<div class="page">
  <h2>7. 학생들이 직접 쓴 말</h2>
  <p class="desc">학생이 적은 글을 고치지 않고 옮겼습니다(띄어쓰기·맞춤법 포함). ‘없음’처럼 내용이 없는 글은 뺐습니다. 수강생 3명 미만인 학년×수업의 글은 누가 썼는지 알 수 있어 싣지 않았습니다.</p>
  ${voices}
</div>

</body></html>`;

(async () => {
  const htmlPath = path.resolve(outPath).replace(/\.pdf$/, '.html');
  fs.writeFileSync(htmlPath, html);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + htmlPath);
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({
    path: outPath, format: 'A4', printBackground: true, displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: '<div style="width:100%;font-size:7pt;color:#6b7368;padding:0 14mm;display:flex;justify-content:space-between;font-family:sans-serif"><span>낙성초 방과후 인식 설문 · 교원용 (대외 공유 금지)</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
    margin: { top: '14mm', bottom: '16mm', left: '14mm', right: '14mm' },
  });
  await browser.close();
  console.log('저장:', outPath);
})();
