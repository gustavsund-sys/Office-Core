import {
  ArcRotateCamera, AssetContainer, Color3, Color4, DirectionalLight, Engine,
  HemisphericLight, LoadAssetContainerAsync, MeshBuilder,
  Scene, StandardMaterial, TransformNode, Vector3,
  type InstantiatedEntries,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { appearanceMeshes, type Appearance, type CharacterAnimation } from "../player/appearance";

const BASE = "/models/quaternius-modular/";

export class CharacterLabScene {
  private engine: Engine;
  private scene: Scene;
  private camera: ArcRotateCamera;
  private cache = new Map<string, Promise<AssetContainer>>();
  private entries: InstantiatedEntries[] = [];
  private root: TransformNode;
  private revision = 0;
  private disposed = false;
  private resizeObserver: ResizeObserver;
  rotate = false;

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: false });
    this.engine.setHardwareScalingLevel(1 / Math.min(devicePixelRatio, 1.5));
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.065, 0.12, 0.15, 1);
    this.scene.imageProcessingConfiguration.exposure = 1.2;
    this.scene.imageProcessingConfiguration.contrast = 1.05;
    this.camera = new ArcRotateCamera("wardrobe camera", Math.PI / 2, 1.35, 3.65, new Vector3(0, 0.95, 0), this.scene);
    // The face view puts the camera close enough that the default near plane cuts into the head.
    this.camera.minZ = 0.05;
    this.camera.lowerRadiusLimit = 1.1;
    this.camera.upperRadiusLimit = 5;
    this.camera.lowerBetaLimit = 0.35;
    this.camera.upperBetaLimit = Math.PI / 2;
    this.camera.wheelPrecision = 70;
    this.camera.pinchPrecision = 100;
    this.camera.panningSensibility = 0;
    this.camera.attachControl(canvas, true);
    const fill = new HemisphericLight("studio fill", new Vector3(0, 1, -0.5), this.scene);
    fill.intensity = 0.8;
    fill.groundColor = new Color3(0.35, 0.39, 0.43);
    const key = new DirectionalLight("studio key", new Vector3(-0.6, -1, -0.6), this.scene);
    key.intensity = 1.3;
    key.diffuse = new Color3(1, 0.88, 0.76);
    const rim = new DirectionalLight("studio rim", new Vector3(0.5, -0.3, 1), this.scene);
    rim.diffuse = new Color3(0.6, 0.8, 1);
    rim.intensity = 0.7;
    const platform = MeshBuilder.CreateCylinder("display plinth", { diameter: 2.35, height: 0.07, tessellation: 64 }, this.scene);
    platform.position.y = -0.045;
    const surface = new StandardMaterial("plinth", this.scene);
    surface.diffuseColor = Color3.FromHexString("#31464e");
    surface.specularColor = Color3.Black();
    platform.material = surface;
    const ring = MeshBuilder.CreateTorus("plinth accent", { diameter: 2.22, thickness: 0.012, tessellation: 80 }, this.scene);
    ring.position.y = -0.005;
    const accent = new StandardMaterial("accent", this.scene);
    accent.emissiveColor = Color3.FromHexString("#d9b789");
    accent.diffuseColor = Color3.Black();
    ring.material = accent;
    this.root = new TransformNode("character draft", this.scene);
    this.resizeObserver = new ResizeObserver(() => this.engine.resize());
    this.resizeObserver.observe(canvas);
    this.engine.runRenderLoop(() => {
      if (document.hidden || this.disposed) return;
      if (this.rotate) this.camera.alpha += Math.min(this.engine.getDeltaTime(), 50) * 0.0003;
      this.scene.render();
    });
  }

  frame(face = false) {
    this.camera.setTarget(new Vector3(0, face ? 1.62 : 0.95, 0));
    this.camera.radius = face ? 1.15 : 3.65;
    this.camera.beta = face ? Math.PI / 2 : 1.35;
    this.camera.alpha = Math.PI / 2;
  }

  private asset(file: string) {
    let promise = this.cache.get(file);
    if (!promise) {
      promise = LoadAssetContainerAsync(BASE + file, this.scene).then(container => {
        if (this.disposed) { container.dispose(); throw new Error("Preview closed"); }
        return container;
      }).catch(error => { this.cache.delete(file); throw error; });
      this.cache.set(file, promise);
    }
    return promise;
  }

  async show(value: Appearance): Promise<number | null> {
    const revision = ++this.revision;
    const asset = await this.asset("characters.glb");
    if (this.disposed || revision !== this.revision) return null;
    if (!this.entries.length) {
      const instance = asset.instantiateModelsToScene(name => name, true, { doNotInstantiate: true });
      for (const node of instance.rootNodes) node.parent = this.root;
      this.entries = [instance];
      this.play("Idle");
    }
    const selected = new Set(appearanceMeshes(value));
    let triangles = 0;
    for (const mesh of this.root.getChildMeshes()) {
      if (!mesh.getTotalVertices()) continue;
      const enabled = selected.has(mesh.name);
      mesh.setEnabled(enabled);
      mesh.isPickable = false;
      if (enabled) triangles += mesh.getTotalIndices() / 3;
    }
    return triangles;
  }

  play(name: CharacterAnimation) {
    for (const entry of this.entries) {
      entry.animationGroups.forEach(group => group.stop());
      const group = entry.animationGroups.find(group => group.name === name);
      if (group) { group.reset(); group.start(true, 1, group.from, group.to); }
    }
  }

  private clearEntries() {
    const materials = new Set(this.root.getChildMeshes().map(mesh => mesh.material));
    this.entries.forEach(entry => entry.dispose());
    // Instantiated materials are owned here; textures remain shared by the cache.
    materials.forEach(material => material?.dispose(false, false));
    this.entries = [];
  }

  dispose() {
    this.disposed = true;
    this.revision++;
    this.resizeObserver.disconnect();
    this.engine.stopRenderLoop();
    this.clearEntries();
    for (const promise of this.cache.values()) void promise.then(asset => asset.dispose()).catch(() => {});
    this.scene.dispose();
    this.engine.dispose();
  }
}
