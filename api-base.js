"use strict";







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
      } catch (e) {  }
    }

    init = init || {};
    if (init.credentials === undefined) init.credentials = "include";
    return origFetch(input, init);
  };
})();
