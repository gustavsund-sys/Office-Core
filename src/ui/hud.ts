import { TEAMS } from "../config/game";
import { WEAPONS } from "../config/weapons";
import type { Damageable } from "../core/damageable";
import type { Weapons } from "../weapons/system";
import type { Player } from "../player/player";
import { office01 } from "../maps/office01";
export class HUD {
  el = document.querySelector<HTMLDivElement>("#ui")!;
  toastTime = 0;
  warningTime = 0;
  minimap: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  constructor() {
    this.el.innerHTML = `<header><div class="brand">OFFICE<span>CORE</span><small>ALPHA 0.1 <i></i> LOCAL PLAYTEST</small></div><div class="cores">${Object.entries(
      TEAMS,
    )
      .map(
        ([t, c]) =>
          `<div class="core" style="--team:${c}"><div><span><i></i>${t} CORE</span><b id="hp-${t}">1000</b></div><div class="track"><div id="bar-${t}"></div></div></div>`,
      )
      .join(
        "",
      )}</div><button id="pause" aria-label="Pause game">Ⅱ</button></header><aside class="location"><span>FLOOR 01 / HEADQUARTERS</span><h2 id="room">RED BASE</h2><p><i></i> Training session · No hostiles</p></aside><div id="warning">YOUR CORE IS UNDER ATTACK</div><div id="toast"></div><div class="objective"><span>FIELD TEST / 01</span><b>Take the long way in.</b><p>Follow the corridors to the Combat Atrium.<br>Shoot office furniture to destroy cover.</p></div><div class="map"><div>OFFICE01 <span>N ↑</span></div><canvas id="minimap" width="190" height="190"></canvas></div><footer><div class="health"><span>PLAYER / RED TEAM</span><strong>100 <small>HP</small></strong><div class="healthline"></div></div><div class="weapon"><span>EQUIPPED WEAPON</span><strong id="weapon">PISTOL</strong><small id="mode">SEMI-AUTO</small></div><div class="ammo"><span>AMMUNITION</span><strong id="ammo">∞</strong></div><div class="controls"><p><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Move &nbsp; <kbd>↖</kbd> Aim &nbsp; <kbd>LMB</kbd> Fire</p><p><kbd>C</kbd> <span id="movement-mode">W follows aim</span> &nbsp; <kbd>SPACE</kbd> Jump &nbsp; <kbd>1</kbd> Pistol <kbd>2</kbd> Special <kbd>E</kbd> Pick up &nbsp; <kbd>F2</kbd> Debug &nbsp; <kbd>ESC</kbd> Pause &nbsp; <button id="sound">SOUND ON</button></p></div></footer><div id="crosshair"><i></i></div><div id="damage"></div><pre id="debug"></pre><div id="overlay"><div class="pause-card"><span>WELCOME TO THE OFFICE</span><h1>Office<br><span class="title-core">Core</span></h1><p>Four teams. One floor. A very different workday.</p><div class="brief"><b>ALPHA 0.1 — OFFICE01</b><p>Fixed camera. Choose the controls that feel right for you.<br>Choose a team. Last active core standing wins. Collect matching ammo crates to keep firing.</p></div><fieldset class="control-choice"><legend>VÄLJ DIN STYRNING</legend><label><input type="radio" name="controls" value="classic"><span><b>Klassisk</b><small>WASD följer kartan. Musen siktar fritt.</small></span></label><label><input type="radio" name="controls" value="aim"><span><b>Siktstyrd</b><small>W följer siktet. S backar, A/D går sidledes.</small></span></label></fieldset><button id="play">START PLAYTEST <span>↗</span></button><small>Byt när som helst i pausmenyn eller med C. Valet sparas på denna enhet.</small></div></div>`;
    this.minimap = this.el.querySelector("#minimap")!;
    this.ctx = this.minimap.getContext("2d")!;
    window.addEventListener("pointermove", (e) => {
      const c = this.el.querySelector<HTMLElement>("#crosshair")!;
      c.style.left = e.clientX + "px";
      c.style.top = e.clientY + "px";
    });
  }
  toast(text: string) {
    this.el.querySelector("#toast")!.textContent = text;
    this.toastTime = 3;
  }
  warning() {
    this.el.querySelector("#warning")!.textContent =
      "YOUR CORE IS UNDER ATTACK";
    this.warningTime = 3.5;
  }
  breachWarning(team: string) {
    this.el.querySelector("#warning")!.textContent =
      `${team} CORE · Someone is trying to breach your core!`;
    this.warningTime = 4;
  }
  damage(amount: number) {
    const e = this.el.querySelector<HTMLElement>("#damage")!;
    e.textContent = `−${amount}`;
    e.classList.remove("hit");
    void e.offsetWidth;
    e.classList.add("hit");
  }
  update(dt: number, cores: Damageable[], weapons: Weapons, player: Player) {
    let bombs = this.el.querySelector<HTMLElement>("#buster-countdowns");
    if (!bombs) { bombs = document.createElement("section"); bombs.id = "buster-countdowns"; this.el.append(bombs); }
    bombs.hidden = weapons.charges.length === 0;
    bombs.innerHTML = weapons.charges.map((charge, index) => `<div class="buster-countdown"><span>CORE BUSTER ${weapons.charges.length > 1 ? index + 1 : ""}</span><strong>${Math.max(0, charge.timer).toFixed(1)}s</strong><progress aria-label="Core buster countdown" max="25" value="${Math.max(0, charge.timer)}"></progress></div>`).join("");
    this.toastTime -= dt;
    this.warningTime -= dt;
    (this.el.querySelector("#toast") as HTMLElement).style.opacity =
      this.toastTime > 0 ? "1" : "0";
    (this.el.querySelector("#warning") as HTMLElement).style.opacity =
      this.warningTime > 0 ? "1" : "0";
    for (const c of cores) {
      this.el.querySelector("#hp-" + c.team)!.textContent = c.active ? String(c.hp) : "INACTIVE";
      (this.el.querySelector("#bar-" + c.team) as HTMLElement).style.width =
        (c.active ? c.hp / c.maxHp : 0) * 100 + "%";
    }
    this.el.querySelector("#weapon")!.textContent = WEAPONS[weapons.id].name + (weapons.id === "pistol" ? " [1]" : " [2]");
    this.el.querySelector("#ammo")!.textContent = Number.isFinite(weapons.ammo)
      ? String(weapons.ammo) + (weapons.id === "bazooka" ? ` / ${weapons.bazookaReserve}` : "")
      : "∞";
    this.el.querySelector("#mode")!.textContent = weapons.reloadRemaining > 0
      ? `RELOADING · ${weapons.reloadRemaining.toFixed(1)}s`
      : weapons.ammo === 0 ? "EMPTY · FIND AMMO" : `${weapons.id === "coreBuster" ? "LMB: PLACE · 25s FUSE" : weapons.id === "burstGun" ? "5-SHOT BURST" : WEAPONS[weapons.id].automatic ? "AUTOMATIC" : "SEMI-AUTO"} / ${WEAPONS[weapons.id].damage} DMG`;
    let inventory = this.el.querySelector("#inventory-slots");
    if (!inventory) { inventory = document.createElement("small"); inventory.id = "inventory-slots"; this.el.querySelector(".weapon")!.append(inventory); }
    inventory.textContent = `1 PISTOL · 2 ${weapons.specialWeapon ? WEAPONS[weapons.specialWeapon].name : "EMPTY"}`;
    let reload = this.el.querySelector<HTMLProgressElement>("#weapon-reload");
    if (!reload) {
      reload = document.createElement("progress");
      reload.id = "weapon-reload";
      reload.max = 5;
      reload.setAttribute("aria-label", "Bazooka reload progress");
      this.el.querySelector(".weapon")!.append(reload);
    }
    reload.hidden = weapons.reloadRemaining <= 0;
    reload.value = 5 - weapons.reloadRemaining;
    const p = player.root.position;
    const base = office01.bases.find(
      (b) => Math.abs(b.x - p.x) < 5 && Math.abs(b.z - p.z) < 5,
    );
    const room = office01.rooms.find(
      (r) => Math.abs(r.x - p.x) < r.w / 2 && Math.abs(r.z - p.z) < r.d / 2,
    );
    this.el.querySelector("#room")!.textContent = base
      ? base.team + " BASE"
      : (room?.name ?? "CORRIDORS");
    this.drawMap(p.x, p.z, player.root.rotation.y);
  }
  drawMap(x: number, z: number, a: number) {
    const c = this.ctx,
      s = 182 / office01.size;
    const px = (x: number) => 95 + x * s,
      pz = (z: number) => 95 - z * s;
    c.clearRect(0, 0, 190, 190);
    c.fillStyle = "#152b35";
    c.fillRect(4, 4, 182, 182);
    c.fillStyle = "#52666d";
    for (const r of office01.footprint)
      c.fillRect(px(r.x - r.w / 2), pz(r.z + r.d / 2), r.w * s, r.d * s);
    c.fillStyle = "#2c434e";
    for (const r of office01.rooms)
      c.fillRect(px(r.x - r.w / 2), pz(r.z + r.d / 2), r.w * s, r.d * s);
    for (const b of office01.bases) {
      c.fillStyle = TEAMS[b.team] + "66";
      c.fillRect(px(b.x - 4.5), pz(b.z + 4.5), 9 * s, 9 * s);
      c.fillStyle = TEAMS[b.team];
      c.fillRect(px(b.x) - 2, pz(b.z) - 2, 4, 4);
    }
    c.fillStyle = "#c8cfbd";
    for (const w of office01.walls)
      c.fillRect(
        px(w.x - w.w / 2),
        pz(w.z + w.d / 2),
        Math.max(w.w * s, 1),
        Math.max(w.d * s, 1),
      );
    for (const point of office01.weaponEnds) {
      c.fillStyle = "#ffd580";
      c.fillRect(px(point.x) - 2, pz(point.z) - 2, 4, 4);
    }
    c.save();
    c.translate(px(x), pz(z));
    c.rotate(a);
    c.fillStyle = "#fff6d3";
    c.beginPath();
    c.moveTo(0, -6);
    c.lineTo(4, 4);
    c.lineTo(-4, 4);
    c.closePath();
    c.fill();
    c.restore();
  }
}
