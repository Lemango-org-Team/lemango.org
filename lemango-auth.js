"use strict";
/**
 * lemongo-auth.js — client-side "Sign in with Google" (Google Identity Services).
 * Works on static hosting (no backend required). Stores the signed-in user in
 * localStorage so other pages (and the AI daily limit) can read it.
 *
 * Uses Google's official renderButton so each click re-opens the account chooser
 * (unlike prompt(), which has dismissal cooldowns).
 *
 * Exposes window.LemangoAuth = { user, init, mount, signIn, signOut, isSignedIn }.
 */
(function () {
  const CLIENT_ID = "417747434436-j8ohlhkpo982m8uvum322d9mirg7n7gb.apps.googleusercontent.com";
  const USER_KEY = "lemango_user";
  // Below this width the official Google button (fixed 220px) no longer fits
  // inside the site headers and pushes the whole page into horizontal scroll.
  // Narrow screens get a compact "Sign in" link to /auth instead.
  const COMPACT_MAX = 960;
  const LemangoAuth = {
    user: null,
    _scriptPromise: null,
    _compactQuery: null,
    load() {
      if (window.google && window.google.accounts) return Promise.resolve();
      if (this._scriptPromise) return this._scriptPromise;
      this._scriptPromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://accounts.google.com/gsi/client";
        s.async = true; s.defer = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("Could not load Google Identity Services."));
        document.head.appendChild(s);
      });
      return this._scriptPromise;
    },
    decodeCredential(token) {
      try {
        const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        const json = decodeURIComponent(atob(part).split("").map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join(""));
        return JSON.parse(json);
      } catch (e) { return null; }
    },
    async init() {
      try {
        const raw = localStorage.getItem(USER_KEY);
        if (raw) this.user = JSON.parse(raw);
      } catch { this.user = null; }
      this._watchCompact();
      document.querySelectorAll("[data-auth-widget]").forEach((el) => this.mount(el));
      document.dispatchEvent(new CustomEvent("lm:auth", { detail: { user: this.user } }));
    },
    _isCompact() {
      return window.matchMedia("(max-width: " + COMPACT_MAX + "px)").matches;
    },
    _watchCompact() {
      if (this._compactQuery) return;
      this._compactQuery = window.matchMedia("(max-width: " + COMPACT_MAX + "px)");
      const onChange = () => {
        this._remountAll();
        document.dispatchEvent(new CustomEvent("lm:auth", { detail: { user: this.user } }));
      };
      if (this._compactQuery.addEventListener) this._compactQuery.addEventListener("change", onChange);
      else if (this._compactQuery.addListener) this._compactQuery.addListener(onChange);
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
        container.appendChild(this._buildSignInBtn(container));
      }
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
        img.width = 28; img.height = 28;
        img.referrerPolicy = "no-referrer";
        avatar.appendChild(img);
      } else {
        avatar.textContent = (user.given_name || user.name || "?")[0].toUpperCase();
      }
      const name = document.createElement("span");
      name.className = "lm-auth-name";
      name.textContent = user.given_name || user.name || user.email;
      wrap.appendChild(avatar);
      wrap.appendChild(name);

      const out = document.createElement("button");
      out.type = "button";
      out.className = "lm-auth-signout";
      out.textContent = "Sign out";
      out.style.background = "transparent";
      out.style.border = "none";
      out.style.fontWeight = "600";
      out.style.cursor = "pointer";
      out.style.fontSize = "12px";
      out.addEventListener("click", (e) => { e.stopPropagation(); this.signOut(); });
      wrap.appendChild(out);
      return wrap;
    },

    _buildSignInBtn(container) {
      const wrap = document.createElement("div");
      wrap.className = "lm-auth-signin-wrap";
      wrap.style.display = "inline-block";
      // `data-auth-compact` forces the small link even on wide screens. Used by
      // tool UIs whose toolbars are already crowded and cannot fit 220px.
      if (this._isCompact() || (container && container.hasAttribute("data-auth-compact"))) {
        wrap.appendChild(this._buildCompactSignIn());
      } else {
        this._renderGoogleButton(wrap, container);
      }
      return wrap;
    },
    // Narrow screens: a small link to the dedicated sign-in page instead of the
    // 220px Google button, which cannot shrink and overflows mobile headers.
    _buildCompactSignIn() {
      const a = document.createElement("a");
      a.href = "/auth?next=" + encodeURIComponent(location.pathname + location.search);
      a.className = "lm-auth-signin lm-auth-signin-compact";
      a.textContent = "Sign in";
      a.setAttribute("aria-label", "Sign in with Google");
      a.style.cssText = "background:#ffffff;color:#1e2b22;border:1.5px solid #c8cfc5;border-radius:6px;padding:6px 12px;font-weight:700;font-size:12px;text-decoration:none;display:inline-block;white-space:nowrap;line-height:1.4;";
      return a;
    },
    async _renderGoogleButton(wrap, container) {
      try {
        await this.load();
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (resp) => {
            const u = this.decodeCredential(resp.credential);
            if (!u) return;
            this.user = {
              googleId: u.sub, email: u.email, name: u.name,
              given_name: u.given_name || "", picture: u.picture || "", avatar: u.picture || "",
              idToken: resp.credential
            };
            try { localStorage.setItem(USER_KEY, JSON.stringify(this.user)); } catch {}
            this.mount(container);
            document.dispatchEvent(new CustomEvent("lm:auth", { detail: { user: this.user } }));
          },
          cancel_on_tap_outside: false
        });
        window.google.accounts.id.renderButton(wrap, {
          theme: "outline",
          size: "large",
          text: "signin_with",
          shape: "rectangular",
          logo_alignment: "left",
          width: 220
        });
      } catch (e) {
        console.warn("Google sign-in failed:", e);
        const fallback = document.createElement("button");
        fallback.type = "button";
        fallback.textContent = "Sign in with Google";
        fallback.style.cssText = "background:#ffffff;color:#1e2b22;border:1.5px solid #c8cfc5;border-radius:6px;padding:7px 14px;font-weight:700;cursor:pointer;font-size:12px;";
        fallback.addEventListener("click", () => this.signIn(container));
        wrap.appendChild(fallback);
      }
    },
    async signIn(container) {
      // Fallback path (used if renderButton fails). Uses prompt with cancel_on_tap_outside false.
      try {
        await this.load();
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (resp) => {
            const u = this.decodeCredential(resp.credential);
            if (!u) return;
            this.user = {
              googleId: u.sub, email: u.email, name: u.name,
              given_name: u.given_name || "", picture: u.picture || "", avatar: u.picture || "",
              idToken: resp.credential
            };
            try { localStorage.setItem(USER_KEY, JSON.stringify(this.user)); } catch {}
            this.mount(container);
            document.dispatchEvent(new CustomEvent("lm:auth", { detail: { user: this.user } }));
          },
          cancel_on_tap_outside: false
        });
        window.google.accounts.id.prompt((notification) => {
          // If One Tap is dismissed/skipped, do nothing; the rendered button still works.
          if (notification && notification.isNotDisplayed && notification.isNotDisplayed()) {
            console.info("One Tap not displayed:", notification.getNotDisplayedReason && notification.getNotDisplayedReason());
          }
        });
      } catch (e) { console.warn("Google sign-in failed:", e); }
    },
    signOut() {
      this.user = null;
      try { localStorage.removeItem(USER_KEY); } catch {}
      document.querySelectorAll("[data-auth-widget]").forEach((el) => this.mount(el));
      document.dispatchEvent(new CustomEvent("lm:auth", { detail: { user: null } }));
      try { if (window.google && window.google.accounts) window.google.accounts.id.disableAutoSelect(); } catch (e) {}
    },
    isSignedIn() { return !!this.user; }
  };

  const style = document.createElement("style");
  style.textContent = `
    .lm-auth-signin-wrap { display:inline-block; max-width:100%; }
    .lm-auth-signin-compact { max-width:100%; }
    .lm-auth-chip { position:relative;display:inline-flex;align-items:center;gap:7px;padding:4px 10px 4px 4px;border:1px solid rgba(0,0,0,.10);border-radius:999px;background:rgba(255,255,255,.6);font-family:inherit;font-size:12px;font-weight:600;color:inherit; }
    .lm-auth-avatar { width:28px;height:28px;border-radius:50%;background:#005c2d;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0; }
    .lm-auth-avatar img { width:28px;height:28px;border-radius:50%;object-fit:cover; }
    .lm-auth-name { max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
    .lm-auth-signout { border:none;background:transparent;color:#8c1605;font-size:11px;font-weight:600;cursor:pointer;margin-left:4px; }
    .lm-auth-signout:hover { text-decoration:underline; }
  `;
  document.head.appendChild(style);

  window.LemangoAuth = LemangoAuth;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => LemangoAuth.init());
  } else {
    LemangoAuth.init();
  }
})();
