"use strict";
/**
 * admin-button.js — shows an "Admin page login" button at the bottom of the
 * page only for verified admin accounts (determined by the backend).
 */
(function () {
  async function check() {
    if (!window.LemangoAuth || !window.LemangoAuth.user) return;
    const user = window.LemangoAuth.user;
    try {
      const res = await fetch("/api/admin/check?idToken=" + encodeURIComponent(user.idToken), { credentials: "include" });
      const data = await res.json();
      if (data.ok && data.isAdmin) {
        const btn = document.createElement("a");
        btn.href = "/admin";
        btn.textContent = "Admin page login";
        btn.style.cssText = "position:fixed;bottom:8px;left:8px;z-index:9999;padding:6px 12px;background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:6px;font-size:11px;font-weight:700;text-decoration:none;font-family:inherit;";
        document.body.appendChild(btn);
      }
    } catch (e) { /* ignore */ }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      // wait for auth
      if (window.LemangoAuth) {
        if (window.LemangoAuth.user) check();
        document.addEventListener("lm:auth", () => check(), { once: true });
      }
    });
  } else {
    if (window.LemangoAuth && window.LemangoAuth.user) check();
    document.addEventListener("lm:auth", () => check(), { once: true });
  }
})();
