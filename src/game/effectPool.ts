import { Mesh, MeshBuilder, Quaternion, Scene, Vector3, type TransformNode } from "@babylonjs/core";
const pools = new WeakMap<Scene, Map<string, Mesh[]>>();
const keys = new WeakMap<Mesh, string>();
const stopFollowing = new WeakMap<Mesh, () => void>();
function acquire(scene: Scene, key: string, create: () => Mesh) {
  let pool = pools.get(scene);
  if (!pool) {
    pool = new Map();
    pools.set(scene, pool);
  }
  const mesh = pool.get(key)?.pop() ?? create();
  keys.set(mesh, key);
  mesh.setEnabled(true);
  mesh.isPickable = false;
  mesh.position.setAll(0);
  mesh.scaling.setAll(1);
  return mesh;
}
export function releaseEffect(mesh: Mesh) {
  stopFollowing.get(mesh)?.();
  stopFollowing.delete(mesh);
  const key = keys.get(mesh);
  if (!key) {
    mesh.dispose();
    return;
  }
  const pool = pools.get(mesh.getScene())!;
  const free = pool.get(key) ?? [];
  if (free.length >= 96) {
    keys.delete(mesh);
    mesh.dispose();
    return;
  }
  mesh.setEnabled(false);
  free.push(mesh);
  pool.set(key, free);
}
export function beam(
  scene: Scene,
  start: Vector3,
  end: Vector3,
  width: number,
  muzzle?: TransformNode,
) {
  const mesh = acquire(scene, "beam", () =>
    MeshBuilder.CreateCylinder(
      "pooled beam",
      { height: 1, diameter: 1, tessellation: 6 },
      scene,
    ),
  );
  const align = (origin: Vector3) => {
    const delta = end.subtract(origin);
    mesh.position.copyFrom(origin.add(end).scale(0.5));
    mesh.scaling.set(width, Math.max(0.001, delta.length()), width);
    mesh.rotationQuaternion = Quaternion.FromUnitVectorsToRef(
      Vector3.Up(),
      delta.normalize(),
      mesh.rotationQuaternion ?? new Quaternion(),
    );
  };
  align(start);
  if (muzzle) {
    const observer = scene.onBeforeRenderObservable.add(() => {
      if (!muzzle.isDisposed() && muzzle.isEnabled())
        align(muzzle.computeWorldMatrix(true).getTranslation());
    });
    const disposeObserver = mesh.onDisposeObservable.addOnce(() => {
      scene.onBeforeRenderObservable.remove(observer);
    });
    stopFollowing.set(mesh, () => {
      scene.onBeforeRenderObservable.remove(observer);
      mesh.onDisposeObservable.remove(disposeObserver);
    });
  }
  return mesh;
}
export function flash(scene: Scene, diameter: number) {
  const mesh = acquire(scene, "flash", () =>
    MeshBuilder.CreateSphere(
      "pooled flash",
      { diameter: 1, segments: 4 },
      scene,
    ),
  );
  mesh.scaling.setAll(diameter);
  return mesh;
}

export function shard(scene: Scene, size: number) {
  const mesh = acquire(scene, "shard", () =>
    MeshBuilder.CreateBox("pooled impact", { size: 1 }, scene),
  );
  mesh.scaling.setAll(size);
  return mesh;
}
