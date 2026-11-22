// Presentazione dal vivo: risultati in tempo reale, controllo delle sezioni (modalità guidata)
(function () {
  const A = window.APP, R = window.RESULTS, esc = A.esc;
  const app = document.getElementById("app");
  const id = new URLSearchParams(location.search).get("id");

  let form = null, flat = [], pos = 0; // 0 = schermata di ingresso, 1..n domande, n+1 = fine
  let state = null, data = { rows: [], qa: [] }, counts = { started: 0, done: 0 };
  let showResults = true, showQr = true, follow = true, textMode = {}, busy = false, lastKey = "";

  async function boot() {
    const { data: s } = await A.SB.auth.getSession();
    if (!s.session) { app.innerHTML = '<div class="status err" style="margin:40px">Devi prima accedere dalla <a href="admin.html">pagina di gestione</a>.</div>'; return; }
    if (!id) { app.innerHTML = '<div class="status err" style="margin:40px">Manca il modulo. Aprilo da <a href="admin.html">Gestione</a>.</div>'; return; }
    try { form = await A.rpc("a_get", { p_id: id }); } catch (e) { app.innerHTML = '<div class="status err" style="margin:40px">' + esc(e.message) + "</div>"; return; }
    A.applyTheme(form.theme);
    document.title = form.title + " · Presentazione";
    flat = A.flatQuestions(form.content);
    state = form.state;
    const qParam = new URLSearchParams(location.search).get("q");
    if (qParam !== null && qParam !== "") pos = Number(qParam) || 0;
    else { try { pos = Number(sessionStorage.getItem("pr_pos_" + id)) || 0; } catch (_) {} }
    pos = Math.max(0, Math.min(pos, flat.length + 1));
    shell(); render();
    // aperto da un link di PowerPoint su una domanda precisa: apri subito la sua sezione
    if (qParam !== null && guided() && follow) { const it = curItem(); await setState({ active_section: it ? it.s.id : null }); }
    loop();
  }

  const guided = () => (form.settings || {}).mode === "guided";
  const curItem = () => (pos >= 1 && pos <= flat.length ? flat[pos - 1] : null);

  function shell() {
    app.innerHTML = '<div class="pr">' +
      '<div class="pr-top"><b class="pr-ev">' + esc(form.title) + '</b><span class="sp"></span><span class="pr-count" id="cnt"></span><span class="badge" id="badge"></span><span class="muted small" id="posLab"></span></div>' +
      '<div class="pr-main"><div class="pr-q" id="stage"></div><div class="qrbox" id="qrbox"><div class="qr">' + A.qrSvg(A.participantUrl(form.code)) + '</div>' +
      '<div class="url">' + esc(A.baseUrl().replace(/^https?:\/\//, "").replace(/\/$/, "")) + '</div><div class="muted small">codice</div><div class="code-big">' + esc(form.code) + "</div></div></div>" +
      '<div class="pr-bar"><button class="pbtn" id="prev">◀</button><button class="pbtn primary" id="next">Avanti ▶</button>' +
      '<span id="guidedCtl" class="row gap"></span><button class="pbtn" id="openBtn"></button><button class="pbtn" id="resBtn"></button><button class="pbtn" id="qrBtn">QR</button>' +
      '<button class="pbtn hidden" id="wordBtn"></button><span class="sp"></span><span class="kbd">← → · A apri/chiudi · R risultati · Q QR · F schermo intero · clic su una parola per nasconderla</span>' +
      '<button class="pbtn" id="pptBtn" title="Copia il link a questa schermata, da incollare come collegamento in una slide">🔗 Link per PowerPoint</button>' +
      '<a class="pbtn" href="admin.html#/f/' + form.id + '/r" target="_blank">Risposte</a></div></div>';
    document.getElementById("pptBtn").onclick = () => {
      const url = location.href.replace(/[?#].*$/, "") + "?id=" + form.id + "&q=" + pos;
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(
        () => A.toast("Link copiato: incollalo in PowerPoint (Inserisci → Collegamento)", 4000), () => window.prompt("Copia il link:", url));
    };
    document.getElementById("prev").onclick = () => go(-1);
    document.getElementById("next").onclick = () => go(1);
    document.getElementById("openBtn").onclick = () => setState({ open: !state.open });
    document.getElementById("resBtn").onclick = () => { showResults = !showResults; render(true); };
    document.getElementById("qrBtn").onclick = () => { showQr = !showQr; render(true); };
    document.getElementById("wordBtn").onclick = () => { const it = curItem(); if (!it) return; textMode[it.q.id] = (textMode[it.q.id] || (it.q.display === "list" ? "list" : "cloud")) === "cloud" ? "list" : "cloud"; render(true); };
    document.addEventListener("keydown", (e) => {
      if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); go(1); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") go(-1);
      else if (k === "a") document.getElementById("openBtn").click();
      else if (k === "r") document.getElementById("resBtn").click();
      else if (k === "q") document.getElementById("qrBtn").click();
      else if (k === "f") { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); }
    });
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
    const cnt = document.getElementById("cnt");
    const badge = document.getElementById("badge");
    badge.className = "badge " + (state.open ? "open" : "closed");
    badge.textContent = state.open ? "● Aperto" : "Chiuso";
    document.getElementById("openBtn").textContent = state.open ? "Chiudi modulo" : "Riapri modulo";
    document.getElementById("resBtn").textContent = showResults ? "Nascondi risultati" : "Mostra risultati";
    document.getElementById("posLab").textContent = it ? pos + "/" + flat.length : "";
    document.getElementById("qrbox").classList.toggle("hidden", !showQr || !it);
    const wb = document.getElementById("wordBtn");
    wb.classList.toggle("hidden", !(it && it.q.type === "text"));
    if (it && it.q.type === "text") wb.textContent = (textMode[it.q.id] || (it.q.display === "list" ? "list" : "cloud")) === "cloud" ? "Mostra elenco" : "Mostra word cloud";
    guidedControls();

    const stage = document.getElementById("stage");
    if (!it) {
      cnt.innerHTML = "<b>" + counts.started + "</b> partecipanti";
      const key = "lobby" + pos + counts.started;
      if (!force && key === lastKey) return; lastKey = key;
      stage.innerHTML = pos === 0
        ? '<div class="lobby"><h1>' + esc(form.title) + '</h1><div class="lobby-grid"><div class="qr">' + A.qrSvg(A.participantUrl(form.code)) + '</div><div><p class="muted">Vai su</p><div class="url big">' +
          esc(A.baseUrl().replace(/^https?:\/\//, "").replace(/\/$/, "")) + '</div><p class="muted">e inserisci il codice</p><div class="code-huge">' + esc(form.code) + '</div><p class="muted">oppure inquadra il QR</p></div></div>' +
          '<p class="muted">' + counts.started + " persone hanno già risposto</p></div>"
        : '<div class="lobby"><div style="font-size:90px">💙</div><h1>' + esc((form.settings || {}).thanks || "Grazie!") + "</h1></div>";
      return;
    }
    const q = it.q;
    const n = R.count(q, data);
    cnt.innerHTML = "<b>" + n + "</b> " + (q.type === "qa" ? "domande" : "risposte");
    if (!stage.querySelector(".pr-results") || stage.dataset.q !== q.id) {
      stage.dataset.q = q.id;
      stage.innerHTML = '<div class="section">' + esc(it.s.title || "") + "</div><h1>" + esc(q.title || "") + "</h1>" +
        (q.description ? '<p class="muted pr-desc">' + esc(q.description) + "</p>" : "") + '<div class="pr-results results-big"></div>';
    }
    const box = stage.querySelector(".pr-results");
    if (!showResults) { box.innerHTML = '<div class="r-empty">Risultati nascosti · ' + n + " " + (q.type === "qa" ? "domande" : "risposte") + "</div>"; return; }
    const hidden = ((state.hidden || {})[q.id]) || [];
    const key = q.id + JSON.stringify(data) + JSON.stringify(hidden) + (textMode[q.id] || "");
    if (!force && key === lastKey) return; lastKey = key;
    R.render(box, q, data, {
      big: true, hidden, textMode: q.type === "text" ? (textMode[q.id] || (q.display === "list" ? "list" : "cloud")) : undefined,
      onHide: (k) => { const h = Object.assign({}, state.hidden || {}); h[q.id] = (h[q.id] || []).concat([k]); setState({ hidden: h }); A.toast("Nascosta"); },
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

  function guidedControls() {
    const el = document.getElementById("guidedCtl");
    if (!guided()) { el.innerHTML = ""; return; }
    const secs = form.content.sections;
    const sig = (state.active_section || "") + follow + secs.length;
    if (el.dataset.sig === sig) return; el.dataset.sig = sig;
    el.innerHTML = '<span class="muted small">Aperta sui telefoni:</span><select class="inp inline small" id="secSel"><option value="">— nessuna (attesa) —</option>' +
      secs.map((s, i) => '<option value="' + esc(s.id) + '"' + (state.active_section === s.id ? " selected" : "") + ">" + (i + 1) + ". " + esc(s.title || "Sezione") + "</option>").join("") +
      '</select><label class="switch small" title="Quando cambi domanda, apri la sua sezione sui telefoni"><input type="checkbox" id="follow"' + (follow ? " checked" : "") + "> segui</label>";
    document.getElementById("secSel").onchange = (e) => setState({ active_section: e.target.value || null });
    document.getElementById("follow").onchange = (e) => { follow = e.target.checked; el.dataset.sig = ""; };
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
    } catch (e) { A.toast("Aggiornamento non riuscito, riprovo…"); }
    finally { refreshing = false; }
  }
  function loop() { refresh(); setInterval(refresh, 2000); }

  boot();
})();
