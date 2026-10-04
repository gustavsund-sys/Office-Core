import { PulseTraps } from "../game/pulseTrap";
import { Beacons } from "../game/beacon";
import { MeshBuilder, TransformNode } from "@babylonjs/core";
import { World } from "../map/builder";
import { activeMap, AMMO_AMOUNTS, type SpawnPoint } from "../maps/layout";
import { heldWeapon } from "../weapons/models";
import { WEAPONS, type WeaponId } from "../config/weapons";
import { Weapons } from "../weapons/system";
export class Pickup {
  beacons: Beacons;
  pulseTraps: PulseTraps;
  chooseRequested = false;
  nearbyWeapon?: WeaponId;
  endpoints: {
    root: TransformNode;
    id: WeaponId;
    cooldown: number;
    interval?: number;
    dropped?: boolean;
  }[] = [];
  weaponSlots: {
    drops: Pickup["endpoints"];
    cooldown: number;
    interval: number;
    selected: number;
  }[] = [];
  singleAmmoSlots: {
    drops: Pickup["ammoDrops"];
    cooldown: number;
    interval: number;
    selected: number;
  }[] = [];
  ammoDrops: {
    root: TransformNode;
    id: WeaponId;
    amount: number;
    cooldown: number;
    interval: number;
    sign: TransformNode;
  }[] = [];
  healthDrops: {
    root: TransformNode;
    type: "medkit" | "superMedkit";
    cooldown: number;
    interval: number;
  }[] = [];
  initialDelays = new Map<object, number>();
  onAmmo = (_weapons: Weapons) => {};
  constructor(public world: World) {
    this.beacons = new Beacons(world);
    this.pulseTraps = new PulseTraps(world);
    for (const spot of activeMap.spawns) {
      if (spot.type !== "medkit" && spot.type !== "superMedkit") continue;
      const superKit = spot.type === "superMedkit";
      const root = new TransformNode(spot.type, world.scene);
      root.position.set(spot.x, 0.55, spot.z);
      const accent = superKit ? "#ffc85a" : "#3ce6a0";
      const part = (
        name: string,
        x: number,
        y: number,
        z: number,
        w: number,
        h: number,
        d: number,
        color: string,
      ) => {
        const mesh = world.box(name, x, y, z, w, h, d, color, false);
        mesh.parent = root;
      };
      part("medical case", 0, 0, 0, 1.2, 0.8, 0.8, "#f1f6f5");
      part("medical case seam", 0, 0.05, 0, 1.23, 0.07, 0.83, accent);
      for (const x of [-0.22, 0.22])
        part("case handle", x, 0.5, 0, 0.08, 0.25, 0.12, "#273c43");
      part("case handle grip", 0, 0.62, 0, 0.5, 0.08, 0.12, "#273c43");
      // Bright medical crosses on the lid and both faces remain legible from above.
      part("medical cross lid", 0, 0.41, 0, 0.16, 0.025, 0.5, accent);
      part("medical cross lid", 0, 0.41, 0, 0.5, 0.025, 0.16, accent);
      for (const z of [-0.41, 0.41]) {
        part("medical cross face", 0, 0, z, 0.16, 0.5, 0.025, accent);
        part("medical cross face", 0, 0, z, 0.5, 0.16, 0.025, accent);
      }
      if (superKit) {
        root.scaling.setAll(1.25);
        for (const x of [-0.52, 0.52])
          part("super kit gold band", x, 0, 0, 0.08, 0.83, 0.83, accent);
      }
      const halo = MeshBuilder.CreateTorus(
        "medical pickup halo",
        { diameter: superKit ? 2 : 1.7, thickness: 0.07 },
        world.scene,
      );
      halo.parent = root;
      halo.position.y = -0.47;
      halo.material = world.mat(accent, true);
      halo.isPickable = false;
      const sign = world.label(
        superKit ? "SUPER MED-KIT · 100 HP" : "MED-KIT · +50 HP",
        spot.x,
        spot.z + 1.3,
        accent,
        3,
      );
      sign.parent = root;
      sign.position.x -= spot.x;
      sign.position.z -= spot.z;
      sign.position.y -= root.position.y;
      root.setEnabled(spot.initialDelay === 0);
      this.healthDrops.push({
        root,
        type: spot.type,
        cooldown: spot.initialDelay,
        interval: spot.interval,
      });
    }
    const candidates = (spawn: SpawnPoint) =>
      spawn.weapon === "random" ? spawn.pool : [spawn.weapon];
    for (const spot of activeMap.spawns.filter((p) => p.type === "ammo")) {
      const types = candidates(spot);
      const single = types.length > 1;
      const slot = single
        ? {
            drops: [] as Pickup["ammoDrops"],
            cooldown: spot.initialDelay,
            interval: spot.interval,
            selected: Math.floor(Math.random() * types.length),
          }
        : undefined;
      if (slot) this.singleAmmoSlots.push(slot);
      for (const id of types) {
        const root = new TransformNode(`${id} ammo pickup`, world.scene);
        root.position.set(spot.x, 0.4, spot.z);
        const box = world.box(
          `${id} wooden ammo crate`,
          0,
          0,
          0,
          0.95,
          0.8,
          0.95,
          "#86572f",
          false,
        );
        box.parent = root;
        // Timber slats, reinforced edges, and diagonal cross braces.
        for (const side of [-1, 1]) {
          for (let plank = 0; plank < 4; plank++) {
            const board = world.box(
              "crate wood plank",
              0,
              -0.3 + plank * 0.2,
              side * 0.48,
              0.94,
              0.185,
              0.025,
              plank % 2 ? "#a87943" : "#bd9056",
              false,
            );
            board.parent = root;
            const sideBoard = world.box(
              "crate side plank",
              side * 0.48,
              -0.3 + plank * 0.2,
              0,
              0.025,
              0.185,
              0.94,
              plank % 2 ? "#a87943" : "#bd9056",
              false,
            );
            sideBoard.parent = root;
          }
          for (const x of [-0.4, 0.4]) {
            const edge = world.box(
              "crate timber frame",
              x,
              0,
              side * 0.51,
              0.1,
              0.8,
              0.065,
              "#714827",
              false,
            );
            edge.parent = root;
          }
          const brace = world.box(
            "crate diagonal brace",
            side * 0.51,
            0,
            0,
            0.07,
            0.1,
            1.05,
            "#714827",
            false,
          );
          brace.rotation.x = side * 0.55;
          brace.parent = root;
          const badge = world.box(
            "crate bullet badge",
            0,
            0,
            side * 0.525,
            0.52,
            0.55,
            0.025,
            "#d6b47b",
            false,
          );
          badge.parent = root;
          for (const x of [-0.13, 0.13]) {
            const cartridge = world.box(
              "bullet icon cartridge",
              x,
              -0.04,
              side * 0.545,
              0.085,
              0.23,
              0.025,
              "#32291d",
              false,
            );
            cartridge.parent = root;
            const tip = MeshBuilder.CreateCylinder(
              "bullet icon tip",
              {
                height: 0.12,
                diameterTop: 0,
                diameterBottom: 0.085,
                tessellation: 8,
              },
              world.scene,
            );
            tip.position.set(x, 0.135, side * 0.545);
            tip.scaling.z = 0.3;
            tip.material = world.mat("#32291d");
            tip.parent = root;
            tip.isPickable = false;
          }
        }
        for (let plank = 0; plank < 4; plank++) {
          const lid = world.box(
            "crate lid plank",
            -0.36 + plank * 0.24,
            0.41,
            0,
            0.225,
            0.045,
            0.95,
            "#bd9056",
            false,
          );
          lid.parent = root;
        }
        const sign = heldWeapon(world, id);
        sign.parent = root;
        sign.scaling.setAll(0.65);
        sign.position.set(0, 1, 0);
        const drop = {
          root,
          id,
          amount: spot.amount || AMMO_AMOUNTS[id],
          interval: spot.interval,
          cooldown: spot.initialDelay,
          sign,
        };
        this.ammoDrops.push(drop);
        if (slot) slot.drops.push(drop);
        root.setEnabled(
          spot.initialDelay === 0 &&
            (!slot || slot.selected === slot.drops.length - 1),
        );
      }
    }
    for (const spot of activeMap.spawns.filter((p) => p.type === "weapon")) {
      const types = candidates(spot);
      const slot = {
        drops: [] as Pickup["endpoints"],
        cooldown: spot.initialDelay,
        interval: spot.interval,
        selected: Math.floor(Math.random() * types.length),
      };
      this.weaponSlots.push(slot);
      for (const id of types) {
        const root = new TransformNode(`${id} weapon drop`, world.scene);
        root.position.set(spot.x, 1, spot.z);
        const model = heldWeapon(world, id);
        model.parent = root;
        model.scaling.setAll(1.3);
        const drop = {
          root,
          id,
          cooldown: spot.initialDelay,
          interval: spot.interval,
        };
        slot.drops.push(drop);
        this.endpoints.push(drop);
        root.setEnabled(
          spot.initialDelay === 0 && slot.selected === slot.drops.length - 1,
        );
      }
      const halo = MeshBuilder.CreateTorus(
        "weapon drop halo",
        { diameter: 1.8, thickness: 0.06 },
        world.scene,
      );
      halo.position.set(spot.x, 0.08, spot.z);
      halo.material = world.mat("#ffd580", true);
      halo.isPickable = false;
      world.label(
        spot.weapon === "random" ? "RANDOM WEAPON" : WEAPONS[spot.weapon].name,
        spot.x,
        spot.z + 1,
        "#ffd580",
        2.5,
      );
    }
    for (const drop of [
      ...this.ammoDrops,
      ...this.endpoints,
      ...this.healthDrops,
      ...this.weaponSlots,
      ...this.singleAmmoSlots,
    ])
      this.initialDelays.set(drop, drop.cooldown);
  }
  reset() {
    this.beacons.reset();
    this.pulseTraps.reset();
    for (const drop of this.endpoints.filter((d) => d.dropped))
      drop.root.dispose();
    this.endpoints = this.endpoints.filter((d) => !d.dropped);
    this.weaponSlots.forEach((slot, i) => {
      slot.cooldown = activeMap.spawns.filter((p) => p.type === "weapon")[
        i
      ].initialDelay;
      slot.selected = Math.floor(Math.random() * slot.drops.length);
    });
    this.singleAmmoSlots.forEach((slot) => {
      slot.cooldown = this.initialDelays.get(slot) ?? 0;
      slot.selected = Math.floor(Math.random() * slot.drops.length);
    });
    this.ammoDrops.forEach(
      (drop) => (drop.cooldown = this.initialDelays.get(drop) ?? 0),
    );
    this.healthDrops.forEach(
      (drop, i) =>
        (drop.cooldown = activeMap.spawns.filter(
          (p) => p.type === "medkit" || p.type === "superMedkit",
        )[i].initialDelay),
    );
    this.endpoints.forEach(
      (drop) => (drop.cooldown = this.initialDelays.get(drop) ?? 0),
    );
    this.chooseRequested = false;
    this.nearbyWeapon = undefined;
    this.tickTimers(0);
  }
  tickTimers(dt: number) {
    const remaining = (value: number) => (value < 1e-7 ? 0 : value);
    for (const drop of [...this.healthDrops, ...this.ammoDrops]) {
      drop.cooldown = remaining(drop.cooldown - dt);
      drop.root.setEnabled(drop.cooldown === 0);
    }
    for (const drop of this.endpoints) {
      drop.cooldown = remaining(drop.cooldown - dt);
      drop.root.setEnabled(drop.cooldown === 0);
    }
    for (const slot of [...this.singleAmmoSlots, ...this.weaponSlots]) {
      const previous = slot.cooldown;
      slot.cooldown = remaining(slot.cooldown - dt);
      if (previous > 0 && slot.cooldown === 0)
        slot.selected = Math.floor(Math.random() * slot.drops.length);
      slot.drops.forEach((drop, index) => {
        drop.cooldown = slot.cooldown;
        drop.root.setEnabled(slot.cooldown === 0 && index === slot.selected);
      });
    }
  }

  dropCoreBuster(position: { x: number; z: number }) {
    const root = new TransformNode("dropped core buster", this.world.scene);
    root.position.set(position.x, 0.65, position.z);
    const model = heldWeapon(this.world, "coreBuster");
    model.parent = root;
    this.endpoints.push({ root, id: "coreBuster", cooldown: 0, dropped: true });
  }
  update(dt: number, time: number, weapons: Weapons, onPick: () => void) {
    this.tickTimers(dt);
    for (const drop of this.healthDrops) {
      const player = weapons.player;
      const p = player.root.position;
      if (player.hp <= 0 || player.hp >= 100 || !drop.root.isEnabled())
        continue;
      if (
        Math.hypot(p.x - drop.root.position.x, p.z - drop.root.position.z) >=
        1.1
      )
        continue;
      player.hp =
        drop.type === "superMedkit" ? 100 : Math.min(100, player.hp + 50);
      drop.cooldown = drop.interval;
      drop.root.setEnabled(false);
      onPick();
    }
    for (const drop of this.ammoDrops) {
      drop.sign.rotation.y += dt * 1.1;
      const slot = this.singleAmmoSlots.find((slot) =>
        slot.drops.includes(drop),
      );
      if (slot && !drop.root.isEnabled()) continue;
      const p = weapons.player.root.position;
      if (
        weapons.player.hp > 0 &&
        drop.id === weapons.id &&
        drop.cooldown === 0 &&
        Math.hypot(p.x - drop.root.position.x, p.z - drop.root.position.z) <
          0.85
      ) {
        weapons.addAmmo(drop.id, drop.amount);
        this.onAmmo(weapons);
        drop.cooldown = drop.interval;
        if (slot) slot.cooldown = drop.cooldown;
        drop.root.setEnabled(false);
        onPick();
      }
    }
    const position = weapons.player.root.position;
    let nearest: (typeof this.endpoints)[number] | undefined;
    let nearestDistance = 1.5;
    for (const pickup of this.endpoints) {
      if (pickup.cooldown > 0 || !pickup.root.isEnabled()) continue;
      pickup.root.rotation.y += dt;
      pickup.root.position.y = 1.1 + Math.sin(time * 2.5) * 0.13;
      const distance = Math.hypot(
        position.x - pickup.root.position.x,
        position.z - pickup.root.position.z,
      );
      if (distance < nearestDistance) {
        nearest = pickup;
        nearestDistance = distance;
      }
    }
    this.nearbyWeapon = nearest?.id;
    if (
      nearest &&
      this.chooseRequested &&
      !weapons.carryingCoreBuster &&
      weapons.player.hp > 0
    ) {
      weapons.equip(nearest.id);
      if (nearest.dropped) {
        nearest.root.dispose();
        this.endpoints.splice(this.endpoints.indexOf(nearest), 1);
      } else {
        nearest.cooldown = nearest.interval ?? 20;
        const slot = this.weaponSlots.find((slot) =>
          slot.drops.includes(nearest!),
        );
        if (slot) {
          slot.cooldown = nearest.cooldown;
          slot.drops.forEach((drop) => {
            drop.cooldown = slot.cooldown;
            drop.root.setEnabled(false);
          });
        }
        nearest.root.setEnabled(false);
      }
      onPick();
    }
    this.chooseRequested = false;
  }
}
