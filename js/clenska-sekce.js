// ============================================================
// Členská sekce — přehled (stav guildy, nejbližší akce, profil)
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

spustStranku();
