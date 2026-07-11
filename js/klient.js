// ============================================================
// Společný kód pro stránky, které pracují se Supabase
// (přihlášení, členská sekce, akce, chat, příspěvky)
// ============================================================

let sb = null; // klient Supabase, vytvoří se v inicializujSupabase()

// Zjistí, jestli je vyplněná konfigurace v js/config.js
function jeKonfiguraceVyplnena() {
  return (
    typeof KONFIG !== "undefined" &&
    KONFIG.SUPABASE_URL &&
    KONFIG.SUPABASE_URL !== "DOPLNTE" &&
    KONFIG.SUPABASE_ANON_KEY &&
    KONFIG.SUPABASE_ANON_KEY !== "DOPLNTE"
  );
}

// Vytvoří klienta Supabase. Když konfigurace chybí, zobrazí upozornění
// místo obsahu stránky a vrátí null.
function inicializujSupabase() {
  if (!jeKonfiguraceVyplnena()) {
    document.body.innerHTML = `
      <div class="konfigurace-chybi">
        <h2>⚙️ Web ještě není propojen s databází</h2>
        <p>Členská sekce potřebuje službu Supabase, která zajišťuje přihlašování,
        chat a ukládání dat.</p>
        <p>Otevřete soubor <code>js/config.js</code> a doplňte údaje podle návodu
        v souboru <code>NAVOD.md</code>.</p>
      </div>`;
    return null;
  }
  sb = window.supabase.createClient(KONFIG.SUPABASE_URL, KONFIG.SUPABASE_ANON_KEY);
  return sb;
}

// Použít na začátku každé členské stránky: ověří přihlášení.
// Nepřihlášeného návštěvníka přesměruje na přihlašovací stránku.
async function vyzadujPrihlaseni() {
  if (!inicializujSupabase()) return null;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    window.location.href = "prihlaseni.html";
    return null;
  }
  return session;
}

// Načte profil přihlášeného člena (přezdívka, role)
async function nactiMujProfil(uzivatelId) {
  const { data, error } = await sb
    .from("profily")
    .select("id, prezdivka, role")
    .eq("id", uzivatelId)
    .single();
  if (error) {
    console.error("Nepodařilo se načíst profil:", error);
    return null;
  }
  return data;
}

// Načte všechny profily a vrátí je jako mapu { id: profil }
// (guilda má max. desítky členů, takže je to v pořádku)
async function nactiVsechnyProfily() {
  const { data, error } = await sb.from("profily").select("id, prezdivka, role");
  if (error) {
    console.error("Nepodařilo se načíst profily:", error);
    return {};
  }
  const mapa = {};
  for (const profil of data) mapa[profil.id] = profil;
  return mapa;
}

// Odhlášení a návrat na veřejnou stránku
async function odhlasit() {
  await sb.auth.signOut();
  window.location.href = "index.html";
}

// ---------- Pomocné funkce ----------

// Ošetří text, aby se nedal podstrčit HTML kód (bezpečnost)
function esc(text) {
  return String(text).replace(/[&<>"']/g, (znak) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[znak]));
}

// Převede text se základním formátováním na HTML:
//   **tučně**  →  tučné písmo
//   *kurzíva*  →  kurzíva
//   řádek začínající "- "  →  odrážka
function formatujText(text) {
  const radky = String(text).split("\n");
  let html = "";
  let vSeznamu = false;

  for (const radek of radky) {
    const formatovany = esc(radek)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>");

    if (radek.startsWith("- ")) {
      if (!vSeznamu) { html += "<ul>"; vSeznamu = true; }
      html += "<li>" + formatovany.slice(2) + "</li>";
    } else {
      if (vSeznamu) { html += "</ul>"; vSeznamu = false; }
      if (radek.trim() !== "") html += "<p>" + formatovany + "</p>";
    }
  }
  if (vSeznamu) html += "</ul>";
  return html;
}

// Hezky zformátuje datum, např. "sobota 18. července 2026 v 19:00"
function formatujDatum(iso) {
  const datum = new Date(iso);
  const text = datum.toLocaleDateString("cs-CZ", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const cas = datum.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
  return `${text} v ${cas}`;
}

// Kratší formát pro chat, např. "10. 7. 21:35"
function formatujCasChatu(iso) {
  const datum = new Date(iso);
  return datum.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" })
    + " " + datum.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
}

// Zobrazí / skryje hlášku (chybovou nebo úspěšnou)
function zobrazHlasku(element, text) {
  element.textContent = text;
  element.classList.add("viditelna");
}
function skryjHlasku(element) {
  element.textContent = "";
  element.classList.remove("viditelna");
}
