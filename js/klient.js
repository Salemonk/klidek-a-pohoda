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

// Načte profil přihlášeného člena (přezdívka, role, avatar)
async function nactiMujProfil(uzivatelId) {
  const { data, error } = await sb
    .from("profily")
    .select("id, prezdivka, role, avatar")
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
  const { data, error } = await sb.from("profily").select("id, prezdivka, role, avatar");
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

// Je člen s tímto profilem vedení, nebo admin?
// (vedení smí: zakládat a upravovat akce, mazat cizí obsah, spravovat pozvánky)
function jeVedeni(profil) {
  return !!profil && (profil.role === "vedeni" || profil.role === "admin");
}

// ---------- Smajlíky ----------

const ZAKLADNI_EMOJI = [
  "😀", "😄", "😂", "🤣", "😊", "😉", "😜", "😎", "🤓", "🤔",
  "😅", "🙃", "😴", "🥱", "😢", "😭", "😡", "🤯", "🥳", "😱",
  "🙄", "😬", "🤗", "🤫", "😈", "💀", "🤖", "👾", "🐱", "🦥",
  "👍", "👎", "👌", "✌️", "🤘", "💪", "👏", "🙏", "🤝", "🖖",
  "❤️", "💙", "💚", "🔥", "✨", "⭐", "🎉", "🎮", "🕹️", "🎧",
  "🏆", "⚔️", "🛡️", "⛑️", "➕", "❤️‍🩹", "🏹", "🎯", "🍕", "🍺", "☕",
];

// Propojí tlačítko 😊, panel se smajlíky a textové pole.
// Kliknutí na smajlík ho vloží na pozici kurzoru.
function pripravEmojiVyber(tlacitkoId, panelId, poleId) {
  const tlacitko = document.getElementById(tlacitkoId);
  const panel = document.getElementById(panelId);
  const pole = document.getElementById(poleId);
  if (!tlacitko || !panel || !pole) return;

  panel.innerHTML = ZAKLADNI_EMOJI
    .map((e) => `<button type="button" class="emoji-volba">${e}</button>`)
    .join("");

  tlacitko.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
  });

  panel.addEventListener("click", (udalost) => {
    const volba = udalost.target.closest(".emoji-volba");
    if (!volba) return;
    const zacatek = pole.selectionStart ?? pole.value.length;
    const konec = pole.selectionEnd ?? pole.value.length;
    pole.value = pole.value.slice(0, zacatek) + volba.textContent + pole.value.slice(konec);
    const novaPozice = zacatek + volba.textContent.length;
    pole.focus();
    pole.setSelectionRange(novaPozice, novaPozice);
  });
}

// ---------- Avatary ----------

// Avatary jsou v soukromém úložišti, vyžádá k nim dočasné podepsané
// adresy a vrátí mapu { idClena: adresa }
async function nactiAdresyAvataru(profilyMapa) {
  const sAvatarem = Object.values(profilyMapa).filter((p) => p.avatar);
  if (sAvatarem.length === 0) return {};

  const { data } = await sb.storage
    .from("avatary")
    .createSignedUrls(sAvatarem.map((p) => p.avatar), 3600);

  const podleCesty = {};
  if (data) {
    for (const zaznam of data) {
      if (!zaznam.error) podleCesty[zaznam.path] = zaznam.signedUrl;
    }
  }
  const vysledek = {};
  for (const profil of sAvatarem) {
    if (podleCesty[profil.avatar]) vysledek[profil.id] = podleCesty[profil.avatar];
  }
  return vysledek;
}

// Kolečko s avatarem; kdo avatar nemá, dostane první písmeno přezdívky
function avatarHtml(profil, adresa) {
  if (adresa) return `<img class="avatar" src="${adresa}" alt="">`;
  const pismeno = profil && profil.prezdivka ? profil.prezdivka.charAt(0).toUpperCase() : "?";
  return `<span class="avatar avatar-pismeno">${esc(pismeno)}</span>`;
}

// ---------- Zmenšení obrázku před nahráním ----------
// Velké fotky zmenší a převede do úsporného JPG, aby se nezaplnilo
// úložiště a stránky se rychle načítaly.

async function zmensiObrazek(soubor, maxRozmer = 1600) {
  const bitmapa = await createImageBitmap(soubor);
  const pomer = Math.min(1, maxRozmer / Math.max(bitmapa.width, bitmapa.height));
  const sirka = Math.round(bitmapa.width * pomer);
  const vyska = Math.round(bitmapa.height * pomer);

  const platno = document.createElement("canvas");
  platno.width = sirka;
  platno.height = vyska;
  const kreslitko = platno.getContext("2d");
  kreslitko.fillStyle = "#ffffff"; // podklad pro průhledné PNG
  kreslitko.fillRect(0, 0, sirka, vyska);
  kreslitko.drawImage(bitmapa, 0, 0, sirka, vyska);
  bitmapa.close(); // uvolní paměť

  return new Promise((hotovo) => platno.toBlob(hotovo, "image/jpeg", 0.85));
}

// Ořízne obrázek na čtverec (střed) a zmenší, pro avatary
async function pripravAvatar(soubor, hranaVystupu = 256) {
  const bitmapa = await createImageBitmap(soubor);
  const hrana = Math.min(bitmapa.width, bitmapa.height);

  const platno = document.createElement("canvas");
  platno.width = hranaVystupu;
  platno.height = hranaVystupu;
  const kreslitko = platno.getContext("2d");
  kreslitko.fillStyle = "#ffffff";
  kreslitko.fillRect(0, 0, hranaVystupu, hranaVystupu);
  kreslitko.drawImage(
    bitmapa,
    (bitmapa.width - hrana) / 2, (bitmapa.height - hrana) / 2, hrana, hrana,
    0, 0, hranaVystupu, hranaVystupu
  );
  bitmapa.close(); // uvolní paměť

  return new Promise((hotovo) => platno.toBlob(hotovo, "image/jpeg", 0.85));
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
