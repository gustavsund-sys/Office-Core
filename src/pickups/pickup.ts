import { MeshBuilder, TransformNode } from "@babylonjs/core";
import { World } from "../map/builder";
import { office01 } from "../maps/office01";
import { heldWeapon } from "../weapons/models";
import { WEAPONS, type WeaponId } from "../config/weapons";
import { Weapons } from "../weapons/system";
export class Pickup {
  chooseRequested = false;
  nearbyWeapon?: WeaponId;
  endpoints: { root: TransformNode; id: WeaponId; cooldown: number; dropped?: boolean }[] = [];
  singleAmmoSlots: { drops: Pickup["ammoDrops"]; cooldown: number; interval: number; selected: number }[] = [];
  ammoDrops: { root: TransformNode; id: WeaponId; amount: number; cooldown: number; interval: number; sign: TransformNode }[] = [];
  constructor(public world: World) {
    const types = Object.keys(WEAPONS).filter(id => id !== "coreBuster") as WeaponId[];
    const amounts: Partial<Record<WeaponId, number>> = { pistol: 30, machineGun: 50, bazooka: 3, burstGun: 25, pulseGun: 15 };
    const spots = [
      ...office01.weaponEnds.map(point => ({ ...point, interval: 8, zone: true })),
      { x: -9, z: 0, interval: 12, single: true }, { x: 9, z: 0, interval: 12, single: true },
      { x: -36, z: 10, interval: 40 }, { x: 36, z: 10, interval: 40 },
      { x: -36, z: -10, interval: 40 }, { x: 36, z: -10, interval: 40 },
    ];
    for (const spot of spots) for (const [index, id] of types.entries()) {
      const root = new TransformNode(`${id} ammo pickup`, world.scene);
      const zone = "zone" in spot;
      const single = "single" in spot;
      root.position.set(zone ? spot.x - 6 : single ? spot.x : spot.x + (index - 2) * 1.3, 0.4, zone ? spot.z + (index - 2) * 2.8 : spot.z - 2);
      const box = world.box(`${id} wooden ammo crate`, 0, 0, 0, 0.95, 0.8, 0.95, "#86572f", false);
      box.parent = root;
      // Timber slats, reinforced edges, and diagonal cross braces.
      for (const side of [-1, 1]) {
        for (let plank = 0; plank < 4; plank++) {
          const board = world.box("crate wood plank", 0, -0.3 + plank * 0.2, side * 0.48, 0.94, 0.185, 0.025, plank % 2 ? "#a87943" : "#bd9056", false);
          board.parent = root;
          const sideBoard = world.box("crate side plank", side * 0.48, -0.3 + plank * 0.2, 0, 0.025, 0.185, 0.94, plank % 2 ? "#a87943" : "#bd9056", false);
          sideBoard.parent = root;
        }
        for (const x of [-0.4, 0.4]) {
          const edge = world.box("crate timber frame", x, 0, side * 0.51, 0.1, 0.8, 0.065, "#714827", false);
          edge.parent = root;
        }
        const brace = world.box("crate diagonal brace", side * 0.51, 0, 0, 0.07, 0.1, 1.05, "#714827", false);
        brace.rotation.x = side * 0.55;
        brace.parent = root;
        const badge = world.box("crate bullet badge", 0, 0, side * 0.525, 0.52, 0.55, 0.025, "#d6b47b", false);
        badge.parent = root;
        for (const x of [-0.13, 0.13]) {
          const cartridge = world.box("bullet icon cartridge", x, -0.04, side * 0.545, 0.085, 0.23, 0.025, "#32291d", false);
          cartridge.parent = root;
          const tip = MeshBuilder.CreateCylinder("bullet icon tip", { height: 0.12, diameterTop: 0, diameterBottom: 0.085, tessellation: 8 }, world.scene);
          tip.position.set(x, 0.135, side * 0.545);
          tip.scaling.z = 0.3;
          tip.material = world.mat("#32291d");
          tip.parent = root;
          tip.isPickable = false;
        }
      }
      for (let plank = 0; plank < 4; plank++) {
        const lid = world.box("crate lid plank", -0.36 + plank * 0.24, 0.41, 0, 0.225, 0.045, 0.95, "#bd9056", false);
        lid.parent = root;
      }
      const sign = heldWeapon(world, id);
      sign.parent = root;
      sign.scaling.setAll(0.65);
      sign.position.set(0, 1, 0);
      const drop = { root, id, amount: amounts[id]!, interval: spot.interval, cooldown: 0, sign };
      this.ammoDrops.push(drop);
      if (single) {
        if (index === 0) this.singleAmmoSlots.push({ drops: [], cooldown: 0, interval: spot.interval, selected: Math.floor(Math.random() * types.length) });
        const slot = this.singleAmmoSlots[this.singleAmmoSlots.length - 1];
        slot.drops.push(drop);
        root.setEnabled(slot.selected === index);
      }
    }
    for (const point of office01.weaponEnds) {
      world.label("AMMUNITION", point.x - 6, point.z + 8, "#ffd580", 5);
      world.label("WEAPONS · E TO CHOOSE", point.x + 6, point.z + 8, "#ffd580", 5);
      for (const [index, id] of [...types, "coreBuster" as WeaponId].entries()) {
        const root = new TransformNode(`${id} weapon drop`, world.scene);
        root.position.set(point.x + 6, 1, point.z + (index - 2) * 2.8);
        const model = heldWeapon(world, id);
        model.parent = root;
        model.scaling.setAll(1.3);
        const halo = MeshBuilder.CreateTorus("weapon drop halo", { diameter: 1.8, thickness: 0.06 }, world.scene);
        halo.position.set(root.position.x, 0.08, root.position.z);
        halo.material = world.mat("#ffd580", true);
        halo.isPickable = false;
        world.label(WEAPONS[id].name, root.position.x, root.position.z + 1, "#ffd580", 2.5);
        this.endpoints.push({ root, id, cooldown: 0 });
      }
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
    for (const slot of this.singleAmmoSlots) {
      const previous = slot.cooldown;
      slot.cooldown = Math.max(0, slot.cooldown - dt);
      if (previous > 0 && slot.cooldown === 0) {
        slot.selected = Math.floor(Math.random() * slot.drops.length);
        slot.drops.forEach(drop => drop.cooldown = 0);
      }
      slot.drops.forEach((drop, index) => drop.root.setEnabled(slot.cooldown === 0 && index === slot.selected));
    }
    for (const drop of this.ammoDrops) {
      drop.sign.rotation.y += dt * 1.1;
      const slot = this.singleAmmoSlots.find(slot => slot.drops.includes(drop));
      if (slot && !drop.root.isEnabled()) continue;
      drop.cooldown = Math.max(0, drop.cooldown - dt);
      if (!slot) drop.root.setEnabled(drop.cooldown === 0);
      const p = weapons.player.root.position;
      if (weapons.player.hp > 0 && drop.id === weapons.id && drop.cooldown === 0 && Math.hypot(p.x - drop.root.position.x, p.z - drop.root.position.z) < 0.85) {
        weapons.addAmmo(drop.id, drop.amount);
        drop.cooldown = drop.interval * (0.8 + Math.random() * 0.4);
        if (slot) slot.cooldown = drop.cooldown;
        drop.root.setEnabled(false);
        onPick();
      }
    }
    const position = weapons.player.root.position;
    let nearest: (typeof this.endpoints)[number] | undefined;
    let nearestDistance = 1.5;
    for (const pickup of this.endpoints) {
      pickup.cooldown = Math.max(0, pickup.cooldown - dt);
      pickup.root.setEnabled(pickup.cooldown === 0);
      if (pickup.cooldown > 0) continue;
      pickup.root.rotation.y += dt;
      pickup.root.position.y = 1.1 + Math.sin(time * 2.5) * 0.13;
      const distance = Math.hypot(position.x - pickup.root.position.x, position.z - pickup.root.position.z);
      if (distance < nearestDistance) { nearest = pickup; nearestDistance = distance; }
    }
    this.nearbyWeapon = nearest?.id;
    if (nearest && this.chooseRequested && !weapons.carryingCoreBuster && weapons.player.hp > 0) {
      weapons.equip(nearest.id);
      if (nearest.dropped) {
        nearest.root.dispose();
        this.endpoints.splice(this.endpoints.indexOf(nearest), 1);
      } else if (nearest.id === "coreBuster") nearest.cooldown = 20;
      onPick();
    }
    this.chooseRequested = false;
  }
}
