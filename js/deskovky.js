// ============================================================
// Deskovky: veřejný kalendář deskoherní skupiny (deskovky.html)
//
// Nemá vazbu na guildu. Kdokoli vidí hraní a hry, přihlásí se
// jménem a hlasuje o hrách. Při přihlášení si prohlížeč uloží
// náhodný tajný kód (localStorage), kterým jde později změnit
// hlasy nebo se odhlásit. Databáze zná jen jeho otisk.
//
// Zápis návštěvníků jde VÝHRADNĚ přes RPC funkce ze skriptu
// supabase/deskovky.sql. Admin guildy (je_admin) zakládá hraní
// a spravuje seznam her přímo přes tabulky (RLS).
// ============================================================

const KLIC_PRIHLASEK = "kap-deskovky-prihlasky"; // { idPrihlasky: tajnyKod }
const KLIC_HESLA = "kap-deskovky-heslo";          // zapamatované skupinové heslo
const HRANI_TRVA_HODIN = 4; // jak dlouho po začátku se hraní ještě ukazuje nahoře

let jeAdmin = false;
let hry = [];            // všechny hry seřazené podle názvu
let hryMapa = {};        // id -> hra
let akce = [];           // všechna hraní včetně přihlášek
let upravovanaAkceId = null;
let vybraneHry = new Set(); // výběr her ve formuláři správy
let vyzadujeHeslo = false;  // je nastavené skupinové heslo?

const HLASKY_CHYB = {
  neplatny_kod: "Něco se pokazilo s prohlížečem. Zkus obnovit stránku.",
  akce_neexistuje: "Tohle hraní už neexistuje. Obnov stránku.",
  akce_probehla: "Tohle hraní už začalo, přihlásit se nejde.",
  spatne_jmeno: "Jméno musí mít 2 až 40 znaků.",
  plno: "Na tohle hraní už je plno.",
  jmeno_obsazeno: "Někdo s tímhle jménem už je přihlášený. Přidej třeba příjmení nebo iniciálu.",
  zkuste_pozdeji: "Teď se přihlašuje moc lidí najednou. Zkus to za pár minut.",
  nenalezeno: "Přihlášku se nepodařilo najít, možná ji smazal správce.",
  spatne_heslo: "Heslo skupiny nesedí. Zeptej se ostatních ve skupině.",
};

function prelozChybu(chyba) {
  const text = (chyba && chyba.message) || "";
  const kod = Object.keys(HLASKY_CHYB).find((k) => text.includes(k));
  return kod ? HLASKY_CHYB[kod] : "Nepovedlo se to. Zkontroluj připojení a zkus to znovu.";
}

// ---------- Moje přihlášky (localStorage) ----------

function mojePrihlasky() {
  try { return JSON.parse(localStorage.getItem(KLIC_PRIHLASEK)) || {}; }
  catch (e) { return {}; }
}
function ulozMojePrihlasky(mapa) {
  try { localStorage.setItem(KLIC_PRIHLASEK, JSON.stringify(mapa)); } catch (e) { /* nic */ }
}
function ulozeneHeslo() {
  try { return localStorage.getItem(KLIC_HESLA) || ""; } catch (e) { return ""; }
}
function ulozHeslo(heslo) {
  try {
    if (heslo) localStorage.setItem(KLIC_HESLA, heslo);
    else localStorage.removeItem(KLIC_HESLA);
  } catch (e) { /* nic */ }
}

// Odkaz ve tvaru deskovky.html#heslo=xyz heslo rovnou zapamatuje.
// Část za # se na server vůbec neposílá, heslo tak nezůstane v logu.
function prevezmiHesloZOdkazu() {
  const shoda = location.hash.match(/^#heslo=(.+)$/);
  if (!shoda) return;
  try { ulozHeslo(decodeURIComponent(shoda[1]).trim()); } catch (e) { /* rozbitý odkaz */ }
  history.replaceState(null, "", location.pathname + location.search);
}

function novyTajnyKod() {
  const bajty = new Uint8Array(32);
  crypto.getRandomValues(bajty);
  return Array.from(bajty, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- Pomocné ----------

// Pro vyhledávání bez ohledu na diakritiku a velikost písmen
function bezDiakritiky(text) {
  return String(text).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Obrázek hry, nebo náhradní dlaždice s písmenem (když obrázek chybí)
function obrazekHry(hra, trida) {
  const cesta = hra && hra.obrazek;
  const bezpecna = cesta && (/^assets\/[\w\-/.]+$/.test(cesta) || /^https:\/\//.test(cesta));
  const pismeno = esc((hra ? hra.nazev : "?").trim().charAt(0).toUpperCase());
  if (!bezpecna) return `<span class="${trida} dk-nahradni" aria-hidden="true">${pismeno}</span>`;
  return `<img class="${trida}" src="${esc(cesta)}" alt="" loading="lazy" width="300" height="300" data-pismeno="${pismeno}">`;
}

// Rozbitý obrázek nahradíme dlaždicí s písmenem
document.addEventListener("error", (udalost) => {
  const img = udalost.target;
  if (!(img instanceof HTMLImageElement) || !img.dataset.pismeno) return;
  const nahrada = document.createElement("span");
  nahrada.className = img.className + " dk-nahradni";
  nahrada.textContent = img.dataset.pismeno;
  img.replaceWith(nahrada);
}, true);

function prevedNaLokalniCas(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function jeNadchazejici(a) {
  return new Date(a.datum).getTime() > Date.now() - HRANI_TRVA_HODIN * 3600 * 1000;
}
function uzZacala(a) {
  return new Date(a.datum).getTime() <= Date.now();
}

// Počty hlasů pro hry nabídnuté u hraní, seřazené od nejvíc hlasů
function vysledkyHlasovani(a) {
  const pocty = {};
  a.deskovky_akce_hry.forEach((ah) => { pocty[ah.hra_id] = 0; });
  a.deskovky_prihlasky.forEach((p) => {
    p.deskovky_hlasy.forEach((h) => {
      if (h.hra_id in pocty) pocty[h.hra_id]++;
    });
  });
  return Object.entries(pocty)
    .map(([id, pocet]) => ({ hra: hryMapa[id], pocet }))
    .filter((v) => v.hra)
    .sort((x, y) => y.pocet - x.pocet || x.hra.nazev.localeCompare(y.hra.nazev, "cs"));
}

// ---------- Načtení dat ----------

async function nactiHry() {
  const { data, error } = await sb
    .from("deskovky_hry")
    .select("id, nazev, rok, obrazek, odkaz");
  if (error) throw error;
  hry = data.sort((a, b) => a.nazev.localeCompare(b.nazev, "cs"));
  hryMapa = Object.fromEntries(hry.map((h) => [h.id, h]));
}

async function nactiAkce() {
  const { data, error } = await sb
    .from("deskovky_akce")
    .select("id, nazev, datum, misto, popis, kapacita, deskovky_akce_hry(hra_id), deskovky_prihlasky(id, jmeno, vytvoreno, deskovky_hlasy(hra_id))")
    .order("datum");
  if (error) throw error;
  akce = data;
  akce.forEach((a) => a.deskovky_prihlasky.sort((x, y) => x.vytvoreno.localeCompare(y.vytvoreno)));
}

async function obnov() {
  try {
    await nactiAkce();
    vykresliAkce();
  } catch (e) {
    zobrazToast("Nepodařilo se načíst kalendář. Zkus obnovit stránku.");
  }
}

// ---------- Vykreslení hraní ----------

function vykresliAkce() {
  const nadchazejici = akce.filter(jeNadchazejici);
  const probehle = akce.filter((a) => !jeNadchazejici(a)).reverse();
  const otevrene = new Set([...document.querySelectorAll(".dk-formular:not(:empty)")]
    .map((f) => f.closest(".dk-akce").dataset.id));

  document.getElementById("seznam-akci").innerHTML = nadchazejici.length
    ? nadchazejici.map(kartaAkce).join("")
    : `<p class="nacitani">Zatím není naplánované žádné hraní. Mrkni sem zase brzy.</p>`;

  document.getElementById("seznam-probehlych").innerHTML = probehle.length
    ? probehle.map(radekProbehle).join("")
    : `<p class="nacitani">Zatím nic.</p>`;

  // Rozepsaný formulář po obnovení nezavíráme
  otevrene.forEach((id) => {
    if (document.querySelector(`.dk-akce[data-id="${id}"]`)) otevriFormular(Number(id));
  });
}

function kartaAkce(a) {
  const datum = new Date(a.datum);
  const den = datum.toLocaleDateString("cs-CZ", { weekday: "short" });
  const mesic = datum.toLocaleDateString("cs-CZ", { month: "short" }).replace(".", "");
  const cas = datum.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
  const lidi = a.deskovky_prihlasky;
  const plno = a.kapacita && lidi.length >= a.kapacita;
  const zacala = uzZacala(a);
  const moje = mojePrihlasky();
  const mojePrihlaska = lidi.find((p) => moje[p.id]);

  const obsazenost = a.kapacita
    ? `<span class="dk-obsazenost${plno ? " plno" : ""}">${lidi.length}/${a.kapacita} míst</span>`
    : `<span class="dk-obsazenost">${lidi.length} ${lidi.length === 1 ? "hráč" : lidi.length >= 2 && lidi.length <= 4 ? "hráči" : "hráčů"}</span>`;

  const vysledky = vysledkyHlasovani(a);
  const maxHlasu = Math.max(1, ...vysledky.map((v) => v.pocet));
  const hlasovani = vysledky.length ? `
    <div class="dk-hlasovani">
      <p class="dk-podnadpis">Co budeme hrát? <span class="akce-meta">(hlasy přihlášených)</span></p>
      ${vysledky.map((v) => `
        <div class="dk-hra-hlas">
          ${obrazekHry(v.hra, "dk-hra-hlas-obr")}
          <div class="dk-hra-hlas-text">
            ${v.hra.odkaz
              ? `<a href="${esc(v.hra.odkaz)}" target="_blank" rel="noopener">${esc(v.hra.nazev)}</a>`
              : `<span>${esc(v.hra.nazev)}</span>`}
            <div class="dk-pruh"><i style="width:${Math.round((v.pocet / maxHlasu) * 100)}%"></i></div>
          </div>
          <span class="anketa-pocet">${v.pocet}</span>
        </div>`).join("")}
    </div>` : "";

  const seznamLidi = lidi.length ? `
    <p class="dk-lide"><span class="akce-meta">Přijdou:</span>
      ${lidi.map((p) => `<span class="dk-clovek${moje[p.id] ? " ja" : ""}">${esc(p.jmeno)}${jeAdmin
        ? ` <button class="dk-smazat-cloveka" onclick="smazPrihlaskuAdmin(${p.id})" aria-label="Odebrat ${esc(p.jmeno)}">×</button>` : ""}</span>`).join("")}
    </p>` : `<p class="dk-lide akce-meta">Zatím nikdo, buď první.</p>`;

  let akceTlacitka;
  if (mojePrihlaska) {
    akceTlacitka = `
      <p class="dk-stav">✅ Jsi přihlášený jako <strong>${esc(mojePrihlaska.jmeno)}</strong>.</p>
      ${zacala ? "" : `
        ${vysledky.length ? `<button class="tlacitko tlacitko-male" onclick="otevriFormular(${a.id})">Změnit hlasy</button>` : ""}
        <button class="tlacitko-obrys tlacitko-male" onclick="odhlasSe(${a.id}, ${mojePrihlaska.id})">Odhlásit se</button>`}`;
  } else if (zacala) {
    akceTlacitka = `<p class="dk-stav akce-meta">Hraní už začalo.</p>`;
  } else if (plno) {
    akceTlacitka = `<p class="dk-stav akce-meta">Je plno.</p>`;
  } else {
    akceTlacitka = `<button class="tlacitko tlacitko-male" onclick="otevriFormular(${a.id})">Přihlásit se</button>`;
  }

  const spravce = jeAdmin ? `
    <div class="dk-admin-tlacitka">
      <button class="tlacitko-nenapadne" onclick="upravAkci(${a.id})">upravit</button>
      <button class="tlacitko-nenapadne" onclick="smazAkci(${a.id})">smazat</button>
    </div>` : "";

  return `
    <article class="dk-akce akce-polozka" data-id="${a.id}">
      <div class="dk-akce-hlava">
        <div class="dk-kalendarik" aria-hidden="true">
          <span class="dk-den-tydne">${esc(den)}</span>
          <span class="dk-den">${datum.getDate()}</span>
          <span class="dk-mesic">${esc(mesic)}</span>
        </div>
        <div class="dk-akce-info">
          <h3>${esc(a.nazev)}</h3>
          <p class="akce-datum">${esc(formatujDatum(a.datum))}</p>
          ${a.misto ? `<p class="akce-meta">📍 ${esc(a.misto)}</p>` : ""}
        </div>
        ${obsazenost}
      </div>
      ${a.popis ? `<div class="akce-popis">${formatujText(a.popis)}</div>` : ""}
      ${hlasovani}
      ${seznamLidi}
      <div class="dk-tlacitka">
        ${akceTlacitka}
        <button class="tlacitko-nenapadne" onclick="doKalendare(${a.id})">📅 do kalendáře</button>
      </div>
      <div class="dk-formular"></div>
      ${spravce}
    </article>`;
}

function radekProbehle(a) {
  const vitez = vysledkyHlasovani(a).find((v) => v.pocet > 0);
  const lidi = a.deskovky_prihlasky.length;
  return `
    <div class="dk-probehle">
      <span class="akce-datum">${esc(formatujDatumKratce(a.datum))}</span>
      <span>${esc(a.nazev)}</span>
      <span class="akce-meta">${lidi ? `${lidi} přihlášených` : ""}${vitez ? ` · nejvíc hlasů: ${esc(vitez.hra.nazev)}` : ""}</span>
      ${jeAdmin ? `<button class="tlacitko-nenapadne" onclick="smazAkci(${a.id})">smazat</button>` : ""}
    </div>`;
}

function doKalendare(id) {
  const a = akce.find((x) => x.id === id);
  if (!a) return;
  const popis = [a.misto ? "Místo: " + a.misto : "", a.popis || ""].filter(Boolean).join("\n\n");
  pridejDoKalendare(a.nazev, popis, a.datum, 3);
}

// ---------- Přihláška a hlasování ----------

function otevriFormular(id) {
  const a = akce.find((x) => x.id === id);
  const karta = document.querySelector(`.dk-akce[data-id="${id}"]`);
  if (!a || !karta) return;
  const moje = mojePrihlasky();
  const mojePrihlaska = a.deskovky_prihlasky.find((p) => moje[p.id]);
  const mojeHlasy = new Set(mojePrihlaska ? mojePrihlaska.deskovky_hlasy.map((h) => h.hra_id) : []);
  const nabidka = a.deskovky_akce_hry.map((ah) => hryMapa[ah.hra_id]).filter(Boolean)
    .sort((x, y) => x.nazev.localeCompare(y.nazev, "cs"));

  karta.querySelector(".dk-formular").innerHTML = `
    <form class="dk-prihlaska" onsubmit="odesliPrihlasku(event, ${a.id})">
      ${mojePrihlaska ? "" : `
        <label for="jmeno-${a.id}">Tvoje jméno nebo přezdívka</label>
        <input type="text" id="jmeno-${a.id}" name="jmeno" minlength="2" maxlength="40" required autocomplete="nickname">
        ${vyzadujeHeslo && !ulozeneHeslo() ? `
          <label for="heslo-${a.id}">Heslo skupiny</label>
          <input type="text" id="heslo-${a.id}" name="heslo" maxlength="100" required autocomplete="off"
                 placeholder="Najdeš ho ve skupině">` : ""}
        <div class="dk-past" aria-hidden="true">
          <label>Tohle pole nevyplňuj <input type="text" name="web" tabindex="-1" autocomplete="off"></label>
        </div>`}
      ${nabidka.length ? `
        <p class="dk-podnadpis">Co bys chtěl hrát? <span class="akce-meta">(můžeš zaškrtnout víc her)</span></p>
        <div class="dk-volby">
          ${nabidka.map((h) => `
            <label class="dk-volba">
              <input type="checkbox" name="hra" value="${h.id}"${mojeHlasy.has(h.id) ? " checked" : ""}>
              ${obrazekHry(h, "dk-volba-obr")}
              <span>${esc(h.nazev)}</span>
            </label>`).join("")}
        </div>` : ""}
      <div class="chyba"></div>
      <div class="dk-tlacitka">
        <button type="submit" class="tlacitko tlacitko-male">${mojePrihlaska ? "Uložit hlasy" : "Přihlásit se"}</button>
        <button type="button" class="tlacitko-nenapadne" onclick="zavriFormular(${a.id})">zrušit</button>
      </div>
    </form>`;
  const prvniPole = karta.querySelector(".dk-prihlaska input");
  if (prvniPole && !mojePrihlaska) prvniPole.focus();
}

function zavriFormular(id) {
  const karta = document.querySelector(`.dk-akce[data-id="${id}"]`);
  if (karta) karta.querySelector(".dk-formular").innerHTML = "";
}

async function odesliPrihlasku(udalost, idAkce) {
  udalost.preventDefault();
  const formular = udalost.target;
  const chyba = formular.querySelector(".chyba");
  const tlacitko = formular.querySelector("button[type=submit]");
  skryjHlasku(chyba);

  // Robot vyplnil skryté pole: tváříme se, že je hotovo, a nic neuložíme
  if (formular.web && formular.web.value) { zavriFormular(idAkce); return; }

  const vybrane = [...formular.querySelectorAll("input[name=hra]:checked")].map((i) => Number(i.value));
  const moje = mojePrihlasky();
  const a = akce.find((x) => x.id === idAkce);
  const mojePrihlaska = a && a.deskovky_prihlasky.find((p) => moje[p.id]);

  tlacitko.disabled = true;
  let error;
  if (mojePrihlaska) {
    ({ error } = await sb.rpc("deskovky_zmenit_hlasy", {
      p_prihlaska: mojePrihlaska.id, p_kod: moje[mojePrihlaska.id], p_hry: vybrane,
    }));
  } else {
    const kod = novyTajnyKod();
    const heslo = formular.heslo ? formular.heslo.value.trim() : ulozeneHeslo();
    const vysledek = await sb.rpc("deskovky_prihlasit", {
      p_akce: idAkce, p_jmeno: formular.jmeno.value, p_hry: vybrane, p_kod: kod, p_heslo: heslo || null,
    });
    error = vysledek.error;
    if (!error) {
      moje[vysledek.data] = kod;
      ulozMojePrihlasky(moje);
      if (vyzadujeHeslo) ulozHeslo(heslo);
    } else if (String(error.message).includes("spatne_heslo") && !formular.heslo) {
      // Zapamatované heslo už neplatí (správce ho změnil): zeptáme se znovu
      ulozHeslo("");
      vyzadujeHeslo = true;
      tlacitko.disabled = false;
      const jmeno = formular.jmeno.value;
      otevriFormular(idAkce);
      const novyFormular = document.querySelector(`.dk-akce[data-id="${idAkce}"] .dk-prihlaska`);
      novyFormular.jmeno.value = jmeno;
      vybrane.forEach((id) => {
        const pole = novyFormular.querySelector(`input[name=hra][value="${id}"]`);
        if (pole) pole.checked = true;
      });
      zobrazHlasku(novyFormular.querySelector(".chyba"), "Heslo skupiny se změnilo, zadej prosím nové.");
      return;
    }
  }
  tlacitko.disabled = false;

  if (error) { zobrazHlasku(chyba, prelozChybu(error)); return; }
  zavriFormular(idAkce);
  zobrazToast(mojePrihlaska ? "Hlasy uložené." : "Jsi přihlášený, těšíme se!", "uspech");
  await obnov();
}

async function odhlasSe(idAkce, idPrihlasky) {
  if (!confirm("Opravdu se chceš z hraní odhlásit?")) return;
  const moje = mojePrihlasky();
  const { error } = await sb.rpc("deskovky_odhlasit", { p_prihlaska: idPrihlasky, p_kod: moje[idPrihlasky] });
  if (error && !String(error.message).includes("nenalezeno")) { zobrazToast(prelozChybu(error)); return; }
  delete moje[idPrihlasky];
  ulozMojePrihlasky(moje);
  zobrazToast("Odhlášeno.", "uspech");
  await obnov();
}

// ---------- Seznam her ----------

function vykresliHry() {
  const hledat = bezDiakritiky(document.getElementById("hledat-hru").value.trim());
  const vyber = hry.filter((h) => !hledat || bezDiakritiky(h.nazev).includes(hledat));
  document.getElementById("seznam-her").innerHTML = vyber.length
    ? vyber.map((h) => `
      <div class="dk-hra">
        ${h.odkaz ? `<a href="${esc(h.odkaz)}" target="_blank" rel="noopener" class="dk-hra-odkaz">` : `<div class="dk-hra-odkaz">`}
          ${obrazekHry(h, "dk-hra-obr")}
          <span class="dk-hra-nazev">${esc(h.nazev)}</span>
          ${h.rok ? `<span class="akce-meta">${h.rok}</span>` : ""}
        ${h.odkaz ? "</a>" : "</div>"}
        ${jeAdmin ? `<button class="dk-smazat-hru" onclick="smazHru(${h.id})" aria-label="Smazat hru ${esc(h.nazev)}">×</button>` : ""}
      </div>`).join("")
    : `<p class="nacitani">Žádná hra neodpovídá hledání.</p>`;
}

// ---------- Správa (jen admin) ----------

function vykresliVyberHer() {
  const hledat = bezDiakritiky(document.getElementById("akce-hledat-hru").value.trim());
  const seznam = hry.filter((h) => vybraneHry.has(h.id) || !hledat || bezDiakritiky(h.nazev).includes(hledat));
  document.getElementById("vyber-her").innerHTML = seznam.map((h) => `
    <label class="dk-volba dk-volba-mala${vybraneHry.has(h.id) ? " vybrano" : ""}">
      <input type="checkbox" value="${h.id}"${vybraneHry.has(h.id) ? " checked" : ""} onchange="prepniHruVeVyberu(${h.id}, this.checked)">
      ${obrazekHry(h, "dk-volba-obr")}
      <span>${esc(h.nazev)}</span>
    </label>`).join("");
  document.getElementById("pocet-vybranych").textContent = vybraneHry.size ? `(vybráno ${vybraneHry.size})` : "";
}

function prepniHruVeVyberu(id, zapnout) {
  if (zapnout) vybraneHry.add(id); else vybraneHry.delete(id);
  vykresliVyberHer();
}

function vynulujFormularAkce() {
  upravovanaAkceId = null;
  vybraneHry = new Set();
  document.getElementById("formular-akce").reset();
  document.getElementById("nadpis-formulare-akce").textContent = "Naplánovat hraní";
  document.getElementById("tlacitko-ulozit-akci").textContent = "Vytvořit hraní";
  document.getElementById("tlacitko-zrusit-upravu").hidden = true;
  skryjHlasku(document.getElementById("chyba-akce"));
  vykresliVyberHer();
}

function upravAkci(id) {
  const a = akce.find((x) => x.id === id);
  if (!a) return;
  upravovanaAkceId = id;
  document.getElementById("akce-nazev").value = a.nazev;
  document.getElementById("akce-datum").value = prevedNaLokalniCas(a.datum);
  document.getElementById("akce-kapacita").value = a.kapacita || "";
  document.getElementById("akce-misto").value = a.misto || "";
  document.getElementById("akce-popis").value = a.popis || "";
  document.getElementById("akce-hledat-hru").value = "";
  vybraneHry = new Set(a.deskovky_akce_hry.map((ah) => ah.hra_id));
  document.getElementById("nadpis-formulare-akce").textContent = "Upravit hraní";
  document.getElementById("tlacitko-ulozit-akci").textContent = "Uložit změny";
  document.getElementById("tlacitko-zrusit-upravu").hidden = false;
  vykresliVyberHer();
  document.getElementById("sprava").scrollIntoView({ behavior: "smooth" });
}

async function ulozAkci(udalost) {
  udalost.preventDefault();
  const chyba = document.getElementById("chyba-akce");
  skryjHlasku(chyba);
  const kapacita = document.getElementById("akce-kapacita").value;
  const radek = {
    nazev: document.getElementById("akce-nazev").value.trim(),
    datum: new Date(document.getElementById("akce-datum").value).toISOString(),
    misto: document.getElementById("akce-misto").value.trim() || null,
    popis: document.getElementById("akce-popis").value.trim() || null,
    kapacita: kapacita ? Number(kapacita) : null,
  };
  const tlacitko = document.getElementById("tlacitko-ulozit-akci");
  tlacitko.disabled = true;
  try {
    let id = upravovanaAkceId;
    if (id) {
      const { error } = await sb.from("deskovky_akce")
        .update({ ...radek, upraveno: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      const { error: chybaMazani } = await sb.from("deskovky_akce_hry").delete().eq("akce_id", id);
      if (chybaMazani) throw chybaMazani;
    } else {
      const { data, error } = await sb.from("deskovky_akce").insert(radek).select("id").single();
      if (error) throw error;
      id = data.id;
    }
    if (vybraneHry.size) {
      const { error } = await sb.from("deskovky_akce_hry")
        .insert([...vybraneHry].map((hraId) => ({ akce_id: id, hra_id: hraId })));
      if (error) throw error;
    }
    zobrazToast(upravovanaAkceId ? "Hraní upravené." : "Hraní vytvořené.", "uspech");
    vynulujFormularAkce();
    await obnov();
  } catch (e) {
    zobrazHlasku(chyba, "Uložení se nepovedlo: " + (e.message || "neznámá chyba"));
  } finally {
    tlacitko.disabled = false;
  }
}

async function smazAkci(id) {
  const a = akce.find((x) => x.id === id);
  if (!a || !confirm(`Smazat hraní „${a.nazev}“ včetně všech přihlášek? Nejde to vrátit.`)) return;
  const { error } = await sb.from("deskovky_akce").delete().eq("id", id);
  if (error) { zobrazToast("Smazání se nepovedlo."); return; }
  if (upravovanaAkceId === id) vynulujFormularAkce();
  await obnov();
}

async function smazPrihlaskuAdmin(id) {
  const prihlaska = akce.flatMap((a) => a.deskovky_prihlasky).find((p) => p.id === id);
  if (!prihlaska || !confirm(`Odebrat z hraní: ${prihlaska.jmeno}?`)) return;
  const { error } = await sb.from("deskovky_prihlasky").delete().eq("id", id);
  if (error) { zobrazToast("Odebrání se nepovedlo."); return; }
  await obnov();
}

async function pridejHru(udalost) {
  udalost.preventDefault();
  const chyba = document.getElementById("chyba-hry");
  skryjHlasku(chyba);
  const odkaz = document.getElementById("hra-odkaz").value.trim();
  if (odkaz && !/^https:\/\//.test(odkaz)) { zobrazHlasku(chyba, "Odkaz musí začínat https://"); return; }
  const rok = document.getElementById("hra-rok").value;
  const { error } = await sb.from("deskovky_hry").insert({
    nazev: document.getElementById("hra-nazev").value.trim(),
    rok: rok ? Number(rok) : null,
    odkaz: odkaz || null,
  });
  if (error) { zobrazHlasku(chyba, "Přidání se nepovedlo: " + error.message); return; }
  udalost.target.reset();
  zobrazToast("Hra přidaná.", "uspech");
  await nactiHry();
  vykresliHry();
  vykresliVyberHer();
}

async function smazHru(id) {
  const h = hryMapa[id];
  if (!h || !confirm(`Smazat hru „${h.nazev}“ ze seznamu? Zmizí i z hlasování u všech hraní.`)) return;
  const { error } = await sb.from("deskovky_hry").delete().eq("id", id);
  if (error) { zobrazToast("Smazání se nepovedlo."); return; }
  vybraneHry.delete(id);
  await nactiHry();
  vykresliHry();
  vykresliVyberHer();
  await obnov();
}

async function nastavHeslo(udalost) {
  udalost.preventDefault();
  const pole = document.getElementById("nove-heslo");
  const heslo = pole.value.trim();
  if (!heslo && !confirm("Zrušit heslo? Přihlásit se pak půjde bez hesla.")) return;
  const { error } = await sb.rpc("deskovky_nastav_heslo", { p_heslo: heslo });
  if (error) { zobrazToast("Nastavení hesla se nepovedlo."); return; }
  vyzadujeHeslo = !!heslo;
  ulozHeslo(heslo);
  pole.value = "";
  vykresliStavHesla(heslo);
  zobrazToast(heslo ? "Heslo nastavené." : "Heslo zrušené.", "uspech");
}

function vykresliStavHesla(noveHeslo) {
  const stav = document.getElementById("stav-hesla");
  if (!vyzadujeHeslo) { stav.textContent = "Teď se může přihlásit kdokoli bez hesla."; return; }
  const heslo = noveHeslo || ulozeneHeslo();
  if (!heslo) { stav.textContent = "Heslo je nastavené."; return; }
  const odkaz = location.origin + location.pathname + "#heslo=" + encodeURIComponent(heslo);
  stav.innerHTML = `Heslo je nastavené: <strong>${esc(heslo)}</strong><br>
    Odkaz, který heslo vyplní sám: <code class="dk-odkaz-heslo">${esc(odkaz)}</code>
    <button type="button" class="tlacitko-nenapadne" id="kopirovat-odkaz">zkopírovat</button>`;
  document.getElementById("kopirovat-odkaz").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(odkaz); zobrazToast("Odkaz zkopírovaný.", "uspech"); }
    catch (e) { zobrazToast("Kopírování se nepovedlo, označ odkaz ručně."); }
  });
}

// ---------- Start ----------

async function spustDeskovky() {
  if (!inicializujSupabase()) return;
  prevezmiHesloZOdkazu();

  // Admin guildy, který je v tomhle prohlížeči přihlášený, uvidí správu
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      const { data } = await sb.rpc("je_admin");
      jeAdmin = data === true;
    }
  } catch (e) { jeAdmin = false; }

  try {
    const { data } = await sb.rpc("deskovky_vyzaduje_heslo");
    vyzadujeHeslo = data === true;
  } catch (e) { vyzadujeHeslo = false; }

  if (jeAdmin) {
    document.getElementById("sprava").hidden = false;
    document.getElementById("menu-sprava").hidden = false;
    document.getElementById("formular-akce").addEventListener("submit", ulozAkci);
    document.getElementById("formular-hry").addEventListener("submit", pridejHru);
    document.getElementById("tlacitko-zrusit-upravu").addEventListener("click", vynulujFormularAkce);
    document.getElementById("akce-hledat-hru").addEventListener("input", vykresliVyberHer);
    document.getElementById("formular-hesla").addEventListener("submit", nastavHeslo);
    vykresliStavHesla();
  }

  document.getElementById("hledat-hru").addEventListener("input", vykresliHry);

  try {
    await Promise.all([nactiHry(), nactiAkce()]);
  } catch (e) {
    document.getElementById("seznam-akci").innerHTML =
      `<p class="nacitani">Kalendář se nepodařilo načíst. Zkus obnovit stránku.</p>`;
    document.getElementById("seznam-her").innerHTML = "";
    return;
  }
  vykresliAkce();
  vykresliHry();
  if (jeAdmin) vykresliVyberHer();
}

spustDeskovky();
