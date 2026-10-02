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
  sequence = 0;
  leaving = false;
  constructor() {
    window.addEventListener("pagehide", () => this.saveResume());
  }
  resumeInfo(): { id: string; token: string; seq: number } | undefined {
    try {
      const saved = JSON.parse(
        sessionStorage.getItem("officeCore.resume") ?? "null",
      );
      return saved &&
        typeof saved.id === "string" &&
        typeof saved.token === "string" &&
        Number.isSafeInteger(saved.seq) &&
        saved.seq >= 0
        ? saved
        : undefined;
    } catch {
      return undefined;
    }
  }
  clearResume() {
    try {
      sessionStorage.removeItem("officeCore.resume");
    } catch {}
  }
  async leave() {
    this.leaving = true;
    this.connected = false;
    this.clearResume();
    await this.room?.leave();
  }
  saveResume() {
    if (this.leaving || !this.room || !this.connected) return;
    try {
      sessionStorage.setItem(
        "officeCore.resume",
        JSON.stringify({
          id: this.room.roomId,
          token: this.room.reconnectionToken,
          seq: this.sequence,
        }),
      );
    } catch {}
  }
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
  onChat: (message: { name: string; text: string }) => void = () => {};
  onSnapshot: (snapshot: Snapshot) => void = () => {};
  onEvent: (event: NetEvent) => void = () => {};
  onStatus: (text: string) => void = () => {};
  async connect(name: string, team: string, id: string) {
    this.onStatus("Ansluter…");
    const resume = this.resumeInfo();
    if (resume?.id === id && resume.token) {
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          this.sequence = resume.seq;
          this.bind(await this.client.reconnect(resume.token));
          return;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }
    }
    this.clearResume();
    const user = auth.currentUser ?? (await signInAnonymously(auth)).user;
    const options = { token: await user.getIdToken(), name, team };
    const room = await this.client.joinById(id, options);
    this.bind(room);
  }
  bind(room: Room) {
    this.history = [];
    this.room = room;
    this.connected = true;
    this.saveResume();
    this.onStatus("ANSLUTEN TILL OFFICE01");
    room.onMessage(MSG.snapshot, (snapshot: Snapshot) => {
      this.history.push({ at: performance.now(), snapshot });
      if (this.history.length > 12) this.history.shift();
      this.snapshot = snapshot;
      this.onSnapshot(snapshot);
    });
    room.onMessage(MSG.chat, (message: { name: string; text: string }) =>
      this.onChat(message),
    );
    room.onMessage(MSG.ping, (stamp: number) => {
      this.rtt = Math.max(0, Date.now() - stamp);
    });
    room.onMessage(MSG.event, (event: NetEvent) => this.onEvent(event));
    room.onError((_code, message) =>
      this.onStatus(message || "Anslutningsfel"),
    );
    room.onLeave(async (code) => {
      this.connected = false;
      if (this.leaving) return;
      if (code === 1000 || code === 4000) {
        this.clearResume();
        if (this.snapshot?.winner) location.reload();
        return;
      }
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
      this.sequence = Math.max(this.sequence, input.seq ?? 0);
      this.room?.send(MSG.input, input);
      if (Date.now() >= this.nextPing) {
        this.nextPing = Date.now() + 3000;
        this.room?.send(MSG.ping, Date.now());
      }
    }
  }
}
