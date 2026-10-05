import { fetchServer } from "./serverReady";
import { IDLE_CLOSE_CODE } from "../../shared/inactivity";
import { SnapshotReceiver, type StreamPacket } from "./streams";
import { decodeSnapshot, type SnapshotDelta } from "./snapshots";
import { NetworkTiming } from "./timing";
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
// Diagnostics can be disabled for a comparison build.
const motionDiagnosticsEnabled =
  import.meta.env.VITE_MOTION_DIAGNOSTICS !== "false";
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
  timing = new NetworkTiming();
  sequence = 0;
  private activitySentAt = 0;
  private idleNotice?: HTMLElement;
  leaving = false;
  private serverRequests = new AbortController();
  constructor() {
    window.addEventListener("pagehide", () => this.saveResume());
    const activity = (event: Event) => {
      if (!event.isTrusted || !this.connected || this.leaving) return;
      this.idleNotice?.remove();
      const now = performance.now();
      if (now - this.activitySentAt < 1000) return;
      this.activitySentAt = now;
      this.room?.send(MSG.activity);
    };
    for (const name of ["pointermove", "pointerdown", "keydown"])
      window.addEventListener(name, activity, { passive: true });
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
    this.serverRequests.abort();
    this.connected = false;
    this.clearResume();
    this.idleNotice?.remove();
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
    const response = await fetchServer(url, {
      signal: this.serverRequests.signal,
      onWaiting: () => this.onStatus("Väntar på spelservern… Försöker igen automatiskt."),
    });
    if (!response.ok) throw new Error("Serverns lobby kunde inte hämtas.");
    return (await response.json()).rooms;
  }
  room?: Room;
  connected = false;
  rtt = 0;
  private sentAt: number[] = [];
  lastAck = -1;
  lastAckAt = 0;
  lastSnapshotAt = 0;
  private nextMotionReport = 0;
  private lastMotionReport = 0;
  private maxPending = 0;
  private maxFrameMs = 0;
  private maxSnapshotGapMs = 0;
  private maxSnapshotHandlerMs = 0;
  private decodeFailures = 0;
  private lastPacketAt = 0;
  private maxPacketGapMs = 0;
  private nextResync = 0;
  get sentRate() {
    return this.sentAt.filter((t) => t >= performance.now() - 1000).length;
  }
  get ackAge() {
    return this.lastAckAt ? performance.now() - this.lastAckAt : 0;
  }
  nextPing = 0;
  snapshot?: Snapshot;
  history: { at: number; snapshot: Snapshot }[] = [];
  onTeamPing: (ping: import("../game/engagement").TeamPing) => void = () => {};
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
    const ready = new URL(this.endpoint);
    ready.protocol = ready.protocol === "wss:" ? "https:" : "http:";
    ready.pathname = "/map";
    await fetchServer(ready, {signal:this.serverRequests.signal,onWaiting:()=>this.onStatus("Spelservern startar… Väntar på svar.")});
    this.serverRequests.signal.throwIfAborted();
    const room = await this.client.joinById(id, options);
    this.bind(room);
  }
  bind(room: Room) {
    this.lastAck = -1;
    this.lastAckAt = this.lastSnapshotAt = this.lastPacketAt = 0;
    this.lastMotionReport = this.nextMotionReport = this.nextResync = 0;
    this.maxPending =
      this.maxFrameMs =
      this.maxPacketGapMs =
      this.maxSnapshotGapMs =
      this.maxSnapshotHandlerMs =
      this.decodeFailures =
        0;
    this.sentAt = [];
    this.history = [];
    this.snapshot = undefined;
    this.timing = new NetworkTiming();
    this.room = room;
    this.connected = true;
    this.saveResume();
    this.onStatus("ANSLUTEN TILL OFFICE01");
    const receiver = new SnapshotReceiver();
    room.onMessage(
      MSG.snapshot,
      (packet: Snapshot | SnapshotDelta | StreamPacket) => {
        const receivedAt = performance.now();
        if (motionDiagnosticsEnabled && this.lastPacketAt)
          this.maxPacketGapMs = Math.max(
            this.maxPacketGapMs,
            receivedAt - this.lastPacketAt,
          );
        if (motionDiagnosticsEnabled) this.lastPacketAt = receivedAt;
        const snapshot =
          "stream" in packet
            ? receiver.decode(packet)
            : decodeSnapshot(this.snapshot, packet);
        if (!snapshot) {
          if (motionDiagnosticsEnabled) this.decodeFailures++;
          if (receivedAt >= this.nextResync) {
            this.nextResync = receivedAt + 250;
            this.room?.send(MSG.netReady, { stream: 2 });
          }
          return;
        }
        const serverTime = snapshot.serverTime ?? performance.now();
        this.timing.observe(serverTime, performance.now());
        this.history.push({ at: serverTime, snapshot });
        if (this.history.length > 12) this.history.shift();
        if (motionDiagnosticsEnabled && this.lastSnapshotAt)
          this.maxSnapshotGapMs = Math.max(
            this.maxSnapshotGapMs,
            receivedAt - this.lastSnapshotAt,
          );
        this.lastSnapshotAt = receivedAt;
        const own = snapshot.players.find((p) => p.id === room.sessionId);
        if (own && own.ack !== this.lastAck) {
          this.lastAck = own.ack;
          this.lastAckAt = this.lastSnapshotAt;
        }
        this.snapshot = snapshot;
        this.onSnapshot(snapshot);
        if (motionDiagnosticsEnabled)
          this.maxSnapshotHandlerMs = Math.max(
            this.maxSnapshotHandlerMs,
            performance.now() - receivedAt,
          );
      },
    );
    room.onMessage(MSG.idle, (state: { remaining: number | null }) => {
      this.idleNotice?.remove();
      if (state.remaining === null) return;
      const notice = (this.idleNotice = document.createElement("div"));
      notice.className = "idle-warning";
      notice.setAttribute("role", "alert");
      notice.textContent = `DU ÄR INAKTIV · Du kopplas bort om ${state.remaining} sekunder. Rör musen eller tryck på en tangent för att stanna kvar.`;
      document.body.append(notice);
    });
    room.send(MSG.netReady, { stream: 2 });
    room.onMessage(MSG.teamPing, (ping) => this.onTeamPing(ping));
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
      if (code === IDLE_CLOSE_CODE) {
        this.leaving = true;
        this.clearResume();
        this.serverRequests.abort();
        location.assign("/?timeout=1");
        return;
      }
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
  reportMotion(
    fps: number,
    pending: number,
    correction: number,
    frameMs = 0,
    renderer = "unknown",
  ) {
    if (!motionDiagnosticsEnabled) return;
    const now = performance.now();
    this.maxPending = Math.max(this.maxPending, pending);
    this.maxFrameMs = Math.max(this.maxFrameMs, frameMs);
    const alarm =
      this.maxPending >= 12 ||
      this.ackAge > 150 ||
      this.maxFrameMs > 100 ||
      this.decodeFailures > 0;
    if (
      !this.connected ||
      (now < this.nextMotionReport &&
        (!alarm || now - this.lastMotionReport < 1000))
    )
      return;
    this.lastMotionReport = now;
    this.nextMotionReport = now + 5000;
    this.room?.send(MSG.motionDiagnostics, {
      fps,
      pending,
      correction,
      sentRate: this.sentRate,
      ackAge: this.ackAge,
      snapshotAge: this.lastSnapshotAt ? now - this.lastSnapshotAt : 0,
      clientAck: this.lastAck,
      sentSeq: this.sequence,
      packetAge: this.lastPacketAt ? now - this.lastPacketAt : 0,
      maxPending: this.maxPending,
      maxFrameMs: this.maxFrameMs,
      maxPacketGapMs: this.maxPacketGapMs,
      maxSnapshotGapMs: this.maxSnapshotGapMs,
      maxSnapshotHandlerMs: this.maxSnapshotHandlerMs,
      decodeFailures: this.decodeFailures,
      predictionBlocked: pending >= 64 ? 1 : 0,
      version: `pc-motion-v4-${renderer === "WebGPUEngine" ? "webgpu" : renderer === "Engine" ? "webgl" : "unknown"}`,
    });
    this.maxPending =
      this.maxFrameMs =
      this.maxPacketGapMs =
      this.maxSnapshotGapMs =
      this.maxSnapshotHandlerMs =
      this.decodeFailures =
        0;
  }
  send(input: NetInput) {
    if (this.connected) {
      this.sentAt.push(performance.now());
      this.sentAt = this.sentAt.filter((t) => t >= performance.now() - 1000);
      this.sequence = Math.max(this.sequence, input.seq ?? 0);
      this.room?.send(MSG.input, input);
      if (Date.now() >= this.nextPing) {
        this.nextPing = Date.now() + 3000;
        this.room?.send(MSG.ping, Date.now());
      }
    }
  }
}
