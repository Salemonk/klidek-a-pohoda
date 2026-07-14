// ============================================================
// Zvednutí cache-busting verzí (?v=N) v HTML souborech
//
// Web používá u lokálních skriptů a stylů příponu ?v=N, aby si
// prohlížeče členů po každé změně stáhly novou verzi souboru.
// Tenhle skript zvedne číslo verze všude najednou, ať se na žádný
// HTML soubor nezapomene.
//
// POUŽITÍ (v kořeni projektu):
//   node zvednout-verzi.js styl klient     ... zvedne verzi styl.css
//                                              a klient.js ve všech HTML
//   node zvednout-verzi.js --kontrola      ... jen zkontroluje, že má
//                                              každý soubor všude stejnou
//                                              verzi (nic nemění)
//
// Názvy se zadávají bez přípony a bez cesty: styl, klient, chat,
// prispevky, ankety, akce, vyzvy, config, verejna, pwa, stratagemy-data...
// ============================================================

const fs = require("fs");
const path = require("path");

const slozka = __dirname;
const htmlSoubory = fs.readdirSync(slozka)
  .filter((s) => s.endsWith(".html"))
  .map((s) => path.join(slozka, s));

// Najde všechny verzované odkazy ve všech HTML: mapa nazev -> Set verzí
function nactiVerze() {
  const verze = {}; // nazev -> { verzeSet: Set, vyskytu: number }
  for (const soubor of htmlSoubory) {
    const obsah = fs.readFileSync(soubor, "utf8");
    for (const shoda of obsah.matchAll(/(?:css|js)\/([a-z0-9-]+)\.(?:css|js)\?v=(\d+)/g)) {
      const nazev = shoda[1];
      if (!verze[nazev]) verze[nazev] = { verzeSet: new Set(), vyskytu: 0 };
      verze[nazev].verzeSet.add(Number(shoda[2]));
      verze[nazev].vyskytu++;
    }
  }
  return verze;
}

// Režim kontroly: vypíše přehled a skončí chybou při nesouladu
function kontrola() {
  const verze = nactiVerze();
  let vPoradku = true;

  console.log("Přehled verzí v HTML souborech:");
  for (const [nazev, info] of Object.entries(verze).sort()) {
    const seznam = [...info.verzeSet].sort((a, b) => a - b);
    const stav = seznam.length === 1 ? "OK" : "NESOULAD!";
    if (seznam.length > 1) vPoradku = false;
    console.log(`  ${nazev.padEnd(18)} v=${seznam.join(", v=")}  (${info.vyskytu}x)  ${stav}`);
  }

  if (!vPoradku) {
    console.error("\nPozor: některý soubor má v různých HTML různé verze.");
    process.exit(1);
  }
  console.log("\nVšechny verze jsou konzistentní.");
}

// Zvedne verzi zadaných názvů ve všech HTML o 1 (z nejvyšší nalezené)
function zvedni(nazvy) {
  const verze = nactiVerze();

  for (const nazev of nazvy) {
    if (!verze[nazev]) {
      console.error(`Soubor "${nazev}" se v žádném HTML nepoužívá. Překlep?`);
      console.error("Známé názvy: " + Object.keys(verze).sort().join(", "));
      process.exit(1);
    }
  }

  for (const nazev of nazvy) {
    const nova = Math.max(...verze[nazev].verzeSet) + 1;
    const vzor = new RegExp(`((?:css|js)/${nazev}\\.(?:css|js)\\?v=)\\d+`, "g");
    let zmen = 0;

    for (const soubor of htmlSoubory) {
      const obsah = fs.readFileSync(soubor, "utf8");
      const novy = obsah.replace(vzor, (cele, zacatek) => { zmen++; return zacatek + nova; });
      if (novy !== obsah) fs.writeFileSync(soubor, novy);
    }
    console.log(`${nazev}: nová verze v=${nova} (${zmen} odkazů)`);
  }
}

const argumenty = process.argv.slice(2);
if (argumenty.length === 0) {
  console.log("Použití: node zvednout-verzi.js <nazev> [<nazev>...]  nebo  --kontrola");
  process.exit(0);
}
if (argumenty.includes("--kontrola")) {
  kontrola();
} else {
  zvedni(argumenty);
}
