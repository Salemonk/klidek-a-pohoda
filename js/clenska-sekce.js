// ============================================================
// Členská sekce: přehled (stav guildy, nejbližší akce, profil)
// ============================================================

let mujProfil = null;

async function spustStranku() {
  const session = await vyzadujPrihlaseni();
  if (!session) return;

  mujProfil = await nactiMujProfil(session.user.id);

  // Pozdrav a předvyplnění přezdívky
  if (mujProfil) {
    document.getElementById("pozdrav").textContent = `Ahoj, ${mujProfil.prezdivka}! 👋`;
    document.getElementById("prezdivka").value = mujProfil.prezdivka;
  }

  pripravLfgTlacitko();
  await nactiStavGuildy();
  await nactiNejblizsiAkce();
  pripravUpravuStavu();
  pripravUpravuPrezdivky(session.user.id);
  pripravZmenuHesla();
  await pripravSpravuAvataru(session.user.id);
  await pripravPozvanky();
  await pripravPrehledClenu();
}

// ---------- Hledám hráče (LFG) ----------

function pripravLfgTlacitko() {
  const tlacitko = document.getElementById("tlacitko-lfg");
  const hlaska = document.getElementById("lfg-hlaska");
  const pole = document.getElementById("lfg-text");
  const jmenoVSablone = document.getElementById("lfg-jmeno");
  const nahled = document.getElementById("lfg-nahled");

  const prezdivka = mujProfil ? mujProfil.prezdivka : "Ty";
  jmenoVSablone.textContent = prezdivka;

  // Přesný živý náhled toho, co přesně přiletí do Discordu
  // (stejná logika jako v SQL funkci posli_lfg_vyzvu)
  function aktualizujNahled() {
    const co = pole.value.trim();
    const zavorka = co ? ` (${co})` : "";
    nahled.textContent =
      `Přesně takhle to přiletí do Discordu: 🎮 ${prezdivka} hledá partu${zavorka}, kdo má teď čas? @Hledám hráče`;
  }
  pole.addEventListener("input", aktualizujNahled);
  aktualizujNahled();

  tlacitko.addEventListener("click", async () => {
    tlacitko.disabled = true;
    hlaska.textContent = "";
    hlaska.style.color = "";

    const co = pole.value.trim();
    const { error } = await sb.rpc("posli_lfg_vyzvu", { co_hrajeme: co || null });

    if (error) {
      hlaska.textContent = error.message;
      hlaska.style.color = "var(--chyba)";
    } else {
      hlaska.textContent = "Výzva odeslána! 🎮 Sleduj Discord, ať tě neminou odpovědi.";
      hlaska.style.color = "var(--akcent)";
      pole.value = "";
      aktualizujNahled();
    }
    tlacitko.disabled = false;
  });
}

// ---------- Stav guildy ----------

async function nactiStavGuildy() {
  const prvek = document.getElementById("stav-guildy");
  const { data, error } = await sb.from("guilda").select("stav, aktualizovano").eq("id", 1).single();
  if (error || !data) {
    prvek.textContent = "Stav se nepodařilo načíst.";
    return;
  }
  prvek.classList.remove("nacitani");
  prvek.innerHTML = formatujText(data.stav)
    + `<p class="poznamka">Aktualizováno: ${formatujDatum(data.aktualizovano)}</p>`;
  document.getElementById("stav-text").value = data.stav;
}

function pripravUpravuStavu() {
  // Upravovat stav guildy může jen admin
  if (!mujProfil || mujProfil.role !== "admin") return;

  const tlacitkoUpravit = document.getElementById("tlacitko-upravit-stav");
  const formular = document.getElementById("formular-stav");
  const zobrazeni = document.getElementById("stav-guildy");

  tlacitkoUpravit.style.display = "inline-block";

  tlacitkoUpravit.addEventListener("click", () => {
    formular.style.display = "block";
    zobrazeni.style.display = "none";
  });

  document.getElementById("tlacitko-zrusit-stav").addEventListener("click", () => {
    formular.style.display = "none";
    zobrazeni.style.display = "block";
  });

  formular.addEventListener("submit", async (udalost) => {
    udalost.preventDefault();
    const novyStav = document.getElementById("stav-text").value.trim();
    if (!novyStav) return;

    const { error } = await sb.from("guilda")
      .update({ stav: novyStav, aktualizovano: new Date().toISOString() })
      .eq("id", 1);

    if (error) {
      zobrazToast("Uložení se nepodařilo: " + error.message);
      return;
    }
    formular.style.display = "none";
    zobrazeni.style.display = "block";
    await nactiStavGuildy();
  });
}

// ---------- Nejbližší akce ----------

async function nactiNejblizsiAkce() {
  const prvek = document.getElementById("nejblizsi-akce");
  const { data, error } = await sb
    .from("akce")
    .select("id, nazev, datum")
    .gte("datum", new Date().toISOString())
    .order("datum", { ascending: true })
    .limit(3);

  if (error) {
    prvek.textContent = "Akce se nepodařilo načíst.";
    return;
  }
  prvek.classList.remove("nacitani");

  if (data.length === 0) {
    prvek.innerHTML = jeVedeni(mujProfil)
      ? `<p>Zatím není naplánovaná žádná akce. <a href="akce.html">Vytvoř první! →</a></p>`
      : `<p>Zatím není naplánovaná žádná akce.</p>`;
    return;
  }

  prvek.innerHTML = data.map((akce) => `
    <div class="akce-polozka">
      <h3>${esc(akce.nazev)}</h3>
      <div class="akce-datum">📅 ${formatujDatum(akce.datum)}</div>
    </div>`).join("");
}

// ---------- Změna přezdívky ----------

function pripravUpravuPrezdivky(uzivatelId) {
  const formular = document.getElementById("formular-prezdivka");
  const hlaska = document.getElementById("uspech-profil");

  formular.addEventListener("submit", async (udalost) => {
    udalost.preventDefault();
    skryjHlasku(hlaska);
    const novaPrezdivka = document.getElementById("prezdivka").value.trim();
    if (!novaPrezdivka) return;

    const { error } = await sb.from("profily")
      .update({ prezdivka: novaPrezdivka })
      .eq("id", uzivatelId);

    if (error) {
      zobrazToast("Uložení se nepodařilo: " + error.message);
      return;
    }
    document.getElementById("pozdrav").textContent = `Ahoj, ${novaPrezdivka}! 👋`;
    zobrazHlasku(hlaska, "Přezdívka uložena. ✔");
  });
}

// ---------- Avatar ----------

async function obnovNahledAvataru() {
  const nahled = document.getElementById("avatar-nahled");
  let adresa = null;
  if (mujProfil && mujProfil.avatar) {
    const mapa = await nactiAdresyAvataru({ [mujProfil.id]: mujProfil });
    adresa = mapa[mujProfil.id] || null;
  }
  nahled.innerHTML = avatarHtml(mujProfil, adresa, false);
}

async function pripravSpravuAvataru(uzivatelId) {
  await obnovNahledAvataru();

  const formular = document.getElementById("formular-avatar");
  const chyba = document.getElementById("chyba-avatar");
  const uspech = document.getElementById("uspech-avatar");

  formular.addEventListener("submit", async (udalost) => {
    udalost.preventDefault();
    skryjHlasku(chyba);
    skryjHlasku(uspech);

    const soubor = document.getElementById("avatar-soubor").files[0];
    if (!soubor) {
      zobrazHlasku(chyba, "Nejdřív vyberte obrázek.");
      return;
    }
    if (!soubor.type.startsWith("image/")) {
      zobrazHlasku(chyba, "Vybraný soubor není obrázek.");
      return;
    }

    try {
      const maly = await pripravAvatar(soubor);
      const cesta = `${uzivatelId}/avatar.jpg`;

      const { error: chybaNahrani } = await sb.storage
        .from("avatary")
        .upload(cesta, maly, { contentType: "image/jpeg", upsert: true });
      if (chybaNahrani) throw chybaNahrani;

      const { error: chybaProfilu } = await sb.from("profily")
        .update({ avatar: cesta })
        .eq("id", uzivatelId);
      if (chybaProfilu) throw chybaProfilu;

      // Soubor na stejné cestě se změnil, zapomeneme starou adresu,
      // ať se hned ukáže nový avatar (a ne ten z paměti)
      zapomenAdresu("avatary", cesta);
      mujProfil.avatar = cesta;
      formular.reset();
      await obnovNahledAvataru();
      zobrazHlasku(uspech, "Avatar uložen. ✔ Uvidíte ho u svých zpráv a příspěvků.");
    } catch (e) {
      zobrazHlasku(chyba, "Avatar se nepodařilo uložit: " + (e.message || e));
    }
  });
}

// ---------- Pozvánky pro nové členy (jen admin) ----------

// Náhodný kód ve tvaru KP-XXXX-XXXX (bez snadno zaměnitelných znaků)
function vygenerujKodPozvanky() {
  const znaky = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const nahodna = crypto.getRandomValues(new Uint8Array(8));
  let kod = "KP-";
  for (let i = 0; i < 8; i++) {
    kod += znaky[nahodna[i] % znaky.length];
    if (i === 3) kod += "-";
  }
  return kod;
}

async function pripravPozvanky() {
  if (!jeVedeni(mujProfil)) return;

  document.getElementById("panel-pozvanky").style.display = "block";
  document.getElementById("tlacitko-nova-pozvanka")
    .addEventListener("click", vytvorPozvanku);
  await nactiPozvanky();
}

async function vytvorPozvanku() {
  const kod = vygenerujKodPozvanky();
  const { error } = await sb.from("pozvanky").insert({ kod: kod, vytvoril: mujProfil.id });

  if (error) {
    zobrazToast("Pozvánku se nepodařilo vytvořit: " + error.message);
    return;
  }

  const odkaz = new URL("registrace.html?kod=" + kod, window.location.href).href;
  const blok = document.getElementById("nova-pozvanka");
  blok.style.display = "block";
  blok.innerHTML = `
    <p style="margin-top:12px;">Hotovo! Pošlete zájemci tento odkaz:</p>
    <p class="pozvanka-kod">${esc(odkaz)}</p>
    <button class="tlacitko tlacitko-male" onclick="zkopirujPozvanku(this)"
      data-odkaz="${esc(odkaz)}">Zkopírovat odkaz</button>`;
  await nactiPozvanky();
}

async function zkopirujPozvanku(tlacitko) {
  const odkaz = tlacitko.dataset.odkaz;
  try {
    await navigator.clipboard.writeText(odkaz);
    tlacitko.textContent = "Zkopírováno ✔";
  } catch (e) {
    prompt("Zkopírujte odkaz ručně:", odkaz);
  }
}

async function nactiPozvanky() {
  const prvek = document.getElementById("seznam-pozvanek");
  const { data, error } = await sb
    .from("pozvanky")
    .select("kod, vytvoreno, plati_do, pouzito, pouzil")
    .order("vytvoreno", { ascending: false })
    .limit(20);

  prvek.classList.remove("nacitani");

  if (error) {
    prvek.textContent = "Pozvánky se nepodařilo načíst. Máte spuštěný skript pozvanky.sql?";
    return;
  }
  if (data.length === 0) {
    prvek.innerHTML = `<p class="poznamka">Zatím žádná pozvánka.</p>`;
    return;
  }

  const profilyMapa = await nactiVsechnyProfily();

  prvek.innerHTML = data.map((pozvanka) => {
    let stav;
    if (pozvanka.pouzito) {
      const profilClena = profilyMapa[pozvanka.pouzil];
      stav = `✅ použitá (${profilClena ? esc(profilClena.prezdivka) : "?"}, ${formatujDatum(pozvanka.pouzito)})`;
    } else if (new Date(pozvanka.plati_do) < new Date()) {
      stav = "⌛ propadlá";
    } else {
      stav = `🕐 čeká, platí do ${formatujDatum(pozvanka.plati_do)}`;
    }

    return `<div class="akce-meta" style="margin-bottom:6px;">
      <span class="pozvanka-kod-maly">${esc(pozvanka.kod)}</span> ${stav}
      ${!pozvanka.pouzito ? `· <button class="zprava-smazat" onclick="smazPozvanku('${esc(pozvanka.kod)}')">zrušit</button>` : ""}
    </div>`;
  }).join("");
}

async function smazPozvanku(kod) {
  if (!confirm("Zrušit pozvánku " + kod + "?")) return;

  const { error } = await sb.from("pozvanky").delete().eq("kod", kod);
  if (error) {
    zobrazToast("Zrušení se nepodařilo: " + error.message);
    return;
  }
  await nactiPozvanky();
}

// ---------- Přehled členů (jen admin) ----------

let nacteniClenove = []; // naposledy načtený seznam členů

const POPISKY_ROLI = { clen: "člen", vedeni: "vedení", admin: "admin" };
// formatujDatumKratce() je teď sdílená funkce v klient.js

async function pripravPrehledClenu() {
  if (!mujProfil || mujProfil.role !== "admin") return;

  document.getElementById("panel-clenove").style.display = "block";
  await nactiPrehledClenu();
}

async function nactiPrehledClenu() {
  const prvek = document.getElementById("seznam-clenu");
  const { data, error } = await sb.rpc("seznam_clenu");

  prvek.classList.remove("nacitani");

  if (error) {
    prvek.textContent = "Členy se nepodařilo načíst. Máte spuštěný skript prehled-clenu.sql?";
    return;
  }
  if (!data || data.length === 0) {
    prvek.textContent = "Žádní členové.";
    return;
  }

  nacteniClenove = data;
  const mapaProfilu = {};
  for (const clen of data) mapaProfilu[clen.id] = clen;
  const adresyAvataru = await nactiAdresyAvataru(mapaProfilu);

  prvek.innerHTML = data.map((clen) => {
    const jaSam = clen.id === mujProfil.id;
    const volbaRole = jaSam
      ? `<span class="stitek">${POPISKY_ROLI[clen.role]} (vy)</span>`
      : `<select class="volba-role" onchange="zmenRoli('${clen.id}', this)">
          ${["clen", "vedeni", "admin"].map((role) =>
            `<option value="${role}" ${role === clen.role ? "selected" : ""}>${POPISKY_ROLI[role]}</option>`
          ).join("")}
        </select>`;

    return `
      <div class="clen-radek">
        ${avatarHtml(clen, adresyAvataru[clen.id])}
        <div class="clen-info">
          <strong>${esc(clen.prezdivka)}</strong>
          <span class="poznamka-mala">${esc(clen.email)}
            · členem od ${formatujDatumKratce(clen.clenem_od)}
            · naposledy přihlášen ${clen.posledni_prihlaseni ? formatujDatumKratce(clen.posledni_prihlaseni) : "nikdy"}</span>
        </div>
        ${volbaRole}
      </div>`;
  }).join("");
}

async function zmenRoli(clenId, vyber) {
  const clen = nacteniClenove.find((c) => c.id === clenId);
  const jmeno = clen ? clen.prezdivka : "?";
  const novaRole = vyber.value;

  if (!confirm(`Změnit roli člena „${jmeno}“ na ${POPISKY_ROLI[novaRole]}?`)) {
    await nactiPrehledClenu(); // vrátí výběr do původního stavu
    return;
  }

  const { error } = await sb.rpc("nastav_roli", {
    clen_id: clenId,
    nova_role: novaRole,
  });

  if (error) {
    zobrazToast("Změnu role se nepodařilo uložit: " + error.message);
  }
  await nactiPrehledClenu();
}

// ---------- Změna hesla ----------

function pripravZmenuHesla() {
  const formular = document.getElementById("formular-heslo");
  const chyba = document.getElementById("chyba-heslo");
  const uspech = document.getElementById("uspech-heslo");

  formular.addEventListener("submit", async (udalost) => {
    udalost.preventDefault();
    skryjHlasku(chyba);
    skryjHlasku(uspech);

    const nove = document.getElementById("nove-heslo").value;
    const znovu = document.getElementById("nove-heslo-znovu").value;

    if (nove !== znovu) {
      zobrazHlasku(chyba, "Hesla se neshodují, zkontrolujte je a zkuste to znovu.");
      return;
    }

    const { error } = await sb.auth.updateUser({ password: nove });

    if (error) {
      if (error.message.includes("should be at least")) {
        zobrazHlasku(chyba, "Heslo je moc krátké, musí mít aspoň 6 znaků.");
      } else if (error.message.includes("different from the old")) {
        zobrazHlasku(chyba, "Nové heslo musí být jiné než to současné.");
      } else {
        zobrazHlasku(chyba, "Změna hesla se nepodařila: " + error.message);
      }
      return;
    }

    formular.reset();
    zobrazHlasku(uspech, "Heslo je změněné. ✔ Při příštím přihlášení už použijte nové.");
  });
}

spustStranku();
