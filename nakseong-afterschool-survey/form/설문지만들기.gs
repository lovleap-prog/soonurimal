/**
 * 낙성초 방과후학교 인식 설문: 설문지 만들기
 * 이 시트의 [문항]·[코드표] 탭을 읽어 Google 설문지를 만들고,
 * 응답이 이 시트의 '응답원본' 탭으로 들어오도록 연결합니다. 한 번만 실행하세요.
 */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('방과후 설문').addItem('설문지 만들기', '설문지만들기').addToUi();
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

  const rows = ss.getSheetByName('문항').getRange('A2:E').getValues().filter((r) => r[0] !== '');
  const common = rows.filter((r) => r[1] === '공통');
  const perClass = rows.filter((r) => r[1] === '수업별');
  if (common.length !== 4 || perClass.length !== 13 || programs.length !== 5) {
    throw new Error('문항 수가 달라졌습니다. 공통 4개(학년 포함), 수업별 13개, 수업 5개여야 응답 변환 수식이 맞습니다.');
  }

  const form = FormApp.create('🏫 낙성초 방과후 수업, 내 생각은?');
  form.setDescription([
    '방과후 수업에 대한 여러분의 생각이 궁금해요.',
    '',
    '✏️ 이름은 쓰지 않아요. 누가 답했는지 아무도 몰라요.',
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
    } else if (type === '5점') {
      form.addMultipleChoiceItem().setTitle(title).setChoiceValues(scale).setRequired(required);
    } else if (type === '선택형') {
      form.addCheckboxItem().setTitle(title).setChoiceValues(changes).setRequired(required);
    } else {
      form.addParagraphTextItem().setTitle(title).setRequired(required);
    }
  };

  // 1쪽: 학년과 공통 문항
  form.addSectionHeaderItem().setTitle('먼저, 방과후 시간에 대해 물어볼게요')
    .setHelpText('수업 하나가 아니라 방과후 시간 전체를 떠올리며 답해요.');
  common.forEach(addQuestion);

  // 수업 문항은 두 쪽으로 나눕니다: 고르는 문항 10개, 그다음 쓰는 문항 3개.
  const pick = perClass.filter((r) => String(r[3]).trim() === '5점');
  const write = perClass.filter((r) => String(r[3]).trim() !== '5점');
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

  let link = form.getPublishedUrl();
  try { link = form.shortenFormUrl(link); } catch (e) { /* 짧은 주소를 못 만들면 긴 주소를 씁니다 */ }

  const guide = ss.getSheetByName('안내');
  guide.getRange('B5').setValue(link);
  guide.getRange('B6').setValue(form.getEditUrl());
  ss.toast('설문지를 만들었습니다. 안내 탭 B5 주소로 QR 코드를 만드세요.', '완료', 10);
  Logger.log('응답 주소: ' + link);
  Logger.log('편집 주소: ' + form.getEditUrl());
}
