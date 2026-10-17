"use strict";
/**
 * api-base.js — allows the frontend (hosted on GitHub Pages) to talk to a
 * backend hosted elsewhere. Set the backend URL via:
 *   <meta name="lemango-api-base" content="https://your-backend.onrender.com">
 * or window.LEMANGO_API_BASE before this script loads. When unset, requests
 * stay relative (current single-host behavior).
 */
(function () {
  const meta = document.querySelector('meta[name="lemango-api-base"]');
  const base = ((meta && meta.content) || window.LEMANGO_API_BASE || "").trim().replace(/\/+$/, "");
  window.LEMANGO_API_BASE = base;

  if (!base) return;

  const origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    if (typeof input === "string" && input.startsWith("/api/")) {
      input = base + input;
    } else if (input instanceof Request) {
      try {
        const url = new URL(input.url);
        if (url.pathname.startsWith("/api/")) {
          input = new Request(base + url.pathname + url.search, input);
        }
      } catch (e) { /* ignore */ }
    }
    // Ensure cookies are sent cross-origin for auth/session endpoints.
    init = init || {};
    if (init.credentials === undefined) init.credentials = "include";
    return origFetch(input, init);
  };
})();
