"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const yearEl = document.querySelector("#current-year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  setupAds();
});

async function getConfig() {
  try {
    const res = await fetch("/api/config");
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}

async function setupAds() {
  const slots = document.querySelectorAll(".ad-slot");
  if (!slots.length) return;

  const { adsenseClient } = await getConfig();

  if (adsenseClient) {
    const script = document.createElement("script");
    script.async = true;
    script.crossOrigin = "anonymous";
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(adsenseClient)}`;
    document.head.appendChild(script);
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
      mount.textContent = "Ad space available";
    }
  });
}
