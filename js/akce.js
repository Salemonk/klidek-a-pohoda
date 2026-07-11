// ============================================================
// Akce guildy — plánování, hlasování o účasti
// ============================================================

let mujProfil = null;
let mojeId = null;
let profily = {};

const MOZNOSTI_UCASTI = [
  { hodnota: "jdu", popisek: "✔ Jdu" },
  { hodnota: "mozna", popisek: "🤔 Možná" },
  { hodnota: "nejdu", popisek: "✖ Nejdu" },
];

async function spustStranku() {
  const session = await vyzadujPrihlaseni();
  if (!session) return;

  mojeId = session.user.id;
  mujProfil = await nactiMujProfil(mojeId);
  profily = await nactiVsechnyProfily();

  pripravFormular();
  await nactiAkce();
}

// ---------- Vytvoření akce ----------

function pripravFormular() {
  const formular = document.getElementById("formular-akce");
  const chyba = document.getElementById("chyba-akce");

  formular.addEventListener("submit", async (udalost) => {
    udalost.preventDefault();
    skryjHlasku(chyba);

    const nazev = document.getElementById("nazev-akce").value.trim();
    const datumHodnota = document.getElementById("datum-akce").value;
    const popis = document.getElementById("popis-akce").value.trim();

    if (!nazev || !datumHodnota) return;

    const { error } = await sb.from("akce").insert({
      nazev: nazev,
      datum: new Date(datumHodnota).toISOString(),
      popis: popis || null,
      autor: mojeId,
    });

    if (error) {
      zobrazHlasku(chyba, "Akci se nepodařilo vytvořit: " + error.message);
      return;
    }
    formular.reset();
    await nactiAkce();
  });
}

// ---------- Načtení a vykreslení akcí ----------

async function nactiAkce() {
  const ted = new Date().toISOString();

  // Nadcházející akce (včetně hlasů o účasti)
  const { data: budouci, error: chyba1 } = await sb
    .from("akce")
    .select("id, nazev, popis, datum, autor, ucast(clen_id, stav)")
    .gte("datum", ted)
    .order("datum", { ascending: true });

  // Posledních 5 proběhlých akcí
  const { data: minule, error: chyba2 } = await sb
    .from("akce")
    .select("id, nazev, datum, autor")
    .lt("datum", ted)
    .order("datum", { ascending: false })
    .limit(5);

  vykresliBudouci(budouci, chyba1);
  vykresliMinule(minule, chyba2);
}

function vykresliBudouci(akceSeznam, chyba) {
  const prvek = document.getElementById("seznam-akci");
  prvek.classList.remove("nacitani");

  if (chyba) {
    prvek.textContent = "Akce se nepodařilo načíst.";
    return;
  }
  if (!akceSeznam || akceSeznam.length === 0) {
    prvek.innerHTML = "<p>Žádná akce není naplánovaná. Vytvoř první nahoře ve formuláři!</p>";
    return;
  }

  prvek.innerHTML = akceSeznam.map((akce) => {
    const autor = profily[akce.autor];
    const mujHlas = akce.ucast.find((u) => u.clen_id === mojeId);

    // Jména těch, kdo jdou / možná přijdou
    const jdou = akce.ucast.filter((u) => u.stav === "jdu")
      .map((u) => profily[u.clen_id] ? profily[u.clen_id].prezdivka : "?");
    const mozna = akce.ucast.filter((u) => u.stav === "mozna")
      .map((u) => profily[u.clen_id] ? profily[u.clen_id].prezdivka : "?");

    const tlacitka = MOZNOSTI_UCASTI.map((moznost) => `
      <button class="ucast-tlacitko ${mujHlas && mujHlas.stav === moznost.hodnota ? "vybrane" : ""}"
              onclick="hlasuj(${akce.id}, '${moznost.hodnota}')">${moznost.popisek}</button>
    `).join("");

    const smiSmazat = akce.autor === mojeId || (mujProfil && mujProfil.role === "admin");

    return `
      <div class="akce-polozka">
        <h3>${esc(akce.nazev)}</h3>
        <div class="akce-datum">📅 ${formatujDatum(akce.datum)}</div>
        ${akce.popis ? `<div class="akce-popis">${formatujText(akce.popis)}</div>` : ""}
        <div class="akce-meta">Naplánoval(a): ${autor ? esc(autor.prezdivka) : "?"}
          ${smiSmazat ? `· <button class="zprava-smazat" onclick="smazAkci(${akce.id})">smazat akci</button>` : ""}
        </div>
        <div class="ucast-tlacitka">${tlacitka}</div>
        <div class="ucast-prehled">
          ${jdou.length > 0 ? `✔ Jdou (${jdou.length}): ${jdou.map(esc).join(", ")}` : "Zatím nikdo nehlasoval, že jde."}
          ${mozna.length > 0 ? `<br>🤔 Možná (${mozna.length}): ${mozna.map(esc).join(", ")}` : ""}
        </div>
      </div>`;
  }).join("");
}

function vykresliMinule(akceSeznam, chyba) {
  const prvek = document.getElementById("seznam-minulych");
  prvek.classList.remove("nacitani");

  if (chyba) {
    prvek.textContent = "Akce se nepodařilo načíst.";
    return;
  }
  if (!akceSeznam || akceSeznam.length === 0) {
    prvek.innerHTML = "<p>Zatím žádná akce neproběhla.</p>";
    return;
  }

  prvek.innerHTML = akceSeznam.map((akce) => `
    <div class="akce-meta" style="margin-bottom:6px;">
      ${esc(akce.nazev)} — ${formatujDatum(akce.datum)}
    </div>`).join("");
}

// ---------- Hlasování o účasti ----------

async function hlasuj(akceId, stav) {
  const { error } = await sb.from("ucast").upsert({
    akce_id: akceId,
    clen_id: mojeId,
    stav: stav,
  });

  if (error) {
    alert("Hlasování se nepodařilo: " + error.message);
    return;
  }
  await nactiAkce();
}

// ---------- Smazání akce ----------

async function smazAkci(akceId) {
  if (!confirm("Opravdu smazat tuto akci?")) return;

  const { error } = await sb.from("akce").delete().eq("id", akceId);
  if (error) {
    alert("Smazání se nepodařilo: " + error.message);
    return;
  }
  await nactiAkce();
}

spustStranku();
