// ============================================================
// Registrace service workeru (PWA: rychlejší načítání, ikona na
// ploše mobilu). Bez podpory v prohlížeči se prostě nic nestane.
// ============================================================

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // Tichý neúspěch (např. v místním náhledu bez HTTPS) — web
      // funguje dál i bez service workeru, jen bez PWA vychytávek.
    });
  });
}
