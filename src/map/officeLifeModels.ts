import { Mesh, MeshBuilder, Vector3 } from "@babylonjs/core";
import type { World } from "./builder";

/** Recognizable silhouettes; shared finishes and rigid material batches keep these inexpensive. */
export function officeModelTools(world: World, x=0, z=0) {
  const parts: Mesh[]=[];
  const finish=(m:Mesh,color:string,surface:"metal"|"polymer"|"fabric"="polymer")=>{
    m.material=world.finish(color,surface); m.isPickable=false;
    m.metadata={visualOnly:true}; world.shadows?.removeShadowCaster(m); parts.push(m); return m;
  };
  const box=(name:string,px:number,y:number,pz:number,w:number,h:number,d:number,color:string,surface:"metal"|"polymer"|"fabric"="polymer")=>finish(world.box(name,x+px,y,z+pz,w,h,d,color),color,surface);
  const cylinder=(name:string,px:number,y:number,pz:number,diameter:number,height:number,color:string,top=diameter)=>{
    const m=MeshBuilder.CreateCylinder(name,{diameterBottom:diameter,diameterTop:top,height,tessellation:12},world.scene);m.position.set(x+px,y,z+pz);return finish(m,color,"metal");
  };
  const tube=(name:string,points:number[][],radius:number,color:string)=>finish(MeshBuilder.CreateTube(name,{path:points.map(v=>new Vector3(x+v[0],v[1],z+v[2])),radius,tessellation:8,cap:Mesh.CAP_ALL},world.scene),color,"metal");
  const ring=(name:string,px:number,y:number,pz:number,diameter:number,thickness:number,color:string)=>{
    const m=MeshBuilder.CreateTorus(name,{diameter,thickness,tessellation:16},world.scene);m.position.set(x+px,y,z+pz);return finish(m,color);
  };
  return {parts,box,cylinder,tube,ring,finish};
}
export function detailedOfficeModel(world:World,kind:string,x:number,z:number,w:number,d:number) {
 const t=officeModelTools(world,x,z),{box,cylinder,tube,ring}=t;
 if(kind==="coat rack") {
  cylinder("coat rack weighted circular foot",0,.055,0,.65,.1,"#424e53");
  cylinder("coat rack brushed steel mast",0,1.08,0,.055,2.08,"#9ba5a6");
  for(const side of [-1,1]){
   tube("coat rack curved hook",[[0,1.86,0],[side*.28,1.96,0],[side*.36,2.05,0]],.025,"#9ba5a6");
   const a=side*.22,c=side<0?"#536572":"#997961";
   tube("jacket hanger",[[a-.18,1.69,0],[a,1.81,0],[a+.18,1.69,0]],.015,"#9ba5a6");
   box("tailored jacket body",a,1.33,0,.34,.72,.18,c,"fabric");
   for(const s of [-1,1]){
    const arm=box("jacket draped sleeve",a+s*.23,1.41,0,.14,.58,.16,c,"fabric");arm.rotation.z=s*.3;
    const lapel=box("jacket folded lapel",a+s*.065,1.57,-.102,.075,.24,.025,"#b0a08c","fabric");lapel.rotation.z=s*.25;
    box("jacket pocket",a+s*.09,1.18,-.1,.1,.08,.018,c,"fabric");
   }
   box("jacket opening seam",a,1.3,-.105,.016,.5,.015,"#2f3c45");
   for(let i=0;i<3;i++) cylinder("jacket button",a+.035,1.45-i*.12,-.12,.026,.02,"#c3b99f").rotation.x=Math.PI/2;
  }
  box("leather satchel",.25,.26,.24,.36,.4,.18,"#775a42","fabric");
  tube("satchel handle",[[.13,.45,.24],[.13,.57,.24],[.36,.57,.24],[.36,.45,.24]],.018,"#594637");
  box("satchel clasp",.25,.32,.14,.07,.08,.02,"#baa279","metal");
 } else if(kind==="fallen chair") {
  // Model a complete chair first, then tip all its vertices together about a common pivot.
  box("fallen chair upholstered seat",0,.65,0,.63,.14,.6,"#526a72","fabric");
  box("fallen chair curved back",0,1.02,.26,.6,.65,.13,"#526a72","fabric");
  cylinder("fallen chair gas lift",0,.4,0,.075,.43,"#a2aaac");
  for(let i=0;i<5;i++){const a=i*Math.PI*2/5,xx=Math.cos(a)*.4,zz=Math.sin(a)*.4;
   tube("chair five star base",[[0,.2,0],[xx,.13,zz]],.035,"#485358");
   const wheel=cylinder("chair caster",xx,.1,zz,.14,.06,"#293338");wheel.rotation.z=Math.PI/2;
  }
  for(const s of [-1,1])tube("chair armrest",[[s*.32,.67,.12],[s*.32,.88,.12],[s*.32,.88,-.18]],.035,"#35434a");
  for(const m of t.parts){m.position.subtractInPlace(new Vector3(x,0,z));m.bakeCurrentTransformIntoVertices();m.rotation.z=-1.25;m.bakeCurrentTransformIntoVertices();m.position.set(x-.25,.62,z);}
 } else if(kind==="whiteboard") {
  box("whiteboard aluminium surround",0,1.34,0,w,1.16,.09,"#a5afb1","metal");
  box("whiteboard porcelain face",0,1.34,-.055,w-.09,1.07,.025,"#e3e7df");
  for(const s of [-1,1]){
   cylinder("whiteboard frame upright",s*(w/2-.12),.65,0,.045,1.2,"#a5afb1");
   tube("whiteboard stabilizer",[[s*(w/2-.12),.12,-.32],[s*(w/2-.12),.12,.32]],.035,"#a5afb1");
   for(const zz of [-.29,.29])cylinder("whiteboard caster",s*(w/2-.12),.075,zz,.13,.055,"#2b363c").rotation.z=Math.PI/2;
  }
  box("whiteboard marker tray",0,.75,-.12,w*.8,.035,.17,"#a5afb1","metal");
  for(let i=0;i<3;i++)box("whiteboard marker pen",-.35+i*.2,.78,-.13,.13,.025,.025,["#b55b50","#3c6179","#334e45"][i]);
  for(let i=0;i<6;i++)box("whiteboard coloured sticky note",-.7+(i%3)*.3,1.52-Math.floor(i/3)*.22,-.074,.19,.15,.008,["#e2c565","#9ebaa7","#c28d80"][i%3]);
  for(let i=0;i<4;i++)box("whiteboard handwritten chart",.52,1.55-i*.13,-.075,.4-i*.06,.018,.008,"#496778");
 } else if(kind==="boxes") {
  for(let i=0;i<3;i++){const xx=i===2?-.17:(i-.5)*.8,yy=i===2?.88:.31,zz=i===2?.05:0;
   box("corrugated archive carton",xx,yy,zz,.73,.58,.66,"#af8c60","fabric");
   box("carton lid",xx,yy+.3,zz,.76,.05,.69,"#c2a074","fabric");
   box("carton packing tape",xx,yy+.329,zz,.11,.009,.69,"#d0b78a");
   box("archive label",xx,yy+.03,zz-.335,.31,.18,.012,"#e4dbc2");
   for(let k=0;k<3;k++)box("archive label writing",xx,yy+.07-k*.04,zz-.344,.22-k*.035,.012,.008,"#605d53");
   box("carton handhold",xx,yy+.19,zz-.34,.2,.055,.015,"#4d4032");
  }
 } else if(kind==="bin") {
  cylinder("wastebasket steel body",0,.36,0,.46,.68,"#64757a",.56);
  cylinder("wastebasket dark opening",0,.705,0,.49,.01,"#28383d");
  ring("wastebasket rolled lip",0,.71,0,.53,.035,"#a0aaab");
  for(let i=0;i<10;i++){const a=i*Math.PI/5;box("basket vertical slot",Math.cos(a)*.25,.39,Math.sin(a)*.25,.025,.43,.025,"#34474c");}
  for(let i=0;i<5;i++){const m=MeshBuilder.CreateIcoSphere("crumpled office paper",{radius:.1,subdivisions:1},world.scene);m.position.set(x+Math.sin(i*3)*.14,.73+(i%2)*.06,z+Math.cos(i*3)*.14);t.finish(m,"#e1ddcc");}
 } else if(kind==="coffee") {
  box("coffee station cabinet",0,.48,0,w,.9,d,"#6b5948","fabric");
  box("coffee station stone top",0,.96,0,w+.05,.08,d+.04,"#b9b8ac");
  for(const s of [-1,1]){box("cabinet door",s*w*.245,.49,-d/2-.01,w*.47,.78,.025,"#806b54","fabric");box("cabinet handle",s*.09,.7,-d/2-.04,.025,.16,.03,"#aeb6b4","metal");}
  box("espresso machine housing",0,1.29,.08,.57,.58,.44,"#37484e");
  box("espresso brushed face",0,1.32,-.15,.49,.43,.025,"#aab1ad","metal");
  box("espresso dispensing recess",0,1.2,-.171,.32,.23,.018,"#203037");
  box("espresso drip tray",0,1.025,-.2,.4,.04,.23,"#818f91","metal");
  for(const s of [-1,1]){cylinder("espresso spout",s*.065,1.3,-.2,.035,.08,"#c2c7c3");cylinder("coffee cup",s*.065,1.09,-.2,.09,.1,"#dedbc9");}
  box("espresso display",0,1.48,-.172,.2,.065,.015,"#63968c");
  cylinder("thermos steel flask",w*.36,1.22,.04,.16,.42,"#a8b3b1");cylinder("thermos black cap",w*.36,1.44,.04,.17,.05,"#34474c");
 } else return false;
 return true;
}
