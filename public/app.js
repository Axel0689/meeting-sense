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
};

let currentFilename = "";
let lastAnalysis = null;

// numero di "verbale" decorativo basato sulla data
els.docNumber.textContent = new Date().toISOString().slice(0, 10).replaceAll("-", "");

// ---------- input ----------

els.textarea.addEventListener("input", () => {
  els.charCount.textContent = `${els.textarea.value.length.toLocaleString("it-IT")} caratteri`;
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
    showError("Formato non supportato: carica un file .txt o .vtt.");
    return;
  }
  if (file.size > MAX_FILE_SIZE) {
    showError("Il file è troppo grande (limite 2MB): incolla direttamente il testo o dividilo in più parti.");
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
  const res = await fetch("/sample-transcript.txt");
  els.textarea.value = await res.text();
  els.textarea.dispatchEvent(new Event("input"));
  setFileBadge("");
});

// ---------- analisi ----------

els.analyzeBtn.addEventListener("click", async () => {
  const transcript = els.textarea.value.trim();
  hideError();
  if (!transcript) {
    showError("Incolla una trascrizione o carica un file prima di analizzare.");
    return;
  }

  setLoading(true);
  els.results.hidden = true;
  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript, filename: currentFilename }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.detail || `Errore inatteso (${res.status}). Riprova.`);
    }
    lastAnalysis = body.analysis;
    render(body);
    els.results.hidden = false;
    els.results.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    showError(err.message || "Impossibile contattare il server. Riprova.");
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

function render({ analysis, truncated, model_used }) {
  els.truncatedNotice.hidden = !truncated;
  els.summary.textContent = analysis.summary;
  fillList(els.keyPoints, analysis.key_points, "");
  fillList(els.decisions, analysis.decisions, "Nessuna decisione formale registrata in questa riunione.");
  fillList(els.followUps, analysis.follow_ups, "Nessun follow-up suggerito.");
  fillList(els.risks, analysis.risks, "Nessun rischio o blocker rilevante emerso.");
  fillList(els.openQuestions, analysis.open_questions, "Nessuna domanda rimasta senza risposta.");

  els.metricsBody.replaceChildren();
  if (!analysis.metrics.length) {
    const emptyRow = el("tr");
    const cell = el("td", "empty-note", "Nessuna metrica citata in questa riunione.");
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
    const key = item.assignee || "Non assegnato";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  els.actionItems.replaceChildren();
  if (!groups.size) {
    els.actionItems.append(el("p", "empty-note", "Nessun action item individuato."));
  }
  for (const [assignee, items] of groups) {
    const group = el("div", "assignee-group");
    const isUnassigned = /^non assegnato$/i.test(assignee);
    const nameRow = el("div", `assignee-name${isUnassigned ? " unassigned" : ""}`);
    nameRow.append(el("span", "avatar", isUnassigned ? "?" : initials(assignee)), document.createTextNode(assignee));
    const list = el("ul", "task-list");
    for (const item of items) {
      const li = el("li", "", item.task);
      if (item.due_hint) li.append(el("span", "due", `— entro ${item.due_hint}`));
      list.append(li);
    }
    group.append(nameRow, list);
    els.actionItems.append(group);
  }

  els.modelNote.textContent = model_used ? `Analisi generata con ${model_used}` : "";
}

// ---------- copia come Markdown ----------

function toMarkdown(a) {
  const lines = [`# Verbale riunione — ${new Date().toLocaleDateString("it-IT")}`, ""];
  if (a.participants.length) lines.push(`**Partecipanti:** ${a.participants.join(", ")}`, "");
  lines.push("## Riassunto", a.summary, "");
  if (a.key_points.length) {
    lines.push("## Punti discussi", ...a.key_points.map((p) => `- ${p}`), "");
  }
  lines.push("## Decisioni prese");
  lines.push(...(a.decisions.length ? a.decisions.map((d, i) => `${i + 1}. ${d}`) : ["_Nessuna decisione formale._"]), "");
  lines.push("## Action item");
  if (a.action_items.length) {
    for (const item of a.action_items) {
      const due = item.due_hint ? ` _(entro ${item.due_hint})_` : "";
      lines.push(`- [ ] **${item.assignee || "Non assegnato"}** — ${item.task}${due}`);
    }
  } else {
    lines.push("_Nessun action item._");
  }
  lines.push("", "## Follow-up suggeriti");
  lines.push(...(a.follow_ups.length ? a.follow_ups.map((f) => `- ${f}`) : ["_Nessuno._"]));
  lines.push("", "## Rischi e blocker");
  lines.push(...(a.risks.length ? a.risks.map((r) => `- ${r}`) : ["_Nessuno._"]));
  lines.push("", "## Domande senza risposta");
  lines.push(...(a.open_questions.length ? a.open_questions.map((q) => `- ${q}`) : ["_Nessuna._"]));
  lines.push("", "## KPI e metriche");
  if (a.metrics.length) {
    lines.push("| Metrica | Valore | Contesto |", "|---|---|---|");
    for (const m of a.metrics) lines.push(`| ${m.label} | ${m.value} | ${m.context || "—"} |`);
  } else {
    lines.push("_Nessuna metrica citata._");
  }
  return lines.join("\n");
}

els.copyBtn.addEventListener("click", async () => {
  if (!lastAnalysis) return;
  await navigator.clipboard.writeText(toMarkdown(lastAnalysis));
  const original = els.copyBtn.textContent;
  els.copyBtn.textContent = "Copiato ✓";
  setTimeout(() => (els.copyBtn.textContent = original), 1800);
});
