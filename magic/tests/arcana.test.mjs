import test from "node:test";
import assert from "node:assert/strict";
import {SYMBOLS,TIERS,recipes,analyzeSeal,makeExample,closeRingStroke,classifyCastAccuracy} from "../js/arcana-engine.js";

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


test("every guided recipe provides a complete noninteractive trace template",()=>{
 for(const recipe of recipes){
  const guide=makeExample(recipe.ids,{open:true,nested:recipe.nested,rotate:recipe.rotate,spatial:recipe.spatial});
  assert.ok(guide.strokes.length>=2,"missing preview for "+recipe.label);
  assert.equal(guide.ringIndex,guide.strokes.length-1,"outer ring must be last");
  const ring=guide.strokes.at(-1);
  assert.ok(ring.length>50,"ring should show a continuous path");
  const gap=Math.hypot(ring[0].x-ring.at(-1).x,ring[0].y-ring.at(-1).y);
  assert.ok(gap>.10,"ring should remain open for manual closing");
  for(const stroke of guide.strokes)for(const p of stroke){
   assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
   assert.ok(p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1,"point outside drawing viewport");
  }
  assert.equal(analyzeSeal(guide.strokes).ready,false,"trace preview must not cast");
 }
});

test("casting outcomes honor the 50 percent accuracy threshold",()=>{
 assert.equal(classifyCastAccuracy(0),"failed");
 assert.equal(classifyCastAccuracy(24),"failed");
 assert.equal(classifyCastAccuracy(25),"uncontrolled");
 assert.equal(classifyCastAccuracy(49),"uncontrolled");
 assert.equal(classifyCastAccuracy(50),"success");
 assert.equal(classifyCastAccuracy(100),"success");
});


test("freehand Water: nine interleaved strokes reconstruct one water sigil",()=>{
 const canvas=(points)=>points.map(([x,y])=>({x:(x-142)/695,y:(y-171)/695}));
 const interpolate=(p)=>{const out=[];for(let i=0;i<p.length-1;i++)for(let j=0;j<12;j++){
  const f=j/12;out.push([p[i][0]*(1-f)+p[i+1][0]*f,p[i][1]*(1-f)+p[i+1][1]*f]);
 }out.push(p.at(-1));return canvas(out);};
 // Hand-traced approximation of the user's screenshot: S + two droplet loops.
 const paths=[
  [[520,446],[492,446],[474,463],[470,483]],
  [[470,483],[483,521],[505,545],[516,578],[509,603],[483,610]],
  [[427,496],[412,539],[427,565],[443,538],[427,496]],
  [[547,501],[533,533],[543,581],[564,527],[547,501]]
 ].map(interpolate);
 const ink=[paths[0],paths[2].slice(0,14),paths[3].slice(0,10),
  paths[1].slice(0,30),paths[2].slice(14,31),paths[3].slice(10,31),
  paths[2].slice(31),paths[3].slice(31),paths[1].slice(30)];
 const prepared=analyzeSeal(ink);
 assert.deepEqual(prepared.recognized.map(g=>g.id),["water"]);
 assert.ok(prepared.recognized[0].score>=.80);
 assert.equal(prepared.ready,false);
 const outer=makeExample([],{open:true}).strokes.at(-1);
 const result=analyzeSeal([...ink,outer,closeRingStroke()]);
 assert.equal(result.ir.castOutcome,"success");
 assert.deepEqual(result.ir.elements,["water"]);
 assert.equal(result.ir.output.title,"Water Sigil");
});
test("normal Wind and Pull signs are not mistaken for Water",()=>{
 for(const ids of [["wind"],["wind","pull"],["fire"],["earth"]]){
  const reading=analyzeSeal(makeExample(ids,{open:true}).strokes);
  assert.ok(!reading.recognized.some(g=>g.id==="water"),"false Water from "+ids.join("+"));
 }
});
test("Water with a separate modifier remains both a water and a sign",()=>{
 const sample=makeExample(["water","columns"],{open:true});
 const ink=sample.strokes.slice(0,-1);
 const result=analyzeSeal([...ink,sample.strokes.at(-1),closeRingStroke()]);
 assert.deepEqual(result.ir.elements,["water"]);
 assert.deepEqual(result.ir.signs,["columns"]);
 assert.equal(result.ir.output.title,"Watershot");
});


test("custom mixtures survive shuffled pen strokes",()=>{
 const mixtures=[["earth","convergence","pull","pull"],["fire","columns","pull"],["water","convergence","pull"],["earth","levitation","expansion"],["wind","dispersion","convergence"],["fire","earth","columns"],["water","wind","pull"],["earth","columns","convergence"],["fire","water","earth"],["earth","water","levitation"]];
 function shuffle(input,seed){
  let state=seed;const random=()=>((state=Math.imul(state,1664525)+1013904223|0)>>>0)/4294967296;
  const strokes=input.map(x=>x.slice()),ring=strokes.pop();
  for(let i=strokes.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[strokes[i],strokes[j]]=[strokes[j],strokes[i]];}
  return[...strokes,ring];
 }
 for(const ids of mixtures)for(const seed of [42,100,261]){
  const input=shuffle(makeExample(ids,{open:true}).strokes,seed);
  const outcome=analyzeSeal(input);
  assert.deepEqual(outcome.recognized.map(x=>x.id).sort(),ids.slice().sort(),"Custom glyph order "+ids.join("+")+" seed "+seed);
 }
 const prepared=shuffle(makeExample(["earth","convergence","pull","pull"],{open:true}).strokes,42);
 const cast=analyzeSeal([...prepared,closeRingStroke()]);
 assert.equal(cast.ir.output.title,"Earth Projectile");
 assert.ok(cast.ir.output.text.includes("stone projectile"));
});


test("screenshot-style freehand Earth projectile is not confused with fire or water",()=>{
 const poly=coords=>{
  const out=[];for(let k=0;k<coords.length-1;k++)for(let i=0;i<12;i++){
   const t=i/12;out.push({x:(coords[k][0]*(1-t)+coords[k+1][0]*t-142)/695,y:(coords[k][1]*(1-t)+coords[k+1][1]*t-109)/695});
  }out.push({x:(coords.at(-1)[0]-142)/695,y:(coords.at(-1)[1]-109)/695});return out;
 };
 const lines=[
 [[427,394],[547,394]],[[488,391],[493,531]],
 [[460,431],[421,474]],[[421,474],[493,531]],[[493,531],[559,468]],[[559,468],[525,429]],
 [[441,556],[539,558]],
 [[403,435],[410,435],[410,441],[403,441],[403,435]],
 [[576,432],[583,432],[582,440],[576,441],[576,432]],
 [[296,566],[295,386]],[[259,448],[296,386],[331,441]],
 [[684,570],[687,390]],[[657,438],[687,390],[721,439]],
 [[457,282],[488,220],[542,280],[457,282]],
 [[461,665],[485,725],[541,667],[461,665]]
 ].map(poly);
 const ring=(cx,cy,rx,ry)=>Array.from({length:120},(_,i)=>{
  const t=i*Math.PI*2/119;return{x:(cx+Math.cos(t)*rx-142)/695,y:(cy+Math.sin(t)*ry-109)/695};
 });
 const analyzed=analyzeSeal([...lines,ring(491,462,141,157),ring(489,438,275,282)]);
 assert.equal(analyzed.ir.output.title,"Earth Projectile");
 assert.deepEqual(analyzed.ir.elements,["earth"]);
 assert.ok(analyzed.recognized.filter(x=>x.id==="pull").length===2);
 assert.ok(analyzed.recognized.some(x=>x.id==="convergence"));
 assert.ok(!analyzed.recognized.some(x=>x.id==="fire"||x.id==="water"));
 assert.ok(!analyzed.recognized.some(x=>x.strokeIndices.includes(7)||x.strokeIndices.includes(8)),"decorative dots must stay unrecognized");
 assert.equal(analyzed.innerRings.length,1);
});
