import assert from "node:assert/strict";
import test from "node:test";
import {SYMBOLS, analyzeSeal, makeExample, closeRingStroke, recipes} from "../js/atelier-engine.js";

for(const symbol of SYMBOLS){
  test("recognizes multi-stroke "+symbol.id+" automatically",()=>{
    const ids=symbol.role==="sigil"?[symbol.id]:["wind",symbol.id];
    const sample=makeExample(ids,{open:true}),result=analyzeSeal(sample.strokes);
    assert.equal(result.ready,false,"must not cast with an unclosed ring");
    assert.ok(result.recognized.some(x=>x.id===symbol.id));
  });
}
for(const recipe of recipes){
  test("recipe "+recipe.label+" stays inactive until its ring closes",()=>{
    const sample=makeExample(recipe.ids,{open:true});
    const prepared=analyzeSeal(sample.strokes);
    assert.equal(prepared.ready,false);
    assert.equal(prepared.ir.valid,false);
    for(const id of recipe.ids)assert.ok(prepared.recognized.some(g=>g.id===id),"prepared missing "+id);
    const completed=analyzeSeal([...sample.strokes,closeRingStroke()]);
    assert.equal(completed.ready,true);
    assert.equal(completed.ir.valid,true);
    assert.equal(completed.completion.type,"joined-strokes");
    assert.equal(completed.completion.completedAt,sample.strokes.length);
    for(const id of recipe.ids)assert.ok(completed.recognized.some(g=>g.id===id),"closed missing "+id);
  });
}
test("single-stroke complete outer ring activates a spell",()=>{
  const example=makeExample(["fire","levitation"]);
  const stillPreparing=analyzeSeal(example.strokes.slice(0,-1));
  const afterClosing=analyzeSeal(example.strokes);
  assert.equal(stillPreparing.ready,false);
  assert.equal(afterClosing.ready,true);
  assert.equal(afterClosing.completion.completedAt,example.strokes.length-1);
  assert.equal(afterClosing.ir.output.title,"Pyreball");
});
test("incomplete circle cannot trigger magic",()=>{
  const ex=makeExample(["wind","columns"],{open:true});
  assert.equal(analyzeSeal(ex.strokes).ready,false);
  assert.equal(analyzeSeal(ex.strokes).ir.valid,false);
});
test("empty completed ring produces a shockwave",()=>{
  const ex=makeExample([]);
  const result=analyzeSeal(ex.strokes);
  assert.equal(result.ir.valid,true);
  assert.equal(result.ir.output.title,"Empty-Ring Shockwave");
});
test("two-stroke ring closure works in either direction",()=>{
  const sample=makeExample(["wind","columns"],{open:true});
  const joiningStroke=closeRingStroke();
  const forward=analyzeSeal([...sample.strokes,joiningStroke]);
  const reversed=analyzeSeal([...sample.strokes,joiningStroke.slice().reverse()]);
  assert.equal(forward.ready,true);
  assert.equal(reversed.ready,true);
});
test("drawing order and stroke direction within a sigil are flexible",()=>{
  const ex=makeExample(["wind","columns"]),flipped=ex.strokes.map(s=>s.slice().reverse());
  assert.equal(analyzeSeal(flipped).ir.valid,true);
  assert.deepEqual(analyzeSeal(flipped).ir.elements,["wind"]);
});
test("cast IR remains portable JSON",()=>{
  const ex=makeExample(["water","columns"]),result=analyzeSeal(ex.strokes);
  assert.deepEqual(result.ir.elements,["water"]);
  assert.deepEqual(result.ir.signs,["columns"]);
  assert.equal(result.ir.output.title,"Watershot");
  assert.ok(result.ir.power>=0&&result.ir.power<=100);
});
test("noisy columns still differ from dispersion",()=>{
  const ex=makeExample(["wind","columns"],{open:true});
  const strokes=ex.strokes.map((s,i)=>s.map((p,j)=>({
    x:p.x+Math.sin((i+12)*3.9+j*12.3)*.006,
    y:p.y+Math.cos(i*8.9+j*6.5)*.006
  })));
  const out=analyzeSeal([...strokes,closeRingStroke()]);
  assert.deepEqual(out.ir.signs,["columns"]);
  assert.equal(out.ir.output.title,"Wind Blast");
});
