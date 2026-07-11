# Návod: zprovoznění webu Klídek a pohoda gaming

Web má dvě části:

- **Veřejnou** (`index.html`) — základní informace o guildě, vidí ji každý.
- **Členskou** — přehled, akce, chat a příspěvky. Vidí ji jen přihlášení členové.

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
   - **Region:** vyberte `Central EU (Frankfurt)` — je nejblíž.
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
5. Mělo by se objevit „Success. No rows returned“. Hotovo — databáze,
   zabezpečení i chat v reálném čase jsou nastavené.

## Krok 3: Propojení webu se Supabase

1. V administraci Supabase jděte vlevo dole na **Project Settings** → **API**
   (případně **Data API**).
2. Najděte dvě hodnoty:
   - **Project URL** — adresa typu `https://xxxxxxxx.supabase.co`
   - **anon public** klíč — dlouhý řetězec začínající `eyJ…`
3. Otevřete soubor **`js/config.js`** v tomto projektu a doplňte obě hodnoty
   místo `DOPLNTE`. Doplňte také odkaz-pozvánku na váš Discord server.

> Klíč „anon public“ **smí** být ve veřejném kódu — je k tomu určený.
> Data chrání přihlášení a bezpečnostní pravidla v databázi (nastavila se
> v kroku 2). Nikdy ale nikam nedávejte klíč „service_role“!

## Krok 4: Založení účtů členům

Registrace na webu záměrně není — účty zakládáte vy jako správce:

1. V administraci Supabase klikněte vlevo na **Authentication** → **Users**.
2. Klikněte na **Add user** → **Create new user**.
3. Vyplňte **e-mail člena** a **heslo** (vymyslete dočasné — člen si ho pak
   může sám změnit v členské sekci, panel „Změna hesla“).
4. Zaškrtněte **Auto Confirm User** (jinak by systém čekal na potvrzení e-mailem).
5. Klikněte na **Create user**.
6. Pošlete členovi (třeba na Discordu) e-mail a heslo + adresu webu.

Profil s přezdívkou se členovi vytvoří automaticky (přezdívka = část e-mailu
před zavináčem, člen si ji pak může změnit v členské sekci).

## Krok 5: Nastavení sebe jako admina

Admin může navíc: upravovat „Stav guildy“ a mazat cizí zprávy, příspěvky a akce.

1. Nejdřív si založte účet sám sobě (krok 4).
2. V **SQL Editoru** spusťte tento příkaz (doplňte svůj e-mail):

```sql
update public.profily
set role = 'admin'
where id = (select id from auth.users where email = 'vas@email.cz');
```

## Krok 6: Vyzkoušení

Otevřete `index.html` v prohlížeči (stačí poklepat na soubor), klikněte na
**Přihlášení člena** a přihlaste se účtem z kroku 4. Měli byste vidět členskou
sekci. Vyzkoušejte:

- změnit si přezdívku,
- upravit stav guildy (jen admin),
- vytvořit akci a zahlasovat o účasti,
- poslat zprávu do chatu (otevřete web ve dvou prohlížečích — zpráva se
  ve druhém objeví okamžitě),
- napsat příspěvek na nástěnku.

## Krok 7: Nahrání na internet

Web jsou obyčejné soubory — funguje na jakémkoli hostingu:

- **FORPSI (FTP):** nahrajte celý obsah složky projektu (kromě složky
  `supabase`, ta na webu být nemusí) stejně jako web papírnictví.
- **GitHub Pages (zdarma):** také funguje. Pozor jen na to, že kód webu je pak
  veřejně vidět — to ničemu nevadí (členská data chrání Supabase), jen o tom vězte.

---

## Časté dotazy

**Člen si chce změnit heslo.**
Sám v členské sekci — panel **Změna hesla** na stránce Přehled.

**Člen zapomněl heslo (nemůže se přihlásit).**
V administraci Supabase: **Authentication → Users →** klikněte na uživatele
**→ Reset password / Update password** a pošlete mu nové.

**Jak člena odebrat?**
**Authentication → Users →** u uživatele zvolte **Delete user**. Smaže se mu
i profil a hlasování; jeho zprávy a příspěvky zůstanou (zobrazí se u nich „?“).

**Jak změnit texty na veřejné stránce?**
Upravte `index.html` — místa k úpravě jsou označená komentářem `<!-- UPRAVTE: … -->`.

**Co je potřeba zálohovat?**
Soubory webu máte u sebe v této složce. Databázi lze exportovat v administraci
Supabase (**Database → Backups**; na bezplatném tarifu denní záloha).

---

## Co web zatím neumí (nápady na později)

- Upozornění na nové akce/zprávy (např. propojení s Discordem přes webhook).
- Nahrávání obrázků k příspěvkům.
- Vlastní avatary členů.
