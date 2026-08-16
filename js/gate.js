/* =========================================================================
   Simple PIN gate for GitHub Pages, backed by a Cloudflare Worker.

   The Worker holds your PIN and business data as server-side secrets. This
   script only ever sends the PIN the visitor typed and receives back either
   "no" or the business data — the PIN itself is never stored in this file
   or anywhere else in the static site.

   Unlock (and the business data that comes with it) is remembered for the
   current browser tab session only (sessionStorage) — closing the tab
   clears it.
   ========================================================================= */
(function () {
  // Same-origin Pages Function — no URL to configure, no CORS needed.
  const UNLOCK_URL = "/api/unlock";

  const SESSION_UNLOCKED_KEY = "ss-gate-unlocked";
  const SESSION_DATA_KEY = "ss-gate-data";

  const gate = document.getElementById("pinGate");
  if (!gate) return; // gate markup not present on this page

  const input = document.getElementById("pinGateInput");
  const form = document.getElementById("pinGateForm");
  const errorEl = document.getElementById("pinGateError");
  const submitBtn = document.getElementById("pinGateSubmit");

  function readCachedData() {
    try {
      const raw = sessionStorage.getItem(SESSION_DATA_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function applyData(data) {
    if (data && typeof window.SS_applyBizDefaults === "function") {
      window.SS_applyBizDefaults(data);
    }
  }

  function unlock(data) {
    try {
      sessionStorage.setItem(SESSION_UNLOCKED_KEY, "1");
      sessionStorage.setItem(SESSION_DATA_KEY, JSON.stringify(data || {}));
    } catch (e) { /* ignore */ }
    document.documentElement.classList.remove("gate-locked");
    applyData(data);
  }

  function isUnlocked() {
    try { return sessionStorage.getItem(SESSION_UNLOCKED_KEY) === "1"; }
    catch (e) { return false; }
  }

  function showError(msg) {
    if (errorEl) errorEl.textContent = msg;
    gate.classList.add("shake");
    setTimeout(() => gate.classList.remove("shake"), 400);
  }

  async function checkPin(entered) {
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Controleren…"; }
    if (errorEl) errorEl.textContent = "";
    try {
      const res = await fetch(UNLOCK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: entered.trim() }),
      });
      const payload = await res.json().catch(() => ({ ok: false }));
      if (res.ok && payload.ok) {
        unlock(payload.data);
      } else {
        showError("Onjuiste pincode. Probeer opnieuw.");
        if (input) { input.value = ""; input.focus(); }
      }
    } catch (e) {
      showError("Kan pincode niet controleren — check je internetverbinding.");
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Ontgrendel"; }
    }
  }

  // Already unlocked earlier this session — skip the network round trip.
  if (isUnlocked()) {
    document.documentElement.classList.remove("gate-locked");
    applyData(readCachedData());
  }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      const entered = input ? input.value : "";
      if (!entered) return;
      checkPin(entered);
    });
  }

  if (document.documentElement.classList.contains("gate-locked") && input) {
    setTimeout(() => input.focus(), 50);
  }
})();
