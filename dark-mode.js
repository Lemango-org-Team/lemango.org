"use strict";
/**
 * dark-mode.js — shared dark-mode toggle for Lemango pages.
 * Auto-injects a toggle button into the header nav and applies a `.dark`
 * class to <html>, persisting the choice in localStorage.
 */
(function () {
  const KEY = "lemango_theme";
  const html = document.documentElement;
  let theme = "light";
  try { theme = localStorage.getItem(KEY) || "light"; } catch {}

  function apply(t) {
    html.classList.toggle("dark", t === "dark");
    try { localStorage.setItem(KEY, t); } catch {}
    const btn = document.getElementById("lm-theme-toggle");
    if (btn) btn.textContent = t === "dark" ? "☀" : "☾";
  }
  apply(theme);

  // Inject dark-mode styles for the shared legal/info page palette.
  const style = document.createElement("style");
  style.textContent = `
    html.dark body { background: #0f172a; color: #e2e8f0; }
    html.dark body::before { opacity: .08; }
    html.dark header { background: rgba(15,23,42,.85); border-color: #1e293b; }
    html.dark .brand, html.dark nav a { color: #cbd5e1; }
    html.dark nav a:hover { color: #34d399; }
    html.dark main, html.dark .wrap { color: #e2e8f0; }
    html.dark .card { background: #1e293b; border-color: #334155; color: #e2e8f0; }
    html.dark p, html.dark li { color: #cbd5e1; }
    html.dark h1, html.dark h2 { color: #f1f5f9; }
    html.dark footer { border-color: #1e293b; color: #94a3b8; }
    html.dark footer a { color: #34d399; }
    html.dark .updated { color: #94a3b8; }
    html.dark .eyebrow { color: #34d399; }
  `;
  document.head.appendChild(style);

  function mount() {
    const nav = document.querySelector("header nav");
    if (!nav || document.getElementById("lm-theme-toggle")) return;
    const btn = document.createElement("button");
    btn.id = "lm-theme-toggle";
    btn.type = "button";
    btn.textContent = theme === "dark" ? "☀" : "☾";
    btn.setAttribute("aria-label", "Toggle dark mode");
    btn.style.cssText = "background:none;border:1px solid currentColor;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:14px;margin-left:12px;color:inherit;";
    btn.addEventListener("click", () => apply(html.classList.contains("dark") ? "light" : "dark"));
    nav.appendChild(btn);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
