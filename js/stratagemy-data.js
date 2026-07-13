// ============================================================
// Data pro randomizer stratagemů (stránka Výzvy)
//
// Zdroj: helldivers.wiki.gg/wiki/Stratagems (stav 07/2026, čistě
// Helldivers 2, neplést s Helldivers 1). Jen výbavové stratagemy,
// které si hráč vybírá do loadoutu (~83 položek v 8 kategoriích).
// Misijní stratagemy (Resupply, Reinforce, Hellbomb, SOS Beacon…)
// se do výbavy nevybírají, proto tu úmyslně chybí.
//
// Aktualizace po novém Warbondu: viz NAVOD.md, sekce "Výzvy".
//
// Podpůrné zbraně jsou rozdělené na dvě kategorie podle toho, jestli
// zabírají slot na zádech (batoh) — kvůli pravidlu "max jedna věc na
// zádech" v loadoutu (viz vyzvy.js, zabiraMistoNaZadech()). U pár
// nejnovějších zbraní nebylo možné zabírání batohu spolehlivě dohledat
// na wiki, zařazení do "s batohem" / "bez batohu" je tam nejlepší odhad,
// klidně opravte přímo v tomto souboru, pokud se zjistí jinak.
//
// Názvy jsou bez "sériových" kódů (GR-8, MG-43…) na přání uživatele,
// jen popisný název jako ve výstroji ve hře.
// ============================================================

const KATEGORIE_STRATAGEMU = {
  orbital:     { nazev: "Orbitální údery",             emoji: "🛰️" },
  eagle:       { nazev: "Eagle (letecká podpora)",      emoji: "🦅" },
  zbran:       { nazev: "Podpůrné zbraně (bez batohu)", emoji: "🔫" },
  zbran_batoh: { nazev: "Podpůrné zbraně (s batohem)",  emoji: "🎯" },
  batoh:       { nazev: "Batohy",                       emoji: "🎒" },
  vozidlo:     { nazev: "Vozidla a exosuity",           emoji: "🤖" },
  sentry:      { nazev: "Věže a mortary",                emoji: "🗼" },
  opevneni:    { nazev: "Miny a opevnění",              emoji: "🧱" },
};

const STRATAGEMY = [
  // ---------- Orbitální údery (11) ----------
  { nazev: "Orbital Precision Strike",   kategorie: "orbital" },
  { nazev: "Orbital Gatling Barrage",    kategorie: "orbital" },
  { nazev: "Orbital Gas Strike",         kategorie: "orbital" },
  { nazev: "Orbital 120mm HE Barrage",   kategorie: "orbital" },
  { nazev: "Orbital Airburst Strike",    kategorie: "orbital" },
  { nazev: "Orbital EMS Strike",         kategorie: "orbital" },
  { nazev: "Orbital 380mm HE Barrage",   kategorie: "orbital" },
  { nazev: "Orbital Walking Barrage",    kategorie: "orbital" },
  { nazev: "Orbital Laser",              kategorie: "orbital" },
  { nazev: "Orbital Napalm Barrage",     kategorie: "orbital" },
  { nazev: "Orbital Railcannon Strike",  kategorie: "orbital" },

  // ---------- Eagle (6) ----------
  { nazev: "Eagle Strafing Run",       kategorie: "eagle" },
  { nazev: "Eagle Airstrike",          kategorie: "eagle" },
  { nazev: "Eagle Cluster Bomb",       kategorie: "eagle" },
  { nazev: "Eagle Napalm Airstrike",   kategorie: "eagle" },
  { nazev: "Eagle 110mm Rocket Pods",  kategorie: "eagle" },
  { nazev: "Eagle 500kg Bomb",         kategorie: "eagle" },

  // ---------- Podpůrné zbraně bez batohu (21) ----------
  { nazev: "Machine Gun",              kategorie: "zbran" },
  { nazev: "Expendable Anti-Tank",     kategorie: "zbran" },
  { nazev: "Stalwart",                 kategorie: "zbran" },
  { nazev: "Laser Cannon",             kategorie: "zbran" },
  { nazev: "Anti-Materiel Rifle",      kategorie: "zbran" },
  { nazev: "Grenade Launcher",         kategorie: "zbran" },
  { nazev: "Flamethrower",             kategorie: "zbran" },
  { nazev: "Heavy Machine Gun",        kategorie: "zbran" },
  { nazev: "Arc Thrower",              kategorie: "zbran" },
  { nazev: "Quasar Cannon",            kategorie: "zbran" },
  { nazev: "Commando",                 kategorie: "zbran" },
  { nazev: "Railgun",                  kategorie: "zbran" },
  { nazev: "Epoch",                    kategorie: "zbran" },
  { nazev: "Bullet Storm",             kategorie: "zbran" },
  { nazev: "Sterilizer",               kategorie: "zbran" },
  { nazev: "Expendable Napalm",        kategorie: "zbran" },
  { nazev: "Leveller",                 kategorie: "zbran" },
  { nazev: "De-Escalator",             kategorie: "zbran" },
  { nazev: "C4 Pack",                  kategorie: "zbran" },
  { nazev: "Solo Silo",                kategorie: "zbran" },
  { nazev: "Cremator",                 kategorie: "zbran" },

  // ---------- Podpůrné zbraně s batohem (8) ----------
  { nazev: "Recoilless Rifle",           kategorie: "zbran_batoh" },
  { nazev: "Autocannon",                 kategorie: "zbran_batoh" },
  { nazev: "Airburst Rocket Launcher",   kategorie: "zbran_batoh" },
  { nazev: "Spear",                      kategorie: "zbran_batoh" },
  { nazev: "W.A.S.P. Launcher",          kategorie: "zbran_batoh" },
  { nazev: "Speargun",                   kategorie: "zbran_batoh" },
  { nazev: "Belt-Fed Grenade Launcher",  kategorie: "zbran_batoh" },
  { nazev: "Maxigun",                    kategorie: "zbran_batoh" },

  // ---------- Batohy (11) ----------
  { nazev: "Supply Pack",              kategorie: "batoh" },
  { nazev: "Jump Pack",                kategorie: "batoh" },
  { nazev: "Guard Dog",                kategorie: "batoh" },
  { nazev: "Rover",                    kategorie: "batoh" },
  { nazev: "Shield Generator Pack",    kategorie: "batoh" },
  { nazev: "Hot Dog",                  kategorie: "batoh" },
  { nazev: "Portable Hellbomb",        kategorie: "batoh" },
  { nazev: "ARC-3 K-9",                kategorie: "batoh" },
  { nazev: "Hover Pack",               kategorie: "batoh" },
  { nazev: "Dog Breath",               kategorie: "batoh" },
  { nazev: "Warp Pack",                kategorie: "batoh" },

  // ---------- Vozidla a exosuity (8) ----------
  { nazev: "Supply FRV",           kategorie: "vozidlo" },
  { nazev: "Incinerator FRV",      kategorie: "vozidlo" },
  { nazev: "Emancipator Exosuit",  kategorie: "vozidlo" },
  { nazev: "Patriot Exosuit",      kategorie: "vozidlo" },
  { nazev: "Fast Recon Vehicle",   kategorie: "vozidlo" },
  { nazev: "Bastion MK XVI",       kategorie: "vozidlo" },
  { nazev: "Breakthrough Exosuit", kategorie: "vozidlo" },
  { nazev: "Lumberer Exosuit",     kategorie: "vozidlo" },

  // ---------- Strážní věže (10) ----------
  { nazev: "Machine Gun Sentry",     kategorie: "sentry" },
  { nazev: "Gatling Sentry",         kategorie: "sentry" },
  { nazev: "Autocannon Sentry",      kategorie: "sentry" },
  { nazev: "Mortar Sentry",          kategorie: "sentry" },
  { nazev: "Rocket Sentry",          kategorie: "sentry" },
  { nazev: "Tesla Tower",            kategorie: "sentry" },
  { nazev: "EMS Mortar Sentry",      kategorie: "sentry" },
  { nazev: "Laser Sentry",           kategorie: "sentry" },
  { nazev: "Flame Sentry",           kategorie: "sentry" },
  { nazev: "Gas Mortar Sentry",      kategorie: "sentry" },

  // ---------- Miny a opevnění (8) ----------
  { nazev: "Anti-Personnel Minefield", kategorie: "opevneni" },
  { nazev: "Incendiary Mines",         kategorie: "opevneni" },
  { nazev: "Anti-Tank Mines",          kategorie: "opevneni" },
  { nazev: "Shield Generator Relay",   kategorie: "opevneni" },
  { nazev: "HMG Emplacement",          kategorie: "opevneni" },
  { nazev: "Grenadier Battlement",     kategorie: "opevneni" },
  { nazev: "Gas Mines",                kategorie: "opevneni" },
  { nazev: "Anti-Tank Emplacement",    kategorie: "opevneni" },
];

// Stratagemy, které se záměrně NElosují (na žádost uživatele — nikdo je
// nechce hrát ani jako challenge). Nejsou v STRATAGEMY, jen pro přehled
// na stránce Výzvy ("Výherní seznam stratagemů").
const VYRAZENE_STRATAGEMY = [
  { nazev: "Orbital Smoke Strike",       kategorie: "orbital" },
  { nazev: "Eagle Smoke Strike",         kategorie: "eagle" },
  { nazev: "Breaching Hammer",           kategorie: "zbran" },
  { nazev: "Defoliation Tool",           kategorie: "zbran" },
  { nazev: "One True Flag",              kategorie: "zbran" },
  { nazev: "Ballistic Shield Backpack",  kategorie: "batoh" },
  { nazev: "Directional Shield",         kategorie: "batoh" },
];
