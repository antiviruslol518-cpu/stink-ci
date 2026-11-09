import * as THREE from "three";
import { build } from "esbuild";
import path from "node:path";
const load = async (rel) => {
  const r = await build({ entryPoints: [path.resolve(rel)], bundle: true, write: false, format: "esm", platform: "neutral", target: "es2020", logLevel: "silent" });
  return import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));
};
const story = await load("src/videos/stink/story.ts");
const parl = await load("src/videos/stink/parliament.ts");
class Batch { constructor(){this.g=new Map();} add(geo,mat){const s=geo.index?geo.toNonIndexed():geo;const x=new THREE.BufferGeometry();x.setAttribute("position",new THREE.Float32BufferAttribute(s.attributes.position.array.slice(),3));const l=this.g.get(mat);if(l)l.push(x);else this.g.set(mat,[x]);} }
const named=(n)=>({name:n,__name:n,isMaterial:true}); const M={}; for(const n of ["cobble","wall","cope","tower","brick","brickDark","iron","steel","wood","glass","mat4","mat9"]) M[n]=named(n);
const b=new Batch();
parl.terrace(b,M); parl.palace(b,M,48,{lit:1,lime:false}); parl.farBank(b,M); parl.sewer(b,M); parl.chamber(b,M); parl.flotsam(b,M);
const meshes=[]; for(const [mat,list] of b.g){const pos=[];for(const g of list)pos.push(...g.attributes.position.array);const geo=new THREE.BufferGeometry();geo.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));const m=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));m.name=mat.__name;meshes.push(m);}
for(const m of meshes)m.updateMatrixWorld(true);
const W=648,H=1152;
const c=story.camAt(6,601);
const cam=new THREE.PerspectiveCamera(c.fov,W/H,0.2,1500);
cam.position.set(...c.pos); cam.up.set(0,1,0); cam.lookAt(...c.look); cam.rotateZ(c.roll??0); cam.updateMatrixWorld(true);
const ray=new THREE.Raycaster(); ray.far=1200;
const ndc=new THREE.Vector2(), v=new THREE.Vector3();
for (const row of [1123,1124,1125,1126,1127,1128,1129,1130,1131]) {
  ndc.set((324/W)*2-1, -((row/H)*2-1));
  v.set(ndc.x,ndc.y,0.5).unproject(cam).sub(cam.position).normalize();
  ray.set(cam.position,v);
  const hits=ray.intersectObjects(meshes,false);
  console.log(`row ${row}: ${hits.length} hit(s)`);
  for (const h of hits.slice(0,6)) console.log(`    ${h.object.name.padEnd(10)} d=${h.distance.toFixed(4)}  p=(${h.point.x.toFixed(2)}, ${h.point.y.toFixed(3)}, ${h.point.z.toFixed(3)})`);
}
