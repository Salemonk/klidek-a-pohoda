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

// ---------- Přidání do kalendáře (.ics) ----------

// Formát data pro .ics: 20260718T190000Z (UTC, bez pomlček a dvojteček)
function proIcsDatum(iso) {
  return new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

// Escapování textu podle pravidel formátu .ics (čárky, středníky, nové řádky)
function escIcs(text) {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

// Vytvoří a stáhne .ics soubor pro danou akci; hodinová délka je odhad
// (na webu nezadáváme konec akce), člen si ji v kalendáři může upravit.
function pridejDoKalendare(nazev, popis, datumIso, delkaHodin = 2) {
  const zacatek = new Date(datumIso);
  const konec = new Date(zacatek.getTime() + delkaHodin * 60 * 60 * 1000);
  const nyni = proIcsDatum(new Date().toISOString());

  const radky = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Klidek a pohoda gaming//web//CS",
    "BEGIN:VEVENT",
    "UID:" + nyni + "-" + Math.random().toString(36).slice(2) + "@klidek-a-pohoda",
    "DTSTAMP:" + nyni,
    "DTSTART:" + proIcsDatum(zacatek.toISOString()),
    "DTEND:" + proIcsDatum(konec.toISOString()),
    "SUMMARY:" + escIcs(nazev),
    popis ? "DESCRIPTION:" + escIcs(popis) : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");

  const soubor = new Blob([radky], { type: "text/calendar;charset=utf-8" });
  const odkaz = document.createElement("a");
  odkaz.href = URL.createObjectURL(soubor);
  odkaz.download = "akce.ics";
  document.body.appendChild(odkaz);
  odkaz.click();
  odkaz.remove();
  URL.revokeObjectURL(odkaz.href);
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

// ---------- Paměť adres obrázků (úspora přenosu) ----------
//
// Obrázky v úložišti nejsou veřejné, sahá se na ně přes dočasné
// "podepsané adresy" platné 1 hodinu. Kdybychom je generovali při každém
// načtení znovu, měla by každá adresa jiný podpis a prohlížeč by obrázek
// pokaždé stáhl znovu. Proto si adresy pamatujeme (v úložišti prohlížeče):
// dokud platí, použije se stejná adresa a prohlížeč obrázek vezme ze své
// vlastní paměti, aniž by ho stahoval ze Supabase. To výrazně šetří přenos.

const PAMET_ADRES_KLIC = "kap-pamet-adres"; // prefix "kap" kvůli sdílenému původu na github.io
const PAMET_REZERVA_MS = 10 * 60 * 1000;    // adresu obnovíme 10 min před vypršením

function nactiPametAdres() {
  try {
    return JSON.parse(localStorage.getItem(PAMET_ADRES_KLIC)) || {};
  } catch (e) {
    return {};
  }
}

function ulozPametAdres(pamet) {
  try {
    localStorage.setItem(PAMET_ADRES_KLIC, JSON.stringify(pamet));
  } catch (e) { /* plné/zakázané úložiště nevadí, jen se nezrychlí */ }
}

// Vrátí mapu { cesta: adresa } pro dané cesty v úložišti.
// Z paměti vezme, co ještě platí; zbytek si vyžádá od Supabase a zapamatuje.
async function ziskejPodepsaneAdresy(bucket, cesty) {
  if (!cesty || cesty.length === 0) return {};

  const pamet = nactiPametAdres();
  const ted = Date.now();
  const vysledek = {};
  const chybejici = [];

  for (const cesta of cesty) {
    const zaznam = pamet[bucket + "::" + cesta];
    if (zaznam && zaznam.plati > ted) {
      vysledek[cesta] = zaznam.adresa;
    } else {
      chybejici.push(cesta);
    }
  }

  if (chybejici.length > 0) {
    const { data } = await sb.storage.from(bucket).createSignedUrls(chybejici, 3600);
    if (data) {
      for (const zaznam of data) {
        if (!zaznam.error) {
          vysledek[zaznam.path] = zaznam.signedUrl;
          pamet[bucket + "::" + zaznam.path] = {
            adresa: zaznam.signedUrl,
            plati: ted + 3600 * 1000 - PAMET_REZERVA_MS,
          };
        }
      }
    }
  }

  // Úklid prošlých záznamů, ať paměť neroste donekonečna
  for (const klic of Object.keys(pamet)) {
    if (pamet[klic].plati <= ted) delete pamet[klic];
  }
  ulozPametAdres(pamet);

  return vysledek;
}

// Zapomene uloženou adresu (voláme po výměně souboru na stejné cestě,
// např. při nahrání nového avatara, ať se hned ukáže ten nový)
function zapomenAdresu(bucket, cesta) {
  const pamet = nactiPametAdres();
  delete pamet[bucket + "::" + cesta];
  ulozPametAdres(pamet);
}

// ---------- Avatary ----------

// Avatary jsou v soukromém úložišti, vrátí mapu { idClena: adresa }
async function nactiAdresyAvataru(profilyMapa) {
  const sAvatarem = Object.values(profilyMapa).filter((p) => p.avatar);
  if (sAvatarem.length === 0) return {};

  const podleCesty = await ziskejPodepsaneAdresy("avatary", sAvatarem.map((p) => p.avatar));

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

// Z odkazů (http/https) v už OŠETŘENÉM textu udělá klikací odkazy.
// Pracuje výhradně na výstupu z esc(), takže se nedá zneužít k podstrčení
// kódu; povolené jsou jen adresy http(s), nikdy třeba "javascript:".
function linkujOdkazy(escapovanyText) {
  return escapovanyText.replace(/https?:\/\/[^\s<]+/g, (nalez) => {
    // Koncovou interpunkci (. , ! ? ) …) necháme mimo odkaz
    const m = nalez.match(/^(.*?)([.,!?;:)]*)$/);
    const adresa = m[1];
    const konec = m[2];
    return `<a href="${adresa}" target="_blank" rel="noopener">${adresa}</a>${konec}`;
  });
}

// Převede text se základním formátováním na HTML:
//   **tučně**  →  tučné písmo
//   *kurzíva*  →  kurzíva
//   řádek začínající "- "  →  odrážka
//   odkaz http(s)://…      →  klikací odkaz
function formatujText(text) {
  const radky = String(text).split("\n");
  let html = "";
  let vSeznamu = false;

  for (const radek of radky) {
    const formatovany = linkujOdkazy(
      esc(radek)
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    );

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
