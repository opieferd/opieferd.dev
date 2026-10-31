import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname,resolve} from "node:path";
import {recipes,makeExample,analyzeSeal,closeRingStroke} from "../js/arcana-engine.js";

for(const width of [320,390,768]){
 test("mobile geometry at "+width+" CSS pixels: all recipes stay inactive until closed",()=>{
  for(const recipe of recipes){
   const example=makeExample(recipe.ids,{
    open:true,nested:recipe.nested,rotate:recipe.rotate,spatial:recipe.spatial
   });
   // Simulate a device reporting touch positions quantized to physical CSS pixels.
   // Reduce only long smooth paths; retain deliberate corners in short angular glyphs.
   const touch=example.strokes.map(stroke=>{
    const points=stroke.length>10?stroke.filter((p,i)=>i===0||i===stroke.length-1||i%2===0):stroke;
    const mapped=points.map(p=>({x:Math.round(p.x*width)/width,y:Math.round(p.y*width)/width}));
    if(stroke.intent)mapped.intent=stroke.intent;
    return mapped;
   });
   const closing=closeRingStroke().map(p=>({
    x:Math.round(p.x*width)/width,y:Math.round(p.y*width)/width
   }));
   const preparing=analyzeSeal(touch),casting=analyzeSeal([...touch,closing]);
   assert.equal(preparing.ready,false,recipe.label+" prematurely cast on "+width+"px");
   assert.equal(casting.ready,true,recipe.label+" ring failed on "+width+"px");
   assert.equal(casting.ir.valid,true,recipe.label+" invalid on "+width+"px");
   for(const id of recipe.ids){
    assert.ok(casting.recognized.some(x=>x.id===id),
      recipe.label+" missing "+id+" on "+width+"px");
   }
   assert.equal(casting.ir.output.title,recipe.label,
      recipe.label+" was renamed at "+width+"px");
  }
 });
}
test("mobile pointer cancellation cannot be treated as a completed casting stroke",()=>{
 const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
 const source=readFileSync(resolve(root,"js/atelier-app.js"),"utf8");
 assert.match(source,/pointercancel",e=>stopStroke\(true,e\)/);
 assert.match(source,/lostpointercapture",e=>stopStroke\(true,e\)/);
 assert.match(source,/const completed=!cancelled&&active/);
 assert.match(source,/if\(completed\)refresh\(\{checkClosure:true\}\)/);
});
test("touch drawing is frame-scheduled rather than repainted for every event",()=>{
 const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
 const js=readFileSync(resolve(root,"js/atelier-app.js"),"utf8");
 const css=readFileSync(resolve(root,"css/atelier.css"),"utf8");
 assert.match(js,/function requestPaint\(\)/);
 assert.match(js,/requestAnimationFrame\(\(\)=>\{/);
 assert.match(css,/#magic-ink\{[^}]*touch-action:none/);
});
