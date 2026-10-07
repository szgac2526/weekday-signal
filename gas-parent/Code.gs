/**
 * Aestus — 親の画面・管理画面（ボットとは別の Apps Script プロジェクト）
 *
 * 【誰が使えるか】
 * Web アプリを「アクセスしているユーザーとして実行」「Google アカウントを持つ全員」で公開する。
 * 画面は**見ている人の Google アカウントで**スプレッドシートを開くので、
 * **スプレッドシートを共有された人だけが中身を見られる。**それ以外の人はログインしても「権限がありません」になる。
 * 使う人を増やす・減らすのは、スプレッドシートの「共有」で行う（ここのコードは触らない）。
 *   閲覧者：記録を見るだけ
 *   編集者：「贈った」、子どもと LINE のつなぎ、設問、ごほうびの変更もできる
 *
 * スクリプト プロパティ：
 *   SHEET_ID                    記録のスプレッドシートの ID（URL の /d/ と /edit の間）
 *   （任意）LINE_CHANNEL_ACCESS_TOKEN  入れると「贈った」を押したとき本人の LINE に知らせる
 *
 * Shared.gs はボット側（gas/Shared.gs）と同じものを置く。
 */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Aestus 親の画面')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ================================================================ 記録を見る

/** 画面が最初に呼ぶ。ym = 'YYYY-MM'、childId は空なら最初の子 */
function getDashboard(ym, childId) {
  const ss = openSheet_();
  const settings = parseSettings_(rows_(ss, SHEET_SETTINGS));
  const records = rows_(ss, SHEET_RECORDS).map(rowToObj_).map(plain_)
    .map(function (r) { r.child_id = String(r.child_id); return r; });
  const today = jstDate_(new Date());
  ym = /^\d{4}-\d{2}$/.test(ym || '') ? ym : today.slice(0, 7);
  const giftRows = rows_(ss, SHEET_GIFTS);
  // 兄弟の切り替えに、その月のスタンプ数とギフトの状態を載せる。選んでいない子の「未贈呈」を見落とさないため。
  // 止めた子も、記録があれば見られるようにする
  const kids = childrenFromRows_(rows_(ss, SHEET_CHILDREN))
    .filter(function (c) { return c.active || records.some(function (r) { return r.child_id === c.id; }); })
    .map(function (c) {
      const s = monthStamps_(doneDates_(records, c.id), ym, settings.stampGoal);
      const g = giftRows.filter(function (r) { return String(r[0]) === ym && String(r[1]) === c.id; })[0];
      return { id: c.id, name: c.name || '（名前なし）', count: s.count, goal: s.goal, giftStatus: g ? String(g[6]) : '' };
    });
  const cid = kids.some(function (c) { return c.id === childId; }) ? childId : (kids[0] && kids[0].id) || '';
  const mine = records.filter(function (r) { return r.child_id === cid; });
  const month = mine.filter(function (r) { return String(r.date).slice(0, 7) === ym; })
    .sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  const st = monthStamps_(doneDates_(mine, cid), ym, settings.stampGoal);
  const gift = giftRows.filter(function (r) { return String(r[0]) === ym && String(r[1]) === cid; })
    .map(function (r) { return { status: r[6], achievedAt: plainCell_(r[5]), sentAt: plainCell_(r[7]) }; })[0] || null;
  const dones = mine.filter(function (r) { return r.night_at; }).map(function (r) { return r.date; });
  return {
    viewer: Session.getActiveUser().getEmail(),
    sheetUrl: ss.getUrl(),
    ym: ym, today: today, children: kids, childId: cid,
    stamps: { days: st.days, stamped: st.stamped, count: st.count, goal: st.goal, achieved: st.achieved },
    gift: gift, giftLabel: settings.giftLabel || DEFAULT_GIFT_LABEL,
    streak: countStreak_(dones, today),
    rows: month,
  };
}

/** 「ギフトを贈った」。gifts シートの状態を変え、トークンがあればその子の LINE に知らせる */
function markGiftSent(ym, childId) {
  const ss = openSheet_();
  const sh = ss.getSheetByName(SHEET_GIFTS);
  if (!sh) throw new Error('gifts シートがありません');
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === ym && String(values[i][1]) === childId) {
      if (values[i][6] === '贈呈済み') return getDashboard(ym, childId);
      writeOrExplain_(function () { sh.getRange(i + 1, 7, 1, 2).setValues([['贈呈済み', jstDateTime_(new Date())]]); });
      const child = childrenFromRows_(rows_(ss, SHEET_CHILDREN)).filter(function (c) { return c.id === childId; })[0];
      const token = prop_('LINE_CHANNEL_ACCESS_TOKEN');
      if (token && child && child.lineUserId) {
        const label = parseSettings_(rows_(ss, SHEET_SETTINGS)).giftLabel || DEFAULT_GIFT_LABEL;
        UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
          method: 'post', contentType: 'application/json', muteHttpExceptions: true,
          headers: { Authorization: 'Bearer ' + token },
          payload: JSON.stringify({ to: child.lineUserId, messages: [{ type: 'text',
            text: '🎁 ' + child.name + '、' + Number(ym.slice(5)) + '月のごほうび（' + label + '）を贈ったよ！\n毎日のアンテナ、おつかれさま。' }] }),
        });
      }
      return getDashboard(ym, childId);
    }
  }
  throw new Error('この月の達成の記録がありません');
}

// ================================================================ 管理（子ども・LINE・設問・ごほうび）

/** 管理タブが開くときに呼ぶ */
function getAdmin() {
  const ss = openSheet_();
  const settings = parseSettings_(rows_(ss, SHEET_SETTINGS));
  const lines = rows_(ss, SHEET_USERS).filter(function (r) { return r[0]; }).map(function (r) {
    return { id: String(r[0]), name: String(r[1] || ''), active: r[2] === true || r[2] === 'TRUE', since: plainCell_(r[3]) };
  });
  return {
    viewer: Session.getActiveUser().getEmail(),
    sheetUrl: ss.getUrl(),
    children: childrenFromRows_(rows_(ss, SHEET_CHILDREN)),
    lines: lines,
    questions: settings.questions,
    customized: settings.customized,
    defaults: normalizeQuestions_(null),
    stampGoal: settings.stampGoal,
    giftLabel: settings.giftLabel,
    defaultGiftLabel: DEFAULT_GIFT_LABEL,
  };
}

/**
 * 子どもの一覧を保存する。list = [{ id?, name, active, lineUserId }]
 * **子は消さない**（記録が子IDでつながっているため）。使わなくなった子は「有効」を外す
 */
function saveChildren(list) {
  const ss = openSheet_();
  const sh = sheet_(ss, SHEET_CHILDREN, CHILDREN_HEADER);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const current = childrenFromRows_(sh.getDataRange().getValues().slice(1));
    const lineIds = {};
    rows_(ss, SHEET_USERS).forEach(function (r) { if (r[0]) lineIds[String(r[0])] = true; });
    const byId = {};
    current.forEach(function (c) { byId[c.id] = c; });
    const names = {};
    (Array.isArray(list) ? list : []).slice(0, 10).forEach(function (x) {
      const name = String(x && x.name || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 20);
      if (!name) return;
      if (names[name]) throw new Error('「' + name + '」が2人います。名前は1人ずつ変えてください（LINE のメッセージで見分けるため）');
      names[name] = true;
      const lineUserId = lineIds[String(x.lineUserId || '')] ? String(x.lineUserId) : '';
      const id = x.id && byId[x.id] ? x.id : newChildId_(current);
      const c = byId[id] || { id: id, created: new Date() };
      c.name = name; c.active = x.active !== false; c.lineUserId = lineUserId;
      if (!byId[id]) { byId[id] = c; current.push(c); }
    });
    const out = current.map(function (c) { return [c.id, c.name, c.active, c.lineUserId, c.created || '']; });
    // 作成日時は書き換えない（既存の行はシートの値を残す）
    const old = sh.getDataRange().getValues().slice(1);
    out.forEach(function (r) { const o = old.filter(function (x) { return String(x[0]) === r[0]; })[0]; if (o) r[4] = o[4]; });
    writeOrExplain_(function () {
      if (old.length) sh.getRange(2, 1, old.length, CHILDREN_HEADER.length).clearContent();
      if (out.length) sh.getRange(2, 1, out.length, CHILDREN_HEADER.length).setValues(out);
    });
  } finally {
    lock.releaseLock();
  }
  return getAdmin();
}

/** LINE アカウントの「有効」を変える（親が試しに友だち追加した LINE を止める、など） */
function setLineActive(lineUserId, active) {
  const ss = openSheet_();
  const sh = ss.getSheetByName(SHEET_USERS);
  if (!sh) throw new Error('users シートがありません');
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === lineUserId) {
      writeOrExplain_(function () { sh.getRange(i + 1, 3).setValue(active === true); });
      return getAdmin();
    }
  }
  throw new Error('その LINE アカウントが見つかりません');
}

/** 設問を保存する。必ず normalizeQuestions_ を通す（入力ページはこの形を前提に組み立てる） */
function saveQuestions(q) {
  const ss = openSheet_();
  setSetting_(ss, 'questions', JSON.stringify(normalizeQuestions_(q)));
  return getAdmin();
}

/** 設問をシートどおり（初期値）に戻す */
function resetQuestions() {
  const ss = openSheet_();
  setSetting_(ss, 'questions', '');
  return getAdmin();
}

/** ごほうび：目標（0 ならその月の平日の数）と、言い方 */
function saveReward(goal, label) {
  const ss = openSheet_();
  const g = Math.max(0, Math.min(23, Math.floor(Number(goal) || 0)));
  setSetting_(ss, 'stamp_goal', g ? g : '');
  setSetting_(ss, 'gift_label', String(label || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 30));
  return getAdmin();
}

function setSetting_(ss, key, value) {
  const sh = sheet_(ss, SHEET_SETTINGS, SETTINGS_HEADER);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const values = sh.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0]) === key) { writeOrExplain_(function () { sh.getRange(i + 1, 2).setValue(value); }); return; }
    }
    writeOrExplain_(function () { sh.appendRow([key, value]); });
  } finally {
    lock.releaseLock();
  }
}

// ================================================================ シート

function openSheet_() {
  const id = prop_('SHEET_ID');
  if (!id) throw new Error('SHEET_ID が設定されていません');
  try {
    return SpreadsheetApp.openById(id);
  } catch (e) {
    throw new Error('このスプレッドシートを見る権限がありません。共有してもらってから開き直してください');
  }
}

/** 書き込みが権限で断られたら、何をすればよいかを返す（閲覧者として共有されている場合） */
function writeOrExplain_(fn) {
  try {
    fn();
  } catch (e) {
    throw new Error('変更できませんでした。スプレッドシートの共有が「閲覧者」になっていないか確かめてください（変更には「編集者」が要ります）');
  }
}

function sheet_(ss, name, header) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    writeOrExplain_(function () { sh = ss.insertSheet(name); sh.appendRow(header); sh.setFrozenRows(1); });
  }
  return sh;
}

function rows_(ss, name) {
  const sh = ss.getSheetByName(name);
  return sh ? sh.getDataRange().getValues().slice(1) : [];
}

// google.script.run は日付型を返せないので、文字列にそろえる
function plain_(o) { Object.keys(o).forEach(function (k) { o[k] = plainCell_(o[k]); }); return o; }
function plainCell_(v) { return v instanceof Date ? jstDateTime_(v) : v; }
