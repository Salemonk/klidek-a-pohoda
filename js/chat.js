// ============================================================
// Společný chat členů: zprávy v reálném čase (Supabase Realtime)
// ============================================================

let mujProfil = null;
let mojeId = null;
let profily = {};
let avatary = {}; // id člena → adresa avataru
let zpravyMapa = {}; // id zprávy → zpráva (pro zobrazení citace u odpovědi)
let odpovidamNa = null; // id zprávy, na kterou se právě odpovídá

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
    .select("id, autor, text, vytvoreno, odpoved_na")
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
    const serazene = data.reverse();
    for (const zprava of serazene) pridejZpravuDoOkna(zprava);
    // Chat jsme právě otevřeli — poslední zprávu bereme jako přečtenou
    oznacChatPrecteny(serazene[serazene.length - 1].vytvoreno);
  }
  posunDolu();
}

// ---------- Vykreslení jedné zprávy ----------

function pridejZpravuDoOkna(zprava) {
  const okno = document.getElementById("chat-okno");
  const profil = profily[zprava.autor];
  const jeMoje = zprava.autor === mojeId;
  const smiSmazat = jeMoje || jeVedeni(mujProfil);

  zpravyMapa[zprava.id] = zprava;

  const prvek = document.createElement("div");
  prvek.className = "zprava" + (jeMoje ? " zprava-moje" : "");
  prvek.dataset.zpravaId = zprava.id;
  prvek.innerHTML = `
    <div class="zprava-hlavicka">
      ${avatarHtml(profil, avatary[zprava.autor])}
      <span class="zprava-autor">${profil ? esc(profil.prezdivka) : "?"}</span>
      <span class="zprava-cas">${formatujCasChatu(zprava.vytvoreno)}</span>
      <button class="zprava-odpovedet" onclick="pripravOdpoved(${zprava.id})" title="Odpovědět">↩</button>
      ${smiSmazat ? `<button class="zprava-smazat" onclick="smazZpravu(${zprava.id})" title="Smazat zprávu">✖</button>` : ""}
    </div>
    ${citaceHtml(zprava.odpoved_na)}
    <div class="zprava-text">${linkujOdkazy(esc(zprava.text))}</div>`;
  okno.appendChild(prvek);
}

// Malý citovaný úryvek nad zprávou, na kterou se odpovídá
function citaceHtml(odpovedNaId) {
  if (!odpovedNaId) return "";
  const puvodni = zpravyMapa[odpovedNaId];
  if (!puvodni) return `<div class="zprava-citace zprava-citace-chybi">Odpověď na starší zprávu, která už tu není vidět</div>`;

  const autorPuvodni = profily[puvodni.autor];
  const jmeno = autorPuvodni ? esc(autorPuvodni.prezdivka) : "?";
  const uryvek = esc(puvodni.text.length > 80 ? puvodni.text.slice(0, 80) + "…" : puvodni.text);
  return `<div class="zprava-citace"><strong>${jmeno}:</strong> ${uryvek}</div>`;
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

    const odpovedId = odpovidamNa;
    pole.value = "";
    zrusOdpoved();

    const { error } = await sb.from("zpravy")
      .insert({ autor: mojeId, text: text, odpoved_na: odpovedId });
    if (error) {
      alert("Zprávu se nepodařilo odeslat: " + error.message);
      pole.value = text; // vrátíme text zpět, ať o něj člen nepřijde
    }
    pole.focus();
  });
}

// ---------- Odpověď na zprávu (citace) ----------

function pripravOdpoved(zpravaId) {
  const puvodni = zpravyMapa[zpravaId];
  if (!puvodni) return;

  odpovidamNa = zpravaId;
  const autorPuvodni = profily[puvodni.autor];
  const jmeno = autorPuvodni ? esc(autorPuvodni.prezdivka) : "?";
  const uryvek = esc(puvodni.text.length > 60 ? puvodni.text.slice(0, 60) + "…" : puvodni.text);

  const banner = document.getElementById("odpoved-banner");
  banner.innerHTML = `Odpovídáš na <strong>${jmeno}</strong>: ${uryvek}
    <button type="button" onclick="zrusOdpoved()" title="Zrušit odpověď">✖</button>`;
  banner.hidden = false;
  document.getElementById("chat-text").focus();
}

function zrusOdpoved() {
  odpovidamNa = null;
  const banner = document.getElementById("odpoved-banner");
  banner.hidden = true;
  banner.innerHTML = "";
}

// ---------- Zprávy v reálném čase + kdo je online ----------

function pripravRealtime() {
  // Jeden kanál obstará nové zprávy i přehled přítomných členů.
  // Presence: každý připojený prohlížeč se "hlásí" pod id svého člena,
  // Supabase všem rozesílá aktuální seznam přihlášených.
  const kanal = sb.channel("chat", {
    config: { presence: { key: mojeId } },
  });

  kanal
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
        // Chat je otevřený, takže i nová zpráva se rovnou počítá za přečtenou
        oznacChatPrecteny(payload.new.vytvoreno);
      })
    .on("postgres_changes",
      { event: "DELETE", schema: "public", table: "zpravy" },
      (payload) => {
        const prvek = document.querySelector(`[data-zprava-id="${payload.old.id}"]`);
        if (prvek) prvek.remove();
      })
    .on("presence", { event: "sync" }, () => {
      vykresliOnline(Object.keys(kanal.presenceState()));
    })
    .subscribe(async (stav) => {
      if (stav === "SUBSCRIBED") {
        await kanal.track({ od: new Date().toISOString() });
      }
    });
}

// ---------- Přehled členů online ----------

async function vykresliOnline(idcka) {
  const prvek = document.getElementById("online-clenove");

  // Kdyby byl online někdo, koho ještě neznáme, donačteme profily
  if (idcka.some((id) => !profily[id])) {
    profily = await nactiVsechnyProfily();
    avatary = await nactiAdresyAvataru(profily);
  }

  // Seřadíme podle přezdívky, sebe dáme na začátek
  const serazena = idcka.slice().sort((a, b) => {
    if (a === mojeId) return -1;
    if (b === mojeId) return 1;
    const jmenoA = profily[a] ? profily[a].prezdivka : "?";
    const jmenoB = profily[b] ? profily[b].prezdivka : "?";
    return jmenoA.localeCompare(jmenoB, "cs");
  });

  const clenove = serazena.map((id) => {
    const profil = profily[id];
    const jmeno = profil ? esc(profil.prezdivka) : "?";
    return `<span class="online-clen">${avatarHtml(profil, avatary[id])}${jmeno}</span>`;
  }).join("");

  const popisek = idcka.length === 1
    ? "🟢 Jsi tu teď jen ty:"
    : `🟢 Online (${idcka.length}):`;

  prvek.innerHTML = `<span class="online-popisek">${popisek}</span>${clenove}`;
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
