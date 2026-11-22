// Modelli pronti da cui partire (si possono modificare liberamente dopo)
(function () {
  const A = window.APP;
  const opt = (label, emoji, image) => ({ id: A.newId("o"), label, emoji: emoji || "", image: image || null });

  const F2F = [
    { value: 0, emoji: "✊", label: "Per niente d’accordo" },
    { value: 1, emoji: "☝️", label: "Fortemente in disaccordo" },
    { value: 2, emoji: "✌️", label: "In disaccordo" },
    { value: 3, emoji: "🤟", label: "Né d’accordo, né in disaccordo" },
    { value: 4, emoji: "🖖", label: "D’accordo" },
    { value: 5, emoji: "🖐️", label: "Completamente d’accordo" },
  ];
  const f2f = (title) => ({ id: A.newId("q"), type: "scale", title, description: "Quanto sei d’accordo? Da 0 a 5.", image: null, required: true,
    scale: { preset: "custom", steps: A.clone(F2F) } });

  const REGIONI = ["Abruzzo", "Basilicata", "Calabria", "Campania", "Emilia-Romagna", "Friuli-Venezia Giulia", "Lazio", "Liguria",
    "Lombardia", "Marche", "Molise", "Piemonte", "Puglia", "Sardegna", "Sicilia", "Toscana", "Trentino-Alto Adige", "Umbria",
    "Valle d’Aosta", "Veneto", "Dall’estero"];

  window.TEMPLATES = {
    blank: {
      label: "Modulo vuoto",
      build: () => ({
        title: "Modulo senza titolo", description: "", theme: { color: A.cfg.DEFAULT_COLOR }, settings: { mode: "free", allowEdit: true },
        content: { sections: [{ id: A.newId("s"), title: "", description: "", next: null, questions: [A.blankQuestion("choice")] }] },
      }),
    },
    assemblea: {
      label: "Assemblea 99% (dall’odg del 24/11)",
      build: () => ({
        title: "99% · Prima assemblea della community",
        description: "",
        theme: { color: "#0000ff" },
        settings: { mode: "guided", allowEdit: true, thanks: "Grazie!" },
        content: { sections: [
          { id: A.newId("s"), title: "Check-in · Conosciamoci", description: "", next: null, questions: [
            { id: A.newId("q"), type: "dropdown", title: "Da quale regione ti colleghi?", description: "", image: null, required: true, options: REGIONI.map((r) => opt(r)) },
            { id: A.newId("q"), type: "text", title: "Organizzazione / realtà di appartenenza", description: "Facoltativa", image: null, required: false, maxLength: 40, display: "list" },
            { id: A.newId("q"), type: "text", title: "Come stai arrivando oggi?", description: "Una parola.", image: null, required: true, maxLength: 25, display: "cloud" },
            { id: A.newId("q"), type: "choice", title: "Come senti il 99% in questo momento?", description: "Scegli l’animaletto che rappresenta meglio la tua percezione.", image: null, required: true,
              options: [opt("Carichə, pienə di energia", "🦁"), opt("Mille cose insieme", "🐿️"), opt("Riflessivə, osservo", "🦉"),
                        opt("Piano, ma ci sono", "🐢"), opt("Stanchə, mi serve una pausa", "🐨"), opt("Un po’ dubbiosə", "🦔")] },
          ] },
          { id: A.newId("s"), title: "Punto di partenza", description: "", next: null, questions: [
            f2f("«So qual è la direzione in cui stiamo andando con la campagna»"),
          ] },
          { id: A.newId("s"), title: "Fist-to-five", description: "Quanto sei d’accordo con queste affermazioni?", next: null, questions: [
            f2f("«Mi riconosco nella direzione politica che stiamo dando alla campagna»"),
            f2f("«Sento che nel 99% ci sia spazio per esprimere il mio punto di vista, anche quando è diverso o minoritario, ed essere ascoltatə»"),
            f2f("«Mi sento informatə, consapevole e messə nelle condizioni di contribuire concretamente alle decisioni del mio gruppo e del progetto nel suo insieme»"),
            f2f("«Sento che il 99% sia anche uno spazio di comunità: incontro, conoscenza, relazione, e non solo una campagna fighissima da portare avanti»"),
          ] },
          { id: A.newId("s"), title: "Discussione", description: "Domande, proposte, riflessioni e critiche. Vota quelle che vuoi discutere.", next: null, questions: [
            { id: A.newId("q"), type: "qa", title: "Cosa vuoi portare nella discussione?", description: "", image: null, required: false },
          ] },
          { id: A.newId("s"), title: "Check-out", description: "", next: null, questions: [
            { id: A.newId("q"), type: "text", title: "Con che parola esci da questa assemblea?", description: "Una parola.", image: null, required: true, maxLength: 25, display: "cloud" },
          ] },
        ] },
      }),
    },
    feedback: {
      label: "Feedback evento (con ramificazione)",
      build: () => {
        const sYes = A.newId("s"), sNo = A.newId("s"), sEnd = A.newId("s");
        return {
          title: "Com’è andata?", description: "Due minuti per aiutarci a migliorare.", theme: { color: "#0a7d32" },
          settings: { mode: "free", allowEdit: true, thanks: "Grazie del feedback! 💚" },
          content: { sections: [
            { id: A.newId("s"), title: "", description: "", next: null, questions: [
              { id: A.newId("q"), type: "scale", title: "Quanto ti è piaciuto l’evento?", description: "", image: null, required: true, scale: { preset: "stars5", steps: A.clone(A.SCALE_PRESETS.stars5.steps) } },
              { id: A.newId("q"), type: "choice", title: "Torneresti al prossimo incontro?", description: "", image: null, required: true,
                options: [Object.assign(opt("Sì", "👍"), { goTo: sYes }), Object.assign(opt("Non so / no", "🤔"), { goTo: sNo })] },
            ] },
            { id: sYes, title: "Che bello!", description: "", next: sEnd, questions: [
              { id: A.newId("q"), type: "multi", title: "Su cosa ti piacerebbe lavorare?", description: "", image: null, required: false, maxChoices: 2,
                options: [opt("Comunicazione", "📣"), opt("Organizzazione eventi", "🗓️"), opt("Formazione", "📚"), opt("Ricerca", "🔎")] },
            ] },
            { id: sNo, title: "Ci aiuti a capire?", description: "", next: sEnd, questions: [
              { id: A.newId("q"), type: "longtext", title: "Cosa cambieresti?", description: "", image: null, required: false },
            ] },
            { id: sEnd, title: "Ultima cosa", description: "", next: "submit", questions: [
              { id: A.newId("q"), type: "ranking", title: "Metti in ordine di priorità", description: "", image: null, required: false,
                options: [opt("Più tempo per discutere"), opt("Più momenti informali"), opt("Materiali prima dell’incontro")] },
            ] },
          ] },
        };
      },
    },
  };
})();
