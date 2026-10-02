import {
  ArcRotateCamera,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  Scene,
  ShadowGenerator,
  Vector3,
} from "@babylonjs/core";
import { office01 } from "../maps/office01";
import {
  activeMap,
  applyMap,
  defaultMap,
  mapWarnings,
  OBJECTS,
  objectBounds,
  onFloor,
  parseMap,
  STORAGE_KEY,
  type MapDocument,
  type MapObject,
  type ObjectKind,
  type SpawnPoint,
} from "../maps/layout";
import { WEAPONS, type WeaponId } from "../config/weapons";
import { World } from "./builder";
import { Pickup } from "../pickups/pickup";
import { Damageable } from "../core/damageable";

type Item = MapObject | SpawnPoint;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export class MapEditor {
  doc: MapDocument = clone(activeMap);
  selected?: string;
  undo: MapDocument[] = [];
  redo: MapDocument[] = [];
  tool = "select";
  grid = 1;
  zoom = 1;
  pan = { x: 0, z: office01.centerZ };
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width = 800;
  height = 600;
  root: HTMLElement;
  previewEngine?: Engine;
  dragging?: {
    pointer: number;
    x: number;
    y: number;
    doc: MapDocument;
    item?: Item;
    pan: { x: number; z: number };
    moved: boolean;
  };
  constructor() {
    document.body.classList.add("editing-map");
    document.querySelector("#game")?.remove();
    this.root = document.querySelector("#ui")!;
    this.root.className = "map-editor";
    this.root.innerHTML = `<header class="editor-header"><a href="/">← SPELET</a><div><small>OFFICE CORE</small><h1>Kartbyggare</h1></div><label>Kartnamn<input id="map-name" maxlength="60"></label><button data-action="save">Spara</button><button data-action="load">Ladda sparad</button><button data-action="export">Exportera JSON</button><button data-action="import">Importera JSON</button><input id="map-file" type="file" accept="application/json,.json" hidden></header>
    <aside class="editor-palette"><h2>Placera på kartan</h2><div class="editor-tools"><button data-tool="select">Välj / flytta</button><button data-tool="pan">Panorera</button><button data-tool="weapon">Vapenspawn</button><button data-tool="ammo">Ammospawn</button><button data-tool="medkit">✚ Med-kit · +50 HP</button><button data-tool="superMedkit">✚ Super Med-kit · 100 HP</button></div><h3>Kontorsobjekt</h3><div class="object-palette">${Object.entries(
      OBJECTS,
    )
      .map(([kind, [label]]) => `<button data-tool="${kind}">${label}</button>`)
      .join(
        "",
      )}</div><p>Klicka för att placera. Välj och dra för att flytta. Scrolla för att zooma.</p><p>Core-rum, väggar och golv är fasta i denna version.</p></aside>
    <main class="editor-workspace"><nav class="editor-toolbar"><button data-action="undo">Ångra</button><button data-action="redo">Gör om</button><button data-action="fit">Visa hela kartan</button><label>Rutnät<select id="editor-grid"><option value="0.5">0,5 m</option><option value="1" selected>1 m</option><option value="2">2 m</option></select></label><button data-action="preview">3D-vy</button><button data-action="check">Kontrollera vägar</button><button data-action="play">Provspela</button></nav><canvas id="editor-map" aria-label="Kartöversikt. Välj verktyg och klicka för att placera. Objekt kan också ändras i egenskapspanelen." tabindex="0"></canvas><div class="editor-status" role="status"></div></main>
    <aside class="editor-inspector"><h2>Egenskaper</h2><label>Välj objekt / plats<select id="editor-selection"><option value="">Inget valt</option></select></label><div id="editor-properties"></div><h3>Kartkontroll</h3><ul id="editor-warnings"></ul><small>Spara lagrar på denna enhet. Exportera kartfilen för servern; provspel är lokalt och påverkar inte multiplayer.</small><button data-action="reset">Återställ grundkartan</button></aside>
    <dialog id="editor-preview"><header><h2>3D-förhandsvisning</h2><button data-action="close-preview">Stäng</button></header><canvas id="preview-map"></canvas><p>Dra för att rotera, scrolla för att zooma. Högerdra för att panorera.</p></dialog>`;
    this.canvas = this.root.querySelector("#editor-map")!;
    this.ctx = this.canvas.getContext("2d")!;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) this.doc = parseMap(JSON.parse(saved));
    } catch {
      this.status("Den sparade kartan kunde inte läsas. Grundkartan är öppen.");
    }
    this.root.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
        "button",
      );
      if (!button) return;
      if (button.dataset.tool) {
        this.tool = button.dataset.tool;
        this.render();
      }
      if (button.dataset.action) void this.action(button.dataset.action);
    });
    this.root
      .querySelector<HTMLInputElement>("#map-name")!
      .addEventListener("change", (event) =>
        this.change(
          (doc) => (doc.name = (event.target as HTMLInputElement).value),
        ),
      );
    this.root
      .querySelector<HTMLSelectElement>("#editor-grid")!
      .addEventListener("change", (event) => {
        this.grid = Number((event.target as HTMLSelectElement).value);
        this.draw();
      });
    this.root
      .querySelector<HTMLSelectElement>("#editor-selection")!
      .addEventListener("change", (event) => {
        this.selected = (event.target as HTMLSelectElement).value;
        this.render();
      });
    this.root
      .querySelector<HTMLInputElement>("#map-file")!
      .addEventListener("change", async (event) => {
        const input = event.target as HTMLInputElement,
          file = input.files?.[0];
        if (!file) return;
        try {
          if (file.size > 200000) throw new Error("Kartfilen är för stor.");
          const doc = parseMap(JSON.parse(await file.text()));
          this.replace(doc);
          this.status("Kartfil importerad. Spara för att behålla den.");
        } catch (error) {
          this.status(
            error instanceof Error ? error.message : "Import misslyckades.",
          );
        } finally {
          input.value = "";
        }
      });
    this.canvas.addEventListener("pointerdown", (event) =>
      this.pointerDown(event),
    );
    this.canvas.addEventListener("pointermove", (event) =>
      this.pointerMove(event),
    );
    this.canvas.addEventListener("pointerup", (event) => this.pointerUp(event));
    this.canvas.addEventListener("pointercancel", () => {
      if (this.dragging) {
        this.doc = this.dragging.doc;
        this.dragging = undefined;
        this.render();
      }
    });
    this.canvas.addEventListener("contextmenu", (event) =>
      event.preventDefault(),
    );
    this.canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        this.zoom = Math.max(
          0.5,
          Math.min(10, this.zoom * Math.exp(-event.deltaY * 0.001)),
        );
        this.draw();
      },
      { passive: false },
    );
    window.addEventListener("keydown", (event) => {
      if (
        (event.target as HTMLElement).matches("input,select,textarea") ||
        this.root.querySelector<HTMLDialogElement>("dialog")!.open
      )
        return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        void this.action(event.shiftKey ? "redo" : "undo");
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void this.action("save");
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        void this.action("delete");
      }
      if (event.key.toLowerCase() === "r") void this.action("rotate");
      if (event.key === "Escape") {
        this.tool = "select";
        this.selected = undefined;
        this.render();
      }
    });
    const dialog = this.root.querySelector<HTMLDialogElement>("dialog")!;
    dialog.addEventListener("close", () => {
      this.previewEngine?.dispose();
      this.previewEngine = undefined;
    });
    new ResizeObserver(() => {
      const rect = this.canvas.getBoundingClientRect();
      this.width = rect.width;
      this.height = rect.height;
      this.canvas.width = Math.round(rect.width * devicePixelRatio);
      this.canvas.height = Math.round(rect.height * devicePixelRatio);
      this.draw();
    }).observe(this.canvas);
    this.render();
    this.status(
      "Välj ett objekt eller en spawnplats i paletten. Klicka sedan på golvet.",
    );
  }
  get items(): Item[] {
    return [...this.doc.objects, ...this.doc.spawns];
  }
  get item() {
    return this.items.find((item) => item.id === this.selected);
  }
  status(message: string) {
    this.root.querySelector(".editor-status")!.textContent = message;
  }
  remember(doc: MapDocument) {
    this.undo.push(clone(doc));
    if (this.undo.length > 60) this.undo.shift();
    this.redo = [];
  }
  change(update: (doc: MapDocument) => void) {
    const before = clone(this.doc);
    try {
      update(this.doc);
      this.doc = parseMap(this.doc);
      this.remember(before);
      this.render();
    } catch (error) {
      this.doc = before;
      this.render();
      this.status(
        error instanceof Error ? error.message : "Ändringen kunde inte sparas.",
      );
    }
  }
  replace(doc: MapDocument) {
    this.remember(this.doc);
    this.doc = clone(doc);
    this.selected = undefined;
    this.render();
  }
  async action(action: string) {
    try {
      if (action === "undo" && this.undo.length) {
        this.redo.push(clone(this.doc));
        this.doc = this.undo.pop()!;
        this.render();
      }
      if (action === "redo" && this.redo.length) {
        this.undo.push(clone(this.doc));
        this.doc = this.redo.pop()!;
        this.render();
      }
      if (action === "fit") {
        this.pan = { x: 0, z: office01.centerZ };
        this.zoom = 1;
        this.draw();
      }
      if (action === "rotate" && this.item && "kind" in this.item)
        this.change(() => {
          (this.item as MapObject).rotation =
            ((this.item as MapObject).rotation + 90) % 360;
        });
      if (action === "duplicate" && this.item) {
        const item = clone(this.item);
        item.id = crypto.randomUUID();
        item.x += this.grid;
        this.change((doc) => {
          "kind" in item ? doc.objects.push(item) : doc.spawns.push(item);
        });
        this.selected = item.id;
        this.render();
      }
      if (action === "delete" && this.selected) {
        this.change((doc) => {
          doc.objects = doc.objects.filter((p) => p.id !== this.selected);
          doc.spawns = doc.spawns.filter((p) => p.id !== this.selected);
        });
        this.selected = undefined;
        this.render();
      }
      if (action === "save") {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parseMap(this.doc)));
        this.status("Kartan är sparad på denna enhet.");
      }
      if (action === "load") {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) throw new Error("Ingen sparad karta finns på denna enhet.");
        this.replace(parseMap(JSON.parse(saved)));
        this.status("Sparad karta laddad.");
      }
      if (action === "export") {
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(parseMap(this.doc), null, 2)], {
            type: "application/json",
          }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = "office01-map.json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.status("Kartfil exporterad.");
      }
      if (action === "import")
        this.root.querySelector<HTMLInputElement>("#map-file")!.click();
      if (action === "reset") {
        this.replace(defaultMap());
        this.status("Grundkartan återställd. Ångra om du vill återgå.");
      }
      if (action === "check") {
        this.warnings();
        this.status("Kartkontrollen är uppdaterad.");
      }
      if (action === "play") {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parseMap(this.doc)));
        location.href = "/?playtest=1";
      }
      if (action === "preview") this.preview();
      if (action === "close-preview")
        this.root.querySelector<HTMLDialogElement>("dialog")!.close();
    } catch (error) {
      this.status(
        error instanceof Error ? error.message : "Åtgärden misslyckades.",
      );
    }
  }
  scale() {
    return (
      Math.min(
        (this.width - 36) / office01.width,
        (this.height - 36) / office01.depth,
      ) * this.zoom
    );
  }
  toScreen(x: number, z: number) {
    const s = this.scale();
    return {
      x: this.width / 2 + (x - this.pan.x) * s,
      y: this.height / 2 - (z - this.pan.z) * s,
    };
  }
  toWorld(event: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect(),
      s = this.scale();
    return {
      x: this.pan.x + (event.clientX - rect.left - this.width / 2) / s,
      z: this.pan.z - (event.clientY - rect.top - this.height / 2) / s,
    };
  }
  snap(n: number) {
    return Math.round(n / this.grid) * this.grid;
  }
  pointerDown(event: PointerEvent) {
    if (event.button !== 0 && event.button !== 1) return;
    const point = this.toWorld(event);
    if (this.tool === "pan" || event.button === 1) {
      this.dragging = {
        pointer: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        doc: clone(this.doc),
        pan: { ...this.pan },
        moved: false,
      };
      this.canvas.setPointerCapture(event.pointerId);
      return;
    }
    if (this.tool !== "select") {
      const x = this.snap(point.x),
        z = this.snap(point.z);
      if (!onFloor(x, z)) {
        this.status("Placera på kartans golv.");
        return;
      }
      const id = crypto.randomUUID();
      if (this.tool === "weapon" || this.tool === "ammo" || this.tool === "medkit" || this.tool === "superMedkit") {
        const type = this.tool as SpawnPoint["type"];
        this.change((doc) =>
          doc.spawns.push({
            id,
            type,
            x,
            z,
            weapon: type === "weapon" ? "machineGun" : "pistol",
            pool: (Object.keys(WEAPONS) as WeaponId[]).filter(
              (id) => type === "weapon" || id !== "coreBuster",
            ),
            interval: type === "weapon" ? 30 : 15,
            initialDelay: 0,
            amount: 0,
          }),
        );
      } else {
        const kind = this.tool as ObjectKind;
        this.change((doc) =>
          doc.objects.push({
            id,
            kind,
            x,
            z,
            w: OBJECTS[kind][1],
            d: OBJECTS[kind][2],
            rotation: 0,
            destructible: kind !== "pillar",
          }),
        );
      }
      if (this.items.some((p) => p.id === id)) {
        this.selected = id;
        this.render();
        this.status("Placerad. Välj / flytta för att flytta eller redigera.");
      }
      return;
    }
    const item = [...this.items].reverse().find((p) => {
      const b = "kind" in p ? objectBounds(p) : { w: 1.8, d: 1.8 };
      return (
        Math.abs(point.x - p.x) < b.w / 2 + 0.3 &&
        Math.abs(point.z - p.z) < b.d / 2 + 0.3
      );
    });
    this.selected = item?.id;
    this.render();
    if (item) {
      this.dragging = {
        pointer: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        doc: clone(this.doc),
        item,
        pan: { ...this.pan },
        moved: false,
      };
      this.canvas.setPointerCapture(event.pointerId);
    }
  }
  pointerMove(event: PointerEvent) {
    const drag = this.dragging;
    if (!drag || drag.pointer !== event.pointerId) return;
    const dx = event.clientX - drag.x,
      dy = event.clientY - drag.y;
    drag.moved ||= Math.hypot(dx, dy) > 3;
    if (!drag.moved) return;
    if (drag.item) {
      const original = [...drag.doc.objects, ...drag.doc.spawns].find(
        (p) => p.id === drag.item!.id,
      )!;
      drag.item.x = this.snap(original.x + dx / this.scale());
      drag.item.z = this.snap(original.z - dy / this.scale());
    } else {
      this.pan.x = drag.pan.x - dx / this.scale();
      this.pan.z = drag.pan.z + dy / this.scale();
    }
    this.draw();
  }
  pointerUp(event: PointerEvent) {
    const drag = this.dragging;
    if (!drag || drag.pointer !== event.pointerId) return;
    this.dragging = undefined;
    if (drag.item && drag.moved) {
      try {
        this.doc = parseMap(this.doc);
        this.remember(drag.doc);
      } catch (error) {
        this.doc = drag.doc;
        this.status(
          error instanceof Error ? error.message : "Ogiltig placering.",
        );
      }
      this.render();
    }
  }
  render() {
    this.root.querySelector<HTMLInputElement>("#map-name")!.value =
      this.doc.name;
    this.root
      .querySelectorAll<HTMLButtonElement>("[data-tool]")
      .forEach((b) => {
        b.classList.toggle("active", b.dataset.tool === this.tool);
        b.setAttribute("aria-pressed", String(b.dataset.tool === this.tool));
      });
    this.root.querySelector<HTMLButtonElement>(
      '[data-action="undo"]',
    )!.disabled = !this.undo.length;
    this.root.querySelector<HTMLButtonElement>(
      '[data-action="redo"]',
    )!.disabled = !this.redo.length;
    const select =
      this.root.querySelector<HTMLSelectElement>("#editor-selection")!;
    select.replaceChildren(
      new Option("Inget valt", ""),
      ...this.items.map(
        (item, i) =>
          new Option(
            `${i + 1}. ${"kind" in item ? OBJECTS[item.kind][0] : item.type === "weapon" ? "Vapenspawn" : item.type === "ammo" ? "Ammospawn" : item.type === "medkit" ? "Med-kit · +50 HP" : "Super Med-kit · 100 HP"} (${item.x}, ${item.z})`,
            item.id,
          ),
      ),
    );
    select.value = this.selected ?? "";
    const panel = this.root.querySelector<HTMLElement>("#editor-properties")!,
      item = this.item;
    if (!item)
      panel.innerHTML =
        "<p>Välj ett objekt på kartan eller i listan för att ändra dess egenskaper.</p>";
    else {
      const field = (
        label: string,
        key: string,
        value: number,
        min: number,
        max: number,
        step = 0.5,
      ) =>
        `<label>${label}<input data-field="${key}" type="number" value="${value}" min="${min}" max="${max}" step="${step}"></label>`;
      panel.innerHTML = `<h3>${"kind" in item ? OBJECTS[item.kind][0] : item.type === "weapon" ? "Vapenspawn" : item.type === "ammo" ? "Ammospawn" : item.type === "medkit" ? "Med-kit · +50 HP" : "Super Med-kit · 100 HP"}</h3>${field("X (meter)", "x", item.x, -110, 110)}${field("Z (meter)", "z", item.z, -56, 88)}`;
      if ("kind" in item)
        panel.innerHTML += `${field("Bredd (meter)", "w", item.w ?? OBJECTS[item.kind][1], 0.1, 12, 0.1)}${field("Djup (meter)", "d", item.d ?? OBJECTS[item.kind][2], 0.1, 12, 0.1)}<label>Rotation<select data-field="rotation">${[0, 90, 180, 270].map((n) => `<option value="${n}" ${item.rotation === n ? "selected" : ""}>${n}°</option>`).join("")}</select></label><label class="check"><input data-field="destructible" type="checkbox" ${item.destructible ? "checked" : ""}> Förstörbart</label>`;
      else if (item.type === "medkit" || item.type === "superMedkit") {
        panel.innerHTML += `${field("Återkommer efter upplockning (sekunder)", "interval", item.interval, 1, 3600, 1)}${field("Fördröjning vid matchstart (sekunder)", "initialDelay", item.initialDelay, 0, 3600, 1)}<p>${item.type === "medkit" ? "Ger 50 HP, upp till 100 HP." : "Återställer hälsan till 100 HP."} Plockas upp automatiskt när en skadad spelare går över kitet.</p>`;
      }
      else {
        const ids = (Object.keys(WEAPONS) as WeaponId[]).filter(
          (id) => item.type === "weapon" || id !== "coreBuster",
        );
        panel.innerHTML += `<label>${item.type === "weapon" ? "Vapen" : "Ammunitionstyp"}<select data-field="weapon"><option value="random" ${item.weapon === "random" ? "selected" : ""}>Slumpmässigt</option>${ids.map((id) => `<option value="${id}" ${item.weapon === id ? "selected" : ""}>${escape(WEAPONS[id].name)}</option>`).join("")}</select></label>${item.weapon === "random" ? `<fieldset><legend>Välj slumplista</legend>${ids.map((id) => `<label class="check"><input data-pool="${id}" type="checkbox" ${item.pool.includes(id) ? "checked" : ""}> ${escape(WEAPONS[id].name)}</label>`).join("")}</fieldset>` : ""}${field("Återkommer efter upplockning (sekunder)", "interval", item.interval, 1, 3600, 1)}${field("Fördröjning vid matchstart (sekunder)", "initialDelay", item.initialDelay, 0, 3600, 1)}${item.type === "ammo" ? field("Antal patroner (0 = standard per vapen)", "amount", item.amount, 0, 500, 1) : ""}<p>Slumpval görs vid varje spawn. Tiden gäller just denna plats.</p>`;
      }
      panel.innerHTML +=
        '<div class="editor-row"><button data-action="rotate" ${"kind" in item ? "" : "disabled"}>Rotera 90°</button><button data-action="duplicate">Duplicera</button><button data-action="delete">Ta bort</button></div>';
      panel
        .querySelectorAll<HTMLInputElement | HTMLSelectElement>(
          "[data-field],[data-pool]",
        )
        .forEach((input) =>
          input.addEventListener("change", () => {
            this.change(() => {
              const selected = this.item!;
              if (input.dataset.pool) {
                const p = selected as SpawnPoint;
                const id = input.dataset.pool as WeaponId;
                p.pool = (input as HTMLInputElement).checked
                  ? [...p.pool, id]
                  : p.pool.filter((value) => value !== id);
              } else {
                const key = input.dataset.field!;
                Object.assign(selected, {
                  [key]:
                    key === "weapon"
                      ? input.value
                      : key === "destructible"
                        ? (input as HTMLInputElement).checked
                        : Number(input.value),
                });
              }
            });
          }),
        );
    }
    this.warnings();
    this.draw();
  }
  warnings() {
    const warnings = mapWarnings(this.doc),
      list = this.root.querySelector("#editor-warnings")!;
    list.replaceChildren(
      ...(warnings.length
        ? warnings
        : ["Vägar mellan lag, atrium och spawnplatser är framkomliga."]
      ).map((message) => {
        const li = document.createElement("li");
        li.textContent = message;
        return li;
      }),
    );
    list.classList.toggle("has-warnings", warnings.length > 0);
  }
  draw() {
    const c = this.ctx,
      s = this.scale();
    if (s <= 0) return;
    c.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    c.clearRect(0, 0, this.width, this.height);
    c.fillStyle = "#0a1b25";
    c.fillRect(0, 0, this.width, this.height);
    const rect = (
      x: number,
      z: number,
      w: number,
      d: number,
      color: string,
    ) => {
      const p = this.toScreen(x - w / 2, z + d / 2);
      c.fillStyle = color;
      c.fillRect(p.x, p.y, w * s, d * s);
    };
    for (const r of office01.footprint) rect(r.x, r.z, r.w, r.d, "#405b63");
    for (const r of office01.rooms) rect(r.x, r.z, r.w, r.d, "#526c70");
    c.strokeStyle = "#b9d4d514";
    c.lineWidth = 1;
    for (let x = -110; x <= 110; x += this.grid) {
      const a = this.toScreen(x, -56),
        b = this.toScreen(x, 88);
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
    }
    for (let z = -56; z <= 88; z += this.grid) {
      const a = this.toScreen(-110, z),
        b = this.toScreen(110, z);
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
    }
    for (const w of office01.walls) rect(w.x, w.z, w.w, w.d, "#b6c9bd");
    for (const base of office01.bases) {
      rect(base.x, base.z, 9, 9, base.team === "RED" ? "#f46b63" : "#55b6ff");
      const p = this.toScreen(base.x, base.z);
      c.fillStyle = "#071724";
      c.font = "bold 11px sans-serif";
      c.textAlign = "center";
      c.fillText(base.team, p.x, p.y + 4);
      rect(base.spawn.x, base.spawn.z, 2, 3, "#74d3c0");
    }
    for (const item of this.items) {
      const p = this.toScreen(item.x, item.z);
      if ("kind" in item) {
        const b = objectBounds(item);
        rect(
          item.x,
          item.z,
          b.w,
          b.d,
          item.destructible ? "#c6a777" : "#9baab3",
        );
        c.strokeStyle = "#203843";
        c.strokeRect(
          p.x - (b.w * s) / 2,
          p.y - (b.d * s) / 2,
          b.w * s,
          b.d * s,
        );
        if (s > 8) {
          c.fillStyle = "#152c35";
          c.font = "9px sans-serif";
          c.textAlign = "center";
          c.fillText(OBJECTS[item.kind][0], p.x, p.y - 4);
        }
      } else {
        c.beginPath();
        c.arc(p.x, p.y, Math.max(4, s * 0.65), 0, Math.PI * 2);
        c.fillStyle = item.type === "weapon" ? "#ffc86b" : item.type === "superMedkit" ? "#ffd45f" : "#63e1be";
        c.fill();
        c.fillStyle = "#14323b";
        c.font = "bold 10px sans-serif";
        c.textAlign = "center";
        c.fillText(item.type === "weapon" ? "V" : item.type === "ammo" ? "A" : item.type === "medkit" ? "+" : "✚", p.x, p.y + 3);
      }
      if (item.id === this.selected) {
        c.strokeStyle = "#fff7df";
        c.lineWidth = 2;
        c.strokeRect(p.x - 10, p.y - 10, 20, 20);
        c.lineWidth = 1;
      }
    }
    c.fillStyle = "#c9dedf";
    c.textAlign = "left";
    c.font = "12px sans-serif";
    c.fillText(
      `N ↑   ·   ${this.doc.objects.length} objekt   ·   ${this.doc.spawns.length} spawnplatser   ·   rutnät ${this.grid} m`,
      16,
      24,
    );
  }
  preview() {
    const dialog = this.root.querySelector<HTMLDialogElement>("dialog")!;
    dialog.showModal();
    applyMap(this.doc);
    const canvas = this.root.querySelector<HTMLCanvasElement>("#preview-map")!;
    const engine = (this.previewEngine = new Engine(canvas, true)),
      scene = new Scene(engine);
    scene.clearColor = new Color4(0.04, 0.1, 0.14, 1);
    const camera = new ArcRotateCamera(
      "map preview",
      -Math.PI / 2,
      0.55,
      180,
      new Vector3(0, 0, office01.centerZ),
      scene,
    );
    camera.attachControl(canvas, true);
    camera.minZ = 0.1;
    camera.maxZ = 600;
    camera.lowerRadiusLimit = 8;
    camera.upperRadiusLimit = 300;
    camera.lowerBetaLimit = 0.1;
    camera.upperBetaLimit = 1.5;
    new HemisphericLight("ambient", new Vector3(0, 1, 0), scene).intensity =
      0.8;
    const sun = new DirectionalLight("sun", new Vector3(-0.4, -1, 0.3), scene);
    sun.position.set(0, 60, 0);
    const shadows = new ShadowGenerator(1024, sun);
    shadows.usePercentageCloserFiltering = true;
    shadows.bias = 0.002;
    shadows.normalBias = 0.05;
    shadows.setDarkness(0.3);
    const world = new World(scene, shadows);
    world.build();
    new Pickup(world);
    for (const base of office01.bases)
      new Damageable(world, "core", base.x, base.z, base.team).setActive(true);
    engine.runRenderLoop(() => scene.render());
    engine.resize();
    const resize = new ResizeObserver(() => engine.resize());
    resize.observe(canvas);
    engine.onDisposeObservable.add(() => resize.disconnect());
  }
}
