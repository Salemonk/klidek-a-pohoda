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
prihlaseni.html       přihlašovací formulář
registrace.html       registrace nového člena (jen s pozvánkovým kódem)
clenska-sekce.html    přehled: stav guildy, nejbližší akce, profil, změna hesla
akce.html             plánování akcí a hlasování o účasti
chat.html             společný chat (realtime)
prispevky.html        nástěnka: příspěvky s obrázky a reakcemi
css/styl.css          jediný stylový soubor, barvy přes CSS proměnné v :root
js/config.js          KONFIG: Supabase URL, veřejný klíč, Discord pozvánka
js/klient.js          sdílený kód (viz níže)
js/verejna.js         logika veřejných stránek
js/<stranka>.js       logika jednotlivých členských stránek
assets/               favicon.svg + obrázky webu (přípona -web = zmenšené JPG)
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
  řádek začínající `- ` tvoří odrážku. Nejdřív escapuje, pak formátuje.
- `formatujDatum`, `formatujCasChatu` české formátování dat.
- `pripravEmojiVyber(tlacitkoId, panelId, poleId)` panel smajlíků,
  vkládá na pozici kurzoru. Nabídka je v konstantě `ZAKLADNI_EMOJI`.
- `nactiAdresyAvataru(profily)` a `avatarHtml(profil, adresa)` avatary
  (podepsané adresy z privátního bucketu, fallback kolečko s písmenem).
- `zmensiObrazek(soubor, max)` a `pripravAvatar(soubor, hrana)` zmenšení
  obrázků v prohlížeči přes canvas do JPG (kvalita 0.85) před nahráním.

## Datový model (Supabase / PostgreSQL)

Základ vytváří `supabase/schema.sql`, rozšíření mají vlastní skripty.

| Tabulka     | Účel | Poznámky |
|-------------|------|----------|
| `profily`   | přezdívka, `role` (`clen`/`vedeni`/`admin`), `avatar` (cesta v bucketu) | PK = `auth.users.id`; řádek vzniká triggerem `po_registraci` při registraci. Trigger (verze z `pozvanky.sql`) zároveň vyžaduje a spotřebuje platný pozvánkový kód z `raw_user_meta_data.pozvanka`, bez něj registraci odmítne (proto nefunguje ani ruční „Add user“ v administraci) |
| `guilda`    | jediný řádek (id=1) se `stav` textem | upravuje jen admin |
| `akce`      | název, popis, `datum` (timestamptz), autor | mazat smí autor nebo admin |
| `ucast`     | hlasování `jdu`/`mozna`/`nejdu` | PK (akce, člen), upsert |
| `zpravy`    | chat | realtime publikace `supabase_realtime` |
| `prispevky` | nadpis, text, `obrazek` (cesta v bucketu) | |
| `reakce`    | emoji reakce na příspěvky | PK (příspěvek, člen, emoji) |
| `webhooky`  | adresy Discord webhooků | **tajná**: RLS bez policies, čte ji jen SECURITY DEFINER funkce |
| `pozvanky`  | jednorázové registrační kódy (platnost 7 dní) | vidí/spravuje jen admin; RPC `over_pozvanku(kod)` smí volat i `anon` a vrací jen ano/ne |

Zabezpečení (RLS):

- Všechny policies jsou `to authenticated`. Role `anon` (nepřihlášený
  s veřejným klíčem) se nedostane k ničemu.
- Role a práva: `clen` (základ), `vedeni` (navíc: zakládání a úprava akcí,
  mazání cizích zpráv/příspěvků/obrázků, správa pozvánek), `admin`
  (navíc: úprava stavu guildy). SECURITY DEFINER funkce `je_admin()`
  a `je_vedeni()` (admin se počítá jako vedení) používají policies;
  na webu tomu odpovídá `jeVedeni(profil)` v klient.js.
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
  (probuzení v administraci nebo prvním pomalejším požadavkem).
- Chat načítá posledních 100 zpráv, nástěnka 50 příspěvků, bez stránkování.
- Mazání zpráv/příspěvků jiných klientů se projeví u chatu realtime,
  u nástěnky až po obnovení.
- `supabase-js` se načítá jako `@2` (poslední v2). Kdyby CDN verze něco
  rozbila, lze připnout konkrétní verzi, např. `@supabase/supabase-js@2.45.0`.
