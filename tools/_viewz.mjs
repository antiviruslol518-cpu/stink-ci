// Compare the RENDERED depth (term-4 probe) with the GEOMETRY, in the same units.
// dist() in ink.ts is -viewZ (the camera-forward component), NOT the Euclidean ray distance,
// so a raycast must be projected onto the forward axis before it can be compared.
import * as THREE from "three";
import { build } from "esbuild";
import path from "node:path";
const load = async (rel) => {
  const r = await build({ entryPoints: [path.resolve(rel)], bundle: true, write: false, format: "esm", platform: "neutral", target: "es2020", logLevel: "silent" });
  return import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));
};
const story = await load("src/videos/stink/story.ts");
const parl = await load("src/videos/stink/parliament.ts");
class Batch { constructor(){this.g=new Map();} add(geo,mat){ const src=geo.index?geo.toNonIndexed():geo; const x=new THREE.BufferGeometry(); x.setAttribute("position",new THREE.Float32BufferAttribute(src.attributes.position.array.slice(),3)); const l=this.g.get(mat); if(l)l.push(x); else this.g.set(mat,[x]); } }
const named=(n)=>({name:n,__name:n,isMaterial:true});
const M={}; for(const n of ["cobble","wall","cope","tower","brick","brickDark","iron","steel","wood","glass","mat4","mat9"]) M[n]=named(n);
const b=new Batch(); parl.terrace(b,M); parl.palace(b,M,parl.PARLIAMENT?.PALACE_Z??48,{lit:1,lime:false}); parl.farBank(b,M); parl.sewer(b,M); parl.chamber(b,M);
const meshes=[];
for(const [mat,list] of b.g){ const pos=[]; for(const g of list) pos.push(...g.attributes.position.array);
  const geo=new THREE.BufferGeometry(); geo.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
  const mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({side:THREE.DoubleSide})); mesh.name=mat.__name; meshes.push(mesh); }
for(const m of meshes) m.updateMatrixWorld(true);
const W=1080,H=1920;
const c=story.camAt(6,601);
const cam=new THREE.PerspectiveCamera(c.fov,W/H,0.2,1500);
cam.position.set(...c.pos); cam.up.set(0,1,0); cam.lookAt(...c.look); cam.rotateZ(c.roll??0); cam.updateMatrixWorld(true);
const fwd=new THREE.Vector3(); cam.getWorldDirection(fwd);
const ray=new THREE.Raycaster(); ray.far=1200;
const ndc=new THREE.Vector2(); const v=new THREE.Vector3(); const tmp=new THREE.Vector3();
console.log("row   hits | nearest: surface  dist  viewZ | all viewZs");
for(let row=1834;row<=1920;row++){
  ndc.set(0, -((row/H)*2-1));
  v.set(ndc.x,ndc.y,0.5).unproject(cam).sub(cam.position).normalize();
  ray.set(cam.position,v);
  const hits=ray.intersectObjects(meshes,false);
  if(!hits.length){ console.log(`${row}  (sky)`); continue; }
  const vz=hits.map(h=>tmp.subVectors(h.point,cam.position).dot(fwd));
  console.log(`${row}  ${hits.length} | ${hits[0].object.name.padEnd(9)} ${hits[0].distance.toFixed(3)} ${vz[0].toFixed(4)} | ${vz.map(x=>x.toFixed(3)).join(", ")}`);
}
