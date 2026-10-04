import { TEAMS } from "../config/game";
import { WEAPONS } from "../config/weapons";
import type { Damageable } from "../core/damageable";
import type { Weapons } from "../weapons/system";
import type { Player } from "../player/player";
import { office01 } from "../maps/office01";
export class HUD {
  private inventoryKey = "";
  private winsKey = "";
  private scoresKey = "";
  el = document.querySelector<HTMLDivElement>("#ui")!;
  toastTime = 0;
  warningTime = 0;
  minimap: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  constructor() {
    this.el.innerHTML = `<header><div class="brand"><img class="brand-logo" src="/branding/office-core-primary.webp" alt="Office Core" width="1774" height="887"><small>2 TEAMS <i></i> FIRST TO 3</small></div><div class="cores">${Object.entries(
      TEAMS,
    )
      .map(
        ([t, c]) =>
          `<div class="core" style="--team:${c}"><div><span><i></i>${t} CORE</span><b id="hp-${t}">1000</b></div><div class="track"><div id="bar-${t}"></div></div></div>`,
      )
      .join(
        "",
      )}</div><button id="pause" aria-label="Pause game">Ⅱ</button></header><aside class="location"><span>FLOOR 01 / HEADQUARTERS</span><h2 id="room">RED BASE</h2><p><i></i> Training session · No hostiles</p></aside><div id="warning" role="alert">YOUR CORE IS UNDER ATTACK</div><div id="toast"></div><div class="map"><div>OFFICE01 <span>N ↑</span></div><canvas id="minimap" width="190" height="190"></canvas></div><footer><div class="health"><span>PLAYER / RED TEAM</span><strong><span id="player-hp">100</span> <small>HP</small></strong><div class="health-track"><div class="healthline"></div></div></div><div class="weapon"><span>EQUIPPED WEAPON</span><strong id="weapon">PISTOL</strong><small id="mode">SEMI-AUTO</small></div><div class="ammo"><span>AMMUNITION</span><strong id="ammo">∞</strong></div><div class="controls"><p><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / ↑↓←→ Move &nbsp; <kbd>↖</kbd> Aim &nbsp; <kbd>LMB</kbd> Fire</p><p><kbd>C</kbd> <span id="movement-mode">W follows aim</span> &nbsp; <kbd>SPACE</kbd> Jump &nbsp; <kbd>1</kbd> Pistol <kbd>2</kbd> Special <kbd>3</kbd> Skill <kbd>E</kbd> Pick up &nbsp; <kbd>F2</kbd> Debug &nbsp; <kbd>ESC</kbd> Pause &nbsp; <button id="sound">SOUND ON</button></p></div></footer><div id="crosshair"><i></i></div><div id="damage"></div><pre id="debug"></pre><div id="overlay"><div class="pause-card"><span>WELCOME TO THE OFFICE</span><h1 class="game-logo"><picture><source media="(max-width: 600px)" srcset="/branding/office-core-characters.webp"><img src="/branding/office-core-lobby-wide.webp" alt="Office Core" width="2172" height="724" fetchpriority="high"></picture></h1><p>Two teams. Up to four players per team. One floor. A very different workday.</p><div class="brief"><b>MISSION / OFFICE01</b><p>Protect your Core. Break theirs. First team to win 3 rounds takes the match.<br>Collect weapons, ammo and med-kits. Press E beside a Core Buster to begin a 10-second disarm.</p></div><fieldset class="control-choice"><legend>VÄLJ DIN STYRNING</legend><label><input type="radio" name="controls" value="classic"><span><b>Klassisk</b><small>WASD följer kartan. Musen siktar fritt.</small></span></label><label><input type="radio" name="controls" value="aim"><span><b>Siktstyrd</b><small>W följer siktet. S backar, A/D går sidledes.</small></span></label></fieldset><button id="play">START PLAYTEST <span>↗</span></button><small>Byt när som helst i pausmenyn eller med C. Valet sparas på denna enhet.</small></div></div>`;
    this.minimap = this.el.querySelector("#minimap")!;
    this.ctx = this.minimap.getContext("2d")!;
    window.addEventListener("pointermove", (e) => {
      if (document.body.classList.contains("rc-driving")) return;
      const c = this.el.querySelector<HTMLElement>("#crosshair")!;
      c.style.left = e.clientX + "px";
      c.style.top = e.clientY + "px";
    });
  }
  toast(text: string) {
    this.el.querySelector("#toast")!.textContent = text;
    this.toastTime = 3;
  }
  warning(team = "BLUE") {
    this.el.querySelector("#warning")!.textContent =
      `${team.charAt(0) + team.slice(1).toLowerCase()} core is under attack! Protect it!`;
    this.warningTime = 3.5;
  }
  breachWarning(team: string) {
    this.el.querySelector("#warning")!.textContent =
      `${team.charAt(0) + team.slice(1).toLowerCase()} core is under attack! Protect it!`;
    this.warningTime = 4;
  }
  plantedWarning(team: string) {
    const name = team.charAt(0) + team.slice(1).toLowerCase();
    this.el.querySelector("#warning")!.textContent =
      `A Core Buster has been planted at ${name} Core! ${name} Team! Disarm IT!`;
    this.warningTime = 1;
  }
  statsStarted = false;
  showStats(started: boolean) {
    this.statsStarted = started;
    for (const id of ["team-wins", "kill-counter"]) {
      const panel = this.el.querySelector<HTMLElement>("#" + id);
      if (panel) panel.hidden = !started;
    }
  }
  wins(wins: { RED: number; BLUE: number }, round: number) {
    let panel = this.el.querySelector<HTMLElement>("#team-wins");
    if (!panel) {
      panel = document.createElement("aside");
      panel.id = "team-wins";
      this.el.append(panel);
    }
    panel.hidden = !this.statsStarted;
    const key = `${round}:${wins.RED}:${wins.BLUE}`;
    if (key === this.winsKey) return;
    this.winsKey = key;
    panel.innerHTML = `<div class="score-heading"><span>ROUND ${round}</span><small>FIRST TO 3</small></div><div class="team-score-grid">${(["RED", "BLUE"] as const).map((team) => `<div class="team-score" style="--accent:${TEAMS[team]}"><span>${team}</span><strong>${wins[team]}<small> WINS</small></strong><div class="win-pips">${[0, 1, 2].map((n) => `<i class="${n < wins[team] ? "earned" : ""}"></i>`).join("")}</div></div>`).join("")}</div>`;
  }
  scoreboard(players: { name: string; kills?: number; team?: string }[]) {
    let list = this.el.querySelector<HTMLElement>("#kill-counter");
    if (!list) {
      list = document.createElement("aside");
      list.id = "kill-counter";
      this.el.append(list);
    }
    list.hidden = !this.statsStarted || players.length === 0;
    const key = JSON.stringify(
      players.map((p) => [p.name, p.team, p.kills ?? 0]),
    );
    if (key === this.scoresKey) return;
    this.scoresKey = key;
    list.replaceChildren();
    const title = document.createElement("b");
    title.className = "score-heading";
    title.textContent = "✦ KILL LEADERBOARD";
    list.append(title);
    for (const p of [...players].sort(
      (a, b) => (b.kills ?? 0) - (a.kills ?? 0),
    )) {
      const row = document.createElement("div");
      row.className = "kill-row";
      row.style.setProperty(
        "--accent",
        p.team === "BLUE" ? TEAMS.BLUE : TEAMS.RED,
      );
      const rank = document.createElement("i");
      rank.textContent = String(list.children.length);
      const name = document.createElement("span");
      name.textContent = p.name;
      const count = document.createElement("strong");
      count.textContent = String(p.kills ?? 0);
      row.append(rank, name, count);
      list.append(row);
    }
  }
  disarm(progress?: number) {
    let panel = this.el.querySelector<HTMLElement>("#disarm-progress");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "disarm-progress";
      panel.innerHTML =
        '<b>DISARMING CORE BUSTER</b><progress max="10" aria-label="Disarm progress"></progress><span></span>';
      this.el.append(panel);
    }
    panel.hidden = progress === undefined;
    if (progress !== undefined) {
      panel.querySelector("progress")!.value = progress;
      panel.querySelector("span")!.textContent =
        `${Math.max(0, 10 - progress).toFixed(1)}s · Stay close`;
    }
  }
  damage(amount: number) {
    const e = this.el.querySelector<HTMLElement>("#damage")!;
    e.textContent = `−${amount}`;
    e.classList.remove("hit");
    void e.offsetWidth;
    e.classList.add("hit");
  }
  update(dt: number, cores: Damageable[], weapons: Weapons, player: Player) {
    const hp = Math.max(0, Math.min(100, player.hp));
    const healthValue = this.el.querySelector<HTMLElement>("#player-hp")!;
    const healthText = String(Math.ceil(hp));
    if (healthValue.textContent !== healthText) {
      healthValue.textContent = healthText;
      const bar = this.el.querySelector<HTMLElement>(".healthline")!;
      bar.style.width = `${hp}%`;
      bar.style.backgroundColor = hp <= 25 ? "#ff4545" : hp <= 50 ? "#ffba60" : "#ee7c6e";
      bar.setAttribute("aria-label", `${healthText} HP av 100`);
    }

    const warcry = this.el.querySelector<HTMLButtonElement>("#warcry");
    if (warcry) {
      warcry.hidden = !weapons.carryingCoreBuster;
      warcry.disabled = !weapons.warcryAvailable || player.hp <= 0;
      warcry.textContent =
        player.invulnerable > 0
          ? `SHIELD · ${player.invulnerable.toFixed(1)}s`
          : weapons.warcryAvailable
            ? "Q · CORE BUSTER WARCRY"
            : "WARCRY ANVÄNT";
    }
    let bombs = this.el.querySelector<HTMLElement>("#buster-countdowns");
    if (!bombs) {
      bombs = document.createElement("section");
      bombs.id = "buster-countdowns";
      this.el.append(bombs);
    }
    bombs.hidden = weapons.charges.length === 0;
    bombs.innerHTML = weapons.charges
      .map(
        (charge, index) =>
          `<div class="buster-countdown"><span>CORE BUSTER ${weapons.charges.length > 1 ? index + 1 : ""}</span><strong>${Math.max(0, charge.timer).toFixed(1)}s</strong><progress aria-label="Core buster countdown" max="25" value="${Math.max(0, charge.timer)}"></progress></div>`,
      )
      .join("");
    this.toastTime -= dt;
    this.warningTime -= dt;
    (this.el.querySelector("#toast") as HTMLElement).style.opacity =
      this.toastTime > 0 ? "1" : "0";
    (this.el.querySelector("#warning") as HTMLElement).style.opacity =
      this.warningTime > 0 ? "1" : "0";
    for (const c of cores) {
      this.el.querySelector("#hp-" + c.team)!.textContent = c.active
        ? String(c.hp)
        : "INACTIVE";
      (this.el.querySelector("#bar-" + c.team) as HTMLElement).style.width =
        (c.active ? c.hp / c.maxHp : 0) * 100 + "%";
    }
    this.el.querySelector("#weapon")!.textContent = weapons.remoteControlled
      ? "RC BOMBER · REMOTE"
      : weapons.pulseTrapSelected
        ? `${weapons.utilityKind === "rcCar" ? "RC BOMBER" : weapons.utilityKind === "superMedkit" ? "SUPER MED-KIT" : "PULSE TRAP"} [3]`
        : weapons.carryingBeacon
          ? "DEFENSIVE BEACON"
          : WEAPONS[weapons.id].name +
            (weapons.id === "pistol" ? " [1]" : " [2]");
    this.el.querySelector("#ammo")!.textContent = weapons.remoteControlled
      ? `${weapons.utilityCount} LEFT`
      : weapons.pulseTrapSelected
        ? String(weapons.utilityCount)
        : weapons.carryingBeacon
          ? "1"
          : Number.isFinite(weapons.ammo)
            ? String(weapons.ammo) +
              (weapons.id === "bazooka" ? ` / ${weapons.bazookaReserve}` : "")
            : "∞";
    this.el.querySelector("#mode")!.textContent = weapons.remoteControlled
      ? "W/S: DRIVE · MOUSE: STEER · LMB: DETONATE"
      : weapons.pulseTrapSelected
        ? weapons.utilityKind === "rcCar"
          ? "LMB: DEPLOY · W/S + MOUSE · LMB: DETONATE"
          : weapons.utilityKind === "superMedkit"
            ? "LMB: PLACE · RESTORES 100 HP"
            : "LMB: PLACE · 5m TRIGGER · 50 HP MAX"
        : weapons.carryingBeacon
          ? "LMB: PLACE · 15m RANGE · 100 HP"
          : weapons.reloadRemaining > 0
            ? `RELOADING · ${weapons.reloadRemaining.toFixed(1)}s`
            : weapons.ammo === 0
              ? "EMPTY · FIND AMMO"
              : `${weapons.id === "coreBuster" ? "LMB: PLACE · 25s FUSE" : weapons.id === "burstGun" ? "5-SHOT BURST" : WEAPONS[weapons.id].automatic ? "AUTOMATIC" : "SEMI-AUTO"} / ${WEAPONS[weapons.id].damage} DMG`;
    let inventory = this.el.querySelector<HTMLDivElement>("#inventory-slots");
    if (!inventory) {
      inventory = document.createElement("div");
      inventory.id = "inventory-slots";
      inventory.setAttribute(
        "aria-label",
        "Carried inventory and key bindings",
      );
      this.el.querySelector("footer")!.append(inventory);
    }
    const slots = [
      {
        key: "1",
        name: "PISTOL",
        icon: "pistol",
        empty: false,
        active:
          !weapons.remoteControlled &&
          !weapons.pulseTrapSelected &&
          !weapons.carryingBeacon &&
          weapons.id === "pistol",
      },
      {
        key: "2",
        name: weapons.specialWeapon
          ? WEAPONS[weapons.specialWeapon].name
          : "EMPTY",
        icon: weapons.specialWeapon ?? "empty",
        empty: !weapons.specialWeapon,
        active:
          !weapons.remoteControlled &&
          !weapons.pulseTrapSelected &&
          !weapons.carryingBeacon &&
          weapons.id !== "pistol",
      },
      {
        key: "3",
        name: `${weapons.utilityKind === "rcCar" ? "RC BOMBER" : weapons.utilityKind === "superMedkit" ? "SUPER MED-KIT" : "PULSE TRAP"} ×${weapons.utilityCount}`,
        icon:
          weapons.utilityKind === "rcCar"
            ? "car"
            : weapons.utilityKind === "superMedkit"
              ? "medkit"
              : "trap",
        empty: weapons.utilityCount <= 0 && !weapons.remoteControlled,
        active: weapons.pulseTrapSelected || weapons.remoteControlled,
      },
      ...(weapons.carryingBeacon
        ? [
            {
              key: "LMB",
              name: "BEACON",
              icon: "beacon",
              empty: false,
              active: !weapons.pulseTrapSelected,
            },
          ]
        : []),
    ];
    const key = JSON.stringify(slots);
    if (key !== this.inventoryKey) {
      this.inventoryKey = key;
      inventory.innerHTML = slots
        .map(
          (
            slot,
          ) => `<div class="inventory-slot ${slot.active ? "selected" : ""} ${slot.empty ? "empty" : ""} ${slot.icon === "trap" ? "plasma" : ""}" ${slot.active ? 'aria-current="true"' : ""}>
        <kbd>${slot.key}</kbd><svg viewBox="0 0 64 36" aria-hidden="true">${inventoryIcon(slot.icon)}</svg><b>${slot.name}</b><small>${slot.empty ? "EMPTY" : slot.active ? "EQUIPPED" : "CARRIED"}</small></div>`,
        )
        .join("");
    }
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
      pz = (z: number) => 95 - (z - office01.centerZ) * s;
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

function inventoryIcon(id: string) {
  if (id === "car")
    return '<path d="M12 18h40v10H12zM22 7h22v13H22zM44 9h8v8h-8zM15 18V5h2v13z"/><circle class="cutout" cx="21" cy="28" r="7"/><circle class="cutout" cx="46" cy="28" r="7"/><circle class="accent" cx="21" cy="28" r="3"/><circle class="accent" cx="46" cy="28" r="3"/>';
  if (id === "medkit")
    return '<path d="M10 10h44v22H10zM24 5h16v5H24z"/><path class="accent" d="M28 14h8v14h-8zm-4 3h16v8H24z"/>';
  if (id === "trap")
    return '<path d="M10 10h42v20H10z"/><path class="accent" d="M5 14h9v13H5zm12-3h32v4H17z"/><path class="cutout" d="M23 19h4v8h-4zm8 0h4v8h-4zm8 0h4v8h-4z"/>';
  if (id === "beacon")
    return '<path d="M20 6h37v9H20zM26 15h8v8h-8zM29 22l-14 11H6l18-16zm6-3 16 14h-9L29 23z"/><circle class="accent" cx="49" cy="10" r="3"/>';
  if (id === "coreBuster")
    return '<path d="M11 7h42v24H11z"/><path class="accent" d="M24 11h16v12H24z"/><path d="M19 3h26v4H19z"/>';
  if (id === "bazooka")
    return '<path d="M5 8h53v13H5zM27 21h8v10h-8z"/><path class="accent" d="M47 5h7v19h-7z"/>';
  if (id === "pistol")
    return '<path d="M8 7h43v11H30l-3 14H14l4-14H8z"/><path class="accent" d="M37 9h12v5H37z"/>';
  if (id === "empty")
    return '<path fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 4" d="M10 8h44v21H10z"/>';
  return '<path d="M5 11h54v9H38l-4 13h-9l2-13H16l-6 8H5zM27 6h16v5H27z"/><path class="accent" d="M43 12h13v6H43z"/>';
}
