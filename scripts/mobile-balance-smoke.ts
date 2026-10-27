/** Local-only integration check of client-specific authoritative weapon profiles. */
import assert from "node:assert/strict";
import { Client, type Room } from "colyseus.js";
import { MSG } from "../shared/protocol";
process.env.PORT = "2571";
process.env.DEV_ALLOW_GUEST = "true";
process.env.GOOGLE_CLOUD_PROJECT = "officecore-ad307";
await import("../server/index");
const { OfficeRoom } = await import("../server/room");
const client = () => new Client("ws://127.0.0.1:2571", { headers: { Origin: "http://127.0.0.1:5173" } });
const connections: Room[] = [];
let exitCode = 0;
try {
  const room = [...OfficeRoom.rooms.values()][0];
  for (const mode of ["mobile", "desktop"] as const) {
    const connection = await client().joinById(room.roomId, { token: `local:balance-${mode}`, name: mode, team: mode === "mobile" ? "RED" : "BLUE", clientMode: mode });
    connection.onMessage(MSG.snapshot, () => {});
    connection.onMessage(MSG.event, () => {});
    connections.push(connection);
    assert.equal(room.participants.get(connection.sessionId)!.weapons.mobileBalance, mode === "mobile");
  }
  const mobile = connections[0];
  const weapons = room.participants.get(mobile.sessionId)!.weapons;
  const waitFor = async (wanted: boolean) => {
    for (let i = 0; i < 40 && weapons.mobileBalance !== wanted; i++) await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(weapons.mobileBalance, wanted);
  };
  mobile.send(MSG.clientMode, "desktop");
  await waitFor(false);
  mobile.send(MSG.clientMode, "mobile");
  await waitFor(true);
  mobile.send(MSG.clientMode, { mobile: false });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(weapons.mobileBalance, true);
  assert.equal(room.participants.get(connections[1].sessionId)!.weapons.mobileBalance, false);
  console.log("PASS: server joins apply independent mobile/desktop weapon profiles; reconnect profile refresh validates mode and preserves the other player");
} catch (error) { console.error(error); exitCode = 1; }
finally {
  await Promise.all(connections.map((connection) => connection.leave()));
  process.exit(exitCode);
}
