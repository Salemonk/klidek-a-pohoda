// ============================================================
// Ankety: zakládání, hlasování, výsledky
// ============================================================

let mujProfil = null;
let mojeId = null;
let profily = {};

async function spustStranku() {
  const session = await vyzadujPrihlaseni();
  if (!session) return;

  oznacSekciPrectenou("ankety");
  mojeId = session.user.id;
  // Profil a seznam členů na sobě nezávisí, načtou se souběžně
  [mujProfil, profily] = await Promise.all([nactiMujProfil(mojeId), nactiVsechnyProfily()]);

  pripravFormular();
  await nactiAnkety();
}

// ---------- Vytvoření ankety ----------

function pripravFormular() {
  const formular = document.getElementById("formular-anketa");
  const chyba = document.getElementById("chyba-anketa");

  // Tlačítko "+ přidat možnost"
  document.getElementById("pridat-moznost").addEventListener("click", () => {
    const pole = document.getElementById("moznosti-pole");
    const pocet = pole.querySelectorAll(".moznost-vstup").length;
    if (pocet >= 10) return; // rozumný strop
    const vstup = document.createElement("input");
    vstup.type = "text";
    vstup.className = "moznost-vstup";
    vstup.maxLength = 100;
    vstup.placeholder = "Možnost " + (pocet + 1);
    pole.appendChild(vstup);
  });

  formular.addEventListener("submit", async (udalost) => {
    udalost.preventDefault();
    skryjHlasku(chyba);

    const otazka = document.getElementById("otazka").value.trim();
    const moznosti = [...document.querySelectorAll(".moznost-vstup")]
      .map((v) => v.value.trim())
      .filter((t) => t !== "");

    if (!otazka) return;
    if (moznosti.length < 2) {
      zobrazHlasku(chyba, "Vyplňte aspoň dvě možnosti.");
      return;
    }

    // 1) založit anketu
    const { data: anketa, error: chybaAnkety } = await sb.from("ankety")
      .insert({ otazka: otazka, autor: mojeId })
      .select("id")
      .single();

    if (chybaAnkety) {
      zobrazHlasku(chyba, "Anketu se nepodařilo vytvořit: " + chybaAnkety.message);
      return;
    }

    // 2) přidat možnosti
    const radky = moznosti.map((text, i) => ({
      anketa_id: anketa.id, text: text, poradi: i,
    }));
    const { error: chybaMoznosti } = await sb.from("ankety_moznosti").insert(radky);

    if (chybaMoznosti) {
      // úklid: smažeme anketu bez možností
      await sb.from("ankety").delete().eq("id", anketa.id);
      zobrazHlasku(chyba, "Možnosti se nepodařilo uložit: " + chybaMoznosti.message);
      return;
    }

    formular.reset();
    // vrátit pole možností na výchozí dvě
    document.getElementById("moznosti-pole").innerHTML = `
      <input type="text" class="moznost-vstup" maxlength="100" placeholder="Možnost 1">
      <input type="text" class="moznost-vstup" maxlength="100" placeholder="Možnost 2">`;
    await nactiAnkety();
  });
}

// ---------- Načtení a vykreslení anket ----------

async function nactiAnkety() {
  const prvek = document.getElementById("seznam-anket");

  const { data: ankety, error } = await sb
    .from("ankety")
    .select("id, otazka, autor, uzavrena, vytvoreno, ankety_moznosti(id, text, poradi)")
    .order("vytvoreno", { ascending: false })
    .limit(30);

  prvek.classList.remove("nacitani");

  if (error) {
    prvek.textContent = "Ankety se nepodařilo načíst. Máte spuštěný skript ankety.sql?";
    return;
  }
  if (!ankety || ankety.length === 0) {
    prvek.innerHTML = `<div class="panel-blok"><p>Zatím tu není žádná anketa.
      Založ první nahoře ve formuláři! 🙂</p></div>`;
    return;
  }

  // Všechny hlasy (guilda je malá, načteme najednou)
  const { data: hlasy } = await sb.from("ankety_hlasy")
    .select("anketa_id, moznost_id, clen_id");
  const vsechnyHlasy = hlasy || [];

  prvek.innerHTML = ankety.map((anketa) =>
    vykresliAnketu(anketa, vsechnyHlasy)
  ).join("");
}

function vykresliAnketu(anketa, vsechnyHlasy) {
  const autor = profily[anketa.autor];
  const smiSpravovat = anketa.autor === mojeId || jeVedeni(mujProfil);
  const moznosti = (anketa.ankety_moznosti || []).slice().sort((a, b) => a.poradi - b.poradi);

  const hlasyAnkety = vsechnyHlasy.filter((h) => h.anketa_id === anketa.id);
  const celkem = hlasyAnkety.length;
  const mujHlas = hlasyAnkety.find((h) => h.clen_id === mojeId);

  const moznostiHtml = moznosti.map((m) => {
    const pocet = hlasyAnkety.filter((h) => h.moznost_id === m.id).length;
    const procenta = celkem > 0 ? Math.round((pocet / celkem) * 100) : 0;
    const vybrano = mujHlas && mujHlas.moznost_id === m.id;
    const klik = anketa.uzavrena ? "" : `onclick="hlasuj(${anketa.id}, ${m.id})"`;

    return `
      <div class="anketa-moznost ${vybrano ? "vybrano" : ""} ${anketa.uzavrena ? "uzavrena" : ""}" ${klik}>
        <div class="anketa-pruh" style="width:${procenta}%"></div>
        <div class="anketa-popisek">
          <span>${vybrano ? "✓ " : ""}${esc(m.text)}</span>
          <span class="anketa-pocet">${pocet}&nbsp;·&nbsp;${procenta}%</span>
        </div>
      </div>`;
  }).join("");

  return `
    <div class="panel-blok anketa" id="anketa-${anketa.id}">
      <h3 class="anketa-otazka">${formatujRadek(anketa.otazka)}
        ${anketa.uzavrena ? '<span class="stitek">uzavřeno</span>' : ""}</h3>
      <div class="anketa-moznosti">${moznostiHtml}</div>
      <div class="akce-meta">
        Založil(a): ${autor ? esc(autor.prezdivka) : "?"} · hlasů: ${celkem}
        ${smiSpravovat ? `· <button class="zprava-smazat" onclick="prepniUzavreni(${anketa.id}, ${anketa.uzavrena})">${anketa.uzavrena ? "otevřít" : "uzavřít"}</button>` : ""}
        ${smiSpravovat ? `· <button class="zprava-smazat" onclick="smazAnketu(${anketa.id})">smazat</button>` : ""}
      </div>
    </div>`;
}

// ---------- Hlasování ----------

async function hlasuj(anketaId, moznostId) {
  const { error } = await sb.from("ankety_hlasy").upsert({
    anketa_id: anketaId,
    moznost_id: moznostId,
    clen_id: mojeId,
  });

  if (error) {
    zobrazToast("Hlasování se nepodařilo: " + error.message);
    return;
  }
  await nactiAnkety();
}

// ---------- Správa (autor / vedení) ----------

async function prepniUzavreni(anketaId, jeUzavrena) {
  const { error } = await sb.from("ankety")
    .update({ uzavrena: !jeUzavrena })
    .eq("id", anketaId);
  if (error) {
    zobrazToast("Změnu se nepodařilo uložit: " + error.message);
    return;
  }
  await nactiAnkety();
}

async function smazAnketu(anketaId) {
  if (!confirm("Opravdu smazat tuto anketu i s hlasy?")) return;
  const { error } = await sb.from("ankety").delete().eq("id", anketaId);
  if (error) {
    zobrazToast("Smazání se nepodařilo: " + error.message);
    return;
  }
  await nactiAnkety();
}

spustStranku();
