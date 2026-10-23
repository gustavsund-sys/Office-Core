import { deathDescriptionParts, type CombatDeath } from "./combatFeed";
import { updateBombCountdowns } from "./bombCountdowns";
import { TEAMS } from "../config/game";
import { WEAPONS, type WeaponId } from "../config/weapons";
import type { Damageable } from "../core/damageable";
import type { Weapons } from "../weapons/system";
import type { Player } from "../player/player";
import { office01 } from "../maps/office01";
export class HUD {
  private combatFeed?: HTMLElement;
  private inventoryKey = "";
  private hadBossKey = false;
  private bossKeyReceiptRemaining = 0;
  onBossKeyReceived: () => void = () => {};
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
          `<div class="core" data-team="${t}" style="--team:${c};--accent:${c}"><div class="core-health"><div><span><i></i>${t} CORE</span><b id="hp-${t}">1000</b></div><div class="track"><div id="bar-${t}"></div></div></div><div class="core-result" id="wins-${t}" aria-label="${t} round wins"><strong>0<small>WINS</small></strong><div class="win-pips"><i></i><i></i><i></i></div></div></div>`,
      )
      .join(
        "",
      )}<small id="core-series">ROUND 1 · FIRST TO 3</small></div><button id="pause" aria-label="Pause game">Ⅱ</button></header><aside class="location"><span>FLOOR 01 / HEADQUARTERS</span><h2 id="room">RED BASE</h2><p><i></i> Training session · No hostiles</p></aside><div id="warning" role="alert">YOUR CORE IS UNDER ATTACK</div><div id="toast"></div><div class="map"><div>OFFICE01 <span>N ↑</span></div><canvas id="minimap" width="190" height="190"></canvas></div><footer><div class="health"><span>PLAYER / RED TEAM</span><strong><span id="player-hp">100</span> <small>HP</small></strong><div class="health-track"><div class="healthline"></div></div></div><div class="shield-vitals"><span>SHIELD</span><strong id="player-shield">0</strong><div class="shield-track"><div id="shield-fill"></div></div><label>SPRINT <span id="sprint-time">4.0s</span></label><progress id="sprint-energy" max="4" value="4" aria-label="Sprint energy"></progress></div><div class="weapon"><span>EQUIPPED WEAPON</span><strong id="weapon">PISTOL</strong><small id="mode">SEMI-AUTO</small></div><div class="ammo"><span>AMMUNITION</span><strong id="ammo">∞</strong></div></footer><div id="crosshair"><i></i></div><div id="damage"></div><pre id="debug"></pre><div id="overlay"><div class="pause-card"><span>WELCOME TO THE OFFICE</span><h1 class="game-logo"><picture><source media="(max-width: 600px)" srcset="/branding/office-core-characters.webp"><img src="/branding/office-core-lobby-wide.webp" alt="Office Core" width="2172" height="724" fetchpriority="high"></picture></h1><p>Two teams. Up to four players per team. One floor. A very different workday.</p><div class="brief"><b>MISSION / OFFICE01</b><p>Protect your Core. Break theirs. First team to win 3 rounds takes the match.<br>Collect weapons, ammo and med-kits. Press E beside a Core Buster to begin a 10-second disarm.</p></div><fieldset class="control-choice"><legend>VÄLJ DIN STYRNING</legend><label><input type="radio" name="controls" value="classic"><span><b>Klassisk</b><small>WASD följer kartan. Musen siktar fritt.</small></span></label><label><input type="radio" name="controls" value="aim"><span><b>Siktstyrd</b><small>W följer siktet. S backar, A/D går sidledes.</small></span></label></fieldset><button id="sound" class="pause-sound">SOUND ON</button><button id="play">START PLAYTEST <span>↗</span></button><small>Byt när som helst i pausmenyn eller med C. Valet sparas på denna enhet.</small></div></div>`;
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
    const key = `${round}:${wins.RED}:${wins.BLUE}`;
    if (key === this.winsKey) return;
    this.winsKey = key;
    for (const team of ["RED", "BLUE"] as const) {
      const result = this.el.querySelector(`#wins-${team}`)!;
      result.setAttribute("aria-label", `${team}: ${wins[team]} of 3 round wins`);
      result.innerHTML = `<strong>${wins[team]}<small>WINS</small></strong><div class="win-pips">${[0, 1, 2].map(n => `<i class="${n < wins[team] ? "earned" : ""}"></i>`).join("")}</div>`;
    }
    this.el.querySelector("#core-series")!.textContent = `ROUND ${round} · FIRST TO 3`;
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
    if (!this.combatFeed) {
      this.combatFeed = document.createElement("section");
      this.combatFeed.id = "combat-feed";
      this.combatFeed.setAttribute("aria-label", "Recent eliminations");
      this.combatFeed.setAttribute("aria-live", "polite");
      const heading = document.createElement("b");
      heading.className = "score-heading";
      heading.textContent = "RECENT EVENTS";
      const events = document.createElement("ol");
      this.combatFeed.append(heading, events);
    }
    list.append(this.combatFeed);
  }
  combatDeath(event: CombatDeath) {
    if (!this.combatFeed) this.scoreboard([]);
    const events = this.combatFeed!.querySelector("ol")!;
    const row = document.createElement("li");
    const text = document.createElement("span");
    const [prefix, weapon, suffix] = deathDescriptionParts(event);
    text.append(document.createTextNode(prefix));
    if (weapon && event.source) {
      const item = document.createElement("span");
      item.className = "event-weapon";
      item.append(document.createTextNode(weapon));
      const icon = document.createElement("img");
      icon.src = `/ui/equipment/${event.source}.png`;
      icon.alt = "";
      icon.className = "event-weapon-icon";
      item.append(icon);
      text.append(item);
    }
    text.append(document.createTextNode(suffix));
    row.append(text);
    events.prepend(row);
    while (events.children.length > 5) events.lastElementChild!.remove();
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
      bar.style.backgroundColor =
        hp <= 25 ? "#ff4545" : hp <= 50 ? "#ffba60" : "#ee7c6e";
      bar.setAttribute("aria-label", `${healthText} HP av 100`);
    }

    this.el.querySelector("#player-shield")!.textContent = String(
      Math.ceil(player.shield),
    );
    this.el.querySelector<HTMLElement>("#shield-fill")!.style.width =
      `${player.shield}%`;
    this.el.querySelector<HTMLProgressElement>("#sprint-energy")!.value =
      player.stamina;
    this.el.querySelector("#sprint-time")!.textContent = player.injured
      ? "INJURED"
      : player.sprintExhausted
        ? "RECOVERING"
        : `${player.stamina.toFixed(1)}s`;
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
    updateBombCountdowns(bombs, weapons.charges);
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
              (weapons.id !== "coreBuster" ? ` / ${weapons.reserve}` : "")
            : "∞";
    this.el.querySelector("#mode")!.textContent = weapons.remoteControlled
      ? "W/S: DRIVE · A/D: STEER · E: DETONATE"
      : weapons.pulseTrapSelected
        ? weapons.utilityKind === "rcCar"
          ? "LMB: DEPLOY · WASD: DRIVE · E: DETONATE"
          : weapons.utilityKind === "superMedkit"
            ? "LMB / E: PLACE · RESTORES 100 HP"
            : "LMB / E: PLACE · 5m TRIGGER · 50 HP MAX"
        : weapons.carryingBeacon
          ? "LMB / E: PLACE · 15m RANGE · 100 HP"
          : weapons.reloadRemaining > 0
            ? `RELOADING · ${weapons.reloadRemaining.toFixed(1)}s`
            : weapons.ammo === 0
              ? weapons.reserve > 0
                ? "EMPTY · R TO RELOAD"
                : "EMPTY · FIND AMMO"
              : `${weapons.id === "coreBuster" ? "LMB / E: PLACE · 25s FUSE" : weapons.id === "burstGun" ? "5-SHOT BURST" : WEAPONS[weapons.id].automatic ? "AUTOMATIC" : "SEMI-AUTO"} / ${WEAPONS[weapons.id].damage} DMG`;
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
              ? "superMedkit"
              : "trap",
        empty: weapons.utilityCount <= 0 && !weapons.remoteControlled,
        active: weapons.pulseTrapSelected || weapons.remoteControlled,
      },
      {
        key: "4",
        name: "MED-KIT",
        icon: "medkit",
        empty: !player.medkit,
        active: false,
      },
      {
        key: "5", name: "BOSS KEY", icon: "bossKey",
        empty: !player.bossLookoutKey, active: false,
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
    if (player.bossLookoutSelected) for (const slot of slots) slot.active = slot.icon === "bossKey";
    const key = JSON.stringify(slots);
    if (key !== this.inventoryKey) {
      this.inventoryKey = key;
      inventory.innerHTML = slots
        .map(
          (
            slot,
          ) => `<div data-weapon="${slot.icon}" class="inventory-slot ${slot.active ? "selected" : ""} ${slot.empty ? "empty" : ""} ${slot.icon === "trap" ? "plasma" : ""}" ${slot.active ? 'aria-current="true"' : ""}>
        <kbd>${slot.key}</kbd>${slot.icon === "empty" ? '<span class="empty-equipment">—</span>' : `<img class="equipment-icon" src="/ui/equipment/${slot.icon}.${slot.icon === "bossKey" ? "svg" : "png"}" alt="" draggable="false">`}<b>${slot.name}</b><small>${slot.empty ? "EMPTY" : slot.active ? "EQUIPPED" : "CARRIED"}</small><progress class="inventory-reload" hidden aria-label="Reload progress"></progress></div>`,
        )
        .join("");
    }
    const receivedBossKey = player.bossLookoutKey && !this.hadBossKey;
    this.hadBossKey = player.bossLookoutKey;
    if (receivedBossKey) {
      this.bossKeyReceiptRemaining = 3;
      this.onBossKeyReceived();
    } else this.bossKeyReceiptRemaining = Math.max(0, this.bossKeyReceiptRemaining - dt);
    for (const slot of Array.from(
      inventory.querySelectorAll<HTMLElement>("[data-weapon]"),
    )) {
      if (slot.dataset.weapon === "bossKey") {
        slot.classList.toggle("boss-key-received", player.bossLookoutKey && this.bossKeyReceiptRemaining > 0);
        const bar = slot.querySelector<HTMLProgressElement>("progress")!;
        bar.hidden = false;
        bar.max = 10;
        bar.value = player.bossLookoutKills ?? 0;
        bar.setAttribute("aria-label", "Enemy kills to obtain Boss Key");
        const label = slot.querySelector("small")!;
        label.classList.add("boss-key-progress-label");
        label.textContent = player.bossLookoutKey && this.bossKeyReceiptRemaining > 0
          ? "KEY RECEIVED!"
          : player.bossLookoutKey
          ? `KEY READY · ${player.bossLookoutActive ? "IN USE" : `${player.bossLookoutAmmo ?? 100} RDS`}`
          : `${player.bossLookoutKills ?? 0}/10 kills to obtain`;
        continue;
      }
      const state = weapons.reloads[slot.dataset.weapon as WeaponId];
      const progress = slot.querySelector<HTMLProgressElement>("progress")!;
      progress.hidden = !state;
      if (state) {
        progress.max = state.duration;
        progress.value = state.duration - state.remaining;
        slot.querySelector("small")!.textContent =
          `RELOAD · ${state.remaining.toFixed(1)}s`;
      } else {
        const selected = slot.classList.contains("selected");
        slot.querySelector("small")!.textContent = slot.classList.contains(
          "empty",
        )
          ? "EMPTY"
          : selected
            ? "EQUIPPED"
            : "CARRIED";
      }
    }
    let reload = this.el.querySelector<HTMLProgressElement>("#weapon-reload");
    if (!reload) {
      reload = document.createElement("progress");
      reload.id = "weapon-reload";
      reload.max = 5;
      reload.setAttribute("aria-label", "Weapon reload progress");
      this.el.querySelector(".weapon")!.append(reload);
    }
    reload.hidden = weapons.reloadRemaining <= 0;
    reload.max = weapons.reloadDuration;
    reload.value = weapons.reloadDuration - weapons.reloadRemaining;
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

