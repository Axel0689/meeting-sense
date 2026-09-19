"use strict";

// Le pagine di supporto contengono entrambe le lingue: qui si sceglie quale mostrare,
// usando la stessa preferenza salvata dalla pagina principale.
const LANG_STORAGE_KEY = "meetingsense-lang";

function initialLang() {
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (stored === "it" || stored === "en") return stored;
  } catch {
    // localStorage non disponibile: si ricade sulla lingua del browser
  }
  return (navigator.language || "it").toLowerCase().startsWith("it") ? "it" : "en";
}

function applyLang(lang) {
  document.documentElement.lang = lang;
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // preferenza non persistita: non blocca la pagina
  }
  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.lang === lang);
  });
  const title = document.documentElement.dataset[lang === "it" ? "titleIt" : "titleEn"];
  if (title) document.title = title;
}

document.querySelector(".lang-switch").addEventListener("click", (e) => {
  const btn = e.target.closest(".lang-btn");
  if (btn) applyLang(btn.dataset.lang);
});

applyLang(initialLang());
