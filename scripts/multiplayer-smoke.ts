import assert from "node:assert/strict";
import { initializeApp, deleteApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  deleteUser,
  type User,
} from "firebase/auth";
import { Client, type Room } from "colyseus.js";
import { MSG, type Snapshot } from "../shared/protocol";
const endpoint = process.env.GAME_SERVER_URL ?? "ws://127.0.0.1:2567";
const identities: { app: FirebaseApp; user: User }[] = [];
const identity = async (name: string) => {
  if (!process.env.GAME_SERVER_URL || process.env.LOCAL_AUTH === "true")
    return `local:${name}`;
  const app = initializeApp(
    {
      apiKey: "AIzaSyAkgVLtGKDqojp40IdtA4ewaER_HyoIBRk",
      projectId: "officecore-ad307",
    },
    name,
  );
  const user = (await signInAnonymously(getAuth(app))).user;
  identities.push({ app, user });
  return user.getIdToken();
};
const client = () =>
  new Client(endpoint, {
    headers: { Origin: process.env.GAME_ORIGIN ?? "http://127.0.0.1:5173" },
  });
const wait = (room: Room, predicate: (s: Snapshot) => boolean) =>
  new Promise<Snapshot>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Snapshot timed out")),
      10000,
    );
    const remove = room.onMessage(MSG.snapshot, (s: Snapshot) => {
      if (predicate(s)) {
        clearTimeout(timer);
        remove();
        resolve(s);
      }
    });
  });
try {
  const lobbyURL = new URL(endpoint);
  lobbyURL.protocol = lobbyURL.protocol === "wss:" ? "https:" : "http:";
  lobbyURL.pathname = "/rooms";
  const available = async () => {
    const data = await (
      await fetch(lobbyURL, {
        headers: { Origin: process.env.GAME_ORIGIN ?? "http://127.0.0.1:5173" },
      })
    ).json();
    return data.rooms as { id: string; started: boolean; players: unknown[] }[];
  };
  const initial = (await available()).find((r) => !r.started)!;
  assert.ok(initial, "Server supplies a lobby");
  const a = await client().joinById(initial.id, {
    token: await identity("a"),
    name: "Alice",
    team: "RED",
  });
  a.onMessage(MSG.event, () => {});
  const b = await client().joinById(a.roomId, {
    token: await identity("b"),
    name: "Bob",
    team: "BLUE",
  });
  b.onMessage(MSG.event, () => {});
  b.onMessage(MSG.snapshot, () => {});
  const lobby = await wait(a, (s) => s.players.length === 2);
  assert.equal(lobby.cores.filter((c) => c.active).length, 2);
  b.send(MSG.profile, "Bobby");
  const renamed = await wait(a, (s) =>
    s.players.some((p) => p.name === "Bobby"),
  );
  assert.equal(renamed.players.length, 2);
  b.send(MSG.team, "GREEN");
  await wait(a, (s) => s.players.some((p) => p.team === "GREEN"));
  a.send(MSG.start);
  const started = await wait(a, (s) => s.started);
  a.send(MSG.input, {
    moveX: NaN,
    moveZ: Infinity,
    aimX: 0,
    aimZ: 0,
    fire: false,
    pressed: false,
    jump: false,
    interact: false,
    slot: 0,
  });
  const safe = await wait(a, (s) =>
    s.players.every((p) => Number.isFinite(p.x) && Number.isFinite(p.z)),
  );
  assert.equal(safe.players.length, 2);
  const before = started.players.find((p) => p.id === a.sessionId)!;
  let seq = 0;
  a.onMessage(MSG.ping, () => {});
  a.send(MSG.ping, Date.now());
  const interval = setInterval(
    () =>
      a.send(MSG.input, {
        seq: seq++,
        moveX: 0,
        moveZ: 1,
        aimX: 0,
        aimZ: 0,
        fire: false,
        pressed: false,
        jump: false,
        interact: false,
        slot: 0,
      }),
    33,
  );
  const moved = await wait(
    a,
    (s) => s.players.find((p) => p.id === a.sessionId)!.z > before.z + 0.5,
  );
  clearInterval(interval);
  assert.ok(
    moved.players.find((p) => p.id === a.sessionId)!.ack >= 0,
    "Server acknowledges prediction inputs",
  );
  assert.equal(moved.players.find((p) => p.id === b.sessionId)!.hp, 100);
  const shotEvent = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Authoritative shot event timed out")),
      5000,
    );
    const remove = b.onMessage(
      MSG.event,
      (event: { kind: string; player?: string; inputSeq?: number }) => {
        if (event.kind === "trace" && event.player === a.sessionId) {
          assert.ok(Number.isSafeInteger(event.inputSeq));
          clearTimeout(timeout);
          remove();
          resolve();
        }
      },
    );
  });
  a.send(MSG.input, {
    seq: seq++,
    moveX: 0,
    moveZ: 0,
    aimX: 0,
    aimZ: 0,
    fire: true,
    pressed: true,
    jump: false,
    interact: false,
    slot: 0,
  });
  await shotEvent;
  const only = await available();
  assert.equal(only.length, 1);
  assert.equal(only[0].id, a.roomId);
  assert.equal(only[0].started, true);
  await assert.rejects(() => client().create("office", {}));
  const token = b.reconnectionToken;
  await new Promise<void>((resolve) => {
    b.onLeave(() => resolve());
    b.connection.close(4001);
  });
  await new Promise((resolve) => setTimeout(resolve, 250));
  const reconnected = await client().reconnect(token);
  reconnected.onMessage(MSG.event, () => {});
  reconnected.onMessage(MSG.snapshot, () => {});
  assert.equal(reconnected.sessionId, b.sessionId);
  await Promise.all([a.leave(), reconnected.leave()]);
  let reset = await available();
  for (let attempt = 0; reset[0]?.id === a.roomId && attempt < 15; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    reset = await available();
  }
  assert.equal(reset.length, 1);
  assert.notEqual(reset[0].id, a.roomId);
  assert.equal(reset[0].started, false);
  assert.equal(reset[0].players.length, 0);
  console.log(
    "PASS: single server lobby, two clients, live name/Core choice, movement, malformed input, reconnect, denied room creation, lobby reset",
  );
} finally {
  for (const { app, user } of identities) {
    await deleteUser(user);
    await deleteApp(app);
  }
}
