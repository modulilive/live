// Presentazione dal vivo: risultati in tempo reale, controllo delle sezioni (modalità guidata)
(function () {
  const A = window.APP, R = window.RESULTS, esc = A.esc;
  const app = document.getElementById("app");
  const id = new URLSearchParams(location.search).get("id");

  let form = null, flat = [], pos = 0; // 0 = ingresso, 1..n domande, n+1 = fine
  let state = null, data = { rows: [], qa: [] }, counts = { started: 0, done: 0 };
  let showResults = true, showQr = false, follow = true, textMode = {}, busy = false, lastKey = "";

  // icone essenziali (tratto sottile)
  const I = {
    prev: '<path d="M15 5l-7 7 7 7"/>',
    next: '<path d="M9 5l7 7-7 7"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
    unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 017.5-2"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0112 5c6.4 0 10 7 10 7a17 17 0 01-3.2 4M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 005.4-1.6"/><path d="M9.9 9.9a3 3 0 004.2 4.2"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  };
  const icon = (n) => '<svg viewBox="0 0 24 24" aria-hidden="true">' + I[n] + "</svg>";

  async function boot() {
    const { data: s } = await A.SB.auth.getSession();
    if (!s.session) { app.innerHTML = '<div class="pr-msg">Accedi prima dalla <a href="admin.html">pagina di gestione</a>.</div>'; return; }
    if (!id) { app.innerHTML = '<div class="pr-msg">Apri la presentazione da <a href="admin.html">Gestione</a>.</div>'; return; }
    try { form = await A.rpc("a_get", { p_id: id }); } catch (e) { app.innerHTML = '<div class="pr-msg">' + esc(e.message) + "</div>"; return; }
    A.applyTheme(form.theme);
    document.title = form.title;
    flat = A.flatQuestions(form.content);
    state = form.state;
    const qParam = new URLSearchParams(location.search).get("q");
    if (qParam !== null && qParam !== "") pos = Number(qParam) || 0;
    else { try { pos = Number(sessionStorage.getItem("pr_pos_" + id)) || 0; } catch (_) {} }
    pos = Math.max(0, Math.min(pos, flat.length + 1));
    shell(); render(true);
    if (qParam !== null && guided() && follow) { const it = curItem(); await setState({ active_section: it ? it.s.id : null }); }
    loop();
  }

  const guided = () => (form.settings || {}).mode === "guided";
  const curItem = () => (pos >= 1 && pos <= flat.length ? flat[pos - 1] : null);
  const shortUrl = () => A.baseUrl().replace(/^https?:\/\//, "").replace(/\/$/, "");

  function shell() {
    app.innerHTML =
      '<div class="pr">' +
        '<header class="pr-top"><span class="pr-ev">' + esc(form.title) + '</span><span class="pr-status" id="status"></span><span class="pr-count" id="cnt"></span></header>' +
        '<main class="pr-stage" id="stage"></main>' +
        '<aside class="pr-qr hidden" id="qrbox"><div class="pr-qr-code">' + A.qrSvg(A.participantUrl(form.code)) + '</div><div class="pr-qr-url">' + esc(shortUrl()) + '</div><div class="pr-qr-pin">' + esc(form.code) + "</div></aside>" +
        '<nav class="dock" id="dock" aria-label="Controlli">' +
          '<button class="dk" id="prev" title="Indietro (←)">' + icon("prev") + "</button>" +
          '<span class="dk-pos" id="posLab"></span>' +
          '<button class="dk" id="next" title="Avanti (→)">' + icon("next") + "</button>" +
          '<span class="dk-sep"></span>' +
          '<button class="dk" id="openBtn"></button>' +
          '<button class="dk" id="resBtn"></button>' +
          '<button class="dk" id="moreBtn" title="Altro">' + icon("more") + "</button>" +
          '<div class="dk-menu hidden" id="menu"></div>' +
        "</nav>" +
      "</div>";
    const $ = (x) => document.getElementById(x);
    $("prev").onclick = () => go(-1);
    $("next").onclick = () => go(1);
    $("openBtn").onclick = () => setState({ open: !state.open });
    $("resBtn").onclick = () => { showResults = !showResults; render(true); };
    $("moreBtn").onclick = (e) => { e.stopPropagation(); toggleMenu(); };
    document.addEventListener("click", (e) => { if (!e.target.closest("#menu")) $("menu").classList.add("hidden"); });
    document.addEventListener("keydown", (e) => {
      if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); go(1); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") go(-1);
      else if (k === "a") $("openBtn").click();
      else if (k === "r") $("resBtn").click();
      else if (k === "q") { showQr = !showQr; render(true); }
      else if (k === "f") fullscreen();
      else if (e.key === "Escape") $("menu").classList.add("hidden");
      wake();
    });
    // la barra si nasconde quando non muovi il mouse
    document.addEventListener("mousemove", wake);
    wake();
  }

  let idle;
  function wake() {
    const d = document.getElementById("dock"); if (!d) return;
    d.classList.remove("asleep"); document.body.classList.remove("no-cursor");
    clearTimeout(idle);
    idle = setTimeout(() => {
      if (!document.getElementById("menu").classList.contains("hidden")) return;
      d.classList.add("asleep"); document.body.classList.add("no-cursor");
    }, 2800);
  }
  function fullscreen() { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); }

  function toggleMenu() {
    const m = document.getElementById("menu");
    if (!m.classList.contains("hidden")) { m.classList.add("hidden"); return; }
    const secs = form.content.sections;
    const it = curItem();
    let h = "";
    if (guided()) {
      h += '<div class="mn-group"><label class="mn-label" for="secSel">Sezione aperta sui telefoni</label><select id="secSel" class="mn-select"><option value="">Nessuna, in attesa</option>' +
        secs.map((s, i) => '<option value="' + esc(s.id) + '"' + (state.active_section === s.id ? " selected" : "") + ">" + esc(s.title || "Sezione " + (i + 1)) + "</option>").join("") + "</select>" +
        '<label class="mn-check"><input type="checkbox" id="follow"' + (follow ? " checked" : "") + '><span>Apri la sezione della domanda mostrata</span></label></div>';
    }
    h += '<div class="mn-group">' +
      (it && it.q.type === "text" ? '<button class="mn-item" data-m="words">' + ((textMode[it.q.id] || (it.q.display === "list" ? "list" : "cloud")) === "cloud" ? "Mostra come elenco" : "Mostra come word cloud") + "</button>" : "") +
      '<button class="mn-item" data-m="qr">' + (showQr ? "Nascondi il QR" : "Mostra il QR") + '<kbd>Q</kbd></button>' +
      '<button class="mn-item" data-m="fs">Schermo intero<kbd>F</kbd></button>' +
      '<button class="mn-item" data-m="ppt">Copia il link per PowerPoint</button>' +
      '<a class="mn-item" href="admin.html#/f/' + form.id + '/r" target="_blank">Apri tutte le risposte</a></div>' +
      '<div class="mn-foot">← → per cambiare domanda · A apri/chiudi · R risultati<br>Clic su una parola per toglierla</div>';
    m.innerHTML = h;
    m.classList.remove("hidden");
    const sel = m.querySelector("#secSel"); if (sel) sel.onchange = () => setState({ active_section: sel.value || null });
    const fl = m.querySelector("#follow"); if (fl) fl.onchange = () => { follow = fl.checked; };
    m.querySelectorAll("[data-m]").forEach((b) => (b.onclick = () => {
      const a = b.dataset.m;
      if (a === "qr") { showQr = !showQr; render(true); }
      else if (a === "fs") fullscreen();
      else if (a === "words") { textMode[it.q.id] = (textMode[it.q.id] || (it.q.display === "list" ? "list" : "cloud")) === "cloud" ? "list" : "cloud"; render(true); }
      else if (a === "ppt") {
        const url = location.href.replace(/[?#].*$/, "") + "?id=" + form.id + "&q=" + pos;
        (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(
          () => A.toast("Link copiato. In PowerPoint: Inserisci → Collegamento", 3500), () => window.prompt("Copia il link:", url));
      }
      m.classList.add("hidden");
    }));
  }

  async function setState(patch) {
    if (busy) return; busy = true;
    try { state = await A.rpc("a_set_state", { p_id: form.id, p_patch: patch }); render(true); }
    catch (e) { A.toast(e.message, 4000); }
    finally { busy = false; }
  }

  async function go(d) {
    const np = Math.max(0, Math.min(flat.length + 1, pos + d));
    if (np === pos) return;
    pos = np; try { sessionStorage.setItem("pr_pos_" + id, pos); } catch (_) {}
    data = { rows: [], qa: [] };
    const it = curItem();
    if (guided() && follow) {
      const target = it ? it.s.id : null;
      if ((state.active_section || null) !== target) await setState({ active_section: target });
    }
    render(true); refresh();
  }

  function render(force) {
    const it = curItem();
    const $ = (x) => document.getElementById(x);
    $("openBtn").innerHTML = icon(state.open ? "unlock" : "lock");
    $("openBtn").title = state.open ? "Chiudi le risposte (A)" : "Riapri le risposte (A)";
    $("openBtn").classList.toggle("on", !state.open);
    $("resBtn").innerHTML = icon(showResults ? "eye" : "eyeOff");
    $("resBtn").title = showResults ? "Nascondi i risultati (R)" : "Mostra i risultati (R)";
    $("resBtn").classList.toggle("on", !showResults);
    $("posLab").textContent = it ? pos + " / " + flat.length : pos === 0 ? "Inizio" : "Fine";
    $("prev").disabled = pos === 0; $("next").disabled = pos === flat.length + 1;
    $("status").textContent = state.open ? "" : "Risposte chiuse";
    $("status").classList.toggle("show", !state.open);
    $("qrbox").classList.toggle("hidden", !showQr || !it);

    const stage = $("stage");
    if (!it) {
      $("cnt").textContent = "";
      const key = "lobby" + pos + counts.started;
      if (!force && key === lastKey) return; lastKey = key;
      stage.className = "pr-stage";
      stage.innerHTML = pos === 0
        ? '<div class="lobby"><h1 class="lobby-title">' + esc(form.title) + '</h1><div class="lobby-join"><div class="lobby-qr">' + A.qrSvg(A.participantUrl(form.code)) + "</div>" +
          '<div class="lobby-steps"><p>Inquadra il QR oppure vai su</p><p class="lobby-url">' + esc(shortUrl()) + '</p><p>e inserisci il codice</p><p class="lobby-pin">' + esc(form.code) + "</p></div></div>" +
          (counts.started ? '<p class="lobby-count">' + counts.started + (counts.started === 1 ? " persona ha già risposto" : " persone hanno già risposto") + "</p>" : "") + "</div>"
        : '<div class="lobby"><h1 class="lobby-title">' + esc((form.settings || {}).thanks || "Grazie") + "</h1></div>";
      return;
    }
    const q = it.q;
    const n = R.count(q, data);
    $("cnt").textContent = n + (q.type === "qa" ? (n === 1 ? " domanda" : " domande") : n === 1 ? " risposta" : " risposte");
    if (stage.dataset.q !== q.id || !stage.querySelector(".pr-results")) {
      stage.dataset.q = q.id;
      stage.className = "pr-stage enter";
      stage.innerHTML = (it.s.title ? '<p class="pr-sec">' + esc(it.s.title) + "</p>" : "") + '<h1 class="pr-title">' + esc(q.title || "") + "</h1>" +
        (q.description ? '<p class="pr-desc">' + esc(q.description) + "</p>" : "") + '<div class="pr-results"></div>';
      requestAnimationFrame(() => stage.classList.remove("enter"));
    }
    const box = stage.querySelector(".pr-results");
    if (!showResults) { lastKey = ""; box.innerHTML = '<div class="r-empty">I risultati sono nascosti</div>'; return; }
    const hidden = ((state.hidden || {})[q.id]) || [];
    const key = q.id + JSON.stringify(data) + JSON.stringify(hidden) + (textMode[q.id] || "");
    if (!force && key === lastKey) return; lastKey = key;
    R.render(box, q, data, {
      big: true, hidden, textMode: q.type === "text" ? (textMode[q.id] || (q.display === "list" ? "list" : "cloud")) : undefined,
      onHide: (k) => { const h = Object.assign({}, state.hidden || {}); h[q.id] = (h[q.id] || []).concat([k]); setState({ hidden: h }); A.toast("Tolta dai risultati"); },
      onQa: async (itemId, act) => {
        const item = data.qa.find((x) => x.id === itemId); if (!item) return;
        try {
          await A.rpc("a_qa_mod", { p_id: form.id, p_item: itemId, p_hidden: act === "hide" ? true : null, p_answered: act === "answered" ? !item.answered : null });
          if (act === "hide") item.hidden = true; else item.answered = !item.answered;
          render(true);
        } catch (e) { A.toast(e.message); }
      },
    });
  }

  let refreshing = false;
  async function refresh() {
    if (refreshing) return; refreshing = true;
    try {
      const it = curItem();
      const qid = it ? it.q.id : "__none__";
      const res = await A.rpc("a_results", { p_id: form.id, p_qid: qid }, 10000);
      if ((curItem() ? curItem().q.id : "__none__") === qid) {
        state = Object.assign({}, res.state);
        counts = { started: res.started, done: res.done };
        data = { rows: (res.responses || []).map((r) => ({ s: r.s, v: r.v })), qa: res.qa || [] };
        render(false);
      }
    } catch (e) { A.toast("Connessione lenta, riprovo…"); }
    finally { refreshing = false; }
  }
  function loop() { refresh(); setInterval(refresh, 2000); }

  boot();
})();
