"use strict";

/**
 * auth-widget.js
 * Drop this script on any Lemango page. It:
 *  1. Calls /api/auth/me to check if the user is signed in
 *  2. If signed in: renders an avatar + name chip with a logout dropdown
 *  3. If not signed in: renders a "Sign in" button that links to /auth
 *
 * Usage: add <script src="auth-widget.js" defer></script> to any page
 * then call: LemongoAuth.mount(containerElement)
 * Or it will auto-mount into any element with data-auth-widget attribute.
 */

(function () {
  const LemongoAuth = {
    user: null,

    async init() {
      // Prefer client-side auth (works on static hosting)
      if (window.LemangoAuth) {
        this.user = window.LemangoAuth.user || null;
        document.addEventListener("lm:auth", (e) => {
          this.user = e.detail.user;
          document.querySelectorAll("[data-auth-widget]").forEach((el) => this.mount(el));
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

      // Auto-mount into any [data-auth-widget] elements
      document.querySelectorAll("[data-auth-widget]").forEach((el) => {
        this.mount(el);
      });

      // Dispatch event so pages can react
      document.dispatchEvent(new CustomEvent("lm:auth", { detail: { user: this.user } }));
    },

    mount(container) {
      container.innerHTML = "";
      if (this.user) {
        container.appendChild(this._buildUserChip(this.user));
      } else {
        container.appendChild(this._buildSignInBtn());
      }
    },

    _buildSignInBtn() {
      const btn = document.createElement("a");
      btn.href = `/auth?next=${encodeURIComponent(location.pathname + location.search)}`;
      btn.className = "lm-auth-signin";
      btn.textContent = "Sign in";
      btn.style.background = "#ffffff";
      btn.style.color = "#1e2b22";
      btn.style.border = "1.5px solid #c8cfc5";
      return btn;
    },

    _buildUserChip(user) {
      const wrap = document.createElement("div");
      wrap.className = "lm-auth-chip";
      wrap.setAttribute("aria-haspopup", "true");
      wrap.setAttribute("aria-expanded", "false");

      // Avatar
      const avatar = document.createElement("span");
      avatar.className = "lm-auth-avatar";
      if (user.avatar) {
        const img = document.createElement("img");
        img.src = user.avatar;
        img.alt = user.name || "";
        img.width = 28;
        img.height = 28;
        img.referrerPolicy = "no-referrer";
        avatar.appendChild(img);
      } else {
        avatar.textContent = (user.firstName || user.name || "?")[0].toUpperCase();
      }

      // Name
      const name = document.createElement("span");
      name.className = "lm-auth-name";
      name.textContent = user.firstName || user.name || user.email;

      // Chevron
      const chevron = document.createElement("span");
      chevron.className = "lm-auth-chevron";
      chevron.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>`;

      wrap.appendChild(avatar);
      wrap.appendChild(name);
      wrap.appendChild(chevron);

      // Dropdown
      const dropdown = this._buildDropdown(user);
      wrap.appendChild(dropdown);

      // Toggle
      wrap.addEventListener("click", (e) => {
        e.stopPropagation();
        const open = wrap.getAttribute("aria-expanded") === "true";
        wrap.setAttribute("aria-expanded", String(!open));
        dropdown.hidden = open;
      });
      document.addEventListener("click", () => {
        wrap.setAttribute("aria-expanded", "false");
        dropdown.hidden = true;
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          wrap.setAttribute("aria-expanded", "false");
          dropdown.hidden = true;
        }
      });

      return wrap;
    },

    _buildDropdown(user) {
      const dd = document.createElement("div");
      dd.className = "lm-auth-dropdown";
      dd.hidden = true;

      const info = document.createElement("div");
      info.className = "lm-auth-dd-info";
      info.innerHTML = `
        <strong>${_esc(user.name || "")}</strong>
        <span>${_esc(user.email || "")}</span>
      `;
      dd.appendChild(info);

      const divider = document.createElement("div");
      divider.className = "lm-auth-dd-divider";
      dd.appendChild(divider);

      const logoutBtn = document.createElement("button");
      logoutBtn.className = "lm-auth-dd-logout";
      logoutBtn.textContent = "Sign out";
      logoutBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
        location.reload();
      });
      dd.appendChild(logoutBtn);

      return dd;
    },
  };

  function _esc(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Inject widget styles inline so the widget is self-contained
  const style = document.createElement("style");
  style.textContent = `
    .lm-auth-signin {
      display: inline-flex;
      align-items: center;
      padding: 7px 14px;
      border-radius: 6px;
      background: #005c2d;
      color: #fff;
      font-size: 12px;
      font-weight: 700;
      text-decoration: none;
      font-family: inherit;
      transition: background .15s, transform .12s;
      white-space: nowrap;
    }
    .lm-auth-signin:hover { background: #007a33; transform: translateY(-1px); }

    .lm-auth-chip {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 4px 10px 4px 4px;
      border: 1px solid rgba(0,0,0,.10);
      border-radius: 999px;
      background: rgba(255,255,255,.6);
      cursor: pointer;
      user-select: none;
      font-family: inherit;
      font-size: 12px;
      font-weight: 600;
      color: inherit;
      transition: background .15s, border-color .15s;
    }
    .lm-auth-chip:hover { background: rgba(255,255,255,.85); border-color: rgba(0,0,0,.18); }

    .lm-auth-avatar {
      width: 28px; height: 28px;
      border-radius: 50%;
      background: #005c2d;
      color: #fff;
      font-size: 12px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      flex-shrink: 0;
    }
    .lm-auth-avatar img { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; }

    .lm-auth-name { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .lm-auth-chevron { display: flex; align-items: center; color: #6b7a6e; }

    .lm-auth-dropdown {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      z-index: 999;
      min-width: 200px;
      border: 1px solid #e3ddd1;
      border-radius: 10px;
      background: #fdfcf8;
      box-shadow: 0 8px 24px rgba(30,43,34,.12), 0 2px 6px rgba(30,43,34,.07);
      overflow: hidden;
    }

    .lm-auth-dd-info {
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .lm-auth-dd-info strong { font-size: 13px; color: #1e2b22; font-weight: 700; }
    .lm-auth-dd-info span   { font-size: 11px; color: #6b7a6e; }

    .lm-auth-dd-divider { height: 1px; background: #e3ddd1; margin: 0; }

    .lm-auth-dd-logout {
      display: block;
      width: 100%;
      padding: 12px 16px;
      border: none;
      background: transparent;
      color: #8c1605;
      font-size: 13px;
      font-weight: 600;
      font-family: inherit;
      text-align: left;
      cursor: pointer;
      transition: background .15s;
    }
    .lm-auth-dd-logout:hover { background: #fff5f4; }
  `;
  document.head.appendChild(style);

  // Expose globally and auto-init
  window.LemongoAuth = LemongoAuth;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => LemongoAuth.init());
  } else {
    LemongoAuth.init();
  }
})();
