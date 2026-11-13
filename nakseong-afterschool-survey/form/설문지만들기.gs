/**
 * 낙성초 방과후학교 인식 설문: 설문지 만들기
 * 이 시트의 [문항]·[코드표] 탭을 읽어 Google 설문지를 만들고,
 * 응답이 이 시트의 '응답원본' 탭으로 들어오도록 연결합니다. 한 번만 실행하세요.
 */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('방과후 설문').addItem('설문지 만들기', '설문지만들기').addToUi();
}

const VOICE_HELP = '✏️ 글로 써도 되고, 🎙 키보드의 마이크 버튼을 누르고 말해도 돼요. 쓰고 싶은 만큼만 써요.';
const NAME_LINE = '✏️ 이름을 적어요. 누가 어떻게 답했는지는 학교 선생님만 보고, 방과후 강사 선생님께는 알려 주지 않아요.';
const NAME_HELP = '예: 김하늘. 선생님이 여러분을 더 잘 도와주려고 물어봐요.';

// 이름 문항은 설문지와 시트를 연결한 뒤에 넣습니다. 그래야 시트에서 맨 끝 열에 들어가
// 다른 문항의 열 위치가 바뀌지 않습니다. 설문지 화면에서는 학년 바로 다음으로 옮깁니다.
function addNameItem_(form, nameTitle, gradeTitle) {
  const nameItem = form.addTextItem().setTitle(nameTitle).setHelpText(NAME_HELP).setRequired(true);
  const gradeIdx = form.getItems().findIndex((it) => it.getTitle() === gradeTitle);
  form.moveItem(nameItem.getIndex(), gradeIdx + 1);
}

function 설문지만들기() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName('응답원본')) {
    throw new Error("'응답원본' 탭이 이미 있습니다. 설문지가 이미 연결되어 있는지 확인하세요.");
  }

  const code = ss.getSheetByName('코드표');
  const scale = code.getRange('A2:A6').getValues().map((r) => String(r[0]).trim());
  const icons = { art: '🎨', unicycle: '🚲', samul: '🥁', guitar: '🎸', violin: '🎻' };
  const programs = code.getRange('D2:E6').getValues().filter((r) => r[0] !== '')
    .map((r) => ((icons[String(r[0]).trim()] || '') + ' ' + String(r[1]).trim()).trim());
  const grades = code.getRange('G2:G5').getValues().map((r) => String(r[0]).trim()).filter(String);
  const yesNo = code.getRange('I2:I3').getValues().map((r) => String(r[0]).trim());
  const changes = code.getRange('K2:K7').getValues().map((r) => String(r[0]).trim()).filter(String);
  const levels = code.getRange('M2:M6').getValues().map((r) => String(r[0]).trim()).filter(String);

  const rows = ss.getSheetByName('문항').getRange('A2:E').getValues().filter((r) => r[0] !== '');
  const common = rows.filter((r) => r[1] === '공통' && r[3] !== '이름');
  const nameRow = rows.find((r) => r[3] === '이름');
  const perClass = rows.filter((r) => r[1] === '수업별');
  if (common.length !== 4 || !nameRow || perClass.length !== 13 || programs.length !== 5 || levels.length !== 5) {
    throw new Error('문항 수가 달라졌습니다. 공통 4개(학년 포함)와 이름, 수업별 13개, 수업 5개, 난이도 보기 5개여야 응답 변환 수식이 맞습니다.');
  }

  const form = FormApp.create('🏫 낙성초 방과후 수업, 내 생각은?');
  form.setDescription([
    '방과후 수업에 대한 여러분의 생각이 궁금해요.',
    '',
    NAME_LINE,
    '✏️ 정답은 없어요. 내 생각과 가장 가까운 것을 골라요.',
    '✏️ 모르는 말이 있으면 선생님께 물어봐요.',
    '',
    '이렇게 골라요',
    scale[0] + ' : 정말 그렇다고 생각해요',
    scale[1] + ' : 그런 편이에요',
    scale[2] + ' : 그렇기도 하고 아니기도 해요',
    scale[3] + ' : 아닌 편이에요',
    scale[4] + ' : 정말 아니라고 생각해요',
  ].join('\n'));
  form.setProgressBar(true);
  form.setCollectEmail(false);
  form.setAllowResponseEdits(false);
  form.setShowLinkToRespondAgain(false);
  form.setConfirmationMessage('🎉 끝! 끝까지 답해 줘서 고마워요. 여러분의 생각으로 더 좋은 방과후를 만들게요.');
  try { form.setRequireLogin(false); } catch (e) { /* 개인 Google 계정에는 없는 설정입니다 */ }

  const addQuestion = (r) => {
    const title = String(r[2]).trim();
    const type = String(r[3]).trim();
    const required = String(r[4]).trim() === '예';
    if (type === '학년') {
      form.addMultipleChoiceItem().setTitle(title).setChoiceValues(grades).setRequired(true);
    } else if (type === '난이도') {
      form.addMultipleChoiceItem().setTitle(title).setChoiceValues(levels).setRequired(required);
    } else if (type === '5점') {
      form.addMultipleChoiceItem().setTitle(title).setChoiceValues(scale).setRequired(required);
    } else if (type === '선택형') {
      form.addCheckboxItem().setTitle(title).setChoiceValues(changes).setRequired(required);
    } else {
      form.addParagraphTextItem().setTitle(title).setHelpText(VOICE_HELP).setRequired(required);
    }
  };

  // 1쪽: 학년과 공통 문항
  form.addSectionHeaderItem().setTitle('먼저, 방과후 시간에 대해 물어볼게요')
    .setHelpText('수업 하나가 아니라 방과후 시간 전체를 떠올리며 답해요.');
  common.forEach(addQuestion);

  // 수업 문항은 두 쪽으로 나눕니다: 고르는 문항 10개, 그다음 쓰는 문항 3개.
  const isPick = (r) => ['5점', '난이도'].indexOf(String(r[3]).trim()) !== -1;
  const pick = perClass.filter(isPick);
  const write = perClass.filter((r) => !isPick(r));
  if (perClass.indexOf(write[0]) !== pick.length) {
    throw new Error('수업별 문항은 5점 문항이 먼저, 서술·선택형 문항이 뒤에 오도록 두어야 합니다.');
  }

  // 수업마다 "이 수업을 듣나요?" 쪽과 수업 문항 쪽을 만듭니다.
  const steps = programs.map((name) => {
    const askPage = form.addPageBreakItem().setTitle(name);
    const ask = form.addMultipleChoiceItem().setTitle(name + ' 수업을 듣나요?').setRequired(true);
    const classPage = form.addPageBreakItem().setTitle(name + ' 수업은 어땠나요?')
      .setHelpText(name + ' 수업 시간을 떠올리며 하나씩 골라요.');
    pick.forEach(addQuestion);
    form.addPageBreakItem().setTitle(name + ' 수업, 조금만 더 알려 줘요')
      .setHelpText('거의 다 왔어요! 글로 쓰는 칸은 쓰고 싶은 만큼만 써도 돼요.');
    write.forEach(addQuestion);
    return { ask: ask, askPage: askPage, classPage: classPage };
  });

  // "네"는 그 수업 문항으로, "아니요"는 다음 수업 질문으로 건너뜁니다.
  steps.forEach((s, i) => {
    const next = steps[i + 1];
    s.ask.setChoices([
      s.ask.createChoice(yesNo[0], s.classPage),
      next ? s.ask.createChoice(yesNo[1], next.askPage)
           : s.ask.createChoice(yesNo[1], FormApp.PageNavigationType.SUBMIT),
    ]);
  });

  // 응답을 이 시트로 보냅니다.
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  // 설문지가 새로 만든 응답 탭을 찾아 이름을 '응답원본'으로 바꿉니다.
  let sheet = null;
  for (let i = 0; i < 20 && !sheet; i++) {
    SpreadsheetApp.flush();
    sheet = SpreadsheetApp.openById(ss.getId()).getSheets().find((sh) => {
      const url = sh.getFormUrl();
      if (!url) return false;
      try { return FormApp.openByUrl(url).getId() === form.getId(); } catch (e) { return false; }
    }) || null;
    if (!sheet) Utilities.sleep(1500);
  }
  if (!sheet) {
    throw new Error("응답 탭을 찾지 못했습니다. 새로 생긴 '설문지 응답' 탭의 이름을 직접 '응답원본'으로 바꿔 주세요.");
  }
  sheet.setName('응답원본');
  addNameItem_(form, String(nameRow[2]).trim(), String(common[0][2]).trim());

  let link = form.getPublishedUrl();
  try { link = form.shortenFormUrl(link); } catch (e) { /* 짧은 주소를 못 만들면 긴 주소를 씁니다 */ }

  const guide = ss.getSheetByName('안내');
  guide.getRange('B5').setValue(link);
  guide.getRange('B6').setValue(form.getEditUrl());
  ss.toast('설문지를 만들었습니다. 안내 탭 B5 주소로 QR 코드를 만드세요.', '완료', 10);
  Logger.log('응답 주소: ' + link);
  Logger.log('편집 주소: ' + form.getEditUrl());
}

/**
 * 이미 만든 설문지의 서술형 칸에 말로 답하는 방법 안내를 넣습니다.
 * 안내 탭 B6의 편집 주소로 설문지를 찾습니다. 여러 번 실행해도 결과는 같습니다.
 */
function 서술형마이크안내넣기() {
  const url = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('안내').getRange('B6').getValue();
  const form = FormApp.openByUrl(url);
  const items = form.getItems(FormApp.ItemType.PARAGRAPH_TEXT);
  items.forEach((it) => it.asParagraphTextItem().setHelpText(VOICE_HELP));
  SpreadsheetApp.getActiveSpreadsheet().toast('서술형 ' + items.length + '칸에 안내를 넣었습니다.', '완료', 8);
}

/**
 * 이미 배포한 설문지를 링크와 응답 시트는 그대로 둔 채 고칩니다(2026-11 교원 피드백 반영).
 * - q8: 난이도 5단계 보기로 바꿈 / q10, q12: 문장 바꿈 / 이름(필수): 학년 다음에 추가
 * 여러 번 실행해도 결과는 같습니다.
 */
function 문항수정반영() {
  const OLD = {
    q8: '수업 내용이 나에게 알맞아요. (너무 어렵지도, 너무 쉽지도 않아요)',
    q10: '이 수업은 지루할 때가 많아요.',
    q12: '이 수업에서 가장 좋았던 것은 무엇인가요?',
    anon: '✏️ 이름은 쓰지 않아요. 누가 답했는지 아무도 몰라요.',
  };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const form = FormApp.openByUrl(ss.getSheetByName('안내').getRange('B6').getValue());
  const levels = ss.getSheetByName('코드표').getRange('M2:M6').getValues().map((r) => String(r[0]).trim()).filter(String);
  const rows = ss.getSheetByName('문항').getRange('A2:E').getValues().filter((r) => r[0] !== '');
  const text = (id) => String(rows.find((r) => r[0] === id)[2]).trim();
  if (levels.length !== 5) throw new Error('코드표 M2:M6에 난이도 보기 5개가 있어야 합니다.');

  const done = { q8: 0, q10: 0, q12: 0, name: 0 };
  form.getItems().forEach((it) => {
    const t = it.getTitle();
    if (t === OLD.q8) { it.asMultipleChoiceItem().setTitle(text('q8')).setChoiceValues(levels); done.q8++; }
    else if (t === OLD.q10) { it.setTitle(text('q10')); done.q10++; }
    else if (t === OLD.q12) { it.setTitle(text('q12')); done.q12++; }
  });
  if (!form.getItems().some((it) => it.getTitle() === text('name'))) {
    addNameItem_(form, text('name'), text('grade'));
    done.name = 1;
  }
  form.setDescription(form.getDescription().replace(OLD.anon, NAME_LINE));
  ss.toast('q8 ' + done.q8 + '곳, q10 ' + done.q10 + '곳, q12 ' + done.q12 + '곳을 고치고 이름 문항 ' + done.name + '개를 넣었습니다.', '완료', 12);
}
