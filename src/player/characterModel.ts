import {
  LoadAssetContainerAsync,
  Matrix,
  Quaternion,
  Vector3,
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
export type CarriedUtility = "pulseTrap" | "superMedkit" | "rcCar";

const carryGrips = {
  bazooka: [new Vector3(0, -0.26, 0.35), new Vector3(-0.15, -0.15, 0.32)],
  pulseTrap: [new Vector3(0.42, 0.05, -0.13), new Vector3(-0.42, 0.05, -0.13)],
  superMedkit: [new Vector3(0.39, 0.05, -0.13), new Vector3(-0.39, 0.05, -0.13)],
  rcCar: [new Vector3(0.28, 0.15, -0.13), new Vector3(-0.28, 0.15, -0.13)],
  coreBuster: [new Vector3(0.28, -0.36, 0), new Vector3(-0.28, -0.36, 0)],
};

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
  modelRoot.scaling.scaleInPlace(1.15 ** 2 * 1.1 ** 3);
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
  const joint = (name: string) => entries.skeletons[0]?.bones
    .find(bone => bone.name === name)?.getTransformNode();
  const wrist = joint("Wrist.R");
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
    attachCarriedItem(weapon: TransformNode, item: keyof typeof carryGrips, recoil?: () => number) {
      const rightShoulder = joint("UpperArm.R");
      const leftShoulder = joint("UpperArm.L");
      const arms = (["R", "L"] as const).map((side, index) => ({
        upper: joint(`UpperArm.${side}`),
        lower: joint(`LowerArm.${side}`),
        wrist: joint(`Wrist.${side}`),
        grip: carryGrips[item][index],
      }));
      const original = new Map<TransformNode, Quaternion>();
      for (const { upper, lower } of arms) {
        if (upper?.rotationQuaternion) original.set(upper, upper.rotationQuaternion.clone());
        if (lower?.rotationQuaternion) original.set(lower, lower.rotationQuaternion.clone());
      }
      const scene = root.getScene();
      const weaponMeshes = weapon.getChildMeshes().filter(mesh => mesh.isVisible);
      const inverse = Matrix.Identity();
      const turn = Quaternion.Identity();
      let applied = false;
      const restore = () => {
        if (!applied) return;
        for (const [node, rotation] of original) node.rotationQuaternion?.copyFrom(rotation);
        applied = false;
      };
      const point = (node: TransformNode) => node.computeWorldMatrix(true).getTranslation();
      const aimJoint = (node: TransformNode, child: TransformNode, target: Vector3) => {
        const rotation = node.rotationQuaternion;
        if (!rotation || !(node.parent instanceof TransformNode)) return;
        node.parent.computeWorldMatrix(true).invertToRef(inverse);
        const pivot = node.position;
        const from = Vector3.TransformCoordinates(point(child), inverse).subtractInPlace(pivot).normalize();
        const to = Vector3.TransformCoordinates(target, inverse).subtractInPlace(pivot).normalize();
        Quaternion.FromUnitVectorsToRef(from, to, turn);
        turn.multiplyToRef(rotation, rotation);
      };
      const follow = () => {
        if (!rightShoulder || !leftShoulder || !weapon.isEnabled()) return;
        const dead = action?.name === "Death";
        for (const mesh of weaponMeshes) mesh.isVisible = !dead;
        if (dead) return;
        for (const [node, rotation] of original) {
          if (node.rotationQuaternion) rotation.copyFrom(node.rotationQuaternion);
        }
        applied = true;
        const world = root.computeWorldMatrix(true);
        world.invertToRef(inverse);
        const shoulder = point(rightShoulder);
        if (item !== "bazooka") shoulder.addInPlace(point(leftShoulder)).scaleInPlace(0.5);
        Vector3.TransformCoordinatesToRef(shoulder, inverse, weapon.position);
        if (item === "bazooka") {
          weapon.position.addInPlaceFromFloats(0.03, 0.24, 0.17 - (recoil?.() ?? 0) * 0.08);
        } else if (item === "coreBuster") {
          weapon.position.addInPlaceFromFloats(0, 1, 0.22);
        } else {
          weapon.position.addInPlaceFromFloats(0, -0.48, 0.52);
        }
        const weaponWorld = weapon.computeWorldMatrix(true);
        const down = Vector3.TransformNormal(new Vector3(0, -1, 0), world).normalize();
        for (const { upper, lower, wrist, grip } of arms) {
          if (!upper || !lower || !wrist) continue;
          const shoulder = point(upper);
          const elbow = point(lower);
          const upperLength = Vector3.Distance(shoulder, elbow);
          const lowerLength = Vector3.Distance(elbow, point(wrist));
          const target = Vector3.TransformCoordinates(grip, weaponWorld);
          const direction = target.subtract(shoulder);
          const distance = Math.min(direction.length(), upperLength + lowerLength - 0.001);
          direction.normalize();
          const along = (upperLength ** 2 - lowerLength ** 2 + distance ** 2) / (2 * distance);
          const bend = down.subtract(direction.scale(Vector3.Dot(down, direction))).normalize();
          const elbowTarget = shoulder.add(direction.scale(along))
            .addInPlace(bend.scale(Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2))));
          aimJoint(upper, lower, elbowTarget);
          aimJoint(lower, wrist, target);
        }
      };
      const before = scene.onBeforeAnimationsObservable.add(restore);
      const after = scene.onAfterAnimationsObservable.add(follow);
      follow();
      return () => {
        restore();
        scene.onBeforeAnimationsObservable.remove(before);
        scene.onAfterAnimationsObservable.remove(after);
      };
    },
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
