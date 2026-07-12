// ============================================================
// Společný chat členů: zprávy v reálném čase (Supabase Realtime)
// ============================================================

let mujProfil = null;
let mojeId = null;
let profily = {};
let avatary = {}; // id člena → adresa avataru

async function spustStranku() {
  const session = await vyzadujPrihlaseni();
  if (!session) return;

  mojeId = session.user.id;
  mujProfil = await nactiMujProfil(mojeId);
  profily = await nactiVsechnyProfily();
  avatary = await nactiAdresyAvataru(profily);

  await nactiZpravy();
  pripravOdesilani();
  pripravRealtime();
  pripravEmojiVyber("emoji-tlacitko-chat", "emoji-panel-chat", "chat-text");
}

// ---------- Načtení historie ----------

async function nactiZpravy() {
  const okno = document.getElementById("chat-okno");

  // Posledních 100 zpráv (načteme od nejnovějších a otočíme)
  const { data, error } = await sb
    .from("zpravy")
    .select("id, autor, text, vytvoreno")
    .order("vytvoreno", { ascending: false })
    .limit(100);

  if (error) {
    okno.innerHTML = "<p>Zprávy se nepodařilo načíst.</p>";
    return;
  }

  okno.innerHTML = "";
  if (data.length === 0) {
    okno.innerHTML = `<p class="poznamka">Zatím tu nejsou žádné zprávy. Napiš první! 🙂</p>`;
  } else {
    for (const zprava of data.reverse()) pridejZpravuDoOkna(zprava);
  }
  posunDolu();
}

// ---------- Vykreslení jedné zprávy ----------

function pridejZpravuDoOkna(zprava) {
  const okno = document.getElementById("chat-okno");
  const profil = profily[zprava.autor];
  const jeMoje = zprava.autor === mojeId;
  const smiSmazat = jeMoje || jeVedeni(mujProfil);

  const prvek = document.createElement("div");
  prvek.className = "zprava" + (jeMoje ? " zprava-moje" : "");
  prvek.dataset.zpravaId = zprava.id;
  prvek.innerHTML = `
    <div class="zprava-hlavicka">
      ${avatarHtml(profil, avatary[zprava.autor])}
      <span class="zprava-autor">${profil ? esc(profil.prezdivka) : "?"}</span>
      <span class="zprava-cas">${formatujCasChatu(zprava.vytvoreno)}</span>
      ${smiSmazat ? `<button class="zprava-smazat" onclick="smazZpravu(${zprava.id})" title="Smazat zprávu">✖</button>` : ""}
    </div>
    <div class="zprava-text">${esc(zprava.text)}</div>`;
  okno.appendChild(prvek);
}

function posunDolu() {
  const okno = document.getElementById("chat-okno");
  okno.scrollTop = okno.scrollHeight;
}

// ---------- Odeslání zprávy ----------

function pripravOdesilani() {
  const formular = document.getElementById("chat-formular");
  const pole = document.getElementById("chat-text");

  formular.addEventListener("submit", async (udalost) => {
    udalost.preventDefault();
    const text = pole.value.trim();
    if (!text) return;

    pole.value = "";
    const { error } = await sb.from("zpravy").insert({ autor: mojeId, text: text });
    if (error) {
      alert("Zprávu se nepodařilo odeslat: " + error.message);
      pole.value = text; // vrátíme text zpět, ať o něj člen nepřijde
    }
    pole.focus();
  });
}

// ---------- Zprávy v reálném čase ----------

function pripravRealtime() {
  sb.channel("chat")
    .on("postgres_changes",
      { event: "INSERT", schema: "public", table: "zpravy" },
      async (payload) => {
        // Kdyby psal někdo, koho ještě neznáme (nový člen), donačteme profily
        if (!profily[payload.new.autor]) {
          profily = await nactiVsechnyProfily();
          avatary = await nactiAdresyAvataru(profily);
        }
        pridejZpravuDoOkna(payload.new);
        posunDolu();
      })
    .on("postgres_changes",
      { event: "DELETE", schema: "public", table: "zpravy" },
      (payload) => {
        const prvek = document.querySelector(`[data-zprava-id="${payload.old.id}"]`);
        if (prvek) prvek.remove();
      })
    .subscribe();
}

// ---------- Smazání zprávy ----------

async function smazZpravu(zpravaId) {
  if (!confirm("Smazat tuto zprávu?")) return;

  const { error } = await sb.from("zpravy").delete().eq("id", zpravaId);
  if (error) {
    alert("Smazání se nepodařilo: " + error.message);
    return;
  }
  // Zprávu odstraní realtime událost DELETE; pro jistotu ji odstraníme i ručně
  const prvek = document.querySelector(`[data-zprava-id="${zpravaId}"]`);
  if (prvek) prvek.remove();
}

spustStranku();
