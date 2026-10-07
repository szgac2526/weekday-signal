/**
 * Aestus — Google Apps Script（スプレッドシートに紐づけて使う）
 *
 * 役割は3つ：
 *   1. LINE の Webhook を受ける（友だち追加・メッセージ）→ 返信する（返信は無料枠を使わない）
 *   2. 入力ページ（LIFF）に設問と「この LINE から書ける子ども」を渡し、送信をスプレッドシートに1日1行で書く
 *   3. 平日の朝・夜に声かけを送る（時間トリガー）
 *
 * 設問・ごほうびの言い方・目標は、親が管理画面で変える（settings シート）。ここには書かない
 *
 * 設定は「プロジェクトの設定 → スクリプト プロパティ」に置く（コードに秘密を書かない）：
 *   LINE_CHANNEL_ACCESS_TOKEN  Messaging API のチャネルアクセストークン（長期）
 *   LINE_LOGIN_CHANNEL_ID      LIFF を作った LINE ログインチャネルのチャネルID（IDトークンの確認に使う）
 *   WEBHOOK_KEY                Webhook URL の末尾に付ける合言葉（?key=…）
 *   LIFF_URL                   https://liff.line.me/xxxxxxxx-xxxxxxxx
 *   （任意）PARENT_LINE_USER_ID 達成を LINE で知らせる親のユーザーID（users シートからコピー）
 *
 * 【Webhook に合言葉を付ける理由】
 * Apps Script の doPost はリクエストヘッダーを読めないので、LINE の署名（X-Line-Signature）を確かめられない。
 * 代わりに URL に推測できない合言葉を付け、合わないものは捨てる。
 */


// ---------------------------------------------------------------- 入口

function doPost(e) {
  // エディタの「実行」で doPost を選んで押すと、届いたリクエストが無いので e が空になる。
  // そのときは何をすればよいかを出す（LINE や入力ページから呼ばれたときは必ず e がある）
  if (!e) throw new Error('doPost はエディタから実行するものではありません。LINE と入力ページから呼ばれます。最初の準備なら、関数「setup」を選んで実行してください');
  const body = JSON.parse((e.postData && e.postData.contents) || '{}');
  // LINE からの Webhook
  if (body.events) {
    if (!e.parameter || e.parameter.key !== prop_('WEBHOOK_KEY')) return json_({ ok: false });
    body.events.forEach(handleEvent_);
    return json_({ ok: true });
  }
  // 入力ページから
  try {
    const line = verifyIdToken_(body.idToken);
    const kids = childrenForLine_(children_(), line.userId);
    if (body.type === 'config') {
      // 子どもがまだつながっていなくても設問は返す（画面で「親に頼んでね」を出すため）
      return json_({ ok: true, questions: settings_().questions, children: kids.map(function (c) { return { id: c.id, name: c.name }; }),
        lineName: line.name });
    }
    const child = kids.filter(function (c) { return c.id === body.childId; })[0];
    if (!child) throw new Error('この LINE からは、その人の分を書けません（親の画面でつなげてもらってください）');
    if (body.type === 'get') return json_({ ok: true, row: getRow_(body.date, child.id) });
    if (body.type === 'submit') {
      const row = saveSlot_(child, body.date, body.slot, body.data || {});
      const st = monthStampsFor_(child.id, String(body.date).slice(0, 7));
      return json_({ ok: true, streak: streak_(child.id), row: row, stamps: { count: st.count, goal: st.goal } });
    }
    return json_({ ok: false, error: 'unknown type' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

// 動作確認用（ブラウザで Web アプリの URL を開くと出る）
function doGet() {
  return ContentService.createTextOutput('Aestus is running');
}

// ---------------------------------------------------------------- LINE

function handleEvent_(ev) {
  const userId = ev.source && ev.source.userId;
  if (ev.type === 'follow' && userId) {
    registerUser_(userId);
    reply_(ev.replyToken, [text_(
      '友だち追加ありがとう！Aestus です。\nワーク「WEEKDAY SIGNAL」を、平日の朝と夜に2〜3分ずつ、自分のアンテナを立てて宝物を探そう。\n\n' +
      '下のメニューの「朝」「夜」から書けます。正解はありません。短くてOK！'
    ), menuButtons_()]);
    return;
  }
  if (ev.type === 'message' && ev.message && ev.message.type === 'text') {
    const t = ev.message.text || '';
    const kids = childrenForLine_(children_(), userId);
    if (t.indexOf('【朝のチェック完了】') === 0) {
      const child = resolveChild_(kids, t);
      const msgs = [text_(pick_([
        'アンテナON！いってらっしゃい。', 'いいスタート！今日のQUEST、楽しんで。', 'セット完了。見つからなくてもそれも発見だよ。',
      ]))];
      // 夜を先に書いた日は、朝でスタンプがそろうことがある
      reply_(ev.replyToken, child ? msgs.concat(stampMessages_(child, false)) : msgs);
    } else if (t.indexOf('【夜のチェック完了】') === 0) {
      const child = resolveChild_(kids, t);
      const n = child ? streak_(child.id) : 0;
      const msgs = [text_(pick_([
        'おつかれさま！今日の宝物、ちゃんと残せたね。', 'GETでも惜しいでも、書いたことが前進。', '今日のKEY、いい言葉だね。',
      ]) + (n >= 2 ? '\n\n連続 ' + n + ' 日目！' : ''))];
      reply_(ev.replyToken, child ? msgs.concat(stampMessages_(child, true)) : msgs);
    } else if (/スタンプ|ギフト/.test(t)) {
      // 兄弟で共有している LINE なら、2人分のカードを並べる
      const ym = jstDate_(new Date()).slice(0, 7);
      const cards = kids.slice(0, 5).map(function (c) { return stampCardFlex_(monthStampsFor_(c.id, ym), c.name); });
      reply_(ev.replyToken, cards.length ? cards : [text_('まだ名前が登録されていません。親の画面で、この LINE と名前をつなげてもらってください。')]);
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
 * 目標に届いたら gifts シートに1行足し、親に知らせる（1人1か月に1回）
 */
function stampMessages_(child, withCard) {
  const ym = jstDate_(new Date()).slice(0, 7);
  const st = monthStampsFor_(child.id, ym);
  const out = [];
  const newlyAchieved = st.achieved && recordGift_(child, st);
  if (withCard || newlyAchieved) out.push(stampCardFlex_(st, child.name));
  if (newlyAchieved) {
    out.push(text_('🎁 ' + child.name + '、' + Number(ym.slice(5)) + '月のスタンプがぜんぶそろった！\n' + giftLabel_() + 'のプレゼントを用意するね。届くまで少し待ってて。'));
    out.push(sticker_(STICKER_GOAL));
  } else if (withCard && st.count > 0 && st.count % 5 === 0) {
    out.push(sticker_(pick_(STICKERS_DAILY)));
  }
  return out.slice(0, 4); // 返信は最大5通。先頭の文と合わせて5以内
}

function monthStampsFor_(childId, ym) {
  return monthStamps_(doneDates_(records_(), childId), ym, settings_().stampGoal);
}

/** gifts シートに今月の達成を書く。もう書いてあれば false（＝お祝いは1回だけ） */
function recordGift_(child, st) {
  const sh = sheet_(SHEET_GIFTS, GIFTS_HEADER);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const values = sh.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0]) === st.ym && String(values[i][1]) === child.id) return false;
    }
    sh.appendRow([st.ym, child.id, child.name, st.count, st.goal, jstDateTime_(new Date()), '未贈呈', '']);
  } finally {
    lock.releaseLock();
  }
  // 親に知らせる（任意）。PARENT_LINE_USER_ID が無ければ親の画面で気づく
  const parent = prop_('PARENT_LINE_USER_ID');
  if (parent) {
    push_(parent, [text_('🎁 ' + child.name + 'さんが ' + st.ym + ' のスタンプを全部そろえました（' + st.count + '/' + st.goal + '）。\n' +
      'ギフトを贈ったら、親の画面で「贈った」を押してください。')]);
  }
  return true;
}

function giftLabel_() { return settings_().giftLabel || DEFAULT_GIFT_LABEL; }
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

/** 入力ページから来た IDトークンを LINE に確かめてもらい、どの LINE からの送信かを決める */
function verifyIdToken_(idToken) {
  if (!idToken) throw new Error('ログインが確認できません');
  const res = UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'post', muteHttpExceptions: true,
    payload: { id_token: idToken, client_id: prop_('LINE_LOGIN_CHANNEL_ID') },
  });
  const v = JSON.parse(res.getContentText());
  if (res.getResponseCode() !== 200 || !v.sub) throw new Error('ログインの確認に失敗しました（開き直してください）');
  let u = findUser_(v.sub);
  // Webhook がつながる前に友だち追加した LINE は、users シートに載っていない（友だち追加の知らせを受け損ねている）。
  // 友だちかどうかは LINE に聞けるので、友だちならここで載せる。ブロック→解除をしてもらわずに済むように
  if (!u && profile_(v.sub)) { registerUser_(v.sub); u = findUser_(v.sub); }
  if (!u) throw new Error('この LINE アカウントは登録されていません（公式アカウントを友だち追加してください）');
  if (!u.active) throw new Error('この LINE は止められています（親の画面の「子どもと LINE」で再開できます）');
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
  const activeLines = {};
  activeUsers_().forEach(function (u) { activeLines[u.userId] = true; });
  const todays = records_().filter(function (r) { return r.date === today; });
  // まだ書いていない子がいる LINE にだけ、1通ずつ（無料の通数を使わない）
  remindTargets_(children_(), todays, slot).forEach(function (t) {
    if (!activeLines[t.lineUserId]) return;
    const who = t.names.length > 1 ? '（' + t.names.join('・') + '）' : '';
    const msg = slot === 'morning'
      ? '☀ おはよう！今日のアンテナを立てよう' + who + '（2〜3分）\n' + liff + '?slot=morning'
      : '🌙 今日の宝物、見つかった？' + who + '（2〜3分）\n' + liff + '?slot=night';
    push_(t.lineUserId, [text_(msg)]);
  });
}

/** 最初に1回だけ実行する：シートの用意と、朝・夜の時間トリガー */
function setup() {
  sheet_(SHEET_RECORDS, HEADER_JA);
  sheet_(SHEET_USERS, USERS_HEADER);
  sheet_(SHEET_CHILDREN, CHILDREN_HEADER);
  sheet_(SHEET_GIFTS, GIFTS_HEADER);
  sheet_(SHEET_SETTINGS, SETTINGS_HEADER);
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sendMorningReminder').timeBased().everyDays(1).atHour(7).inTimezone('Asia/Tokyo').create();
  ScriptApp.newTrigger('sendNightReminder').timeBased().everyDays(1).atHour(21).inTimezone('Asia/Tokyo').create();
}

// ---------------------------------------------------------------- シート

function saveSlot_(child, date, slot, data) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new Error('日付が正しくありません');
  if (slot !== 'morning' && slot !== 'night') throw new Error('朝か夜かが分かりません');
  const sh = sheet_(SHEET_RECORDS, HEADER_JA);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const values = sh.getDataRange().getValues();
    let idx = -1;
    for (let i = 1; i < values.length; i++) {
      if (cellDate_(values[i][COL.date]) === date && String(values[i][COL.child_id]) === child.id) { idx = i; break; }
    }
    const current = idx >= 0 ? rowToObj_(values[idx]) : null;
    const next = buildRow_(current, child, date, slot, data, new Date());
    const arr = COLUMNS.map(function (c) { return next[c] === undefined ? '' : next[c]; });
    if (idx >= 0) sh.getRange(idx + 1, 1, 1, arr.length).setValues([arr]);
    else sh.appendRow(arr);
    return next;
  } finally {
    lock.releaseLock();
  }
}

function records_() {
  return sheet_(SHEET_RECORDS, HEADER_JA).getDataRange().getValues().slice(1).map(rowToObj_)
    .map(function (r) { r.child_id = String(r.child_id); return r; });
}

function getRow_(date, childId) {
  const rows = records_();
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].date === date && rows[i].child_id === childId) return rows[i];
  }
  return null;
}

function streak_(childId) {
  const dates = records_().filter(function (r) { return r.child_id === childId && r.night_at; }).map(function (r) { return r.date; });
  return countStreak_(dates, jstDate_(new Date()));
}

function children_() {
  return childrenFromRows_(sheet_(SHEET_CHILDREN, CHILDREN_HEADER).getDataRange().getValues().slice(1));
}

let settingsCache_ = null;
function settings_() {
  if (!settingsCache_) settingsCache_ = parseSettings_(sheet_(SHEET_SETTINGS, SETTINGS_HEADER).getDataRange().getValues().slice(1));
  return settingsCache_;
}

function registerUser_(userId) {
  if (findUser_(userId)) return;
  const p = profile_(userId);
  sheet_(SHEET_USERS, USERS_HEADER).appendRow([userId, (p && p.displayName) || '', true, new Date()]);
}

/** LINE のプロフィール。公式アカウントの友だちでなければ null（LINE が 404 を返す） */
function profile_(userId) {
  try {
    const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/profile/' + encodeURIComponent(userId), {
      headers: { Authorization: 'Bearer ' + prop_('LINE_CHANNEL_ACCESS_TOKEN') }, muteHttpExceptions: true,
    });
    return res.getResponseCode() === 200 ? JSON.parse(res.getContentText()) : null;
  } catch (_) {
    return null;
  }
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
function stampCardFlex_(st, name) {
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
    type: 'flex', altText: (name ? name + ' ' : '') + '今月のスタンプ ' + st.count + '/' + st.goal,
    contents: {
      type: 'bubble', size: 'kilo',
      body: {
        type: 'box', layout: 'vertical', spacing: '6px',
        contents: [
          { type: 'text', text: (name ? name + '　' : '') + Number(st.ym.slice(5)) + '月のスタンプ', weight: 'bold', size: 'md', wrap: true },
          { type: 'text', text: st.count + ' / ' + st.goal + (st.achieved ? '　🎁 達成！' : '　あと ' + left + ' 個で 🎁'), size: 'sm', color: st.achieved ? '#E8798A' : '#6B7280' },
          { type: 'box', layout: 'horizontal', spacing: '4px', margin: 'md', contents: head },
        ].concat(rows).concat([
          { type: 'text', text: '朝と夜の両方を書いた日に ★', size: 'xxs', color: '#9CA3AF', margin: 'md', wrap: true },
        ]),
      },
    },
  };
}
