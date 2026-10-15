"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const yearEl = document.querySelector("#current-year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  setupNewsletter();
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

function setupNewsletter() {
  const form = document.querySelector("#newsletter-form");
  if (!form) return;
  const status = form.querySelector(".newsletter-status");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = form.email.value.trim();
    const name = form.name.value.trim();

    if (!email) {
      setStatus(status, "Please enter your email address.", "error");
      return;
    }

    const button = form.querySelector("button");
    button.disabled = true;
    setStatus(status, "Subscribing…", "");

    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, source: "landing" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Something went wrong. Please try again.");
      }
      form.reset();
      setStatus(
        status,
        data.alreadySubscribed
          ? "You’re already subscribed — thanks!"
          : "Thanks! Check your inbox for a welcome email.",
        "ok"
      );
    } catch (err) {
      setStatus(status, err.message || "Could not subscribe. Please try again.", "error");
    } finally {
      button.disabled = false;
    }
  });
}

function setStatus(el, message, state) {
  if (!el) return;
  el.textContent = message;
  if (state) el.dataset.state = state;
  else delete el.dataset.state;
}
