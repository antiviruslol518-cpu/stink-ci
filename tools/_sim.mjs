// Predict the ink depth-jump term from the true geometry, per pixel column.
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
const named=(n)=>({name:n,__name:n,isMaterial:true}); const M={}; for(const n of ["cobble","wall","cope","tower","brick","brickDark","iron","steel","wood"]) M[n]=named(n);
const b=new Batch(); parl.terrace(b,M); parl.palace(b,M,48,{lit:1,lime:false}); parl.farBank(b,M); parl.sewer(b,M); parl.chamber(b,M);
const meshes=[]; for(const [mat,list] of b.g){const pos=[];for(const g of list)pos.push(...g.attributes.position.array);const geo=new THREE.BufferGeometry();geo.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));const m=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));m.name=mat.__name;meshes.push(m);}
for(const m of meshes)m.updateMatrixWorld(true);
const W=648,H=1152;
const c=story.camAt(6,601);
const cam=new THREE.PerspectiveCamera(c.fov,W/H,0.2,1500);
cam.position.set(...c.pos); cam.up.set(0,1,0); cam.lookAt(...c.look); cam.rotateZ(c.roll??0); cam.updateMatrixWorld(true);
const ray=new THREE.Raycaster(); ray.far=1200;
const ndc=new THREE.Vector2(), v=new THREE.Vector3();
function d(x,row){ ndc.set((x+0.5)/W*2-1, -((row+0.5)/H*2-1)); v.set(ndc.x,ndc.y,0.5).unproject(cam).sub(cam.position).normalize(); ray.set(cam.position,v); const h=ray.intersectObjects(meshes,false); return h.length?h[0].distance:Infinity; }
// texel step in uv = 1/W, 1/H -> exactly one pixel
for (const x of [60, 200, 324, 450, 588]) {
  console.log(`\n--- x=${x} ---   row   z(m)      s(vert)      s(horiz)`);
  for (let row=1118; row<=1136; row++) {
    const zc=d(x,row), z1=d(x,row-1), z2=d(x,row+1);
    const zl=d(x-1,row), zr=d(x+1,row);
    if(!isFinite(zc)){console.log(`  ${row} sky`);continue;}
    const Wc=1/zc;
    const sv=isFinite(z1)&&isFinite(z2)?(1/z1+1/z2-2*Wc)/Wc:NaN;
    const sh=isFinite(zl)&&isFinite(zr)?(1/zl+1/zr-2*Wc)/Wc:NaN;
    console.log(`  ${row}  ${zc.toFixed(4)}   ${sv.toExponential(2).padStart(10)}   ${sh.toExponential(2).padStart(10)}`);
  }
}
