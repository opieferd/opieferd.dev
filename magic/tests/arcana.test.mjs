import test from "node:test";
import assert from "node:assert/strict";
import {SYMBOLS,TIERS,recipes,analyzeSeal,makeExample,closeRingStroke} from "../js/arcana-engine.js";

test("the grimoire has three progressive chapters",()=>{
  assert.deepEqual(TIERS.map(x=>x.id),["beginner","intermediate","advanced"]);
  assert.equal(recipes.filter(r=>r.tier==="beginner").length,6);
  assert.equal(recipes.filter(r=>r.tier==="intermediate").length,8);
  assert.equal(recipes.filter(r=>r.tier==="advanced").length,14);
});
for(const recipe of recipes){
  test("prepares and casts "+recipe.label+" ("+recipe.tier+")",()=>{
    const example=makeExample(recipe.ids,{nested:recipe.nested,rotate:recipe.rotate,spatial:recipe.spatial,open:true});
    const pending=analyzeSeal(example.strokes);
    assert.equal(pending.ready,false,"unfinished outer ring must never cast");
    assert.equal(pending.ir.valid,false);
    for(const id of recipe.ids)assert.ok(pending.recognized.some(x=>x.id===id),"unrecognized prepared "+id);
    const done=analyzeSeal([...example.strokes,closeRingStroke()]);
    assert.equal(done.ready,true);
    assert.equal(done.ir.valid,true);
    assert.deepEqual(done.ir.elements.concat(done.ir.signs).sort(),recipe.ids.slice().sort());
    assert.equal(done.ir.tier,recipe.tier);
    assert.equal(done.ir.output.title,recipe.label);
    assert.equal(done.innerRings.length,recipe.nested||0);
    assert.equal(done.completion.completedAt,example.strokes.length);
    assert.equal(done.completion.type,"joined-strokes");
  });
}
test("inner rings do not activate spells",()=>{
  for(const nested of [1,2]){
    const example=makeExample(["fire","orbit"],{nested,open:true});
    const prepared=analyzeSeal(example.strokes);
    assert.equal(prepared.ready,false);
    assert.equal(prepared.innerRings.length,nested);
    const cast=analyzeSeal([...example.strokes,closeRingStroke()]);
    assert.equal(cast.ir.valid,true);
    assert.equal(cast.ir.tier,"advanced");
  }
});
test("rotation changes direction without changing sign identity",()=>{
  const compass=["north","northeast","east","southeast","south","southwest","west","northwest"];
  for(let i=0;i<8;i++){
    const example=makeExample(["wind","veer"],{rotate:i*45,open:true});
    const reading=analyzeSeal([...example.strokes,closeRingStroke()]);
    assert.equal(reading.ir.direction,compass[i]);
    assert.ok(reading.recognized.some(g=>g.id==="veer"&&g.rotationDegrees===i*45));
  }
});
test("advanced combinations produce multiple semantic effects",()=>{
  const ex=makeExample(["fire","wind","veer","split"],{rotate:90,open:true});
  const out=analyzeSeal([...ex.strokes,closeRingStroke()]);
  assert.equal(out.ir.tier,"advanced");
  assert.equal(out.ir.effects.length,2);
  assert.ok(out.ir.output.text.includes("bends"));
  assert.ok(out.ir.output.text.includes("divides"));
});
test("empty completed ring still casts an empty-ring pulse",()=>{
  const ex=makeExample([],{open:false});
  const cast=analyzeSeal(ex.strokes);
  assert.equal(cast.ir.valid,true);
  assert.equal(cast.ir.output.title,"Empty-Ring Shockwave");
});
test("closing only an inner ring never casts",()=>{
  const ex=makeExample(["water"],{nested:1,open:true});
  const onlyInner=ex.strokes.slice(0,-1);
  const out=analyzeSeal(onlyInner);
  assert.equal(out.ready,false);
});
test("all four elemental glyphs and experimental signs are distinguishable",()=>{
  assert.equal(SYMBOLS.filter(x=>x.role==="sigil").length,4);
  assert.equal(SYMBOLS.filter(x=>x.experimental).length,3);
  for(const s of SYMBOLS){
    const ids=s.role==="sigil"?[s.id]:["wind",s.id];
    const ex=makeExample(ids,{open:false});
    const reading=analyzeSeal(ex.strokes);
    assert.ok(reading.recognized.some(g=>g.id===s.id),"failed "+s.id);
  }
});


test("directed signs compose differently when the connector is reversed",()=>{
 const a=makeExample(["wind","columns","veer"],{spatial:{link:["columns","veer"]}});
 const b=makeExample(["wind","columns","veer"],{spatial:{link:["veer","columns"]}});
 const launched=analyzeSeal([...a.strokes,closeRingStroke()]);
 const deflected=analyzeSeal([...b.strokes,closeRingStroke()]);
 assert.equal(launched.ir.output.title,"Guided Wind Lance");
 assert.equal(deflected.ir.output.title,"Deflected Wind Lance");
 assert.deepEqual(launched.spatial.links.map(r=>[r.from,r.to]),[["columns","veer"]]);
 assert.deepEqual(deflected.spatial.links.map(r=>[r.from,r.to]),[["veer","columns"]]);
 assert.equal(launched.ir.tier,"advanced");
 assert.equal(deflected.ir.tier,"advanced");
 assert.notEqual(launched.ir.relationSignature,deflected.ir.relationSignature);
});
test("enclosed signs affect the spell, unlike identical free-positioned signs",()=>{
 const nested=makeExample(["water","expansion","orbit"],{spatial:{contain:["expansion","orbit"]}});
 const separated=makeExample(["water","expansion","orbit"]);
 const first=analyzeSeal([...nested.strokes,closeRingStroke()]);
 const second=analyzeSeal([...separated.strokes,closeRingStroke()]);
 assert.equal(first.ir.output.title,"Spiral Bloom");
 assert.ok(first.spatial.contains.some(r=>r.parent==="expansion"&&r.child==="orbit"));
 assert.equal(second.spatial.contains.length,0);
 assert.notEqual(first.ir.output.title,second.ir.output.title);
});
test("a prepared spatial spell never casts until its outer ring closes",()=>{
 const recipe=makeExample(["fire","expansion","orbit"],{spatial:{contain:["expansion","orbit"]}});
 const prepared=analyzeSeal(recipe.strokes);
 assert.equal(prepared.ir.valid,false);
 assert.equal(prepared.ready,false);
 assert.equal(prepared.spatial.contains.length,1);
 const cast=analyzeSeal([...recipe.strokes,closeRingStroke()]);
 assert.equal(cast.ready,true);
 assert.equal(cast.ir.output.title,"Solar Vortex");
});
test("unmarked freehand straight lines are discovered as directed links",()=>{
 const recipe=makeExample(["wind","columns","veer"],{spatial:{link:["columns","veer"]}});
 // Simulate drawing with an ordinary pen rather than the optional Link pen.
 const freehand=recipe.strokes.map(stroke=>stroke.map(point=>({...point})));
 const result=analyzeSeal([...freehand,closeRingStroke()]);
 assert.equal(result.ir.output.title,"Guided Wind Lance");
 assert.equal(result.spatial.links.length,1);
});
test("short accidental pointer taps do not misalign link stroke indices",()=>{
 const sample=makeExample(["wind","columns","veer"],{spatial:{link:["columns","veer"]}});
 const raw=[...sample.strokes.slice(0,2),[{x:.6,y:.6}],...sample.strokes.slice(2)];
 const result=analyzeSeal([...raw,closeRingStroke()]);
 assert.equal(result.ir.output.title,"Guided Wind Lance");
 assert.equal(result.spatial.links.length,1);
});
test("semantic graph exports are JSON-safe and identify actual source strokes",()=>{
 const sample=makeExample(["wind","columns","veer"],{spatial:{link:["columns","veer"]}});
 const result=analyzeSeal([...sample.strokes,closeRingStroke()]);
 const decoded=JSON.parse(JSON.stringify(result.ir));
 assert.equal(decoded.schemaVersion,5);
 assert.equal(decoded.spatial.links.length,1);
 assert.equal(decoded.spatial.links[0].from,"columns");
 assert.equal(decoded.spatial.links[0].to,"veer");
 assert.ok(Number.isFinite(decoded.spatial.links[0].length));
});
