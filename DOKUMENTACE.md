# Technická dokumentace pro vývojáře

Tento dokument popisuje, jak je web guildy Klídek a pohoda gaming postavený.
Je určený každému, kdo by měl web upravovat nebo převzít. Návod na prvotní
zprovoznění (založení Supabase, účty členů) je v souboru `NAVOD.md`.

## Přehled architektury

Web je **statický** (čisté HTML, CSS a JavaScript, žádný build, žádné npm
závislosti). Veškerou serverovou logiku obstarává služba **Supabase**
(PostgreSQL databáze, přihlašování, realtime kanály, úložiště souborů).
Frontend s ní komunikuje knihovnou `supabase-js` v2 načítanou z CDN jsdelivr.

- Hosting: **GitHub Pages** (repozitář `Salemonk/klidek-a-pohoda`, větev
  `main`, kořen). Funguje ale kdekoli, kde lze servírovat statické soubory.
- Nasazení: skript `nahrat-na-github.bat` (commit + pull + push, Pages se
  obnoví do 2 minut).
- Lokální vývoj: libovolný statický server, např.
  `python -m http.server 3999`. Otevření přes `file://` většinou funguje také.
- Konvence: **kód i identifikátory jsou česky** (funkce `nactiPrispevky`,
  tabulka `zpravy` apod.). V textech pro uživatele se **nepoužívá pomlčka**
  (přání majitele), nahrazuje se čárkou, dvojtečkou nebo tečkou.

## Struktura souborů

```
index.html            veřejná stránka (jediná pro nepřihlášené + ochrana-udaju)
ochrana-udaju.html    zásady ochrany osobních údajů (GDPR), veřejná
404.html              chybová stránka (GitHub Pages ji servíruje automaticky)
manifest.json          PWA manifest (ikona na ploše mobilu, název, barvy)
sw.js                  service worker (cache statických souborů, offline)
js/pwa.js              registrace service workeru (načteno na všech stránkách)
prihlaseni.html       přihlašovací formulář
registrace.html       registrace nového člena (jen s pozvánkovým kódem)
clenska-sekce.html    přehled: stav guildy, nejbližší akce, profil, změna hesla
akce.html             plánování akcí a hlasování o účasti
ankety.html           ankety „co budeme hrát“ s hlasováním
chat.html             společný chat (realtime)
prispevky.html        nástěnka: příspěvky s obrázky a reakcemi
css/styl.css          jediný stylový soubor, barvy přes CSS proměnné v :root
js/config.js          KONFIG: Supabase URL, veřejný klíč, Discord pozvánka
js/klient.js          sdílený kód (viz níže)
js/verejna.js         logika veřejných stránek
js/<stranka>.js       logika jednotlivých členských stránek
assets/               favicon.svg + obrázky webu (přípona -web = zmenšené JPG)
assets/fonts/         Nunito (woff2, hostováno lokálně kvůli GDPR, ne Google Fonts)
supabase/*.sql        skripty pro založení databáze (spouští se ručně, jednou)
NAVOD.md              provozní návod pro správce (ne-programátora)
nahrat-na-github.bat  nasazení jedním poklepáním
```

Každá stránka načítá skripty v pořadí: `config.js` → CDN `supabase-js` →
`klient.js` → skript stránky. Výjimka: veřejné stránky načítají jen
`config.js` + `verejna.js` a knihovnu Supabase si stáhnou dynamicky, jen
pokud má návštěvník v localStorage uložený přihlašovací token
(klíč `sb-…-auth-token`). Běžný návštěvník tak CDN vůbec nekontaktuje.

## Sdílený kód (js/klient.js)

- `inicializujSupabase()` vytvoří klienta `sb` (globální proměnná).
  Při nevyplněném `KONFIG` nahradí obsah stránky upozorněním.
- `vyzadujPrihlaseni()` volá každá členská stránka jako první.
  Nepřihlášeného přesměruje na `prihlaseni.html`.
- `nactiMujProfil(id)`, `nactiVsechnyProfily()` čtou tabulku `profily`
  (guilda má max. desítky členů, načítá se vždy vše).
- `esc(text)` escapuje HTML. **Každý uživatelský obsah vkládaný do
  `innerHTML` musí projít přes `esc()` nebo `formatujText()`**, to je jediná
  ochrana proti XSS.
- `formatujText(text)` bezpečný mini-markdown: `**tučně**`, `*kurzíva*`,
  řádek začínající `- ` tvoří odrážku, http(s) odkazy → klikací. Nejdřív
  escapuje, pak formátuje a linkuje.
- `linkujOdkazy(escapovanyText)` z http(s) URL v už escapovaném textu udělá
  `<a target=_blank rel=noopener>`. Pracuje VÝHRADNĚ na výstupu z esc()
  (bezpečné proti XSS), povoluje jen http/https (ne javascript:). Používá
  ho formatujText (příspěvky) i chat.js (zprávy).
- `formatujDatum`, `formatujCasChatu` české formátování dat.
- `pripravEmojiVyber(tlacitkoId, panelId, poleId)` panel smajlíků,
  vkládá na pozici kurzoru. Nabídka je v konstantě `ZAKLADNI_EMOJI`.
- `ziskejPodepsaneAdresy(bucket, cesty)` vrátí `{cesta: adresa}` pro soubory
  v privátním bucketu. **Úspora přenosu:** podepsané adresy (platné 1 h)
  se ukládají do localStorage (`kap-pamet-adres`, prefix kvůli sdílenému
  původu na github.io) a dokud platí, reusují se stejné adresy → prohlížeč
  servíruje obrázek z vlastní cache místo stažení ze Supabase. Prošlé
  záznamy se čistí při každém čtení. `zapomenAdresu(bucket, cesta)` invaliduje
  jeden záznam (volá se po přepsání souboru na stejné cestě, tj. výměně avatara).
- `nactiAdresyAvataru(profily)` a `avatarHtml(profil, adresa)` avatary
  (staví na `ziskejPodepsaneAdresy`, fallback kolečko s písmenem).
- `zmensiObrazek(soubor, max)` a `pripravAvatar(soubor, hrana)` zmenšení
  obrázků v prohlížeči přes canvas do JPG (kvalita 0.85) před nahráním.
- `pridejDoKalendare(nazev, popis, datumIso, delkaHodin=2)` vygeneruje
  a stáhne `.ics` soubor (formát iCalendar), čistě klientsky, žádný server.
  Použito na akce.html (tlačítko „📅 do kalendáře“ u každé akce). Délka akce
  na webu se nikde nezadává, odhaduje se 2 h; člen si ji v kalendáři upraví.

## Datový model (Supabase / PostgreSQL)

Základ vytváří `supabase/schema.sql`, rozšíření mají vlastní skripty.

| Tabulka     | Účel | Poznámky |
|-------------|------|----------|
| `profily`   | přezdívka, `role` (`clen`/`vedeni`/`admin`), `avatar` (cesta v bucketu) | PK = `auth.users.id`; řádek vzniká triggerem `po_registraci` při registraci. Trigger (verze z `pozvanky.sql`) zároveň vyžaduje a spotřebuje platný pozvánkový kód z `raw_user_meta_data.pozvanka`, bez něj registraci odmítne (proto nefunguje ani ruční „Add user“ v administraci) |
| `guilda`    | jediný řádek (id=1) se `stav` textem | upravuje jen admin |
| `akce`      | název, popis, `datum` (timestamptz), autor | mazat smí autor nebo admin |
| `ucast`     | hlasování `jdu`/`mozna`/`nejdu` | PK (akce, člen), upsert |
| `zpravy`    | chat | realtime publikace `supabase_realtime`; kanál „chat“ v chat.js kombinuje postgres_changes (nové/smazané zprávy) a Presence (online členové: klíč = id člena, `track()` po připojení, event `sync` překresluje řádek nad chatem; bez tabulky a SQL) |
| `prispevky` | nadpis, text, `obrazek` (cesta v bucketu) | |
| `reakce`    | emoji reakce na příspěvky | PK (příspěvek, člen, emoji) |
| `ankety` + `ankety_moznosti` + `ankety_hlasy` | ankety s hlasováním | zakládá každý člen, hlasují všichni (1 hlas/anketa, PK anketa+člen), maže/uzavírá autor nebo vedení; skript `ankety.sql` |
| `webhooky`  | adresy Discord webhooků | **tajná**: RLS bez policies, čte ji jen SECURITY DEFINER funkce |
| `pozvanky`  | jednorázové registrační kódy (platnost 7 dní) | vidí/spravuje jen admin; RPC `over_pozvanku(kod)` smí volat i `anon` a vrací jen ano/ne |

Zabezpečení (RLS):

- Všechny policies jsou `to authenticated`. Role `anon` (nepřihlášený
  s veřejným klíčem) se nedostane k ničemu.
- Role a práva: `clen` (základ), `vedeni` (navíc: zakládání a úprava akcí,
  mazání cizích zpráv/příspěvků/obrázků, správa pozvánek), `admin`
  (navíc: úprava stavu guildy, panel Členové guildy). SECURITY DEFINER
  funkce `je_admin()` a `je_vedeni()` (admin se počítá jako vedení)
  používají policies; na webu tomu odpovídá `jeVedeni(profil)` v klient.js.
- Správa členů (skript `prehled-clenu.sql`): RPC `seznam_clenu()` vrací
  adminovi členy včetně e-mailu a posledního přihlášení (čte auth.users
  přes SECURITY DEFINER, neadminovi vrací prázdno), RPC
  `nastav_roli(clen_id, nova_role)` mění roli (jen admin, ne sám sobě).
  Roli NELZE měnit přímým UPDATE z webu (column grant kryje jen
  prezdivka + avatar), právě proto existuje funkce.
- Autor může upravovat vlastní příspěvek; akce upravuje jen vedení.
  Sloupec `upraveno` (timestamptz) u `prispevky` a `akce` nastavuje
  klient při každé úpravě, v UI se zobrazuje jako „upraveno“.
- Člen smí v `profily` měnit jen sloupce `prezdivka` a `avatar`
  (column-level GRANT, roli si zvýšit nemůže).
- Admin se povyšuje ručně SQL příkazem (NAVOD.md, krok 5).

Úložiště (Storage): privátní buckety `prispevky-obrazky` a `avatary`.
Nahrávat lze jen do vlastní složky `{uid}/…`, číst smí každý přihlášený,
frontend zobrazuje soubory přes `createSignedUrls` (platnost 1 hodina).
Avatar se přepisuje na pevné cestě `{uid}/avatar.jpg` (upsert).

Discord upozornění: DB triggery (`ohlas_novou_akci`, `ohlas_novy_prispevek`)
posílají přes rozšíření `pg_net` zprávu na webhook při INSERTu. Adresy
webhooků jsou jen v tabulce `webhooky`; v repozitáři je vzor s `DOPLNTE`.
**Skutečné adresy webhooků nikdy nepatří do repozitáře.**

Připomínky akcí (`pripominky-akci.sql`): `pg_cron` job „pripominky-akci-kap“
běží každých 15 min a volá `posli_pripominky_akci()`, která rozešle na
webhook „akce“ připomínku den (3–24 h) a hodinu (do 60 min) před akcí.
Sloupce `akce.pripomenuto_den` a `akce.pripomenuto_hodina` brání dvojímu
odeslání; editace akce s novým datem je v akce.js vynuluje (re-remind).
Časy v Discordu jsou `<t:epoch:R/F>` (relativní/plný, lokalizované u každého).

## Animace a skeleton loadery

Jemné hover efekty (transition 0.15–0.2s): karty na indexu se zvednou
(`translateY`) a zesvětlí rámeček, tlačítka se lehce nadzvednou se stínem,
karty akcí/příspěvků zvýrazní rámeček. Vše respektuje
`prefers-reduced-motion` (animace se vypnou pro uživatele, kteří si to
nastavili v systému) — pravidlo je globální v `styl.css`.

Skeleton loadery (`.skeleton-radek`, `.skeleton-kruh`, `.skeleton-karta`,
`.skeleton-radek-obal`) nahradily text „Načítám…“ na všech 9 místech webu,
kde se čeká na data ze Supabase (akce, ankety, chat, příspěvky, přehled).
Je to čistě HTML/CSS — každá `render*()` funkce v JS už předtím dělala
`prvek.innerHTML = …`, takže skeleton stačilo vložit do počátečního HTML
a JS ho samo přepíše, jakmile data dorazí. Jemná pulzující animace
(`skeleton-tep`), respektuje `prefers-reduced-motion`.

## PWA (instalace na plochu mobilu)

`manifest.json` + `sw.js` + `js/pwa.js`. Ikony v `assets/icon-*.png`
(192/512, „any" i „maskable" — maskable má lenochoda zmenšeného na 72 %
uprostřed tmavého pozadí, ať přežije oříznutí do kruhu na Androidu) a
`assets/apple-touch-icon.png` (180×180, pro iOS).

Service worker (`sw.js`) cachuje jen **stejnou doménu** (CSS, JS, obrázky).
Cizí domény (Supabase, jsdelivr CDN) necachuje vůbec — `fetch` handler je
při jiném originu ihned opouští (`return` bez `respondWith`), takže chat,
akce a příspěvky jsou vždy čerstvé, nikdy ne z cache. Stránky (HTML) jedou
network-first (offline fallback z cache), statické soubory cache-first.
Cache se jmenuje `kap-cache-v1` — při větší změně logiky SW zvyšte číslo,
staré cache se smažou samy v `activate`.

**POZOR:** Service worker funguje jen na **HTTPS** (nebo `localhost`).
Na `file://` nebo prostém HTTP se registrace tiše nezdaří (pwa.js to
odchytává), web ale funguje normálně dál, jen bez PWA vychytávek.
GitHub Pages běží na HTTPS, takže tam funguje bez problémů.

## Klíče a tajemství

- `js/config.js` obsahuje **veřejný** (publishable) klíč Supabase. Smí být
  v repozitáři, data chrání RLS. Klíč `service_role` (Secret) nikdy
  nikam nedávejte.
- Repozitář je veřejný (GitHub Pages zdarma). Nic tajného v něm být nesmí.

## Cache a verzování

Odkazy na CSS/JS nesou parametr verze (`styl.css?v=8`, `klient.js?v=7`).
**Při každé změně souboru zvedněte číslo ve všech HTML** (hromadně např.
nahrazením řetězce), jinak prohlížeče členů podrží starou verzi a stránky
se mohou rozbít nekompatibilitou skriptů. HTML samotné se neverzuje.

## Jak přidat novou funkci (checklist)

1. Tabulka/bucket + RLS policies do nového souboru v `supabase/`
   (spustit ručně v SQL Editoru, zapsat do NAVOD.md do seznamu skriptů).
2. UI do příslušného HTML, logika do `js/<stranka>.js`, sdílené věci
   do `klient.js`.
3. Uživatelský obsah vždy přes `esc()`. Texty česky, bez pomlček.
4. Zvednout `?v=` verze, otestovat lokálně, nasadit batem.

## Známé vlastnosti a omezení

- Bezplatný tarif Supabase: projekt se po 7 dnech bez požadavku uspí
  (probuzení v administraci nebo prvním pomalejším požadavkem). Reálné
  úzké hrdlo pro guildu není úložiště (1 GB), ale měsíční přenos (5 GB) —
  proto paměť adres obrázků a stránkování nástěnky výše. Odhad: malá
  guilda (desítky členů, stovky obrázků) se k limitu nepřiblíží.
- Chat načítá posledních 100 zpráv. Nástěnka načítá po dávkách
  `DAVKA_PRISPEVKU` (15) s tlačítkem „Načíst starší příspěvky“ — staré
  příspěvky ani jejich obrázky se nestahují, dokud si o ně člen neřekne
  (úspora přenosu). `nactiPrispevky()` vždy vykresluje `zobrazenoPrispevku`
  posledních příspěvků; edit/reakce zachovají aktuální počet.
- Mazání zpráv/příspěvků jiných klientů se projeví u chatu realtime,
  u nástěnky až po obnovení.
- `supabase-js` se načítá jako `@2` (poslední v2). Kdyby CDN verze něco
  rozbila, lze připnout konkrétní verzi, např. `@supabase/supabase-js@2.45.0`.
