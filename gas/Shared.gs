/**
 * Aestus — 共通の定義と処理。
 * **ボット（gas/）と親の画面（gas-parent/）の両方に、同じ中身で置く。**
 * スタンプの数え方などを2か所に書くと、片方だけ直して食い違うため。
 * Google のサービスを呼ばない処理だけを置く（tests/ で Node から確かめている）。
 *
 * 【誰の記録か】記録・スタンプ・ギフトは「子ども」（children シートの子ID）ごとに持つ。
 * LINE のアカウントとは別にしてある。兄弟で1つの LINE を共有しても、1人1つでも同じ作りで動くように。
 * どの LINE からどの子が書けるかは、親が管理画面で決める（children シートの LINEユーザーID）。
 */

const SHEET_RECORDS = 'records';
const SHEET_USERS = 'users';        // 友だち追加した LINE アカウント（ボットが自動で足す）
const SHEET_CHILDREN = 'children';  // 子ども（親が管理画面で足す）
const SHEET_GIFTS = 'gifts';
const SHEET_SETTINGS = 'settings';  // 設問・ごほうび（親が管理画面で変える）
const USERS_HEADER = ['LINEユーザーID', 'LINEの表示名', '有効', '登録日時'];
const CHILDREN_HEADER = ['子ID', '名前', '有効', 'LINEユーザーID', '作成日時'];
const GIFTS_HEADER = ['月', '子ID', '名前', 'スタンプ', '目標', '達成日時', '状態', '贈った日時'];
const SETTINGS_HEADER = ['項目', '値'];

// 記録シートの列。1日1行（日付×子ども）。朝と夜で同じ行を埋める
const COLUMNS = [
  'date', 'weekday', 'name', 'child_id',
  'body', 'mood', 'energy', 'antenna', 'quest', 'motto', 'morning_at',
  'quest_result', 'feelings', 'treasure', 'key', 'win', 'extra', 'night_at',
];
const HEADER_JA = [
  '日付', '曜日', '名前', '子ID',
  '体', '気分', '元気', 'アンテナ', '今日のQUEST', '意気込み', '朝の記入時刻',
  'QUESTの結果', '今日あったもの', '今日の宝物', '俺のKEY', '自分に勝った?', 'その日の追加の質問', '夜の記入時刻',
];
const COL = {};
COLUMNS.forEach(function (c, i) { COL[c] = i; });
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const SCHOOL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const WEEKDAY_JA = { mon: '月', tue: '火', wed: '水', thu: '木', fri: '金', sat: '土', sun: '日' };
const DEFAULT_GIFT_LABEL = '1,000円分';

// 設問の初期値。**web/questions.json と同じ中身**（tests/ が食い違いを見る）
const DEFAULT_QUESTIONS = {
  "_note": "Aestus の設問の初期値（ワーク「WEEKDAY SIGNAL」の 2026-10-07 の最新シート2枚から起こした）。親が管理画面で直すと、スプレッドシートの settings に保存した方が使われる。gas/Shared.gs の DEFAULT_QUESTIONS と同じ中身にする（テストが見る）",
  "condition": {
    "label": "今の俺をチェック",
    "note": "数字は今の状態。良い・悪いはありません",
    "items": [
      {
        "key": "body",
        "label": "体",
        "sub": "からだ"
      },
      {
        "key": "mood",
        "label": "気分",
        "sub": "こころ"
      },
      {
        "key": "energy",
        "label": "元気",
        "sub": "エネルギー"
      }
    ]
  },
  "antenna": {
    "label": "今日のアンテナを1つ選ぶ",
    "note": "興味のあるものを選んでOK",
    "options": [
      "安心",
      "ワクワク",
      "力",
      "つながり",
      "成長",
      "貢献",
      "ブレーキ",
      "音",
      "自由"
    ],
    "multi": false,
    "own": false
  },
  "quest": {
    "label": "今日の SENSITIVITY QUEST",
    "note": "今日はこれを探す！",
    "own": true,
    "before": "今日は、",
    "after": "を見つけてみる。"
  },
  "motto": {
    "enabled": true,
    "label": "今日の意気込み（ひとこと）"
  },
  "quest_result": {
    "label": "QUESTの結果",
    "options": [
      "GET!",
      "惜しい!",
      "見つからなかった",
      "別のものを発見した!"
    ]
  },
  "feelings": {
    "label": "今日あったものに✓",
    "note": "いくつでもOK",
    "options": [
      "楽しい",
      "安心",
      "ワクワク",
      "夢中",
      "嬉しい",
      "つながり",
      "イライラ",
      "怖い",
      "悔しい",
      "迷った",
      "疲れた",
      "特になし"
    ]
  },
  "treasure": {
    "label": "今日の宝物（体験）",
    "note": "今日、一番残っている体験は？"
  },
  "key": {
    "label": "今日の発見（俺のKEY）",
    "note": "その体験で分かった「俺」は？",
    "before": "俺って、",
    "after": "かも。"
  },
  "win": {
    "label": "今日、自分に勝った？",
    "options": [
      "YES!",
      "ちょっと",
      "よく分からない",
      "今日はなし!"
    ]
  },
  "days": {
    "mon": {
      "name": "ME QUEST",
      "theme": "自分を感じる",
      "question": "どんな自分で、この1週間をはじめる？",
      "quests": [
        "「なんか好き」を1個見つける",
        "「なんか嫌」を1個見つける",
        "「やってみたい」を1個見つける",
        "「やりたくない」を1個見つける"
      ],
      "antenna": [],
      "extra_night": []
    },
    "tue": {
      "name": "PEOPLE QUEST",
      "theme": "人を感じる",
      "question": "人との関わりの中で何を感じられる？",
      "quests": [
        "誰かの表情が変わった瞬間を見つける",
        "誰かが嬉しそうになった瞬間を見つける",
        "自分の心が開いた瞬間を見つける",
        "自分の心が閉じた瞬間を見つける"
      ],
      "antenna": [],
      "extra_night": []
    },
    "wed": {
      "name": "BODY QUEST",
      "theme": "身体を感じる",
      "question": "俺の体は、今どんなサインを出してる？",
      "quests": [
        "自分の呼吸が変わった瞬間を見つける",
        "自分の身体が勝手に動いた瞬間を見つける",
        "怖さが出る0.5秒前を捕まえる",
        "体が軽くなった瞬間を見つける"
      ],
      "antenna": [],
      "extra_night": []
    },
    "thu": {
      "name": "WORLD & SOUND QUEST",
      "theme": "世界と音を感じる",
      "question": "今日の世界は、どんな音と景色でできてる？",
      "quests": [
        "「きれい」と思ったものを1個見つける",
        "「いい音」と思った音を1個見つける",
        "今日の自分を助けた音楽を1個見つける",
        "なんとなく好きな景色を1個見つける"
      ],
      "antenna": [],
      "extra_night": []
    },
    "fri": {
      "name": "DISCOVERY QUEST",
      "theme": "発見する",
      "question": "今週の俺から、どんな気づきを見つける？",
      "quests": [
        "「昨日の俺と違う」を1個見つける",
        "今週発見したことを1つ思い出す",
        "自分の成長を1個見つける",
        "来週やってみたいことを1個見つける"
      ],
      "antenna": [],
      "extra_night": []
    }
  },
  "rules": [
    "正解はありません",
    "全部書かなくてもOK",
    "短くてOK",
    "見つからなくてもOK（それも発見）"
  ]
};


// ================================================================ スタンプ

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

/** 記録の行（rowToObj_ の形）から、その子が朝・夜とも書いた日を取り出す */
function doneDates_(rows, childId) {
  return rows.filter(function (r) { return r.child_id === childId && r.morning_at && r.night_at; })
    .map(function (r) { return r.date; });
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

// ================================================================ 記録の行

/** 朝・夜の入力を、その日の行にまとめる。もう片方の時間帯の値は消さない。child = { id, name } */
function buildRow_(current, child, date, slot, data, now) {
  const row = {};
  COLUMNS.forEach(function (c) { row[c] = current ? current[c] : ''; });
  row.date = date;
  row.weekday = WEEKDAY_JA[weekdayKey_(new Date(date + 'T12:00:00+09:00'))];
  row.name = child.name || row.name || '';
  row.child_id = child.id;
  const join = function (v) { return Array.isArray(v) ? v.map(clip_).join('、') : clip_(v); };
  const num = function (v) { const n = Number(v); return n >= 1 && n <= 5 ? n : ''; };
  if (slot === 'morning') {
    row.body = num(data.body); row.mood = num(data.mood); row.energy = num(data.energy);
    row.antenna = join(data.antenna); row.quest = clip_(data.quest); row.motto = clip_(data.motto);
    row.morning_at = jstDateTime_(now);
  } else {
    row.quest_result = clip_(data.quest_result); row.feelings = join(data.feelings);
    row.treasure = clip_(data.treasure); row.key = clip_(data.key); row.win = clip_(data.win);
    // その日だけの追加の質問（親が管理画面で足すもの）は「問い：答え」を改行でつないで1列に入れる。
    // 質問は後から変わるので、列を増やすと過去の行と意味がずれる
    row.extra = (Array.isArray(data.extra) ? data.extra : [])
      .filter(function (x) { return x && String(x.a || '').trim(); }).slice(0, 5)
      .map(function (x) { return clip_(x.q).slice(0, 60) + '：' + clip_(x.a); }).join('\n');
    row.night_at = jstDateTime_(now);
  }
  return row;
}

function rowToObj_(arr) {
  const o = {};
  COLUMNS.forEach(function (c, i) { o[c] = c === 'date' ? cellDate_(arr[i]) : arr[i]; });
  return o;
}

// ================================================================ 子ども と LINE

function childrenFromRows_(rows) {
  return rows.filter(function (r) { return r[0]; }).map(function (r) {
    return { id: String(r[0]), name: String(r[1] || ''), active: r[2] === true || r[2] === 'TRUE', lineUserId: String(r[3] || '') };
  });
}

/** その LINE から書ける子ども（有効な子だけ）。兄弟で1つの LINE を共有していれば2人返る */
function childrenForLine_(children, lineUserId) {
  return children.filter(function (c) { return c.active && lineUserId && c.lineUserId === lineUserId; });
}

/**
 * トークの「【夜のチェック完了】たかまさ」から、どの子の分かを決める。
 * 1行目の名前で探し、見つからなければ、その LINE の子が1人ならその子
 */
function resolveChild_(kids, text) {
  const first = String(text || '').split('\n')[0].replace(/^【[^】]*】\s*/, '').trim();
  const hit = kids.filter(function (c) { return c.name && c.name === first; })[0];
  return hit || (kids.length === 1 ? kids[0] : null);
}

/**
 * 声かけを送る先。**LINE 1つにつき1通**（兄弟で共有していても2通にしない。無料の通数を使うため）。
 * まだその時間帯を書いていない子の名前を添える。全員書いていれば送らない
 */
function remindTargets_(children, todayRows, slot) {
  const doneKey = slot === 'morning' ? 'morning_at' : 'night_at';
  const done = {};
  todayRows.forEach(function (r) { if (r[doneKey]) done[r.child_id] = true; });
  const byLine = {}, order = [];
  children.forEach(function (c) {
    if (!c.active || !c.lineUserId || done[c.id]) return;
    if (!byLine[c.lineUserId]) { byLine[c.lineUserId] = []; order.push(c.lineUserId); }
    byLine[c.lineUserId].push(c.name);
  });
  return order.map(function (id) { return { lineUserId: id, names: byLine[id] }; });
}

/** 新しい子ID。c1, c2, … と数字で増やす（名前を変えても記録がつながるように、名前は ID にしない） */
function newChildId_(children) {
  let n = 0;
  children.forEach(function (c) { const m = /^c(\d+)$/.exec(c.id); if (m) n = Math.max(n, Number(m[1])); });
  return 'c' + (n + 1);
}

// ================================================================ 設定（設問・ごほうび）

/** settings シートの行 [項目, 値] から、使う設定を作る。無い・壊れているものは初期値 */
function parseSettings_(rows) {
  const kv = {};
  rows.forEach(function (r) { if (r[0]) kv[String(r[0])] = r[1]; });
  let q = null;
  try { q = kv.questions ? JSON.parse(String(kv.questions)) : null; } catch (_) { q = null; }
  return {
    questions: normalizeQuestions_(q),
    customized: !!q,
    stampGoal: Number(kv.stamp_goal) > 0 ? Math.floor(Number(kv.stamp_goal)) : 0,
    giftLabel: String(kv.gift_label || '').trim().slice(0, 30),
  };
}

/**
 * 管理画面から来た設問を、決まった形にそろえる。
 * 形は DEFAULT_QUESTIONS が正。知らない項目は捨て、無い項目は初期値で埋める。
 * 入力ページはこの形を前提に組み立てるので、ここを通さずに保存しない
 */
function normalizeQuestions_(input) {
  const d = DEFAULT_QUESTIONS;
  const q = input && typeof input === 'object' ? input : {};
  const o = function (v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; };
  const str = function (v, fb, n) {
    if (v == null) return fb;
    const s = String(v).replace(/[\r\n\t]+/g, ' ').trim().slice(0, n || 80);
    return s || fb;
  };
  const opt = function (v, fb, n) { return v == null ? fb : String(v).replace(/[\r\n\t]+/g, ' ').trim().slice(0, n || 80); };
  const list = function (v, fb, max, allowEmpty) {
    if (!Array.isArray(v)) return fb.slice();
    const seen = {};
    const out = v.map(function (s) { return String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').trim().slice(0, 60); })
      .filter(function (s) { if (!s || seen[s]) return false; seen[s] = true; return true; }).slice(0, max || 24);
    return out.length || allowEmpty ? out : fb.slice();
  };
  const bool = function (v, fb) { return typeof v === 'boolean' ? v : fb; };
  const choice = function (src, def) {
    src = o(src);
    return { label: str(src.label, def.label), options: list(src.options, def.options) };
  };

  const cin = o(q.condition), ain = o(q.antenna), qin = o(q.quest), min = o(q.motto);
  const fin = o(q.feelings), tin = o(q.treasure), kin = o(q.key), din = o(q.days);
  const out = {
    condition: {
      label: str(cin.label, d.condition.label), note: opt(cin.note, d.condition.note),
      items: d.condition.items.map(function (it) {
        const src = o((Array.isArray(cin.items) ? cin.items : []).filter(function (x) { return x && x.key === it.key; })[0]);
        return { key: it.key, label: str(src.label, it.label, 10), sub: opt(src.sub, it.sub, 20) };
      }),
    },
    antenna: {
      label: str(ain.label, d.antenna.label), note: opt(ain.note, d.antenna.note),
      options: list(ain.options, d.antenna.options), multi: bool(ain.multi, d.antenna.multi), own: bool(ain.own, d.antenna.own),
    },
    quest: {
      label: str(qin.label, d.quest.label), note: opt(qin.note, d.quest.note), own: bool(qin.own, d.quest.own),
      before: opt(qin.before, d.quest.before, 20), after: opt(qin.after, d.quest.after, 20),
    },
    motto: { enabled: bool(min.enabled, d.motto.enabled), label: str(min.label, d.motto.label) },
    quest_result: choice(q.quest_result, d.quest_result),
    feelings: { label: str(fin.label, d.feelings.label), note: opt(fin.note, d.feelings.note), options: list(fin.options, d.feelings.options) },
    treasure: { label: str(tin.label, d.treasure.label), note: opt(tin.note, d.treasure.note) },
    key: {
      label: str(kin.label, d.key.label), note: opt(kin.note, d.key.note),
      before: opt(kin.before, d.key.before, 20), after: opt(kin.after, d.key.after, 20),
    },
    win: choice(q.win, d.win),
    days: {},
    rules: list(q.rules, d.rules, 8, true),
  };
  SCHOOL_DAYS.forEach(function (k) {
    const src = o(din[k]), def = d.days[k];
    out.days[k] = {
      name: str(src.name, def.name, 40), theme: str(src.theme, def.theme, 40), question: opt(src.question, def.question),
      // QUEST が空なら、自由に書く欄になる。その日のアンテナが空なら、共通のアンテナを使う
      quests: list(src.quests, def.quests, 8, true),
      antenna: list(src.antenna, def.antenna, 12, true),
      extra_night: list(src.extra_night, def.extra_night, 5, true),
    };
  });
  return out;
}

// ================================================================ 小物

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
