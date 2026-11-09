import * as THREE from "three";
const { build } = await import("esbuild");
const load = async (rel) => {
  const r = await build({ entryPoints: [rel], bundle: true, write: false, format: "esm",
    platform: "neutral", target: "es2020", logLevel: "silent" });
  return import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));
};
const parl = await load("src/videos/stink/parliament.ts");
const geos=[]; const bb={add:(g)=>{geos.push(g);}};
const M={cobble:{isMaterial:true,__name:"cobble"},wall:{isMaterial:true,__name:"wall"}};
parl.terrace(bb,M);
const floor=geos.slice(0,64);
// Fit uv = A*x + B*z + C per uv component over all distinct vertices
const pts=[];
for(const g of floor){const p=g.attributes.position.array,uv=g.attributes.uv.array;
  for(let i=0;i<p.length;i+=3){
    const idx=i/3; pts.push([p[i],p[i+2],uv[idx*2],uv[idx*2+1]]);
  }}
// least squares for each uv comp
function fit(col){
  // design [x, z, 1]
  let M=[[0,0,0],[0,0,0],[0,0,0]], rhs=[0,0,0];
  for(const r of pts){const X=[r[0],r[1],1];
    for(let i=0;i<3;i++){for(let j=0;j<3;j++)M[i][j]+=X[i]*X[j]; rhs[i]+=X[i]*r[col];}}
  // solve 3x3
  const inv=(m)=>{const [a,b,c]=m[0],[d,e,f]=m[1],[g,h,i]=m[2];
    const det=a*(e*i-f*h)-b*(d*i-f*g)+c*(d*h-e*g);
    return [[(e*i-f*h)/det,(c*h-b*i)/det,(b*f-c*e)/det],
            [(f*g-d*i)/det,(a*i-c*g)/det,(c*d-a*f)/det],
            [(d*h-e*g)/det,(b*g-a*h)/det,(a*e-b*d)/det]];};
  const I=inv(M);
  return [0,1,2].map(k=>I[k][0]*rhs[0]+I[k][1]*rhs[1]+I[k][2]*rhs[2]);
}
const fu=fit(2), fv=fit(3);
console.log(`u = ${fu[0].toFixed(6)}*x + ${fu[1].toFixed(6)}*z + ${fu[2].toFixed(4)}   -> m/uv along x: ${(1/Math.abs(fu[0])).toFixed(4)}, along z: ${Math.abs(fu[1])>1e-9?(1/Math.abs(fu[1])).toFixed(4):"indep"}`);
console.log(`v = ${fv[0].toFixed(6)}*x + ${fv[1].toFixed(6)}*z + ${fv[2].toFixed(4)}   -> m/uv along x: ${Math.abs(fv[0])>1e-9?(1/Math.abs(fv[0])).toFixed(4):"indep"}, along z: ${(1/Math.abs(fv[1])).toFixed(4)}`);
let maxr=0;
for(const r of pts){maxr=Math.max(maxr,Math.abs(r[2]-(fu[0]*r[0]+fu[1]*r[1]+fu[2])),Math.abs(r[3]-(fv[0]*r[0]+fv[1]*r[1]+fv[2])));}
console.log("max residual from the affine fit:",maxr.toExponential(2));
