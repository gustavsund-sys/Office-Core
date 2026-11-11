import {
  LoadAssetContainerAsync,
  type AnimationGroup,
  type AssetContainer,
  type Scene,
  TransformNode,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { appearanceMeshes, type Appearance, type CharacterAnimation } from "./appearance";

export const CHARACTER_MODEL_URL = "/models/quaternius-modular/characters.glb";
export const CHARACTER_SIZE_MULTIPLIER = 1.1;
const assets = new WeakMap<Scene, Promise<AssetContainer>>();

export function loadCharacterAsset(scene: Scene) {
  let asset = assets.get(scene);
  if (!asset) {
    asset = LoadAssetContainerAsync(CHARACTER_MODEL_URL, scene);
    assets.set(scene, asset);
    void asset.catch(() => assets.delete(scene));
  }
  return asset;
}

export function createCharacterModel(asset: AssetContainer, root: TransformNode, outfit: Appearance) {
  const entries = asset.instantiateModelsToScene(name => name, false, { doNotInstantiate: true });
  const modelRoot = new TransformNode("character proportions", root.getScene());
  modelRoot.parent = root;
  // Keep the figure near two world units tall and readable from above.
  modelRoot.scaling.set(1.14, 1.09, 1.14);
  modelRoot.scaling.scaleInPlace(CHARACTER_SIZE_MULTIPLIER);
  modelRoot.scaling.scaleInPlace(1.15 ** 2 * 1.1 ** 2);
  const meshes = entries.rootNodes.flatMap(node => {
    node.parent = modelRoot;
    return node.getChildMeshes();
  });
  const setOutfit = (appearance: Appearance) => {
    const parts = new Set(appearanceMeshes(appearance));
    for (const mesh of meshes) {
      mesh.isPickable = false;
      mesh.setEnabled(parts.has(mesh.name));
    }
  };
  setOutfit(outfit);
  const wrist = entries.skeletons[0]?.bones
    .find(bone => bone.name === "Wrist.R")?.getTransformNode();
  const grip = wrist && new TransformNode("right palm weapon grip", root.getScene());
  if (grip) {
    grip.parent = wrist;
    grip.position.set(0, 0.085, 0);
  }
  let active: AnimationGroup | undefined;
  let action: AnimationGroup | undefined;
  const recoveryGroups = new Set<AnimationGroup>();
  const isFireAnimation = (group?: AnimationGroup) =>
    group?.name === "Idle_Gun_Shoot" || group?.name === "Run_Shoot";
  const find = (name: CharacterAnimation) =>
    entries.animationGroups.find(group => group.name === name);
  root.onDisposeObservable.addOnce(() => entries.dispose());
  return {
    setOutfit,
    grip,
    playAction(name: CharacterAnimation) {
      const next = find(name);
      if (!next) return;
      if (action?.isPlaying &&
        (action.name === "Death" || (name !== "Death" && name !== "HitRecieve") || action === next))
        return;
      active?.stop();
      active = undefined;
      action?.stop();
      action = next;
      next.start(false);
    },
    get actionPlaying() {
      return action?.isPlaying ?? false;
    },
    get carryingWeapon() {
      return active?.name === "Idle_Gun" || active?.name === "Walk";
    },
    get firing() {
      return action?.isPlaying === true && isFireAnimation(action);
    },
    resetAction() {
      action?.stop();
      action = undefined;
    },
    play(name: CharacterAnimation) {
      if (action?.isPlaying) return;
      const next = find(name);
      if (!next || next === active) return;
      active?.stop();
      const recovering = isFireAnimation(action);
      if (recovering && !recoveryGroups.has(next)) {
        // Instances share animation tracks until they need their own blending settings.
        for (const track of next.targetedAnimations) track.animation = track.animation.clone();
        recoveryGroups.add(next);
        next.blendingSpeed = 0.065;
      }
      if (recoveryGroups.has(next)) next.enableBlending = recovering;
      action = undefined;
      next.start(true);
      active = next;
    },
  };
}
