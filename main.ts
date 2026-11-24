import {
  App,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  TextComponent,
  normalizePath,
  requestUrl,
} from "obsidian";

/* ------------------------------------------------------------------ */
/* Types & settings                                                    */
/* ------------------------------------------------------------------ */

interface ArchiefSettings {
  rootFolder: string; // basismap in de vault ("" = vault-root)
  collectieMapMetNaam: boolean; // "2193 Secretarie Gemeente Arnhem" i.p.v. alleen "2193"
}

const DEFAULT_SETTINGS: ArchiefSettings = {
  rootFolder: "Archieven",
  collectieMapMetNaam: true,
};

/** Wat uit de URL en de statische HTML van een bron te halen is. */
interface PageInfo {
  permalink: string;
  titel?: string;
  inventarisnummer?: string;
  archiefinstelling?: string;
  collectienummer?: string;
  archiefnaam?: string;
}

/** Definitieve gegevens, na controle door de gebruiker. */
interface ArchiefRecord {
  permalink: string;
  titel?: string;
  archiefinstelling: string;
  collectienummer: string;
  archiefnaam?: string;
  inventarisnummer: string;
  overkoepelend?: string;
  digitaal: boolean;
}

/* ------------------------------------------------------------------ */
/* Plugin                                                              */
/* ------------------------------------------------------------------ */

export default class ObsArchiefNL extends Plugin {
  settings: ArchiefSettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "maak-notitie-van-permalink",
      name: "Notitie maken van archieven.nl-permalink",
      callback: () => this.run(),
    });
    this.addRibbonIcon("archive", "Archief-notitie maken", () => this.run());
    this.addSettingTab(new ArchiefSettingTab(this.app, this));
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }

  /* ---------------------------- hoofdflow --------------------------- */

  async run() {
    const permalink = await askText(
      this.app,
      "Permalink (archieven.nl of archief.amsterdam)",
      "https://proxy.archieven.nl/0/…  of  https://archief.amsterdam/…"
    );
    if (!permalink) return;

    const source = detectSource(permalink);
    if (!source) {
      new Notice(
        "Onbekende permalink. Ondersteund: proxy.archieven.nl/0/… en archief.amsterdam/…"
      );
      return;
    }

    // Eerst wat uit de URL zelf te halen is; daarna aanvullen vanuit de pagina.
    let info: PageInfo = baseInfo(source, permalink);
    try {
      new Notice("Gegevens ophalen…");
      const res = await requestUrl({ url: permalink, throw: false }); // volgt redirects
      if (res.status >= 200 && res.status < 400) {
        info = mergeInfo(info, parseSource(source, res.text, permalink));
      } else {
        new Notice(`Pagina gaf status ${res.status}; vul de gegevens zelf in.`);
      }
    } catch (e) {
      console.error("[Obs-Archief-NL]", e);
      new Notice("Pagina niet op te halen; vul de gegevens zelf in.");
    }

    const rec = await askDetails(this.app, info);
    if (!rec) return;

    try {
      await this.writeNote(rec);
    } catch (e) {
      console.error("[Obs-Archief-NL]", e);
      new Notice(`Notitie maken mislukt: ${(e as Error).message}`);
    }
  }

  /* ----------------------- mappen en notitie ------------------------ */

  /** Instelling / collectie / [overkoepelend inventarisnummer] */
  folderSegments(rec: ArchiefRecord): string[] {
    const collectie =
      this.settings.collectieMapMetNaam && rec.archiefnaam
        ? `${rec.collectienummer} ${rec.archiefnaam}`
        : rec.collectienummer;

    return [this.settings.rootFolder, rec.archiefinstelling, collectie, rec.overkoepelend]
      .filter((s): s is string => !!s && s.trim() !== "")
      .map((x) => safeName(x))
      .filter((s) => s !== "");
  }

  async writeNote(rec: ArchiefRecord) {
    const folder = normalizePath(this.folderSegments(rec).join("/"));
    await this.ensureFolder(folder);

    // Bestandsnaam: "<inventarisnummer> <naam>", bijv. "2567 Register van … 1940-1941"
    const base = rec.titel ? `${rec.inventarisnummer} ${rec.titel}` : rec.inventarisnummer;
    const path = normalizePath(`${folder}/${safeName(base, 150)}.md`);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      new Notice("Notitie bestond al; wordt geopend.");
      await this.app.workspace.getLeaf(false).openFile(existing);
      return;
    }

    const file = await this.app.vault.create(path, buildNote(rec));
    await this.app.workspace.getLeaf(false).openFile(file);
  }

  /** Maakt elke ontbrekende map in het pad aan; bestaande blijven ongemoeid. */
  async ensureFolder(folderPath: string) {
    let current = "";
    for (const part of folderPath.split("/").filter(Boolean)) {
      current = current ? `${current}/${part}` : part;
      if (this.app.vault.getAbstractFileByPath(current)) continue;
      try {
        await this.app.vault.createFolder(current);
      } catch (e) {
        // race of hoofdlettergevoeligheid: bestaat de map inmiddels wel, dan prima
        if (!this.app.vault.getAbstractFileByPath(current)) throw e;
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Notitie                                                             */
/* ------------------------------------------------------------------ */

function buildNote(rec: ArchiefRecord): string {
  const q = (s: string) => JSON.stringify(s); // veilig geciteerde YAML-string (behoudt "039")

  const fm: string[] = [
    "---",
    `aangemaakt: ${today()}`,
    `permalink: ${q(rec.permalink)}`,
    `digitaal_beschikbaar: ${rec.digitaal ? "ja" : "nee"}`,
    `archiefinstelling: ${q(rec.archiefinstelling)}`,
    `collectienummer: ${q(rec.collectienummer)}`,
  ];
  if (rec.archiefnaam) fm.push(`archief: ${q(rec.archiefnaam)}`);
  if (rec.overkoepelend) fm.push(`overkoepelend_inventarisnummer: ${q(rec.overkoepelend)}`);
  fm.push(`inventarisnummer: ${q(rec.inventarisnummer)}`);
  fm.push(`aliases: [${q(rec.inventarisnummer)}]`);
  if (rec.titel) fm.push(`titel: ${q(rec.titel)}`);
  fm.push("---");

  const body: string[] = [];
  if (rec.titel) body.push(`**${rec.titel}**`, "");
  body.push(
    `- **Archiefinstelling:** ${rec.archiefinstelling}`,
    `- **Collectie:** ${rec.collectienummer}${rec.archiefnaam ? " " + rec.archiefnaam : ""}`
  );
  if (rec.overkoepelend) body.push(`- **Overkoepelend inventarisnummer:** ${rec.overkoepelend}`);
  body.push(
    `- **Inventarisnummer:** ${rec.inventarisnummer}`,
    `- **Bron:** [archieven.nl](${rec.permalink})`,
    "",
    "## Aantekeningen",
    ""
  );

  return fm.join("\n") + "\n\n" + body.join("\n") + "\n";
}

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* ------------------------------------------------------------------ */
/* HTML-parser                                                         */
/* ------------------------------------------------------------------ */

type Source = "archieven" | "amsterdam";

function detectSource(raw: string): Source | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");
  if (host === "proxy.archieven.nl" && /^\/0\/[0-9A-Fa-f]{32}\/?$/.test(u.pathname))
    return "archieven";
  if (host === "archief.amsterdam" && /^\/(inventarissen|archief)\//.test(u.pathname))
    return "amsterdam";
  return null;
}

/** Wat uit de URL alleen al te halen is (nog zonder pagina op te halen). */
function baseInfo(source: Source, url: string): PageInfo {
  return source === "amsterdam" ? parseAmsterdam("", url) : { permalink: url };
}

function parseSource(source: Source, html: string, url: string): PageInfo {
  return source === "amsterdam" ? parseAmsterdam(html, url) : parseArchievenNl(html, url);
}

/** Waarden uit `extra` winnen, tenzij ze leeg zijn. */
function mergeInfo(base: PageInfo, extra: PageInfo): PageInfo {
  const out: PageInfo = { ...base };
  for (const [k, val] of Object.entries(extra)) {
    if (val !== undefined && val !== "") (out as unknown as Record<string, unknown>)[k] = val;
  }
  return out;
}

/**
 * Stadsarchief Amsterdam. Bekende URL-vormen:
 *   /archief/<archiefnummer>/<inventarisnummer>
 *   /inventarissen/(details|scans|inventaris)/<archiefnummer>/…
 *   /inventarissen/file/<uuid>   (bestand; nummers staan dan alleen in de pagina)
 * Alles wat gevonden wordt is voorinvulling; het controlevenster blijft bewerkbaar.
 */
function parseAmsterdam(html: string, url: string): PageInfo {
  const dec = (x: string) => {
    try {
      return decodeURIComponent(x);
    } catch {
      return x;
    }
  };
  const info: PageInfo = { permalink: url, archiefinstelling: "Stadsarchief Amsterdam" };

  const fromPath = (raw: string | undefined) => {
    if (!raw) return;
    let p: string;
    try {
      p = new URL(raw, "https://archief.amsterdam").pathname;
    } catch {
      return;
    }
    const a = p.match(/^\/archief\/([^/]+)\/([^/]+)\/?$/);
    if (a) {
      info.collectienummer = dec(a[1]);
      info.inventarisnummer = dec(a[2]);
      return;
    }
    const b = p.match(/^\/inventarissen\/(?:details|scans|inventaris)\/([^/.]+)/);
    if (b && !info.collectienummer) info.collectienummer = dec(b[1]);
  };

  fromPath(url);
  if (!html) return info;

  const doc = new DOMParser().parseFromString(html, "text/html");
  const meta = (p: string) =>
    doc.querySelector(`meta[property="${p}"]`)?.getAttribute("content")?.trim() || undefined;

  fromPath(doc.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? undefined);
  fromPath(meta("og:url"));

  // Alleen echte titels: algemene sjabloonkoppen ("Website title and logo", sitenaam) negeren.
  const GENERIC =
    /^(website title and logo|stadsarchief( amsterdam)?|archief\.amsterdam|amsterdam city archives|inventarissen|home|homepage)$/i;
  const candidates = [
    meta("og:title"),
    doc.querySelector('meta[name="twitter:title"]')?.getAttribute("content")?.trim(),
    doc.querySelector("title")?.textContent?.trim(),
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const t = raw
      .replace(/\s*[|–—-]\s*(Stadsarchief Amsterdam|Amsterdam City Archives|archief\.amsterdam).*$/i, "")
      .trim();
    if (t && !GENERIC.test(t)) {
      info.titel = t;
      break;
    }
  }
  return info;
}

/**
 * De statische HTML van archieven.nl bevat: og:title (titel van het stuk), og:url (met o.a.
 * micode = collectienummer) en <title> ("Archieven.nl - 2193 Naam, 1917-1924
 * (Gelders Archief)"). Inventarisnummer staat er niet in.
 */
function parseArchievenNl(html: string, permalink: string): PageInfo {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const meta = (p: string) =>
    doc.querySelector(`meta[property="${p}"]`)?.getAttribute("content")?.trim() || undefined;

  const titel = meta("og:title");

  let micode: string | undefined;
  const ogUrl = meta("og:url");
  if (ogUrl) {
    try {
      micode = new URL(ogUrl).searchParams.get("micode") || undefined;
    } catch {
      /* negeren */
    }
  }

  const pageTitle = doc.querySelector("title")?.textContent?.trim() ?? "";
  const m = pageTitle.match(/^Archieven\.nl\s*-\s*(.+?)\s*\(([^()]+)\)\s*$/);

  let collectienummer = micode;
  let archiefnaam: string | undefined;
  const archiefinstelling = m?.[2]?.trim();

  if (m) {
    const head = m[1].trim();
    const code = micode && head.startsWith(micode) ? micode : head.split(/\s+/)[0];
    if (!collectienummer) collectienummer = code;
    archiefnaam = head.slice(code.length).trim() || undefined;
  }

  return { permalink, titel, archiefinstelling, collectienummer, archiefnaam };
}

/** Maakt een tekst geschikt als map-/bestandsnaam (Windows, macOS, Obsidian-links). */
function safeName(s: string, max = 100): string {
  return s
    .replace(/[\\/:*?"<>|#^\[\]]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "") // geen leidende/afsluitende punten of spaties
    .slice(0, max)
    .replace(/[.\s]+$/g, "") // opnieuw: afkappen kan een punt/spatie aan het eind laten staan
    .trim();
}

/* ------------------------------------------------------------------ */
/* Dialogen                                                            */
/* ------------------------------------------------------------------ */

function askText(app: App, heading: string, placeholder: string): Promise<string> {
  return new Promise((resolve) => {
    let value = "";
    let submitted = false;

    class TextModal extends Modal {
      onOpen() {
        this.contentEl.createEl("h3", { text: heading });
        new Setting(this.contentEl).addText((t) => {
          t.setPlaceholder(placeholder).onChange((v) => (value = v));
          t.inputEl.style.width = "100%";
          t.inputEl.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
              submitted = true;
              this.close();
            }
          });
          setTimeout(() => t.inputEl.focus(), 0);
        });
        new Setting(this.contentEl).addButton((b) =>
          b.setButtonText("OK").setCta().onClick(() => {
            submitted = true;
            this.close();
          })
        );
      }
      onClose() {
        this.contentEl.empty();
        resolve(submitted ? value.trim() : "");
      }
    }
    new TextModal(app).open();
  });
}

/**
 * Toont wat gevonden is (aanpasbaar) en vraagt wat de HTML niet bevat.
 * Het inventarisnummer staat niet in de statische HTML. Plak daarom gerust de
 * hele regel van archieven.nl ("2567 Register van … 1940-1941.") in het veld
 * Inventarisnummer: nummer en naam worden dan automatisch gesplitst.
 */
function askDetails(app: App, info: PageInfo): Promise<ArchiefRecord | null> {
  return new Promise((resolve) => {
    let result: ArchiefRecord | null = null;

    const v = {
      inventarisnummer: info.inventarisnummer ?? "",
      titel: info.titel ?? "",
      overkoepelend: "",
      archiefinstelling: info.archiefinstelling ?? "",
      collectienummer: info.collectienummer ?? "",
      archiefnaam: info.archiefnaam ?? "",
      digitaal: "nee",
    };
    type Key = keyof typeof v;

    class DetailsModal extends Modal {
      private inputs: Partial<Record<Key, TextComponent>> = {};

      /** "2567 Register van … 1940-1941." -> nummer + naam */
      private splitLine() {
        const m = v.inventarisnummer.trim().match(/^(\S*\d\S*)\s+(.{10,})$/);
        if (!m) return;
        v.inventarisnummer = m[1];
        v.titel = m[2].trim();
        this.inputs.inventarisnummer?.setValue(v.inventarisnummer);
        this.inputs.titel?.setValue(v.titel);
      }

      onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h3", { text: "Controleer de gegevens" });

        const field = (name: string, key: Key, desc?: string) => {
          const s = new Setting(contentEl).setName(name);
          if (desc) s.setDesc(desc);
          s.addText((t) => {
            this.inputs[key] = t;
            t.setValue(v[key]).onChange((x) => (v[key] = x));
            t.inputEl.style.width = "100%";
          });
        };

        field(
          "Inventarisnummer",
          "inventarisnummer",
          'Wordt de titel van de notitie. Plak de hele regel van archieven.nl ("2567 Register van …") om nummer en naam tegelijk in te vullen.'
        );
        const inv = this.inputs.inventarisnummer!.inputEl;
        inv.addEventListener("paste", () => setTimeout(() => this.splitLine(), 0));
        inv.addEventListener("blur", () => this.splitLine());

        field("Naam", "titel", "Voorafgaand ingevuld vanaf archieven.nl.");
        field("Overkoepelend inventarisnummer", "overkoepelend", "Optioneel; maakt een extra submap.");
        field("Archiefinstelling", "archiefinstelling");
        field("Collectienummer", "collectienummer");
        field("Archiefnaam", "archiefnaam", "Optioneel; wordt aan de collectiemap toegevoegd.");

        new Setting(contentEl).setName("Digitaal beschikbaar").addDropdown((d) =>
          d
            .addOptions({ nee: "nee", ja: "ja" })
            .setValue(v.digitaal)
            .onChange((x) => (v.digitaal = x))
        );

        new Setting(contentEl).addButton((b) =>
          b.setButtonText("Notitie maken").setCta().onClick(() => {
            this.splitLine();
            const inv = v.inventarisnummer.trim();
            const inst = v.archiefinstelling.trim();
            const col = v.collectienummer.trim();
            if (!inv || !inst || !col) {
              new Notice("Instelling, collectienummer en inventarisnummer zijn verplicht.");
              return;
            }
            result = {
              permalink: info.permalink,
              titel: v.titel.trim() || undefined,
              archiefinstelling: inst,
              collectienummer: col,
              archiefnaam: v.archiefnaam.trim() || undefined,
              inventarisnummer: inv,
              overkoepelend: v.overkoepelend.trim() || undefined,
              digitaal: v.digitaal === "ja",
            };
            this.close();
          })
        );

        setTimeout(() => this.inputs.inventarisnummer?.inputEl.focus(), 0);
      }
      onClose() {
        this.contentEl.empty();
        resolve(result);
      }
    }
    new DetailsModal(app).open();
  });
}

/* ------------------------------------------------------------------ */
/* Instellingen                                                        */
/* ------------------------------------------------------------------ */

class ArchiefSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: ObsArchiefNL) {
    super(app, plugin);
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Basismap")
      .setDesc("Hierin komt de structuur instelling / collectie / overkoepelend nummer.")
      .addText((t) =>
        t.setValue(this.plugin.settings.rootFolder).onChange(async (val) => {
          this.plugin.settings.rootFolder = val;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Archiefnaam in collectiemap")
      .setDesc('Aan: "2193 Secretarie Gemeente Arnhem, 1917-1924". Uit: alleen "2193".')
      .addToggle((t) =>
        t.setValue(this.plugin.settings.collectieMapMetNaam).onChange(async (val) => {
          this.plugin.settings.collectieMapMetNaam = val;
          await this.plugin.saveSettings();
        })
      );
  }
}
