import { existsSync, readFileSync, statSync } from "node:fs";
import { activeMap, applyMap, parseMap } from "../src/maps/layout";
const mapPath = process.env.OFFICE_MAP_FILE ?? "server/map.json";
if (existsSync(mapPath)) {
  if (statSync(mapPath).size > 200000)
    throw new Error("Map file exceeds 200 KB");
  applyMap(parseMap(JSON.parse(readFileSync(mapPath, "utf8"))));
}
import { createServer } from "node:http";
import { Server, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { OfficeRoom } from "./room";
initializeApp({
  projectId: process.env.GOOGLE_CLOUD_PROJECT ?? "officecore-ad307",
  ...(process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.DEV_ALLOW_GUEST
    ? {}
    : { credential: applicationDefault() }),
});
const origins = (
  process.env.ALLOWED_ORIGINS ?? "http://127.0.0.1:5173,http://localhost:5173"
).split(/[;,]/);
let preparing: Promise<unknown> | undefined;
async function ensureLobby() {
  if (OfficeRoom.rooms.size > 0) return;
  if (!preparing)
    preparing = matchMaker
      .createRoom("office", { hosted: true })
      .finally(() => (preparing = undefined));
  await preparing;
}
const http = createServer(async (req, res) => {
  if (req.url === "/map" && req.method === "GET") {
    const origin = req.headers.origin;
    if (origin && !origins.includes(origin)) {
      res.writeHead(403);
      res.end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin ?? origins[0],
      Vary: "Origin",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(activeMap));
    return;
  }
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        activeRooms: OfficeRoom.active,
        performance: [...OfficeRoom.measurements].map((m) => m.report()),
      }),
    );
    return;
  }
  if (req.url === "/rooms" && req.method === "GET") {
    const origin = req.headers.origin;
    if (origin && !origins.includes(origin)) {
      res.writeHead(403);
      res.end();
      return;
    }
    res.setHeader("Access-Control-Allow-Origin", origin ?? origins[0]);
    res.setHeader("Vary", "Origin");
    res.setHeader("Cache-Control", "no-store");
    try {
      await ensureLobby();
      const rooms = [...OfficeRoom.rooms.values()].map((room) => ({
        id: room.roomId,
        name: "OFFICE01",
        players: [...room.participants.values()].map((p) => ({
          name: p.name,
          team: p.team,
        })),
        capacity: room.maxClients,
        started: room.started || room.locked,
      }));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ rooms }));
    } catch {
      res.writeHead(503);
      res.end(JSON.stringify({ error: "Lobby unavailable" }));
    }
    return;
  }
  res.writeHead(404);
  res.end();
});
matchMaker.controller.exposedMethods = ["joinById", "reconnect"];
matchMaker.controller.DEFAULT_CORS_HEADERS["Access-Control-Allow-Origin"] =
  origins[0];
matchMaker.controller.getCorsHeaders = (req) => ({
  "Access-Control-Allow-Origin": origins.includes(req.headers.origin ?? "")
    ? req.headers.origin!
    : origins[0],
  Vary: "Origin",
});
const server = new Server({
  transport: new WebSocketTransport({
    server: http,
    maxPayload: 16384,
    verifyClient: (info, done) =>
      done(origins.includes(info.origin), 403, "Origin rejected"),
  }),
});
server.define("office", OfficeRoom);
await server.listen(Number(process.env.PORT ?? 2567));
await ensureLobby();
console.info("server started");
