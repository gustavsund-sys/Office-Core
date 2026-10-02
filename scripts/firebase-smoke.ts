import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, signInAnonymously, deleteUser } from "firebase/auth";
import { Client } from "colyseus.js";
const app = initializeApp(
  {
    apiKey: "AIzaSyAkgVLtGKDqojp40IdtA4ewaER_HyoIBRk",
    projectId: "officecore-ad307",
  },
  "smoke",
);
const user = (await signInAnonymously(getAuth(app))).user;
const token = await user.getIdToken();
try {
  const client = new Client(
    process.env.GAME_SERVER_URL ?? "ws://127.0.0.1:2567",
    {
      headers: { Origin: process.env.GAME_ORIGIN ?? "http://127.0.0.1:5173" },
    },
  );
  const url = new URL(process.env.GAME_SERVER_URL ?? "ws://127.0.0.1:2567");
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = "/rooms";
  const rooms = (
    await (
      await fetch(url, {
        headers: { Origin: process.env.GAME_ORIGIN ?? "http://127.0.0.1:5173" },
      })
    ).json()
  ).rooms;
  const room = await client.joinById(rooms[0].id, {
    token,
    name: "Auth smoke",
    team: "RED",
  });
  room.onMessage("snapshot", () => {});
  room.onMessage("event", () => {});
  await room.leave();
  console.log(
    "PASS: Firebase anonymous identity and server token verification",
  );
} finally {
  await deleteUser(user);
  await deleteApp(app);
}
