// ============================================================
// Nástěnka příspěvků: psaní a čtení příspěvků členů
// ============================================================

let mujProfil = null;
let mojeId = null;
let profily = {};
let obrazkyPodleId = {}; // id příspěvku → cesta k obrázku v úložišti
let avatary = {};        // id člena → adresa avataru
let reakcePodleId = {};  // id příspěvku → pole reakcí {clen_id, emoji}

const ULOZISTE = "prispevky-obrazky";

async function spustStranku() {
  const session = await vyzadujPrihlaseni();
  if (!session) return;

  mojeId = session.user.id;
  mujProfil = await nactiMujProfil(mojeId);
  profily = await nactiVsechnyProfily();
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
    await nactiPrispevky();
  });
}

// ---------- Načtení a vykreslení příspěvků ----------

async function nactiPrispevky() {
  const prvek = document.getElementById("seznam-prispevku");

  const { data, error } = await sb
    .from("prispevky")
    .select("id, autor, nadpis, text, obrazek, vytvoreno, reakce(clen_id, emoji)")
    .order("vytvoreno", { ascending: false })
    .limit(50);

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

  // Obrázky jsou v soukromém úložišti, vyžádáme si k nim dočasné
  // podepsané adresy (platí hodinu, pak si je web vyžádá znovu)
  obrazkyPodleId = {};
  const cesty = data.filter((p) => p.obrazek).map((p) => p.obrazek);
  const adresyObrazku = {};
  if (cesty.length > 0) {
    const { data: podepsane } = await sb.storage.from(ULOZISTE).createSignedUrls(cesty, 3600);
    if (podepsane) {
      for (const zaznam of podepsane) {
        if (!zaznam.error) adresyObrazku[zaznam.path] = zaznam.signedUrl;
      }
    }
  }

  reakcePodleId = {};
  prvek.innerHTML = data.map((prispevek) => {
    const profil = profily[prispevek.autor];
    const smiSmazat = prispevek.autor === mojeId || (mujProfil && mujProfil.role === "admin");
    if (prispevek.obrazek) obrazkyPodleId[prispevek.id] = prispevek.obrazek;
    const adresa = prispevek.obrazek ? adresyObrazku[prispevek.obrazek] : null;
    reakcePodleId[prispevek.id] = prispevek.reakce || [];

    return `
      <article class="prispevek">
        <h3>${esc(prispevek.nadpis)}</h3>
        <div class="prispevek-meta">
          ${avatarHtml(profil, avatary[prispevek.autor])}
          ${profil ? esc(profil.prezdivka) : "?"} · ${formatujDatum(prispevek.vytvoreno)}
          ${smiSmazat ? `· <button class="zprava-smazat" onclick="smazPrispevek(${prispevek.id})">smazat</button>` : ""}
        </div>
        <div class="prispevek-text">${formatujText(prispevek.text)}</div>
        ${adresa ? `<a href="${adresa}" target="_blank" title="Otevřít v plné velikosti">
          <img class="prispevek-obrazek" src="${adresa}" alt="Obrázek k příspěvku" loading="lazy"></a>` : ""}
        ${reakceHtml(prispevek)}
      </article>`;
  }).join("");
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
    <button class="reakce-pridat" title="Přidat reakci"
      onclick="otevriPanelReakci(${prispevek.id}, this)">😊+</button></div>`;
}

// Otevře (nebo schová) panel se smajlíky pod daným příspěvkem
function otevriPanelReakci(prispevekId, tlacitko) {
  let panel = document.getElementById("panel-reakci");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "panel-reakci";
    panel.className = "emoji-panel";
    panel.innerHTML = ZAKLADNI_EMOJI
      .map((e) => `<button type="button" class="emoji-volba">${e}</button>`)
      .join("");
    panel.addEventListener("click", async (udalost) => {
      const volba = udalost.target.closest(".emoji-volba");
      if (!volba) return;
      panel.hidden = true;
      await prepniReakci(panel.dataset.prispevek, volba.textContent);
    });
  }

  const radek = tlacitko.closest(".reakce-radek");
  const uzOtevreny = !panel.hidden && panel.previousElementSibling === radek;
  if (uzOtevreny) {
    panel.hidden = true;
    return;
  }
  panel.dataset.prispevek = prispevekId;
  radek.insertAdjacentElement("afterend", panel);
  panel.hidden = false;
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
    alert("Reakci se nepodařilo uložit: " + vysledek.error.message);
    return;
  }
  await nactiPrispevky();
}

// ---------- Smazání příspěvku ----------

async function smazPrispevek(prispevekId) {
  if (!confirm("Opravdu smazat tento příspěvek?")) return;

  const { error } = await sb.from("prispevky").delete().eq("id", prispevekId);
  if (error) {
    alert("Smazání se nepodařilo: " + error.message);
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
