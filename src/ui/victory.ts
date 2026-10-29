import { highlights, performanceScore, type Performance } from "../game/engagement";
let cleanup: (() => void) | undefined;
export function closeVictory() {
  cleanup?.();
  cleanup = undefined;
  document.querySelector("#victory")?.remove();
}
export function updateReady(
  members: { id: string; name: string }[],
  ready: string[],
) {
  const list = document.querySelector("#round-ready");
  if (!list) return;
  list.replaceChildren();
  for (const p of members) {
    const row = document.createElement("div");
    row.textContent = `${ready.includes(p.id) ? "✓ Ready" : "Waiting"} · ${p.name}`;
    list.append(row);
  }
}
import {
  Color4,
  DirectionalLight,
  Engine,
  FreeCamera,
  HemisphericLight,
  Scene,
  ShadowGenerator,
  Vector3,
} from "@babylonjs/core";
import { TEAMS, type Team } from "../config/game";
import type { MatchMember } from "../game/match";
import { World } from "../map/builder";
import { Player } from "../player/player";

export function showVictory(
  team: Team,
  members: MatchMember[],
  newMatch: () => void = () => location.reload(),
  final = true,
  wins?: Record<Team, number>,
  results: ({ id?: string; name: string } & Performance)[] = [],
  returnToLobby: () => void = () => location.reload(),
  ownId?: string,
) {
  if (document.querySelector("#victory")) return;
  const overlay = document.createElement("section");
  overlay.id = "victory";
  overlay.style.setProperty("--winner", TEAMS[team]);
  overlay.innerHTML = `<div class="victory-card"><span>${final ? "FIRST TO THREE · SERIES COMPLETE" : "Next round"}</span><h1>${team} TEAM WINS</h1><canvas aria-label="Winning players"></canvas><div class="winner-names"></div><p>${wins ? `RED ${wins.RED} · BLUE ${wins.BLUE}` : ""}</p><div id="round-ready"></div><div class="victory-actions"><button class="round-primary">${final ? "Rematch · Same lobby" : "Ready"}</button><button class="round-leave">Return to Lobby</button></div></div>`;
  if (final && ownId) {
    const own = results.find((p) => p.id === ownId);
    if (own) {
      const unlocks: string[] = [];
      if (own.defense >= 2) unlocks.push("Core Defender");
      if (own.disarms >= 1) unlocks.push("Buster Stopper");
      if (own.assists >= 2) unlocks.push("Kontorets lagspelare");
      try {
        const previous = JSON.parse(localStorage.getItem("office-core-nameplates") || "[]");
        const saved = Array.isArray(previous) ? previous.filter((v) => typeof v === "string") : [];
        const newUnlocks = unlocks.filter((v) => !saved.includes(v));
        localStorage.setItem("office-core-nameplates", JSON.stringify([...new Set([...saved, ...unlocks])]));
        if (newUnlocks.length) {
          const notice = document.createElement("p");
          notice.textContent = `NAMNSKYLT UPPLÅST · ${newUnlocks.join(" · ")}`;
          overlay.querySelector("#round-ready")!.before(notice);
        }
      } catch { /* Storage can be unavailable in private browsing. */ }
    }
  }
  if (ownId) {
    try {
      const saved = JSON.parse(localStorage.getItem("office-core-nameplates") || "[]");
      if (Array.isArray(saved) && saved.length) {
        const label = document.createElement("label");
        label.textContent = "DIN NAMNSKYLT ";
        const select = document.createElement("select");
        for (const title of ["Ingen", ...saved.filter((v) => typeof v === "string")]) {
          const option = document.createElement("option");
          option.value = title === "Ingen" ? "" : title;
          option.textContent = title;
          select.append(option);
        }
        select.value = localStorage.getItem("office-core-nameplate-selected") || "";
        select.addEventListener("change", () => {
          try { localStorage.setItem("office-core-nameplate-selected", select.value); } catch {}
          const ownName = table.querySelector<HTMLElement>('[data-own-name]');
          const own = results.find((p) => p.id === ownId);
          if (ownName && own) ownName.textContent = `${own.name}${select.value ? ` · ${select.value}` : ""}`;
        });
        label.append(select);
        overlay.querySelector("#round-ready")!.before(label);
      }
    } catch {}
  }
  const awards = document.createElement("div");
  awards.className = "round-awards";
  for (const award of highlights(results)) {
    const card = document.createElement("div");
    const title = document.createElement("small"),
      name = document.createElement("strong"),
      value = document.createElement("span");
    title.textContent = award.title;
    name.textContent = award.name;
    value.textContent = String(award.value);
    card.append(title, name, value);
    awards.append(card);
  }
  const table = document.createElement("div");
  table.className = "round-results";
  const heading = document.createElement("div");
  heading.textContent = `${final ? "MATCH" : "RUNDA"} · POÄNG / KILLS / ASSISTS / DESARMERINGAR / FÖRSVAR / CORE-SKADA`;
  table.append(heading);
  for (const player of [...results].sort((a, b) => performanceScore(b) - performanceScore(a))) {
    const row = document.createElement("div"),
      name = document.createElement("span"),
      stats = document.createElement("b");
    name.textContent = player.name;
    if (player.id && player.id === ownId) {
      name.dataset.ownName = "true";
      try {
        const selected = localStorage.getItem("office-core-nameplate-selected");
        if (selected) name.textContent += ` · ${selected}`;
      } catch {}
    }
    stats.textContent = `${performanceScore(player)} / ${player.kills} / ${player.assists} / ${player.disarms} / ${player.defense} / ${player.coreDamage}`;
    row.append(name, stats);
    table.append(row);
  }
  overlay.querySelector("#round-ready")!.before(awards, table);
  overlay.classList.add("round-reveal");
  members.forEach((member) => {
    const name = document.createElement("strong");
    name.textContent = member.name;
    overlay.querySelector(".winner-names")!.append(name);
  });
  overlay.querySelector("button")!.addEventListener("click", () => {
    const button = overlay.querySelector("button")!;
    button.disabled = true;
    button.textContent = final
      ? "STARTING NEW MATCH…"
      : "Ready · Waiting for players…";
    newMatch();
  });
  overlay
    .querySelector<HTMLButtonElement>(".round-leave")
    ?.addEventListener("click", () => {
      overlay
        .querySelectorAll<HTMLButtonElement>("button")
        .forEach((button) => {
          button.disabled = true;
        });
      overlay.querySelector(".round-leave")!.textContent =
        "RETURNING TO LOBBY…";
      returnToLobby();
    });
  document.body.append(overlay);
  const engine = new Engine(overlay.querySelector("canvas")!, true);
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.07, 0.12, 0.16, 1);
  const light = new HemisphericLight("victory light", Vector3.Up(), scene);
  light.intensity = 1.2;
  const sun = new DirectionalLight(
    "victory sun",
    new Vector3(-1, -2, 1),
    scene,
  );
  const world = new World(scene, new ShadowGenerator(512, sun));
  const camera = new FreeCamera(
    "victory camera",
    new Vector3(0, 2.3, 5),
    scene,
  );
  camera.setTarget(new Vector3(0, 1, 0));
  camera.minZ = 0.1;
  const players: Player[] = [];
  for (const [index] of members.entries()) {
    const player = new Player(world);
    player.root.position.set((index - (members.length - 1) / 2) * 1.8, 0, 0);
    player.torso.material = world.finish(TEAMS[team], "fabric");
    player.root.rotation.y = 0.15;
    players.push(player);
  }
  engine.resize();
  let time = 0;
  engine.runRenderLoop(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
    time += dt;
    for (const [index, player] of players.entries()) {
      player.animate(false, dt);
      player.root.rotation.y = 0.15 + Math.sin(time * 1.3 + index) * 0.06;
      const arm = player.bodyMeshes.find((m) => m.name === "left arm");
      if (arm) arm.rotation.x = -0.3 + Math.sin(time * 3 + index) * 0.15;
    }
    scene.render();
  });
  const resize = () => engine.resize();
  window.addEventListener("resize", resize);
  cleanup = () => {
    window.removeEventListener("resize", resize);
    engine.dispose();
  };
}
