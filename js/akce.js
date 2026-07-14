// ============================================================
// Akce guildy: plánování, hlasování o účasti
// ============================================================

let mujProfil = null;
let mojeId = null;
let profily = {};
let nacteneAkce = []; // naposledy načtené nadcházející akce (pro úpravy)

const MOZNOSTI_UCASTI = [
  { hodnota: "jdu", popisek: "✔ Jdu" },
  { hodnota: "mozna", popisek: "🤔 Možná" },
  { hodnota: "nejdu", popisek: "✖ Nejdu" },
];

async function spustStranku() {
  const session = await vyzadujPrihlaseni();
  if (!session) return;

  oznacSekciPrectenou("akce");
  mojeId = session.user.id;
  mujProfil = await nactiMujProfil(mojeId);
  profily = await nactiVsechnyProfily();

  // Akce zakládá jen vedení a admin, ostatním formulář neukazujeme
  if (jeVedeni(mujProfil)) {
    document.getElementById("panel-nova-akce").style.display = "block";
  }

  pripravFormular();
  await nactiAkce();
}

// Převod data na hodnotu pro políčko typu datetime-local
function proDatetimeLocal(iso) {
  const datum = new Date(iso);
  const dopln = (cislo) => String(cislo).padStart(2, "0");
  return `${datum.getFullYear()}-${dopln(datum.getMonth() + 1)}-${dopln(datum.getDate())}`
    + `T${dopln(datum.getHours())}:${dopln(datum.getMinutes())}`;
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
    .select("id, nazev, popis, datum, autor, upraveno, ucast(clen_id, stav)")
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
    prvek.innerHTML = jeVedeni(mujProfil)
      ? "<p>Žádná akce není naplánovaná. Vytvoř první nahoře ve formuláři!</p>"
      : "<p>Žádná akce není naplánovaná. Vydrž, vedení už jistě něco chystá. 🙂</p>";
    return;
  }

  nacteneAkce = akceSeznam;
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

    const smiSpravovat = jeVedeni(mujProfil) || akce.autor === mojeId;

    return `
      <div class="akce-polozka" id="akce-${akce.id}">
        <h3>${esc(akce.nazev)}</h3>
        <div class="akce-datum">📅 ${formatujDatum(akce.datum)}</div>
        ${akce.popis ? `<div class="akce-popis">${formatujText(akce.popis)}</div>` : ""}
        <div class="akce-meta">Naplánoval(a): ${autor ? esc(autor.prezdivka) : "?"}
          · <button class="zprava-smazat" onclick="pridejAkciDoKalendare(${akce.id})">📅 do kalendáře</button>
          ${akce.upraveno ? " · upraveno" : ""}
          ${jeVedeni(mujProfil) ? `· <button class="zprava-smazat" onclick="zacniUpravuAkce(${akce.id})">upravit</button>` : ""}
          ${smiSpravovat ? `· <button class="zprava-smazat" onclick="smazAkci(${akce.id})">smazat akci</button>` : ""}
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
      ${esc(akce.nazev)} (${formatujDatum(akce.datum)})
    </div>`).join("");
}

// ---------- Přidání do kalendáře ----------

function pridejAkciDoKalendare(akceId) {
  const akce = nacteneAkce.find((a) => a.id === akceId);
  if (!akce) return;
  pridejDoKalendare(akce.nazev, akce.popis, akce.datum);
}

// ---------- Úprava akce (jen vedení a admin) ----------

function zacniUpravuAkce(akceId) {
  const akce = nacteneAkce.find((a) => a.id === akceId);
  if (!akce) return;

  const polozka = document.getElementById("akce-" + akceId);
  polozka.innerHTML = `
    <form onsubmit="ulozUpravuAkce(event, ${akceId})">
      <label for="uprava-nazev">Název akce</label>
      <input type="text" id="uprava-nazev" maxlength="100" required value="${esc(akce.nazev)}">

      <label for="uprava-datum">Datum a čas</label>
      <input type="datetime-local" id="uprava-datum" required value="${proDatetimeLocal(akce.datum)}">

      <label for="uprava-popis">Popis (nepovinné)</label>
      <textarea id="uprava-popis" rows="3">${akce.popis ? esc(akce.popis) : ""}</textarea>

      <button type="submit" class="tlacitko tlacitko-male">Uložit změny</button>
      <button type="button" class="tlacitko-nenapadne" onclick="nactiAkce()">Zrušit</button>
    </form>`;
}

async function ulozUpravuAkce(udalost, akceId) {
  udalost.preventDefault();

  const nazev = document.getElementById("uprava-nazev").value.trim();
  const datumHodnota = document.getElementById("uprava-datum").value;
  const popis = document.getElementById("uprava-popis").value.trim();
  if (!nazev || !datumHodnota) return;

  const noveDatum = new Date(datumHodnota).toISOString();

  const zmeny = {
    nazev: nazev,
    datum: noveDatum,
    popis: popis || null,
    upraveno: new Date().toISOString(),
  };

  // Když se změní datum akce, zapomeneme, že už byla připomínka odeslána,
  // ať přeplánovaná akce dostane připomínku na nový termín znovu.
  const puvodni = nacteneAkce.find((a) => a.id === akceId);
  if (puvodni && new Date(puvodni.datum).toISOString() !== noveDatum) {
    zmeny.pripomenuto_den = null;
    zmeny.pripomenuto_hodina = null;
  }

  const { error } = await sb.from("akce").update(zmeny).eq("id", akceId);

  if (error) {
    alert("Úpravu se nepodařilo uložit: " + error.message);
    return;
  }
  await nactiAkce();
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
