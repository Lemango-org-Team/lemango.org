"use strict";
/**
 * ads.js — shared AdSense loader for all Lemango pages.
 * Fetches the publisher ID from /api/config, then injects
 * AdSense script + <ins> tags into every .ad-slot on the page.
 */
(async function setupAds() {
  const slots = document.querySelectorAll(".ad-slot");
  if (!slots.length) return;

  // Fallback client ID used on static hosting where /api/config is unavailable.
  const FALLBACK_CLIENT = "ca-pub-2231892231966691";

  let adsenseClient = null;
  try {
    const res = await fetch("/api/config");
    if (res.ok) {
      const cfg = await res.json();
      adsenseClient = cfg.adsenseClient || null;
    }
  } catch {
    /* server offline — fall back to the hardcoded client ID */
  }
  if (!adsenseClient) adsenseClient = FALLBACK_CLIENT;

  if (adsenseClient) {
    // Only inject the AdSense script once per page
    if (!document.querySelector('script[src*="adsbygoogle"]')) {
      const script = document.createElement("script");
      script.async = true;
      script.crossOrigin = "anonymous";
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(adsenseClient)}`;
      script.onerror = function () {
        // Ad blocker or network block — hide the ad slot gracefully
        document.querySelectorAll(".ad-slot").forEach((slot) => {
          const mount = slot.querySelector(".ad-mount");
          if (mount) mount.textContent = "";
          slot.style.display = "none";
        });
      };
      document.head.appendChild(script);
    }
  }

  slots.forEach((slot) => {
    const mount = slot.querySelector(".ad-mount");
    if (!mount) return;
    const unit = slot.dataset.adUnit;

    if (adsenseClient && unit) {
      const ins = document.createElement("ins");
      ins.className = "adsbygoogle";
      ins.style.display = "block";
      ins.setAttribute("data-ad-client", adsenseClient);
      ins.setAttribute("data-ad-slot", unit);
      ins.setAttribute("data-full-width-responsive", "true");
      mount.textContent = "";
      mount.dataset.filled = "true";
      mount.appendChild(ins);
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch {
        /* AdSense not ready yet */
      }
    } else {
      mount.style.cssText = "padding:8px;text-align:center;font-size:11px;color:#94a3b8;";
      mount.textContent = "Ad space available";
    }
  });
}());
