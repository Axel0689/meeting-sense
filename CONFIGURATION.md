# Configurazione e sviluppo

Dettagli tecnici per chi vuole eseguire, modificare o deployare MeetingSense. Per la descrizione del progetto vedi il [README](README.md).

## Setup locale

Serve Python 3.11+.

```powershell
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt

# configura la chiave (gratuita: https://openrouter.ai/settings/keys)
copy .env.example .env
# apri .env e incolla la tua OPENROUTER_API_KEY

.\.venv\Scripts\uvicorn api.index:app --reload
```

Apri http://127.0.0.1:8000 — il bottone **"Prova un esempio"** carica una trascrizione dimostrativa.

## Variabili d'ambiente

| Variabile            | Default                                    | Descrizione                                     |
| --------------------- | ------------------------------------------- | ------------------------------------------------ |
| `OPENROUTER_API_KEY`  | —                                           | Obbligatoria. Chiave gratuita da openrouter.ai   |
| `LLM_MODEL`           | `nvidia/nemotron-3-super-120b-a12b:free`   | Modello primario                                 |
| `LLM_FALLBACK_MODEL`  | `nvidia/nemotron-3-ultra-550b-a55b:free`   | Usato su rate limit (429) o errore del primario  |

L'elenco aggiornato dei modelli `:free` è su [openrouter.ai/openrouter/free](https://openrouter.ai/openrouter/free) (o via `GET https://openrouter.ai/api/v1/models`, filtrando gli id che finiscono in `:free`) — OpenRouter aggiunge e rimuove modelli gratuiti periodicamente.

I modelli `:free` di OpenRouter hanno rate limit variabili: se l'analisi risponde "modelli saturi", riprova dopo qualche minuto o cambia `LLM_MODEL`.

### Limiti giornalieri (rate limiting)

Pensato per quando l'app è pubblica (es. link nel portfolio): protegge la quota gratuita condivisa di OpenRouter da un singolo visitatore o bot che la esaurisce per tutti.

OpenRouter applica sui modelli `:free` **20 richieste/minuto** e, per chiave API, **50 richieste/giorno** (o **1000/giorno** se l'account ha caricato almeno 10$ di credito lifetime). MeetingSense aggiunge due contatori propri, più stringenti, su [Upstash Redis](https://console.upstash.com) (REST, gratuito, adatto a Vercel serverless):

| Variabile                  | Default | Descrizione                                                               |
| --------------------------- | ------- | --------------------------------------------------------------------------- |
| `UPSTASH_REDIS_REST_URL`   | —       | Se assente insieme al token, il rate limit è **disattivato** (comodo in locale) |
| `UPSTASH_REDIS_REST_TOKEN` | —       | Token REST del database Upstash                                            |
| `DAILY_GLOBAL_LIMIT`       | `200`   | Analisi totali/giorno prima di bloccare tutti (reset a mezzanotte UTC)      |
| `DAILY_IP_LIMIT`           | `6`     | Analisi/giorno per singolo visitatore (IP hashato, non salvato in chiaro)   |

Nota sul dimensionamento: ogni analisi può generare più di una chiamata OpenRouter (fallback su un secondo modello, o un retry se il JSON non è valido — fino a 4 nel caso peggiore). I default lasciano margine sotto il limite reale di OpenRouter anche nello scenario peggiore; se hai un tier più alto puoi alzarli.

Setup: crea un database Redis gratuito su [console.upstash.com](https://console.upstash.com), copia "UPSTASH_REDIS_REST_URL" e "...TOKEN" dalla sezione REST API, incollali in `.env` (locale) o come env var su Vercel (produzione).

## Test

```powershell
.\.venv\Scripts\pip install -r requirements-dev.txt
.\.venv\Scripts\python -m pytest tests -q
```

I test non chiamano l'LLM né Upstash (sono mockati): coprono parser VTT, validazione input, rate limiting, sicurezza (limiti di dimensione, header, parsing IP) ed errori.

## Deploy su Vercel

```powershell
npm i -g vercel
vercel                       # primo deploy (collega il progetto)
vercel env add OPENROUTER_API_KEY production
vercel env add UPSTASH_REDIS_REST_URL production
vercel env add UPSTASH_REDIS_REST_TOKEN production
vercel --prod
```

Vercel serve `public/` dal CDN e `api/index.py` come funzione serverless Python (rilevata automaticamente da `requirements.txt`).

## Struttura del progetto

```
api/index.py      # app FastAPI (entry point Vercel)
app/models.py     # schema Pydantic dell'analisi
app/parsing.py    # normalizzazione .txt/.vtt
app/llm.py        # client OpenRouter + prompt + fallback
app/ratelimit.py  # limiti giornalieri (Upstash Redis)
public/           # frontend statico (index.html, app.js con dizionario i18n IT/EN)
tests/            # pytest (LLM e Upstash mockati)
```

## Lingua (i18n)

L'interfaccia e l'analisi supportano italiano e inglese. Il selettore in pagina imposta `currentLang` (persistito in `localStorage`, con auto-rilevamento iniziale da `navigator.language`) e lo invia come campo `language` (`"it"`/`"en"`) nel body di `POST /api/analyze`: il prompt in `app/llm.py` istruisce il modello a rispondere in quella lingua, indipendentemente dalla lingua della trascrizione originale. Il bottone "Prova un esempio" carica `public/sample-transcript.txt` o `public/sample-transcript-en.txt` a seconda della lingua attiva.

Per aggiungere altre lingue: estendere `Literal["it", "en"]` in `app/models.py`, `_LANGUAGE_NAMES`/`_UNASSIGNED_LABEL` in `app/llm.py`, l'oggetto `translations` in `public/app.js` e creare una nuova trascrizione di esempio.

## Sicurezza

- Nessun dato viene persistito: la trascrizione è analizzata e scartata (transita da OpenRouter — non inserire contenuti riservati durante i test).
- Nessuna chiave o segreto è mai esposto al client. Il contenuto analizzato (LLM) e i dati inseriti dall'utente vengono sempre renderizzati con `textContent`, mai `innerHTML`: l'unico uso di `innerHTML` è per le due stringhe statiche del dizionario traduzioni (`introTitle`/`introText` in `app.js`), testo fisso scritto da chi sviluppa l'app, non contenuto dinamico — nessuna superficie XSS dal contenuto analizzato.
- Limiti di dimensione sia lato client (upload file max 2MB) sia lato server (trascrizione max 300.000 caratteri) contro payload abnormi.
- Il rate limiting per IP usa l'ultimo valore della catena `X-Forwarded-For` (il proxy Vercel), non il primo, per evitare che un client possa falsificarlo.
- Header di sicurezza di base (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`) su tutte le risposte.

## Fuori scope (per ora)

Audio/STT, autenticazione, storico riunioni/database, integrazioni (calendari, Slack), sentiment/tono, metriche di partecipazione, deviazione dall'agenda con timestamp, generazione slide, lingue oltre italiano/inglese.
