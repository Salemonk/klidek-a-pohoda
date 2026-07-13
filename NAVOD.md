# Návod: zprovoznění webu Klídek a pohoda gaming

> Technické detaily pro vývojáře (architektura, datový model, konvence)
> jsou v souboru `DOKUMENTACE.md`. Tento návod je pro správce guildy.

Web má dvě části:

- **Veřejnou** (`index.html`): základní informace o guildě, vidí ji každý.
- **Členskou**: přehled, akce, chat a příspěvky. Vidí ji jen přihlášení členové.

Samotné stránky jsou obyčejné HTML/CSS/JS soubory (dají se hostovat kdekoli).
O přihlašování, databázi a chat v reálném čase se stará bezplatná služba
**Supabase**. Zprovozníte ji jednou podle tohoto návodu, pak už se o ni
nemusíte starat.

---

## Krok 1: Založení projektu na Supabase

1. Jděte na **https://supabase.com** a klikněte na **Start your project**.
2. Zaregistrujte se (nejjednodušší je přes GitHub účet, ale jde to i e-mailem).
3. Po přihlášení klikněte na **New project**:
   - **Name:** např. `klidek-a-pohoda`
   - **Database Password:** vygenerujte a **uložte si ho** (např. do správce hesel).
     Běžně ho potřebovat nebudete, ale bez něj se neobejdou budoucí zásahy do databáze.
   - **Region:** vyberte `Central EU (Frankfurt)`, je nejblíž.
4. Klikněte na **Create new project** a počkejte minutu dvě, než se projekt připraví.

> **Kolik to stojí?** Nic. Bezplatný tarif bohatě stačí pro guildu do 20 členů.
> Jediné omezení: když se na web nikdo 7 dní nepřihlásí, Supabase projekt
> „uspí“ a první další přihlášení chvíli trvá. Případně se dá projekt probudit
> jedním kliknutím v administraci.

## Krok 2: Vytvoření databáze

1. V administraci Supabase klikněte vlevo na ikonu **SQL Editor**.
2. Klikněte na **New query**.
3. Otevřete v tomto projektu soubor **`supabase/schema.sql`**, zkopírujte
   **celý jeho obsah** a vložte ho do editoru.
4. Klikněte na **Run** (nebo Ctrl+Enter).
5. Mělo by se objevit „Success. No rows returned“. Hotovo. Databáze,
   zabezpečení i chat v reálném čase jsou nastavené.

## Krok 3: Propojení webu se Supabase

1. V administraci Supabase jděte vlevo dole na **Project Settings** → **API**
   (případně **Data API**).
2. Najděte dvě hodnoty:
   - **Project URL**: adresa typu `https://xxxxxxxx.supabase.co`
   - **anon public** klíč: dlouhý řetězec začínající `eyJ…`
3. Otevřete soubor **`js/config.js`** v tomto projektu a doplňte obě hodnoty
   místo `DOPLNTE`. Doplňte také odkaz-pozvánku na váš Discord server.

> Klíč „anon public“ **smí** být ve veřejném kódu, je k tomu určený.
> Data chrání přihlášení a bezpečnostní pravidla v databázi (nastavila se
> v kroku 2). Nikdy ale nikam nedávejte klíč „service_role“!

## Krok 4: Přijímání nových členů (pozvánky)

Nové členy zvete jednorázovými pozvánkami přímo z webu, do administrace
Supabase nemusíte:

1. Přihlaste se na web a na stránce **Přehled** najděte panel
   **Pozvánky pro nové členy** (vidí ho jen admin).
2. Klikněte na **Vytvořit pozvánku** a **Zkopírovat odkaz**.
3. Odkaz pošlete zájemci (třeba na Discordu). Kód platí **7 dní**
   a jen na **jedno použití**.
4. Zájemce si na registrační stránce sám zvolí e-mail, heslo i přezdívku
   a účet je hned na světě.

V panelu vidíte přehled pozvánek: které čekají, které propadly a kdo se
přes kterou zaregistroval. Nevyužitou pozvánku můžete kdykoli zrušit.

> **Jednorázové nastavení před prvním použitím** (v administraci Supabase):
>
> 1. Spusťte skript `supabase/pozvanky.sql` v **SQL Editoru**.
> 2. V **Authentication → Sign In / Up** zkontrolujte, že je zapnuté
>    **Allow new users to sign up**, a u poskytovatele **Email** vypněte
>    **Confirm email** (registraci hlídá pozvánka, potvrzovací e-maily
>    nejsou potřeba).
>
> **POZOR:** od té chvíle už nejde založit účet ručně tlačítkem „Add user“
> v administraci (každá registrace vyžaduje platný kód). Když budete chtít
> účet založit „ručně“, prostě si vytvořte pozvánku.

## Krok 5: Nastavení rolí (admin a vedení)

Web má tři role s různými právy:

| Právo | člen | vedení | admin |
|---|---|---|---|
| chat, příspěvky, hlasování o účasti | ✔ | ✔ | ✔ |
| úprava vlastního příspěvku a profilu | ✔ | ✔ | ✔ |
| zakládání a úprava akcí | ✖ | ✔ | ✔ |
| mazání cizích zpráv a příspěvků | ✖ | ✔ | ✔ |
| pozvánky pro nové členy | ✖ | ✔ | ✔ |
| úprava „Stavu guildy“ | ✖ | ✖ | ✔ |

**Role měníte přímo na webu:** Přehled → panel **Členové guildy** (vidí ho
jen admin) → v řádku člena vyberte roli. Vlastní roli si změnit nemůžete,
aby se admin omylem nesesadil.

Jen **úplně první admin** (vy, hned po založení projektu) se nastavuje
v SQL Editoru:

```sql
update public.profily
set role = 'admin'
where id = (select id from auth.users where lower(email) = 'vas@email.cz');
```

## Krok 6: Vyzkoušení

Otevřete `index.html` v prohlížeči (stačí poklepat na soubor), klikněte na
**Přihlášení člena** a přihlaste se účtem z kroku 4. Měli byste vidět členskou
sekci. Vyzkoušejte:

- změnit si přezdívku,
- upravit stav guildy (jen admin),
- vytvořit akci a zahlasovat o účasti,
- poslat zprávu do chatu (otevřete web ve dvou prohlížečích, zpráva se
  ve druhém objeví okamžitě),
- napsat příspěvek na nástěnku.

## Krok 7: Nahrání na internet

Web jsou obyčejné soubory, funguje na jakémkoli hostingu:

- **FORPSI (FTP):** nahrajte celý obsah složky projektu (kromě složky
  `supabase`, ta na webu být nemusí) stejně jako web papírnictví.
- **GitHub Pages (zdarma):** také funguje. Pozor jen na to, že kód webu je pak
  veřejně vidět, to ničemu nevadí (členská data chrání Supabase), jen o tom vězte.

---

## Časté dotazy

**Člen si chce změnit heslo.**
Sám v členské sekci, panel **Změna hesla** na stránce Přehled.

**Člen zapomněl heslo (nemůže se přihlásit).**
V administraci Supabase: **Authentication → Users →** klikněte na uživatele
**→ Reset password / Update password** a pošlete mu nové.

**Jak člena odebrat?**
**Authentication → Users →** u uživatele zvolte **Delete user**. Smaže se mu
i profil a hlasování; jeho zprávy a příspěvky zůstanou (zobrazí se u nich „?“).

**Jak změnit texty na veřejné stránce?**
Upravte `index.html`, místa k úpravě jsou označená komentářem `<!-- UPRAVTE: … -->`.

**Co je potřeba zálohovat?**
Soubory webu máte u sebe v této složce. Databázi lze exportovat v administraci
Supabase (**Database → Backups**; na bezplatném tarifu denní záloha).

---

## Co web zatím neumí (nápady na později)

- Zatím nic, nápady jsou vítány. 🙂

## Doplňkové SQL skripty (spouští se jednorázově v SQL Editoru)

- `supabase/discord-upozorneni.sql`: upozornění na nové akce a příspěvky do
  Discordu (před spuštěním doplňte adresy webhooků).
- `supabase/obrazky-prispevku.sql`: úložiště pro obrázky u příspěvků.
- `supabase/avatary.sql`: avatary členů (nastavují si je sami v členské sekci).
- `supabase/reakce.sql`: reakce smajlíkem na příspěvky.
- `supabase/pozvanky.sql`: registrace nových členů pozvánkovými kódy
  (viz krok 4; vyžaduje i nastavení v Authentication).
- `supabase/role-vedeni-a-upravy.sql`: role „vedení“, úpravy příspěvků
  a akcí, práva podle tabulky v kroku 5.
- `supabase/prehled-clenu.sql`: panel Členové guildy pro admina
  (seznam členů a změna rolí z webu).
- `supabase/pripominky-akci.sql`: automatické připomínky akcí na Discord
  (den a hodinu předem). Vyžaduje běžící `discord-upozorneni.sql` a rozšíření
  pg_cron (pokud se nezapne samo, povolte v Database → Extensions → pg_cron).
- `supabase/ankety.sql`: ankety s hlasováním (stránka Ankety v členské sekci).
- `supabase/odpovedi-chat.sql`: odpovědi na zprávu (citace) v chatu.
