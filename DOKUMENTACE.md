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
CNAME                  vlastní doména pro GitHub Pages (klidekpohoda.cz)
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
vyzvy.html            randomizer stratagemů Helldivers 2 (viz sekce Výzvy)
galerie.html          galerie momentek: volná síň slávy se screenshoty
css/styl.css          jediný stylový soubor, barvy přes CSS proměnné v :root
js/config.js          KONFIG: Supabase URL, veřejný klíč, Discord pozvánka
js/klient.js          sdílený kód (viz níže)
js/verejna.js         logika veřejných stránek
js/stratagemy-data.js statická data pro randomizer stratagemů (viz sekce Výzvy)
js/<stranka>.js       logika jednotlivých členských stránek
assets/               obrázky webu (přípona -web = zmenšené JPG); favicon i ikonka appky
                       jsou stejný obrázek lenochoda (icon-192.png)
assets/fonts/         Nunito (woff2, hostováno lokálně kvůli GDPR, ne Google Fonts)
supabase/*.sql        skripty pro založení databáze (spouští se ručně, jednou)
NAVOD.md              provozní návod pro správce (ne-programátora)
nahrat-na-github.bat  nasazení jedním poklepáním
zvednout-verzi.js     vývojářský skript na bump ?v= verzí (viz Cache a verzování)
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
- `formatujRadek(text)` řádkové formátování: `**tučně**`, `*kurzíva*`,
  http(s) odkazy → klikací, bez blokového obalení. Použití tam, kde nechceme
  `<p>`/`<ul>` (nadpis ankety v `anketa-otazka`).
- `formatujText(text)` bezpečný mini-markdown pro víceřádkový text: staví na
  `formatujRadek`, navíc řádek začínající `- ` tvoří odrážku a řádky obaluje
  do `<p>`. Nejdřív escapuje, pak formátuje a linkuje.
- `linkujOdkazy(escapovanyText)` z http(s) URL v už escapovaném textu udělá
  `<a target=_blank rel=noopener>`. Pracuje VÝHRADNĚ na výstupu z esc()
  (bezpečné proti XSS), povoluje jen http/https (ne javascript:). Používá
  ho formatujText (příspěvky) i chat.js (zprávy). Adresy delší než 45 znaků
  se ZOBRAZÍ zkrácené (bez protokolu, začátek + …), href zůstává celý;
  ořez hlídá nedokončené HTML entity (& je po esc() &amp;).
- `formatujDatum`, `formatujCasChatu` české formátování dat.
- Smajlíky (nabídka v konstantě `ZAKLADNI_EMOJI`):
  `pripravEmojiVyber(tlacitkoId, panelId, poleId)` pro statický panel
  u formuláře (chat, nový příspěvek); `otevriPlovouciEmojiPanel(id, kotva,
  priVyberu)` pro jeden sdílený plovoucí panel, který se přesouvá za prvek
  `kotva` a při výběru volá callback (reakce a komentáře v prispevky.js);
  `vlozEmojiDoPole(pole, emoji)` vloží smajlík na pozici kurzoru.
- `zobrazToast(text, typ)` plovoucí hláška dole uprostřed (náhrada za
  alert), typ `chyba` (výchozí) nebo `uspech`, sama zmizí po 4,5 s.
- `prepniMenu(tlacitko)` rozbalí/složí mobilní menu (tlačítko ☰ v hlavičce
  členských stránek; na desktopu je ☰ skryté přes CSS). Když je ve složeném
  menu nějaká značka nepřečteného, `nastavZnacku()` rozsvítí na ☰ oranžovou
  tečku (`.ma-neprectene`).
- CSS utilita `.jen-desktop` (styl.css): obsah se na mobilu (≤600 px) skryje.
  Používá se na delší vysvětlivky v HTML (popisky polí profilu, LFG věta,
  odkaz na akce), které by na úzké obrazovce zabíraly moc řádků. Podobně se
  na mobilu skrývá štítek kategorie ve výsledku randomizeru
  (`.vyzva-slot .stitek`), kategorii tam sděluje emoji.
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
| `prispevky` | nadpis, text, `obrazek` (cesta v bucketu), `sirka_obrazku`/`vyska_obrazku`, `pripnuto` | řazení `pripnuto desc, vytvoreno desc`; připíná/odepíná jen vedení nebo admin (`je_vedeni()`); skript `pripnute-prispevky.sql`. Rozměry (skript `rozmery-obrazku-prispevku.sql`) jdou jako `width`/`height` na `<img>`, ať prohlížeč vyhradí místo dřív, než se obrázek stáhne (proti poskočení stránky); u starších příspěvků bez rozměrů se atributy vynechají, chování beze změny |
| `reakce`    | emoji reakce na příspěvky | PK (příspěvek, člen, emoji) |
| `komentare` | komentáře k příspěvkům (text + emoji, bez obrázků) | PK (příspěvek, člen) = **jeden komentář na člena**, vynuceno databází; autor upraví/smaže svůj, vedení maže cizí; skript `komentare.sql` |
| `momentky`  | volná galerie: `obrazek` (cesta v bucketu `galerie`), nepovinný `popisek` | žádná vazba na konkrétní akci; nahraje kdokoli, maže autor nebo vedení; skript `galerie.sql` |
| `ankety` + `ankety_moznosti` + `ankety_hlasy` | ankety s hlasováním | zakládá každý člen, hlasují všichni (1 hlas/anketa, PK anketa+člen), maže/uzavírá autor nebo vedení; skript `ankety.sql`. Otázka podporuje řádkové formátování (`formatujRadek`: tučně, kurzíva, odkazy), možnosti jsou čistý text |
| `zpravy.odpoved_na` | odpověď na zprávu v chatu (citace) | FK na `zpravy.id`, `on delete set null`; skript `odpovedi-chat.sql`. Žádná nová RLS pravidla (existující pravidla platí na celý řádek) |
| `webhooky`  | adresy Discord webhooků | **tajná**: RLS bez policies, čte ji jen SECURITY DEFINER funkce |
| `pozvanky`  | jednorázové registrační kódy (platnost 7 dní) | vidí/spravuje jen admin; RPC `over_pozvanku(kod)` smí volat i `anon` a vrací jen ano/ne |
| `profily.posledni_lfg` | čas posledního použití tlačítka „Hledám hráče“ | slouží jen k 15minutovému cooldownu proti spamu; skript `hledam-hrace.sql` |
| `profily.posledni_vyzva` | čas posledního odeslání výzvy z randomizeru stratagemů | 5minutový cooldown proti spamu; skript `vyzvy-discord.sql` |

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

## Quality of life (chat a profily)

**Nepřečtený obsah (značky v menu):** `zkontrolujNeprectene(uzivatelId)`
v klient.js se volá tiše (fire-and-forget, bez čekání) z `vyzadujPrihlaseni()`
na každé členské stránce. Sledované sekce definuje `SLEDOVANE_SEKCE` (chat →
zpravy; akce → akce; příspěvky → prispevky + komentare; ankety → ankety;
galerie → momentky).
Pro každou sekci se porovná localStorage klíč `kap-posledni-precteny-<sekce>`
s počtem řádků novějších než tento čas (head-count dotaz, `.neq` vynechá
vlastní tvorbu člena) a součet se promítne jako značka (`.pocitadlo-znacka`,
strop „9+") u odkazu v menu — dynamicky přes JS, žádné úpravy HTML navigace.
Sekce s odkazem `.aktivni` (právě otevřená stránka) se přeskočí. Stránky
prispevky/ankety/akce volají `oznacSekciPrectenou("<sekce>")` při načtení;
chat dál používá wrapper `oznacChatPrecteny(casIso)` při otevření i při každé
realtime zprávě. Při úplně první návštěvě (žádný záznam v localStorage) se
historie nepočítá jako nepřečtená, jen se nastaví „teď".

**Počet nových zpráv v titulku záložky:** když je chat otevřený, ale záložka
na pozadí (`document.hidden`), realtime handler v chat.js přes
`pripoctiDoTitulku(autorId)` mění titulek na „(N) Chat | …" (vlastní zprávy
se nepočítají). Návrat na záložku (`visibilitychange`) titulek vrátí.
Čistě vizuální doplněk, značení přečteného tím není dotčené.

**Odpovědi na zprávu (citace):** sloupec `zpravy.odpoved_na` (skript
`odpovedi-chat.sql`). Tlačítko ↩ u zprávy zavolá `pripravOdpoved(id)`,
zobrazí banner „Odpovídáš na…" nad formulářem; odeslání zprávy do něj
zabalí `odpoved_na`. Vykreslení citace (`citaceHtml()` v chat.js) hledá
originál v `zpravyMapa` (mapa id→zpráva, plní se při načtení i realtime);
když originál není v posledních 100 načtených zprávách, zobrazí se
srozumitelná náhrada místo chyby.

**Načíst starší zprávy:** chat natáhne při otevření jen posledních 100
zpráv. Tlačítko „Načíst starší zprávy" (`nactiStarsiZpravy()` v chat.js)
dotáhne další dávku přes `.lt("vytvoreno", nejstarsiZprava)`, zmizí samo,
jakmile dorazí méně zpráv než celá dávka (žádná starší historie). Nové
zprávy se vkládají nahoru jako jeden `DocumentFragment`
(`vlozZpravyNaZacatek()`) — vkládání po jedné by pořadí obrátilo. Pozice
scrollu se po vložení nezmění (`scrollTop` se posune o rozdíl výšky okna
před/po), takže se čtenáři "nehne" pohled.

**Mini profil člena:** klik na libovolný avatar (chat, online seznam,
příspěvky, přehled členů) zavolá `otevriMiniProfil(clenId)` v klient.js —
modální okno s avatarem, přezdívkou, rolí a datem „členem od". Data bere
z `posledniProfilyMapa` (naplní ji `nactiVsechnyProfily()` při každém
volání, takže je vždy aktuální pro danou stránku). `avatarHtml(profil,
adresa, klikatelne=true)` má nový třetí parametr — `false` se používá jen
pro náhled vlastního avataru v editačním formuláři (klik na sebe by
nedával smysl). `nactiVsechnyProfily()` teď vybírá i sloupec `vytvoreno`.

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
**Při každé změně souboru zvedněte číslo ve všech HTML**, jinak prohlížeče
členů podrží starou verzi a stránky se mohou rozbít nekompatibilitou
skriptů. HTML samotné se neverzuje.

Na zvedání verzí slouží skript `zvednout-verzi.js` (kořen projektu):

```
node zvednout-verzi.js styl klient   # zvedne styl.css a klient.js všude
node zvednout-verzi.js --kontrola    # jen ověří konzistenci verzí
```

Názvy se zadávají bez přípony (styl, klient, chat, prispevky, ankety,
akce, vyzvy, …). Skript najde nejvyšší číslo a všude nastaví o 1 vyšší;
při překlepu vypíše známé názvy a nic nezmění. Při každém zvednutí verzí
skript navíc zvedne i název cache v `sw.js` (`kap-cache-vN`), takže si
prohlížeče členů po nasazení samy smažou starou PWA cache (activate
handler v sw.js maže cache s jiným názvem) a nehromadí v ní zastaralé
verzované soubory.

`nahrat-na-github.bat` před commitem spouští `node zvednout-verzi.js
--kontrola` a při nesouladu verzí (nebo chybějícím node) nasazení
zastaví, nic se nenahraje.

## Menu členských stránek (jedno místo)

Odkazy v menu členských stránek se negenerují v HTML, ale v klient.js:
konstanta `POLOZKY_MENU` + funkce `vykresliClenskeMenu()`, která se volá
hned při načtení klient.js a vyplní `<nav class="menu" data-clenske>`
(aktivní odkaz podle `location.pathname`). HTML stránek obsahuje jen
prázdný `<nav>` s markerem. Veřejné stránky (index, prihlaseni,
registrace, 404, ochrana-udaju) mají vlastní statická menu bez markeru
a tahle logika se jich netýká. **Nová členská stránka = přidat řádek
do POLOZKY_MENU**, žádné úpravy 7 HTML souborů.

## Rychlost načítání

Nezávislé databázové dotazy běží souběžně (`Promise.all`): profil +
seznam členů ve všech `spustStranku()`, panely Přehledu (stav guildy,
akce, avatar, pozvánky, členové) a všechny dotazy `zkontrolujNeprectene()`
(sekce i tabulky uvnitř sekce). Závislosti zůstávají sekvenční (avatary
potřebují profily, obsah potřebuje obojí).

## Jak přidat novou funkci (checklist)

1. Tabulka/bucket + RLS policies do nového souboru v `supabase/`
   (spustit ručně v SQL Editoru, zapsat do NAVOD.md do seznamu skriptů).
2. UI do příslušného HTML, logika do `js/<stranka>.js`, sdílené věci
   do `klient.js`. Nová členská stránka: řádek do `POLOZKY_MENU`
   v klient.js (menu se generuje samo).
3. Uživatelský obsah vždy přes `esc()`. Texty česky, bez pomlček.
   Ikonová tlačítka bez textu dostávají `aria-label`.
4. Zvednout `?v=` verze (`node zvednout-verzi.js <nazvy>`), otestovat
   lokálně, nasadit batem.

## Tlačítko „Hledám hráče“ (LFG)

Panel na `clenska-sekce.html` (Přehled), skript `hledam-hrace.sql`.
RPC `posli_lfg_vyzvu(co_hrajeme text default null)`: kontroluje
15minutový cooldown (`profily.posledni_lfg`), pak přes webhook `lfg`
(tabulka `webhooky`) pošle zprávu se zmínkou Discord role (role ID je
natvrdo v textu funkce, není to tajemství jako webhook URL, ale při
změně role je potřeba funkci znovu `create or replace`).

Web ukazuje **živý náhled** přesné výsledné zprávy (`#lfg-nahled`
v `clenska-sekce.js`, funkce `aktualizujNahled()`) — logika sestavení
textu (závorka s obsahem pole, jen když není prázdné) je zrcadlená
1:1 s tím, co dělá SQL funkce. Textové pole `#lfg-text` je vložené
přímo do věty šablony (`.lfg-sablona`), aby člen viděl, kam přesně
jeho text v Discord zprávě zapadne.

## Galerie momentek

Stránka `galerie.html` + `js/galerie.js`. Volná galerie (žádná vazba na
konkrétní akci ze seznamu Akcí) — obrázek + nepovinný popisek. Technicky
stejný vzor jako obrázky u příspěvků: soukromý bucket `galerie` (skript
`galerie.sql`), klientské zmenšení přes `zmensiObrazek()`, zobrazení přes
`ziskejPodepsaneAdresy()` (stejná paměť adres jako u příspěvků/avatarů).
Nahrát může kdokoli přihlášený, smazat autor nebo vedení/admin.

Zobrazení: mřížka `.galerie-mrizka` (CSS grid, `auto-fill`), stránkuje se po
20 (`DAVKA_MOMENTEK`), tlačítko „Načíst starší momentky“ zmizí, jakmile
dorazí méně položek než celá dávka — stejný vzor jako u příspěvků a teď
i u chatu.

## Připnuté příspěvky a vložení screenshotu

**Připnutí** (skript `pripnute-prispevky.sql`): sloupec `prispevky.pripnuto`,
vedení/admin ho přepínají tlačítkem „připnout“/„odepnout“
(`prepniPripnuti()`), řazení je `pripnuto desc, vytvoreno desc` — připnuté
je vždy nahoře bez ohledu na stránkování starších příspěvků. Připnutý
příspěvek má oranžový rámeček (`.prispevek.pripnuto`) a odznak „📌 připnuto“.

**Vložení screenshotu ze schránky:** `paste` posluchač na textu příspěvku
(`prispevky.js`) hledá v `clipboardData.items` obrázek; když ho najde,
sestaví z něj přes `DataTransfer` nový `FileList` a přiřadí ho do
`#obrazek-prispevku` — dál pokračuje úplně stejná cesta nahrávání jako při
ručním výběru souboru (zmenšení, upload do bucketu). Vizuální potvrzení:
text u pole obrázku (`#info-obrazku`) a `zobrazToast()`.

## Komentáře k příspěvkům

Tabulka `komentare` (skript `komentare.sql`), pravidlo **jeden komentář na
člena a příspěvek** vynucuje složený primární klíč (prispevek_id, clen_id),
web ho jen zrcadlí (formulář se nezobrazí, když už člen komentář má). Obsah
text + emoji (max 500 znaků, žádné obrázky). Podporuje stejné základní
formátování jako příspěvky (`formatujText()`: **tučně**, *kurzíva*, klikací
odkazy). Autor svůj komentář upraví (sloupec `upraveno`)
nebo smaže, vedení/admin maže i cizí (RLS s `je_vedeni()`).

V `prispevky.js` se komentáře načítají vnořeným selectem u příspěvků (jako
reakce) a vykreslují ve `komentareHtml()` pod řádkem reakcí. Smajlíky vkládá
sdílený plovoucí panel `#panel-emoji-komentar` (`otevriPanelKomentare()`,
vložení na pozici kurzoru).

## Výzvy: randomizer stratagemů (Helldivers 2)

Stránka `vyzvy.html` + `js/vyzvy.js`. Data jsou **statická** (žádná DB
tabulka): `js/stratagemy-data.js` obsahuje `KATEGORIE_STRATAGEMU` (8 kategorií
výbavy — podpůrné zbraně jsou rozdělené na `zbran` a `zbran_batoh` podle toho,
jestli zbraň zabírá slot na zádech) a `STRATAGEMY` (~83 položek, jen výbavové
stratagemy, které si hráč vybírá do loadoutu; misijní stratagemy jako Resupply
nebo Reinforce se do výbavy nevybírají, proto v datech chybí). Zdroj:
helldivers.wiki.gg, čistě Helldivers 2 (ne HD1).

Losovací logika (čistý JS bez závislostí, v `vyzvy.js`):
- **1 stratagem**: náhodný výběr z položek ve zaškrtnutých kategoriích.
- **Loadout (4 sloty)**: respektuje dvě volitelná pravidla — „aspoň jedna
  podpůrná zbraň“ (`jeZbran()`: kategorie `zbran` nebo `zbran_batoh`) a „max
  jedna věc na zádech“ (`zabiraMistoNaZadech()`: kategorie `batoh` nebo
  `zbran_batoh`, např. GR-8 Recoilless Rifle). Nesplnitelná kombinace
  kategorií/pravidel vrátí srozumitelnou chybovou hlášku místo loadoutu.
- **Reroll slotu** (↻): přelosuje jen jeden slot, bere ohled na zbylé 3 sloty
  (nezavede duplicitu, dodrží obě pravidla).

Sdílení: „Zkopírovat“ (schránka) a „Poslat výzvu do Discordu“ (RPC
`posli_vyzvu(text_vyzvy)`, skript `vyzvy-discord.sql`, stejný vzor jako LFG:
webhook `vyzvy` v tabulce `webhooky`, cooldown `profily.posledni_vyzva`).
Text sestavuje web, funkce jen ohlídá cooldown/délku a doručení.

**Aktualizace po novém Warbondu:** upravit `js/stratagemy-data.js` (přidat/
odebrat položky, novou podpůrnou zbraň zařadit do `zbran` nebo `zbran_batoh`
podle toho, jestli zabírá záda), zvednout `?v=` u tohoto souboru i u
`vyzvy.js`, nasadit batem. Žádný zásah do databáze
není potřeba.

## Provoz a údržba

**Hlídač proti uspání:** doporučeno (ne vynuceno kódem) — dva monitory
v UptimeRobot (zdarma): jeden na samotný web, druhý na
`https://[project].supabase.co/rest/v1/guilda?select=id&limit=1&apikey=[publishable klíč]`
(RLS anon roli vrátí prázdné pole `[]`, 200 OK — žádná data neuniknou,
ale požadavek se počítá jako aktivita a projekt se neuspí). Postup pro
uživatele: NAVOD.md, Krok 8.

**Automatický úklid** (`supabase/automaticky-uklid.sql`): pg_cron job
„uklid-databaze-kap" (neděle 4:00) maže jen propadlé nevyužité pozvánky
starší 30 dní. Mazání starých zpráv chatu je v souboru záměrně
zakomentované — je to citlivé rozhodnutí (ztráta obsahu členů), nemá se
dít tiše samo. Pokud se to bude v budoucnu implementovat, patří sem i UI
upozornění/nastavitelná retence, ne jen odkomentovaný řádek.

**Zálohy:** žádný automatizovaný export v kódu (šlo by o netriviální
řešení kvůli Storage souborům) — doporučený postup je ruční CSV export
z SQL Editoru (NAVOD.md, Krok 8). Necharakterizovat svévolně, jestli
bezplatný tarif Supabase nabízí stahovatelné zálohy v Database → Backups —
rozhraní Supabase se v čase mění, ověřit aktuální stav před tvrzením.

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
