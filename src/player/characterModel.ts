import {
  LoadAssetContainerAsync,
  Matrix,
  Quaternion,
  Vector3,
  AnimationGroup,
  type AssetContainer,
  type Scene,
  TransformNode,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { appearanceMeshes, type Appearance, type CharacterAnimation } from "./appearance";

export const CHARACTER_MODEL_URL = "/models/quaternius-modular/characters.glb";
export const CHARACTER_SIZE_MULTIPLIER = 1.1;
const assets = new WeakMap<Scene, Promise<AssetContainer>>();
export type CarriedUtility = "pulseTrap" | "superMedkit" | "rcCar" | "beacon";

const carryGrips = {
  beacon: [new Vector3(0.3, 0.57, -0.08), new Vector3(-0.3, 0.57, -0.08)],
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
  let armor: TransformNode | undefined;
  const fitArmor = (appearance: Appearance) => {
    if (!armor) return;
    // Dimensions in the imported rig's units; inherit character scaling once.
    const bulky = ["SpaceSuit", "Swat", "King", "Casual2"].includes(appearance.body);
    armor.scaling.set(bulky ? 0.65 : 0.59, 0.56, bulky ? 0.51 : 0.45);
    armor.position.set(0, -0.13, 0.045);
  };
  const setOutfit = (appearance: Appearance) => {
    outfit = appearance;
    fitArmor(appearance);
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
  let limp: AnimationGroup | undefined;
  let jump: AnimationGroup | undefined;
  let jumpLanding: AnimationGroup | undefined;
  const find = (name: CharacterAnimation) =>
    entries.animationGroups.find(group => group.name === name);
  const airbornePose = () => {
    if (jump) return jump;
    const run = find("Run");
    if (!run) return;
    // Reuse a complete baked airborne stride. Feet have independent position
    // tracks: preserve EVERY track and its timing instead of rotating knees alone.
    jump = new AnimationGroup("Jump", root.getScene());
    for (const { animation, target } of run.targetedAnimations)
      jump.addTargetedAnimation(animation.clone(), target);
    return jump;
  };
  const landingPose = () => {
    if (jumpLanding) return jumpLanding;
    const idle = find("Idle_Gun");
    if (!idle) return;
    jumpLanding = new AnimationGroup("Jump landing", root.getScene());
    // Blend the complete baked pose, including independent foot positions.
    // This brings both legs under the body without changing limb proportions.
    for (const { animation, target } of idle.targetedAnimations)
      jumpLanding.addTargetedAnimation(animation.clone(), target);
    jumpLanding.enableBlending = true;
    jumpLanding.blendingSpeed = 0.15;
    return jumpLanding;
  };
  const injuredWalk = () => {
    if (limp) return limp;
    const walk = find("Walk");
    if (!walk || walk.to <= walk.from) return walk;
    const duration = walk.to - walk.from;
    // The foot tracks have their own positions, baked together with the leg
    // rotations. Retiming them together keeps the ankles connected.
    limp = new AnimationGroup("Limp", root.getScene());
    for (const { animation, target } of walk.targetedAnimations) {
      const track = animation.clone();
      const rotation = animation.targetProperty === "rotationQuaternion";
      track.setKeys(animation.getKeys().map(key => {
        const phase = (key.frame - walk.from) / duration;
        // Spend longer on one step before shifting weight to the other leg.
        const timing = phase + 0.28 * Math.sin(Math.PI * phase);
        let value = key.value;
        if (rotation && target.name === "Torso") {
          value = (value as Quaternion).multiply(
            Quaternion.RotationYawPitchRoll(0, 0.12, 0.15 * Math.cos(phase * Math.PI * 2)),
          );
        }
        return { ...key, frame: walk.from + timing * duration, value };
      }));
      limp.addTargetedAnimation(track, target);
    }
    return limp;
  };
  const scene = root.getScene();
  const inverse = Matrix.Identity();
  const turn = Quaternion.Identity();
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
  const leftArm = joint("UpperArm.L");
  const leftElbow = joint("LowerArm.L");
  const leftWrist = joint("Wrist.L");
  const chest = joint("Chest");
  let carriedItems = 0;
  let savedArm: [Quaternion, Quaternion] | undefined;
  const restoreInjuredArm = scene.onBeforeAnimationsObservable.add(() => {
    if (!savedArm) return;
    leftArm?.rotationQuaternion?.copyFrom(savedArm[0]);
    leftElbow?.rotationQuaternion?.copyFrom(savedArm[1]);
    savedArm = undefined;
  });
  const poseInjuredArm = scene.onAfterAnimationsObservable.add(() => {
    if (active !== limp || !limp || carriedItems || !chest || !leftWrist ||
        !leftArm?.rotationQuaternion || !leftElbow?.rotationQuaternion) return;
    savedArm = [leftArm.rotationQuaternion.clone(), leftElbow.rotationQuaternion.clone()];
    const chestPosition = point(chest);
    const facing = root.computeWorldMatrix(true);
    const target = chestPosition.add(Vector3.TransformNormal(new Vector3(0, -0.08, 0.29), facing));
    const shoulder = point(leftArm);
    const elbow = point(leftElbow);
    const upperLength = Vector3.Distance(shoulder, elbow);
    const lowerLength = Vector3.Distance(elbow, point(leftWrist));
    const direction = target.subtract(shoulder);
    const distance = Math.max(0.001, Math.min(direction.length(), upperLength + lowerLength - 0.001));
    direction.normalize();
    const along = (upperLength ** 2 - lowerLength ** 2 + distance ** 2) / (2 * distance);
    const down = Vector3.TransformNormal(Vector3.Down(), facing);
    const bend = down.subtract(direction.scale(Vector3.Dot(down, direction))).normalize();
    const elbowTarget = shoulder.add(direction.scale(along))
      .addInPlace(bend.scale(Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2))));
    aimJoint(leftArm, leftElbow, elbowTarget);
    aimJoint(leftElbow, leftWrist, target);
  });
  root.onDisposeObservable.addOnce(() => {
    scene.onBeforeAnimationsObservable.remove(restoreInjuredArm);
    scene.onAfterAnimationsObservable.remove(poseInjuredArm);
    limp?.dispose();
    jump?.dispose();
    jumpLanding?.dispose();
    entries.dispose();
  });
  return {
    setOutfit,
    grip,
    attachArmor(node: TransformNode) {
      if (!chest) return;
      armor = node;
      node.parent = chest;
      node.rotation.setAll(0);
      node.rotationQuaternion = Quaternion.Identity();
      fitArmor(outfit);
    },
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
      carriedItems++;
      const weaponMeshes = weapon.getChildMeshes().filter(mesh => mesh.isVisible);
      const inverse = Matrix.Identity();
      let applied = false;
      const restore = () => {
        if (!applied) return;
        for (const [node, rotation] of original) node.rotationQuaternion?.copyFrom(rotation);
        applied = false;
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
        } else if (item === "beacon") {
          // The beacon origin is at its feet; cradle the chassis in both hands.
          weapon.position.addInPlaceFromFloats(0, -0.82, 0.82);
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
        carriedItems--;
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
      return active?.name === "Idle_Gun" || active?.name === "Walk" || active?.name === "Limp";
    },
    get firing() {
      return action?.isPlaying === true && isFireAnimation(action);
    },
    resetAction() {
      action?.stop();
      action = undefined;
    },
    play(name: CharacterAnimation | "Limp" | "Jump" | "JumpLanding") {
      if (action?.isPlaying) return;
      const next = name === "JumpLanding" ? landingPose() : name === "Jump" ? airbornePose() : name === "Limp" ? injuredWalk() : find(name);
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
      if (name === "Jump") {
        // Move into the raised-leg stride, then hold it until physical landing.
        // No looping run cycle in mid-air and no changes to bone lengths/scales.
        const duration = next.to - next.from;
        next.start(false, 0.65, next.from + duration * 0.15, next.from + duration * 0.4);
      } else next.start(true, name === "Limp" ? 1.32 : 1);
      active = next;
    },
  };
}
