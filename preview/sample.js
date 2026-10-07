// 親の画面の見本データ（Google につながずに見た目を確かめる用）
window.SAMPLE = function (fn, ym) {
  ym = ym || "2026-10";
  const today = "2026-10-07";
  const wd = (d) => ["日", "月", "火", "水", "木", "金", "土"][new Date(d + "T12:00:00+09:00").getUTCDay()];
  const days = [];
  for (let i = 1; i <= 31; i++) { const d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5) - 1, i, 3)); if (d.getUTCMonth() !== +ym.slice(5) - 1) break; if (d.getUTCDay() >= 1 && d.getUTCDay() <= 5) days.push(d.toISOString().slice(0, 10)); }
  const past = days.filter((d) => d <= today || ym < "2026-10");
  const keys = ["攻めるときのあの一歩が好きなんだ", "人の笑顔で元気が出る", "朝のほうが頭が回る", "", "音楽で切り替えられる"];
  const rows = past.map((d, i) => ({ date: d, weekday: wd(d), name: "たかまさ", user_id: "U1",
    body: 2 + (i % 3), mood: 3 + (i % 2), energy: 2 + ((i + 1) % 4), antenna: ["ワクワク", "力、成長", "音", "つながり"][i % 4], quest: "「なんか好き」を1個見つける", motto: i % 2 ? "少しでも自分から動いてみる！" : "",
    morning_at: d + " 07:1" + (i % 9), quest_result: ["GET!", "惜しい!", "GET!", "別のものを発見した!"][i % 4], feelings: ["ワクワク、嬉しい", "楽しい、疲れた", "イライラ、悔しい", "安心"][i % 4],
    treasure: ["稽古で一瞬だけ相手が下がった", "友だちが笑ってくれた", "", "帰り道の夕焼け"][i % 4], key: keys[i % 5], win: ["YES!", "ちょっと", "YES!", "よく分からない"][i % 4],
    night_at: (ym === "2026-10" && i === 2) ? "" : d + " 21:3" + (i % 9) })).reverse();
  const stamped = rows.filter((r) => r.morning_at && r.night_at).map((r) => r.date);
  const achieved = stamped.length >= days.length;
  return { viewer: "parent@example.com", sheetUrl: "#", ym, today, users: [{ userId: "U1", name: "たかまさ" }], userId: "U1",
    stamps: { days, stamped, count: stamped.length, goal: days.length, achieved },
    gift: achieved ? { status: fn === "markGiftSent" ? "贈呈済み" : "未贈呈", achievedAt: "", sentAt: "2026-10-01 20:10" } : null,
    giftLabel: "1,000円分", streak: 2, rows };
};
