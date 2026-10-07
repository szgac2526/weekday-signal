/**
 * WEEKDAY SIGNAL — Google Apps Script（スプレッドシートに紐づけて使う）
 *
 * 役割は3つ：
 *   1. LINE の Webhook を受ける（友だち追加・メッセージ）→ 返信する（返信は無料枠を使わない）
 *   2. 入力ページ（LIFF）からの送信を受けて、スプレッドシートに1日1行で書く
 *   3. 平日の朝・夜に声かけを送る（時間トリガー）
 *
 * 設定は「プロジェクトの設定 → スクリプト プロパティ」に置く（コードに秘密を書かない）：
 *   LINE_CHANNEL_ACCESS_TOKEN  Messaging API のチャネルアクセストークン（長期）
 *   LINE_LOGIN_CHANNEL_ID      LIFF を作った LINE ログインチャネルのチャネルID（IDトークンの確認に使う）
 *   WEBHOOK_KEY                Webhook URL の末尾に付ける合言葉（?key=…）
 *   LIFF_URL                   https://liff.line.me/xxxxxxxx-xxxxxxxx
 *   （任意）STAMP_GOAL          月のスタンプの目標。無ければその月の平日の数
 *   （任意）GIFT_LABEL          ごほうびの言い方。無ければ「1,000円分」
 *   （任意）PARENT_LINE_USER_ID 達成を LINE で知らせる親のユーザーID（users シートからコピー）
 *
 * 【Webhook に合言葉を付ける理由】
 * Apps Script の doPost はリクエストヘッダーを読めないので、LINE の署名（X-Line-Signature）を確かめられない。
 * 代わりに URL に推測できない合言葉を付け、合わないものは捨てる。
 */


// ---------------------------------------------------------------- 入口

function doPost(e) {
  const body = JSON.parse((e.postData && e.postData.contents) || '{}');
  // LINE からの Webhook
  if (body.events) {
    if (!e.parameter || e.parameter.key !== prop_('WEBHOOK_KEY')) return json_({ ok: false });
    body.events.forEach(handleEvent_);
    return json_({ ok: true });
  }
  // 入力ページから
  try {
    const user = verifyIdToken_(body.idToken);
    if (body.type === 'get') return json_({ ok: true, row: getRow_(body.date, user.userId) });
    if (body.type === 'submit') {
      const row = saveSlot_(user, body.date, body.slot, body.data || {});
      const st = monthStampsFor_(user.userId, String(body.date).slice(0, 7));
      return json_({ ok: true, streak: streak_(user.userId), row: row, stamps: { count: st.count, goal: st.goal } });
    }
    return json_({ ok: false, error: 'unknown type' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

// 動作確認用（ブラウザで Web アプリの URL を開くと出る）
function doGet() {
  return ContentService.createTextOutput('WEEKDAY SIGNAL is running');
}

// ---------------------------------------------------------------- LINE

function handleEvent_(ev) {
  const userId = ev.source && ev.source.userId;
  if (ev.type === 'follow' && userId) {
    registerUser_(userId);
    reply_(ev.replyToken, [text_(
      '友だち追加ありがとう！\nWEEKDAY SIGNAL は、平日の朝と夜に2〜3分ずつ、自分のアンテナを立てて宝物を探すワークです。\n\n' +
      '下のメニューの「朝」「夜」から書けます。正解はありません。短くてOK！'
    ), menuButtons_()]);
    return;
  }
  if (ev.type === 'message' && ev.message && ev.message.type === 'text') {
    const t = ev.message.text || '';
    if (t.indexOf('【朝のチェック完了】') === 0) {
      const msgs = [text_(pick_([
        'アンテナON！いってらっしゃい。', 'いいスタート！今日のQUEST、楽しんで。', 'セット完了。見つからなくてもそれも発見だよ。',
      ]))];
      // 夜を先に書いた日は、朝でスタンプがそろうことがある
      reply_(ev.replyToken, msgs.concat(stampMessages_(userId, false)));
    } else if (t.indexOf('【夜のチェック完了】') === 0) {
      const n = streak_(userId);
      const msgs = [text_(pick_([
        'おつかれさま！今日の宝物、ちゃんと残せたね。', 'GETでも惜しいでも、書いたことが前進。', '今日のKEY、いい言葉だね。',
      ]) + (n >= 2 ? '\n\n連続 ' + n + ' 日目！' : ''))];
      reply_(ev.replyToken, msgs.concat(stampMessages_(userId, true)));
    } else if (/スタンプ|ギフト/.test(t)) {
      reply_(ev.replyToken, [stampCardFlex_(monthStampsFor_(userId, jstDate_(new Date()).slice(0, 7)))]);
    } else {
      reply_(ev.replyToken, [menuButtons_()]);
    }
  }
}

// ---------------------------------------------------------------- スタンプとギフト

// LINE が「ボットから送ってよい」と公開しているスタンプから選ぶ。
// 1つでも番号が違うと返信が丸ごと失敗するので、reply_ は失敗したら文字だけで送り直す
const STICKERS_DAILY = [
  { packageId: '11537', stickerId: '52002734' }, { packageId: '11537', stickerId: '52002735' },
  { packageId: '11538', stickerId: '51626494' }, { packageId: '11538', stickerId: '51626501' },
  { packageId: '11539', stickerId: '52114110' },
];
const STICKER_GOAL = { packageId: '11537', stickerId: '52002739' };

/**
 * 返信に足すもの：今月のスタンプカード。5個ごとにスタンプ（LINE の）。目標に届いた日はお祝いとギフトの予告。
 * 目標に届いたら gifts シートに1行足し、親に知らせる（1か月に1回）
 */
function stampMessages_(userId, withCard) {
  const ym = jstDate_(new Date()).slice(0, 7);
  const st = monthStampsFor_(userId, ym);
  const out = [];
  const newlyAchieved = st.achieved && recordGift_(userId, st);
  if (withCard || newlyAchieved) out.push(stampCardFlex_(st));
  if (newlyAchieved) {
    out.push(text_('🎁 ' + Number(ym.slice(5)) + '月のスタンプがぜんぶそろった！\n' + giftLabel_() + 'のプレゼントを用意するね。届くまで少し待ってて。'));
    out.push(sticker_(STICKER_GOAL));
  } else if (withCard && st.count > 0 && st.count % 5 === 0) {
    out.push(sticker_(pick_(STICKERS_DAILY)));
  }
  return out.slice(0, 4); // 返信は最大5通。先頭の文と合わせて5以内
}

function monthStampsFor_(userId, ym) {
  const values = sheet_(SHEET_RECORDS, HEADER_JA).getDataRange().getValues().slice(1).map(rowToObj_);
  return monthStamps_(doneDates_(values, userId), ym, prop_('STAMP_GOAL'));
}

/** gifts シートに今月の達成を書く。もう書いてあれば false（＝お祝いは1回だけ） */
function recordGift_(userId, st) {
  const sh = sheet_(SHEET_GIFTS, GIFTS_HEADER);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const values = sh.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0]) === st.ym && values[i][1] === userId) return false;
    }
    const u = findUser_(userId) || {};
    sh.appendRow([st.ym, userId, u.name || '', st.count, st.goal, jstDateTime_(new Date()), '未贈呈', '']);
  } finally {
    lock.releaseLock();
  }
  // 親に知らせる（任意）。PARENT_LINE_USER_ID が無ければ親の画面で気づく
  const parent = prop_('PARENT_LINE_USER_ID');
  if (parent) {
    const u = findUser_(userId) || {};
    push_(parent, [text_('🎁 ' + (u.name || '') + 'さんが ' + st.ym + ' のスタンプを全部そろえました（' + st.count + '/' + st.goal + '）。\n' +
      'ギフトを贈ったら、親の画面で「贈った」を押してください。')]);
  }
  return true;
}

function giftLabel_() { return prop_('GIFT_LABEL') || '1,000円分'; }
function sticker_(s) { return { type: 'sticker', packageId: s.packageId, stickerId: s.stickerId }; }

function menuButtons_() {
  const liff = prop_('LIFF_URL');
  return {
    type: 'template', altText: '朝・夜のチェック',
    template: {
      type: 'buttons', text: 'どっちを書く？',
      actions: [
        { type: 'uri', label: '朝のチェック', uri: liff + '?slot=morning' },
        { type: 'uri', label: '夜のチェック', uri: liff + '?slot=night' },
      ],
    },
  };
}

function reply_(replyToken, messages) {
  const code = lineApi_('https://api.line.me/v2/bot/message/reply', { replyToken: replyToken, messages: messages });
  // スタンプやカードの形が1つでも不正だと、返信が丸ごと断られる。そのときは文字だけで送り直す
  if (code !== 200 && messages.length > 1) {
    lineApi_('https://api.line.me/v2/bot/message/reply', { replyToken: replyToken, messages: messages.filter(function (m) { return m.type === 'text'; }).slice(0, 5) });
  }
}

function push_(to, messages) {
  lineApi_('https://api.line.me/v2/bot/message/push', { to: to, messages: messages });
}

function lineApi_(url, payload) {
  return UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + prop_('LINE_CHANNEL_ACCESS_TOKEN') },
    payload: JSON.stringify(payload),
  }).getResponseCode();
}

/** 入力ページから来た IDトークンを LINE に確かめてもらい、誰の送信かを決める */
function verifyIdToken_(idToken) {
  if (!idToken) throw new Error('ログインが確認できません');
  const res = UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'post', muteHttpExceptions: true,
    payload: { id_token: idToken, client_id: prop_('LINE_LOGIN_CHANNEL_ID') },
  });
  const v = JSON.parse(res.getContentText());
  if (res.getResponseCode() !== 200 || !v.sub) throw new Error('ログインの確認に失敗しました（開き直してください）');
  const u = findUser_(v.sub);
  // 友だち追加していない人・止めた人の送信は受けない
  if (!u || !u.active) throw new Error('この LINE アカウントは登録されていません');
  return { userId: v.sub, name: u.name || v.name || '' };
}

// ---------------------------------------------------------------- 声かけ（時間トリガー）

function sendMorningReminder() { remind_('morning'); }
function sendNightReminder() { remind_('night'); }

function remind_(slot) {
  const today = jstDate_(new Date());
  const wd = weekdayKey_(new Date());
  if (wd === 'sat' || wd === 'sun') return; // 平日だけ
  const liff = prop_('LIFF_URL');
  activeUsers_().forEach(function (u) {
    const row = getRow_(today, u.userId);
    // もう書いた人には送らない（無料の通数を使わない）
    if (slot === 'morning' && row && row.morning_at) return;
    if (slot === 'night' && row && row.night_at) return;
    const msg = slot === 'morning'
      ? '☀ おはよう！今日のアンテナを立てよう（2〜3分）\n' + liff + '?slot=morning'
      : '🌙 今日の宝物、見つかった？（2〜3分）\n' + liff + '?slot=night';
    push_(u.userId, [text_(msg)]);
  });
}

/** 最初に1回だけ実行する：シートの用意と、朝・夜の時間トリガー */
function setup() {
  sheet_(SHEET_RECORDS, HEADER_JA);
  sheet_(SHEET_USERS, USERS_HEADER);
  sheet_(SHEET_GIFTS, GIFTS_HEADER);
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sendMorningReminder').timeBased().everyDays(1).atHour(7).inTimezone('Asia/Tokyo').create();
  ScriptApp.newTrigger('sendNightReminder').timeBased().everyDays(1).atHour(21).inTimezone('Asia/Tokyo').create();
}

// ---------------------------------------------------------------- シート

function saveSlot_(user, date, slot, data) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new Error('日付が正しくありません');
  if (slot !== 'morning' && slot !== 'night') throw new Error('朝か夜かが分かりません');
  const sh = sheet_(SHEET_RECORDS, HEADER_JA);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const values = sh.getDataRange().getValues();
    let idx = -1;
    for (let i = 1; i < values.length; i++) {
      if (cellDate_(values[i][0]) === date && values[i][3] === user.userId) { idx = i; break; }
    }
    const current = idx >= 0 ? rowToObj_(values[idx]) : null;
    const next = buildRow_(current, user, date, slot, data, new Date());
    const arr = COLUMNS.map(function (c) { return next[c] === undefined ? '' : next[c]; });
    if (idx >= 0) sh.getRange(idx + 1, 1, 1, arr.length).setValues([arr]);
    else sh.appendRow(arr);
    return next;
  } finally {
    lock.releaseLock();
  }
}

function getRow_(date, userId) {
  const values = sheet_(SHEET_RECORDS, HEADER_JA).getDataRange().getValues();
  for (let i = values.length - 1; i >= 1; i--) {
    if (cellDate_(values[i][0]) === date && values[i][3] === userId) return rowToObj_(values[i]);
  }
  return null;
}

function streak_(userId) {
  const values = sheet_(SHEET_RECORDS, HEADER_JA).getDataRange().getValues();
  const dates = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i][3] === userId && values[i][19]) dates.push(cellDate_(values[i][0]));
  }
  return countStreak_(dates, jstDate_(new Date()));
}

function registerUser_(userId) {
  if (findUser_(userId)) return;
  let name = '';
  try {
    const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/profile/' + userId, {
      headers: { Authorization: 'Bearer ' + prop_('LINE_CHANNEL_ACCESS_TOKEN') }, muteHttpExceptions: true,
    });
    name = JSON.parse(res.getContentText()).displayName || '';
  } catch (_) {}
  sheet_(SHEET_USERS, USERS_HEADER).appendRow([userId, name, true, new Date()]);
}

function findUser_(userId) {
  const values = sheet_(SHEET_USERS, USERS_HEADER).getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === userId) return { userId: userId, name: values[i][1], active: values[i][2] === true || values[i][2] === 'TRUE' };
  }
  return null;
}

function activeUsers_() {
  const values = sheet_(SHEET_USERS, USERS_HEADER).getDataRange().getValues();
  return values.slice(1).filter(function (r) { return r[2] === true || r[2] === 'TRUE'; })
    .map(function (r) { return { userId: r[0], name: r[1] }; });
}

function sheet_(name, header) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(header);
    sh.setFrozenRows(1);
  }
  return sh;
}


/**
 * 今月のスタンプカード（LINE の Flex メッセージ）。平日を週ごとに5列で並べ、押した日に ★
 * Google のサービスを呼ばない（tests/ で形を確かめている）
 */
function stampCardFlex_(st) {
  const set = {};
  st.stamped.forEach(function (d) { set[d] = true; });
  const today = jstDate_(new Date());
  const weeks = [];
  let week = null;
  st.days.forEach(function (d) {
    const wd = weekdayKey_(new Date(d + 'T12:00:00+09:00'));
    if (!week || wd === 'mon') { week = { mon: null, tue: null, wed: null, thu: null, fri: null }; weeks.push(week); }
    week[wd] = d;
  });
  const cell = function (d) {
    if (!d) return { type: 'box', layout: 'vertical', flex: 1, contents: [{ type: 'filler' }] };
    const on = set[d];
    return {
      type: 'box', layout: 'vertical', flex: 1, paddingAll: '4px', cornerRadius: '8px',
      backgroundColor: on ? '#FDE8EC' : (d > today ? '#FFFFFF' : '#F3F4F6'),
      contents: [
        { type: 'text', text: on ? '★' : '・', align: 'center', size: 'lg', color: on ? '#E8798A' : '#C0C4CC' },
        { type: 'text', text: String(Number(d.slice(8))), align: 'center', size: 'xxs', color: '#6B7280' },
      ],
    };
  };
  const head = ['月', '火', '水', '木', '金'].map(function (w) { return { type: 'text', text: w, flex: 1, align: 'center', size: 'xs', color: '#6B7280' }; });
  const rows = weeks.map(function (w) {
    return { type: 'box', layout: 'horizontal', spacing: '4px', contents: ['mon', 'tue', 'wed', 'thu', 'fri'].map(function (k) { return cell(w[k]); }) };
  });
  const left = Math.max(0, st.goal - st.count);
  return {
    type: 'flex', altText: '今月のスタンプ ' + st.count + '/' + st.goal,
    contents: {
      type: 'bubble', size: 'kilo',
      body: {
        type: 'box', layout: 'vertical', spacing: '6px',
        contents: [
          { type: 'text', text: Number(st.ym.slice(5)) + '月のスタンプ', weight: 'bold', size: 'md' },
          { type: 'text', text: st.count + ' / ' + st.goal + (st.achieved ? '　🎁 達成！' : '　あと ' + left + ' 個で 🎁'), size: 'sm', color: st.achieved ? '#E8798A' : '#6B7280' },
          { type: 'box', layout: 'horizontal', spacing: '4px', margin: 'md', contents: head },
        ].concat(rows).concat([
          { type: 'text', text: '朝と夜の両方を書いた日に ★', size: 'xxs', color: '#9CA3AF', margin: 'md', wrap: true },
        ]),
      },
    },
  };
}
