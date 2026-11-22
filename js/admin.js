// Gestione: login, elenco moduli, editor (stile Microsoft Forms), risposte, impostazioni
(function () {
  const A = window.APP, R = window.RESULTS, esc = A.esc, T = A.TYPES;
  const app = document.getElementById("app");
  const filePick = document.getElementById("filePick");

  let user = null, form = null, tab = "q", openQ = null;
  let saveTimer = null, saving = false, dirty = false, saveState = "ok";

  // ---------- utilità ----------
  function pickImage(folder) {
    return new Promise((resolve) => {
      filePick.value = "";
      filePick.onchange = async () => {
        const f = filePick.files[0]; if (!f) return resolve(null);
        A.toast("Caricamento immagine…", 20000);
        try { const url = await A.uploadImage(f, folder); A.toast("Immagine caricata ✓"); resolve(url); }
        catch (e) { A.toast(e.message, 5000); resolve(null); }
      };
      filePick.click();
    });
  }
  function copy(text) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => A.toast("Copiato ✓"), () => window.prompt("Copia:", text));
  }
  function findQ(id) {
    const secs = form.content.sections;
    for (let si = 0; si < secs.length; si++) {
      const qi = (secs[si].questions || []).findIndex((q) => q.id === id);
      if (qi >= 0) return { s: secs[si], si, q: secs[si].questions[qi], qi };
    }
    return null;
  }
  function move(arr, i, d) { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; }
  function keepScroll(fn) { const y = window.scrollY; fn(); window.scrollTo(0, y); }

  // ---------- salvataggio automatico ----------
  function changed() {
    dirty = true; setSave("pending");
    clearTimeout(saveTimer); saveTimer = setTimeout(save, 700);
  }
  async function save() {
    if (saving) { clearTimeout(saveTimer); saveTimer = setTimeout(save, 400); return; }
    if (!dirty || !form) return;
    saving = true; dirty = false; setSave("saving");
    try {
      await A.rpc("a_save", { p_id: form.id, p_title: form.title, p_description: form.description, p_theme: form.theme, p_settings: form.settings, p_content: form.content });
      setSave(dirty ? "pending" : "ok");
    } catch (e) {
      dirty = true; setSave("error", e.message);
      clearTimeout(saveTimer); saveTimer = setTimeout(save, 3000);
    } finally { saving = false; }
  }
  function setSave(s, msg) {
    saveState = s;
    const el = document.getElementById("saveState"); if (!el) return;
    el.className = "save " + s;
    el.textContent = s === "ok" ? "Salvato ✓" : s === "saving" ? "Salvataggio…" : s === "pending" ? "Modifiche…" : "Non salvato, riprovo… " + (msg || "");
  }
  window.addEventListener("beforeunload", (e) => { if (dirty || saving) { e.preventDefault(); e.returnValue = ""; } });

  // ---------- login ----------
  async function boot() {
    const { data } = await A.SB.auth.getSession();
    user = data.session && data.session.user;
    route();
  }
  window.addEventListener("hashchange", route);
  function route() {
    if (!user) return loginView();
    const m = location.hash.match(/^#\/f\/([0-9a-f-]{36})(?:\/(q|r|s))?/);
    if (m) { tab = m[2] || "q"; openEditor(m[1]); } else dashboard();
  }

  function loginView(err, email) {
    app.innerHTML = '<div class="login card"><h1>' + esc(A.cfg.APP_NAME) + '</h1><p class="muted">Accedi per creare e gestire i tuoi moduli.</p>' +
      '<input class="inp" id="em" type="email" placeholder="Email" autocomplete="username" value="' + esc(email || "") + '">' +
      '<input class="inp" id="pw" type="password" placeholder="Password" autocomplete="current-password">' +
      '<button class="btn" id="go">Entra</button>' + (err ? '<div class="status err">' + esc(err) + "</div>" : "") + "</div>";
    const go = async () => {
      const em = document.getElementById("em").value.trim();
      const { data, error } = await A.SB.auth.signInWithPassword({ email: em, password: document.getElementById("pw").value });
      if (error) return loginView(error.message === "Invalid login credentials" ? "Email o password non corretti." : error.message, em);
      user = data.user; route();
    };
    document.getElementById("go").onclick = go;
    document.getElementById("pw").onkeydown = (e) => { if (e.key === "Enter") go(); };
  }

  // ---------- elenco moduli ----------
  async function dashboard() {
    if (form && (dirty || saving)) { clearTimeout(saveTimer); while (saving) await A.sleep(100); if (dirty) await save(); }
    form = null; A.applyTheme(null);
    document.title = "Moduli · Gestione";
    app.innerHTML = '<div class="topbar"><b>' + esc(A.cfg.APP_NAME) + '</b><span class="sp"></span><span class="muted small">' + esc(user.email || "") + '</span><button class="lnk" id="out">Esci</button></div>' +
      '<div class="dash"><div class="dash-head"><h1>I miei moduli</h1><div class="newbox"><button class="btn" id="new">+ Nuovo modulo</button><div class="menu hidden" id="newMenu">' +
      Object.entries(window.TEMPLATES).map(([k, t]) => '<button data-t="' + k + '">' + esc(t.label) + "</button>").join("") + '</div></div></div><div id="list" class="flist"><div class="muted">Caricamento…</div></div></div>';
    document.getElementById("out").onclick = async () => { await A.SB.auth.signOut(); user = null; route(); };
    const menu = document.getElementById("newMenu");
    document.getElementById("new").onclick = (e) => { e.stopPropagation(); menu.classList.toggle("hidden"); };
    document.addEventListener("click", () => menu.classList.add("hidden"), { once: true });
    menu.querySelectorAll("button").forEach((b) => (b.onclick = () => createFrom(window.TEMPLATES[b.dataset.t].build())));
    try {
      const list = await A.rpc("a_list");
      const el = document.getElementById("list");
      if (!list.length) { el.innerHTML = '<div class="empty-dash">Nessun modulo ancora. Crea il primo con “+ Nuovo modulo”.</div>'; return; }
      el.innerHTML = list.map((f) => '<div class="fcard"><div class="fcard-main" data-open="' + f.id + '"><div class="fcard-title">' + esc(f.title) + '</div><div class="muted small">' +
        (f.mode === "guided" ? "Guidata" : "Libera") + " · codice <b>" + esc(f.code) + "</b> · " + f.done + " risposte" + (f.open ? "" : " · <span class=\"warn\">chiuso</span>") +
        " · modificato " + new Date(f.updated_at).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }) + '</div></div><div class="fcard-act">' +
        '<a class="pbtn" href="present.html?id=' + f.id + '" target="_blank">Presenta</a><button class="pbtn" data-link="' + esc(f.code) + '">Link</button>' +
        '<button class="pbtn" data-dup="' + f.id + '">Duplica</button><button class="pbtn danger" data-del="' + f.id + '" data-title="' + esc(f.title) + '">Elimina</button></div></div>').join("");
      el.querySelectorAll("[data-open]").forEach((b) => (b.onclick = () => (location.hash = "#/f/" + b.dataset.open)));
      el.querySelectorAll("[data-link]").forEach((b) => (b.onclick = () => copy(A.participantUrl(b.dataset.link))));
      el.querySelectorAll("[data-dup]").forEach((b) => (b.onclick = async () => {
        const f = await A.rpc("a_get", { p_id: b.dataset.dup });
        createFrom({ title: f.title + " (copia)", description: f.description, theme: f.theme, settings: f.settings, content: f.content });
      }));
      el.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
        if (!window.confirm("Eliminare definitivamente “" + b.dataset.title + "” e tutte le sue risposte?")) return;
        try { await A.rpc("a_delete", { p_id: b.dataset.del }); dashboard(); } catch (e) { A.toast(e.message); }
      }));
    } catch (e) {
      if (e.code === "forbidden") { await A.SB.auth.signOut(); user = null; return loginView("Sessione scaduta: rifai il login."); }
      document.getElementById("list").innerHTML = '<div class="status err">' + esc(e.message) + "</div>";
    }
  }

  async function createFrom(t) {
    try {
      const r = await A.rpc("a_create", { p_title: t.title, p_description: t.description || "", p_theme: t.theme || {}, p_settings: t.settings || {}, p_content: t.content });
      location.hash = "#/f/" + r.id;
    } catch (e) { A.toast(e.message, 5000); }
  }

  // ---------- editor ----------
  async function openEditor(id) {
    if (!form || form.id !== id) {
      app.innerHTML = '<div class="muted" style="padding:40px">Caricamento…</div>';
      try { form = await A.rpc("a_get", { p_id: id }); }
      catch (e) { app.innerHTML = '<div class="status err" style="margin:40px">' + esc(e.message) + ' <a href="#/">Torna ai moduli</a></div>'; return; }
      form.theme = form.theme || {}; form.settings = form.settings || {}; form.content = form.content || { sections: [] };
      if (!form.content.sections.length) form.content.sections.push({ id: A.newId("s"), title: "", description: "", next: null, questions: [] });
    }
    A.applyTheme(form.theme);
    document.title = form.title + " · Modifica";
    renderShell();
  }

  function renderShell() {
    app.innerHTML = '<div class="topbar"><a class="lnk" href="#/">← Moduli</a><b class="tb-title" id="tbTitle">' + esc(form.title) + '</b><span id="saveState" class="save ok">Salvato ✓</span><span class="sp"></span>' +
      '<a class="pbtn" target="_blank" href="' + esc(A.participantUrl(form.code)) + '">Anteprima</a>' +
      '<a class="pbtn" target="_blank" href="present.html?id=' + form.id + '">Presenta</a><button class="pbtn primary" id="share">Condividi</button></div>' +
      '<div class="tabs"><a href="#/f/' + form.id + '/q" class="' + (tab === "q" ? "on" : "") + '">Domande</a><a href="#/f/' + form.id + '/r" class="' + (tab === "r" ? "on" : "") + '">Risposte</a>' +
      '<a href="#/f/' + form.id + '/s" class="' + (tab === "s" ? "on" : "") + '">Impostazioni</a></div><div id="tab" class="editor"></div>';
    setSave(saveState);
    document.getElementById("share").onclick = shareModal;
    if (tab === "q") renderQuestions(); else if (tab === "r") renderResponses(); else renderSettings();
  }

  function shareModal() {
    const url = A.participantUrl(form.code);
    const m = document.createElement("div");
    m.className = "modal";
    m.innerHTML = '<div class="modal-box"><button class="modal-x">✕</button><h2>Condividi</h2><div class="share-qr">' + A.qrSvg(url) + '</div>' +
      '<div class="share-row"><input class="inp" readonly value="' + esc(url) + '"><button class="pbtn" id="cpy">Copia</button></div>' +
      '<p class="muted">Codice: <b class="code-big">' + esc(form.code) + "</b> (da inserire su " + esc(A.baseUrl().replace(/^https?:\/\//, "")) + ')</p>' +
      '<button class="pbtn" id="qrPng">⬇ Scarica QR (immagine per le slide)</button></div>';
    document.body.appendChild(m);
    m.querySelector("#cpy").onclick = () => copy(url);
    m.querySelector("#qrPng").onclick = () => {
      const svg = m.querySelector(".share-qr svg"); if (!svg) return;
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas"); c.width = c.height = 1000;
        const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, 1000, 1000); g.drawImage(img, 0, 0, 1000, 1000);
        const a = document.createElement("a"); a.href = c.toDataURL("image/png"); a.download = "qr_" + form.code + ".png"; a.click();
      };
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(svg));
    };
    m.onclick = (e) => { if (e.target === m || e.target.classList.contains("modal-x")) m.remove(); };
  }

  // ----- scheda Domande -----
  function targetOptions(si, current, includeContinue) {
    const secs = form.content.sections;
    let h = includeContinue ? '<option value="">' + (includeContinue === "opt" ? "Continua normalmente" : "Vai alla sezione successiva") + "</option>" : "";
    secs.forEach((s, i) => { if (i !== si) h += '<option value="' + esc(s.id) + '"' + (current === s.id ? " selected" : "") + ">Vai a: " + (i + 1) + ". " + esc(s.title || "Sezione senza titolo") + "</option>"; });
    h += '<option value="submit"' + (current === "submit" ? " selected" : "") + ">Invia il modulo (fine)</option>";
    return h;
  }

  function renderQuestions() {
    const el = document.getElementById("tab");
    const th = form.theme;
    const secs = form.content.sections;
    const guided = form.settings.mode === "guided";
    el.innerHTML =
      '<div class="card head-card">' + (th.headerImage ? '<div class="hero-ed" style="background-image:url(\'' + esc(th.headerImage) + '\')"><button class="pbtn small" id="hdrDel">Rimuovi immagine</button></div>' : "") +
      '<input class="inp title-inp" id="fTitle" value="' + esc(form.title) + '" placeholder="Titolo del modulo">' +
      '<textarea class="inp" id="fDesc" rows="2" placeholder="Descrizione (facoltativa)">' + esc(form.description) + "</textarea>" +
      '<div class="row gap"><button class="pbtn" id="hdrImg">🖼️ Immagine di intestazione</button><label class="pbtn color-pick">🎨 Colore <input type="color" id="fColor" value="' + esc(th.color || A.cfg.DEFAULT_COLOR) + '"></label>' +
      '<span class="muted small">' + (guided ? "Modalità <b>guidata</b>: in presentazione apri tu una sezione alla volta." : "Modalità <b>libera</b>: ognuno compila al suo ritmo, con le ramificazioni.") + ' <a href="#/f/' + form.id + '/s">Cambia</a></span></div></div>' +
      secs.map((s, si) => sectionHtml(s, si, guided)).join("") +
      '<div class="add-sec"><button class="pbtn" id="addSec">+ Aggiungi sezione</button></div>';

    const fTitle = document.getElementById("fTitle");
    fTitle.oninput = () => { form.title = fTitle.value; document.getElementById("tbTitle").textContent = form.title; changed(); };
    document.getElementById("fDesc").oninput = (e) => { form.description = e.target.value; changed(); };
    document.getElementById("fColor").oninput = (e) => { th.color = e.target.value; A.applyTheme(th); changed(); };
    document.getElementById("hdrImg").onclick = async () => { const u = await pickImage(form.id); if (u) { th.headerImage = u; changed(); keepScroll(renderQuestions); } };
    const hd = document.getElementById("hdrDel"); if (hd) hd.onclick = () => { th.headerImage = null; changed(); keepScroll(renderQuestions); };
    document.getElementById("addSec").onclick = () => {
      secs.push({ id: A.newId("s"), title: "", description: "", next: null, questions: [] });
      changed(); renderQuestions(); window.scrollTo(0, document.body.scrollHeight);
    };
    secs.forEach((s, si) => bindSection(el.querySelector('[data-sec="' + s.id + '"]'), s, si));
  }

  function sectionHtml(s, si, guided) {
    const secs = form.content.sections;
    return '<div class="sec" data-sec="' + esc(s.id) + '"><div class="sec-bar"><span>Sezione ' + (si + 1) + " di " + secs.length + '</span><span class="sp"></span>' +
      '<button class="icon" data-a="up" title="Sposta su"' + (si === 0 ? " disabled" : "") + ">▲</button>" +
      '<button class="icon" data-a="down" title="Sposta giù"' + (si === secs.length - 1 ? " disabled" : "") + ">▼</button>" +
      (secs.length > 1 ? '<button class="icon" data-a="del" title="Elimina sezione">🗑</button>' : "") + "</div>" +
      '<div class="card sec-card"><input class="inp sec-title-inp" data-f="title" value="' + esc(s.title) + '" placeholder="Titolo della sezione (facoltativo)">' +
      '<textarea class="inp" data-f="description" rows="1" placeholder="Descrizione della sezione (facoltativa)">' + esc(s.description || "") + "</textarea>" +
      (s.image ? '<div class="img-prev"><img src="' + esc(s.image) + '"><button class="icon" data-a="imgdel">✕</button></div>' : '<button class="lnk small" data-a="img">+ immagine</button>') + "</div>" +
      (s.questions || []).map((q, qi) => questionHtml(q, s, si, qi)).join("") +
      '<div class="add-q"><button class="pbtn" data-a="addq">+ Aggiungi domanda</button><div class="type-menu hidden">' +
      Object.entries(T).map(([k, t]) => '<button data-type="' + k + '"><span class="ti">' + t.icon + "</span>" + esc(t.label) + "</button>").join("") + "</div></div>" +
      (!guided && secs.length > 1 ? '<div class="sec-next">Dopo questa sezione: <select class="inp inline" data-f="next">' + targetOptions(si, s.next, "sec") + "</select></div>" : "") +
      "</div>";
  }

  function bindSection(el, s, si) {
    const secs = form.content.sections;
    el.querySelectorAll(":scope > .sec-card [data-f]").forEach((i) => (i.oninput = () => { s[i.dataset.f] = i.value; changed(); }));
    const nx = el.querySelector(':scope > .sec-next [data-f="next"]'); if (nx) nx.onchange = () => { s.next = nx.value || null; changed(); };
    const act = (a, fn) => { const b = el.querySelector(':scope > .sec-bar [data-a="' + a + '"], :scope > .sec-card [data-a="' + a + '"], :scope > .add-q [data-a="' + a + '"]'); if (b) b.onclick = fn; };
    act("up", () => { move(secs, si, -1); changed(); renderQuestions(); });
    act("down", () => { move(secs, si, 1); changed(); renderQuestions(); });
    act("del", () => {
      if ((s.questions || []).length && !window.confirm("Eliminare la sezione e le sue " + s.questions.length + " domande?")) return;
      secs.splice(si, 1);
      // rimuovi i collegamenti a questa sezione
      secs.forEach((x) => { if (x.next === s.id) x.next = null; (x.questions || []).forEach((q) => (q.options || []).forEach((o) => { if (o.goTo === s.id) o.goTo = null; })); });
      changed(); renderQuestions();
    });
    act("img", async () => { const u = await pickImage(form.id); if (u) { s.image = u; changed(); keepScroll(renderQuestions); } });
    act("imgdel", () => { s.image = null; changed(); keepScroll(renderQuestions); });
    const menu = el.querySelector(":scope > .add-q .type-menu");
    act("addq", (e) => { e.stopPropagation(); document.querySelectorAll(".type-menu").forEach((m) => m !== menu && m.classList.add("hidden")); menu.classList.toggle("hidden"); });
    menu.querySelectorAll("[data-type]").forEach((b) => (b.onclick = () => {
      const q = A.blankQuestion(b.dataset.type);
      s.questions = s.questions || []; s.questions.push(q); openQ = q.id;
      changed(); keepScroll(renderQuestions);
      const c = document.querySelector('[data-q="' + q.id + '"] textarea'); if (c) { c.focus(); c.scrollIntoView({ block: "center" }); }
    }));
    (s.questions || []).forEach((q) => bindQuestion(el.querySelector('[data-q="' + q.id + '"]'), q, s));
  }
  document.addEventListener("click", (e) => { if (!e.target.closest(".add-q")) document.querySelectorAll(".type-menu").forEach((m) => m.classList.add("hidden")); });

  function questionHtml(q, s, si, qi) {
    const t = T[q.type] || { label: q.type, icon: "?" };
    if (openQ !== q.id) {
      return '<div class="card qcard closed" data-q="' + esc(q.id) + '"><div class="qsum"><span class="ti">' + t.icon + '</span><span class="qsum-t">' + (qi + 1) + ". " +
        esc(q.title || "(senza titolo)") + (q.required ? ' <span class="req">*</span>' : "") + '</span><span class="muted small">' + esc(t.label) + "</span></div></div>";
    }
    const secs = form.content.sections;
    const guided = form.settings.mode === "guided";
    let h = '<div class="card qcard open" data-q="' + esc(q.id) + '"><div class="row gap"><textarea class="inp q-title-inp" data-f="title" rows="1" placeholder="Domanda">' + esc(q.title) + "</textarea>" +
      '<select class="inp inline" data-f="type">' + Object.entries(T).map(([k, x]) => '<option value="' + k + '"' + (k === q.type ? " selected" : "") + ">" + x.icon + " " + esc(x.label) + "</option>").join("") + "</select></div>" +
      '<input class="inp" data-f="description" value="' + esc(q.description || "") + '" placeholder="Sottotitolo / istruzioni (facoltativo)">' +
      (q.image ? '<div class="img-prev"><img src="' + esc(q.image) + '"><button class="icon" data-a="qimgdel">✕</button></div>' : "");

    if (T[q.type] && T[q.type].options) {
      const branching = (q.type === "choice" || q.type === "dropdown") && !guided && secs.length > 1;
      const imgs = q.type !== "dropdown";
      h += '<div class="opts-ed">' + (q.options || []).map((o, oi) =>
        '<div class="opt-ed" data-o="' + oi + '"><span class="opt-dot">' + (q.type === "multi" ? "☐" : q.type === "ranking" ? oi + 1 : "◯") + "</span>" +
        '<input class="inp emoji-inp" data-of="emoji" value="' + esc(o.emoji || "") + '" placeholder="😀" maxlength="8" title="Emoji (facoltativa)">' +
        '<input class="inp" data-of="label" value="' + esc(o.label) + '" placeholder="Opzione ' + (oi + 1) + '">' +
        (imgs ? (o.image ? '<span class="opt-img"><img src="' + esc(o.image) + '"><button class="icon" data-oa="imgdel">✕</button></span>' : '<button class="icon" data-oa="img" title="Immagine">🖼️</button>') : "") +
        (branching ? '<select class="inp inline goto" data-of="goTo">' + targetOptions(si, o.goTo, "opt") + "</select>" : "") +
        '<button class="icon" data-oa="up" title="Su"' + (oi === 0 ? " disabled" : "") + ">▲</button>" +
        '<button class="icon" data-oa="down" title="Giù"' + (oi === q.options.length - 1 ? " disabled" : "") + ">▼</button>" +
        '<button class="icon" data-oa="del" title="Elimina">✕</button></div>').join("") +
        '<div class="row gap"><button class="lnk" data-a="addopt">+ Aggiungi opzione</button><button class="lnk" data-a="bulk">Incolla un elenco</button></div></div>';
      if (q.type === "multi") h += '<label class="field">Numero massimo di scelte (0 = nessun limite) <input class="inp inline num" type="number" min="0" data-f="maxChoices" value="' + (q.maxChoices || 0) + '"></label>';
      if (branching) h += '<div class="muted small">Ramificazione: scegli “Vai a…” accanto a un’opzione per mandare chi la sceglie a un’altra sezione.</div>';
    }
    if (q.type === "text") {
      h += '<div class="row gap"><label class="field">Lunghezza massima <input class="inp inline num" type="number" min="1" max="200" data-f="maxLength" value="' + (q.maxLength || 30) + '"></label>' +
        '<label class="field">In presentazione mostra come <select class="inp inline" data-f="display"><option value="cloud"' + (q.display !== "list" ? " selected" : "") + '>word cloud</option><option value="list"' + (q.display === "list" ? " selected" : "") + ">elenco</option></select></label></div>";
    }
    if (q.type === "scale" || q.type === "likert") {
      const steps = (q.scale && q.scale.steps) || [];
      if (q.type === "likert") {
        h += '<div class="sub">Affermazioni (righe)</div><div class="rows-ed">' + (q.rows || []).map((r, ri) =>
          '<div class="opt-ed" data-r="' + ri + '"><input class="inp" data-rf="label" value="' + esc(r.label) + '"><button class="icon" data-ra="up"' + (ri === 0 ? " disabled" : "") + ">▲</button>" +
          '<button class="icon" data-ra="down"' + (ri === q.rows.length - 1 ? " disabled" : "") + '>▼</button><button class="icon" data-ra="del">✕</button></div>').join("") +
          '<button class="lnk" data-a="addrow">+ Aggiungi affermazione</button></div>';
      }
      h += '<div class="sub">Scala <select class="inp inline" data-a="preset"><option value="">Scegli un modello…</option>' +
        Object.entries(A.SCALE_PRESETS).map(([k, p]) => '<option value="' + k + '">' + esc(p.label) + "</option>").join("") + "</select></div>" +
        '<div class="steps-ed">' + steps.map((st, i) => '<div class="opt-ed" data-st="' + i + '"><input class="inp num" type="number" data-sf="value" value="' + st.value + '" title="Valore">' +
          '<input class="inp emoji-inp" data-sf="emoji" value="' + esc(st.emoji || "") + '" placeholder="😀" maxlength="8"><input class="inp" data-sf="label" value="' + esc(st.label || "") + '" placeholder="Etichetta (facoltativa)">' +
          '<button class="icon" data-sa="del">✕</button></div>').join("") + '<button class="lnk" data-a="addstep">+ Aggiungi livello</button></div>';
    }
    if (q.type === "number") {
      h += '<div class="row gap"><label class="field">Minimo <input class="inp inline num" type="number" data-f="min" value="' + (q.min != null ? q.min : "") + '"></label>' +
        '<label class="field">Massimo <input class="inp inline num" type="number" data-f="max" value="' + (q.max != null ? q.max : "") + '"></label></div>';
    }
    if (q.type === "qa") h += '<div class="muted small">Il pubblico scrive domande o proposte (max 5 a testa) e vota quelle degli altri. In presentazione le vedi ordinate per voti.</div>';
    if (q.type === "ranking") h += '<div class="muted small">Chi risponde mette le opzioni in ordine; nei risultati vedi la posizione media.</div>';

    h += '<div class="qfoot">' + (q.type !== "qa" ? '<label class="switch"><input type="checkbox" data-f="required"' + (q.required ? " checked" : "") + "> Obbligatoria</label>" : "<span></span>") +
      '<span class="sp"></span>' + (q.image ? "" : '<button class="icon" data-a="qimg" title="Immagine nella domanda">🖼️</button>') +
      (secs.length > 1 ? '<select class="inp inline small" data-a="movesec" title="Sposta in un’altra sezione"><option value="">Sposta in…</option>' + secs.map((x, i) => i === si ? "" : '<option value="' + i + '">Sezione ' + (i + 1) + "</option>").join("") + "</select>" : "") +
      '<button class="icon" data-a="up" title="Su"' + (qi === 0 ? " disabled" : "") + '>▲</button><button class="icon" data-a="down" title="Giù"' + (qi === s.questions.length - 1 ? " disabled" : "") + ">▼</button>" +
      '<button class="icon" data-a="dup" title="Duplica">⧉</button><button class="icon" data-a="del" title="Elimina">🗑</button></div></div>';
    return h;
  }

  function bindQuestion(el, q, s) {
    if (!el) return;
    if (el.classList.contains("closed")) { el.onclick = () => { openQ = q.id; keepScroll(renderQuestions); }; return; }
    const re = () => keepScroll(renderQuestions);
    const qs = s.questions;
    el.querySelectorAll("[data-f]").forEach((i) => {
      const f = i.dataset.f;
      const ev = i.tagName === "SELECT" || i.type === "checkbox" ? "onchange" : "oninput";
      i[ev] = () => {
        if (f === "type") {
          const nq = A.blankQuestion(i.value);
          nq.id = q.id; nq.title = q.title; nq.description = q.description; nq.image = q.image; nq.required = q.required;
          if (T[i.value].options && q.options) nq.options = q.options;
          if ((i.value === "scale" || i.value === "likert") && q.scale) nq.scale = q.scale;
          qs[qs.indexOf(q)] = nq; changed(); re(); return;
        }
        if (i.type === "checkbox") q[f] = i.checked;
        else if (i.type === "number") q[f] = i.value === "" ? null : Number(i.value);
        else q[f] = i.value;
        if (f === "title") autosize(i);
        changed();
      };
      if (f === "title") autosize(i);
    });
    const act = (a, fn) => el.querySelectorAll('[data-a="' + a + '"]').forEach((b) => (b.tagName === "SELECT" ? (b.onchange = () => fn(b)) : (b.onclick = () => fn(b))));
    const qi = () => qs.indexOf(q);
    act("up", () => { move(qs, qi(), -1); changed(); re(); });
    act("down", () => { move(qs, qi(), 1); changed(); re(); });
    act("dup", () => {
      const c = A.clone(q); c.id = A.newId("q"); (c.options || []).forEach((o) => (o.id = A.newId("o"))); (c.rows || []).forEach((r) => (r.id = A.newId("r")));
      qs.splice(qi() + 1, 0, c); openQ = c.id; changed(); re();
    });
    act("del", () => { if (!window.confirm("Eliminare questa domanda?")) return; qs.splice(qi(), 1); changed(); re(); });
    act("qimg", async () => { const u = await pickImage(form.id); if (u) { q.image = u; changed(); re(); } });
    act("qimgdel", () => { q.image = null; changed(); re(); });
    act("movesec", (b) => { if (b.value === "") return; qs.splice(qi(), 1); form.content.sections[Number(b.value)].questions.push(q); changed(); re(); });
    // opzioni
    el.querySelectorAll("[data-o]").forEach((row) => {
      const o = q.options[Number(row.dataset.o)], oi = Number(row.dataset.o);
      row.querySelectorAll("[data-of]").forEach((i) => (i[i.tagName === "SELECT" ? "onchange" : "oninput"] = () => { o[i.dataset.of] = i.value || (i.dataset.of === "goTo" ? null : ""); changed(); }));
      row.querySelectorAll("[data-oa]").forEach((b) => (b.onclick = async () => {
        const a = b.dataset.oa;
        if (a === "up") move(q.options, oi, -1);
        else if (a === "down") move(q.options, oi, 1);
        else if (a === "del") { if (q.options.length <= 1) return A.toast("Serve almeno un’opzione"); q.options.splice(oi, 1); }
        else if (a === "img") { const u = await pickImage(form.id); if (!u) return; o.image = u; }
        else if (a === "imgdel") o.image = null;
        changed(); re();
      }));
    });
    act("addopt", () => {
      q.options.push({ id: A.newId("o"), label: "Opzione " + (q.options.length + 1), image: null, emoji: "" }); changed(); re();
      const ins = el.ownerDocument.querySelectorAll('[data-q="' + q.id + '"] [data-of="label"]'); const last = ins[ins.length - 1]; if (last) { last.focus(); last.select(); }
    });
    act("bulk", () => {
      const txt = window.prompt("Incolla le opzioni, una per riga (verranno aggiunte in fondo):"); if (!txt) return;
      const lines = txt.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
      // se ci sono solo le opzioni di esempio, sostituiscile
      if (q.options.every((o) => /^Opzione \d+$/.test(o.label) && !o.image)) q.options = [];
      lines.forEach((l) => q.options.push({ id: A.newId("o"), label: l, image: null, emoji: "" }));
      changed(); re();
    });
    // righe likert
    el.querySelectorAll("[data-r]").forEach((row) => {
      const ri = Number(row.dataset.r), r = q.rows[ri];
      row.querySelector('[data-rf="label"]').oninput = (e) => { r.label = e.target.value; changed(); };
      row.querySelectorAll("[data-ra]").forEach((b) => (b.onclick = () => {
        if (b.dataset.ra === "up") move(q.rows, ri, -1); else if (b.dataset.ra === "down") move(q.rows, ri, 1);
        else { if (q.rows.length <= 1) return; q.rows.splice(ri, 1); }
        changed(); re();
      }));
    });
    act("addrow", () => { q.rows.push({ id: A.newId("r"), label: "Affermazione " + (q.rows.length + 1) }); changed(); re(); });
    // livelli della scala
    act("preset", (b) => { if (!b.value) return; q.scale = { preset: b.value, steps: A.clone(A.SCALE_PRESETS[b.value].steps) }; changed(); re(); });
    el.querySelectorAll("[data-st]").forEach((row) => {
      const st = q.scale.steps[Number(row.dataset.st)];
      row.querySelectorAll("[data-sf]").forEach((i) => (i.oninput = () => { st[i.dataset.sf] = i.dataset.sf === "value" ? Number(i.value) : i.value; q.scale.preset = "custom"; changed(); }));
      row.querySelector('[data-sa="del"]').onclick = () => { if (q.scale.steps.length <= 2) return A.toast("Servono almeno 2 livelli"); q.scale.steps.splice(Number(row.dataset.st), 1); changed(); re(); };
    });
    act("addstep", () => {
      const st = q.scale.steps, last = st[st.length - 1];
      st.push({ value: last ? Number(last.value) + 1 : 1, emoji: "", label: "" }); q.scale.preset = "custom"; changed(); re();
    });
  }
  function autosize(t) { if (t.tagName !== "TEXTAREA") return; t.style.height = "auto"; t.style.height = t.scrollHeight + 2 + "px"; }

  // ----- scheda Risposte -----
  async function renderResponses() {
    const el = document.getElementById("tab");
    el.innerHTML = '<div class="card row gap"><div id="counts" class="muted">Caricamento…</div><span class="sp"></span><button class="pbtn" id="ref">Aggiorna</button>' +
      '<button class="pbtn" id="csv">Scarica CSV</button><button class="pbtn" id="csvqa">CSV Q&amp;A</button></div><div id="res"></div>';
    let res = null;
    const load = async () => {
      try { res = await A.rpc("a_results", { p_id: form.id, p_qid: null }, 30000); } catch (e) { document.getElementById("counts").textContent = e.message; return; }
      document.getElementById("counts").innerHTML = "<b>" + res.done + "</b> completate · " + res.started + " iniziate";
      const box = document.getElementById("res"); box.innerHTML = "";
      const hidden = (res.state && res.state.hidden) || {};
      A.flatQuestions(form.content).forEach(({ q }, i) => {
        const card = document.createElement("div"); card.className = "card res-card";
        const rows = res.responses.filter((r) => r.q === q.id).map((r) => ({ s: r.s, v: r.v }));
        const data = { rows, qa: res.qa.filter((x) => x.q === q.id) };
        card.innerHTML = '<div class="res-h"><b>' + (i + 1) + ". " + esc(q.title || "(senza titolo)") + '</b><span class="muted small">' + R.count(q, data) + " risposte</span></div><div class=\"res-b\"></div>";
        box.appendChild(card);
        R.render(card.querySelector(".res-b"), q, data, { hidden: hidden[q.id] || [], textMode: q.type === "text" ? "list" : undefined });
      });
    };
    document.getElementById("ref").onclick = load;
    const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    const slug = () => (form.title || "modulo").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
    document.getElementById("csv").onclick = async () => { await load(); if (res) R.download(slug() + "_" + stamp() + ".csv", R.csv(form, res)); };
    document.getElementById("csvqa").onclick = async () => { await load(); if (res) R.download(slug() + "_qa_" + stamp() + ".csv", R.csvQa(form, res)); };
    load();
  }

  // ----- scheda Impostazioni -----
  async function renderSettings() {
    const st = form.settings, el = document.getElementById("tab");
    let live = null; try { live = await A.rpc("a_results", { p_id: form.id, p_qid: "__none__" }); } catch (_) {}
    const open = live ? live.state.open !== false : true;
    el.innerHTML = '<div class="card"><h3>Modalità</h3>' +
      '<label class="radio"><input type="radio" name="mode" value="free"' + (st.mode !== "guided" ? " checked" : "") + '><span><b>Libera</b> — come Microsoft Forms: ognuno compila al suo ritmo, sezione dopo sezione, con le ramificazioni. In presentazione vedi i risultati dal vivo.</span></label>' +
      '<label class="radio"><input type="radio" name="mode" value="guided"' + (st.mode === "guided" ? " checked" : "") + '><span><b>Guidata</b> — come Slido/Mentimeter: dalla presentazione apri tu una sezione alla volta e i telefoni la mostrano da soli. (Le ramificazioni qui non si usano.)</span></label></div>' +
      '<div class="card"><h3>Risposte</h3><label class="switch"><input type="checkbox" id="open"' + (open ? " checked" : "") + "> Accetta risposte</label>" +
      '<label class="switch"><input type="checkbox" id="allowEdit"' + (st.allowEdit !== false ? " checked" : "") + "> Si possono modificare le risposte dopo l’invio</label>" +
      '<label class="switch"><input type="checkbox" id="allowMultiple"' + (st.allowMultiple ? " checked" : "") + "> Più risposte dallo stesso dispositivo (es. un tablet all’ingresso)</label>" +
      '<label class="switch"><input type="checkbox" id="hideProgress"' + (st.hideProgress ? " checked" : "") + "> Nascondi la barra di avanzamento</label>" +
      '<label class="field block">Messaggio finale<input class="inp" id="thanks" value="' + esc(st.thanks || "") + '" placeholder="Grazie! Le tue risposte sono state inviate."></label></div>' +
      '<div class="card"><h3>Link</h3><p>Codice: <b class="code-big">' + esc(form.code) + '</b></p><div class="share-row"><input class="inp" readonly value="' + esc(A.participantUrl(form.code)) + '"><button class="pbtn" id="cpy">Copia</button></div></div>' +
      '<div class="card danger-zone"><h3>Azzera</h3><p class="muted">Cancella tutte le risposte (es. dopo la prova generale). Il modulo resta com’è.</p><button class="pbtn danger" id="reset">Azzera le risposte</button></div>';
    el.querySelectorAll('[name="mode"]').forEach((r) => (r.onchange = () => {
      st.mode = r.value; changed();
      if (st.mode === "guided") A.rpc("a_set_state", { p_id: form.id, p_patch: { active_section: null } }).catch(() => {});
    }));
    ["allowEdit", "allowMultiple", "hideProgress"].forEach((k) => (document.getElementById(k).onchange = (e) => { st[k] = e.target.checked; changed(); }));
    document.getElementById("thanks").oninput = (e) => { st.thanks = e.target.value; changed(); };
    document.getElementById("open").onchange = async (e) => {
      try { await A.rpc("a_set_state", { p_id: form.id, p_patch: { open: e.target.checked } }); A.toast(e.target.checked ? "Il modulo accetta risposte" : "Modulo chiuso"); }
      catch (err) { A.toast(err.message); e.target.checked = !e.target.checked; }
    };
    document.getElementById("cpy").onclick = () => copy(A.participantUrl(form.code));
    document.getElementById("reset").onclick = async () => {
      if (window.prompt("Scrivi AZZERA per cancellare tutte le risposte di questo modulo:") !== "AZZERA") return;
      try { await A.rpc("a_reset", { p_id: form.id }); A.toast("Risposte azzerate"); } catch (e) { A.toast(e.message); }
    };
  }

  boot();
})();
