// ============================================================
// Přihlašovací stránka
// ============================================================

const klient = inicializujSupabase();

if (klient) {
  // Když už je člen přihlášený, pošleme ho rovnou do členské sekce
  klient.auth.getSession().then(({ data: { session } }) => {
    if (session) window.location.href = "clenska-sekce.html";
  });

  const formular = document.getElementById("prihlasovaci-formular");
  const chyba = document.getElementById("chyba");
  const tlacitko = document.getElementById("tlacitko-prihlasit");

  formular.addEventListener("submit", async (udalost) => {
    udalost.preventDefault();
    skryjHlasku(chyba);
    tlacitko.disabled = true;
    tlacitko.textContent = "Přihlašuji…";

    const { error } = await klient.auth.signInWithPassword({
      email: document.getElementById("email").value.trim(),
      password: document.getElementById("heslo").value,
    });

    if (error) {
      tlacitko.disabled = false;
      tlacitko.textContent = "Přihlásit se";
      if (error.message.includes("Invalid login credentials")) {
        zobrazHlasku(chyba, "Nesprávný e-mail nebo heslo.");
      } else if (error.message.includes("Email not confirmed")) {
        zobrazHlasku(chyba, "Účet ještě není potvrzený — ozvi se správci guildy.");
      } else {
        zobrazHlasku(chyba, "Přihlášení se nepodařilo: " + error.message);
      }
      return;
    }

    window.location.href = "clenska-sekce.html";
  });
}
