"use strict";
/**
 * cookie-consent.js — shared cookie/consent banner for all Lemango pages.
 * Auto-injects a small banner at the bottom of the page. Stores the choice
 * in localStorage so it only shows once. No external dependencies.
 */
(function () {
  const KEY = "lemango_cookie_consent";
  try { if (localStorage.getItem(KEY)) return; } catch { return; }

  const style = document.createElement("style");
  style.textContent = `
    .lm-cc { position: fixed; left: 16px; right: 16px; bottom: 16px; z-index: 9999;
      max-width: 720px; margin: 0 auto; background: #fdfcf8; color: #1e2b22;
      border: 1px solid #e3ddd1; border-radius: 12px; padding: 14px 18px;
      box-shadow: 0 8px 24px rgba(30,43,34,.15); font-family: "Plus Jakarta Sans","Segoe UI",system-ui,sans-serif;
      font-size: 13px; line-height: 1.5; display: flex; gap: 14px; align-items: center; flex-wrap: wrap; }
    .lm-cc p { margin: 0; flex: 1 1 260px; }
    .lm-cc a { color: #005c2d; font-weight: 600; }
    .lm-cc button { border: none; border-radius: 8px; padding: 8px 14px; font-weight: 700; font-size: 13px; cursor: pointer; }
    .lm-cc .accept { background: #007a33; color: #fff; }
    .lm-cc .decline { background: #f1f5f9; color: #334155; }
  `;
  document.head.appendChild(style);

  const banner = document.createElement("div");
  banner.className = "lm-cc";
  banner.setAttribute("role", "dialog");
  banner.setAttribute("aria-label", "Cookie consent");
  banner.innerHTML = `
    <p>We use cookies and similar technologies for analytics and advertising. See our <a href="/privacy.html">Privacy Policy</a>.</p>
    <button type="button" class="decline">Decline</button>
    <button type="button" class="accept">Accept</button>
  `;
  document.body.appendChild(banner);

  function dismiss(choice) {
    try { localStorage.setItem(KEY, choice); } catch {}
    banner.remove();
  }
  banner.querySelector(".accept").addEventListener("click", () => dismiss("accept"));
  banner.querySelector(".decline").addEventListener("click", () => dismiss("decline"));
})();

// Register service worker for PWA (best-effort)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
