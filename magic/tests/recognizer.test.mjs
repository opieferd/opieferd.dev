import assert from "node:assert/strict";
import test from "node:test";
import {SYMBOLS,analyzeSeal,makeExample,recipes} from "../js/atelier-engine.js";

for(const symbol of SYMBOLS){
  test("recognizes "+symbol.id+" as grouped multi-stroke ink",()=>{
    const ids=symbol.role==="sigil"?[symbol.id]:["wind",symbol.id];
    const ex=makeExample(ids);
    const result=analyzeSeal(ex.strokes,ex.groups);
    assert.ok(result.recognized.some(r=>r.id===symbol.id),JSON.stringify(result.regions.map(r=>r.candidates.slice(0,2))));
  });
}
for(const recipe of recipes){
  test("recipe "+recipe.label+" compiles",()=>{
    const ex=makeExample(recipe.ids),parsed=analyzeSeal(ex.strokes,ex.groups);
    assert.equal(parsed.ir.valid,true);
    for(const symbol of recipe.ids)assert.ok(parsed.recognized.some(r=>r.id===symbol),"missing "+symbol);
    assert.ok(parsed.ir.output.text.length>25);
  });
}
for(const symbol of SYMBOLS.filter(s=>s.role==="sigil")){
  test("auto groups central "+symbol.id,()=>{
    const ex=makeExample([symbol.id]),r=analyzeSeal(ex.strokes);
    assert.ok(r.recognized.some(g=>g.id===symbol.id));
  });
}
test("rejects a missing boundary",()=>{
  const ex=makeExample(["wind","columns"]);
  const r=analyzeSeal(ex.strokes.slice(1));
  assert.equal(r.ir.valid,false);
});
test("stroke order and direction are irrelevant inside explicit groups",()=>{
  const ex=makeExample(["wind","columns"]);
  const flipped=ex.strokes.map(s=>s.slice().reverse());
  const r=analyzeSeal(flipped,ex.groups);
  assert.equal(r.ir.valid,true);
  assert.ok(r.ir.elements.includes("wind"));
  assert.ok(r.ir.signs.includes("columns"));
});
test("spell interpretation remains semantic JSON",()=>{
  const ex=makeExample(["fire","levitation"]),r=analyzeSeal(ex.strokes,ex.groups);
  assert.deepEqual(r.ir.elements,["fire"]);
  assert.deepEqual(r.ir.signs,["levitation"]);
  assert.equal(r.ir.output.title,"Pyreball");
  assert.ok(r.ir.power>=0&&r.ir.power<=100);
});
