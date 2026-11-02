import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine, Scene, DirectionalLight, ShadowGenerator, Vector3, Mesh } from "@babylonjs/core";
import { World } from "../map/builder";
import { batchFixedMapDetails } from "../map/buildingBatch";

test("fixed detail cells preserve geometry, collision and distant culling boundaries", () => {
  const engine=new NullEngine(), scene=new Scene(engine);
  try {
    const world=new World(scene,new ShadowGenerator(32,new DirectionalLight("sun",Vector3.Down(),scene)));
    const wall=world.box("wall",0,1,0,4,2,.4,"#aabbcc",true);
    const parts=[1,2,50,51].map(x=>world.box("drop zone wall tape",x,1,0,.4,.1,.05,"#ffcc00",false,true));
    const indices=parts.reduce((n,m)=>n+m.getTotalIndices(),0);
    batchFixedMapDetails(world);
    const batches=scene.meshes.filter(m=>m.name==="fixed map detail cell rigid details");
    assert.equal(batches.length,2);
    assert.equal(batches.reduce((n,m)=>n+m.getTotalIndices(),0),indices);
    assert.deepEqual(world.solids,[wall]);
    assert.equal(world.obstacles.length,1);
    assert.equal(wall.isDisposed(),false);
    for(const m of batches) {m.computeWorldMatrix(true);assert.ok(m.getBoundingInfo().boundingBox.extendSizeWorld.x<1);assert.equal(m.isPickable,false);}
  } finally {scene.dispose();engine.dispose();}
});
