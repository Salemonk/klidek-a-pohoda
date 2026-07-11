// ============================================================
// Veřejná stránka — když je návštěvník přihlášený člen,
// promění se přihlašovací tlačítka na vstup do členské sekce.
// Když přihlášený není (nebo chybí konfigurace), nic se nezmění.
// ============================================================

(async () => {
  // Bez vyplněné konfigurace se nic neděje — stránka funguje dál
  if (
    typeof KONFIG === "undefined" ||
    !KONFIG.SUPABASE_URL || KONFIG.SUPABASE_URL === "DOPLNTE" ||
    !KONFIG.SUPABASE_ANON_KEY || KONFIG.SUPABASE_ANON_KEY === "DOPLNTE"
  ) return;

  const klient = window.supabase.createClient(KONFIG.SUPABASE_URL, KONFIG.SUPABASE_ANON_KEY);

  const { data: { session } } = await klient.auth.getSession();
  if (!session) return; // nepřihlášený návštěvník — tlačítka zůstávají

  // Načteme přezdívku (kdyby se nepovedlo, použijeme obecné "člen")
  const { data: profil } = await klient
    .from("profily")
    .select("prezdivka")
    .eq("id", session.user.id)
    .single();
  const prezdivka = profil ? profil.prezdivka : "člen";

  // Tlačítko v hlavičce
  const vMenu = document.getElementById("menu-prihlaseni");
  if (vMenu) {
    vMenu.textContent = "👤 Přihlášen: " + prezdivka;
    vMenu.href = "clenska-sekce.html";
  }

  // Tlačítko v úvodní sekci
  const vHero = document.getElementById("hero-prihlaseni");
  if (vHero) {
    vHero.textContent = "Do členské sekce →";
    vHero.href = "clenska-sekce.html";
  }

  // Odkaz v patičce
  const vPatce = document.getElementById("paticka-prihlaseni");
  if (vPatce) {
    vPatce.textContent = "Členská sekce";
    vPatce.href = "clenska-sekce.html";
  }
})();
