// ============================================================
// Galerie momentek: volná síň slávy se screenshoty z akcí
// ============================================================

let mujProfil = null;
let mojeId = null;
let profily = {};
let avatary = {}; // id člena → adresa avataru
let cestyObrazkuPodleId = {}; // id momentky → cesta k obrázku v úložišti
let nacteneMomentky = [];

const ULOZISTE = "galerie";
const DAVKA_MOMENTEK = 20;
let zobrazenoMomentek = DAVKA_MOMENTEK;

async function spustStranku() {
  const session = await vyzadujPrihlaseni();
  if (!session) return;

  oznacSekciPrectenou("galerie");
  mojeId = session.user.id;
  // Profil a seznam členů na sobě nezávisí, načtou se souběžně
  [mujProfil, profily] = await Promise.all([nactiMujProfil(mojeId), nactiVsechnyProfily()]);
  avatary = await nactiAdresyAvataru(profily);

  pripravFormular();
  await nactiMomentky();
}

// ---------- Přidání momentky ----------

function pripravFormular() {
  const formular = document.getElementById("formular-momentka");
  const chyba = document.getElementById("chyba-momentka");
  const tlacitko = document.getElementById("tlacitko-pridat-momentku");

  formular.addEventListener("submit", async (udalost) => {
    udalost.preventDefault();
    skryjHlasku(chyba);

    const soubor = document.getElementById("momentka-soubor").files[0];
    const popisek = document.getElementById("momentka-popisek").value.trim();
    if (!soubor) return;
    if (!soubor.type.startsWith("image/")) {
      zobrazHlasku(chyba, "Vybraný soubor není obrázek.");
      return;
    }

    tlacitko.disabled = true;
    tlacitko.textContent = "Nahrávám…";

    let cestaObrazku = null;
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
      tlacitko.textContent = "Přidat momentku";
      return;
    }

    const { error } = await sb.from("momentky").insert({
      autor: mojeId,
      obrazek: cestaObrazku,
      popisek: popisek || null,
    });

    tlacitko.disabled = false;
    tlacitko.textContent = "Přidat momentku";

    if (error) {
      await sb.storage.from(ULOZISTE).remove([cestaObrazku]);
      zobrazHlasku(chyba, "Momentku se nepodařilo uložit: " + error.message);
      return;
    }
    formular.reset();
    await nactiMomentky();
  });
}

// ---------- Načtení a vykreslení galerie ----------

async function nactiMomentky() {
  const mrizka = document.getElementById("galerie-mrizka");

  const { data, error } = await sb
    .from("momentky")
    .select("id, autor, obrazek, popisek, vytvoreno")
    .order("vytvoreno", { ascending: false })
    .limit(zobrazenoMomentek + 1);

  mrizka.classList.remove("nacitani");

  if (error) {
    mrizka.innerHTML = "<p>Galerii se nepodařilo načíst. Máte spuštěný skript galerie.sql?</p>";
    return;
  }
  if (data.length === 0) {
    mrizka.innerHTML = `<p class="poznamka">Zatím tu není žádná momentka. Přidej první nahoře! 🙂</p>`;
    return;
  }

  const jsouStarsi = data.length > zobrazenoMomentek;
  const momentkyKZobrazeni = data.slice(0, zobrazenoMomentek);

  cestyObrazkuPodleId = {};
  const cesty = momentkyKZobrazeni.map((m) => m.obrazek);
  const adresyObrazku = await ziskejPodepsaneAdresy(ULOZISTE, cesty);

  nacteneMomentky = momentkyKZobrazeni;
  mrizka.innerHTML = momentkyKZobrazeni.map((momentka) => {
    const profil = profily[momentka.autor];
    const smiSmazat = momentka.autor === mojeId || jeVedeni(mujProfil);
    const adresa = adresyObrazku[momentka.obrazek];
    cestyObrazkuPodleId[momentka.id] = momentka.obrazek;

    return `
      <figure class="momentka">
        <a href="${adresa}" target="_blank" title="Otevřít v plné velikosti">
          <img class="momentka-obrazek" src="${adresa}" alt="${momentka.popisek ? esc(momentka.popisek) : "Momentka z galerie"}" loading="lazy">
        </a>
        <figcaption>
          ${momentka.popisek ? `<span class="momentka-popisek">${esc(momentka.popisek)}</span>` : ""}
          <span class="momentka-meta">
            ${avatarHtml(profil, avatary[momentka.autor])}
            ${profil ? esc(profil.prezdivka) : "?"} · ${formatujDatumKratce(momentka.vytvoreno)}
            ${smiSmazat ? `· <button class="zprava-smazat" onclick="smazMomentku(${momentka.id})">smazat</button>` : ""}
          </span>
        </figcaption>
      </figure>`;
  }).join("")
  + (jsouStarsi
      ? `<button class="tlacitko tlacitko-obrys galerie-nacist-starsi" onclick="nactiStarsiMomentky()">Načíst starší momentky</button>`
      : "");
}

function nactiStarsiMomentky() {
  zobrazenoMomentek += DAVKA_MOMENTEK;
  nactiMomentky();
}

// ---------- Smazání momentky ----------

async function smazMomentku(momentkaId) {
  if (!confirm("Opravdu smazat tuto momentku?")) return;

  const { error } = await sb.from("momentky").delete().eq("id", momentkaId);
  if (error) {
    zobrazToast("Smazání se nepodařilo: " + error.message);
    return;
  }

  const cestaObrazku = cestyObrazkuPodleId[momentkaId];
  if (cestaObrazku) await sb.storage.from(ULOZISTE).remove([cestaObrazku]);

  await nactiMomentky();
}

spustStranku();
