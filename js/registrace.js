// ============================================================
// Registrace nového člena pomocí jednorázového pozvánkového kódu
// ============================================================

const klient = inicializujSupabase();

if (klient) {
  // Přihlášeného pošleme rovnou do členské sekce
  klient.auth.getSession().then(({ data: { session } }) => {
    if (session) window.location.href = "clenska-sekce.html";
  });

  // Předvyplnění kódu z pozvánkového odkazu (registrace.html?kod=...)
  const parametry = new URLSearchParams(window.location.search);
  if (parametry.get("kod")) {
    document.getElementById("kod").value = parametry.get("kod").trim();
  }

  const formular = document.getElementById("registracni-formular");
  const chyba = document.getElementById("chyba");
  const tlacitko = document.getElementById("tlacitko-registrovat");

  formular.addEventListener("submit", async (udalost) => {
    udalost.preventDefault();
    skryjHlasku(chyba);

    const kod = document.getElementById("kod").value.trim().toUpperCase();
    const prezdivka = document.getElementById("prezdivka").value.trim();
    const email = document.getElementById("email").value.trim();
    const heslo = document.getElementById("heslo").value;
    const hesloZnovu = document.getElementById("heslo-znovu").value;

    if (heslo !== hesloZnovu) {
      zobrazHlasku(chyba, "Hesla se neshodují, zkontrolujte je a zkuste to znovu.");
      return;
    }

    tlacitko.disabled = true;
    tlacitko.textContent = "Registruji…";
    const konec = () => {
      tlacitko.disabled = false;
      tlacitko.textContent = "Zaregistrovat se";
    };

    // Nejdřív kód ověříme, ať má zájemce srozumitelnou hlášku
    const { data: platna, error: chybaOvereni } = await klient
      .rpc("over_pozvanku", { kod_pozvanky: kod });

    if (chybaOvereni || !platna) {
      konec();
      zobrazHlasku(chyba, "Pozvánkový kód není platný. Zkontrolujte překlepy, "
        + "nebo požádejte správce guildy o nový (kód platí 7 dní).");
      return;
    }

    // Samotná registrace; pozvánku znovu ověří a spotřebuje databáze
    const { data, error } = await klient.auth.signUp({
      email: email,
      password: heslo,
      options: { data: { prezdivka: prezdivka, pozvanka: kod } },
    });

    konec();

    if (error) {
      if (error.message.includes("already registered")) {
        zobrazHlasku(chyba, "Tento e-mail už účet má. Zkuste se přihlásit.");
      } else if (error.message.includes("at least 6")) {
        zobrazHlasku(chyba, "Heslo je moc krátké, musí mít aspoň 6 znaků.");
      } else if (error.message.includes("Database error")) {
        zobrazHlasku(chyba, "Pozvánku se nepodařilo použít. Zkuste to znovu, "
          + "případně požádejte správce o nový kód.");
      } else {
        zobrazHlasku(chyba, "Registrace se nepodařila: " + error.message);
      }
      return;
    }

    if (!data.session) {
      // Pojistka pro případ, že je v Supabase zapnuté potvrzování e-mailem
      zobrazHlasku(chyba, "Registrace proběhla, ale je potřeba potvrdit e-mail. "
        + "Podívejte se do schránky a pak se přihlaste.");
      return;
    }

    window.location.href = "clenska-sekce.html";
  });
}
