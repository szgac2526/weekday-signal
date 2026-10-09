// Code.gs の「純粋な処理」を Node で確かめる（Google のサービスは使わない部分だけ）
const fs = require("fs"), vm = require("vm"), assert = require("assert");
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + "/../gas/Shared.gs", "utf8") + fs.readFileSync(__dirname + "/../gas/Code.gs", "utf8") + "\nthis.api={buildRow_,countStreak_,jstDate_,weekdayKey_,COLUMNS,HEADER_JA,monthStamps_,monthWeekdays_,doneDates_,stampCardFlex_,normalizeQuestions_,parseSettings_,DEFAULT_QUESTIONS,childrenFromRows_,childrenForLine_,resolveChild_,dueReminders_,normTime_,newChildId_};", ctx);
const { buildRow_, countStreak_, jstDate_, weekdayKey_, COLUMNS, HEADER_JA, monthStamps_, monthWeekdays_, doneDates_, stampCardFlex_, normalizeQuestions_, parseSettings_, DEFAULT_QUESTIONS,
  childrenFromRows_, childrenForLine_, resolveChild_, dueReminders_, normTime_, newChildId_ } = ctx.api;
const user = { id: "c1", name: "たかまさ" };
// vm の中で作った配列・オブジェクトは deepStrictEqual で別物扱いになるので、JSON で比べる
const same = (a, b) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
let ok = 0; const t = (name, fn) => { fn(); ok++; console.log("✓", name); };

t("日本時間の日付と曜日（UTC 15:30 は翌日の0:30）", () => {
  const d = new Date("2026-10-06T15:30:00Z");
  assert.strictEqual(jstDate_(d), "2026-10-07"); assert.strictEqual(weekdayKey_(d), "wed");
});
t("朝の入力が行になる。範囲外の数字は空にする", () => {
  const r = buildRow_(null, user, "2026-10-05", "morning", { body: "3", mood: "9", energy: 5, antenna: ["ワクワク", "音"], quest: "Q", motto: "" }, new Date("2026-10-04T22:10:00Z"));
  assert.strictEqual(r.weekday, "月"); assert.strictEqual(r.body, 3); assert.strictEqual(r.mood, ""); assert.strictEqual(r.energy, 5);
  assert.strictEqual(r.antenna, "ワクワク、音"); assert.strictEqual(r.morning_at, "2026-10-05 07:10"); assert.strictEqual(r.night_at, "");
});
t("夜を書いても朝の値は消えない", () => {
  const m = buildRow_(null, user, "2026-10-05", "morning", { body: 2, antenna: ["力"], quest: "Q" }, new Date("2026-10-04T22:00:00Z"));
  const n = buildRow_(m, user, "2026-10-05", "night", { quest_result: "GET!", feelings: ["楽しい"], key: "攻める", win: "YES!" }, new Date("2026-10-05T12:00:00Z"));
  assert.strictEqual(n.body, 2); assert.strictEqual(n.quest, "Q"); assert.strictEqual(n.quest_result, "GET!");
  assert.strictEqual(n.feelings, "楽しい"); assert.strictEqual(n.night_at, "2026-10-05 21:00");
  assert.deepStrictEqual(Object.keys(n).sort(), [...COLUMNS].sort());
});
t("長すぎる文字は500字で切る", () => {
  const r = buildRow_(null, user, "2026-10-05", "night", { treasure: "あ".repeat(800) }, new Date());
  assert.strictEqual(r.treasure.length, 500);
});
t("連続日数は土日を飛ばして数える。今日まだなら昨日から", () => {
  // 2026-10-02(金) 10-05(月) 10-06(火) を書いて、今日 10-07(水) はまだ
  assert.strictEqual(countStreak_(["2026-10-02", "2026-10-05", "2026-10-06"], "2026-10-07"), 3);
  assert.strictEqual(countStreak_(["2026-10-02", "2026-10-05", "2026-10-06", "2026-10-07"], "2026-10-07"), 4);
  assert.strictEqual(countStreak_(["2026-10-05", "2026-10-07"], "2026-10-07"), 1); // 火曜が抜けた
  assert.strictEqual(countStreak_([], "2026-10-07"), 0);
});
t("2026年10月の平日は22日。1日は木曜", () => {
  const d = monthWeekdays_("2026-10");
  assert.strictEqual(d.length, 22); assert.strictEqual(d[0], "2026-10-01"); assert.strictEqual(d.at(-1), "2026-10-30");
});
t("スタンプは朝と夜の両方を書いた平日だけ。土日の記録は数えない", () => {
  const rows = [
    { child_id: "c1", date: "2026-10-05", morning_at: "x", night_at: "y" },
    { child_id: "c1", date: "2026-10-06", morning_at: "x", night_at: "" },   // 夜なし
    { child_id: "c1", date: "2026-10-10", morning_at: "x", night_at: "y" },  // 土曜
    { child_id: "c2", date: "2026-10-07", morning_at: "x", night_at: "y" },  // 別の人
  ];
  const st = monthStamps_(doneDates_(rows, "c1"), "2026-10", "");
  assert.strictEqual(st.count, 1); assert.strictEqual(st.goal, 22); assert.strictEqual(st.achieved, false);
});
t("目標を指定できる。平日の数より大きい指定は平日の数にそろえる", () => {
  const dates = monthWeekdays_("2026-10").slice(0, 20);
  assert.strictEqual(monthStamps_(dates, "2026-10", "20").achieved, true);
  assert.strictEqual(monthStamps_(dates, "2026-10", "99").goal, 22);
});
t("セッションのカードは週ごとに5列、朝夜そろった日を塗る、代替テキストに数", () => {
  const st = monthStamps_(["2026-10-01", "2026-10-02"], "2026-10", "");
  const f = stampCardFlex_(st);
  assert.strictEqual(f.altText, "今月のセッション 2/22");
  const rows = f.contents.body.contents.filter((c) => c.type === "box" && c.contents.length === 5 && c.contents[0].type === "box");
  assert.strictEqual(rows.length, 5); // 10月は5週にまたがる
  const json = JSON.stringify(f); assert.strictEqual((json.match(/"backgroundColor":"#F3F5F8"/g) || []).length, 2);
});
t("Shared.gs はボットと親の画面で同じ中身（片方だけ直すと数え方が食い違う）", () => {
  assert.strictEqual(fs.readFileSync(__dirname + "/../gas/Shared.gs", "utf8"), fs.readFileSync(__dirname + "/../gas-parent/Shared.gs", "utf8"));
});
t("夜の追加の質問は「問い：答え」で1列に入る。答えが空の質問は入れない", () => {
  const r = buildRow_(null, user, "2026-10-09", "night", { extra: [{ q: "今週の一番の宝物は？", a: "試合" }, { q: "来週は？", a: " " }] }, new Date());
  assert.strictEqual(r.extra, "今週の一番の宝物は？：試合"); assert.strictEqual(r.child_id, "c1"); assert.strictEqual(r.name, "たかまさ");
  assert.strictEqual(COLUMNS.length, HEADER_JA.length);
});
t("設問の初期値は web/questions.json と同じ（入力ページの見本と管理画面の初期値を食い違わせない）", () => {
  same(DEFAULT_QUESTIONS, JSON.parse(fs.readFileSync(__dirname + "/../web/questions.json", "utf8")));
});
t("設問をそろえる：知らない項目は捨て、空の選択肢は初期値、QUEST とその日のアンテナは空にできる", () => {
  const q = normalizeQuestions_({
    evil: "<script>", antenna: { options: ["  音 ", "音", "", "自由"], multi: true },
    win: { options: [] }, days: { mon: { quests: [], antenna: ["なんか好き", "なんか嫌"], name: "x".repeat(99) } },
  });
  assert.strictEqual(q.evil, undefined);
  same(q.antenna.options, ["音", "自由"]); assert.strictEqual(q.antenna.multi, true);
  same(q.win.options, DEFAULT_QUESTIONS.win.options);
  same(q.days.mon.quests, []); same(q.days.mon.antenna, ["なんか好き", "なんか嫌"]); assert.strictEqual(q.days.mon.name.length, 40);
  same(q.days.tue, DEFAULT_QUESTIONS.days.tue);
  same(normalizeQuestions_(null), Object.assign({}, DEFAULT_QUESTIONS, { _note: undefined }));
});
t("settings シートが壊れていても初期値で動く", () => {
  const s = parseSettings_([["questions", "{壊れた"], ["stamp_goal", "20"], ["gift_label", " 2,000円分 "]]);
  assert.strictEqual(s.customized, false); assert.strictEqual(s.stampGoal, 20); assert.strictEqual(s.giftLabel, "2,000円分");
  same(s.questions.days.fri.quests, DEFAULT_QUESTIONS.days.fri.quests);
  assert.strictEqual(parseSettings_([]).stampGoal, 0);
});
const kids = childrenFromRows_([["c1", "たかまさ", true, "LA"], ["c2", "ゆうま", "TRUE", "LA"], ["c3", "止めた子", false, "LA"], ["c4", "別の携帯", true, "LB"], ["", "", "", ""]]);
t("1つの LINE を兄弟で共有できる。止めた子は出ない", () => {
  same(childrenForLine_(kids, "LA").map((c) => c.name), ["たかまさ", "ゆうま"]);
  same(childrenForLine_(kids, "LB").map((c) => c.id), ["c4"]);
  same(childrenForLine_(kids, ""), []);
});
t("「完了」メッセージの1行目の名前で子を決める。1人の LINE なら名前が無くても決まる", () => {
  const la = childrenForLine_(kids, "LA"), lb = childrenForLine_(kids, "LB");
  assert.strictEqual(resolveChild_(la, "【夜のチェック完了】ゆうま\n結果：GET!").id, "c2");
  assert.strictEqual(resolveChild_(la, "【夜のチェック完了】\n結果：GET!"), null);
  assert.strictEqual(resolveChild_(lb, "【朝のチェック完了】\n体3").id, "c4");
});
t("通知の時刻：空は初期値、off は通知しない、シートが時刻型にしたものも読める", () => {
  assert.strictEqual(normTime_("", "07:00"), "07:00"); assert.strictEqual(normTime_("off", "07:00"), "off");
  assert.strictEqual(normTime_("6:45", "07:00"), "06:45"); assert.strictEqual(normTime_("25:00", "07:00"), "07:00");
  assert.strictEqual(normTime_(new Date(1899, 11, 30, 21, 30), "21:00"), "21:30");
  const k = childrenFromRows_([["c1", "a", true, "L", "", "", "off"]])[0];
  assert.strictEqual(k.morningAt, "07:00"); assert.strictEqual(k.nightAt, "off");
});
t("通知は子どもごとの時刻で。過ぎて3時間以内・未記入・未送信のものだけ。同じ LINE・同じ時間帯は1通", () => {
  const ks = childrenFromRows_([
    ["c1", "たかまさ", true, "LA", "", "06:45", "21:30"], ["c2", "ゆうま", true, "LA", "", "06:45", "off"],
    ["c3", "別の携帯", true, "LB", "", "07:30", "21:00"], ["c4", "止めた子", false, "LA", "", "06:00", "21:00"],
  ]);
  same(dueReminders_(ks, [], "06:44", {}), []);
  same(dueReminders_(ks, [], "07:00", {}), [{ lineUserId: "LA", slot: "morning", names: ["たかまさ", "ゆうま"], childIds: ["c1", "c2"] }]);
  same(dueReminders_(ks, [{ child_id: "c1", morning_at: "x" }], "07:45", {}).map((t) => t.names.join()), ["ゆうま", "別の携帯"]);
  same(dueReminders_(ks, [], "07:45", { "c1:morning": true, "c2:morning": true }).map((t) => t.lineUserId), ["LB"]);
  same(dueReminders_(ks, [], "10:00", {}).map((t) => t.lineUserId), ["LB"]); // たかまさ・ゆうまは 6:45 から3時間を過ぎた
  same(dueReminders_(ks, [], "21:30", {}).map((t) => t.names.join()), ["たかまさ", "別の携帯"]); // ゆうまの夜は off
});
t("子IDは名前と関係なく c1, c2, … で増える", () => {
  assert.strictEqual(newChildId_(kids), "c5"); assert.strictEqual(newChildId_([]), "c1");
});
t("スタンプカードに名前が載る（兄弟で共有の LINE で見分けるため）", () => {
  const f = stampCardFlex_(monthStamps_([], "2026-10", ""), "ゆうま");
  assert.strictEqual(f.altText, "ゆうま 今月のセッション 0/22");
});
t("見本の画面の設問（preview/questions.sample.js）も同じ中身", () => {
  const c = {}; vm.createContext(c); c.window = c;
  vm.runInContext(fs.readFileSync(__dirname + "/../preview/questions.sample.js", "utf8"), c);
  const q = JSON.parse(fs.readFileSync(__dirname + "/../web/questions.json", "utf8")); delete q._note;
  same(c.SAMPLE_QUESTIONS, q);
});
console.log(`\n${ok} 件すべて通過`);
