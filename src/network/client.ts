import { Client, type Room } from "colyseus.js";
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, connectAuthEmulator } from "firebase/auth";
import {
  MSG,
  type Snapshot,
  type NetEvent,
  type NetInput,
  type AvailableRoom,
} from "../../shared/protocol";
const app = initializeApp({
  apiKey: "AIzaSyAkgVLtGKDqojp40IdtA4ewaER_HyoIBRk",
  authDomain: "officecore-ad307.firebaseapp.com",
  projectId: "officecore-ad307",
  storageBucket: "officecore-ad307.firebasestorage.app",
  messagingSenderId: "1077868887179",
  appId: "1:1077868887179:web:f93a23810f31e7d89fa88e",
});
const auth = getAuth(app);
if (import.meta.env.VITE_AUTH_EMULATOR_URL)
  connectAuthEmulator(auth, import.meta.env.VITE_AUTH_EMULATOR_URL);
export class Multiplayer {
  endpoint = import.meta.env.VITE_GAME_SERVER_URL || "ws://127.0.0.1:2567";
  client = new Client(this.endpoint);
  async rooms(): Promise<AvailableRoom[]> {
    const url = new URL(this.endpoint);
    url.protocol = url.protocol === "wss:" ? "https:" : "http:";
    url.pathname = "/rooms";
    const response = await fetch(url);
    if (!response.ok) throw new Error("Serverns lobby kunde inte hämtas.");
    return (await response.json()).rooms;
  }
  room?: Room;
  connected = false;
  rtt = 0;
  nextPing = 0;
  snapshot?: Snapshot;
  history: { at: number; snapshot: Snapshot }[] = [];
  onSnapshot: (snapshot: Snapshot) => void = () => {};
  onEvent: (event: NetEvent) => void = () => {};
  onStatus: (text: string) => void = () => {};
  async connect(name: string, team: string, id: string) {
    this.onStatus("Ansluter…");
    const user = auth.currentUser ?? (await signInAnonymously(auth)).user;
    const options = { token: await user.getIdToken(), name, team };
    const room = await this.client.joinById(id, options);
    this.bind(room);
  }
  bind(room: Room) {
    this.history = [];
    this.room = room;
    this.connected = true;
    this.onStatus("ANSLUTEN TILL OFFICE01");
    room.onMessage(MSG.snapshot, (snapshot: Snapshot) => {
      this.history.push({ at: performance.now(), snapshot });
      if (this.history.length > 12) this.history.shift();
      this.snapshot = snapshot;
      this.onSnapshot(snapshot);
    });
    room.onMessage(MSG.ping, (stamp: number) => {
      this.rtt = Math.max(0, Date.now() - stamp);
    });
    room.onMessage(MSG.event, (event: NetEvent) => this.onEvent(event));
    room.onError((_code, message) =>
      this.onStatus(message || "Anslutningsfel"),
    );
    room.onLeave(async (code) => {
      this.connected = false;
      if (code === 1000) return;
      this.onStatus("Anslutningen bröts. Återansluter…");
      for (let attempt = 0; attempt < 8; attempt++) {
        await new Promise((resolve) =>
          setTimeout(resolve, 500 + attempt * 200),
        );
        try {
          this.bind(await this.client.reconnect(room.reconnectionToken));
          return;
        } catch {
          /* The server may still be handling the disconnect. */
        }
      }
      this.onStatus(
        "Återanslutning misslyckades. Ladda om för att ansluta igen.",
      );
    });
  }
  send(input: NetInput) {
    if (this.connected) {
      this.room?.send(MSG.input, input);
      if (Date.now() >= this.nextPing) {
        this.nextPing = Date.now() + 3000;
        this.room?.send(MSG.ping, Date.now());
      }
    }
  }
}
