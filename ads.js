"use strict";
/**
 * ads.js — shared AdSense loader for all Lemango pages.
 * Fetches the publisher ID from /api/config, then injects
 * AdSense script + <ins> tags into every .promo-slot on the page.
 */
(async function setupAds() {
  const slots = document.querySelectorAll(".promo-slot");
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
        document.querySelectorAll(".promo-slot").forEach((slot) => {
          const mount = slot.querySelector(".promo-mount");
          if (mount) mount.textContent = "";
          slot.style.display = "none";
        });
      };
      document.head.appendChild(script);
    }
  }

  slots.forEach((slot) => {
    const mount = slot.querySelector(".promo-mount");
    if (!mount) return;
    const unit = slot.dataset.adUnit;

    if (adsenseClient && unit) {
      const ins = document.createElement("ins");
      ins.className = "adsbygoogle";
      ins.style.display = "block";
      ins.setAttribute("data-ad-client", adsenseClient);
      ins.setAttribute("data-ad-slot", unit);
      ins.setAttribute("data-ad-format", "auto");
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
      // Placeholder promo (until AdSense is approved): promote Lemango's YouTube channels
      const channels = [
        { name: "Official Lemango", url: "https://www.youtube.com/@OfficialLemangoAccount", desc: "Tutorials & updates" },
        { name: "PineCocoApnuts", url: "https://www.youtube.com/@PineCocoApnuts", desc: "Dev logs & behind the scenes" }
      ];
      const pick = channels[Math.floor(Math.random() * channels.length)];
      mount.style.cssText = "padding:10px 12px;text-align:center;font-size:12px;background:linear-gradient(135deg,#fff,#f0fdfa);border:1px dashed #cbd5e1;border-radius:8px;";
      mount.innerHTML = "";
      const a = document.createElement("a");
      a.href = pick.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.style.cssText = "display:block;text-decoration:none;color:#0f172a;font-weight:700;";
      a.innerHTML = `<span style="display:block;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#007a33;margin-bottom:2px;">Subscribe on YouTube</span>
        <span style="display:block;font-size:13px;">${pick.name}</span>
        <span style="display:block;font-size:11px;color:#64748b;font-weight:400;margin-top:2px;">${pick.desc}</span>`;
      mount.appendChild(a);
    }
  });
}());
