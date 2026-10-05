import { highlights, type Performance } from "../game/engagement";
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
  results: ({ name: string } & Performance)[] = [],
  returnToLobby: () => void = () => location.reload(),
) {
  if (document.querySelector("#victory")) return;
  const overlay = document.createElement("section");
  overlay.id = "victory";
  overlay.style.setProperty("--winner", TEAMS[team]);
  overlay.innerHTML = `<div class="victory-card"><span>${final ? "FIRST TO THREE · SERIES COMPLETE" : "Next round"}</span><h1>${team} TEAM WINS</h1><canvas aria-label="Winning players"></canvas><div class="winner-names"></div><p>${wins ? `RED ${wins.RED} · BLUE ${wins.BLUE}` : ""}</p><div id="round-ready"></div><div class="victory-actions"><button class="round-primary">${final ? "Return to Lobby" : "Ready"}</button>${final ? "" : '<button class="round-leave">Return to Lobby</button>'}</div></div>`;
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
  heading.textContent = "RUNDA · KILLS / ASSISTS / DESARMERINGAR / CORE-SKADA";
  table.append(heading);
  for (const player of results) {
    const row = document.createElement("div"),
      name = document.createElement("span"),
      stats = document.createElement("b");
    name.textContent = player.name;
    stats.textContent = `${player.kills} / ${player.assists} / ${player.disarms} / ${player.coreDamage}`;
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
      ? "RETURNING TO LOBBY…"
      : "Ready · Waiting for players…";
    newMatch();
  });
  overlay.querySelector<HTMLButtonElement>(".round-leave")?.addEventListener("click", () => {
    overlay.querySelectorAll<HTMLButtonElement>("button").forEach(button => { button.disabled = true; });
    overlay.querySelector(".round-leave")!.textContent = "RETURNING TO LOBBY…";
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
    player.torso.material = world.mat(TEAMS[team]);
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
