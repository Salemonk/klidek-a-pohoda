// ============================================================
// Nástěnka příspěvků: psaní a čtení příspěvků členů
// ============================================================

let mujProfil = null;
let mojeId = null;
let profily = {};
let obrazkyPodleId = {}; // id příspěvku → cesta k obrázku v úložišti
let avatary = {};        // id člena → adresa avataru
let reakcePodleId = {};  // id příspěvku → pole reakcí {clen_id, emoji}
let komentarePodleId = {}; // id příspěvku → pole komentářů {clen_id, text, …}
let nactenePrispevky = []; // naposledy načtené příspěvky (pro úpravy)

const ULOZISTE = "prispevky-obrazky";

async function spustStranku() {
  const session = await vyzadujPrihlaseni();
  if (!session) return;

  oznacSekciPrectenou("prispevky");
  mojeId = session.user.id;
  // Profil a seznam členů na sobě nezávisí, načtou se souběžně
  [mujProfil, profily] = await Promise.all([nactiMujProfil(mojeId), nactiVsechnyProfily()]);
  avatary = await nactiAdresyAvataru(profily);

  pripravFormular();
  pripravEmojiVyber("emoji-tlacitko-prispevek", "emoji-panel-prispevek", "text-prispevku");
  await nactiPrispevky();
}

// ---------- Vytvoření příspěvku ----------
// (zmenšování obrázků zajišťuje zmensiObrazek() ve společném klient.js)

function pripravFormular() {
  const formular = document.getElementById("formular-prispevek");
  const chyba = document.getElementById("chyba-prispevek");
  const tlacitko = document.getElementById("tlacitko-zverejnit");
  const poleObrazku = document.getElementById("obrazek-prispevku");
  const infoObrazku = document.getElementById("info-obrazku");

  function aktualizujInfoObrazku() {
    const soubor = poleObrazku.files[0];
    infoObrazku.textContent = soubor ? `📎 Přiložen obrázek: ${esc(soubor.name)}` : "";
  }
  poleObrazku.addEventListener("change", aktualizujInfoObrazku);

  // Vložení screenshotu ze schránky (Ctrl+V) přímo do textu příspěvku:
  // najde v vložených datech obrázek a naplní jím stejné pole pro soubor,
  // které se používá i při výběru přes tlačítko (DataTransfer simuluje
  // výběr souboru, zbytek nahrávání se pak řeší úplně stejně)
  document.getElementById("text-prispevku").addEventListener("paste", (udalost) => {
    const polozky = udalost.clipboardData && udalost.clipboardData.items;
    if (!polozky) return;

    for (const polozka of polozky) {
      if (!polozka.type.startsWith("image/")) continue;
      const soubor = polozka.getAsFile();
      if (!soubor) continue;

      const prenos = new DataTransfer();
      prenos.items.add(soubor);
      poleObrazku.files = prenos.files;
      aktualizujInfoObrazku();
      zobrazToast("Screenshot vložen, přiloží se k příspěvku. 📸", "uspech");
      udalost.preventDefault();
      break;
    }
  });

  formular.addEventListener("submit", async (udalost) => {
    udalost.preventDefault();
    skryjHlasku(chyba);

    const nadpis = document.getElementById("nadpis").value.trim();
    const text = document.getElementById("text-prispevku").value.trim();
    const soubor = document.getElementById("obrazek-prispevku").files[0];
    if (!nadpis || !text) return;

    tlacitko.disabled = true;
    tlacitko.textContent = "Zveřejňuji…";

    // Když je přiložený obrázek, nejdřív ho zmenšíme a nahrajeme
    let cestaObrazku = null;
    if (soubor) {
      if (!soubor.type.startsWith("image/")) {
        zobrazHlasku(chyba, "Přiložený soubor není obrázek.");
        tlacitko.disabled = false;
        tlacitko.textContent = "Zveřejnit příspěvek";
        return;
      }
      try {
        const zmenseny = await zmensiObrazek(soubor);
        cestaObrazku = `${mojeId}/${Date.now()}.jpg`;
        const { error: chybaNahrani } = await sb.storage
          .from(ULOZISTE)
          .upload(cestaObrazku, zmenseny, { contentType: "image/jpeg" });
        if (chybaNahrani) throw chybaNahrani;
      } catch (e) {
        zobrazHlasku(chyba, "Obrázek se nepodařilo nahrát: " + (e.message || e));
        tlacitko.disabled = false;
        tlacitko.textContent = "Zveřejnit příspěvek";
        return;
      }
    }

    const { error } = await sb.from("prispevky").insert({
      autor: mojeId,
      nadpis: nadpis,
      text: text,
      obrazek: cestaObrazku,
    });

    tlacitko.disabled = false;
    tlacitko.textContent = "Zveřejnit příspěvek";

    if (error) {
      // Příspěvek se neuložil, uklidíme už nahraný obrázek
      if (cestaObrazku) await sb.storage.from(ULOZISTE).remove([cestaObrazku]);
      zobrazHlasku(chyba, "Příspěvek se nepodařilo uložit: " + error.message);
      return;
    }
    formular.reset();
    infoObrazku.textContent = "";
    await nactiPrispevky();
  });
}

// ---------- Načtení a vykreslení příspěvků ----------

// Kolik příspěvků se ukáže hned; tlačítko "načíst starší" postupně přidává.
// Zobrazují se jen novější příspěvky, staré (a jejich obrázky) se nestahují,
// dokud si o ně člen sám neřekne. Šetří to přenos dat ze Supabase.
const DAVKA_PRISPEVKU = 15;
let zobrazenoPrispevku = DAVKA_PRISPEVKU;

async function nactiPrispevky() {
  const prvek = document.getElementById("seznam-prispevku");

  // O jeden navíc, abychom poznali, jestli existují ještě starší příspěvky
  const { data, error } = await sb
    .from("prispevky")
    .select("id, autor, nadpis, text, obrazek, pripnuto, vytvoreno, upraveno, reakce(clen_id, emoji), komentare(clen_id, text, vytvoreno, upraveno)")
    .order("pripnuto", { ascending: false })
    .order("vytvoreno", { ascending: false })
    .limit(zobrazenoPrispevku + 1);

  prvek.classList.remove("nacitani");

  if (error) {
    prvek.textContent = "Příspěvky se nepodařilo načíst.";
    return;
  }
  if (data.length === 0) {
    prvek.innerHTML = `<div class="panel-blok"><p>Zatím tu není žádný příspěvek.
      Napiš první nahoře ve formuláři! 🙂</p></div>`;
    return;
  }

  const jsouStarsi = data.length > zobrazenoPrispevku;
  const prispevkyKZobrazeni = data.slice(0, zobrazenoPrispevku);

  // Obrázky jsou v soukromém úložišti, adresy bereme z paměti (viz klient.js),
  // takže se stejný obrázek nestahuje při každém načtení znovu.
  obrazkyPodleId = {};
  const cesty = prispevkyKZobrazeni.filter((p) => p.obrazek).map((p) => p.obrazek);
  const adresyObrazku = await ziskejPodepsaneAdresy(ULOZISTE, cesty);

  reakcePodleId = {};
  komentarePodleId = {};
  nactenePrispevky = prispevkyKZobrazeni;
  prvek.innerHTML = prispevkyKZobrazeni.map((prispevek) => {
    const profil = profily[prispevek.autor];
    const jeMuj = prispevek.autor === mojeId;
    const smiSmazat = jeMuj || jeVedeni(mujProfil);
    if (prispevek.obrazek) obrazkyPodleId[prispevek.id] = prispevek.obrazek;
    const adresa = prispevek.obrazek ? adresyObrazku[prispevek.obrazek] : null;
    reakcePodleId[prispevek.id] = prispevek.reakce || [];
    komentarePodleId[prispevek.id] = prispevek.komentare || [];

    const smiPripnout = jeVedeni(mujProfil);

    return `
      <article class="prispevek ${prispevek.pripnuto ? "pripnuto" : ""}" id="prispevek-${prispevek.id}">
        <h3>${prispevek.pripnuto ? '<span class="stitek" title="Připnutý příspěvek">📌 připnuto</span> ' : ""}${esc(prispevek.nadpis)}</h3>
        <div class="prispevek-meta">
          ${avatarHtml(profil, avatary[prispevek.autor])}
          ${profil ? esc(profil.prezdivka) : "?"} · ${formatujDatum(prispevek.vytvoreno)}
          ${prispevek.upraveno ? " · upraveno" : ""}
          ${jeMuj ? `· <button class="zprava-smazat" onclick="zacniUpravuPrispevku(${prispevek.id})">upravit</button>` : ""}
          ${smiPripnout ? `· <button class="zprava-smazat" onclick="prepniPripnuti(${prispevek.id}, ${prispevek.pripnuto})">${prispevek.pripnuto ? "odepnout" : "připnout"}</button>` : ""}
          ${smiSmazat ? `· <button class="zprava-smazat" onclick="smazPrispevek(${prispevek.id})">smazat</button>` : ""}
        </div>
        <div class="prispevek-text">${formatujText(prispevek.text)}</div>
        ${adresa ? `<a href="${adresa}" target="_blank" title="Otevřít v plné velikosti">
          <img class="prispevek-obrazek" src="${adresa}" alt="Obrázek k příspěvku" loading="lazy"></a>` : ""}
        ${reakceHtml(prispevek)}
        ${komentareHtml(prispevek)}
      </article>`;
  }).join("")
  + (jsouStarsi
      ? `<button class="tlacitko tlacitko-obrys" onclick="nactiStarsiPrispevky()"
           style="display:block; margin:8px auto 0;">Načíst starší příspěvky</button>`
      : "");
}

// Přidá další dávku příspěvků k zobrazení
function nactiStarsiPrispevky() {
  zobrazenoPrispevku += DAVKA_PRISPEVKU;
  nactiPrispevky();
}

// ---------- Úprava vlastního příspěvku ----------

function zacniUpravuPrispevku(prispevekId) {
  const prispevek = nactenePrispevky.find((p) => p.id === prispevekId);
  if (!prispevek) return;

  const clanek = document.getElementById("prispevek-" + prispevekId);
  clanek.innerHTML = `
    <form onsubmit="ulozUpravuPrispevku(event, ${prispevekId})">
      <label for="uprava-nadpis">Nadpis</label>
      <input type="text" id="uprava-nadpis" maxlength="120" required value="${esc(prispevek.nadpis)}">

      <label for="uprava-text">Text</label>
      <textarea id="uprava-text" rows="6" required>${esc(prispevek.text)}</textarea>

      <button type="submit" class="tlacitko tlacitko-male">Uložit změny</button>
      <button type="button" class="tlacitko-nenapadne" onclick="nactiPrispevky()">Zrušit</button>
    </form>`;
}

async function ulozUpravuPrispevku(udalost, prispevekId) {
  udalost.preventDefault();

  const nadpis = document.getElementById("uprava-nadpis").value.trim();
  const text = document.getElementById("uprava-text").value.trim();
  if (!nadpis || !text) return;

  const { error } = await sb.from("prispevky")
    .update({ nadpis: nadpis, text: text, upraveno: new Date().toISOString() })
    .eq("id", prispevekId);

  if (error) {
    zobrazToast("Úpravu se nepodařilo uložit: " + error.message);
    return;
  }
  await nactiPrispevky();
}

// ---------- Reakce smajlíkem ----------

// Řádek s reakcemi pod příspěvkem: seskupené smajlíky s počty
// (moje reakce jsou zvýrazněné) + tlačítko na přidání další
function reakceHtml(prispevek) {
  const skupiny = {};
  for (const reakce of prispevek.reakce || []) {
    (skupiny[reakce.emoji] = skupiny[reakce.emoji] || []).push(reakce.clen_id);
  }

  const chipy = Object.entries(skupiny).map(([emoji, clenove]) => {
    const moje = clenove.includes(mojeId);
    const jmena = clenove.map((id) => profily[id] ? profily[id].prezdivka : "?").join(", ");
    return `<button class="reakce-chip ${moje ? "moje" : ""}" title="${esc(jmena)}"
      onclick="prepniReakci(${prispevek.id}, '${emoji}')">${emoji}&nbsp;${clenove.length}</button>`;
  }).join("");

  return `<div class="reakce-radek">${chipy}
    <button class="reakce-pridat" title="Přidat reakci" aria-label="Přidat reakci"
      onclick="otevriPanelReakci(${prispevek.id}, this)">😊+</button></div>`;
}

// Otevře (nebo schová) panel se smajlíky pod daným příspěvkem
// (sdílený plovoucí panel z klient.js)
function otevriPanelReakci(prispevekId, tlacitko) {
  const radek = tlacitko.closest(".reakce-radek");
  otevriPlovouciEmojiPanel("panel-reakci", radek, async (emoji) => {
    document.getElementById("panel-reakci").hidden = true;
    await prepniReakci(prispevekId, emoji);
  });
}

// Přidá, nebo odebere moji reakci daným smajlíkem
async function prepniReakci(prispevekId, emoji) {
  prispevekId = Number(prispevekId);
  const mojeUzExistuje = (reakcePodleId[prispevekId] || [])
    .some((r) => r.clen_id === mojeId && r.emoji === emoji);

  let vysledek;
  if (mojeUzExistuje) {
    vysledek = await sb.from("reakce").delete()
      .eq("prispevek_id", prispevekId)
      .eq("clen_id", mojeId)
      .eq("emoji", emoji);
  } else {
    vysledek = await sb.from("reakce").insert({
      prispevek_id: prispevekId,
      clen_id: mojeId,
      emoji: emoji,
    });
  }

  if (vysledek.error) {
    zobrazToast("Reakci se nepodařilo uložit: " + vysledek.error.message);
    return;
  }
  await nactiPrispevky();
}

// ---------- Komentáře ----------
// Každý člen může k příspěvku napsat jeden komentář (vynucuje to složený
// primární klíč v databázi), svůj komentář může upravit nebo smazat.
// Cizí komentáře smí mazat vedení (moderace).

function komentareHtml(prispevek) {
  const komentare = (prispevek.komentare || [])
    .slice()
    .sort((a, b) => new Date(a.vytvoreno) - new Date(b.vytvoreno));

  const mamKomentar = komentare.some((k) => k.clen_id === mojeId);

  const radky = komentare.map((koment) => {
    const profil = profily[koment.clen_id];
    const jeMuj = koment.clen_id === mojeId;
    const smiSmazat = jeMuj || jeVedeni(mujProfil);
    return `
      <div class="komentar" id="komentar-${prispevek.id}-${koment.clen_id}">
        ${avatarHtml(profil, avatary[koment.clen_id])}
        <div class="komentar-obsah">
          <div class="komentar-meta">
            <strong>${profil ? esc(profil.prezdivka) : "?"}</strong>
            · ${formatujCasChatu(koment.vytvoreno)}
            ${koment.upraveno ? " · upraveno" : ""}
            ${jeMuj ? `· <button class="zprava-smazat" onclick="zacniUpravuKomentare(${prispevek.id})">upravit</button>` : ""}
            ${smiSmazat ? `· <button class="zprava-smazat" onclick="smazKomentar(${prispevek.id}, '${koment.clen_id}')">smazat</button>` : ""}
          </div>
          <div class="komentar-text">${formatujText(koment.text)}</div>
        </div>
      </div>`;
  }).join("");

  // Formulář jen pro toho, kdo ještě komentář nemá
  const formular = mamKomentar ? "" : `
    <form class="komentar-formular" onsubmit="pridejKomentar(event, ${prispevek.id})">
      <button type="button" class="emoji-tlacitko" title="Smajlíky" aria-label="Smajlíky"
        onclick="otevriPanelKomentare('koment-text-${prispevek.id}', this)">😊</button>
      <input type="text" id="koment-text-${prispevek.id}" maxlength="500"
        placeholder="Napiš komentář…" autocomplete="off" required>
      <button type="submit" class="tlacitko tlacitko-male">Přidat komentář</button>
      <p class="napoveda-formatovani">Formátování: <strong>**tučně**</strong>, <em>*kurzíva*</em>.</p>
    </form>`;

  return `<div class="komentare-blok">${radky}${formular}</div>`;
}

async function pridejKomentar(udalost, prispevekId) {
  udalost.preventDefault();
  const pole = document.getElementById("koment-text-" + prispevekId);
  const text = pole.value.trim();
  if (!text) return;

  const { error } = await sb.from("komentare").insert({
    prispevek_id: prispevekId,
    clen_id: mojeId,
    text: text,
  });

  if (error) {
    zobrazToast("Komentář se nepodařilo uložit: " + error.message);
    return;
  }
  await nactiPrispevky();
}

function zacniUpravuKomentare(prispevekId) {
  const koment = (komentarePodleId[prispevekId] || []).find((k) => k.clen_id === mojeId);
  if (!koment) return;

  const radek = document.getElementById(`komentar-${prispevekId}-${mojeId}`);
  radek.innerHTML = `
    <form class="komentar-formular" onsubmit="ulozUpravuKomentare(event, ${prispevekId})">
      <button type="button" class="emoji-tlacitko" title="Smajlíky" aria-label="Smajlíky"
        onclick="otevriPanelKomentare('koment-uprava-${prispevekId}', this)">😊</button>
      <input type="text" id="koment-uprava-${prispevekId}" maxlength="500"
        autocomplete="off" required value="${esc(koment.text)}">
      <button type="submit" class="tlacitko tlacitko-male">Uložit</button>
      <button type="button" class="tlacitko-nenapadne" onclick="nactiPrispevky()">Zrušit</button>
      <p class="napoveda-formatovani">Formátování: <strong>**tučně**</strong>, <em>*kurzíva*</em>.</p>
    </form>`;
  document.getElementById("koment-uprava-" + prispevekId).focus();
}

async function ulozUpravuKomentare(udalost, prispevekId) {
  udalost.preventDefault();
  const text = document.getElementById("koment-uprava-" + prispevekId).value.trim();
  if (!text) return;

  const { error } = await sb.from("komentare")
    .update({ text: text, upraveno: new Date().toISOString() })
    .eq("prispevek_id", prispevekId)
    .eq("clen_id", mojeId);

  if (error) {
    zobrazToast("Úpravu se nepodařilo uložit: " + error.message);
    return;
  }
  await nactiPrispevky();
}

async function smazKomentar(prispevekId, clenId) {
  if (!confirm("Opravdu smazat tento komentář?")) return;

  const { error } = await sb.from("komentare").delete()
    .eq("prispevek_id", prispevekId)
    .eq("clen_id", clenId);

  if (error) {
    zobrazToast("Smazání se nepodařilo: " + error.message);
    return;
  }
  await nactiPrispevky();
}

// Plovoucí panel se smajlíky pro formulář komentáře: jeden sdílený,
// přesouvá se k aktivnímu formuláři a vkládá na pozici kurzoru
// (sdílený plovoucí panel z klient.js)
function otevriPanelKomentare(inputId, tlacitko) {
  const formular = tlacitko.closest(".komentar-formular");
  otevriPlovouciEmojiPanel("panel-emoji-komentar", formular, (emoji) => {
    const pole = document.getElementById(inputId);
    if (pole) vlozEmojiDoPole(pole, emoji);
  });
}

// ---------- Připnutí příspěvku (jen vedení a admin) ----------

async function prepniPripnuti(prispevekId, aktualnePripnuto) {
  const { error } = await sb.from("prispevky")
    .update({ pripnuto: !aktualnePripnuto })
    .eq("id", prispevekId);

  if (error) {
    zobrazToast("Připnutí se nepodařilo změnit: " + error.message);
    return;
  }
  await nactiPrispevky();
}

// ---------- Smazání příspěvku ----------

async function smazPrispevek(prispevekId) {
  if (!confirm("Opravdu smazat tento příspěvek?")) return;

  const { error } = await sb.from("prispevky").delete().eq("id", prispevekId);
  if (error) {
    zobrazToast("Smazání se nepodařilo: " + error.message);
    return;
  }

  // Uklidíme i případný obrázek z úložiště
  const cestaObrazku = obrazkyPodleId[prispevekId];
  if (cestaObrazku) {
    await sb.storage.from(ULOZISTE).remove([cestaObrazku]);
  }

  await nactiPrispevky();
}

spustStranku();
