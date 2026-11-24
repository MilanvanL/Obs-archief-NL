# Obs-Archief-NL

Een Obsidian-plugin die van een permalink van [archieven.nl](https://www.archieven.nl) of het [Stadsarchief Amsterdam](https://archief.amsterdam) een notitie maakt in je Obsidian vault, met de metadata als properties en de archiefstructuur als mappen.

**Maker:** Milan van Lange
**Jaar:** 2026
**Versie:** 0.2.0 (beta)

---

## Ondersteunde bronnen

| Bron | Voorbeeld van een permalink | Wat wordt vooraf ingevuld |
|---|---|---|
| archieven.nl | `https://proxy.archieven.nl/0/21FE75B0D74987C9E0538A77ABC22FE9` | titel, collectienummer, archiefnaam, archiefinstelling |
| Stadsarchief Amsterdam | `https://archief.amsterdam/inventarissen/file/4fe17d2d-5229-f412-9f5b-07dd8f3f4f9c` | archiefinstelling (Stadsarchief Amsterdam); titel en nummers voor zover de pagina of URL die bevat |

Bij Amsterdam-links van de vorm `https://archief.amsterdam/archief/<archiefnummer>/<inventarisnummer>` worden het archiefnummer en het inventarisnummer direct uit de URL gehaald. Bij links naar `/inventarissen/file/<uuid>` staan die nummers niet in de URL; de plugin zoekt ze dan op de pagina (canonieke link en paginatitel), en anders vul je ze zelf in.

Kan de pagina niet worden opgehaald (bijvoorbeeld door een botbeveiliging van de site), dan opent het controlevenster toch, met alleen wat uit de URL te halen is. Je kunt dan alle velden zelf invullen en krijgt dezelfde mappen en notitie.

## Wat doet de plugin?

Je geeft een permalink op, bijvoorbeeld `https://proxy.archieven.nl/0/21FE75B0D74987C9E0538A77ABC22FE9`. De plugin:

1. herkent de bron aan de permalink en haalt de bijbehorende pagina op;
2. leest uit de URL en de pagina de titel, het collectienummer, de archiefnaam en de archiefinstelling (en waar mogelijk het inventarisnummer);
3. toont die in een controlevenster, waarin je het inventarisnummer aanvult;
4. maakt de mappen aan die nog ontbreken;
5. maakt een notitie aan met properties en een overzicht van de gegevens.

Er worden **geen scans gedownload** en er wordt geen IIIF-manifest of viewer gebruikt. De plugin leest alleen de openbare pagina achter de permalink.

## Resultaat

### Mapstructuur

```
Archieven/                                          ← basismap (instelbaar)
  NIOD Instituut voor Oorlogs-, Holocaust- en Genocidestudies/   ← archiefinstelling
    039 Generalkommissariat für Finanz und Wirtschaft/           ← collectienummer (+ archiefnaam)
      [overkoepelend inventarisnummer]/                          ← optioneel
        2567 Register van ingekomen en uitgegane stukken, 1940-1941.md
```

- Elke map wordt afzonderlijk gecontroleerd en alleen aangemaakt als hij nog niet bestaat.
- Bestaat de notitie al, dan wordt die geopend in plaats van overschreven.
- Tekens die niet in bestands- of mapnamen mogen (`/ \ : * ? " < > | # ^ [ ]`) worden vervangen door een streepje. Een punt of spatie aan het einde van een naam valt weg.
- Mapnamen zijn maximaal 100 tekens, bestandsnamen maximaal 150.

### Notitie

Bestandsnaam: `<inventarisnummer> <naam>.md`

Properties:

| Property | Inhoud |
|---|---|
| `aangemaakt` | datum van aanmaken (`JJJJ-MM-DD`) |
| `permalink` | de permalink waarmee de notitie is gemaakt |
| `digitaal_beschikbaar` | `ja` of `nee` |
| `archiefinstelling` | bijv. NIOD Instituut voor Oorlogs-, Holocaust- en Genocidestudies |
| `collectienummer` | bijv. `"039"` (tussen aanhalingstekens, zodat de voorloopnul blijft) |
| `archief` | archiefnaam, indien aanwezig |
| `overkoepelend_inventarisnummer` | indien ingevuld |
| `inventarisnummer` | bijv. `"2567"` |
| `aliases` | het inventarisnummer, zodat `[[2567]]` de notitie vindt |
| `titel` | de naam van het stuk |

De notitie bevat daarnaast een leesbaar overzicht van deze gegevens, een link naar de bron en een lege sectie **Aantekeningen**.

## Gebruik

1. Druk op `Ctrl/Cmd + P` en kies **Notitie maken van archieven.nl-permalink**, of klik op het archief-icoon in de linkerbalk.
2. Plak de permalink (archieven.nl of archief.amsterdam) en bevestig met Enter.
3. Controleer het venster **Controleer de gegevens**:
   - **Inventarisnummer** – vul dit in als het niet al is ingevuld. Je kunt ook de hele regel van archieven.nl plakken (bijv. `2567 Register van ingekomen en uitgegane stukken, 1940-1941.`). Nummer en naam worden dan automatisch gesplitst.
   - **Naam** – vooraf ingevuld met de titel van archieven.nl.
   - **Overkoepelend inventarisnummer** – optioneel; maakt een extra submap.
   - **Archiefinstelling**, **Collectienummer**, **Archiefnaam** – vooraf ingevuld; pas aan waar nodig.
   - **Digitaal beschikbaar** – `ja` of `nee`.
4. Klik op **Notitie maken**. De notitie wordt aangemaakt en geopend.

## Instellingen

| Instelling | Standaard | Uitleg |
|---|---|---|
| Basismap | `Archieven` | Map waarin de structuur wordt aangemaakt. Leeg = hoofdmap van de vault. |
| Archiefnaam in collectiemap | aan | Aan: `039 Generalkommissariat für Finanz und Wirtschaft`. Uit: alleen `039`. |

## Installeren

### Vereisten

- Obsidian 1.5.0 of nieuwer
- [Node.js](https://nodejs.org) (LTS) om de plugin te bouwen

### Bouwen

Plaats de projectbestanden in:

```
<jouw vault>/.obsidian/plugins/obs-archief-nl/
```

Bestanden: `main.ts`, `manifest.json`, `package.json`, `tsconfig.json`, `esbuild.config.mjs`.

Open een terminal in die map en voer uit:

```
npm install
npm run build
```

Dit maakt `main.js`. Tijdens het ontwikkelen herbouwt `npm run dev` bij elke wijziging.

### Inschakelen

1. Herlaad Obsidian (`Ctrl/Cmd + R`).
2. Ga naar **Instellingen → Community plugins**, zet **Beperkte modus** uit en klik op het ververs-icoon.
3. Schakel **Obs-Archief-NL** in.

Voor gebruik zijn alleen `main.js` en `manifest.json` nodig. `.obsidian` is een verborgen map; zet in je bestandsbeheer verborgen items aan.

## Beperkingen

- **Inventarisnummer en hiërarchie (archieven.nl):** archieven.nl laadt het inventarisnummer en de boom met bovenliggende niveaus met JavaScript. Ze staan niet in de HTML achter de permalink en worden daarom niet automatisch uitgelezen. Het inventarisnummer en eventueel het overkoepelende nummer vul je zelf in.
- **Stadsarchief Amsterdam:** de site `archief.amsterdam` is bij het ontwikkelen niet getest tegen echte pagina's (de site blokkeerde mijn testverzoek). De herkenning van nummers en titel is daarom voorzichtig opgezet en kan per pagina verschillen. Controleer altijd het controlevenster.
- **Digitaal beschikbaar:** dit kan niet uit de HTML worden afgeleid en kies je zelf.
- **Paginatitel:** de plugin leest de instelling en archiefnaam uit een titel van de vorm `Archieven.nl - <code> <naam> (<instelling>)`. Wijkt die bij een andere archiefdienst af, pas dan de velden in het controlevenster aan.
- **Internet:** een verbinding is nodig om de pagina op te halen.

## Problemen oplossen

| Probleem | Oplossing |
|---|---|
| Plugin staat niet in de lijst | Controleer dat `main.js` en `manifest.json` direct in `.obsidian/plugins/obs-archief-nl/` staan en dat de mapnaam gelijk is aan het `id` in `manifest.json`. |
| `npm run build` geeft fouten over `src/...` | Verwijder een overgebleven map `src` uit het voorbeeldsjabloon en zet in `tsconfig.json` `"include": ["main.ts"]`. |
| `node` wordt niet herkend | Installeer Node.js (LTS), sluit de terminal en open een nieuwe. |
| Plugin kan niet worden ingeschakeld | Open de ontwikkelaarsconsole (`Ctrl+Shift+I`) en kijk naar de rode foutmelding. |
| "Onbekende permalink" | Ondersteund zijn `https://proxy.archieven.nl/0/<32 tekens>` en links op `https://archief.amsterdam/inventarissen/…` of `…/archief/…`. |
| "Pagina niet op te halen" of een statusmelding | De site weigert het verzoek. Vul de gegevens zelf in het controlevenster in. |

## Afspraken over gebruik

Deze plugin is niet gelieerd aan archieven.nl of een archiefinstelling. Houd je aan de [voorwaarden van archieven.nl](https://www.archieven.nl/nl/algemene-voorwaarden) en de bepalingen van de betrokken archiefinstelling bij het hergebruik van de gegevens.

## Licentie

© 2026 Milan van Lange

