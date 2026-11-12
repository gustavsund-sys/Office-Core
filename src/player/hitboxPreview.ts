import {
  ArcRotateCamera, Color3, Color4, DirectionalLight, Engine, HemisphericLight,
  Scene, ShadowGenerator, StandardMaterial, Vector3,
} from "@babylonjs/core";
import { World } from "../map/builder";
import { DEFAULT_APPEARANCE, OUTFITS, type Outfit } from "./appearance";
import { createCharacterModel, loadCharacterAsset } from "./characterModel";
import { Player } from "./player";

const canvas = document.querySelector<HTMLCanvasElement>("#view")!;
const status = document.querySelector("#status")!;
const engine = new Engine(canvas, true);
const scene = new Scene(engine);
scene.clearColor = new Color4(0.055, 0.09, 0.12, 1);
const camera = new ArcRotateCamera("Orbit", Math.PI / 3, 1.35, 5, new Vector3(0, 1.4, 0), scene);
camera.attachControl(canvas, true);
camera.lowerRadiusLimit = 2;
camera.upperRadiusLimit = 9;
new HemisphericLight("Fill", Vector3.Up(), scene);
const sun = new DirectionalLight("Key", new Vector3(-1, -2, -1), scene);
const player = new Player(new World(scene, new ShadowGenerator(256, sun)));
player.root.position.setAll(0);
for (const mesh of player.root.getChildMeshes()) mesh.isVisible = false;
const boxes = player.hitboxes;
const overlay = new StandardMaterial("Hitbox overlay", scene);
overlay.emissiveColor = Color3.FromHexString("#ff984c");
overlay.disableLighting = true;
overlay.alpha = 0.24;
for (const box of boxes) {
  box.material = overlay;
  box.visibility = 1;
  box.enableEdgesRendering();
  box.edgesColor = new Color4(1, 0.61, 0.28, 1);
  box.edgesWidth = 2;
}
const toggle = document.querySelector<HTMLInputElement>("#boxes")!;
const updateBoxes = () => {
  for (const box of boxes) box.isVisible = toggle.checked;
};
toggle.onchange = updateBoxes;
updateBoxes();

const outfit = document.querySelector<HTMLSelectElement>("#outfit")!;
for (const [id, label] of OUTFITS) outfit.add(new Option(label, id));
const appearance = () => {
  const selected = outfit.value as Outfit;
  return { ...DEFAULT_APPEARANCE, head: selected, body: selected, legs: selected, feet: selected };
};
void loadCharacterAsset(scene).then(asset => {
  const model = createCharacterModel(asset, player.root, appearance());
  model.play("Idle_Gun");
  outfit.onchange = () => model.setOutfit(appearance());
  status.textContent = "Dra för att rotera · Scrolla för att zooma · Orange visar träffboxarna i vila";
}).catch(() => { status.textContent = "Spelarmodellen kunde inte laddas."; });
engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());
