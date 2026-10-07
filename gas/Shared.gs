/**
 * WEEKDAY SIGNAL — 共通の定義と処理。
 * **ボット（gas/）と親の画面（gas-parent/）の両方に、同じ中身で置く。**
 * スタンプの数え方などを2か所に書くと、片方だけ直して食い違うため。
 * Google のサービスを呼ばない処理だけを置く（tests/ で Node から確かめている）。
 */

const SHEET_RECORDS = 'records';
const SHEET_USERS = 'users';
const SHEET_GIFTS = 'gifts';
const USERS_HEADER = ['LINEユーザーID', '名前', '有効', '登録日時'];
const GIFTS_HEADER = ['月', 'LINEユーザーID', '名前', 'スタンプ', '目標', '達成日時', '状態', '贈った日時'];

// 記録シートの列。1日1行（日付×ユーザー）。朝と夜で同じ行を埋める
const COLUMNS = [
  'date', 'weekday', 'name', 'user_id',
  'body', 'mood', 'energy', 'antenna', 'quest', 'motto', 'morning_at',
  'quest_result', 'feelings', 'treasure', 'key', 'win',
  'week_best', 'next_self', 'week_reflection', 'night_at',
];
const HEADER_JA = [
  '日付', '曜日', '名前', 'LINEユーザーID',
  '体', '気分', '元気', 'アンテナ', '今日のQUEST', '意気込み', '朝の記入時刻',
  'QUESTの結果', '今日あったもの', '今日の宝物', '俺のKEY', '自分に勝った?',
  '今週の一番の宝物', '来週知りたい自分', '今週のふりかえり', '夜の記入時刻',
];
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const WEEKDAY_JA = { mon: '月', tue: '火', wed: '水', thu: '木', fri: '金', sat: '土', sun: '日' };


/**
 * その月のスタンプ。**朝と夜の両方を書いた平日1日 = スタンプ1つ。**
 * 目標は、指定が無ければ「その月の平日の数」（祝日も平日として数える。入力ページで後から書けるので）。
 *   doneDates: 朝・夜とも書いた日（YYYY-MM-DD）
 */
function monthStamps_(doneDates, ym, goalOverride) {
  const days = monthWeekdays_(ym);
  const set = {};
  doneDates.forEach(function (d) { set[d] = true; });
  const stamped = days.filter(function (d) { return set[d]; });
  const goal = Number(goalOverride) > 0 ? Math.min(Number(goalOverride), days.length) : days.length;
  return { ym: ym, days: days, stamped: stamped, count: stamped.length, goal: goal, achieved: stamped.length >= goal };
}

/** その月の平日（月〜金）を YYYY-MM-DD で */
function monthWeekdays_(ym) {
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
  const out = [];
  for (let d = 1; d <= 31; d++) {
    const dt = new Date(Date.UTC(y, m - 1, d, 3)); // 日本時間の正午
    if (dt.getUTCMonth() !== m - 1) break;
    const wd = dt.getUTCDay();
    if (wd >= 1 && wd <= 5) out.push(ym + '-' + String(d).padStart(2, '0'));
  }
  return out;
}

/** 記録の行（rowToObj_ の形）から、朝・夜とも書いた日を取り出す */
function doneDates_(rows, userId) {
  return rows.filter(function (r) { return r.user_id === userId && r.morning_at && r.night_at; })
    .map(function (r) { return r.date; });
}

/** 朝・夜の入力を、その日の行にまとめる。もう片方の時間帯の値は消さない */
function buildRow_(current, user, date, slot, data, now) {
  const row = {};
  COLUMNS.forEach(function (c) { row[c] = current ? current[c] : ''; });
  row.date = date;
  row.weekday = WEEKDAY_JA[weekdayKey_(new Date(date + 'T12:00:00+09:00'))];
  row.name = user.name || row.name || '';
  row.user_id = user.userId;
  const join = function (v) { return Array.isArray(v) ? v.join('、') : (v || ''); };
  const num = function (v) { const n = Number(v); return n >= 1 && n <= 5 ? n : ''; };
  if (slot === 'morning') {
    row.body = num(data.body); row.mood = num(data.mood); row.energy = num(data.energy);
    row.antenna = join(data.antenna); row.quest = clip_(data.quest); row.motto = clip_(data.motto);
    row.morning_at = jstDateTime_(now);
  } else {
    row.quest_result = clip_(data.quest_result); row.feelings = join(data.feelings);
    row.treasure = clip_(data.treasure); row.key = clip_(data.key); row.win = clip_(data.win);
    row.week_best = clip_(data.week_best); row.next_self = clip_(data.next_self); row.week_reflection = clip_(data.week_reflection);
    row.night_at = jstDateTime_(now);
  }
  return row;
}

/** 今日（または昨日）から遡って、夜まで書いた平日が何日続いているか。土日は飛ばす */
function countStreak_(dates, today) {
  const set = {};
  dates.forEach(function (d) { set[d] = true; });
  let d = new Date(today + 'T12:00:00+09:00');
  if (!set[jstDate_(d)]) d = new Date(d.getTime() - 86400000); // 今日まだなら昨日から数える
  let n = 0;
  for (let i = 0; i < 400; i++) {
    const wd = weekdayKey_(d);
    if (wd !== 'sat' && wd !== 'sun') {
      if (!set[jstDate_(d)]) break;
      n++;
    }
    d = new Date(d.getTime() - 86400000);
  }
  return n;
}

function rowToObj_(arr) {
  const o = {};
  COLUMNS.forEach(function (c, i) { o[c] = c === 'date' ? cellDate_(arr[i]) : arr[i]; });
  return o;
}

function clip_(v) { return String(v == null ? '' : v).slice(0, 500); }
function jstDate_(d) { return new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10); }
function jstDateTime_(d) { return new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 16).replace('T', ' '); }
function weekdayKey_(d) { return WEEKDAYS[new Date(d.getTime() + 9 * 3600000).getUTCDay()]; }
// シートが日付型に変えてしまった値も "YYYY-MM-DD" に戻す
function cellDate_(v) { return v instanceof Date ? jstDate_(v) : String(v); }
function pick_(a) { return a[Math.floor(Math.random() * a.length)]; }
function text_(t) { return { type: 'text', text: t }; }
function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k) || ''; }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
