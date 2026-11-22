// Funzioni condivise da tutte le pagine
(function () {
  const cfg = window.APP_CONFIG;
  const SB = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });

  const ERRORS = {
    closed: "Questa parte non accetta risposte in questo momento.",
    not_found: "Modulo non trovato. Controlla il codice.",
    bad_question: "Domanda non valida (il modulo potrebbe essere stato modificato: ricarica la pagina).",
    too_long: "Risposta troppo lunga.",
    limit: "Hai raggiunto il numero massimo di domande inviabili.",
    forbidden: "Non hai i permessi per questo modulo (rifai il login).",
    too_big: "Il modulo è troppo grande (troppe immagini o testo?).",
    bad_session: "Sessione non valida: ricarica la pagina.",
  };

  function mkErr(e) {
    const raw = (e && (e.message || e.error_description || e.msg)) || String(e);
    const key = Object.keys(ERRORS).find((k) => raw === k || raw.includes(k));
    const err = new Error(key ? ERRORS[key] : raw);
    err.code = key || "unknown";
    err.raw = raw;
    return err;
  }

  async function rpc(fn, args, timeoutMs) {
    let timer;
    const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(mkErr("Timeout: connessione lenta")), timeoutMs || 12000); });
    try {
      const { data, error } = await Promise.race([SB.rpc(fn, args || {}), timeout]);
      if (error) throw mkErr(error);
      return data;
    } catch (e) {
      throw e.code ? e : mkErr(e);
    } finally { clearTimeout(timer); }
  }

  async function rpcRetry(fn, args, tries) {
    let last;
    for (let i = 0; i < (tries || 4); i++) {
      try { return await rpc(fn, args); } catch (e) {
        last = e;
        if (e.code !== "unknown") throw e; // errori "veri": inutile riprovare
        await sleep(500 * (i + 1) + Math.random() * 500);
      }
    }
    throw last;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const normWord = (w) => String(w || "").toLowerCase().normalize("NFC")
    .replace(/[.,;:!?¡¿"“”«»()\[\]{}]/g, "").replace(/\s+/g, " ").trim();
  const newId = (p) => (p || "x") + Math.random().toString(36).slice(2, 9);

  // ---------- Tipi di domanda ----------
  const TYPES = {
    choice:   { label: "Scelta singola",   icon: "◉", options: true },
    multi:    { label: "Scelta multipla",  icon: "☑", options: true },
    dropdown: { label: "Elenco a discesa", icon: "▾", options: true },
    text:     { label: "Testo breve / word cloud", icon: "☁" },
    longtext: { label: "Testo lungo",      icon: "¶" },
    scale:    { label: "Scala (emoji, stelle, fist-to-five)", icon: "✋" },
    likert:   { label: "Likert (più affermazioni)", icon: "▤" },
    ranking:  { label: "Classifica",       icon: "⇅", options: true },
    qa:       { label: "Q&A con voti",     icon: "?" },
    date:     { label: "Data",             icon: "📅" },
    number:   { label: "Numero",           icon: "#" },
  };

  const SCALE_PRESETS = {
    fist5: { label: "Fist-to-five (0–5)", steps: [
      { value: 0, emoji: "✊", label: "Per niente d’accordo" }, { value: 1, emoji: "☝️", label: "" },
      { value: 2, emoji: "✌️", label: "" }, { value: 3, emoji: "🤟", label: "" },
      { value: 4, emoji: "🖖", label: "" }, { value: 5, emoji: "🖐️", label: "Completamente d’accordo" }] },
    stars5: { label: "Stelle (1–5)", steps: [1, 2, 3, 4, 5].map((v) => ({ value: v, emoji: "⭐", label: "" })) },
    faces5: { label: "Faccine (1–5)", steps: [
      { value: 1, emoji: "😞", label: "" }, { value: 2, emoji: "🙁", label: "" }, { value: 3, emoji: "😐", label: "" },
      { value: 4, emoji: "🙂", label: "" }, { value: 5, emoji: "😄", label: "" }] },
    num10: { label: "Numeri (1–10)", steps: Array.from({ length: 10 }, (_, i) => ({ value: i + 1, emoji: "", label: i === 0 ? "Per niente" : i === 9 ? "Moltissimo" : "" })) },
    agree5: { label: "Accordo (1–5)", steps: [
      { value: 1, emoji: "", label: "Per niente d’accordo" }, { value: 2, emoji: "", label: "Poco d’accordo" },
      { value: 3, emoji: "", label: "Né d’accordo né in disaccordo" }, { value: 4, emoji: "", label: "D’accordo" },
      { value: 5, emoji: "", label: "Completamente d’accordo" }] },
  };
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function blankQuestion(type) {
    const q = { id: newId("q"), type, title: "", description: "", image: null, required: false };
    if (TYPES[type].options) q.options = [1, 2, 3].map((i) => ({ id: newId("o"), label: "Opzione " + i, image: null, emoji: "" }));
    if (type === "scale") { q.scale = { preset: "fist5", steps: clone(SCALE_PRESETS.fist5.steps) }; }
    if (type === "likert") {
      q.rows = [{ id: newId("r"), label: "Affermazione 1" }, { id: newId("r"), label: "Affermazione 2" }];
      q.scale = { preset: "agree5", steps: clone(SCALE_PRESETS.agree5.steps) };
    }
    if (type === "text") { q.maxLength = 30; q.display = "cloud"; }
    if (type === "multi") q.maxChoices = 0;
    if (type === "number") { q.min = null; q.max = null; }
    return q;
  }

  function flatQuestions(content) {
    const out = [];
    ((content && content.sections) || []).forEach((s, si) => (s.questions || []).forEach((q, qi) => out.push({ q, s, si, qi })));
    return out;
  }

  // ---------- Immagini: ridimensiona e carica su Supabase Storage ----------
  async function resizeImage(file, maxSide) {
    if (file.type === "image/gif") return file; // le gif animate restano com'erano
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const scale = Math.min(1, (maxSide || 1200) / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const hasAlpha = file.type === "image/png" || file.type === "image/webp";
      const type = hasAlpha ? "image/webp" : "image/jpeg";
      return await new Promise((res) => c.toBlob((b) => res(b || file), type, 0.85));
    } finally { URL.revokeObjectURL(url); }
  }

  async function uploadImage(file, folder) {
    if (!file || !/^image\//.test(file.type)) throw new Error("Scegli un'immagine (jpg, png, webp, gif).");
    const { data: { user } } = await SB.auth.getUser();
    if (!user) throw new Error("Rifai il login per caricare immagini.");
    const blob = await resizeImage(file, 1200);
    const ext = blob.type === "image/webp" ? "webp" : blob.type === "image/gif" ? "gif" : blob.type === "image/png" ? "png" : "jpg";
    const path = user.id + "/" + (folder || "misc") + "/" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + "." + ext;
    const { error } = await SB.storage.from("media").upload(path, blob, { contentType: blob.type, upsert: false, cacheControl: "31536000" });
    if (error) throw new Error("Caricamento non riuscito: " + error.message);
    return SB.storage.from("media").getPublicUrl(path).data.publicUrl;
  }

  // ---------- Link e QR ----------
  function baseUrl() { return new URL("./", location.href).href; }
  function participantUrl(code) { return baseUrl() + "?f=" + code; }
  function qrSvg(text) {
    if (typeof window.qrcode !== "function") return "";
    const qr = window.qrcode(0, "M"); qr.addData(text); qr.make();
    return qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
  }

  function applyTheme(theme) {
    const c = (theme && theme.color) || cfg.DEFAULT_COLOR;
    document.documentElement.style.setProperty("--accent", c);
    document.documentElement.style.setProperty("--accent-soft", c + "1a");
  }

  function toast(msg, ms) {
    let t = document.getElementById("toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), ms || 2600);
  }

  // identità anonima del dispositivo (per modulo)
  function storage() { try { const s = window.localStorage; s.setItem("__t", "1"); s.removeItem("__t"); return s; } catch (_) { return null; } }
  const mem = {};
  const store = {
    get(k) { const s = storage(); try { return s ? s.getItem(k) : (k in mem ? mem[k] : null); } catch (_) { return mem[k] || null; } },
    set(k, v) { const s = storage(); try { s ? s.setItem(k, v) : (mem[k] = v); } catch (_) { mem[k] = v; } },
    del(k) { const s = storage(); try { s ? s.removeItem(k) : delete mem[k]; } catch (_) { delete mem[k]; } },
  };
  function randomId() {
    return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 14);
  }

  window.APP = { cfg, SB, rpc, rpcRetry, mkErr, sleep, esc, normWord, newId, clone, TYPES, SCALE_PRESETS, blankQuestion,
    flatQuestions, uploadImage, participantUrl, baseUrl, qrSvg, applyTheme, toast, store, randomId };
})();
