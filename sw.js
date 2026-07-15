// ============================================================
// Service worker: rychlejší načítání a základní offline podpora
//
// Pravidla:
//   - Supabase (jiná doména) se NIKDY necachuje — chat, akce,
//     příspěvky musí být vždy čerstvé.
//   - Statické soubory webu (css, js, assets) se cachují,
//     ať se web příště načte rychleji i na slabším připojení.
//   - Stránky (HTML) se snaží nejdřív stáhnout čerstvé ze sítě;
//     jen když se to nepovede (offline), vezmou se z cache.
// ============================================================

const CACHE_NAZEV = "kap-cache-v5";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (udalost) => {
  udalost.waitUntil(
    caches.keys().then((klice) =>
      Promise.all(
        klice
          .filter((klic) => klic !== CACHE_NAZEV)
          .map((klic) => caches.delete(klic))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (udalost) => {
  const pozadavek = udalost.request;

  // Jen GET a jen náš vlastní web (Supabase i CDN necháme být)
  if (pozadavek.method !== "GET") return;
  if (new URL(pozadavek.url).origin !== self.location.origin) return;

  // Stránky (HTML): nejdřív síť, cache jen jako záchranná síť offline
  if (pozadavek.mode === "navigate") {
    udalost.respondWith(
      fetch(pozadavek)
        .then((odpoved) => {
          const kopie = odpoved.clone();
          caches.open(CACHE_NAZEV).then((cache) => cache.put(pozadavek, kopie));
          return odpoved;
        })
        .catch(() => caches.match(pozadavek))
    );
    return;
  }

  // Statické soubory (css, js, obrázky, fonty): nejdřív cache, pak síť
  udalost.respondWith(
    caches.match(pozadavek).then((zCache) => {
      if (zCache) return zCache;
      return fetch(pozadavek).then((odpoved) => {
        if (odpoved.ok) {
          const kopie = odpoved.clone();
          caches.open(CACHE_NAZEV).then((cache) => cache.put(pozadavek, kopie));
        }
        return odpoved;
      });
    })
  );
});
