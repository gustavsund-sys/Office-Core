import test from "node:test";
import assert from "node:assert/strict";
import { preparationStatus, gamePhase } from "./flow";
import { OfficeRoom } from "../../server/room";
test("preparation requires two teams, every loadout, and connected players", () => {
  const a = { team: "RED", connected: true, loadout: {} },
    b = { team: "BLUE", connected: true, loadout: {} };
  assert.equal(preparationStatus([]), "cancel");
  assert.equal(preparationStatus([a]), "cancel");
  assert.equal(preparationStatus([a, b]), "ready");
  assert.equal(preparationStatus([a, { ...b, connected: false }]), "waiting");
  assert.equal(preparationStatus([a, { ...b, loadout: undefined }]), "waiting");
  assert.equal(gamePhase({ started: false, preparing: true }), "equipment");
  assert.equal(
    gamePhase({ started: true, winner: "RED", countdown: 3 }),
    "countdown",
  );
  assert.equal(gamePhase({ started: true, seriesWinner: "BLUE" }), "seriesEnd");
});
test("removing an unready participant starts remaining ready teams", async () => {
  const room = new OfficeRoom();
  room.roomId = "preparation-test";
  room.onCreate({ hosted: true });
  room.clock.clear();
  room.setSimulationInterval(undefined as never);
  room.setPatchRate(null);
  room.lock = async () => {};
  try {
    const clients = ["a", "b", "c"].map((sessionId) => ({
      sessionId,
      send() {},
    }));
    for (let i = 0; i < 3; i++)
      await room.onJoin(
        clients[i] as any,
        { name: clients[i].sessionId, team: i === 1 ? "BLUE" : "RED" },
        { uid: clients[i].sessionId },
      );
    room.preparing = true;
    for (const id of ["a", "b"])
      room.participants.get(id)!.loadout = {
        weapon: "machineGun",
        skill: "pulseTrap",
      };
    await room.onLeave(clients[2] as any, true);
    assert.equal(room.started, true);
    assert.equal(room.preparing, false);
    assert.equal(room.participants.get("a")!.weapons.utilityCount, 2);
  } finally {
    room.onDispose();
    room.clock.clear();
  }
});
test("leaving the only opposing team cancels preparation", async () => {
  const room = new OfficeRoom();
  room.roomId = "cancel-test";
  room.onCreate({ hosted: true });
  room.clock.clear();
  room.setSimulationInterval(undefined as never);
  room.setPatchRate(null);
  try {
    const a = { sessionId: "a", send() {} },
      b = { sessionId: "b", send() {} };
    await room.onJoin(a as any, { name: "A", team: "RED" }, { uid: "a" });
    await room.onJoin(b as any, { name: "B", team: "BLUE" }, { uid: "b" });
    room.preparing = true;
    await room.onLeave(b as any, true);
    assert.equal(room.started, false);
    assert.equal(room.preparing, false);
  } finally {
    room.onDispose();
    room.clock.clear();
  }
});
