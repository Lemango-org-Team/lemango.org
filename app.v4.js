"use strict";

document.addEventListener("DOMContentLoaded", () => {
  // ── Year ─────────────────────────────────────────────────
  const yearEl = document.querySelector("#current-year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  // ── Ads ──────────────────────────────────────────────────
  setupAds();

  // ── Scroll reveal ─────────────────────────────────────────
  setupReveal();

  // ── Mobile nav ────────────────────────────────────────────
  setupMobileNav();

  // ── Newsletter form ───────────────────────────────────────
  setupNewsletter();
});

/* ── Config fetch ─────────────────────────────────────────── */
async function getConfig() {
  try {
    const res = await fetch("/api/config");
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}

/* ── Ads ──────────────────────────────────────────────────── */
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

/* ── Scroll reveal ────────────────────────────────────────── */
function setupReveal() {
  const els = document.querySelectorAll(".reveal");
  if (!els.length) return;

  // Respect prefers-reduced-motion: mark everything visible immediately
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    els.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
  );

  els.forEach((el) => observer.observe(el));
}

/* ── Mobile hamburger nav ─────────────────────────────────── */
function setupMobileNav() {
  const btn     = document.getElementById("nav-hamburger");
  const overlay = document.getElementById("nav-overlay");
  if (!btn || !overlay) return;

  function openNav() {
    btn.setAttribute("aria-expanded", "true");
    overlay.setAttribute("aria-hidden", "false");
    overlay.style.display = "block";
    // Force reflow so transition fires
    overlay.getBoundingClientRect();
    overlay.classList.add("is-open");
    document.body.style.overflow = "hidden";
  }

  function closeNav() {
    btn.setAttribute("aria-expanded", "false");
    overlay.setAttribute("aria-hidden", "true");
    overlay.classList.remove("is-open");
    document.body.style.overflow = "";
    // Hide after transition
    overlay.addEventListener("transitionend", () => {
      if (!overlay.classList.contains("is-open")) {
        overlay.style.display = "";
      }
    }, { once: true });
  }

  btn.addEventListener("click", () => {
    const isOpen = btn.getAttribute("aria-expanded") === "true";
    isOpen ? closeNav() : openNav();
  });

  // Close on any link click inside overlay
  overlay.querySelectorAll("a").forEach((a) => {
    a.addEventListener("click", closeNav);
  });

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && btn.getAttribute("aria-expanded") === "true") closeNav();
  });
}

/* ── Newsletter form ──────────────────────────────────────── */
function setupNewsletter() {
  const form      = document.getElementById("newsletter-form");
  const statusEl  = document.getElementById("nl-status");
  const submitBtn = document.getElementById("nl-submit");
  const btnLabel  = document.getElementById("nl-btn-label");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = form.elements["email"]?.value?.trim() ?? "";
    const name  = form.elements["name"]?.value?.trim()  ?? "";

    // Basic client-side validation
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus("Please enter a valid email address.", "error");
      form.elements["email"].focus();
      return;
    }

    // Loading state
    submitBtn.disabled = true;
    btnLabel.textContent = "Subscribing…";
    setStatus("", "");

    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, source: "landing" }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.ok) {
        if (data.alreadySubscribed) {
          setStatus("You're already on the list — thanks!", "success");
        } else {
          setStatus("You're in! Check your inbox for a welcome email.", "success");
          form.reset();
        }
        submitBtn.disabled = true;
        btnLabel.textContent = "Subscribed ✓";
      } else {
        const msg = data.error || "Something went wrong. Please try again.";
        setStatus(msg, "error");
        submitBtn.disabled = false;
        btnLabel.textContent = "Subscribe";
      }
    } catch {
      setStatus("Network error — please check your connection and try again.", "error");
      submitBtn.disabled = false;
      btnLabel.textContent = "Subscribe";
    }
  });

  function setStatus(msg, type) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.className = "newsletter-note" + (type ? ` ${type}` : "");
  }
}
