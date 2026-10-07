// Aestus 入力ページ（LINE の中で開く LIFF アプリ）
//
//   ?slot=morning | night   朝のチェックか夜のチェックか（無ければ時刻で決める）
//   ?mock=1                 LINE も Apps Script も使わない見本モード（見た目の確認用）
//   ?kids=0|1|2             見本モードで「この LINE から書ける子」の人数（既定 2）
//
// 設問は Apps Script から受け取る（親が管理画面で変えたもの）。見本モードだけ questions.json を使う
(function () {
  "use strict";
  const params = new URLSearchParams(location.search);
  const MOCK = params.get("mock") === "1";
  const cfg = window.WS_CONFIG || {};
  const app = document.getElementById("app");
  const DAYS = ["mon", "tue", "wed", "thu", "fri"];
  const DAY_JA = { mon: "月", tue: "火", wed: "水", thu: "木", fri: "金" };
  const DAY_EN = { mon: "MON", tue: "TUE", wed: "WED", thu: "THU", fri: "FRI" };

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
  const mdLabel = (s) => `${Number(s.slice(5, 7))}/${Number(s.slice(8))}`;

  // ---------------------------------------------------------------- 端末に覚えておく（最後に選んだ子。消えても困らない）
  const remember = {
    get: (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} },
  };

  // ---------------------------------------------------------------- LINE と送信先（見本モードでは差し替え）
  const line = MOCK
    ? { init: async () => {}, isLoggedIn: () => true, login() {}, getIDToken: () => "mock", isInClient: () => false,
        sendMessages: async () => {}, closeWindow() {} }
    : window.liff;

  async function api(body) {
    if (MOCK) return mockApi(body);
    // text/plain にするのは、Apps Script が事前確認（CORS のプリフライト）に答えられないため
    const res = await fetch(cfg.GAS_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) });
    // Apps Script が JSON 以外（ログイン画面やエラーの画面）を返すと、res.json() は
    // 「The string did not match the expected pattern.」のような原因の分からない文言で落ちる。
    // 中身を見て、どこを直せばよいかを出す
    const text = await res.text();
    try { return JSON.parse(text); } catch (_) { throw new Error(explainGas(res.status, text)); }
  }
  function explainGas(status, text) {
    if (/accounts\.google\.com|ServiceLogin|signin/i.test(text))
      return "Apps Script が Google のログインを求めています。ボットのデプロイで「アクセスできるユーザー：全員」になっているか、config.js の GAS_URL が /exec で終わっているかを確かめてください";
    if (/doPost|関数が見つかりません|function not found/i.test(text))
      return "Apps Script に doPost が見つかりません。Code.gs を貼って保存し、「デプロイを管理」から新バージョンでデプロイし直してください";
    if (/is not defined|ReferenceError/i.test(text))
      return "Apps Script の中で足りないものがあります（" + (text.match(/[\w$]+ is not defined/) || ["Shared.gs を貼ったか"])[0] + "）。Shared.gs を足して保存し、新バージョンでデプロイし直してください";
    if (status === 404) return "Apps Script の URL が見つかりません。config.js の GAS_URL を確かめてください";
    return "Apps Script から想定外の返事がありました（" + status + "）。Apps Script の「実行数」でエラーを見てください";
  }
  async function mockApi(body) {
    if (body.type === "config") {
      const questions = await (await fetch("questions.json", { cache: "no-store" })).json();
      const all = [{ id: "c1", name: "たかまさ" }, { id: "c2", name: "ゆうま" }];
      const n = params.has("kids") ? Number(params.get("kids")) : 2;
      return { ok: true, questions, children: all.slice(0, n), lineName: "見本" };
    }
    const key = "aestus-mock-" + body.childId + "-" + body.date;
    let row = null;
    try { row = JSON.parse(localStorage.getItem(key) || "null"); } catch (_) {}
    if (body.type === "get") return { ok: true, row };
    const next = Object.assign({}, row, body.data, body.slot === "morning" ? { morning_at: "mock" } : { night_at: "mock" });
    try { localStorage.setItem(key, JSON.stringify(next)); } catch (_) {}
    return { ok: true, streak: 3, row: next, stamps: { count: 12, goal: 22 } };
  }

  // ---------------------------------------------------------------- 部品
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let uid = 0;
  const choice = (name, value, label, multi) => {
    const id = "c" + uid++;
    return `<div class="chip"><input type="${multi ? "checkbox" : "radio"}" id="${id}" name="${name}" value="${esc(value)}"><label for="${id}">${esc(label)}</label></div>`;
  };
  const section = (n, title, inner, note) =>
    `<section><h2><span class="n">${n}</span>${esc(title)}</h2>${note ? `<p class="hint">${esc(note)}</p>` : ""}${inner}</section>`;
  const blank = (name, before, after, label) =>
    `<div class="blankline">${before ? `<span>${esc(before)}</span>` : ""}<input type="text" name="${name}" aria-label="${esc(label)}">${after ? `<span>${esc(after)}</span>` : ""}</div>`;

  // 山並み（紙のシートの上の帯）。色は曜日の色に合わせる
  const MOUNTAINS = `<svg class="mtn" viewBox="0 0 400 90" preserveAspectRatio="none" aria-hidden="true">
    <path d="M0 90 L0 62 L46 34 L78 52 L122 18 L160 46 L196 30 L238 58 L282 22 L322 50 L360 36 L400 54 L400 90 Z" fill="rgba(255,255,255,.16)"/>
    <path d="M0 90 L0 74 L60 52 L104 70 L150 48 L206 72 L256 50 L300 70 L352 56 L400 72 L400 90 Z" fill="rgba(10,18,40,.35)"/></svg>`;

  // ---------------------------------------------------------------- 画面
  let Q, kids, state;

  function hero() {
    const d = Q.days[state.day];
    const dayPick = DAYS.map((k) => `<button type="button" data-day="${k}" aria-pressed="${k === state.day}">${DAY_JA[k]}</button>`).join("");
    const kidPick = kids.length > 1
      ? `<div class="who" role="group" aria-label="書く人">${kids.map((c) => `<button type="button" data-child="${esc(c.id)}" aria-pressed="${c.id === state.child.id}">${esc(c.name)}</button>`).join("")}</div>`
      : "";
    return `<header class="hero">
      <div class="brand"><b>Aestus</b><span>WEEKDAY SIGNAL</span></div>
      <div class="dayline"><span class="en">${DAY_EN[state.day]}</span><span class="ja">${DAY_JA[state.day]}曜日</span><span class="date">${mdLabel(state.date)}</span></div>
      <h1>${esc(d.name)}</h1>
      <p class="theme">${esc(d.theme)}</p>
      ${d.question ? `<p class="q">「${esc(d.question)}」</p>` : ""}
      ${MOUNTAINS}
    </header>
    <div class="pickers">${kidPick}<div class="daypick" role="group" aria-label="何曜日の分を書くか">${dayPick}</div></div>`;
  }

  function band(slot) {
    return slot === "morning"
      ? `<div class="band morning"><span class="icon" aria-hidden="true">☀</span><b>朝</b><span class="en">ANTENNA ON</span><small>（2〜3分）</small></div>`
      : `<div class="band night"><span class="icon" aria-hidden="true">🌙</span><b>夜</b><span class="en">TREASURE GET</span><small>（2〜3分）</small></div>`;
  }

  function morningForm() {
    const day = Q.days[state.day];
    const scale = Q.condition.items.map((it) => {
      const nums = [1, 2, 3, 4, 5].map((n) => {
        const id = "c" + uid++;
        return `<div class="num"><input type="radio" id="${id}" name="${it.key}" value="${n}"><label for="${id}">${n}</label></div>`;
      }).join("");
      return `<div class="scale"><span>${esc(it.label)}${it.sub ? `<small>（${esc(it.sub)}）</small>` : ""}</span>${nums}</div>`;
    }).join("");
    const antOpts = day.antenna && day.antenna.length ? day.antenna : Q.antenna.options;
    const antenna = `<div class="chips">${antOpts.map((o) => choice("antenna", o, o, Q.antenna.multi)).join("")}</div>`
      + (Q.antenna.own ? `<div class="own"><span>自分で決める：</span><input type="text" name="antenna_own" aria-label="自分で決めるアンテナ"></div>` : "");
    const quest = day.quests.length
      ? `<div class="list">${day.quests.map((q) => choice("quest", q, q, false)).join("")}
          ${Q.quest.own ? `${choice("quest", "__own", "自分で決める", false)}<input type="text" name="quest_own" placeholder="自分で決めたQUEST" aria-label="自分で決めたQUEST">` : ""}</div>`
      : blank("quest_text", Q.quest.before, Q.quest.after, "今日のQUEST");
    let html = band("morning")
      + section(1, Q.condition.label, scale, Q.condition.note)
      + section(2, Q.antenna.label, antenna, Q.antenna.note)
      + section(3, Q.quest.label, quest, Q.quest.note);
    // 紙のシートでも意気込みは番号なしの枠
    if (Q.motto.enabled) html += `<section class="motto"><h2 class="plain">${esc(Q.motto.label)}</h2><textarea name="motto" placeholder="なくてもOK"></textarea></section>`;
    return html;
  }

  function nightForm(morning) {
    const day = Q.days[state.day];
    const mq = morning && morning.quest ? `<div class="morning-quest">朝のQUEST：${esc(morning.quest)}</div>` : "";
    let n = 4;
    let html = band("night")
      + section(n++, Q.quest_result.label, mq + `<div class="chips">${Q.quest_result.options.map((o) => choice("quest_result", o, o, false)).join("")}</div>`)
      + section(n++, Q.feelings.label, `<div class="chips">${Q.feelings.options.map((o) => choice("feelings", o, o, true)).join("")}</div>`, Q.feelings.note)
      + section(n++, Q.treasure.label, `<textarea name="treasure" placeholder="${esc(Q.treasure.note)}"></textarea>`)
      + section(n++, Q.key.label, blank("key", Q.key.before, Q.key.after, Q.key.label), Q.key.note)
      + section(n++, Q.win.label, `<div class="chips">${Q.win.options.map((o) => choice("win", o, o, false)).join("")}</div>`);
    (day.extra_night || []).forEach((q, i) => { html += section(n++, q, `<textarea name="extra_${i}" data-q="${esc(q)}"></textarea>`); });
    return html;
  }

  async function render() {
    const { slot, day } = state;
    document.body.dataset.day = day;
    document.body.dataset.slot = slot;
    state.date = dateForDay(day, new Date());
    let morning = null;
    if (slot === "night") {
      try { const r = await api({ type: "get", idToken: state.idToken, childId: state.child.id, date: state.date }); morning = r.row; } catch (_) {}
    }
    app.innerHTML = `${hero()}<form id="f">${slot === "morning" ? morningForm() : nightForm(morning)}
      <p class="rules">${Q.rules.map(esc).join("。") + (Q.rules.length ? "。" : "")}</p>
      <div class="bar"><button type="submit">${kids.length > 1 ? esc(state.child.name) + "の" : ""}${slot === "morning" ? "アンテナON！" : "宝物を記録する"}</button></div></form>`;
    app.querySelectorAll(".daypick button").forEach((b) => b.addEventListener("click", () => { state.day = b.dataset.day; render(); }));
    app.querySelectorAll(".who button").forEach((b) => b.addEventListener("click", () => {
      state.child = kids.find((c) => c.id === b.dataset.child) || state.child;
      remember.set("aestus-child", state.child.id);
      render();
    }));
    app.querySelector("#f").addEventListener("submit", submit);
  }

  function collect(form) {
    const fd = new FormData(form);
    const all = (k) => fd.getAll(k).map(String);
    const one = (k) => String(fd.get(k) || "").trim();
    if (state.slot === "morning") {
      const q = one("quest");
      const antenna = all("antenna");
      if (one("antenna_own")) antenna.push(one("antenna_own"));
      return { body: one("body"), mood: one("mood"), energy: one("energy"), antenna,
               quest: fd.has("quest_text") ? one("quest_text") : q === "__own" ? one("quest_own") : q, motto: one("motto") };
    }
    const extra = [...form.querySelectorAll("textarea[data-q]")].map((t) => ({ q: t.dataset.q, a: t.value.trim() })).filter((x) => x.a);
    return { quest_result: one("quest_result"), feelings: all("feelings"), treasure: one("treasure"), key: one("key"), win: one("win"), extra };
  }

  /** トークに残る「完了」メッセージ。1行目に名前を入れ、ボットはそれでどの子の分かを決める（返信は無料枠を使わない） */
  function summary(slot, d) {
    const lines = [];
    const name = state.child.name;
    if (slot === "morning") {
      lines.push("【朝のチェック完了】" + name);
      if (d.body || d.mood || d.energy) lines.push(Q.condition.items.map((it) => it.label + (d[it.key] || "-")).join(" "));
      if (d.antenna.length) lines.push("アンテナ：" + d.antenna.join("・"));
      if (d.quest) lines.push("QUEST：" + d.quest);
      if (d.motto) lines.push("意気込み：" + d.motto);
    } else {
      lines.push("【夜のチェック完了】" + name);
      if (d.quest_result) lines.push("結果：" + d.quest_result);
      if (d.feelings.length) lines.push("今日あったもの：" + d.feelings.join("・"));
      if (d.treasure) lines.push("宝物：" + d.treasure);
      if (d.key) lines.push(`${Q.key.before}${d.key}${Q.key.after}`);
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
      const r = await api({ type: "submit", idToken: state.idToken, childId: state.child.id, date: state.date, slot: state.slot, data });
      if (!r.ok) throw new Error(r.error || "保存できませんでした");
      if (line.isInClient()) { try { await line.sendMessages([{ type: "text", text: summary(state.slot, data) }]); } catch (_) {} }
      const st = r.stamps;
      app.innerHTML = `<div class="done"><h1>${state.slot === "morning" ? "☀ アンテナON！" : "🌙 宝物GET！"}</h1>
        <p>${kids.length > 1 ? esc(state.child.name) + "、" : ""}${state.slot === "morning" ? "いってらっしゃい。" : "おつかれさま。"}${r.streak >= 2 ? `<br>連続 ${r.streak} 日目！` : ""}</p>
        ${st ? `<p class="stamps">今月のスタンプ <b>${st.count}</b> / ${st.goal}${st.count >= st.goal ? "　🎁 達成！" : `　あと ${st.goal - st.count} 個で 🎁`}<br><small>朝と夜の両方を書いた日に1つ</small></p>` : ""}
        ${kids.length > 1 ? `<p><button type="button" class="again">ほかの人の分を書く</button></p>` : ""}</div>`;
      const again = app.querySelector(".again");
      if (again) again.addEventListener("click", () => {
        state.child = kids[(kids.indexOf(state.child) + 1) % kids.length];
        remember.set("aestus-child", state.child.id);
        render();
      });
      else if (line.isInClient()) setTimeout(() => line.closeWindow(), 1500);
    } catch (e) {
      btn.disabled = false; btn.textContent = "もう一度送る";
      alert(e.message || "送信できませんでした。電波の良いところでもう一度押してください。");
    }
  }

  // ---------------------------------------------------------------- 起動
  (async function main() {
    try {
      if (!MOCK) {
        // config.js が読めていない（書き間違い・古いものが端末に残っている）と、ここで分かる形で止める
        if (!cfg.LIFF_ID || !cfg.GAS_URL) throw new Error("設定（config.js）が読めませんでした。少し待ってから開き直してください");
        await line.init({ liffId: cfg.LIFF_ID });
        if (!line.isLoggedIn()) { line.login({ redirectUri: location.href }); return; }
      }
      const idToken = line.getIDToken();
      const c = await api({ type: "config", idToken });
      if (!c.ok) throw new Error(c.error || "設定を読めませんでした");
      Q = c.questions; kids = c.children || [];
      if (!kids.length) {
        app.innerHTML = `<div class="done"><h1>もうすぐ使えるよ</h1><p>この LINE（${esc(c.lineName || "")}）は、まだ名前とつながっていません。<br>おうちの人に「親の画面でつなげて」と伝えてね。</p></div>`;
        return;
      }
      const now = new Date();
      const today = wdKey(now);
      const hour = jst(now).getUTCHours();
      const saved = remember.get("aestus-child");
      state = {
        slot: params.get("slot") === "night" || (params.get("slot") !== "morning" && hour >= 15) ? "night" : "morning",
        day: DAYS.includes(params.get("day")) ? params.get("day") : DAYS.includes(today) ? today : "fri",
        child: kids.find((k) => k.id === saved) || kids[0],
        idToken,
      };
      await render();
    } catch (e) {
      app.innerHTML = `<p class="error">開けませんでした：${esc(e.message || e)}<br>LINE のトーク画面から開き直してください。</p>`;
    }
  })();
})();
