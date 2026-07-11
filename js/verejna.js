// ============================================================
// Veřejné stránky (index, ochrana údajů)
//
// 1) Doplní odkaz na Discord z konfigurace.
// 2) Když je návštěvník přihlášený člen, promění přihlašovací
//    tlačítka na vstup do členské sekce.
//
// Knihovna Supabase se stahuje, jen když má návštěvník v prohlížeči
// uložené přihlášení. Běžný návštěvník tak nestahuje nic navíc.
// ============================================================

(async () => {
  // Odkaz na Discord (tlačítko na indexu i odkaz v zásadách)
  const discord = document.getElementById("discord-odkaz");
  if (discord && typeof KONFIG !== "undefined") {
    discord.href = KONFIG.DISCORD_POZVANKA;
  }

  // Bez vyplněné konfigurace se nic dalšího neděje, stránka funguje dál
  if (
    typeof KONFIG === "undefined" ||
    !KONFIG.SUPABASE_URL || KONFIG.SUPABASE_URL === "DOPLNTE" ||
    !KONFIG.SUPABASE_ANON_KEY || KONFIG.SUPABASE_ANON_KEY === "DOPLNTE"
  ) return;

  // Přihlašovací token ukládá Supabase do localStorage pod klíčem
  // "sb-…-auth-token". Když tam žádný není, návštěvník přihlášený
  // být nemůže a knihovnu vůbec nestahujeme.
  let maUlozenePrihlaseni = false;
  try {
    maUlozenePrihlaseni = Object.keys(localStorage)
      .some((klic) => klic.startsWith("sb-") && klic.endsWith("-auth-token"));
  } catch (e) { /* zakázané localStorage = nepřihlášený */ }
  if (!maUlozenePrihlaseni) return;

  // Teprve teď stáhneme knihovnu Supabase
  try {
    await new Promise((hotovo, selhani) => {
      const skript = document.createElement("script");
      skript.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
      skript.onload = hotovo;
      skript.onerror = selhani;
      document.head.appendChild(skript);
    });
  } catch (e) {
    return; // knihovna se nestáhla, tlačítka zůstanou v původní podobě
  }

  const klient = window.supabase.createClient(KONFIG.SUPABASE_URL, KONFIG.SUPABASE_ANON_KEY);

  const { data: { session } } = await klient.auth.getSession();
  if (!session) return; // token už neplatí, tlačítka zůstávají

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
