# Moduli live: la tua alternativa a Forms, Slido e Vevox

Si usa per qualsiasi evento. I moduli si creano dall'interfaccia, senza toccare il codice. Ci sono sezioni con ramificazioni, immagini, 11 tipi di domanda, presentazione dal vivo e risposte anonime.

| Pagina | Per chi | Indirizzo (dopo la pubblicazione) |
|---|---|---|
| Partecipa | il pubblico | `https://TUONOME.github.io/moduli/` (si entra con il codice) oppure il link diretto `…/?f=codice` |
| Gestione | solo tu, con login | `https://TUONOME.github.io/moduli/admin.html` |
| Presentazione | tu, da condividere su Teams o sul proiettore | si apre dal pulsante **Presenta** |

---

## 1 · Supabase (15 minuti, una volta sola)

1. Su **supabase.com** scegli **New project**.
   - Region: **Central EU (Frankfurt)**
   - Password del database: una a caso.
2. **SQL Editor → New query**: incolla tutto `supabase.sql` e premi **Run**. In fondo deve comparire "Installazione completata ✔".
3. **Il tuo account:** vai in **Authentication → Users → Add user → Create new user**.
   - Inserisci la tua email e una password.
   - Spunta **Auto Confirm User**.
4. **Blocca le iscrizioni** degli estranei: **Authentication → Sign In / Providers**, poi disattiva **Allow new users to sign up** e salva.
5. Vai in **Project Settings → API Keys** e copia:
   - **Project URL**
   - la chiave **anon public** (o **publishable**).

   Incollale in `config.js`. ⚠️ Non usare mai la chiave `secret` / `service_role`.

> Supabase gratuito mette in pausa i progetti fermi da 7 giorni. Prima di ogni evento apri la pagina di gestione il giorno prima. Se il progetto è in pausa, riattivalo da supabase.com.

## 2 · GitHub Pages (5 minuti)

1. Crea un repository **pubblico** chiamato `moduli`.
2. **Add file → Upload files**: trascina **tutto il contenuto** della cartella, comprese le sottocartelle `css`, `js` e `vendor`, poi premi **Commit**.
3. **Settings → Pages**: scegli Branch `main`, cartella `/(root)`, poi **Save**. Dopo 1–2 minuti il sito è online.

## 3 · Prova di carico (5 minuti)

```
node stress-test.mjs https://xxxx.supabase.co CHIAVE_PUBBLICA tua@email.it TUA_PASSWORD 200 20
```

Lo script crea un modulo di prova e simula 200 persone in modalità guidata (check-in, fist-to-five, Q&A). Controlla che arrivino tutte le risposte e alla fine **cancella da solo** il modulo di prova. Deve finire con **✅ Nessun errore** e `200 / 200`.

---

## Come si usa

### Creare un modulo
Nella pagina di gestione premi **+ Nuovo modulo** e scegli da dove partire:
- **Modulo vuoto**
- **Assemblea 99%**, già pronto con le domande dell'odg del 24/11
- **Feedback evento**, un esempio di ramificazione

Le modifiche si salvano da sole. In alto vedi "Salvato ✓".

- **Domande:** clicca una domanda per aprirla. Puoi cambiarne il tipo, renderla obbligatoria, spostarla, duplicarla, spostarla in un'altra sezione o aggiungere un'immagine 🖼️.
- **Opzioni:** per ogni opzione puoi mettere un'emoji, un'immagine 🖼️ e, nella modalità libera, la ramificazione **"Vai a…"**. Con **Incolla un elenco** aggiungi molte opzioni insieme, per esempio le regioni.
- **Sezioni:** "Dopo questa sezione: vai a… / invia il modulo" vale per tutta la sezione. Se una risposta ha un suo "Vai a…", vince quella.
- **Intestazione:** immagine di copertina e colore del modulo.

### Tipi di domanda
Scelta singola · Scelta multipla (con limite di scelte) · Elenco a discesa · Testo breve (in presentazione come **word cloud** o elenco) · Testo lungo · **Scala** (fist-to-five, stelle, faccine, 1–10, oppure livelli tuoi con emoji ed etichette) · **Likert** (più affermazioni con la stessa scala) · **Classifica** · **Q&A con voti** · Data · Numero.

### Le due modalità (in Impostazioni)
- **Libera**, come Microsoft Forms: ognuno compila al suo ritmo, sezione dopo sezione, seguendo le ramificazioni. Va bene per questionari, iscrizioni e feedback.
- **Guidata**, come Slido: le persone entrano e aspettano. Quando nella presentazione passi a una domanda, la sua sezione si apre da sola sui telefoni (opzione "segui"). Puoi anche scegliere a mano quale sezione è aperta.
  - Per avere **una domanda per slide**, metti una domanda per sezione.
  - Per avere **più domande insieme** (per esempio le tre del check-in), mettile nella stessa sezione.
  - Le sezioni con una sola domanda a scelta o a scala si inviano con un tocco.

### Presentazione
Il pulsante **Presenta** apre la schermata da condividere. Prima viene la schermata d'ingresso con QR, indirizzo e codice gigante, poi una domanda alla volta con i risultati in tempo reale.

| Tasto | Cosa fa |
|---|---|
| **→ / ←** (o spazio) | Domanda successiva / precedente |
| **A** | Apri o chiudi il modulo |
| **R** | Nascondi i risultati, così il voto non è influenzato |
| **Q** | Mostra o nasconde il QR |
| **F** | Schermo intero |
| **Clic su una parola** | La toglie dalla word cloud |
| **✓ / ✕ nel Q&A** | Segna una domanda come risposta / nascondila |

### Con PowerPoint
Il modo più affidabile è usare le slide per i contenuti e passare alla presentazione dell'app per le domande.
1. **QR sulle slide:** in **Condividi** premi **⬇ Scarica QR** e inserisci l'immagine nella prima slide, insieme al codice.
2. **Pulsanti nelle slide:** nella presentazione dell'app vai sulla domanda che ti serve e premi **🔗 Link per PowerPoint**. In PowerPoint seleziona un testo o una forma ("Vedi i risultati"), poi **Inserisci → Collegamento** e incolla. Durante la presentazione, un clic apre il browser esattamente su quella domanda e, in modalità guidata, apre la sua sezione sui telefoni. Per tornare alle slide usa Alt+Tab.
3. **Su Teams** condividi **lo schermo intero**, non "PowerPoint Live" e non una sola finestra, così il pubblico vede sia le slide sia il browser quando passi dall'uno all'altro.

Mettere la pagina *dentro* la slide si può fare solo con componenti aggiuntivi di terze parti (es. "Web Viewer 2.0"). Questo metodo non è stato provato, quindi meglio non usarlo per un evento importante senza una prova.

### Risposte
Nella scheda **Risposte** trovi:
- i riepiloghi con i grafici;
- **Scarica CSV**: una riga per partecipante e una colonna per domanda, si apre in Excel;
- **CSV Q&A**: domande e voti del pubblico.

In **Impostazioni → Azzera** cancelli le risposte dopo la prova generale. I telefoni "dimenticano" da soli quello che avevano risposto.

---

## Checklist per martedì

- **Lunedì:**
  - Crea il modulo dal modello "Assemblea 99%" e controlla i testi.
  - Fai la prova di carico.
  - Fai una prova con 5–10 persone, su iPhone, Android e computer.
  - Alla fine premi **Azzera**.
- **Lunedì, piano B:** prepara i 3–4 Microsoft Forms (check-in, fist-to-five direzione, fist-to-five quattro affermazioni, check-out).
- **Martedì, 12:00:**
  - Apri **Presenta** sulla schermata d'ingresso.
  - Incolla il link `…/?f=codice` nella chat di Teams.
  - Condividi la finestra della presentazione.

---

## Note tecniche

- **Carico:** i partecipanti non tengono connessioni "live" aperte. Fanno una piccola richiesta ogni 3–4 secondi solo in modalità guidata (ogni 20 secondi in quella libera). Così restano dentro il piano gratuito anche con 200 o più persone.
- **Sicurezza:** il pubblico non può leggere né modificare le tabelle. Passa solo da funzioni che controllano che il modulo sia aperto e che la domanda esista. Le funzioni di gestione rispondono solo a te dopo il login.
- **Privacy:** niente nomi. Ogni dispositivo ha un codice casuale anonimo. Se ti serve il nome di qualcuno, aggiungi una domanda.
- **Immagini:** vengono ridimensionate automaticamente (massimo 1200 px) e salvate in Supabase Storage. Il piano gratuito offre 1 GB.
- **Librerie:** sono incluse nella cartella `vendor`, quindi l'app non dipende da altri siti.
