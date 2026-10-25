import { officeModelTools } from "./officeLifeModels";
import { Mesh, MeshBuilder, TransformNode, Vector3 } from "@babylonjs/core";
import type { World } from "./builder";
import type { Obstacle } from "../game/collision";
import { blocked, move } from "../game/collision";
import { mergeStaticParts } from "../weapons/staticModel";
import { office01 } from "../maps/office01";
export interface CartState {
  id: number;
  x: number;
  z: number;
}
export class CleaningCarts {
  readonly carts: {
    id: number;
    root: TransformNode;
    body: Mesh;
    obstacle: Obstacle;
    start: Vector3;
  }[] = [];
  constructor(private world: World) {}
  add(x: number, z: number) {
    const world = this.world,
      scene = world.scene;
    const root = new TransformNode("pushable cleaning cart", scene);
    root.position.set(x, 0, z);
    const body = world.box(
      "cleaning cart collider",
      x,
      0.58,
      z,
      1.1,
      1.16,
      0.7,
      "#3c6267",
      true,
    );
    body.visibility = 0;
    world.shadows.removeShadowCaster(body);
    const obstacle = world.obstacles[world.obstacles.length - 1];
    if (!world.authoritative) {
      const visualStart = new Set(scene.meshes);
      const {parts,box,cylinder,tube,ring}=officeModelTools(world);
      box("cart molded chassis",0,.27,0,1.1,.12,.68,"#3e6b72");
      box("cart upper supply tray",-.1,.87,0,.84,.065,.62,"#477a80");
      for(const y of [.34,.92])for(const z of [-.3,.3])box("cart raised tray lip",-.08,y,z,.94,.1,.035,"#477a80");
      for(const x of [-.45,.36])for(const z of [-.25,.25]){
        cylinder("cart tubular frame",x,.63,z,.045,.77,"#a5b2b1");
        box("cart caster fork",x,.17,z,.07,.17,.13,"#a5b2b1","metal");
        const wheel=cylinder("cart rubber wheel",x,.115,z,.21,.085,"#28363c");wheel.rotation.z=Math.PI/2;
        const hub=cylinder("cart wheel hub",x,.115,z,.085,.095,"#9ca8a8");hub.rotation.z=Math.PI/2;
      }
      tube("cart bent push handle",[[-.47,.85,-.27],[-.57,1.14,-.27],[-.57,1.19,0],[-.57,1.14,.27],[-.47,.85,.27]],.03,"#a5b2b1");
      tube("cart rubber hand grip",[[-.57,1.18,-.16],[-.57,1.18,.16]],.04,"#293a40");
      cylinder("yellow mop bucket",.26,.57,0,.36,.46,"#cba747",.44);
      cylinder("bucket interior shadow",.26,.804,0,.37,.012,"#5b6859");
      ring("bucket thick rolled rim",.26,.81,0,.42,.035,"#dfbd5b");
      tube("bucket carry handle",[[.05,.76,0],[.05,1.04,0],[.47,1.04,0],[.47,.76,0]],.016,"#a4afac");
      box("bucket wringer",.27,.84,.1,.3,.12,.16,"#ddb951");
      for(let i=0;i<5;i++)box("wringer slots",.16+i*.055,.906,.1,.025,.008,.12,"#746e43");
      tube("mop steel shaft",[[-.32,.12,.23],[-.25,1.83,.23]],.018,"#a5b2b1");
      cylinder("mop grip",-.25,1.78,.23,.045,.23,"#3c6c72");
      for(let i=0;i<10;i++)tube("mop cotton strands",[[-.32,.18,.23],[-.49+i*.035,.065,.25+(i%2)*.08]],.019,"#ccc8ad");
      box("cart hanging refuse sack",-.38,.56,-.02,.3,.47,.42,"#303c40","fabric");
      ring("refuse sack open rim",-.38,.81,-.02,.31,.035,"#4d5756");
      for(let i=0;i<3;i++){
        const x=-.31+i*.18,c=["#80a794","#b77e66","#7b9cae"][i];
        cylinder("cleaning detergent bottle",x,1.04,-.16,.12,.26,c,.09);
        cylinder("bottle neck",x,1.2,-.16,.045,.06,"#deded1");
        box("spray trigger head",x,1.24,-.17,.08,.05,.12,"#deded1");
        box("spray trigger lever",x,1.18,-.22,.025,.08,.025,"#deded1");
        box("detergent label",x,1.04,-.224,.075,.11,.008,"#e2dfc9");
      }
      for(let i=0;i<3;i++)box("folded microfiber towel",-.06,.93+i*.033,.13,.32,.028,.19,["#b49785","#8fa9a1","#c2b89d"][i],"fabric");
      mergeStaticParts(world, parts);
      // Merged parts are in cart-local coordinates, then parented once.
      for (const m of scene.meshes) if (!visualStart.has(m)) m.parent = root;
    }
    this.carts.push({
      id: this.carts.length,
      root,
      body,
      obstacle,
      start: new Vector3(x, 0, z),
    });
  }
  push(
    player: { x: number; z: number },
    dx: number,
    dz: number,
    radius: number,
  ) {
    if (!dx && !dz) return;
    for (const cart of this.carts) {
      const o = cart.obstacle;
      if ((o.x - player.x) * dx + (o.z - player.z) * dz <= 0) continue;
      if (!blocked(player.x + dx, player.z + dz, radius, [o])) continue;
      const candidate = { x: o.x, z: o.z };
      move(
        candidate,
        dx,
        dz,
        0.67,
        this.world.obstacles.filter((b) => b !== o),
      );
      const onFloor = office01.footprint.some(
        (b) =>
          Math.abs(candidate.x - b.x) <= b.w / 2 - 0.65 &&
          Math.abs(candidate.z - b.z) <= b.d / 2 - 0.65,
      );
      if (onFloor) this.set(cart.id, candidate.x, candidate.z);
    }
  }
  private set(id: number, x: number, z: number) {
    const c = this.carts[id];
    if (!c) return;
    c.obstacle.x = x;
    c.obstacle.z = z;
    c.root.position.set(x, 0, z);
    c.body.position.set(x, 0.58, z);
    c.body.computeWorldMatrix(true);
  }
  snapshot(): CartState[] {
    return this.carts.map((c) => ({
      id: c.id,
      x: c.obstacle.x,
      z: c.obstacle.z,
    }));
  }
  sync(states: readonly CartState[]) {
    for (const c of states)
      if (Number.isFinite(c.x) && Number.isFinite(c.z))
        this.set(c.id, c.x, c.z);
  }
  reset() {
    for (const c of this.carts) this.set(c.id, c.start.x, c.start.z);
  }
}
