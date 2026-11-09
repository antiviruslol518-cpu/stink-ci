import { build } from "esbuild"; import path from "node:path";
const load = async (rel) => { const r = await build({ entryPoints:[path.resolve(rel)], bundle:true, write:false, format:"esm", platform:"neutral", target:"es2020", logLevel:"silent" });
  return import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64")); };
const story = await load("src/videos/stink/story.ts");
for (let f=1838; f<=1842; f++){
  const l=story.layersAt(f);
  const c=story.camAt(l[0].id, f);
  console.log(`${f} layers=${JSON.stringify(l)} cam=[${c.pos.map(v=>v.toFixed(3))}] fov=${c.fov}`);
}
console.log("--- shots ---");
console.log(JSON.stringify(story.SHOTS?.slice(11,14) ?? null).slice(0,300));
