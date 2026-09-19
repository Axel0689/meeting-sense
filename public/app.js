"use strict";

const els = {
  textarea: document.getElementById("transcript"),
  fileInput: document.getElementById("file-input"),
  fileBadge: document.getElementById("file-badge"),
  charCount: document.getElementById("char-count"),
  dropZone: document.getElementById("drop-zone"),
  analyzeBtn: document.getElementById("analyze-btn"),
  sampleBtn: document.getElementById("sample-btn"),
  errorBanner: document.getElementById("error-banner"),
  results: document.getElementById("results"),
  truncatedNotice: document.getElementById("truncated-notice"),
  summary: document.getElementById("summary-text"),
  keyPoints: document.getElementById("key-points"),
  participants: document.getElementById("participants"),
  decisions: document.getElementById("decisions"),
  actionItems: document.getElementById("action-items"),
  followUps: document.getElementById("follow-ups"),
  risks: document.getElementById("risks"),
  openQuestions: document.getElementById("open-questions"),
  metricsBody: document.getElementById("metrics-body"),
  copyBtn: document.getElementById("copy-btn"),
  modelNote: document.getElementById("model-note"),
  docNumber: document.getElementById("doc-number"),
  langSwitch: document.getElementById("lang-switch"),
};

let currentFilename = "";
let lastAnalysis = null;
let lastResponseBody = null;

// numero di "verbale" decorativo basato sulla data
els.docNumber.textContent = new Date().toISOString().slice(0, 10).replaceAll("-", "");

// ---------- i18n ----------

const SUPPORTED_LANGS = ["it", "en"];
const LOCALE_MAP = { it: "it-IT", en: "en-GB" };
const LANG_STORAGE_KEY = "meetingsense-lang";

const translations = {
  it: {
    pageTitle: "MeetingSense: Dalla Riunione alle Decisioni",
    pageDescription: "Incolla la trascrizione di una riunione e ottieni riassunto, decisioni, action item per persona e follow-up.",
    taglinePrefix: "Verbale n.",
    taglineSuffix: "· redatto automaticamente",
    introTitle: "Dalla riunione<br><em>alle decisioni.</em>",
    introText: "Incolla la trascrizione di una call - o carica il file <strong>.txt</strong> / <strong>.vtt</strong> esportato da Teams, Meet o Zoom - e ottieni riassunto, decisioni prese, action item per persona e follow-up suggeriti.",
    transcriptLabel: "Trascrizione",
    sampleBtn: "Prova un esempio",
    uploadBtn: "Carica file",
    transcriptPlaceholder: "Anna: Buongiorno a tutti, partiamo dal budget…\nMarco: D'accordo. Propongo di approvare i 50k per il Q3…\n\n(oppure trascina qui un file .txt o .vtt)",
    analyzeBtn: "Analizza la riunione",
    analyzing: "Analisi in corso",
    privacyHint: "MeetingSense non salva la trascrizione, ma il testo viene inviato a OpenRouter e ai provider dei modelli gratuiti, che potrebbero registrarlo. Non inserire dati riservati.",
    resultsTitle: "Esito della riunione",
    truncatedNotice: "La trascrizione era molto lunga ed è stata analizzata solo la prima parte.",
    cardSummary: "Riassunto",
    cardDecisions: "Decisioni prese",
    cardActions: "Action item per persona",
    cardFollowups: "Follow-up suggeriti",
    cardRisks: "Rischi e blocker",
    cardQuestions: "Domande senza risposta",
    cardMetrics: "KPI e metriche",
    metricLabel: "Metrica",
    metricValue: "Valore",
    metricContext: "Contesto",
    copyBtn: "Copia come Markdown",
    footerText: "MeetingSense - prototipo in fase di test - il tuo parere conta: cosa manca? cosa toglieresti?",

    charCountSuffix: "caratteri",
    unsupportedFormat: "Formato non supportato: carica un file .txt o .vtt.",
    fileTooLarge: "Il file è troppo grande (limite 2MB): incolla direttamente il testo o dividilo in più parti.",
    emptyTranscript: "Incolla una trascrizione o carica un file prima di analizzare.",
    unexpectedError: (status) => `Errore inatteso (${status}). Riprova.`,
    networkError: "Impossibile contattare il server. Riprova.",

    emptyKeyPoints: "",
    emptyDecisions: "Nessuna decisione formale registrata in questa riunione.",
    emptyFollowups: "Nessun follow-up suggerito.",
    emptyRisks: "Nessun rischio o blocker rilevante emerso.",
    emptyOpenQuestions: "Nessuna domanda rimasta senza risposta.",
    emptyMetrics: "Nessuna metrica citata in questa riunione.",
    emptyActionItems: "Nessun action item individuato.",
    unassignedLabel: "Non assegnato",
    dueLabel: (due) => `— entro ${due}`,
    modelNote: (model) => `Analisi generata con ${model}`,
    copiedLabel: "Copiato ✓",

    mdTitle: (date) => `# Verbale riunione — ${date}`,
    mdParticipants: (list) => `**Partecipanti:** ${list}`,
    mdSummary: "## Riassunto",
    mdKeyPoints: "## Punti discussi",
    mdDecisions: "## Decisioni prese",
    mdNoDecisions: "_Nessuna decisione formale._",
    mdActionItems: "## Action item",
    mdNoActionItems: "_Nessun action item._",
    mdFollowups: "## Follow-up suggeriti",
    mdNoFollowups: "_Nessuno._",
    mdRisks: "## Rischi e blocker",
    mdNoRisks: "_Nessuno._",
    mdOpenQuestions: "## Domande senza risposta",
    mdNoOpenQuestions: "_Nessuna._",
    mdMetrics: "## KPI e metriche",
    mdNoMetrics: "_Nessuna metrica citata._",
  },
  en: {
    pageTitle: "MeetingSense: From Meeting to Decisions",
    pageDescription: "Paste a meeting transcript and get a summary, decisions, action items per person and follow-ups.",
    taglinePrefix: "Minutes no.",
    taglineSuffix: "· generated automatically",
    introTitle: "From the meeting<br><em>to the decisions.</em>",
    introText: "Paste the transcript of a call - or upload the <strong>.txt</strong> / <strong>.vtt</strong> file exported from Teams, Meet or Zoom - and get a summary, decisions, action items per person and suggested follow-ups.",
    transcriptLabel: "Transcript",
    sampleBtn: "Try an example",
    uploadBtn: "Upload file",
    transcriptPlaceholder: "Anna: Good morning everyone, let's start with the budget…\nMarco: Agreed. I propose we approve the 50k for Q3…\n\n(or drag a .txt or .vtt file here)",
    analyzeBtn: "Analyze the meeting",
    analyzing: "Analyzing",
    privacyHint: "MeetingSense does not store the transcript, but the text is sent to OpenRouter and the providers of the free models, which may log it. Do not enter confidential data.",
    resultsTitle: "Meeting outcome",
    truncatedNotice: "The transcript was very long and only the first part was analyzed.",
    cardSummary: "Summary",
    cardDecisions: "Decisions made",
    cardActions: "Action items per person",
    cardFollowups: "Suggested follow-ups",
    cardRisks: "Risks and blockers",
    cardQuestions: "Unanswered questions",
    cardMetrics: "KPIs and metrics",
    metricLabel: "Metric",
    metricValue: "Value",
    metricContext: "Context",
    copyBtn: "Copy as Markdown",
    footerText: "MeetingSense - prototype in public testing - your feedback matters: what's missing? what would you remove?",

    charCountSuffix: "characters",
    unsupportedFormat: "Unsupported format: upload a .txt or .vtt file.",
    fileTooLarge: "The file is too large (2MB limit): paste the text directly or split it into multiple parts.",
    emptyTranscript: "Paste a transcript or upload a file before analyzing.",
    unexpectedError: (status) => `Unexpected error (${status}). Please try again.`,
    networkError: "Unable to reach the server. Please try again.",

    emptyKeyPoints: "",
    emptyDecisions: "No formal decision was recorded in this meeting.",
    emptyFollowups: "No follow-up suggested.",
    emptyRisks: "No significant risk or blocker emerged.",
    emptyOpenQuestions: "No question was left unanswered.",
    emptyMetrics: "No metric was mentioned in this meeting.",
    emptyActionItems: "No action item identified.",
    unassignedLabel: "Unassigned",
    dueLabel: (due) => `— due ${due}`,
    modelNote: (model) => `Analysis generated with ${model}`,
    copiedLabel: "Copied ✓",

    mdTitle: (date) => `# Meeting minutes — ${date}`,
    mdParticipants: (list) => `**Participants:** ${list}`,
    mdSummary: "## Summary",
    mdKeyPoints: "## Key points",
    mdDecisions: "## Decisions made",
    mdNoDecisions: "_No formal decision._",
    mdActionItems: "## Action items",
    mdNoActionItems: "_No action items._",
    mdFollowups: "## Suggested follow-ups",
    mdNoFollowups: "_None._",
    mdRisks: "## Risks and blockers",
    mdNoRisks: "_None._",
    mdOpenQuestions: "## Unanswered questions",
    mdNoOpenQuestions: "_None._",
    mdMetrics: "## KPIs and metrics",
    mdNoMetrics: "_No metric mentioned._",
  },
};

function t(key, ...args) {
  const entry = translations[currentLang][key];
  return typeof entry === "function" ? entry(...args) : entry;
}

function detectInitialLang() {
  const stored = localStorage.getItem(LANG_STORAGE_KEY);
  if (stored && SUPPORTED_LANGS.includes(stored)) return stored;
  const nav = (navigator.language || "it").toLowerCase();
  return nav.startsWith("it") ? "it" : "en";
}

let currentLang = detectInitialLang();

function applyLang(lang) {
  currentLang = lang;
  localStorage.setItem(LANG_STORAGE_KEY, lang);
  document.documentElement.lang = lang;

  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-html]").forEach((node) => {
    node.innerHTML = t(node.dataset.i18nHtml);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  });
  document.querySelectorAll("[data-i18n-content]").forEach((node) => {
    node.content = t(node.dataset.i18nContent);
  });

  els.langSwitch.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.lang === lang);
  });

  refreshCharCount();

  // se ci sono già risultati a schermo, ri-renderizza per aggiornare le
  // stringhe dinamiche (stati vuoti, etichette); i contenuti generati
  // dall'LLM restano nella lingua con cui sono stati prodotti finché non
  // si rianalizza
  if (lastResponseBody) render(lastResponseBody);
}

els.langSwitch.addEventListener("click", (e) => {
  const btn = e.target.closest(".lang-btn");
  if (btn) applyLang(btn.dataset.lang);
});

applyLang(currentLang);

// ---------- input ----------

function refreshCharCount() {
  els.charCount.textContent = `${els.textarea.value.length.toLocaleString(LOCALE_MAP[currentLang])} ${t("charCountSuffix")}`;
}

els.textarea.addEventListener("input", () => {
  refreshCharCount();
  if (!els.textarea.value) setFileBadge("");
});

els.fileInput.addEventListener("change", () => {
  const file = els.fileInput.files[0];
  if (file) loadFile(file);
});

["dragover", "dragenter"].forEach((ev) =>
  els.dropZone.addEventListener(ev, (e) => {
    e.preventDefault();
    els.dropZone.classList.add("dragging");
  })
);
["dragleave", "drop"].forEach((ev) =>
  els.dropZone.addEventListener(ev, (e) => {
    e.preventDefault();
    els.dropZone.classList.remove("dragging");
  })
);
els.dropZone.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files[0];
  if (file) loadFile(file);
});

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB, ampio margine per trascrizioni testuali

function loadFile(file) {
  if (!/\.(txt|vtt)$/i.test(file.name)) {
    showError(t("unsupportedFormat"));
    return;
  }
  if (file.size > MAX_FILE_SIZE) {
    showError(t("fileTooLarge"));
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    els.textarea.value = reader.result;
    els.textarea.dispatchEvent(new Event("input"));
    setFileBadge(file.name);
  };
  reader.readAsText(file);
}

function setFileBadge(name) {
  currentFilename = name;
  els.fileBadge.hidden = !name;
  els.fileBadge.textContent = name;
}

els.sampleBtn.addEventListener("click", async () => {
  const path = currentLang === "en" ? "/sample-transcript-en.txt" : "/sample-transcript.txt";
  const res = await fetch(path);
  els.textarea.value = await res.text();
  els.textarea.dispatchEvent(new Event("input"));
  setFileBadge("");
});

// ---------- analisi ----------

els.analyzeBtn.addEventListener("click", async () => {
  const transcript = els.textarea.value.trim();
  hideError();
  if (!transcript) {
    showError(t("emptyTranscript"));
    return;
  }

  setLoading(true);
  els.results.hidden = true;
  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript, filename: currentFilename, language: currentLang }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.detail || t("unexpectedError", res.status));
    }
    lastAnalysis = body.analysis;
    lastResponseBody = body;
    render(body);
    els.results.hidden = false;
    els.results.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    showError(err.message || t("networkError"));
  } finally {
    setLoading(false);
  }
});

function setLoading(loading) {
  els.analyzeBtn.disabled = loading;
  els.analyzeBtn.querySelector(".btn-label").hidden = loading;
  els.analyzeBtn.querySelector(".btn-loading").hidden = !loading;
}

function showError(msg) {
  els.errorBanner.textContent = msg;
  els.errorBanner.hidden = false;
}
function hideError() {
  els.errorBanner.hidden = true;
}

// ---------- rendering ----------

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function fillList(container, items, emptyMessage) {
  container.replaceChildren();
  if (!items.length) {
    container.replaceChildren(el("li", "empty-note", emptyMessage));
    return;
  }
  items.forEach((item) => container.append(el("li", "", item)));
}

const UNASSIGNED_PATTERN = /^(non assegnato|unassigned)$/i;

function render({ analysis, truncated, model_used }) {
  els.truncatedNotice.hidden = !truncated;
  els.summary.textContent = analysis.summary;
  fillList(els.keyPoints, analysis.key_points, t("emptyKeyPoints"));
  fillList(els.decisions, analysis.decisions, t("emptyDecisions"));
  fillList(els.followUps, analysis.follow_ups, t("emptyFollowups"));
  fillList(els.risks, analysis.risks, t("emptyRisks"));
  fillList(els.openQuestions, analysis.open_questions, t("emptyOpenQuestions"));

  els.metricsBody.replaceChildren();
  if (!analysis.metrics.length) {
    const emptyRow = el("tr");
    const cell = el("td", "empty-note", t("emptyMetrics"));
    cell.colSpan = 3;
    emptyRow.append(cell);
    els.metricsBody.append(emptyRow);
  } else {
    for (const metric of analysis.metrics) {
      const row = el("tr");
      row.append(
        el("td", "metric-label", metric.label),
        el("td", "metric-value", metric.value),
        el("td", "metric-context", metric.context || "—")
      );
      els.metricsBody.append(row);
    }
  }

  els.participants.replaceChildren(
    ...analysis.participants.map((name) => {
      const chip = el("span", "chip");
      chip.append(el("span", "avatar", initials(name)), document.createTextNode(name));
      return chip;
    })
  );

  // action item raggruppati per assegnatario
  const groups = new Map();
  for (const item of analysis.action_items) {
    const key = item.assignee || t("unassignedLabel");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  els.actionItems.replaceChildren();
  if (!groups.size) {
    els.actionItems.append(el("p", "empty-note", t("emptyActionItems")));
  }
  for (const [assignee, items] of groups) {
    const group = el("div", "assignee-group");
    const isUnassigned = UNASSIGNED_PATTERN.test(assignee);
    const nameRow = el("div", `assignee-name${isUnassigned ? " unassigned" : ""}`);
    nameRow.append(
      el("span", "avatar", isUnassigned ? "?" : initials(assignee)),
      document.createTextNode(isUnassigned ? t("unassignedLabel") : assignee)
    );
    const list = el("ul", "task-list");
    for (const item of items) {
      const li = el("li", "", item.task);
      if (item.due_hint) li.append(el("span", "due", t("dueLabel", item.due_hint)));
      list.append(li);
    }
    group.append(nameRow, list);
    els.actionItems.append(group);
  }

  els.modelNote.textContent = model_used ? t("modelNote", model_used) : "";
}

// ---------- copia come Markdown ----------

function toMarkdown(a) {
  const lines = [t("mdTitle", new Date().toLocaleDateString(LOCALE_MAP[currentLang])), ""];
  if (a.participants.length) lines.push(t("mdParticipants", a.participants.join(", ")), "");
  lines.push(t("mdSummary"), a.summary, "");
  if (a.key_points.length) {
    lines.push(t("mdKeyPoints"), ...a.key_points.map((p) => `- ${p}`), "");
  }
  lines.push(t("mdDecisions"));
  lines.push(...(a.decisions.length ? a.decisions.map((d, i) => `${i + 1}. ${d}`) : [t("mdNoDecisions")]), "");
  lines.push(t("mdActionItems"));
  if (a.action_items.length) {
    for (const item of a.action_items) {
      const due = item.due_hint ? ` _(${t("dueLabel", item.due_hint).replace("— ", "")})_` : "";
      lines.push(`- [ ] **${item.assignee || t("unassignedLabel")}** — ${item.task}${due}`);
    }
  } else {
    lines.push(t("mdNoActionItems"));
  }
  lines.push("", t("mdFollowups"));
  lines.push(...(a.follow_ups.length ? a.follow_ups.map((f) => `- ${f}`) : [t("mdNoFollowups")]));
  lines.push("", t("mdRisks"));
  lines.push(...(a.risks.length ? a.risks.map((r) => `- ${r}`) : [t("mdNoRisks")]));
  lines.push("", t("mdOpenQuestions"));
  lines.push(...(a.open_questions.length ? a.open_questions.map((q) => `- ${q}`) : [t("mdNoOpenQuestions")]));
  lines.push("", t("mdMetrics"));
  if (a.metrics.length) {
    lines.push(`| ${t("metricLabel")} | ${t("metricValue")} | ${t("metricContext")} |`, "|---|---|---|");
    for (const m of a.metrics) lines.push(`| ${m.label} | ${m.value} | ${m.context || "—"} |`);
  } else {
    lines.push(t("mdNoMetrics"));
  }
  return lines.join("\n");
}

els.copyBtn.addEventListener("click", async () => {
  if (!lastAnalysis) return;
  await navigator.clipboard.writeText(toMarkdown(lastAnalysis));
  const original = els.copyBtn.textContent;
  els.copyBtn.textContent = t("copiedLabel");
  setTimeout(() => (els.copyBtn.textContent = original), 1800);
});
