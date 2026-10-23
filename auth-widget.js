"use strict";
/**
 * auth-widget.js — topbar account widget.
 * Uses client-side Google auth (lemango-auth.js) when available, falling back
 * to the server /api/auth/me endpoint. Stays in sync via the "lm:auth" event.
 */
(function () {
  const LemongoAuth = {
    user: null,

    async init() {
      if (window.LemangoAuth) {
        this.user = window.LemangoAuth.user || null;
        window.addEventListener("lm:auth", (e) => {
          this.user = e.detail.user;
          this._remountAll();
        });
      } else {
        try {
          const res = await fetch("/api/auth/me", { credentials: "include" });
          if (res.ok) {
            const data = await res.json();
            this.user = data.user || null;
          }
        } catch {
          this.user = null;
        }
      }
      this._remountAll();
      document.dispatchEvent(new CustomEvent("lm:auth", { detail: { user: this.user } }));
    },

    _remountAll() {
      document.querySelectorAll("[data-auth-widget]").forEach((el) => this.mount(el));
    },

    mount(container) {
      if (!container) return;
      container.innerHTML = "";
      if (this.user) {
        container.appendChild(this._buildUserChip(this.user));
      } else {
        container.appendChild(this._buildSignInBtn());
      }
    },

    _buildSignInBtn() {
      const a = document.createElement("a");
      a.href = "/auth.html?next=" + encodeURIComponent(location.pathname + location.search);
      a.className = "lm-auth-signin";
      a.textContent = "Sign in";
      a.style.background = "#ffffff";
      a.style.color = "#1e2b22";
      a.style.border = "1.5px solid #c8cfc5";
      a.style.borderRadius = "6px";
      a.style.padding = "6px 12px";
      a.style.fontWeight = "700";
      a.style.fontSize = "12px";
      a.style.textDecoration = "none";
      a.style.display = "inline-block";
      return a;
    },

    _buildUserChip(user) {
      const wrap = document.createElement("div");
      wrap.className = "lm-auth-chip";
      const avatar = document.createElement("span");
      avatar.className = "lm-auth-avatar";
      if (user.avatar || user.picture) {
        const img = document.createElement("img");
        img.src = user.avatar || user.picture;
        img.alt = user.name || "";
        img.width = 24; img.height = 24;
        img.referrerPolicy = "no-referrer";
        avatar.appendChild(img);
      } else {
        avatar.textContent = (user.firstName || user.name || "?")[0].toUpperCase();
      }
      const name = document.createElement("span");
      name.className = "lm-auth-name";
      name.textContent = user.firstName || user.name || user.email;
      wrap.appendChild(avatar);
      wrap.appendChild(name);

      const out = document.createElement("button");
      out.type = "button";
      out.className = "lm-auth-signout";
      out.textContent = "Sign out";
      out.style.background = "transparent";
      out.style.border = "none";
      out.style.color = "#8c1605";
      out.style.fontWeight = "600";
      out.style.cursor = "pointer";
      out.style.fontSize = "12px";
      out.addEventListener("click", (e) => {
        e.stopPropagation();
        this.signOut();
      });
      wrap.appendChild(out);
      return wrap;
    },

    signOut() {
      if (window.LemangoAuth && typeof window.LemangoAuth.signOut === "function") {
        window.LemangoAuth.signOut();
      } else {
        this.user = null;
        try { localStorage.removeItem("lemango_user"); } catch {}
        this._remountAll();
        document.dispatchEvent(new CustomEvent("lm:auth", { detail: { user: null } }));
        try { if (window.google && window.google.accounts) window.google.accounts.id.disableAutoSelect(); } catch (e) {}
      }
    }
  };

  // Inject minimal styles
  const style = document.createElement("style");
  style.textContent = `
    .lm-auth-signin { display:inline-block; }
    .lm-auth-chip { position:relative;display:inline-flex;align-items:center;gap:6px;padding:3px 8px 3px 3px;border:1px solid rgba(0,0,0,.10);border-radius:999px;background:rgba(255,255,255,.6);font-family:inherit;font-size:12px;font-weight:600;color:inherit; }
    .lm-auth-avatar { width:24px;height:24px;border-radius:50%;background:#005c2d;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0; }
    .lm-auth-avatar img { width:24px;height:24px;border-radius:50%;object-fit:cover; }
    .lm-auth-name { max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
  `;
  document.head.appendChild(style);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => LemongoAuth.init());
  } else {
    LemongoAuth.init();
  }
})();
