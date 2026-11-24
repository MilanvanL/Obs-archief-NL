var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => ObsArchiefNL
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  rootFolder: "Archieven",
  collectieMapMetNaam: true
};
var ObsArchiefNL = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
  }
  async onload() {
    await this.loadSettings();
    this.addCommand({
      id: "maak-notitie-van-permalink",
      name: "Notitie maken van archieven.nl-permalink",
      callback: () => this.run()
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
      "https://proxy.archieven.nl/0/\u2026  of  https://archief.amsterdam/\u2026"
    );
    if (!permalink) return;
    const source = detectSource(permalink);
    if (!source) {
      new import_obsidian.Notice(
        "Onbekende permalink. Ondersteund: proxy.archieven.nl/0/\u2026 en archief.amsterdam/\u2026"
      );
      return;
    }
    let info = baseInfo(source, permalink);
    try {
      new import_obsidian.Notice("Gegevens ophalen\u2026");
      const res = await (0, import_obsidian.requestUrl)({ url: permalink, throw: false });
      if (res.status >= 200 && res.status < 400) {
        info = mergeInfo(info, parseSource(source, res.text, permalink));
      } else {
        new import_obsidian.Notice(`Pagina gaf status ${res.status}; vul de gegevens zelf in.`);
      }
    } catch (e) {
      console.error("[Obs-Archief-NL]", e);
      new import_obsidian.Notice("Pagina niet op te halen; vul de gegevens zelf in.");
    }
    const rec = await askDetails(this.app, info);
    if (!rec) return;
    try {
      await this.writeNote(rec);
    } catch (e) {
      console.error("[Obs-Archief-NL]", e);
      new import_obsidian.Notice(`Notitie maken mislukt: ${e.message}`);
    }
  }
  /* ----------------------- mappen en notitie ------------------------ */
  /** Instelling / collectie / [overkoepelend inventarisnummer] */
  folderSegments(rec) {
    const collectie = this.settings.collectieMapMetNaam && rec.archiefnaam ? `${rec.collectienummer} ${rec.archiefnaam}` : rec.collectienummer;
    return [this.settings.rootFolder, rec.archiefinstelling, collectie, rec.overkoepelend].filter((s) => !!s && s.trim() !== "").map((x) => safeName(x)).filter((s) => s !== "");
  }
  async writeNote(rec) {
    const folder = (0, import_obsidian.normalizePath)(this.folderSegments(rec).join("/"));
    await this.ensureFolder(folder);
    const base = rec.titel ? `${rec.inventarisnummer} ${rec.titel}` : rec.inventarisnummer;
    const path = (0, import_obsidian.normalizePath)(`${folder}/${safeName(base, 150)}.md`);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof import_obsidian.TFile) {
      new import_obsidian.Notice("Notitie bestond al; wordt geopend.");
      await this.app.workspace.getLeaf(false).openFile(existing);
      return;
    }
    const file = await this.app.vault.create(path, buildNote(rec));
    await this.app.workspace.getLeaf(false).openFile(file);
  }
  /** Maakt elke ontbrekende map in het pad aan; bestaande blijven ongemoeid. */
  async ensureFolder(folderPath) {
    let current = "";
    for (const part of folderPath.split("/").filter(Boolean)) {
      current = current ? `${current}/${part}` : part;
      if (this.app.vault.getAbstractFileByPath(current)) continue;
      try {
        await this.app.vault.createFolder(current);
      } catch (e) {
        if (!this.app.vault.getAbstractFileByPath(current)) throw e;
      }
    }
  }
};
function buildNote(rec) {
  const q = (s) => JSON.stringify(s);
  const fm = [
    "---",
    `aangemaakt: ${today()}`,
    `permalink: ${q(rec.permalink)}`,
    `digitaal_beschikbaar: ${rec.digitaal ? "ja" : "nee"}`,
    `archiefinstelling: ${q(rec.archiefinstelling)}`,
    `collectienummer: ${q(rec.collectienummer)}`
  ];
  if (rec.archiefnaam) fm.push(`archief: ${q(rec.archiefnaam)}`);
  if (rec.overkoepelend) fm.push(`overkoepelend_inventarisnummer: ${q(rec.overkoepelend)}`);
  fm.push(`inventarisnummer: ${q(rec.inventarisnummer)}`);
  fm.push(`aliases: [${q(rec.inventarisnummer)}]`);
  if (rec.titel) fm.push(`titel: ${q(rec.titel)}`);
  fm.push("---");
  const body = [];
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
function today() {
  const d = /* @__PURE__ */ new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function detectSource(raw) {
  let u;
  try {
    u = new URL(raw.trim());
  } catch (e) {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");
  if (host === "proxy.archieven.nl" && /^\/0\/[0-9A-Fa-f]{32}\/?$/.test(u.pathname))
    return "archieven";
  if (host === "archief.amsterdam" && /^\/(inventarissen|archief)\//.test(u.pathname))
    return "amsterdam";
  return null;
}
function baseInfo(source, url) {
  return source === "amsterdam" ? parseAmsterdam("", url) : { permalink: url };
}
function parseSource(source, html, url) {
  return source === "amsterdam" ? parseAmsterdam(html, url) : parseArchievenNl(html, url);
}
function mergeInfo(base, extra) {
  const out = { ...base };
  for (const [k, val] of Object.entries(extra)) {
    if (val !== void 0 && val !== "") out[k] = val;
  }
  return out;
}
function parseAmsterdam(html, url) {
  var _a, _b, _c, _d, _e, _f;
  const dec = (x) => {
    try {
      return decodeURIComponent(x);
    } catch (e) {
      return x;
    }
  };
  const info = { permalink: url, archiefinstelling: "Stadsarchief Amsterdam" };
  const fromPath = (raw) => {
    if (!raw) return;
    let p;
    try {
      p = new URL(raw, "https://archief.amsterdam").pathname;
    } catch (e) {
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
  const meta = (p) => {
    var _a2, _b2;
    return ((_b2 = (_a2 = doc.querySelector(`meta[property="${p}"]`)) == null ? void 0 : _a2.getAttribute("content")) == null ? void 0 : _b2.trim()) || void 0;
  };
  fromPath((_b = (_a = doc.querySelector('link[rel="canonical"]')) == null ? void 0 : _a.getAttribute("href")) != null ? _b : void 0);
  fromPath(meta("og:url"));
  const GENERIC = /^(website title and logo|stadsarchief( amsterdam)?|archief\.amsterdam|amsterdam city archives|inventarissen|home|homepage)$/i;
  const candidates = [
    meta("og:title"),
    (_d = (_c = doc.querySelector('meta[name="twitter:title"]')) == null ? void 0 : _c.getAttribute("content")) == null ? void 0 : _d.trim(),
    (_f = (_e = doc.querySelector("title")) == null ? void 0 : _e.textContent) == null ? void 0 : _f.trim()
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const t = raw.replace(/\s*[|–—-]\s*(Stadsarchief Amsterdam|Amsterdam City Archives|archief\.amsterdam).*$/i, "").trim();
    if (t && !GENERIC.test(t)) {
      info.titel = t;
      break;
    }
  }
  return info;
}
function parseArchievenNl(html, permalink) {
  var _a, _b, _c, _d;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const meta = (p) => {
    var _a2, _b2;
    return ((_b2 = (_a2 = doc.querySelector(`meta[property="${p}"]`)) == null ? void 0 : _a2.getAttribute("content")) == null ? void 0 : _b2.trim()) || void 0;
  };
  const titel = meta("og:title");
  let micode;
  const ogUrl = meta("og:url");
  if (ogUrl) {
    try {
      micode = new URL(ogUrl).searchParams.get("micode") || void 0;
    } catch (e) {
    }
  }
  const pageTitle = (_c = (_b = (_a = doc.querySelector("title")) == null ? void 0 : _a.textContent) == null ? void 0 : _b.trim()) != null ? _c : "";
  const m = pageTitle.match(/^Archieven\.nl\s*-\s*(.+?)\s*\(([^()]+)\)\s*$/);
  let collectienummer = micode;
  let archiefnaam;
  const archiefinstelling = (_d = m == null ? void 0 : m[2]) == null ? void 0 : _d.trim();
  if (m) {
    const head = m[1].trim();
    const code = micode && head.startsWith(micode) ? micode : head.split(/\s+/)[0];
    if (!collectienummer) collectienummer = code;
    archiefnaam = head.slice(code.length).trim() || void 0;
  }
  return { permalink, titel, archiefinstelling, collectienummer, archiefnaam };
}
function safeName(s, max = 100) {
  return s.replace(/[\\/:*?"<>|#^\[\]]/g, "-").replace(/\s+/g, " ").replace(/^[.\s]+|[.\s]+$/g, "").slice(0, max).replace(/[.\s]+$/g, "").trim();
}
function askText(app, heading, placeholder) {
  return new Promise((resolve) => {
    let value = "";
    let submitted = false;
    class TextModal extends import_obsidian.Modal {
      onOpen() {
        this.contentEl.createEl("h3", { text: heading });
        new import_obsidian.Setting(this.contentEl).addText((t) => {
          t.setPlaceholder(placeholder).onChange((v) => value = v);
          t.inputEl.style.width = "100%";
          t.inputEl.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
              submitted = true;
              this.close();
            }
          });
          window.setTimeout(() => t.inputEl.focus(), 0);
        });
        new import_obsidian.Setting(this.contentEl).addButton(
          (b) => b.setButtonText("OK").setCta().onClick(() => {
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
function askDetails(app, info) {
  return new Promise((resolve) => {
    var _a, _b, _c, _d, _e;
    let result = null;
    const v = {
      inventarisnummer: (_a = info.inventarisnummer) != null ? _a : "",
      titel: (_b = info.titel) != null ? _b : "",
      overkoepelend: "",
      archiefinstelling: (_c = info.archiefinstelling) != null ? _c : "",
      collectienummer: (_d = info.collectienummer) != null ? _d : "",
      archiefnaam: (_e = info.archiefnaam) != null ? _e : "",
      digitaal: "nee"
    };
    class DetailsModal extends import_obsidian.Modal {
      constructor() {
        super(...arguments);
        this.inputs = {};
      }
      /** "2567 Register van … 1940-1941." -> nummer + naam */
      splitLine() {
        var _a2, _b2;
        const m = v.inventarisnummer.trim().match(/^(\S*\d\S*)\s+(.{10,})$/);
        if (!m) return;
        v.inventarisnummer = m[1];
        v.titel = m[2].trim();
        (_a2 = this.inputs.inventarisnummer) == null ? void 0 : _a2.setValue(v.inventarisnummer);
        (_b2 = this.inputs.titel) == null ? void 0 : _b2.setValue(v.titel);
      }
      onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h3", { text: "Controleer de gegevens" });
        const field = (name, key, desc) => {
          const s = new import_obsidian.Setting(contentEl).setName(name);
          if (desc) s.setDesc(desc);
          s.addText((t) => {
            this.inputs[key] = t;
            t.setValue(v[key]).onChange((x) => v[key] = x);
            t.inputEl.style.width = "100%";
          });
        };
        field(
          "Inventarisnummer",
          "inventarisnummer",
          'Wordt de titel van de notitie. Plak de hele regel van archieven.nl ("2567 Register van \u2026") om nummer en naam tegelijk in te vullen.'
        );
        const inv = this.inputs.inventarisnummer.inputEl;
        inv.addEventListener("paste", () => window.setTimeout(() => this.splitLine(), 0));
        inv.addEventListener("blur", () => this.splitLine());
        field("Naam", "titel", "Voorafgaand ingevuld vanaf archieven.nl.");
        field("Overkoepelend inventarisnummer", "overkoepelend", "Optioneel; maakt een extra submap.");
        field("Archiefinstelling", "archiefinstelling");
        field("Collectienummer", "collectienummer");
        field("Archiefnaam", "archiefnaam", "Optioneel; wordt aan de collectiemap toegevoegd.");
        new import_obsidian.Setting(contentEl).setName("Digitaal beschikbaar").addDropdown(
          (d) => d.addOptions({ nee: "nee", ja: "ja" }).setValue(v.digitaal).onChange((x) => v.digitaal = x)
        );
        new import_obsidian.Setting(contentEl).addButton(
          (b) => b.setButtonText("Notitie maken").setCta().onClick(() => {
            this.splitLine();
            const inv2 = v.inventarisnummer.trim();
            const inst = v.archiefinstelling.trim();
            const col = v.collectienummer.trim();
            if (!inv2 || !inst || !col) {
              new import_obsidian.Notice("Instelling, collectienummer en inventarisnummer zijn verplicht.");
              return;
            }
            result = {
              permalink: info.permalink,
              titel: v.titel.trim() || void 0,
              archiefinstelling: inst,
              collectienummer: col,
              archiefnaam: v.archiefnaam.trim() || void 0,
              inventarisnummer: inv2,
              overkoepelend: v.overkoepelend.trim() || void 0,
              digitaal: v.digitaal === "ja"
            };
            this.close();
          })
        );
        window.setTimeout(() => {
          var _a2;
          return (_a2 = this.inputs.inventarisnummer) == null ? void 0 : _a2.inputEl.focus();
        }, 0);
      }
      onClose() {
        this.contentEl.empty();
        resolve(result);
      }
    }
    new DetailsModal(app).open();
  });
}
var ArchiefSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("Basismap").setDesc("Hierin komt de structuur instelling / collectie / overkoepelend nummer.").addText(
      (t) => t.setValue(this.plugin.settings.rootFolder).onChange(async (val) => {
        this.plugin.settings.rootFolder = val;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Archiefnaam in collectiemap").setDesc('Aan: "2193 Secretarie Gemeente Arnhem, 1917-1924". Uit: alleen "2193".').addToggle(
      (t) => t.setValue(this.plugin.settings.collectieMapMetNaam).onChange(async (val) => {
        this.plugin.settings.collectieMapMetNaam = val;
        await this.plugin.saveSettings();
      })
    );
  }
};
