import { Client, type Room } from "colyseus.js";
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, connectAuthEmulator } from "firebase/auth";
import {
  MSG,
  type Snapshot,
  type NetEvent,
  type NetInput,
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
  client = new Client(
    import.meta.env.VITE_GAME_SERVER_URL || "ws://127.0.0.1:2567",
  );
  room?: Room;
  connected = false;
  snapshot?: Snapshot;
  onSnapshot: (snapshot: Snapshot) => void = () => {};
  onEvent: (event: NetEvent) => void = () => {};
  onStatus: (text: string) => void = () => {};
  async connect(name: string, team: string, id?: string) {
    this.onStatus("Ansluter…");
    const user = auth.currentUser ?? (await signInAnonymously(auth)).user;
    const options = { token: await user.getIdToken(), name, team };
    const room = id
      ? await this.client.joinById(id, options)
      : await this.client.create("office", options);
    this.bind(room);
  }
  bind(room: Room) {
    this.room = room;
    this.connected = true;
    this.onStatus(`RUM ${room.roomId} · dela rumskoden med dina vänner`);
    room.onMessage(MSG.snapshot, (snapshot: Snapshot) => {
      this.snapshot = snapshot;
      this.onSnapshot(snapshot);
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
    if (this.connected) this.room?.send(MSG.input, input);
  }
}
