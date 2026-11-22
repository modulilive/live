// Pagina dei partecipanti: modalità libera (con ramificazioni) e guidata
(function () {
  const A = window.APP, esc = A.esc;
  const app = document.getElementById("app");
  const net = document.getElementById("net");
  const params = new URLSearchParams(location.search);
  const code = (params.get("f") || params.get("c") || "").trim().toLowerCase();

  let form = null, sections = [], sid = null, answers = {}, mode = "free";
  let state = null, failures = 0;
  // libera
  let cur = 0, history = [];
  // guidata
  let shownSection = undefined, submittedSections = {};
  let qaTimers = [];

  // ---------- schermate semplici ----------
  function screen(big, title, text, extra) {
    clearQa();
    app.innerHTML = header(true) + '<div class="center-msg"><div class="big">' + big + "</div><h2>" + esc(title) + "</h2>" +
      (text ? "<p>" + esc(text) + "</p>" : "") + (extra || "") + "</div>";
  }
  function header(small) {
    if (!form) return "";
    const t = form.theme || {};
    return (t.headerImage && !small ? '<div class="p-hero" style="background-image:url(\'' + esc(t.headerImage) + '\')"></div>' : "") +
      '<header class="p-head"><h1 class="p-title">' + esc(form.title) + "</h1>" +
      (!small && form.description ? '<p class="p-desc">' + esc(form.description).replace(/\n/g, "<br>") + "</p>" : "") + "</header>";
  }

  function joinScreen(err) {
    document.title = "Partecipa";
    app.innerHTML = '<div class="center-msg join"><div class="big">👋</div><h2>Inserisci il codice</h2>' +
      '<input id="code" class="inp code-inp" maxlength="12" autocomplete="off" autocapitalize="none" placeholder="es. k7m2qp">' +
      '<button class="btn" id="go">Entra</button>' + (err ? '<div class="status err">' + esc(err) + "</div>" : "") + "</div>";
    const go = () => { const c = document.getElementById("code").value.trim(); if (c) location.search = "?f=" + encodeURIComponent(c.toLowerCase()); };
    document.getElementById("go").onclick = go;
    document.getElementById("code").onkeydown = (e) => { if (e.key === "Enter") go(); };
  }

  // ---------- memoria locale ----------
  const K = (k) => "ml_" + k + "_" + code;
  function loadLocal() {
    sid = A.store.get(K("sid"));
    if (!sid) { sid = A.randomId(); A.store.set(K("sid"), sid); }
    const round = String(state.round);
    if (A.store.get(K("round")) !== round) {
      // nuovo "giro" (risposte azzerate dall'organizzatrice): si riparte puliti
      A.store.set(K("round"), round); A.store.del(K("ans")); A.store.del(K("done")); A.store.del(K("sent"));
    }
    try { answers = JSON.parse(A.store.get(K("ans")) || "{}"); } catch (_) { answers = {}; }
    try { submittedSections = JSON.parse(A.store.get(K("sent")) || "{}"); } catch (_) { submittedSections = {}; }
  }
  const saveLocal = () => A.store.set(K("ans"), JSON.stringify(answers));

  // ---------- avvio ----------
  async function boot() {
    if (!code) return joinScreen();
    try {
      form = await A.rpcRetry("f_get", { p_code: code });
    } catch (e) {
      return screen("📶", "Connessione non riuscita", "Controlla la connessione e ricarica la pagina.");
    }
    if (!form) return joinScreen("Nessun modulo con il codice “" + code + "”.");
    document.title = form.title;
    A.applyTheme(form.theme);
    sections = (form.content && form.content.sections) || [];
    mode = (form.settings && form.settings.mode) || "free";
    state = form.state;
    loadLocal();
    if (mode === "guided") renderGuided(true); else startFree();
    poll();
  }

  async function poll() {
    const wait = mode === "guided" ? 3500 : 20000;
    try {
      const s = await A.rpc("f_state", { p_code: code }, 8000);
      failures = 0; net.classList.add("hidden");
      if (s) {
        const versionChanged = s.version !== form.version;
        const roundChanged = s.round !== state.round;
        state = s;
        if (versionChanged) {
          const f = await A.rpc("f_get", { p_code: code });
          if (f) { form = f; sections = f.content.sections || []; A.applyTheme(form.theme); mode = (f.settings && f.settings.mode) || "free"; }
        }
        if (roundChanged) { loadLocal(); cur = 0; history = []; shownSection = undefined; }
        if (mode === "guided") renderGuided(versionChanged || roundChanged);
        else if (versionChanged || roundChanged) startFree();
        else if (!state.open && !A.store.get(K("done"))) screen("🔒", "Il modulo è chiuso", "Al momento non accetta risposte.");
      }
    } catch (e) {
      failures++;
      if (failures >= 2) net.classList.remove("hidden");
    }
    const next = (failures ? Math.min(20000, wait * (1 + failures)) : wait) + Math.random() * 1000;
    setTimeout(poll, document.hidden ? Math.max(next, 10000) : next);
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && form && mode === "guided") {
      A.rpc("f_state", { p_code: code }).then((s) => { if (s && s.version === form.version) { state = s; renderGuided(false); } }).catch(() => {});
    }
  });

  // ---------- invio ----------
  async function submit(qids, done, statusEl) {
    const payload = {};
    qids.forEach((id) => (payload[id] = answers[id] === undefined ? null : answers[id]));
    try {
      await A.rpcRetry("f_submit", { p_code: code, p_sid: sid, p_answers: payload, p_done: !!done });
      return true;
    } catch (e) {
      if (statusEl) statusEl.innerHTML = '<div class="status err">' + esc(e.message) + "</div>";
      else A.toast(e.message, 4000);
      return false;
    }
  }

  // ---------- MODALITÀ LIBERA ----------
  function startFree() {
    if (!state.open && !A.store.get(K("done"))) return screen("🔒", "Il modulo è chiuso", "Al momento non accetta risposte.");
    if (A.store.get(K("done"))) return thanks();
    if (!sections.length) return screen("🛠️", "Modulo in preparazione", "Non ci sono ancora domande.");
    cur = Math.min(cur, sections.length - 1);
    renderFree();
  }

  function sectionTarget(si) {
    const s = sections[si];
    let target = s.next || null;
    (s.questions || []).forEach((q) => {
      if (q.type === "choice" || q.type === "dropdown") {
        const o = (q.options || []).find((x) => x.id === answers[q.id]);
        if (o && o.goTo) target = o.goTo;
      }
    });
    if (target === "submit") return -1;
    if (target) { const i = sections.findIndex((x) => x.id === target); if (i > si) return i; if (i >= 0) return i; }
    return si + 1 < sections.length ? si + 1 : -1;
  }

  function renderFree() {
    clearQa();
    const s = sections[cur];
    const tgt = sectionTarget(cur);
    const total = sections.length;
    const showProgress = !(form.settings && form.settings.hideProgress) && total > 1;
    app.innerHTML = header(cur > 0) +
      (showProgress ? '<div class="progress"><div style="width:' + Math.round((cur / total) * 100) + '%"></div></div>' : "") +
      sectionHead(s) + '<div id="qs"></div><div id="st"></div>' +
      '<div class="nav">' + (history.length ? '<button class="btn ghost" id="back">Indietro</button>' : "<span></span>") +
      '<button class="btn" id="fwd">' + (tgt === -1 ? "Invia" : "Avanti") + "</button></div>";
    const qs = document.getElementById("qs");
    (s.questions || []).forEach((q) => qs.appendChild(questionEl(q, () => {
      // aggiorna il testo del pulsante se cambia la ramificazione
      document.getElementById("fwd").textContent = sectionTarget(cur) === -1 ? "Invia" : "Avanti";
    })));
    const back = document.getElementById("back");
    if (back) back.onclick = () => { cur = history.pop(); renderFree(); window.scrollTo(0, 0); };
    document.getElementById("fwd").onclick = async (ev) => {
      const btn = ev.currentTarget, st = document.getElementById("st");
      if (!validate(s, st)) return;
      btn.disabled = true;
      const t = sectionTarget(cur);
      const ids = (s.questions || []).filter((q) => q.type !== "qa").map((q) => q.id);
      if (t === -1) {
        // pulisci le risposte di sezioni saltate da una ramificazione
        const visited = new Set(history.concat([cur]).map((i) => sections[i].id));
        sections.forEach((sec) => { if (!visited.has(sec.id)) (sec.questions || []).forEach((q) => { if (answers[q.id] !== undefined) { ids.push(q.id); delete answers[q.id]; } }); });
        saveLocal();
        const ok = await submit(ids, true, st);
        btn.disabled = false;
        if (ok) { A.store.set(K("done"), "1"); thanks(); }
      } else {
        const ok = await submit(ids, false, st);
        btn.disabled = false;
        if (ok) { history.push(cur); cur = t; renderFree(); window.scrollTo(0, 0); }
      }
    };
  }

  function thanks() {
    clearQa();
    const st = form.settings || {};
    const msg = st.thanks || "Grazie! Le tue risposte sono state inviate.";
    let extra = "";
    if (st.allowEdit !== false && state.open) extra += '<button class="btn ghost" id="edit">Modifica le risposte</button>';
    if (st.allowMultiple && state.open) extra += '<button class="btn ghost" id="again">Invia un’altra risposta</button>';
    screen("💙", msg, "", extra);
    const e = document.getElementById("edit");
    if (e) e.onclick = () => { A.store.del(K("done")); cur = 0; history = []; renderFree(); };
    const a = document.getElementById("again");
    if (a) a.onclick = () => { sid = A.randomId(); A.store.set(K("sid"), sid); answers = {}; saveLocal(); A.store.del(K("done")); cur = 0; history = []; renderFree(); };
  }

  // ---------- MODALITÀ GUIDATA ----------
  function renderGuided(force) {
    const active = state.active_section || null;
    if (!force && active === shownSection && document.getElementById("qs")) {
      // stessa sezione: aggiorna solo aperto/chiuso
      app.querySelectorAll("#qs input, #qs select, #qs textarea, #qs .opt, #qs .rk button, #send").forEach((el) => (el.disabled = !state.open));
      return;
    }
    shownSection = active;
    if (!state.open) return screen("🔒", "Il modulo è chiuso", "Al momento non accetta risposte.");
    const s = sections.find((x) => x.id === active);
    if (!s) return screen("⏳", "Tieni aperta questa pagina", "Le domande appariranno qui quando l’organizzatrice le apre.");
    clearQa();
    const onlyTap = (s.questions || []).length === 1 && ["choice", "scale"].includes(s.questions[0].type);
    const hasInputs = (s.questions || []).some((q) => q.type !== "qa");
    app.innerHTML = header(true) + sectionHead(s) + '<div id="qs"></div><div id="st"></div>' +
      (hasInputs && !onlyTap ? '<div class="nav"><span></span><button class="btn" id="send">Invia</button></div>' : "");
    const st = document.getElementById("st");
    const sentMsg = () => { st.innerHTML = '<div class="status ok">✓ Inviato. Puoi modificare finché questa parte è aperta.</div>'; };
    if (submittedSections[s.id]) sentMsg();
    const qs = document.getElementById("qs");
    (s.questions || []).forEach((q) => qs.appendChild(questionEl(q, async () => {
      if (onlyTap) { if (await submit([q.id], true, st)) { submittedSections[s.id] = 1; A.store.set(K("sent"), JSON.stringify(submittedSections)); sentMsg(); } }
    })));
    const send = document.getElementById("send");
    if (send) send.onclick = async () => {
      if (!validate(s, st)) return;
      send.disabled = true;
      const ok = await submit((s.questions || []).filter((q) => q.type !== "qa").map((q) => q.id), true, st);
      send.disabled = false;
      if (ok) { submittedSections[s.id] = 1; A.store.set(K("sent"), JSON.stringify(submittedSections)); sentMsg(); }
    };
  }

  // ---------- pezzi comuni ----------
  function sectionHead(s) {
    return (s.title ? '<h2 class="sec-title">' + esc(s.title) + "</h2>" : "") +
      (s.description ? '<p class="sec-desc">' + esc(s.description).replace(/\n/g, "<br>") + "</p>" : "") +
      (s.image ? '<img class="sec-img" src="' + esc(s.image) + '" alt="">' : "");
  }

  function isEmpty(v) { return v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length) || (typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length); }

  function validate(s, st) {
    let firstBad = null;
    (s.questions || []).forEach((q) => {
      const box = app.querySelector('[data-qid="' + q.id + '"]');
      let bad = false;
      if (q.required && q.type !== "qa") {
        if (q.type === "likert") bad = (q.rows || []).some((r) => !answers[q.id] || answers[q.id][r.id] == null);
        else bad = isEmpty(answers[q.id]);
      }
      if (q.type === "number" && !isEmpty(answers[q.id])) {
        const v = Number(answers[q.id]);
        if (isNaN(v) || (q.min != null && q.min !== "" && v < Number(q.min)) || (q.max != null && q.max !== "" && v > Number(q.max))) bad = true;
      }
      if (box) box.classList.toggle("invalid", bad);
      if (bad && !firstBad) firstBad = box;
    });
    if (firstBad) {
      st.innerHTML = '<div class="status err">Completa le domande evidenziate.</div>';
      firstBad.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }
    st.innerHTML = "";
    return true;
  }

  function setAnswer(q, v, onChange) {
    if (isEmpty(v)) delete answers[q.id]; else answers[q.id] = v;
    saveLocal();
    const box = app.querySelector('[data-qid="' + q.id + '"]');
    if (box) box.classList.remove("invalid");
    if (onChange) onChange();
  }

  function questionEl(q, onChange) {
    const box = document.createElement("div");
    box.className = "qbox"; box.dataset.qid = q.id;
    const closed = !state.open;
    box.innerHTML = '<div class="q-title">' + esc(q.title || "") + (q.required ? ' <span class="req">*</span>' : "") + "</div>" +
      (q.description ? '<div class="q-desc">' + esc(q.description).replace(/\n/g, "<br>") + "</div>" : "") +
      (q.image ? '<img class="q-img" src="' + esc(q.image) + '" alt="">' : "") + '<div class="q-body"></div>';
    const body = box.querySelector(".q-body");
    const v = answers[q.id];

    if (q.type === "choice" || q.type === "multi") {
      const multi = q.type === "multi";
      const hasImg = (q.options || []).some((o) => o.image);
      body.innerHTML = '<div class="' + (hasImg ? "opts-img" : "opts") + '">' + (q.options || []).map((o) => {
        const sel = multi ? (v || []).includes(o.id) : v === o.id;
        return '<button type="button" class="opt' + (sel ? " sel" : "") + (multi ? " multi" : "") + '" data-o="' + esc(o.id) + '"' + (closed ? " disabled" : "") + ">" +
          (o.image ? '<img src="' + esc(o.image) + '" alt="">' : hasImg ? '<span class="ph">' + esc(o.emoji || "") + "</span>" : "") +
          '<span class="opt-row"><span class="mark"></span>' + (o.emoji && !hasImg ? '<span class="em">' + esc(o.emoji) + "</span>" : "") + "<span>" + esc(o.label) + "</span></span></button>";
      }).join("") + "</div>" + (multi && q.maxChoices ? '<div class="q-hint">Massimo ' + q.maxChoices + " scelte</div>" : "");
      body.querySelectorAll(".opt").forEach((b) => (b.onclick = () => {
        const id = b.dataset.o;
        if (multi) {
          let cur = (answers[q.id] || []).slice();
          if (cur.includes(id)) cur = cur.filter((x) => x !== id);
          else { if (q.maxChoices && cur.length >= q.maxChoices) return A.toast("Massimo " + q.maxChoices + " scelte"); cur.push(id); }
          b.classList.toggle("sel", cur.includes(id));
          setAnswer(q, cur, onChange);
        } else {
          const same = answers[q.id] === id && !q.required;
          body.querySelectorAll(".opt").forEach((x) => x.classList.toggle("sel", !same && x === b));
          setAnswer(q, same ? null : id, onChange);
        }
      }));
    } else if (q.type === "dropdown") {
      body.innerHTML = '<select class="inp"' + (closed ? " disabled" : "") + '><option value="">Scegli…</option>' +
        (q.options || []).map((o) => '<option value="' + esc(o.id) + '"' + (v === o.id ? " selected" : "") + ">" + esc((o.emoji ? o.emoji + " " : "") + o.label) + "</option>").join("") + "</select>";
      body.querySelector("select").onchange = (e) => setAnswer(q, e.target.value || null, onChange);
    } else if (q.type === "text" || q.type === "longtext") {
      const max = q.type === "text" ? (q.maxLength || 30) : 1000;
      body.innerHTML = q.type === "text"
        ? '<input class="inp" type="text" maxlength="' + max + '" autocomplete="off" placeholder="La tua risposta"' + (closed ? " disabled" : "") + ">"
        : '<textarea class="inp" rows="4" maxlength="' + max + '" placeholder="La tua risposta"' + (closed ? " disabled" : "") + "></textarea>";
      const inp = body.querySelector("input,textarea");
      inp.value = v || "";
      inp.oninput = () => setAnswer(q, inp.value.trim() ? inp.value.slice(0, max) : null, onChange);
      if (q.type === "text") inp.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); const b = document.getElementById("send") || document.getElementById("fwd"); if (b) b.click(); } };
    } else if (q.type === "scale") {
      const steps = (q.scale && q.scale.steps) || [];
      const compact = steps.length > 6 || steps.every((s) => !s.label);
      body.innerHTML = '<div class="' + (compact ? "scale-grid" : "opts") + '"' + (compact ? ' style="grid-template-columns:repeat(' + Math.min(steps.length, 6) + ',1fr)"' : "") + ">" +
        steps.map((s) => '<button type="button" class="opt' + (compact ? " sq" : "") + (v === s.value ? " sel" : "") + '" data-v="' + s.value + '"' + (closed ? " disabled" : "") + ">" +
          (compact ? '<span class="em">' + esc(s.emoji || "") + '</span><span class="num">' + s.value + "</span>"
                   : '<span class="em">' + esc(s.emoji || "") + '</span><span class="num">' + s.value + "</span><span>" + esc(s.label || "") + "</span>") + "</button>").join("") + "</div>" +
        (compact && (steps[0] || {}).label ? '<div class="scale-ends"><span>' + esc(steps[0].label) + "</span><span>" + esc(steps[steps.length - 1].label || "") + "</span></div>" : "");
      body.querySelectorAll(".opt").forEach((b) => (b.onclick = () => {
        body.querySelectorAll(".opt").forEach((x) => x.classList.toggle("sel", x === b));
        setAnswer(q, Number(b.dataset.v), onChange);
      }));
    } else if (q.type === "likert") {
      const steps = (q.scale && q.scale.steps) || [];
      body.innerHTML = '<div class="lk-legend">' + steps.map((s) => "<span><b>" + esc(s.emoji || s.value) + "</b> " + esc(s.label || "") + "</span>").join("") + "</div>" +
        (q.rows || []).map((r) => '<div class="lk-row" data-r="' + esc(r.id) + '"><div class="lk-lab">' + esc(r.label) + '</div><div class="lk-btns" style="grid-template-columns:repeat(' + steps.length + ',1fr)">' +
          steps.map((s) => '<button type="button" class="opt sq' + (v && v[r.id] === s.value ? " sel" : "") + '" data-v="' + s.value + '" title="' + esc(s.label || "") + '"' + (closed ? " disabled" : "") + ">" + esc(s.emoji || s.value) + "</button>").join("") + "</div></div>").join("");
      body.querySelectorAll(".lk-row").forEach((row) => row.querySelectorAll(".opt").forEach((b) => (b.onclick = () => {
        row.querySelectorAll(".opt").forEach((x) => x.classList.toggle("sel", x === b));
        const cur = Object.assign({}, answers[q.id] || {}); cur[row.dataset.r] = Number(b.dataset.v);
        setAnswer(q, cur, onChange);
      })));
    } else if (q.type === "ranking") {
      const ids = (q.options || []).map((o) => o.id);
      let order = Array.isArray(v) && v.length === ids.length && v.every((x) => ids.includes(x)) ? v.slice() : ids.slice();
      const draw = () => {
        body.innerHTML = '<div class="q-hint">Usa le frecce per ordinare: in cima la più importante.</div><ol class="rk">' + order.map((id, i) => {
          const o = q.options.find((x) => x.id === id);
          return '<li><span class="rk-n">' + (i + 1) + "</span>" + (o.image ? '<img src="' + esc(o.image) + '" alt="">' : "") +
            '<span class="rk-l">' + esc((o.emoji ? o.emoji + " " : "") + o.label) + "</span>" +
            '<button type="button" data-i="' + i + '" data-d="-1"' + (i === 0 || closed ? " disabled" : "") + ' aria-label="Su">▲</button>' +
            '<button type="button" data-i="' + i + '" data-d="1"' + (i === order.length - 1 || closed ? " disabled" : "") + ' aria-label="Giù">▼</button></li>';
        }).join("") + "</ol>";
        body.querySelectorAll(".rk button").forEach((b) => (b.onclick = () => {
          const i = Number(b.dataset.i), j = i + Number(b.dataset.d);
          [order[i], order[j]] = [order[j], order[i]];
          setAnswer(q, order.slice(), onChange); draw();
        }));
      };
      if (!answers[q.id]) { answers[q.id] = order.slice(); saveLocal(); }
      draw();
    } else if (q.type === "date") {
      body.innerHTML = '<input class="inp" type="date"' + (closed ? " disabled" : "") + ">";
      const inp = body.querySelector("input"); inp.value = v || "";
      inp.onchange = () => setAnswer(q, inp.value || null, onChange);
    } else if (q.type === "number") {
      body.innerHTML = '<input class="inp" type="number" inputmode="decimal"' + (q.min != null && q.min !== "" ? ' min="' + q.min + '"' : "") + (q.max != null && q.max !== "" ? ' max="' + q.max + '"' : "") + (closed ? " disabled" : "") + ">" +
        ((q.min != null && q.min !== "") || (q.max != null && q.max !== "") ? '<div class="q-hint">' + (q.min != null && q.min !== "" ? "Minimo " + q.min + " " : "") + (q.max != null && q.max !== "" ? "Massimo " + q.max : "") + "</div>" : "");
      const inp = body.querySelector("input"); inp.value = v != null ? v : "";
      inp.oninput = () => setAnswer(q, inp.value === "" ? null : Number(inp.value), onChange);
    } else if (q.type === "qa") {
      qaWidget(q, body, closed);
    }
    return box;
  }

  // ---------- Q&A ----------
  function clearQa() { qaTimers.forEach(clearTimeout); qaTimers = []; }
  function qaWidget(q, body, closed) {
    body.innerHTML = '<div class="qa-ask"><textarea class="inp" rows="2" maxlength="280" placeholder="Scrivi la tua domanda o proposta"' + (closed ? " disabled" : "") + '></textarea>' +
      '<button type="button" class="btn small"' + (closed ? " disabled" : "") + '>Invia</button></div><div class="qa-list"></div>';
    const ta = body.querySelector("textarea"), btn = body.querySelector("button"), list = body.querySelector(".qa-list");
    let alive = true, myT = null;
    const schedule = (ms) => { clearTimeout(myT); myT = setTimeout(load, ms); qaTimers.push(myT); };
    const load = async () => {
      if (!alive || !body.isConnected) { alive = false; return; }
      try {
        const items = await A.rpc("qa_list", { p_code: code, p_qid: q.id, p_sid: sid });
        list.innerHTML = (items || []).length ? items.map((i) =>
          '<div class="qa-item' + (i.answered ? " done" : "") + '"><button type="button" class="qa-vote' + (i.mine ? " on" : "") + '" data-id="' + i.id + '"' + (i.own ? " disabled title=\"La tua domanda\"" : "") + ">▲<b>" + i.votes + "</b></button>" +
          '<div class="qa-body">' + esc(i.body) + (i.answered ? ' <span class="tag">risposta</span>' : "") + (i.own ? ' <span class="tag">tua</span>' : "") + "</div></div>").join("")
          : '<div class="q-hint">Ancora nessuna domanda. Scrivi la prima!</div>';
        list.querySelectorAll(".qa-vote").forEach((b) => (b.onclick = async () => {
          const on = !b.classList.contains("on");
          b.classList.toggle("on", on); const n = b.querySelector("b"); n.textContent = Number(n.textContent) + (on ? 1 : -1);
          try { await A.rpc("qa_vote", { p_code: code, p_sid: sid, p_item: Number(b.dataset.id), p_on: on }); } catch (e) { A.toast(e.message); }
        }));
      } catch (_) {}
      schedule(5000 + Math.random() * 1500);
    };
    btn.onclick = async () => {
      const t = ta.value.trim(); if (!t) return;
      btn.disabled = true;
      try { await A.rpcRetry("qa_ask", { p_code: code, p_sid: sid, p_qid: q.id, p_text: t }); ta.value = ""; A.toast("Inviata ✓"); schedule(10); }
      catch (e) { A.toast(e.message, 4000); }
      btn.disabled = false;
    };
    schedule(30); // dopo che il riquadro è stato inserito nella pagina
  }

  boot();
})();
