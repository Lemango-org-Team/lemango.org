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
  const LemangoAuth = {
    user: null,
    _scriptPromise: null,
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
      document.querySelectorAll("[data-auth-widget]").forEach((el) => this.mount(el));
      document.dispatchEvent(new CustomEvent("lm:auth", { detail: { user: this.user } }));
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
    _buildSignInBtn(container) {
      const wrap = document.createElement("div");
      wrap.className = "lm-auth-signin-wrap";
      wrap.style.display = "inline-block";
      this._renderGoogleButton(wrap, container);
      return wrap;
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
    .lm-auth-signin-wrap { display:inline-block; }
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
