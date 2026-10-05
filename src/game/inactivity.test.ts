import { test } from "node:test";
import assert from "node:assert/strict";
import { OfficeRoom } from "../../server/room";
import type { Client } from "@colyseus/core";
import { MSG } from "../../shared/protocol";
import { IDLE_CLOSE_CODE } from "../../shared/inactivity";
test("server enforces idle warning and kick in lobby and match, without reconnection grace", async () => {
  for(const started of [false,true]) {
    const room=new OfficeRoom();room.roomId="idle-test";room.onCreate({hosted:true});room.clock.clear();room.setSimulationInterval(undefined as never);room.setPatchRate(null);
    const sent: {type:unknown,data:unknown}[]=[];let code=0,reconnects=0;
    const client={sessionId:"idle",send:(type:unknown,data:unknown)=>sent.push({type,data}),leave:(value:number)=>{code=value;}} as unknown as Client;
    try {
      room.onJoin(client,{name:"Idle",team:"RED"},{uid:"idle"});room.clients.push(client);
      room.started=started;const p=room.participants.get("idle")!;p.lastActivity=1000;
      room.checkInactivity(301000);assert.equal(sent.at(-1)?.type,MSG.idle);assert.deepEqual(sent.at(-1)?.data,{remaining:120});assert.equal(code,0);
      room.checkInactivity(421000);assert.equal(code,IDLE_CLOSE_CODE);assert.equal(p.idleExpired,true);
      room.allowReconnection=async()=>{reconnects++;throw new Error("Unexpected reconnect");};room.disconnect=async()=>{};
      await room.onLeave(client,false);assert.equal(reconnects,0);assert.equal(room.participants.size,0);
    } finally {room.clients.length=0;room.onDispose();}
  }
});
