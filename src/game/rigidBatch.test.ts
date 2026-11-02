import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine, Scene, DirectionalLight, ShadowGenerator, Vector3, TransformNode, MeshBuilder, StandardMaterial } from "@babylonjs/core";
import { batchRigidAssembly } from "../weapons/rigidBatch";
import type { World } from "../map/builder";

test("rigid batches preserve transformed vertices and follow their moving parent", () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const shadows = new ShadowGenerator(32, new DirectionalLight("sun", Vector3.Down(), scene));
    const root = new TransformNode("moving assembly", scene);
    root.position.set(42, 9, -23); root.rotation.y = .7; root.scaling.set(1.2, .8, 1.1);
    const material = new StandardMaterial("shared", scene);
    const parts = [-1, 1].map(x => { const m = MeshBuilder.CreateBox("detail", {}, scene); m.parent=root; m.position.x=x; m.material=material; m.isPickable=false; shadows.addShadowCaster(m); return m; });
    const vertices = (meshes: typeof parts) => meshes.flatMap(m => { m.computeWorldMatrix(true); const p=m.getVerticesData("position")!; const out: string[]=[]; for(let i=0;i<p.length;i+=3) {const v=Vector3.TransformCoordinates(Vector3.FromArray(p,i),m.getWorldMatrix()); out.push([v.x,v.y,v.z].map(x=>x.toFixed(3)).join(","));} return out; }).sort();
    const before=vertices(parts);
    batchRigidAssembly({ shadows } as World,root,parts);
    const merged=root.getChildMeshes();
    assert.equal(merged.length,1);
    assert.deepEqual(vertices(merged as typeof parts),before);
    assert.ok(shadows.getShadowMap()!.renderList!.includes(merged[0]));
    root.position.x+=10;
    const moved=vertices(merged as typeof parts);
    assert.notDeepEqual(moved,before);
    assert.equal(merged[0].parent,root);
  } finally {scene.dispose();engine.dispose();}
});
