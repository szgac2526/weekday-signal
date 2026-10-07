/**
 * WEEKDAY SIGNAL — 親の画面（ボットとは別の Apps Script プロジェクト）
 *
 * 【誰が見られるか】
 * Web アプリを「アクセスしているユーザーとして実行」「Google アカウントを持つ全員」で公開する。
 * 画面は**見ている人の Google アカウントで**スプレッドシートを開くので、
 * **スプレッドシートを共有された人だけが中身を見られる。**それ以外の人はログインしても「権限がありません」になる。
 * 見せる人を増やす・減らすのは、スプレッドシートの「共有」で行う（ここのコードは触らない）。
 * 「ギフトを贈った」を押すには、共有が「編集者」である必要がある。
 *
 * スクリプト プロパティ：
 *   SHEET_ID                    記録のスプレッドシートの ID（URL の /d/ と /edit の間）
 *   （任意）LINE_CHANNEL_ACCESS_TOKEN  入れると「贈った」を押したとき本人の LINE に知らせる
 *   （任意）GIFT_LABEL / STAMP_GOAL    ボット側と同じ値にする
 *
 * Shared.gs はボット側（gas/Shared.gs）と同じものを置く。
 */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('WEEKDAY SIGNAL 親の画面')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** 画面が最初に呼ぶ。ym = 'YYYY-MM'、userId は空なら記録のある最初の人 */
function getDashboard(ym, userId) {
  const ss = openSheet_();
  const records = rows_(ss, SHEET_RECORDS).map(rowToObj_).map(plain_);
  const today = jstDate_(new Date());
  ym = /^\d{4}-\d{2}$/.test(ym || '') ? ym : today.slice(0, 7);
  const giftRows = rows_(ss, SHEET_GIFTS);
  // 兄弟の切り替えに、その月のスタンプ数とギフトの状態を載せる。選んでいない子の「未贈呈」を見落とさないため
  const users = rows_(ss, SHEET_USERS).map(function (r) { return { userId: r[0], name: r[1] || '（名前なし）' }; })
    .filter(function (u) { return records.some(function (r) { return r.user_id === u.userId; }); })
    .map(function (u) {
      const s = monthStamps_(doneDates_(records, u.userId), ym, prop_('STAMP_GOAL'));
      const g = giftRows.filter(function (r) { return String(r[0]) === ym && r[1] === u.userId; })[0];
      return { userId: u.userId, name: u.name, count: s.count, goal: s.goal, giftStatus: g ? String(g[6]) : '' };
    });
  const uid = userId || (users[0] && users[0].userId) || '';
  const mine = records.filter(function (r) { return r.user_id === uid; });
  const month = mine.filter(function (r) { return String(r.date).slice(0, 7) === ym; })
    .sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  const st = monthStamps_(doneDates_(mine, uid), ym, prop_('STAMP_GOAL'));
  const gift = giftRows.filter(function (r) { return String(r[0]) === ym && r[1] === uid; })
    .map(function (r) { return { status: r[6], achievedAt: plainCell_(r[5]), sentAt: plainCell_(r[7]) }; })[0] || null;
  const dones = mine.filter(function (r) { return r.night_at; }).map(function (r) { return r.date; });
  return {
    viewer: Session.getActiveUser().getEmail(),
    sheetUrl: ss.getUrl(),
    ym: ym, today: today, users: users, userId: uid,
    stamps: { days: st.days, stamped: st.stamped, count: st.count, goal: st.goal, achieved: st.achieved },
    gift: gift, giftLabel: prop_('GIFT_LABEL') || '1,000円分',
    streak: countStreak_(dones, today),
    rows: month,
  };
}

/** 「ギフトを贈った」。gifts シートの状態を変え、トークンがあれば本人に知らせる */
function markGiftSent(ym, userId) {
  const ss = openSheet_();
  const sh = ss.getSheetByName(SHEET_GIFTS);
  if (!sh) throw new Error('gifts シートがありません');
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === ym && values[i][1] === userId) {
      if (values[i][6] === '贈呈済み') return getDashboard(ym, userId);
      sh.getRange(i + 1, 7, 1, 2).setValues([['贈呈済み', jstDateTime_(new Date())]]);
      const token = prop_('LINE_CHANNEL_ACCESS_TOKEN');
      if (token) {
        UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
          method: 'post', contentType: 'application/json', muteHttpExceptions: true,
          headers: { Authorization: 'Bearer ' + token },
          payload: JSON.stringify({ to: userId, messages: [{ type: 'text',
            text: '🎁 ' + Number(ym.slice(5)) + '月のごほうび（' + (prop_('GIFT_LABEL') || '1,000円分') + '）を贈ったよ！\n毎日のアンテナ、おつかれさま。' }] }),
        });
      }
      return getDashboard(ym, userId);
    }
  }
  throw new Error('この月の達成の記録がありません');
}

function openSheet_() {
  const id = prop_('SHEET_ID');
  if (!id) throw new Error('SHEET_ID が設定されていません');
  try {
    return SpreadsheetApp.openById(id);
  } catch (e) {
    throw new Error('このスプレッドシートを見る権限がありません。共有してもらってから開き直してください');
  }
}

function rows_(ss, name) {
  const sh = ss.getSheetByName(name);
  return sh ? sh.getDataRange().getValues().slice(1) : [];
}

// google.script.run は日付型を返せないので、文字列にそろえる
function plain_(o) { Object.keys(o).forEach(function (k) { o[k] = plainCell_(o[k]); }); return o; }
function plainCell_(v) { return v instanceof Date ? jstDateTime_(v) : v; }
function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k) || ''; }
