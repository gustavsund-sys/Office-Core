import test from "node:test";
import assert from "node:assert/strict";
import {
  NullEngine,
  Scene,
  GroundMesh,
  DirectionalLight,
  ShadowGenerator,
  Vector3,
  Ray,
} from "@babylonjs/core";
import { World } from "../map/builder";
import { Player } from "../player/player";
import { Weapons } from "../weapons/system";
import { PulseTraps, PULSE_TRAP, type TrapActor } from "./pulseTrap";
import { Damageable } from "../core/damageable";
import {
  validInput,
  type NetInput,
  type NetEvent,
} from "../../shared/protocol";
import { encodeSnapshot, decodeSnapshot } from "../network/snapshots";
class TestWorld extends World {
  override label(text: string) {
    return new GroundMesh(text, this.scene);
  }
}
function setup() {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const world = new TestWorld(
    scene,
    new ShadowGenerator(
      64,
      new DirectionalLight("sun", new Vector3(0, -1, 0), scene),
    ),
  );
  const traps = new PulseTraps(world);
  const actor = (id: string, team: "RED" | "BLUE", x = 0, z = 0): TrapActor => {
    const player = new Player(world);
    player.root.position.set(x, 0, z);
    const weapons = new Weapons(
      player,
      () => {},
      () => {},
    );
    const target = {
      get hp() {
        return player.hp;
      },
      get position() {
        return player.root.position;
      },
      canDamageFrom: () => true,
      damage: (n: number) => {
        if (player.invulnerable <= 0) player.hp = Math.max(0, player.hp - n);
      },
    };
    player.bodyMeshes.forEach((m) => {
      m.metadata = { damageable: target };
      m.isPickable = true;
      m.computeWorldMatrix(true);
    });
    return { id, team, player, weapons };
  };
  const place = (a: TrapActor) => {
    a.weapons.carryingPulseTrap = true;
    a.weapons.switchSlot(3);
    assert.equal(traps.place(a), true);
    return [...traps.traps.values()][0];
  };
  return {
    world,
    traps,
    actor,
    place,
    close: () => {
      scene.dispose();
      engine.dispose();
    },
  };
}
const input: NetInput = {
  moveX: 0,
  moveZ: 0,
  aimX: 0,
  aimZ: 10,
  fire: false,
  pressed: false,
  jump: false,
  interact: false,
  slot: 0,
};
test("Pulse Trap uses slot 3 without replacing either weapon and suppresses fire while selected", () => {
  const s = setup();
  try {
    const d = s.traps.drops[0],
      a = s.actor("owner", "RED", d.x, d.z);
    a.weapons.equip("bazooka");
    a.weapons.carryingBeacon = true;
    assert.equal(s.traps.acquire(a), true);
    assert.equal(s.traps.acquire(a), false);
    assert.equal(a.weapons.specialWeapon, "bazooka");
    assert.equal(a.weapons.id, "bazooka");
    assert.equal(a.weapons.pulseTrapSelected, true);
    a.weapons.update({ ...input, pressed: true, fire: true }, 0.1);
    assert.equal(a.weapons.rockets.length, 0);
    assert.equal(a.weapons.ammo, 3);
    a.weapons.switchSlot(1);
    assert.equal(a.weapons.pulseTrapSelected, false);
    assert.equal(a.weapons.id, "pistol");
    assert.equal(a.weapons.carryingPulseTrap, true);
    a.weapons.switchSlot(3);
    assert.equal(a.weapons.pulseTrapSelected, true);
    a.weapons.switchSlot(2);
    assert.equal(a.weapons.id, "bazooka");
    s.traps.update(PULSE_TRAP.respawn, [a]);
    assert.equal(d.cooldown, 0);
    assert.equal(validInput({ ...input, slot: 3 }), true);
    assert.equal(validInput({ ...input, slot: 4 }), false);
  } finally {
    s.close();
  }
});
test("Mine arms after one second, triggers only on enemies and detonates once with radial falloff", () => {
  const s = setup();
  try {
    const owner = s.actor("owner", "RED"),
      t = s.place(owner),
      friend = s.actor("friend", "RED", t.x, t.z),
      enemy = s.actor("enemy", "BLUE", t.x + 0.5, t.z),
      far = s.actor("far", "BLUE", t.x + 3, t.z),
      outside = s.actor("outside", "BLUE", t.x + 5.1, t.z);
    let blasts = 0;
    const hits: number[] = [];
    s.traps.onDetonate = () => blasts++;
    s.traps.onHit = (_owner, _target, n) => hits.push(n);
    s.traps.update(0.5, [owner, friend, enemy, far, outside]);
    assert.equal(enemy.player.hp, 100);
    s.traps.update(0.5, [owner, friend, enemy, far, outside]);
    assert.equal(enemy.player.hp, 50);
    assert.equal(far.player.hp, 75);
    assert.equal(friend.player.hp, 100);
    assert.equal(owner.player.hp, 100);
    assert.equal(outside.player.hp, 100);
    assert.equal(blasts, 1);
    assert.deepEqual(hits, [50, 25]);
    s.traps.update(1, [owner, enemy]);
    assert.equal(blasts, 1);
    assert.equal(s.traps.traps.size, 0);
  } finally {
    s.close();
  }
});
test("Walls block both triggering and splash; dead, disconnected and shielded enemies do not take damage", () => {
  const s = setup();
  try {
    const owner = s.actor("owner", "RED"),
      t = s.place(owner),
      behind = s.actor("behind", "BLUE", t.x + 3, t.z);
    const wall = s.world.box(
      "wall",
      t.x + 1.8,
      1,
      t.z,
      0.3,
      2,
      4,
      "#aaaabb",
      true,
    );
    wall.computeWorldMatrix(true);
    s.traps.update(1, [owner, behind]);
    assert.equal(s.traps.traps.size, 1);
    assert.equal(behind.player.hp, 100);
    const dead = s.actor("dead", "BLUE", t.x, t.z);
    dead.player.hp = 0;
    const offline = s.actor("offline", "BLUE", t.x, t.z);
    offline.connected = false;
    s.traps.update(0.1, [owner, behind, dead, offline]);
    assert.equal(s.traps.traps.size, 1);
    const exposed = s.actor("exposed", "BLUE", t.x - 0.5, t.z),
      shielded = s.actor("shield", "BLUE", t.x - 0.7, t.z);
    shielded.player.invulnerable = 2;
    s.traps.update(0.1, [owner, behind, exposed, shielded]);
    assert.equal(behind.player.hp, 100);
    assert.equal(exposed.player.hp, 50);
    assert.equal(shielded.player.hp, 100);
  } finally {
    s.close();
  }
});
test("Failed placement keeps inventory; a placed trap restores the special weapon and resets cleanly", () => {
  const s = setup();
  try {
    const a = s.actor("owner", "RED");
    a.weapons.equip("pulseGun");
    a.weapons.carryingPulseTrap = true;
    a.weapons.switchSlot(3);
    a.player.root.position.y = 1;
    assert.equal(s.traps.place(a), false);
    assert.equal(a.weapons.carryingPulseTrap, true);
    a.player.root.position.y = 0;
    const wall = s.world.box("wall", 0, 0.7, 0.6, 2, 1.4, 0.2, "#aaaaaa", true);
    wall.computeWorldMatrix(true);
    assert.equal(s.traps.place(a), false);
    assert.equal(a.weapons.carryingPulseTrap, true);
    wall.setEnabled(false);
    assert.equal(s.traps.place(a), true);
    assert.equal(a.weapons.carryingPulseTrap, false);
    assert.equal(a.weapons.pulseTrapSelected, false);
    assert.equal(a.weapons.id, "pulseGun");
    s.traps.reset();
    assert.equal(s.traps.traps.size, 0);
  } finally {
    s.close();
  }
});
test("Film reactor keeps a stable pickable hit volume and hides all decoration when its team is inactive", () => {
  const s = setup();
  try {
    const core = new Damageable(s.world, "core", 0, 0, "BLUE");
    s.world.scene.meshes.forEach((m) => m.computeWorldMatrix(true));
    const hit = s.world.scene.pickWithRay(
      new Ray(new Vector3(0, 1.2, -5), new Vector3(0, 0, 1), 10),
      (m) => m.metadata?.damageable === core,
    );
    assert.equal(hit?.hit, true);
    core.damage(50);
    assert.equal(core.hp, 950);
    core.update(0.05, 2);
    assert.equal(core.mesh.scaling.x, 1);
    assert.ok(core.energy.length > 0);
    core.setActive(false);
    assert.ok(core.visuals.every((m) => !m.isEnabled()));
    core.setActive(true);
    assert.ok(core.visuals.every((m) => m.isEnabled()));
  } finally {
    s.close();
  }
});
test("Authoritative room replicates slot 3, placed mines, damage, audio and round reset through snapshot deltas", async () => {
  const { OfficeRoom } = await import("../../server/room");
  const room = new OfficeRoom();
  room.roomId = "pulse-trap-room";
  const events: NetEvent[] = [];
  room.event = (e) => events.push(e);
  room.onCreate({ hosted: true });
  room.clock.clear();
  room.setSimulationInterval(undefined as never);
  room.setPatchRate(null);
  try {
    await room.onJoin(
      { sessionId: "red", send: () => {} } as never,
      { name: "Red", team: "RED" },
      { uid: "red" },
    );
    await room.onJoin(
      { sessionId: "blue", send: () => {} } as never,
      { name: "Blue", team: "BLUE" },
      { uid: "blue" },
    );
    room.started = true;
    const red = room.participants.get("red")!,
      blue = room.participants.get("blue")!,
      d = room.pickup.pulseTraps.drops[0];
    red.player.root.position.set(d.x, 0, d.z);
    red.weapons.equip("pulseGun");
    red.lastInput = Date.now();
    red.input = { ...input, aimX: d.x, aimZ: d.z + 10, interact: true };
    room.tick(0.01);
    const acquired = { ...room.snapshot(), seq: 1 };
    assert.equal(acquired.players.find((p) => p.id === "red")?.pulseTrap, true);
    assert.equal(red.weapons.specialWeapon, "pulseGun");
    red.input = {
      ...input,
      aimX: d.x,
      aimZ: d.z + 10,
      slot: 3,
      pressed: true,
      fire: true,
    };
    red.lastInput = Date.now();
    room.tick(0.01);
    assert.equal(room.snapshot().pulseTraps?.length, 1);
    assert.equal(red.weapons.ammo, 30);
    assert.equal(red.weapons.pulseTrapSelected, false);
    const placed = { ...room.snapshot(), seq: 2 };
    const decoded = decodeSnapshot(acquired, encodeSnapshot(acquired, placed));
    assert.deepEqual(decoded?.pulseTraps, placed.pulseTraps);
    assert.equal(
      decoded?.players.find((p) => p.id === "red")?.pulseTrap,
      false,
    );
    const t = room.snapshot().pulseTraps![0];
    blue.player.root.position.set(t.x + 0.4, 0, t.z);
    blue.player.invulnerable = 0;
    room.tick(1.1);
    assert.equal(blue.player.hp, 50);
    assert.ok(
      events.some((e) => e.kind === "explosion" && e.sound === "plasmaMine"),
    );
    assert.ok(
      events.some(
        (e) => e.kind === "damage" && e.player === "blue" && e.damage === 50,
      ),
    );
    room.completeNextRound();
    assert.equal(room.snapshot().pulseTraps?.length, 0);
    assert.ok(room.snapshot().players.every((p) => !p.pulseTrap));
  } finally {
    room.clock.clear();
    room.onDispose();
  }
});

test("Planted mine's pink parts blink and extend on the recording's four beep windows", async () => {
  const { pulseTrapPulse, PULSE_TRAP_BEEP_DURATION, PULSE_TRAP_BEEPS } =
    await import("../audio/pulseTrapRhythm");
  const { pulseTrapModel, animatePulseTrap } = await import("./pulseTrap");
  const s = setup();
  try {
    const root = pulseTrapModel(s.world);
    const parts = root.metadata.seekingParts as {
      mesh: import("@babylonjs/core").Mesh;
      axis: "x" | "z";
      rest: number;
      direction: number;
    }[];
    assert.equal(parts.length, 3);
    for (const [start, end] of PULSE_TRAP_BEEPS)
      assert.ok(pulseTrapPulse((start + end) / 2) > 0.95);
    assert.equal(pulseTrapPulse(0.2), 0);
    animatePulseTrap(root, 0.57);
    for (const p of parts) {
      assert.ok(Math.abs(p.mesh.position[p.axis] - p.rest) > 0.1);
      assert.equal(p.mesh.visibility, 1);
    }
    assert.ok(
      Math.abs(
        pulseTrapPulse(0.57 + PULSE_TRAP_BEEP_DURATION) - pulseTrapPulse(0.57),
      ) < 1e-8,
    );
    animatePulseTrap(root, 1.5);
    for (const p of parts) {
      assert.equal(p.mesh.position[p.axis], p.rest);
      assert.equal(p.mesh.visibility, 0.25);
    }
    animatePulseTrap(root, 0.57, false);
    for (const p of parts) {
      assert.equal(p.mesh.position[p.axis], p.rest);
      assert.equal(p.mesh.visibility, 0.18);
    }
  } finally {
    s.close();
  }
});

test("Beep animation follows actual playback time; mute, range and detonation stop audio", async () => {
  const { PulseTrapAudio } = await import("../audio/pulseTrap");
  const voices: FakeAudio[] = [];
  class FakeAudio {
    paused = true;
    readyState = 4;
    currentTime = 0;
    loop = false;
    preload = "";
    volume = 0;
    playbackRate = 1;
    preservesPitch = true;
    unloaded = false;
    constructor(public src: string) {
      voices.push(this);
    }
    play() {
      this.paused = false;
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
    removeAttribute() {
      this.unloaded = true;
    }
    load() {}
  }
  const previous = globalThis.Audio;
  globalThis.Audio = FakeAudio as unknown as typeof Audio;
  try {
    const audio = new PulseTrapAudio(),
      mine = {
        id: 1,
        owner: "a",
        team: "RED" as const,
        x: 0,
        z: 0,
        yaw: 0,
        arm: 0,
      };
    audio.update(0, true, { x: 0, z: 0 }, [{ ...mine, arm: 1 }]);
    assert.equal(voices.length, 0);
    audio.update(0.01, true, { x: 0, z: 0 }, [mine]);
    await Promise.resolve();
    assert.equal(voices.length, 1);
    assert.equal(voices[0].loop, true);
    voices[0].currentTime = 0.57;
    assert.equal(audio.update(0.1, true, { x: 0, z: 0 }, [mine]).get(1), 0.57);
    audio.update(0.1, true, { x: 0, z: 0 }, [{ ...mine, alert: 1 }]);
    assert.equal(voices[0].playbackRate, 3);
    assert.equal(
      audio.update(0.1, false, { x: 0, z: 0 }, [{ ...mine, alert: 1 }]).get(1),
      0.87,
    );
    audio.update(0.1, false, { x: 0, z: 0 }, [mine]);
    assert.equal(voices[0].paused, true);
    audio.update(0.1, true, { x: 30, z: 0 }, [mine]);
    assert.equal(voices[0].paused, true);
    audio.update(0.1, true, { x: 0, z: 0 }, [mine]);
    await Promise.resolve();
    assert.equal(voices[0].paused, false);
    assert.equal(audio.update(0.01, true, { x: 0, z: 0 }, []).size, 0);
    assert.equal(voices[0].paused, true);
    assert.equal(voices[0].unloaded, true);
  } finally {
    globalThis.Audio = previous;
  }
});

test("Pulse Trap detects visible opposing players outside blast range and increases urgency with proximity", () => {
  const s = setup();
  try {
    const owner = s.actor("owner", "RED"),
      t = s.place(owner),
      enemy = s.actor("enemy", "BLUE", t.x + 8, t.z);
    s.traps.update(1, [owner, enemy]);
    assert.equal(s.traps.traps.size, 1);
    assert.equal(enemy.player.hp, 100);
    const distant = t.alert!;
    assert.ok(distant > 0);
    enemy.player.root.position.x = t.x + 5.5;
    s.traps.update(0.1, [owner, enemy]);
    assert.ok(t.alert! > distant);
    assert.equal(s.traps.traps.size, 1);
    const wall = s.world.box(
      "wall",
      t.x + 2,
      1,
      t.z,
      0.3,
      2,
      4,
      "#aaaabb",
      true,
    );
    wall.computeWorldMatrix(true);
    s.traps.update(0.1, [owner, enemy]);
    assert.equal(t.alert, 0);
    wall.setEnabled(false);
    enemy.team = "RED";
    s.traps.update(0.1, [owner, enemy]);
    assert.equal(t.alert, 0);
    enemy.team = "BLUE";
    enemy.player.root.position.x = t.x + 11;
    s.traps.update(0.1, [owner, enemy]);
    assert.equal(t.alert, 0);
    enemy.player.root.position.x = t.x + 4.9;
    s.traps.update(0.1, [owner, enemy]);
    assert.equal(s.traps.traps.size, 0);
    assert.ok(enemy.player.hp < 100);
  } finally {
    s.close();
  }
});

test("starting loadout supplies chosen weapon and two deployable healing kits", async () => {
  const { applyLoadout, validLoadout } = await import("./loadout");
  const t = setup();
  try {
    const a = t.actor("a", "RED");
    assert.equal(
      validLoadout({ weapon: "pistol", skill: "superMedkit" }),
      false,
    );
    assert.equal(
      validLoadout({ weapon: "pulseGun", skill: "superMedkit" }),
      true,
    );
    applyLoadout(a.weapons as Weapons, {
      weapon: "pulseGun",
      skill: "superMedkit",
    });
    assert.equal((a.weapons as Weapons).id, "pulseGun");
    assert.equal(a.weapons.utilityCount, 2);
    a.weapons.switchSlot(3);
    assert.equal(t.traps.place(a), true);
    assert.equal(a.weapons.utilityCount, 1);
    assert.equal(a.weapons.pulseTrapSelected, true);
    const kit = [...t.traps.medkits.values()][0];
    a.player.root.position.set(kit.x, 0, kit.z);
    a.player.hp = 25;
    t.traps.update(1, [a]);
    assert.equal(a.player.hp, 100);
    assert.equal(t.traps.medkits.size, 0);
    a.player.root.position.set(4, 0, 0);
    assert.equal(t.traps.place(a), true);
    assert.equal(a.weapons.utilityCount, 0);
    assert.equal(a.weapons.pulseTrapSelected, false);
    assert.equal(t.traps.place(a), false);
    t.traps.reset();
    assert.equal(t.traps.medkits.size, 0);
  } finally {
    t.close();
  }
});
test("two starting mines consume one inventory charge per placement", async () => {
  const { applyLoadout } = await import("./loadout");
  const t = setup();
  try {
    const a = t.actor("a", "RED");
    applyLoadout(a.weapons as Weapons, {
      weapon: "machineGun",
      skill: "pulseTrap",
    });
    a.weapons.switchSlot(3);
    assert.equal(t.traps.place(a), true);
    assert.equal(a.weapons.utilityCount, 1);
    a.player.root.position.x = 4;
    assert.equal(t.traps.place(a), true);
    assert.equal(t.traps.traps.size, 2);
    assert.equal(a.weapons.utilityCount, 0);
  } finally {
    t.close();
  }
});
