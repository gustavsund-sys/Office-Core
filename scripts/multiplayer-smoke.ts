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
  if (!process.env.GAME_SERVER_URL) return `local:${name}`;
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
  const a = await client().create("office", {
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
  const interval = setInterval(
    () =>
      a.send(MSG.input, {
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
  assert.equal(moved.players.find((p) => p.id === b.sessionId)!.hp, 100);
  const c = await client().create("office", {
    token: await identity("c"),
    name: "Carol",
    team: "GREEN",
  });
  c.onMessage(MSG.event, () => {});
  const isolated = await wait(c, (s) => s.players.length === 1);
  assert.equal(isolated.started, false);
  assert.notEqual(c.roomId, a.roomId);
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
  await Promise.all([a.leave(), reconnected.leave(), c.leave()]);
  console.log(
    "PASS: two clients, lobby, active cores, server movement, malformed input, reconnect, separate rooms",
  );
} finally {
  for (const { app, user } of identities) {
    await deleteUser(user);
    await deleteApp(app);
  }
}
