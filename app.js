"use strict";

document.addEventListener("DOMContentLoaded", () => {
  // ── Year ─────────────────────────────────────────────────
  const yearEl = document.querySelector("#current-year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  // ── Scroll reveal ─────────────────────────────────────────
  setupReveal();

  // ── Mobile nav ────────────────────────────────────────────
  setupMobileNav();
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

/* ── Ads — handled by ads.js (shared across all pages) ────── */

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
