import { build } from "esbuild"; import path from "node:path";
const load = async (rel) => { const r = await build({ entryPoints:[path.resolve(rel)], bundle:true, write:false, format:"esm", platform:"neutral", target:"es2020", logLevel:"silent" });
  return import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64")); };
const story = await load("src/videos/stink/story.ts");
console.log("frame  pos                    look                   fov   roll");
let prev=null;
for (let f=596; f<=606; f++){
  const c=story.camAt(6,f);
  const d = prev ? Math.hypot(c.pos[0]-prev.pos[0], c.pos[1]-prev.pos[1], c.pos[2]-prev.pos[2]) : 0;
  console.log(`${f}  [${c.pos.map(v=>v.toFixed(4)).join(", ")}]  [${c.look.map(v=>v.toFixed(3)).join(", ")}]  ${c.fov}  ${(c.roll??0)}   dpos=${d.toFixed(5)}`);
  prev=c;
}
console.log("\n-- layer/crossfade? --");
for (let f=596; f<=606; f++) console.log(f, JSON.stringify(story.layersAt(f)));
