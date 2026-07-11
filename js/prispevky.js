// ============================================================
// Nástěnka příspěvků — psaní a čtení příspěvků členů
// ============================================================

let mujProfil = null;
let mojeId = null;
let profily = {};

async function spustStranku() {
  const session = await vyzadujPrihlaseni();
  if (!session) return;

  mojeId = session.user.id;
  mujProfil = await nactiMujProfil(mojeId);
  profily = await nactiVsechnyProfily();

  pripravFormular();
  await nactiPrispevky();
}

// ---------- Vytvoření příspěvku ----------

function pripravFormular() {
  const formular = document.getElementById("formular-prispevek");
  const chyba = document.getElementById("chyba-prispevek");

  formular.addEventListener("submit", async (udalost) => {
    udalost.preventDefault();
    skryjHlasku(chyba);

    const nadpis = document.getElementById("nadpis").value.trim();
    const text = document.getElementById("text-prispevku").value.trim();
    if (!nadpis || !text) return;

    const { error } = await sb.from("prispevky").insert({
      autor: mojeId,
      nadpis: nadpis,
      text: text,
    });

    if (error) {
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
    .select("id, autor, nadpis, text, vytvoreno")
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

  prvek.innerHTML = data.map((prispevek) => {
    const profil = profily[prispevek.autor];
    const smiSmazat = prispevek.autor === mojeId || (mujProfil && mujProfil.role === "admin");

    return `
      <article class="prispevek">
        <h3>${esc(prispevek.nadpis)}</h3>
        <div class="prispevek-meta">
          ${profil ? esc(profil.prezdivka) : "?"} · ${formatujDatum(prispevek.vytvoreno)}
          ${smiSmazat ? `· <button class="zprava-smazat" onclick="smazPrispevek(${prispevek.id})">smazat</button>` : ""}
        </div>
        <div class="prispevek-text">${formatujText(prispevek.text)}</div>
      </article>`;
  }).join("");
}

// ---------- Smazání příspěvku ----------

async function smazPrispevek(prispevekId) {
  if (!confirm("Opravdu smazat tento příspěvek?")) return;

  const { error } = await sb.from("prispevky").delete().eq("id", prispevekId);
  if (error) {
    alert("Smazání se nepodařilo: " + error.message);
    return;
  }
  await nactiPrispevky();
}

spustStranku();
