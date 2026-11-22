// ============================================================
//  Stress test: crea un modulo di prova, simula N persone in modalità guidata,
//  controlla che tutte le risposte arrivino e poi CANCELLA il modulo di prova.
//  Uso (Node 18+):
//    node stress-test.mjs https://XXXX.supabase.co CHIAVE_PUBBLICA tua@email.it TUA_PASSWORD [persone=200] [secondi_per_sezione=20]
// ============================================================
const [, , URL_ARG, KEY, EMAIL, PASSWORD, N_ARG = "200", SECS_ARG = "20"] = process.argv;
if (!URL_ARG || !KEY || !EMAIL || !PASSWORD) {
  console.log("Uso: node stress-test.mjs <SUPABASE_URL> <CHIAVE_PUBBLICA> <email> <password> [persone=200] [secondi_per_sezione=20]");
  process.exit(1);
}
const BASE = URL_ARG.replace(/\/+$/, ""), N = Number(N_ARG), SECS = Number(SECS_ARG), POLL = 3500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const stats = { lat: [], errors: {} };
let token = null;

async function call(fn, args, admin) {
  const h = { apikey: KEY, "Content-Type": "application/json" };
  if (admin) h.Authorization = "Bearer " + token; else if (!KEY.startsWith("sb_")) h.Authorization = "Bearer " + KEY;
  const t0 = performance.now();
  try {
    const r = await fetch(BASE + "/rest/v1/rpc/" + fn, { method: "POST", headers: h, body: JSON.stringify(args), signal: AbortSignal.timeout(12000) });
    const txt = await r.text();
    if (!admin) stats.lat.push(performance.now() - t0);
    if (!r.ok) { const k = fn + " " + r.status + " " + txt.slice(0, 80); stats.errors[k] = (stats.errors[k] || 0) + 1; return undefined; }
    return txt ? JSON.parse(txt) : null;
  } catch (e) { const k = fn + " " + e.name; stats.errors[k] = (stats.errors[k] || 0) + 1; return undefined; }
}
const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]); };

const sections = [
  { id: "s1", title: "Check-in", questions: [
    { id: "q1", type: "dropdown", title: "Regione", options: ["a", "b", "c"].map((x) => ({ id: x, label: x })) },
    { id: "q2", type: "text", title: "Parola" },
    { id: "q3", type: "choice", title: "Animale", options: ["l", "g", "t"].map((x) => ({ id: x, label: x })) } ] },
  { id: "s2", title: "F2F", questions: [{ id: "q4", type: "scale", title: "Direzione", scale: { steps: [0, 1, 2, 3, 4, 5].map((v) => ({ value: v })) } }] },
  { id: "s3", title: "Q&A", questions: [{ id: "q5", type: "qa", title: "Domande" }] },
];
function answersFor(sec) {
  const a = {};
  sec.questions.forEach((q) => {
    if (q.type === "dropdown" || q.type === "choice") a[q.id] = pick(q.options).id;
    if (q.type === "text") a[q.id] = pick(["curiosə", "stanca", "carico", "speranza", "energia"]);
    if (q.type === "scale") a[q.id] = Math.floor(Math.random() * 6);
  });
  return a;
}

let running = true, code = null;
async function person(i) {
  const sid = "stress-" + i + "-" + Math.random().toString(36).slice(2, 10);
  const done = new Set();
  await sleep(Math.random() * POLL);
  while (running) {
    const s = await call("f_state", { p_code: code });
    const act = s && s.active_section;
    if (act && !done.has(act)) {
      done.add(act);
      const sec = sections.find((x) => x.id === act);
      (async () => {
        await sleep(1000 + Math.random() * 8000);
        if (sec.questions[0].type === "qa") {
          if (i % 4 === 0) await call("qa_ask", { p_code: code, p_sid: sid, p_qid: "q5", p_text: "Domanda di prova " + i });
          const list = await call("qa_list", { p_code: code, p_qid: "q5", p_sid: sid });
          if (list && list.length) await call("qa_vote", { p_code: code, p_sid: sid, p_item: pick(list).id, p_on: true });
        } else {
          await call("f_submit", { p_code: code, p_sid: sid, p_answers: answersFor(sec), p_done: true });
        }
      })();
    }
    await sleep(POLL + Math.random() * 1000);
  }
}

(async () => {
  const r = await fetch(BASE + "/auth/v1/token?grant_type=password", { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) });
  const j = await r.json();
  if (!j.access_token) { console.log("Login non riuscito:", j.error_description || j.msg || JSON.stringify(j)); process.exit(1); }
  token = j.access_token;
  const created = await call("a_create", { p_title: "STRESS TEST (si cancella da solo)", p_description: "", p_theme: {}, p_settings: { mode: "guided" }, p_content: { sections } }, true);
  if (!created) { console.log("Non riesco a creare il modulo di prova:", stats.errors); process.exit(1); }
  code = created.code;
  console.log(`Modulo di prova creato (codice ${code}). ${N} persone simulate, ${SECS}s per sezione.\n`);
  const people = Array.from({ length: N }, (_, i) => person(i));
  await sleep(4000);
  try {
    for (const sec of sections) {
      await call("a_set_state", { p_id: created.id, p_patch: { active_section: sec.id } }, true);
      const t = Date.now();
      let res;
      while (Date.now() - t < SECS * 1000) { res = await call("a_results", { p_id: created.id, p_qid: sec.questions[0].id }, true); await sleep(2000); }
      res = await call("a_results", { p_id: created.id, p_qid: sec.questions[0].id }, true);
      const got = sec.questions[0].type === "qa" ? (res ? res.qa.length + " domande, " + res.qa.reduce((a, b) => a + Number(b.votes), 0) + " voti" : "?")
                                                  : (res ? res.responses.length + " / " + N : "?");
      console.log(`Sezione ${sec.title.padEnd(9)} → ${got}   (p95 finora: ${pct(stats.lat, 95)} ms)`);
    }
  } finally {
    running = false;
    await Promise.race([Promise.all(people), sleep(6000)]);
    await call("a_delete", { p_id: created.id }, true);
    console.log("\nModulo di prova cancellato.");
  }
  const errs = Object.values(stats.errors).reduce((a, b) => a + b, 0);
  console.log(`Richieste dei partecipanti: ${stats.lat.length} · mediana ${pct(stats.lat, 50)} ms · p95 ${pct(stats.lat, 95)} ms · peggiore ${pct(stats.lat, 100)} ms`);
  console.log(errs ? "⚠️ Errori: " + JSON.stringify(stats.errors, null, 1) + "\nMandami questo output." : "✅ Nessun errore.");
})();
