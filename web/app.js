// WEEKDAY SIGNAL 入力ページ（LINE の中で開く LIFF アプリ）
//
//   ?slot=morning | night   朝のチェックか夜のチェックか（無ければ時刻で決める）
//   ?mock=1                 LINE も Apps Script も使わない見本モード（見た目の確認用）
//
// 設問は questions.json から作る。紙のシートを直したら questions.json を直す（このファイルは触らない）
(function () {
  "use strict";
  const params = new URLSearchParams(location.search);
  const MOCK = params.get("mock") === "1";
  const cfg = window.WS_CONFIG || {};
  const app = document.getElementById("app");
  const DAYS = ["mon", "tue", "wed", "thu", "fri"];
  const DAY_JA = { mon: "月", tue: "火", wed: "水", thu: "木", fri: "金" };

  // ---------------------------------------------------------------- 日付（日本時間）
  const jst = (d) => new Date(d.getTime() + 9 * 3600e3);
  const ymd = (d) => jst(d).toISOString().slice(0, 10);
  const wdKey = (d) => ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][jst(d).getUTCDay()];
  /** その曜日の「今日か、それ以前でいちばん近い日」。土日に金曜分を書けるように */
  function dateForDay(day, now) {
    for (let i = 0; i < 7; i++) {
      const d = new Date(now.getTime() - i * 86400e3);
      if (wdKey(d) === day) return ymd(d);
    }
    return ymd(now);
  }

  // ---------------------------------------------------------------- LINE と送信先（見本モードでは差し替え）
  const line = MOCK
    ? { init: async () => {}, isLoggedIn: () => true, login() {}, getIDToken: () => "mock", isInClient: () => false,
        sendMessages: async () => {}, closeWindow() {} }
    : window.liff;

  async function api(body) {
    if (MOCK) {
      const key = "ws-mock-" + body.date;
      const row = JSON.parse(localStorage.getItem(key) || "null");
      if (body.type === "get") return { ok: true, row };
      const next = Object.assign({}, row, body.data, body.slot === "morning" ? { morning_at: "mock" } : { night_at: "mock" });
      localStorage.setItem(key, JSON.stringify(next));
      return { ok: true, streak: 3, row: next, stamps: { count: 12, goal: 22 } };
    }
    // text/plain にするのは、Apps Script が事前確認（CORS のプリフライト）に答えられないため
    const res = await fetch(cfg.GAS_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) });
    return res.json();
  }

  // ---------------------------------------------------------------- 部品
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let uid = 0;
  const choice = (name, value, label, multi, checked) => {
    const id = "c" + uid++;
    return `<div class="chip"><input type="${multi ? "checkbox" : "radio"}" id="${id}" name="${name}" value="${esc(value)}"${checked ? " checked" : ""}><label for="${id}">${esc(label)}</label></div>`;
  };
  const section = (n, title, inner, hint) =>
    `<section><h2><span class="n">${n}</span>${esc(title)}</h2>${hint ? `<p class="hint">${esc(hint)}</p>` : ""}${inner}</section>`;

  // ---------------------------------------------------------------- 画面
  let Q, state;

  function header(slot, day) {
    const d = Q.days[day];
    const pick = DAYS.map((k) => `<button type="button" data-day="${k}" aria-pressed="${k === day}">${DAY_JA[k]}</button>`).join("");
    return `<header class="day">
      <div class="slot">${slot === "morning" ? "☀ 朝 ANTENNA ON（2〜3分）" : "🌙 夜 TREASURE GET（2〜3分）"}</div>
      <h1>${DAY_JA[day]}曜日　${esc(d.name)}</h1>
      <p class="q">${esc(d.theme)}｜「${esc(d.question)}」</p>
      <div class="daypick" role="group" aria-label="何曜日の分を書くか">${pick}</div>
    </header>`;
  }

  function morningForm(day) {
    const scale = Q.scales.condition.items.map((item, i) => {
      const key = ["body", "mood", "energy"][i];
      const nums = [1, 2, 3, 4, 5].map((n) => {
        const id = "c" + uid++;
        return `<div class="num"><input type="radio" id="${id}" name="${key}" value="${n}"><label for="${id}">${n}</label></div>`;
      }).join("");
      return `<div class="scale"><span>${esc(item)}</span>${nums}</div>`;
    }).join("");
    const antenna = `<div class="chips">${Q.antenna.options.map((o) => choice("antenna", o, o, Q.antenna.multi)).join("")}</div>`;
    const quests = `<div class="list">${Q.days[day].quests.map((q) => choice("quest", q, q, false)).join("")}
      ${choice("quest", "__own", "自分で決める", false)}
      <input type="text" name="quest_own" placeholder="自分で決めたQUEST" aria-label="自分で決めたQUEST"></div>`;
    return section(1, "今の俺をチェック", scale, "数字は今の状態。良い・悪いはありません")
      + section(2, "今日のアンテナを選ぶ", antenna, Q.antenna.multi ? "いくつ選んでもOK" : "1つ選ぼう")
      + section(3, "今日の SENSITIVITY QUEST", quests, "今日はこれを探す！")
      + section(4, "今日の意気込み（ひとこと）", `<textarea name="motto" placeholder="なくてもOK"></textarea>`);
  }

  function nightForm(day, morning) {
    const feelings = (Q.feelings.by_day && Q.feelings.by_day[day]) || Q.feelings.options;
    const quest = morning && morning.quest ? `<div class="morning-quest">朝のQUEST：${esc(morning.quest)}</div>` : "";
    let html = section(4, "QUESTの結果", quest + `<div class="chips">${Q.quest_result.options.map((o) => choice("quest_result", o, o, false)).join("")}</div>`)
      + section(5, "今日あったものに✓", `<div class="chips">${feelings.map((o) => choice("feelings", o, o, true)).join("")}</div>`, "いくつでもOK")
      + section(6, "今日の宝物（体験）", `<textarea name="treasure" placeholder="今日、一番残っている体験は？"></textarea>`)
      + section(7, "今日の発見（俺のKEY）", `<div class="keyline">俺って、<input type="text" name="key" aria-label="俺って、〇〇かも">かも。</div>`)
      + section(8, "今日、自分に勝った？", `<div class="chips">${Q.win.options.map((o) => choice("win", o, o, false)).join("")}</div>`);
    if (day === "fri") {
      html += section(9, "今週のふりかえり",
        `<p class="hint">今週の一番の宝物は？</p><textarea name="week_best"></textarea>
         <p class="hint" style="margin-top:10px">来週、もう少し知ってみたい自分は？</p><textarea name="next_self"></textarea>
         <p class="hint" style="margin-top:10px">今週のふりかえり（1分）</p><textarea name="week_reflection"></textarea>`);
    }
    return html;
  }

  async function render() {
    const { slot, day } = state;
    document.body.dataset.day = day;
    state.date = dateForDay(day, new Date());
    let morning = null;
    if (slot === "night") {
      try { const r = await api({ type: "get", idToken: state.idToken, date: state.date }); morning = r.row; } catch (_) {}
    }
    app.innerHTML = `<form id="f">${header(slot, day)}${slot === "morning" ? morningForm(day) : nightForm(day, morning)}
      <p class="rules">正解はありません。全部書かなくてもOK。見つからなくても、それも発見。</p>
      <div class="bar"><button type="submit">${slot === "morning" ? "アンテナON！" : "宝物を記録する"}</button></div></form>`;
    app.querySelectorAll(".daypick button").forEach((b) => b.addEventListener("click", () => { state.day = b.dataset.day; render(); }));
    app.querySelector("#f").addEventListener("submit", submit);
  }

  function collect(form) {
    const fd = new FormData(form);
    const all = (k) => fd.getAll(k).map(String);
    const one = (k) => String(fd.get(k) || "").trim();
    if (state.slot === "morning") {
      const q = one("quest");
      return { body: one("body"), mood: one("mood"), energy: one("energy"), antenna: all("antenna"),
               quest: q === "__own" ? one("quest_own") : q, motto: one("motto") };
    }
    return { quest_result: one("quest_result"), feelings: all("feelings"), treasure: one("treasure"), key: one("key"),
             win: one("win"), week_best: one("week_best"), next_self: one("next_self"), week_reflection: one("week_reflection") };
  }

  /** トークに残る「完了」メッセージ。ボットはこれを受けて返事をする（返信は無料枠を使わない） */
  function summary(slot, d) {
    const lines = [];
    if (slot === "morning") {
      lines.push("【朝のチェック完了】");
      if (d.body || d.mood || d.energy) lines.push(`体${d.body || "-"} 気分${d.mood || "-"} 元気${d.energy || "-"}`);
      if (d.antenna.length) lines.push("アンテナ：" + d.antenna.join("・"));
      if (d.quest) lines.push("QUEST：" + d.quest);
      if (d.motto) lines.push("意気込み：" + d.motto);
    } else {
      lines.push("【夜のチェック完了】");
      if (d.quest_result) lines.push("結果：" + d.quest_result);
      if (d.feelings.length) lines.push("今日あったもの：" + d.feelings.join("・"));
      if (d.treasure) lines.push("宝物：" + d.treasure);
      if (d.key) lines.push(`俺って、${d.key}かも。`);
      if (d.win) lines.push("自分に勝った？：" + d.win);
    }
    return lines.join("\n").slice(0, 1000);
  }

  async function submit(ev) {
    ev.preventDefault();
    const btn = ev.target.querySelector("button[type=submit]");
    btn.disabled = true; btn.textContent = "送信中…";
    const data = collect(ev.target);
    try {
      const r = await api({ type: "submit", idToken: state.idToken, date: state.date, slot: state.slot, data });
      if (!r.ok) throw new Error(r.error || "保存できませんでした");
      if (line.isInClient()) { try { await line.sendMessages([{ type: "text", text: summary(state.slot, data) }]); } catch (_) {} }
      app.innerHTML = `<div class="done"><h1>${state.slot === "morning" ? "☀ アンテナON！" : "🌙 宝物GET！"}</h1>
        <p>${state.slot === "morning" ? "いってらっしゃい。" : "おつかれさま。"}${r.streak >= 2 ? `<br>連続 ${r.streak} 日目！` : ""}</p>${r.stamps ? `<p class="stamps">今月のスタンプ <b>${r.stamps.count}</b> / ${r.stamps.goal}${r.stamps.count >= r.stamps.goal ? "　🎁 達成！" : `　あと ${r.stamps.goal - r.stamps.count} 個で 🎁`}<br><small>朝と夜の両方を書いた日に1つ</small></p>` : ""}</div>`;
      if (line.isInClient()) setTimeout(() => line.closeWindow(), 1500);
    } catch (e) {
      btn.disabled = false; btn.textContent = "もう一度送る";
      alert(e.message || "送信できませんでした。電波の良いところでもう一度押してください。");
    }
  }

  // ---------------------------------------------------------------- 起動
  (async function main() {
    try {
      if (!MOCK) {
        await line.init({ liffId: cfg.LIFF_ID });
        if (!line.isLoggedIn()) { line.login({ redirectUri: location.href }); return; }
      }
      Q = await (await fetch("questions.json", { cache: "no-store" })).json();
      const now = new Date();
      const today = wdKey(now);
      const hour = jst(now).getUTCHours();
      state = {
        slot: params.get("slot") === "night" || (params.get("slot") !== "morning" && hour >= 15) ? "night" : "morning",
        day: DAYS.includes(params.get("day")) ? params.get("day") : DAYS.includes(today) ? today : "fri",
        idToken: line.getIDToken(),
      };
      await render();
    } catch (e) {
      app.innerHTML = `<p class="error">開けませんでした：${esc(e.message || e)}<br>LINE のトーク画面から開き直してください。</p>`;
    }
  })();
})();
