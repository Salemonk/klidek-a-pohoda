# Grafika webu Klídek a pohoda gaming

Podklad pro tvorbu nové grafiky (ComfyUI a další). Hodnoty jsou převzaté
z `css/styl.css` (sekce `:root`) a ze stávajících obrázků v `assets/`.

## Celkový dojem

Tmavý herní web v klidném tónu: tmavě modrá noc, chladná modrá a teplá
jantarová jako dva akcenty. Hravé zaoblené písmo, kulaté nebo zaoblené
ilustrace v rámečku. Maskot je lenochod se sluchátky a ovladačem, odtud
obě akcentní barvy (modrá sluchátka, oranžový kruh za ním).

## Barvy

| Role | Hex |
|---|---|
| Pozadí stránky | `#12141c` |
| Karty a panely | `#1b1f2d` |
| Světlejší panel (hover, vstupy) | `#242a3d` |
| Rámečky | `#313952` |
| Text | `#e8eaf2` |
| Vedlejší text | `#9aa3bd` |
| Akcent modrá (odkazy, tlačítka) | `#55b7e8` |
| Akcent modrá tmavší (hover) | `#3494c7` |
| Akcent jantar (připnuté, ozdoby) | `#f5a83a` |
| Tmavý text na modrém | `#0d2438` |
| Chyba | `#e57373` |
| Discord (jen jeho tlačítko) | `#5865f2` |

## Písmo a tvary

1. Nunito (400, 700, 800), nadpisy a logo v 800. Písmo je hostované
   lokálně v `assets/fonts/` (kvůli GDPR žádné Google Fonts).
2. Rohy zaoblené 6 až 24 px, štítky a odznaky úplně kulaté.
3. Hero logo a 404 mají modrou záři (`0 8px 40px`, modrá s průhledností 0,28).
4. Za hlavičkou je jemný modrý přechod shora, jinak plochá tmavá plocha.

## Styl stávajících ilustrací

1. Ploché vektorové "samolepky": silná tmavá kontura, bez jemných stínů
   a textur.
2. Jen dvě barevné rodiny na tmavém pozadí: azurová a jantarově oranžová.
   Hnědá je výjimka jen u lenochoda.
3. Motiv uprostřed v kruhu nebo štítu, hodně prázdného okraje.
4. Veselý, kulatý charakter, žádná krev ani temnota.
5. Oranž v obrázcích je sytější než jantar v UI (odhad od oka).

## Kde se obrázky zobrazují

| Použití | Velikost a tvar |
|---|---|
| Hero logo | až 300 px, zaoblený čtverec 24 px |
| Karty na úvodní stránce | 90 px, kruh |
| Přihlášení a registrace | 110 px, kruh |
| Nástěnkářka a bannery | 170 až 220 px, zaoblený čtverec 16 px, jantarový rámeček |
| Ikona u nadpisu chatu | 40 px, kruh |
| Ikona appky | 192 a 512 px, plus "maskable" varianta s okrajem |

Z toho plyne: motiv musí být vycentrovaný, čitelný i ve 40 px a kruhový
ořez nesmí uříznout důležité věci.

## Stávající soubory v `assets/`

| Soubor | Rozměr |
|---|---|
| `lenochod-web.jpg` | 520 |
| `nastenkarka-web.jpg`, `nastenkarka-blindfold-web.jpg` | 400 |
| `vypravy-web.jpg` | 500 |
| `karta-klid-web.jpg`, `karta-akce-web.jpg`, `karta-discord-web.jpg` | 300 |
| `gamepad-web.jpg` | 400 |
| `chat-web.jpg` | 300 |
| `trophy-helldivers.jpg` | 600 |
| `helldivers-orange.png` (průhledné) | 500 |
| `icon-192/512.png`, `icon-maskable-192/512.png`, `apple-touch-icon.png` | 192, 512, 180 |
| `favicon.svg` (textové logo K&P v záložce prohlížeče) | vektor |

Přípona `-web` znamená zmenšenou verzi pro web. Originály v repu nejsou,
schovávej si zdroje z ComfyUI zvlášť.

## Návrh zadání pro ComfyUI (neověřeno, zatím nezkoušeno)

```
flat vector sticker illustration, [motiv], thick dark navy outline, limited palette of cyan blue and amber orange on dark navy background #12141c, centered composition, generous empty margin, cute friendly style, no gradients, no text
```

1. Generuj čtverec, nejlépe 1024 px, zmenšuj až pro web.
2. Nápisy (jako "Výpravy" na stávající grafice) přidej až v editoru,
   modely češtinu s diakritikou obvykle kazí.
3. Pozadí drž stejné jako web (`#12141c` nebo `#1b1f2d`), ať hrany splynou.
4. Pro ikony a odznaky chtěj průhledné PNG, pro scény stačí JPG.
