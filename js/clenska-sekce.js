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

  await nactiStavGuildy();
  await nactiNejblizsiAkce();
  pripravUpravuStavu();
  pripravUpravuPrezdivky(session.user.id);
  pripravZmenuHesla();
  await pripravSpravuAvataru(session.user.id);
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
      alert("Uložení se nepodařilo: " + error.message);
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
    prvek.innerHTML = `<p>Zatím není naplánovaná žádná akce.
      <a href="akce.html">Vytvoř první! →</a></p>`;
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
      alert("Uložení se nepodařilo: " + error.message);
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
  nahled.innerHTML = avatarHtml(mujProfil, adresa);
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

      mujProfil.avatar = cesta;
      formular.reset();
      await obnovNahledAvataru();
      zobrazHlasku(uspech, "Avatar uložen. ✔ Uvidíte ho u svých zpráv a příspěvků.");
    } catch (e) {
      zobrazHlasku(chyba, "Avatar se nepodařilo uložit: " + (e.message || e));
    }
  });
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
