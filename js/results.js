// Calcolo e disegno dei risultati (usato da presentazione e scheda "Risposte")
(function () {
  const { esc, normWord } = window.APP;

  function optLabel(o) { return (o.emoji ? o.emoji + " " : "") + (o.label || ""); }
  function thumb(o) {
    if (o.image) return '<img class="r-thumb" src="' + esc(o.image) + '" alt="">';
    if (o.emoji) return '<span class="r-emoji">' + esc(o.emoji) + "</span>";
    return "";
  }
  const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
  const fmt = (x) => (Math.round(x * 10) / 10).toString().replace(".", ",");
  const empty = (t) => '<div class="r-empty">' + esc(t || "In attesa delle prime risposte…") + "</div>";

  function bars(items, total) {
    const max = Math.max(1, ...items.map((i) => i.n));
    return '<div class="r-bars">' + items.map((i) =>
      '<div class="r-bar">' + (i.thumb ? '<div class="r-bar-th">' + i.thumb + "</div>" : "") +
      '<div class="r-bar-mid"><div class="r-bar-lab">' + esc(i.label) + '</div><div class="r-track"><div class="r-fill" style="width:' + (i.n / max) * 100 + '%"></div></div></div>' +
      '<div class="r-bar-n">' + i.n + (total != null ? " <small>" + pct(i.n, total) + "%</small>" : "") + "</div></div>").join("") + "</div>";
  }

  function choice(q, rows) {
    const c = {};
    rows.forEach((r) => [].concat(r.v).forEach((id) => (c[id] = (c[id] || 0) + 1)));
    if (!rows.length) return empty();
    const hasImg = (q.options || []).some((o) => o.image);
    if (hasImg) {
      const max = Math.max(1, ...q.options.map((o) => c[o.id] || 0));
      return '<div class="r-imgs">' + q.options.map((o) => {
        const n = c[o.id] || 0;
        return '<div class="r-imgcard">' + (o.image ? '<img src="' + esc(o.image) + '" alt="">' : '<div class="r-imgph">' + esc(o.emoji || "") + "</div>") +
          '<div class="r-imgcap">' + esc(optLabel(o)) + '</div><div class="r-track"><div class="r-fill" style="width:' + (n / max) * 100 + '%"></div></div>' +
          '<div class="r-bar-n">' + n + " <small>" + pct(n, rows.length) + "%</small></div></div>";
      }).join("") + "</div>";
    }
    return bars(q.options.map((o) => ({ label: o.label, thumb: thumb(o), n: c[o.id] || 0 })), rows.length);
  }

  function textCloud(q, rows, opts) {
    const hid = new Set(opts.hidden || []), counts = {}, disp = {};
    rows.forEach((r) => {
      const raw = String(r.v || "").trim(), k = normWord(raw);
      if (!k || hid.has(k)) return;
      counts[k] = (counts[k] || 0) + 1;
      disp[k] = disp[k] || {}; disp[k][raw] = (disp[k][raw] || 0) + 1;
    });
    const words = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    if (!words.length) return empty("Le parole appariranno qui…");
    const label = (w) => Object.entries(disp[w]).sort((a, b) => b[1] - a[1])[0][0];
    if (opts.textMode === "list") {
      return '<div class="r-list">' + words.map((w) => '<div class="r-li" data-hide="' + esc(w) + '"><span>' + esc(label(w)) + "</span><b>" + counts[w] + "</b></div>").join("") + "</div>";
    }
    const top = words.slice(0, 90), max = counts[top[0]], min = counts[top[top.length - 1]];
    const arranged = []; top.forEach((w, i) => (i % 2 ? arranged.push(w) : arranged.unshift(w)));
    const big = opts.big ? 1 : 0.62;
    return '<div class="r-cloud">' + arranged.map((w, i) => {
      const t = max === min ? 1 : (counts[w] - min) / (max - min);
      const size = Math.round((18 + Math.sqrt(t) * (top.length < 12 ? 72 : 54)) * big);
      return '<span data-hide="' + esc(w) + '" title="' + counts[w] + '" class="c' + (i % 4) + '" style="font-size:' + size + 'px">' + esc(label(w)) + "</span>";
    }).join("") + "</div>";
  }

  function longText(q, rows, opts) {
    const hid = new Set(opts.hidden || []);
    const list = rows.filter((r) => !hid.has(normWord(r.v))).slice().reverse();
    if (!list.length) return empty();
    return '<div class="r-cards">' + list.map((r) => '<div class="r-card" data-hide="' + esc(normWord(r.v)) + '">' + esc(r.v) + "</div>").join("") + "</div>";
  }

  function stepsOf(q) { return (q.scale && q.scale.steps) || []; }

  function scale(q, rows) {
    const steps = stepsOf(q), c = {};
    let sum = 0, n = 0;
    rows.forEach((r) => { const v = Number(r.v); if (!isNaN(v)) { c[v] = (c[v] || 0) + 1; sum += v; n++; } });
    if (!n) return empty();
    const max = Math.max(1, ...steps.map((s) => c[s.value] || 0));
    const lo = steps.length ? steps[0].value : 0, hi = steps.length ? steps[steps.length - 1].value : 5;
    return '<div class="r-scale-wrap"><div class="r-avg">Media <b>' + fmt(sum / n) + "</b> <small>(da " + lo + " a " + hi + ", " + n + " risposte)</small></div>" +
      '<div class="r-scale" style="grid-template-columns:repeat(' + steps.length + ',1fr)">' + steps.map((s) => {
        const k = c[s.value] || 0;
        return '<div class="r-col"><div class="r-col-n">' + k + '</div><div class="r-stick" style="height:' + Math.max(2, (k / max) * 100) + '%"></div>' +
          '<div class="r-col-em">' + esc(s.emoji || String(s.value)) + '</div><div class="r-col-lab">' + (s.emoji ? "<b>" + s.value + "</b> " : "") + esc(s.label || "") + "</div></div>";
      }).join("") + "</div></div>";
  }

  function likert(q, rows) {
    const steps = stepsOf(q);
    if (!rows.length) return empty();
    const legend = '<div class="r-legend">' + steps.map((s, i) =>
      '<span><i style="background:' + shade(i, steps.length) + '"></i>' + esc((s.emoji ? s.emoji + " " : "") + (s.label || s.value)) + "</span>").join("") + "</div>";
    return legend + '<div class="r-likert">' + (q.rows || []).map((row) => {
      const c = {}; let sum = 0, n = 0;
      rows.forEach((r) => { const v = r.v && r.v[row.id]; if (v != null && v !== "") { c[v] = (c[v] || 0) + 1; sum += Number(v); n++; } });
      const segs = steps.map((s, i) => { const k = c[s.value] || 0; return k ? '<div class="r-seg" style="flex:' + k + ";background:" + shade(i, steps.length) + '" title="' + k + '">' + (pct(k, n) >= 8 ? pct(k, n) + "%" : "") + "</div>" : ""; }).join("");
      return '<div class="r-lrow"><div class="r-lrow-lab">' + esc(row.label) + (n ? ' <small>media ' + fmt(sum / n) + " · " + n + "</small>" : "") + '</div><div class="r-stack">' + (segs || '<div class="r-seg r-seg-empty"></div>') + "</div></div>";
    }).join("") + "</div>";
  }
  function shade(i, n) {
    const p = n <= 1 ? 100 : Math.round(25 + (75 * i) / (n - 1));
    return "color-mix(in srgb, var(--accent) " + p + "%, #ffffff)";
  }

  function ranking(q, rows) {
    if (!rows.length) return empty();
    const opts = q.options || [], score = {}, cnt = {};
    rows.forEach((r) => (Array.isArray(r.v) ? r.v : []).forEach((id, i) => { score[id] = (score[id] || 0) + i + 1; cnt[id] = (cnt[id] || 0) + 1; }));
    const list = opts.map((o) => ({ o, avg: cnt[o.id] ? score[o.id] / cnt[o.id] : Infinity })).sort((a, b) => a.avg - b.avg);
    const worst = opts.length;
    return '<div class="r-bars">' + list.map((x, i) =>
      '<div class="r-bar"><div class="r-rank">' + (i + 1) + "°</div>" + (thumb(x.o) ? '<div class="r-bar-th">' + thumb(x.o) + "</div>" : "") +
      '<div class="r-bar-mid"><div class="r-bar-lab">' + esc(x.o.label) + '</div><div class="r-track"><div class="r-fill" style="width:' +
      (isFinite(x.avg) ? ((worst - x.avg + 1) / worst) * 100 : 0) + '%"></div></div></div><div class="r-bar-n"><small>posizione media</small> ' + (isFinite(x.avg) ? fmt(x.avg) : "–") + "</div></div>").join("") + "</div>";
  }

  function numberRes(q, rows) {
    const vals = rows.map((r) => Number(r.v)).filter((v) => !isNaN(v));
    if (!vals.length) return empty();
    const sum = vals.reduce((a, b) => a + b, 0), c = {};
    vals.forEach((v) => (c[v] = (c[v] || 0) + 1));
    return '<div class="r-avg">Media <b>' + fmt(sum / vals.length) + "</b> <small>min " + Math.min(...vals) + " · max " + Math.max(...vals) + " · " + vals.length + " risposte</small></div>" +
      '<div class="r-chips">' + Object.keys(c).map(Number).sort((a, b) => a - b).map((v) => "<span>" + v + (c[v] > 1 ? " ×" + c[v] : "") + "</span>").join("") + "</div>";
  }

  function dateRes(q, rows) {
    const c = {};
    rows.forEach((r) => { if (r.v) c[r.v] = (c[r.v] || 0) + 1; });
    const keys = Object.keys(c).sort();
    if (!keys.length) return empty();
    const nice = (d) => { const [y, m, g] = d.split("-"); return g + "/" + m + "/" + y; };
    return bars(keys.map((k) => ({ label: nice(k), n: c[k] })), rows.length);
  }

  function qa(q, items, opts) {
    const list = (items || []).filter((i) => !i.hidden).sort((a, b) => (a.answered - b.answered) || (b.votes - a.votes) || (a.t < b.t ? -1 : 1));
    if (!list.length) return empty("Le domande del pubblico appariranno qui…");
    return '<div class="r-qa">' + list.map((i) =>
      '<div class="r-qa-item' + (i.answered ? " done" : "") + '"><div class="r-qa-votes">▲ ' + i.votes + '</div><div class="r-qa-body">' + esc(i.body) + "</div>" +
      (opts.onQa ? '<div class="r-qa-act"><button data-qa="answered" data-id="' + i.id + '" title="Segna come risposta">' + (i.answered ? "↺" : "✓") + '</button><button data-qa="hide" data-id="' + i.id + '" title="Nascondi">✕</button></div>' : "") +
      "</div>").join("") + "</div>";
  }

  function render(el, q, data, opts) {
    opts = opts || {};
    const rows = (data && data.rows) || [];
    let html;
    switch (q.type) {
      case "choice": case "multi": case "dropdown": html = choice(q, rows); break;
      case "text": html = textCloud(q, rows, Object.assign({ textMode: q.display === "list" ? "list" : "cloud" }, opts)); break;
      case "longtext": html = longText(q, rows, opts); break;
      case "scale": html = scale(q, rows); break;
      case "likert": html = likert(q, rows); break;
      case "ranking": html = ranking(q, rows); break;
      case "number": html = numberRes(q, rows); break;
      case "date": html = dateRes(q, rows); break;
      case "qa": html = qa(q, data && data.qa, opts); break;
      default: html = empty("Tipo non supportato");
    }
    el.innerHTML = html;
    if (opts.onHide) el.querySelectorAll("[data-hide]").forEach((n) => { n.classList.add("hideable"); n.onclick = () => opts.onHide(n.dataset.hide); });
    if (opts.onQa) el.querySelectorAll("[data-qa]").forEach((b) => (b.onclick = () => opts.onQa(Number(b.dataset.id), b.dataset.qa)));
  }

  function count(q, data) {
    if (q.type === "qa") return ((data && data.qa) || []).filter((i) => !i.hidden).length;
    return ((data && data.rows) || []).length;
  }

  // ---------- CSV: una riga per partecipante, una colonna per domanda ----------
  function csvCell(c) { return '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"'; }
  function answerText(q, v) {
    if (v == null) return "";
    const byId = {}; (q.options || []).forEach((o) => (byId[o.id] = o.label));
    switch (q.type) {
      case "choice": case "dropdown": return byId[v] != null ? byId[v] : v;
      case "multi": return [].concat(v).map((id) => byId[id] != null ? byId[id] : id).join(" | ");
      case "ranking": return [].concat(v).map((id, i) => (i + 1) + ". " + (byId[id] != null ? byId[id] : id)).join(" | ");
      default: return typeof v === "object" ? JSON.stringify(v) : v;
    }
  }
  function csv(form, res) {
    const flat = window.APP.flatQuestions(form.content).map((x) => x.q).filter((q) => q.type !== "qa");
    const cols = [];
    flat.forEach((q) => {
      if (q.type === "likert") (q.rows || []).forEach((r) => cols.push({ q, row: r, title: (q.title || "Domanda") + " — " + r.label }));
      else cols.push({ q, title: q.title || "Domanda" });
    });
    const bySession = new Map();
    (res.responses || []).forEach((r) => {
      if (!bySession.has(r.s)) bySession.set(r.s, { first: r.t, a: {} });
      const s = bySession.get(r.s); s.a[r.q] = r.v; if (r.t < s.first) s.first = r.t;
    });
    const lines = [["Partecipante", "Prima risposta"].concat(cols.map((c) => c.title))];
    let i = 0;
    bySession.forEach((s) => {
      lines.push(["P" + String(++i).padStart(3, "0"), new Date(s.first).toLocaleString("it-IT")].concat(cols.map((c) => {
        const v = s.a[c.q.id];
        return c.row ? (v && v[c.row.id] != null ? v[c.row.id] : "") : answerText(c.q, v);
      })));
    });
    return "﻿" + lines.map((l) => l.map(csvCell).join(";")).join("\r\n");
  }
  function csvQa(form, res) {
    const titles = {}; window.APP.flatQuestions(form.content).forEach((x) => (titles[x.q.id] = x.q.title));
    const lines = [["Domanda Q&A", "Testo", "Voti", "Risposta data", "Nascosta", "Inviata"]];
    (res.qa || []).forEach((i) => lines.push([titles[i.q] || i.q, i.body, i.votes, i.answered ? "sì" : "", i.hidden ? "sì" : "", new Date(i.t).toLocaleString("it-IT")]));
    return "﻿" + lines.map((l) => l.map(csvCell).join(";")).join("\r\n");
  }
  function download(name, text) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }

  window.RESULTS = { render, count, csv, csvQa, download };
})();
