// ============================================================
// Výzvy: randomizer stratagemů (data v js/stratagemy-data.js)
// ============================================================

let mujProfilVyzvy = null;
let posledniVyber = []; // naposledy vylosovaná sada (pro reroll a sdílení)

async function spustStranku() {
  const session = await vyzadujPrihlaseni();
  if (!session) return;

  mujProfilVyzvy = await nactiMujProfil(session.user.id);

  vykresliKategorie();
  pripravOvladani();
  vykresliSeznamStratagemu();
}

// ---------- Ovládací prvky ----------

function vykresliKategorie() {
  const obal = document.getElementById("kategorie-seznam");
  obal.innerHTML = Object.entries(KATEGORIE_STRATAGEMU).map(([klic, info]) => `
    <label class="vyzva-prepinac">
      <input type="checkbox" class="kategorie-checkbox" value="${klic}" checked>
      ${info.emoji} ${esc(info.nazev)}
    </label>`).join("");
}

// Seskupí stratagemy podle kategorie a vrátí HTML se jmény po skupinách
// (pořadí kategorií podle KATEGORIE_STRATAGEMU).
function seznamPodleKategorieHtml(seznamStratagemu) {
  return Object.entries(KATEGORIE_STRATAGEMU).map(([klic, info]) => {
    const polozky = seznamStratagemu.filter((s) => s.kategorie === klic);
    if (polozky.length === 0) return "";
    return `
      <div class="vyzva-seznam-kategorie">
        <h4>${info.emoji} ${esc(info.nazev)} (${polozky.length})</h4>
        <p>${polozky.map((s) => esc(s.nazev)).join(", ")}</p>
      </div>`;
  }).join("");
}

function vykresliSeznamStratagemu() {
  document.getElementById("seznam-v-nabidce").innerHTML = `
    <h3>V nabídce (${STRATAGEMY.length})</h3>
    ${seznamPodleKategorieHtml(STRATAGEMY)}`;

  if (typeof VYRAZENE_STRATAGEMY !== "undefined" && VYRAZENE_STRATAGEMY.length > 0) {
    document.getElementById("seznam-vyrazene").innerHTML = `
      <h3>Vyřazené, nelosují se (${VYRAZENE_STRATAGEMY.length})</h3>
      ${seznamPodleKategorieHtml(VYRAZENE_STRATAGEMY)}`;
  }
}

function pripravOvladani() {
  document.getElementById("tlacitko-1").addEventListener("click", () => vylosuj(1));
  document.getElementById("tlacitko-4").addEventListener("click", () => vylosuj(4));
  document.getElementById("tlacitko-kopirovat").addEventListener("click", zkopirujVyzvu);
  document.getElementById("tlacitko-discord").addEventListener("click", posliVyzvuDoDiscordu);
}

function vybraneKategorie() {
  return Array.from(document.querySelectorAll(".kategorie-checkbox:checked")).map((p) => p.value);
}

// ---------- Losování ----------

// Fisher-Yates zamíchání kopie pole
function zamichej(pole) {
  const kopie = pole.slice();
  for (let i = kopie.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [kopie[i], kopie[j]] = [kopie[j], kopie[i]];
  }
  return kopie;
}

// Zabírá stratagem místo na zádech? (kategorie Batohy, nebo zbraň s batohem)
function zabiraMistoNaZadech(polozka) {
  return polozka.kategorie === "batoh" || polozka.kategorie === "zbran_batoh";
}

// Je stratagem podpůrná zbraň? (obě kategorie zbraní, s batohem i bez)
function jeZbran(polozka) {
  return polozka.kategorie === "zbran" || polozka.kategorie === "zbran_batoh";
}

function vyfiltrovanaNabidka(kategorie) {
  return STRATAGEMY.filter((s) => kategorie.includes(s.kategorie));
}

function vylosuj(pocet) {
  const chyba = document.getElementById("vyzva-chyba");
  skryjHlasku(chyba);
  document.getElementById("vyzva-hlaska").textContent = "";

  const kategorie = vybraneKategorie();
  if (kategorie.length === 0) {
    zobrazHlasku(chyba, "Zaškrtni aspoň jednu kategorii.");
    return;
  }

  const nabidka = vyfiltrovanaNabidka(kategorie);

  let vysledek;
  if (pocet === 1) {
    if (nabidka.length === 0) {
      zobrazHlasku(chyba, "Ve vybraných kategoriích není žádná položka.");
      return;
    }
    vysledek = [zamichej(nabidka)[0]];
  } else {
    const pravidloZbran = document.getElementById("pravidlo-zbran").checked;
    const pravidloBatoh = document.getElementById("pravidlo-batoh").checked;
    const chybaZprava = vylosujLoadout(nabidka, pravidloZbran, pravidloBatoh);
    if (typeof chybaZprava === "string") {
      zobrazHlasku(chyba, chybaZprava);
      return;
    }
    vysledek = chybaZprava;
  }

  posledniVyber = vysledek;
  zobrazVysledek();
}

// Vrátí pole 4 vylosovaných položek, nebo textovou chybovou hlášku,
// když zadaná kombinace kategorií a pravidel nejde splnit.
function vylosujLoadout(nabidka, pravidloZbran, pravidloBatoh) {
  if (nabidka.length < 4) {
    return "Ve vybraných kategoriích jsou míň než 4 položky, zaškrtni víc kategorií.";
  }

  const vybrane = [];

  if (pravidloZbran) {
    const zbrane = nabidka.filter(jeZbran);
    if (zbrane.length === 0) {
      return "Pravidlo „aspoň jedna podpůrná zbraň“ potřebuje zaškrtnutou aspoň jednu kategorii podpůrných zbraní.";
    }
    vybrane.push(zamichej(zbrane)[0]);
  }

  let pocitadloBatohu = vybrane.filter(zabiraMistoNaZadech).length;
  const zbytek = zamichej(nabidka.filter((s) => !vybrane.includes(s)));

  for (const polozka of zbytek) {
    if (vybrane.length >= 4) break;
    if (pravidloBatoh && zabiraMistoNaZadech(polozka) && pocitadloBatohu >= 1) continue;
    vybrane.push(polozka);
    if (zabiraMistoNaZadech(polozka)) pocitadloBatohu++;
  }

  if (vybrane.length < 4) {
    return "S vybranými kategoriemi a pravidly nejde vylosovat 4 různé položky. Zkus zaškrtnout víc kategorií nebo vypnout pravidlo.";
  }

  return zamichej(vybrane);
}

// Přelosuje jen jeden slot loadoutu, ostatní zůstanou (bez duplicit,
// s ohledem na pravidla loadoutu).
function rerollSlot(index) {
  const chyba = document.getElementById("vyzva-chyba");
  skryjHlasku(chyba);

  const kategorie = vybraneKategorie();
  const nabidka = vyfiltrovanaNabidka(kategorie);
  const pravidloZbran = document.getElementById("pravidlo-zbran").checked;
  const pravidloBatoh = document.getElementById("pravidlo-batoh").checked;

  const ostatni = posledniVyber.filter((_, i) => i !== index);
  const jmenaOstatnich = ostatni.map((s) => s.nazev);

  let kandidati = nabidka.filter((s) => !jmenaOstatnich.includes(s.nazev));

  if (pravidloZbran && !ostatni.some(jeZbran)) {
    kandidati = kandidati.filter(jeZbran);
  }

  if (pravidloBatoh && ostatni.some(zabiraMistoNaZadech)) {
    kandidati = kandidati.filter((s) => !zabiraMistoNaZadech(s));
  }

  if (kandidati.length === 0) {
    zobrazHlasku(chyba, "Tenhle slot se nedá přelosovat, zkus to na jiném, nebo uprav pravidla.");
    return;
  }

  posledniVyber[index] = zamichej(kandidati)[0];
  zobrazVysledek();
}

// ---------- Zobrazení výsledku ----------

function zobrazVysledek() {
  document.getElementById("panel-vysledek").style.display = "block";
  document.getElementById("vyzva-hlaska").textContent = "";

  const obal = document.getElementById("vyzva-vysledek");
  obal.innerHTML = posledniVyber.map((polozka, index) => {
    const info = KATEGORIE_STRATAGEMU[polozka.kategorie];
    const reroll = posledniVyber.length > 1
      ? `<button class="tlacitko-nenapadne vyzva-slot-reroll" onclick="rerollSlot(${index})" title="Přelosovat jen tenhle slot">↻</button>`
      : "";
    return `
      <div class="vyzva-slot">
        <span class="vyzva-slot-emoji">${info.emoji}</span>
        <span class="vyzva-slot-nazev">${esc(polozka.nazev)}</span>
        <span class="stitek">${esc(info.nazev)}</span>
        ${reroll}
      </div>`;
  }).join("");
}

// ---------- Sdílení ----------

function sestavTextVyzvy() {
  const prezdivka = mujProfilVyzvy ? mujProfilVyzvy.prezdivka : "Ty";
  const radky = posledniVyber.map((polozka, index) => {
    const info = KATEGORIE_STRATAGEMU[polozka.kategorie];
    return `${index + 1}. ${info.emoji} ${polozka.nazev}`;
  });
  return `🎲 Výzva pro ${prezdivka}:\n` + radky.join("\n");
}

async function zkopirujVyzvu() {
  const text = sestavTextVyzvy();
  try {
    await navigator.clipboard.writeText(text);
    document.getElementById("vyzva-hlaska").textContent = "Zkopírováno do schránky. ✔";
  } catch (e) {
    prompt("Zkopíruj text ručně:", text);
  }
}

async function posliVyzvuDoDiscordu() {
  const tlacitko = document.getElementById("tlacitko-discord");
  const hlaska = document.getElementById("vyzva-hlaska");
  tlacitko.disabled = true;
  hlaska.style.color = "";
  hlaska.textContent = "";

  const text = sestavTextVyzvy();
  const { error } = await sb.rpc("posli_vyzvu", { text_vyzvy: text });

  if (error) {
    hlaska.textContent = error.message;
    hlaska.style.color = "var(--chyba)";
  } else {
    hlaska.textContent = "Výzva odeslána do Discordu! 💬";
    hlaska.style.color = "var(--akcent)";
  }
  tlacitko.disabled = false;
}

spustStranku();
