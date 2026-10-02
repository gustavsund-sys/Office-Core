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
const http = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", activeRooms: OfficeRoom.active }));
  }
});
const origins = (
  process.env.ALLOWED_ORIGINS ?? "http://127.0.0.1:5173,http://localhost:5173"
).split(/[;,]/);
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
console.info("server started");
