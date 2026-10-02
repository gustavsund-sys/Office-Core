import { Color4, DirectionalLight, Engine, FreeCamera, HemisphericLight, Scene, ShadowGenerator, Vector3 } from "@babylonjs/core";
import { TEAMS, type Team } from "../config/game";
import type { MatchMember } from "../game/match";
import { World } from "../map/builder";
import { Player } from "../player/player";

export function showVictory(team: Team, members: MatchMember[]) {
  if (document.querySelector("#victory")) return;
  const overlay = document.createElement("section");
  overlay.id = "victory";
  overlay.style.setProperty("--winner", TEAMS[team]);
  overlay.innerHTML = `<div class="victory-card"><span>LAST CORE STANDING</span><h1>${team} TEAM WINS</h1><canvas aria-label="Winning players"></canvas><div class="winner-names"></div><button>NEW MATCH</button></div>`;
  members.forEach(member => {
    const name = document.createElement("strong");
    name.textContent = member.name;
    overlay.querySelector(".winner-names")!.append(name);
  });
  overlay.querySelector("button")!.addEventListener("click", () => location.reload());
  document.body.append(overlay);
  const engine = new Engine(overlay.querySelector("canvas")!, true);
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.07, 0.12, 0.16, 1);
  const light = new HemisphericLight("victory light", Vector3.Up(), scene);
  light.intensity = 1.2;
  const sun = new DirectionalLight("victory sun", new Vector3(-1, -2, 1), scene);
  const world = new World(scene, new ShadowGenerator(512, sun));
  const camera = new FreeCamera("victory camera", new Vector3(0, 2.3, 5), scene);
  camera.setTarget(new Vector3(0, 1, 0));
  camera.minZ = 0.1;
  for (const [index] of members.entries()) {
    const player = new Player(world);
    player.root.position.set((index - (members.length - 1) / 2) * 1.8, 0, 0);
    player.torso.material = world.mat(TEAMS[team]);
    player.root.rotation.y = 0.15;
  }
  engine.resize();
  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());
}
