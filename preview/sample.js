// 親の画面の見本データ（Google につながずに見た目を確かめる用）。google.script.run の代わりに呼ばれる
(function () {
  const KIDS = [
    { id: "c1", name: "たかまさ", active: true, lineUserId: "LA" },
    { id: "c2", name: "ゆうま", active: true, lineUserId: "LA" },
  ];
  const LINES = [
    { id: "LA", name: "たかまさ📱", active: true, since: "2026-10-03 19:20" },
    { id: "LP", name: "お父さん", active: false, since: "2026-10-03 18:55" },
  ];
  let Q = null, custom = false, goal = 0, label = "";
  const questions = () => Q || (Q = JSON.parse(JSON.stringify(window.SAMPLE_QUESTIONS)));

  function dashboard(fn, ym, cid) {
    ym = ym || "2026-10";
    const today = "2026-10-07";
    cid = cid || "c1";
    const kid = KIDS.find((k) => k.id === cid) || KIDS[0];
    const skip = kid.id === "c2" ? 3 : 99; // 弟は書き忘れが多め
    const wd = (d) => ["日", "月", "火", "水", "木", "金", "土"][new Date(d + "T12:00:00+09:00").getUTCDay()];
    const days = [];
    for (let i = 1; i <= 31; i++) { const d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5) - 1, i, 3)); if (d.getUTCMonth() !== +ym.slice(5) - 1) break; if (d.getUTCDay() >= 1 && d.getUTCDay() <= 5) days.push(d.toISOString().slice(0, 10)); }
    const past = days.filter((d) => d <= today || ym < "2026-10");
    const keys = ["攻めるときのあの一歩が好きなんだ", "人の笑顔で元気が出る", "朝のほうが頭が回る", "", "音楽で切り替えられる"];
    const rows = past.map((d, i) => ({ date: d, weekday: wd(d), name: kid.name, child_id: kid.id,
      body: 2 + (i % 3), mood: 3 + (i % 2), energy: 2 + ((i + 1) % 4), antenna: ["ワクワク", "力", "音", "つながり"][i % 4], quest: "「なんか好き」を1個見つける", motto: i % 2 ? "少しでも自分から動いてみる！" : "",
      morning_at: d + " 07:1" + (i % 9), quest_result: ["GET!", "惜しい!", "GET!", "別のものを発見した!"][i % 4], feelings: ["ワクワク、嬉しい", "楽しい、疲れた", "イライラ、悔しい", "安心"][i % 4],
      treasure: ["稽古で一瞬だけ相手が下がった", "友だちが笑ってくれた", "", "帰り道の夕焼け"][i % 4], key: keys[i % 5], win: ["YES!", "ちょっと", "YES!", "よく分からない"][i % 4],
      extra: wd(d) === "金" ? "今週の一番の宝物は？：試合で最後まで攻めた" : "",
      night_at: ((ym === "2026-10" && i === 2) || i % skip === 1) ? "" : d + " 21:3" + (i % 9) })).reverse();
    const stamped = rows.filter((r) => r.morning_at && r.night_at).map((r) => r.date);
    const g = goal ? Math.min(goal, days.length) : days.length;
    const achieved = stamped.length >= g;
    const giftStatus = achieved ? (fn === "markGiftSent" ? "贈呈済み" : "未贈呈") : "";
    const children = KIDS.filter((k) => k.active).map((k) => {
      if (k.id === kid.id) return { id: k.id, name: k.name, count: stamped.length, goal: g, giftStatus };
      if (dashboard.inner) return null;
      dashboard.inner = true;
      const o = dashboard("x", ym, k.id); dashboard.inner = false;
      return o.children.find((c) => c.id === k.id);
    }).filter(Boolean);
    return { viewer: "parent@example.com", sheetUrl: "#", ym, today, children, childId: kid.id,
      stamps: { days, stamped, count: stamped.length, goal: g, achieved },
      gift: achieved ? { status: giftStatus, achievedAt: "", sentAt: "2026-10-01 20:10" } : null,
      giftLabel: label || "1,000円分", streak: 2, rows };
  }

  function admin() {
    return { viewer: "parent@example.com", sheetUrl: "#", children: KIDS, lines: LINES, questions: questions(), customized: custom,
      defaults: window.SAMPLE_QUESTIONS, stampGoal: goal, giftLabel: label, defaultGiftLabel: "1,000円分" };
  }

  window.SAMPLE = function (fn, ...args) {
    if (fn === "getDashboard" || fn === "markGiftSent") return dashboard(fn, ...args);
    if (fn === "getAdmin") return admin();
    if (fn === "saveChildren") {
      args[0].forEach((x, i) => { if (!x.name) return; const k = KIDS.find((c) => c.id === x.id); if (k) Object.assign(k, x); else KIDS.push(Object.assign({}, x, { id: "c" + (KIDS.length + 1) })); });
      return admin();
    }
    if (fn === "setLineActive") { const l = LINES.find((x) => x.id === args[0]); if (l) l.active = args[1]; return admin(); }
    if (fn === "saveQuestions") { Q = args[0]; custom = true; return admin(); }
    if (fn === "resetQuestions") { Q = null; custom = false; return admin(); }
    if (fn === "saveReward") { goal = Number(args[0]) || 0; label = args[1]; return admin(); }
    return null;
  };
})();
