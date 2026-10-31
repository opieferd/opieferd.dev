/* Glyph Atelier v4: experimental ring nesting + rotation parser.
 * Fan-made interpretation, not a claim about the manga's canonical casting rules.
 * The recognizer runs on raw normalized {x,y} strokes and has no DOM dependencies.
 */
import {SYMBOLS as BASE_SYMBOLS,closeRingStroke as closeBaseRing} from "./atelier-engine.js";
const P=(...strokes)=>strokes;
const EXTRA=[
{id:"veer",name:"Veer",role:"sign",emoji:"↪️",color:"#f0b5a2",experimental:true,tip:"An off-center crooked arrow redirects a current. Rotating it changes where the spell bends.",paths:P([[16,75],[29,57],[45,47],[61,47],[77,24]],[[54,25],[77,24],[79,48]],[[20,81],[11,64]])},
{id:"orbit",name:"Orbit",role:"sign",emoji:"🌀",color:"#b8a8ff",experimental:true,tip:"A broken spiral with an arrowhead sets magic revolving around its target.",paths:P([[79,30],[65,17],[42,17],[23,37],[27,65],[49,79],[72,62],[65,44],[49,45]],[[70,29],[80,30],[79,44]])},
{id:"split",name:"Fork",role:"sign",emoji:"⚡",color:"#ffdd88",experimental:true,tip:"An uneven fork divides a stream. Its angled, longer branch indicates a favored direction.",paths:P([[19,85],[47,60],[54,36],[54,15]],[[47,60],[75,46],[86,22]],[[76,37],[86,22],[95,33]])}
];
export const SYMBOLS=[...BASE_SYMBOLS,...EXTRA];
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const clean=stroke=>(stroke||[]).filter(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)).slice(0,3000).map(p=>({x:clamp(p.x),y:clamp(p.y),t:Number.isFinite(p.t)?p.t:0}));
function bounds(points){if(!points.length)return{x:0,y:0,w:0,h:0,cx:0,cy:0};let minX=1,minY=1,maxX=0,maxY=0;for(const p of points){minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);}return{x:minX,y:minY,w:maxX-minX,h:maxY-minY,cx:(minX+maxX)/2,cy:(minY+maxY)/2}}
function resample(path,n=16){if(!path.length)return[];if(path.length===1)return Array.from({length:n},()=>path[0]);const lengths=[0];for(let i=1;i<path.length;i++)lengths[i]=lengths[i-1]+dist(path[i],path[i-1]);const total=lengths.at(-1);if(total<1e-8)return Array.from({length:n},()=>path[0]);let j=1;return Array.from({length:n},(_,i)=>{const target=i*total/(n-1);while(j<lengths.length-1&&lengths[j]<target)j++;const alpha=clamp((target-lengths[j-1])/(lengths[j]-lengths[j-1]||1));return{x:path[j-1].x+(path[j].x-path[j-1].x)*alpha,y:path[j-1].y+(path[j].y-path[j-1].y)*alpha}})}
function cloud(strokes){const all=strokes.flat();if(!all.length)return[];const b=bounds(all),scale=Math.max(b.w,b.h,.00001),n=Math.max(5,Math.round(30/strokes.length));return strokes.flatMap(s=>resample(s,n).map(p=>({x:(p.x-b.cx)/scale,y:(p.y-b.cy)/scale})))}
function rotate(points,angle){const a=angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return points.map(p=>({x:p.x*c-p.y*s,y:p.x*s+p.y*c}))}
function cloudError(a,b){let sum=0;for(const p of a){let best=1;for(const q of b){const dx=p.x-q.x,dy=p.y-q.y,v=dx*dx+dy*dy;if(v<best)best=v;}sum+=Math.sqrt(best);}return sum/Math.max(a.length,1)}
function deviation(a,b){return(cloudError(a,b)+cloudError(b,a))*.5}
const orientSteps=Array.from({length:8},(_,i)=>i*45);
const stored=new Map(SYMBOLS.map(sym=>{const baseline=cloud(sym.paths.map(s=>s.map(([x,y])=>({x:x/100,y:y/100}))));return[sym.id,orientSteps.map(deg=>({deg,points:rotate(baseline,deg)}))]}));
function bends(lines){return lines.reduce((sum,line)=>{if(line.length<2)return sum;let length=0;for(let i=1;i<line.length;i++)length+=dist(line[i],line[i-1]);return sum+clamp(length/Math.max(dist(line[0],line.at(-1)),.0001)-1,0,2)},0)}
const bendReference=new Map(SYMBOLS.map(s=>[s.id,bends(s.paths.map(p=>p.map(([x,y])=>({x:x/100,y:y/100}))))]));
const symmetryMap=new Set(["columns","convergence","expansion"]);
function scoreSymbols(lines){if(!lines.length)return[];const c=cloud(lines),b=bounds(lines.flat()),inputBend=bends(lines);return SYMBOLS.map(sym=>{
 const candidates=stored.get(sym.id);let winner={deg:0,error:Infinity};
 for(const variant of candidates){const error=deviation(c,variant.points);if(error<winner.error)winner={deg:variant.deg,error};}
 const sb=bounds(sym.paths.flat().map(([x,y])=>({x:x/100,y:y/100}))),aspectPenalty=Math.min(.07,Math.abs(b.w/Math.max(b.h,.01)-sb.w/Math.max(sb.h,.01))*.045);
 // Rotated glyphs must not be penalized for their unrotated aspect ratio.
 const penalty=Math.min(.20,Math.abs(lines.length-sym.paths.length)*.052)+Math.min(.13,Math.abs(inputBend-bendReference.get(sym.id))*.28);
 const confidence=clamp(1-winner.error/.28-penalty-(winner.deg%180===0?aspectPenalty:0));
 return{id:sym.id,name:sym.name,role:sym.role,emoji:sym.emoji,score:+confidence.toFixed(3),error:+winner.error.toFixed(4),rotationDegrees:winner.deg,orientationAmbiguous:symmetryMap.has(sym.id)};
 }).sort((a,b)=>b.score-a.score)}
function ringFeature(path,index){if(path.length<14)return null;const b=bounds(path);if(b.w<.155||b.h<.155)return null;const sampled=resample(path,96),center={x:sampled.reduce((n,p)=>n+p.x,0)/96,y:sampled.reduce((n,p)=>n+p.y,0)/96},radii=sampled.map(p=>dist(p,center)),radius=radii.reduce((a,b)=>a+b,0)/radii.length;
 const dev=Math.sqrt(radii.reduce((a,r)=>a+(r-radius)**2,0)/radii.length)/Math.max(radius,.001),aspect=Math.min(b.w,b.h)/Math.max(b.w,b.h),gap=dist(path[0],path.at(-1))/Math.max(radius,.001),length=path.slice(1).reduce((sum,p,i)=>sum+dist(p,path[i]),0)/(2*Math.PI*radius);
 const quality=clamp(1-dev*2.6-(1-aspect)-gap*.30);
 return{strokeIndex:index,strokeIndices:[index],completedAt:index,center,radius,quality:+quality.toFixed(3),gap:+gap.toFixed(3),radialError:+dev.toFixed(3),coverage:+length.toFixed(3),valid:dev<.22&&aspect>.64&&gap<.16&&length>.71&&quality>.49};
}
function scanRings(strokes){
 const candidates=strokes.map(ringFeature).filter(Boolean),completed=candidates.filter(c=>c.valid);
 for(const arc of candidates.filter(c=>!c.valid&&c.radius>.28&&c.radialError<.23&&c.coverage>.69&&c.gap<1.05)){
  for(let j=arc.strokeIndex+1;j<strokes.length;j++){
   const a=strokes[arc.strokeIndex],b=strokes[j],tolerance=Math.max(.035,arc.radius*.19);if(b.length<2)continue;
   const forward=dist(a.at(-1),b[0])<tolerance&&dist(b.at(-1),a[0])<tolerance;
   const backward=dist(a.at(-1),b.at(-1))<tolerance&&dist(b[0],a[0])<tolerance;
   if(!forward&&!backward)continue;
   const joined=ringFeature(a.concat(forward?b:b.slice().reverse()),j);
   if(joined?.valid)completed.push({...joined,strokeIndices:[arc.strokeIndex,j],completedAt:j,closureType:"joined-strokes"});
  }
 }
 const outer=completed.filter(c=>c.radius>=.29).sort((a,b)=>b.radius-a.radius||b.quality-a.quality)[0]||null;
 const pending=candidates.filter(c=>c.radius>=.28&&!c.valid&&c.radialError<.24&&c.coverage>.68&&c.gap<1.1).sort((a,b)=>b.radius-a.radius)[0]||null;
 const frame=outer||pending||{center:{x:.5,y:.5},radius:.39,quality:0};
 const inner=completed.filter(c=>c.radius>=.085&&c.radius<frame.radius*.82&&c.radius<.29&&dist(c.center,frame.center)+c.radius<frame.radius*.96)
 .sort((a,b)=>b.radius-a.radius).filter((c,i,list)=>list.findIndex(other=>dist(c.center,other.center)<.02&&Math.abs(c.radius-other.radius)<.017)===i).slice(0,3);
 return{boundary:outer,pendingRing:pending,innerRings:inner,candidates,frame};
}
function classify(p,frame,inners){const inside=inners.filter(r=>dist(p,r.center)<r.radius*.94).sort((a,b)=>a.radius-b.radius);return inside.length?"inner":"outer";}
function segment(strokes,indices,frame,innerRings){
 const n=indices.length;if(!n)return[];
 const dp=Array(n+1).fill(-Infinity),choices=Array(n),cached=new Map();dp[n]=0;
 for(let i=n-1;i>=0;i--){
  dp[i]=dp[i+1]-.075;choices[i]={length:1,unknown:true};
  for(let k=1;k<=Math.min(8,n-i);k++){
   const ids=indices.slice(i,i+k),lines=ids.map(j=>strokes[j]),b=bounds(lines.flat()),p={x:b.cx,y:b.cy};
   if(Math.max(b.w,b.h)<.023||dist(p,frame.center)>frame.radius*.97)continue;
   const ratings=scoreSymbols(lines),win=ratings[0],margin=win.score-(ratings[1]?.score||0);
   if(win.score<.47||(margin<.012&&win.score<.76))continue;
   const symbol=SYMBOLS.find(g=>g.id===win.id),diff=Math.abs(k-symbol.paths.length);
   if(diff>2)continue;
   const radial=dist(p,frame.center)/frame.radius,zone=classify(p,frame,innerRings);
   const placement=win.role==="sigil"?(zone==="inner"?.11:radial<.62?.06:-.12):(zone==="outer"&&radial>.3?.07:0);
   const utility=(win.score-.48)*1.55+.17*(k-1)-.13-.062*diff+placement+(win.role==="sigil"?.18:-.05);
   const score=utility+dp[i+k];
   if(score>dp[i]){dp[i]=score;choices[i]={length:k,unknown:false};cached.set(i,{indices:ids,ranking:ratings});}
  }
 }
 const out=[];for(let i=0;i<n;){const c=choices[i];if(c.unknown){out.push([indices[i]]);i++;}else{out.push(indices.slice(i,i+c.length));i+=c.length;}}
 return out;
}
const elementDescriptions={fire:"fire",water:"water",earth:"earth",wind:"wind"};
const physical={columns:["beam","channels forward in a narrow path"],dispersion:["wave","spreads into a wide field"],levitation:["lift","rises and carries nearby objects"],convergence:["focus","concentrates toward one point"],expansion:["grow","expands its area of effect"],pull:["attract","draws surrounding matter inward"],veer:["redirect","bends the flow around an obstacle"],orbit:["orbit","circles its focus repeatedly"],split:["split","divides into uneven branching streams"]};
const combos={
"earth+fire":["Magma Working","Flame heats the rock until it flows as molten stone."],
"earth+water":["Clay Shaping","Water softens the earth into sculptable clay."],
"earth+wind":["Dustwhirl","Air lifts dust and sand into an eddy."],
"fire+water":["Steam Veil","Heat and water mingle into a veil of steam."],
"fire+wind":["Wildfire Gust","A swift current fans and carries burning flame."],
"water+wind":["Rain Current","Wind suspends drifting droplets of water."],
"earth+fire+water":["Glassworking","Heat and moisture reshape minerals into a molten, shining mixture."],
"fire+water+wind":["Stormglass","Wind whips heated mist into a violent glowing squall."],
"earth+water+wind":["Living Dune","Wet earth twists into a moving, wind-driven barrier."]
};
const baseSpells={
"wind|columns":"Wind Blast","wind|dispersion":"Gust Wave","wind|levitation":"Skysoaring Current","wind|convergence":"Wind Wall","wind|pull":"Grasping Wind","wind|expansion":"Great Gale",
"water|columns":"Watershot","water|dispersion":"Rising Wave","water|levitation":"Floating Drops","water|convergence":"Water Orb","water|expansion":"Tidal Bloom",
"fire|columns":"Flame Shot","fire|dispersion":"Ring of Fire","fire|levitation":"Pyreball","fire|convergence":"Kindled Ember","fire|expansion":"Flame Burst",
"earth|columns":"Earth Lift","earth|dispersion":"Shifting Ground","earth|levitation":"Suspended Stone","earth|convergence":"Stone Bastion","earth|expansion":"Stone Bloom",
"wind|veer":"Curving Gale","wind|orbit":"Cyclone Halo","wind|split":"Forked Wind","water|veer":"Bending Stream","water|orbit":"Tidal Orbit","water|split":"Forked Rapids"
};

/* Original fan-game naming grammar. Deterministic for every recognized combination. */
const hybridNames={
"earth+fire":"Cinderforge","earth+water":"Clayweaver","earth+wind":"Dustwhirl",
"fire+water":"Steamveil","fire+wind":"Wildfire Gale","water+wind":"Raincurrent",
"earth+fire+water":"Molten Lookingglass","earth+fire+wind":"Cinderstorm",
"earth+water+wind":"Silt Tempest","fire+water+wind":"Stormglass",
"earth+fire+water+wind":"Primal Convergence"};
const essenceNames={fire:"Ember",water:"Tide",earth:"Stone",wind:"Gale"};
const formNames={columns:"Lance",dispersion:"Bloom",levitation:"Ascension",convergence:"Heart",expansion:"Surge",pull:"Grasp",veer:"Arc",orbit:"Halo",split:"Crown"};
const pairForms={
"columns+dispersion":"Scatterlance","columns+expansion":"Greatlance","columns+convergence":"Piercing Ray",
"columns+levitation":"Skyspike","columns+pull":"Harpoon","columns+veer":"Guided Lance",
"columns+orbit":"Comet Spiral","columns+split":"Forked Bolt",
"convergence+dispersion":"Starburst","convergence+expansion":"Bloomheart",
"convergence+levitation":"Floating Heart","convergence+orbit":"Orbiting Core",
"convergence+pull":"Singularity","convergence+split":"Shattering Heart",
"dispersion+expansion":"Nova","dispersion+levitation":"Skyblossom",
"dispersion+orbit":"Whirlpool","dispersion+pull":"Gathering Storm",
"dispersion+split":"Manyfold Rain","expansion+levitation":"Skywell",
"expansion+orbit":"Growing Vortex","expansion+pull":"Tidal Embrace",
"expansion+split":"Branching Surge","levitation+orbit":"Floating Halo",
"levitation+pull":"Skyhook","levitation+split":"Featherstorm",
"orbit+pull":"Gravitating Halo","orbit+split":"Wheel of Shards",
"pull+split":"Raking Talons","veer+columns":"Guided Lance",
"veer+dispersion":"Curved Sweep","veer+expansion":"Winding Surge",
"veer+convergence":"Turning Focus","veer+levitation":"Spiral Ascent",
"veer+orbit":"Wayward Halo","veer+pull":"Crooked Grasp","veer+split":"Forked Arc"};
function poeticName(elements,signs,layerCount=0){
 const ids=[...new Set(elements)].sort(),mods=[...new Set(signs)].sort();
 if(!ids.length)return"Unwritten Spell";
 const core=hybridNames[ids.join("+")]||ids.map(id=>essenceNames[id]||id).join("");
 if(!mods.length)return ids.length===1?core+" Seal":core+" Weave";
 const form=mods.length===1?(formNames[mods[0]]||"Working"):
 mods.length===2?(pairForms[mods.join("+")]||mods.map(id=>formNames[id]||"Arc").join(" ")) :
 (formNames[mods[2]]||"Arc")+" "+(pairForms[mods.slice(0,2).join("+")]||mods.slice(0,2).map(id=>formNames[id]||"Ward").join(" "))+
 (mods.length>3?" of "+mods.slice(3).map(id=>formNames[id]||"Magic").join(" and "):"");
 return (layerCount===1?"Greater ":layerCount>=2?"Grand ":"")+core+" "+form;
}


const spellSubstances={
 "fire":{noun:"a ribbon of living flame",motion:"ignites in the air",impact:"scorches whatever it touches"},
 "water":{noun:"a surge of clear water",motion:"gathers from suspended droplets",impact:"drenches and pushes nearby objects"},
 "earth":{noun:"a mass of shifting stone",motion:"rises from the ground",impact:"forms solid cover and reshapes the terrain"},
 "wind":{noun:"a compressed current of air",motion:"stirs the surrounding atmosphere",impact:"sweeps dust and loose objects aside"},
 "earth+fire":{noun:"a torrent of molten rock and sparks",motion:"melts shards of stone in a roaring furnace",impact:"leaves glowing fragments in its wake"},
 "earth+water":{noun:"a surge of wet clay and riverbed stone",motion:"loosens the ground into flowing mud",impact:"hardens into whatever shape the caster guides"},
 "earth+wind":{noun:"a cyclone of sand and jagged pebbles",motion:"rips grit and stone from the earth",impact:"scours the air and obscures the path ahead"},
 "fire+water":{noun:"a pressurized cloud of scalding steam",motion:"boils suspended water into vapor",impact:"conceals the caster in shimmering heat"},
 "fire+wind":{noun:"a howling ribbon of flame",motion:"feeds a spark with a rushing current",impact:"sweeps fire across its path"},
 "water+wind":{noun:"a spinning mass of rain and mist",motion:"lifts droplets into the moving air",impact:"blinds and drenches anyone caught within"},
 "earth+fire+water":{noun:"a molten glasslike river",motion:"fuses minerals with heat and moisture",impact:"cools into glittering hardened structures"},
 "earth+fire+wind":{noun:"a storm of red-hot stone shards and ash",motion:"whips molten grit through a furnace-hot gale",impact:"blasts a burning path through the air"},
 "earth+water+wind":{noun:"a rolling wall of mud, mist, and sand",motion:"draws soil into a rain-laden vortex",impact:"buries obstacles beneath shifting earth"},
 "fire+water+wind":{noun:"a thunderous cloud of burning vapor",motion:"draws steam into an incandescent cyclone",impact:"bursts outward as a blinding squall"},
 "earth+fire+water+wind":{noun:"a turbulent mass of flame, stone, rain, and wind",motion:"draws every elemental current into one unstable center",impact:"warps the terrain beneath a violent elemental surge"}
};
function describeSpell(ids,signs,direction,focusCount,quality){
 const key=ids.slice().sort().join("+");
 const substance=spellSubstances[key]||spellSubstances[ids[0]]||spellSubstances.wind;
 const has=id=>signs.some(g=>g.id===id);
 const primary=signs.find(g=>["veer","columns","pull","levitation","split"].includes(g.id));
 const facing=primary?.rotationDegrees===undefined?"":(" toward the "+direction);
 let body="The seal "+substance.motion+", conjuring "+substance.noun;
 if(has("convergence"))body+=" compressed into a dense, concentrated core";
 if(has("orbit"))body+=" that circles its target in a tightening spiral";
 if(has("columns"))body+=" before firing forward as a narrow lance";
 if(has("veer"))body+=" that bends around obstacles"+facing;
 else if(has("columns")&&facing)body+=facing;
 if(has("split"))body+=" and separates into branching streams";
 if(has("dispersion"))body+=" that fan out into a wide, sweeping burst";
 if(has("expansion"))body+=" that grows in size as it travels";
 if(has("levitation"))body+=" while rising high into the air";
 if(has("pull"))body+=" and draws nearby objects toward its center";
 body+=". ";
 if(focusCount)body+=(focusCount===1?"An inner focusing ring":"Two nested focusing rings")+" stabilizes the working and amplifies its force. ";
 body+=substance.impact[0].toUpperCase()+substance.impact.slice(1)+".";
 if(quality<.48)body+=" Its uneven lines cause the magic to flicker at the edges.";
 return body;
}

function bearing(degrees){const a=((degrees%360)+360)%360;return["north","northeast","east","southeast","south","southwest","west","northwest"][Math.round(a/45)%8];}
function tierFor(elements,signs,inner){if(inner.length||elements.length>=3||signs.length>=2&&elements.length>=2||signs.length>=3)return"advanced";if(elements.length>=2||signs.length>=2||signs.some(g=>["veer","orbit","split","levitation","convergence","expansion","pull"].includes(g.id)))return"intermediate";return"beginner";}

/* Spatial ink grammar: nesting and directed links are separate from glyph matching.
   An arrow-like connector is tagged by the optional Link pen; untagged spare strokes
   are accepted only when they unambiguously join two recognized sign centers. */
function straightEnough(points){
 if(points.length<2)return false;
 const a=points[0],b=points.at(-1),len=dist(a,b);if(len<.11||len>.65)return false;
 const mid=resample(points,16),dx=b.x-a.x,dy=b.y-a.y;
 return mid.every(p=>Math.abs((p.x-a.x)*dy-(p.y-a.y)*dx)/len<.015);
}
function spatialGraph(strokes,regions,recognized,marked,excluded){
 const nodes=recognized.map(g=>({...g,rect:bounds(g.strokeIndices.flatMap(i=>strokes[i]))}));
 // bounds() returns cx/cy, not a center object.
 for(const node of nodes)node.center={x:node.rect.cx,y:node.rect.cy};
 const contains=[];
 for(const parent of nodes.filter(n=>["expansion","orbit"].includes(n.id))){
  for(const child of nodes.filter(n=>n!==parent&&n.role==="sign")){
   const p=parent.rect,c=child.rect;
   const nested=c.w<p.w*.69&&c.h<p.h*.69&&c.x>=p.x-.013&&c.y>=p.y-.013&&
    c.x+c.w<=p.x+p.w+.013&&c.y+c.h<=p.y+p.h+.013;
   if(nested&&!contains.some(r=>r.parentStroke===parent.strokeIndices[0]&&r.childStroke===child.strokeIndices[0])){
    contains.push({type:"contains",parent:parent.id,child:child.id,
     parentStroke:parent.strokeIndices[0],childStroke:child.strokeIndices[0]});
   }
  }
 }
 const used=new Set([...excluded,...nodes.flatMap(n=>n.strokeIndices)]);
 const linkIndices=[...marked];
 for(let i=0;i<strokes.length;i++)if(!used.has(i)&&straightEnough(strokes[i])&&!linkIndices.includes(i))linkIndices.push(i);
 const links=[];
 for(const i of linkIndices){
  const s=strokes[i],start=s?.[0],end=s?.at(-1);if(!start||!end||!straightEnough(s))continue;
  const matchesAt=p=>nodes.filter(n=>n.role==="sign").map(n=>({n,error:dist(p,n.center)}))
   .filter(item=>item.error<Math.max(.055,Math.min(.12,Math.max(item.n.rect.w,item.n.rect.h)*.86)))
   .sort((a,b)=>a.error-b.error);
  const from=matchesAt(start)[0]?.n,to=matchesAt(end).find(m=>m.n!==from)?.n;
  if(from&&to&&from!==to&&from.strokeIndices[0]!==to.strokeIndices[0]){
   links.push({type:"directed",from:from.id,to:to.id,
    fromStroke:from.strokeIndices[0],toStroke:to.strokeIndices[0],
    strokeIndex:i,length:+dist(start,end).toFixed(3),
    angleDegrees:+(((Math.atan2(end.y-start.y,end.x-start.x)*180/Math.PI)+360)%360).toFixed(1)});
  }
 }
 return{nodes:nodes.map(n=>({id:n.id,role:n.role,strokeIndices:n.strokeIndices,center:n.center,
   bounds:n.rect,rotationDegrees:n.rotationDegrees})),contains,links,connectors:linkIndices};
}
function spatialMeaning(ir,graph){
 const {contains,links}=graph;
 if(!contains.length&&!links.length)return{...ir,spatial:graph};
 const names=ir.elements.map(id=>SYMBOLS.find(s=>s.id===id)?.name||id).join(" + ");
 const relationSignature=links.map(x=>x.from+">"+x.to).sort().join("|")+"::"+
  contains.map(x=>x.parent+"("+x.child+")").sort().join("|");
 let title=ir.output.title;
 const fire=ir.elements.includes("fire"),water=ir.elements.includes("water"),wind=ir.elements.includes("wind");
 if(links.some(x=>x.from==="columns"&&x.to==="veer")&&wind)title="Guided Wind Lance";
 else if(links.some(x=>x.from==="veer"&&x.to==="columns")&&wind)title="Deflected Wind Lance";
 else if(contains.some(x=>x.parent==="expansion"&&x.child==="orbit")&&water)title="Spiral Bloom";
 else if(contains.some(x=>x.parent==="expansion"&&x.child==="orbit")&&fire)title="Solar Vortex";
 else title=(contains.length?"Heartbound ":"Threadbound ")+title;
 const linksText=links.map(l=>"The "+l.from+" sign channels into "+l.to+" ("+
  Math.round(l.angleDegrees)+"°)").join(". ");
 const containText=contains.map(c=>"The "+c.parent+" sign encloses "+c.child+
  ", so its effect modifies the inner working").join(". ");
 const text=ir.output.text+" "+[containText,linksText].filter(Boolean).join(". ")+".";
 return{...ir,schemaVersion:5,tier:"advanced",
  spatial:graph,relationSignature,
  effects:[...(ir.effects||[]),...links.map(l=>({action:"link",source:l.from,target:l.to,
   angleDegrees:l.angleDegrees})),...contains.map(c=>({action:"enclose",outer:c.parent,inner:c.child}))],
  output:{...ir.output,title,text}};
}

function compile(boundary,recognized,innerRings,warnings,inkCount){
 const elements=[...new Map(recognized.filter(g=>g.role==="sigil").map(g=>[g.id,g])).values()];
 const signs=[...new Map(recognized.filter(g=>g.role==="sign").map(g=>[g.id,g])).values()];
 const pattern=[...elements.map(e=>e.id),...signs.map(e=>e.id)].sort().join("+");
 const angleOfFirst=signs[0]?.rotationDegrees||0;
 const foundRecipe=recipes.find(r=>!r.spatial&&r.ids.slice().sort().join("+")===pattern&&(r.nested||0)===innerRings.length&&(!(r.rotate)||Math.abs(((angleOfFirst-r.rotate+540)%360)-180)<25));
 const basics={schemaVersion:4,valid:!!boundary,elements:elements.map(g=>g.id),signs:signs.map(g=>g.id),tier:foundRecipe?.tier||tierFor(elements,signs,innerRings),rings:{outer:boundary?{center:boundary.center,radius:boundary.radius,quality:boundary.quality}:null,nested:innerRings.map(r=>({center:r.center,radius:r.radius,quality:r.quality}))},warnings};
 if(!boundary)return{...basics,valid:false,power:0,output:{emoji:"🖋️",title:"Spell prepared",text:recognized.length?recognized.map(g=>g.name).join(" + ")+" inscribed. Close the outer ring to cast.":"Draw the components first, then close the outer circle."}};
 if(!elements.length){if(!signs.length&&!inkCount&&!innerRings.length)return{...basics,valid:true,tier:"beginner",power:Math.round(boundary.quality*35),reading:Math.round(boundary.quality*100),output:{emoji:"💥",title:"Empty-Ring Shockwave",text:"A closed outer ring without inscriptions releases a wave of raw magic."}};return{...basics,valid:false,power:0,output:{emoji:"📜",title:"Unstable seal",text:"The completed circle needs at least one readable elemental sigil."}};}
 const ids=elements.map(e=>e.id),key=ids.slice().sort().join("+"),sigilNames=ids.map(id=>SYMBOLS.find(g=>g.id===id)?.name).join(" + ");
 const title=ids.length===1?(baseSpells[ids[0]+"|"+signs[0]?.id]||poeticName(ids,signs.map(x=>x.id))):signs.length?poeticName(ids,signs.map(x=>x.id)):hybridNames[key]||poeticName(ids,[]);
 const description=ids.length===1?"The seal conjures "+elementDescriptions[ids[0]]+" magic.":(combos[key]?.[1]||"Several elemental sigils weave into a single magical working.");
 const directionSign=signs.find(s=>["veer","split","columns","levitation","pull"].includes(s.id))||signs[0];
 const orientation=directionSign?directionSign.rotationDegrees:0,direction=bearing(orientation),rotateMeaning=directionSign&&directionSign.id!=="dispersion"&&!directionSign.orientationAmbiguous;
 const sequence=signs.map(s=>({id:s.id,rotationDegrees:s.rotationDegrees,direction:bearing(s.rotationDegrees),action:physical[s.id]?.[0]||"modify",zone:s.zone,asymmetric:!!SYMBOLS.find(g=>g.id===s.id)?.experimental}));
 const steps=sequence.map(s=>physical[s.id][1]+(s.asymmetric?" toward "+s.direction:"")).join("; ");
 const focus=innerRings.length?" "+innerRings.length+" nested ring"+(innerRings.length>1?"s":"")+" isolate and intensify the inner working.":"";
 const orientationText=rotateMeaning?" The main effect points "+direction+".":"";
 const power=Math.round(clamp((.22+elements.reduce((s,e)=>s+e.relativeSize,0)/elements.length*.96)*boundary.quality+Math.min(.16,innerRings.length*.055)+Math.min(.10,signs.length*.028))*100);
 const text=describeSpell(ids,signs,direction,innerRings.length,boundary.quality);
 return{...basics,valid:true,power,reading:Math.round(recognized.reduce((sum,g)=>sum+g.score,0)/recognized.length*100),
  rotationDegrees:orientation,direction,effects:sequence,channels:{inner:recognized.filter(g=>g.zone==="inner").map(g=>g.id),outer:recognized.filter(g=>g.zone==="outer").map(g=>g.id)}, 
  glyphs:recognized.map(g=>({id:g.id,strokeIndices:g.strokeIndices,confidence:g.score,rotationDegrees:g.rotationDegrees,zone:g.zone,relativeSize:g.relativeSize})),
  output:{emoji:ids.map(id=>SYMBOLS.find(s=>s.id===id)?.emoji).join(" "),title:foundRecipe?.label||(innerRings.length?poeticName(ids,signs.map(x=>x.id),innerRings.length):title),text}};
}
export function analyzeSeal(input){
 const raw=(Array.isArray(input)?input:[]).slice(0,120);
 const entries=raw.map((line,i)=>({rawIndex:i,points:clean(line),intent:line?.intent})).filter(item=>item.points.length>1);
 const strokes=entries.map(item=>item.points);
 const marked=new Set(entries.map((item,i)=>item.intent==="connector"?i:-1).filter(i=>i>=0));
 const scan=scanRings(strokes),{boundary,pendingRing,innerRings,frame}=scan,excluded=new Set(marked);
 for(const ring of innerRings)ring.strokeIndices.forEach(i=>excluded.add(i));
 if(boundary)boundary.strokeIndices.forEach(i=>excluded.add(i));
 else if(pendingRing)pendingRing.strokeIndices.forEach(i=>excluded.add(i));
 const remaining=strokes.map((_,i)=>i).filter(i=>!excluded.has(i));
 const groups=segment(strokes,remaining,frame,innerRings),regions=[],recognized=[],warnings=[];
 if(!boundary)warnings.push(pendingRing?"Close the gap between the glowing endpoints to cast.":"Draw and close the outer ring to cast.");
 for(const ids of groups){
  const lines=ids.map(i=>strokes[i]),b=bounds(lines.flat()),p={x:b.cx,y:b.cy},inside=dist(p,frame.center)<frame.radius*.98,ranking=scoreSymbols(lines),winner=ranking[0],lead=winner.score-(ranking[1]?.score||0),accepted=inside&&winner.score>=.47&&(lead>=.012||winner.score>.76);
  const zone=classify(p,frame,innerRings),reason=!inside?"Outside the casting ring":winner.score<.47?"No matching symbol":lead<.012?"Ambiguous symbol":"";
  const region={strokeIndices:ids,bounds:b,inside,candidates:ranking.slice(0,4),recognized:accepted?winner.id:null,confidence:winner.score,rotationDegrees:winner.rotationDegrees,zone,accepted,reason};
  regions.push(region);
  if(accepted){const definition=SYMBOLS.find(s=>s.id===winner.id);recognized.push({...winner,name:definition.name,strokeIndices:ids,zone,relativeSize:+(Math.max(b.w,b.h)/(2*frame.radius)).toFixed(3)});}
  else if(boundary)warnings.push("Strokes "+ids.map(i=>i+1).join(", ")+": "+reason+".");
 }
 const inkCount=remaining.length;
 // A straight freehand stroke drawn after two completed signs may also be a link.
 // Reclassify it only when its endpoints are close to two distinct earlier signs.
 const signNodes=()=>recognized.filter(g=>g.role==="sign").map(g=>{
  const b=bounds(g.strokeIndices.flatMap(i=>strokes[i]));return {...g,center:{x:b.cx,y:b.cy},span:Math.max(b.w,b.h)};});
 for(let i=0;i<strokes.length;i++){
  if(marked.has(i)||excluded.has(i)||!straightEnough(strokes[i]))continue;
  const line=strokes[i],nodes=signNodes().filter(g=>Math.max(...g.strokeIndices)<i&&
   !g.strokeIndices.includes(i));
  const nearest=point=>nodes.map(g=>({...g,distance:dist(point,g.center)}))
   .filter(g=>g.distance<Math.max(.056,Math.min(.11,g.span*.85))).sort((a,b)=>a.distance-b.distance);
  const a=nearest(line[0])[0],b=nearest(line.at(-1)).find(g=>g.strokeIndices[0]!==a?.strokeIndices[0]);
  if(a&&b){marked.add(i);
   for(let j=recognized.length-1;j>=0;j--)if(recognized[j].strokeIndices.includes(i))recognized.splice(j,1);
   const r=regions.find(r=>r.strokeIndices.includes(i));if(r){r.recognized=null;r.reason="Directed link stroke";r.accepted=false;}
  }
 }
 const graph=spatialGraph(strokes,regions,recognized,marked,excluded);
 const base=compile(boundary,recognized,innerRings,warnings,inkCount);
 const ir=base.valid?spatialMeaning(base,graph):{...base,spatial:graph};
 const ast={schemaVersion:5,spatial:graph,outerRing:boundary?{strokes:boundary.strokeIndices,completedAt:boundary.completedAt}:null,
  innerRings:innerRings.map(r=>({strokes:r.strokeIndices,center:r.center,radius:r.radius})),
  regions:regions.map(r=>({strokes:r.strokeIndices,id:r.recognized,zone:r.zone,rotationDegrees:r.rotationDegrees,score:r.confidence}))};
 return{strokes,boundary,pendingRing,boundaryCandidates:scan.candidates,innerRings,regions,recognized,ast,warnings,ir,
  ready:!!boundary,spatial:graph,completion:boundary?{strokeIndices:boundary.strokeIndices,completedAt:boundary.completedAt,type:boundary.closureType||"single-stroke"}:null};
}
function circularPath(radius,open=false,center={x:.5,y:.5}){
 const start=open?.23:0,end=open?2*Math.PI-.23:2*Math.PI,count=open?93:97;
 return Array.from({length:count},(_,i)=>{const a=start+(end-start)*i/(count-1);return{x:center.x+radius*Math.cos(a),y:center.y+radius*Math.sin(a),t:1700+i*12}});
}
function renderSymbol(symbol,center,size,angleDegrees=0){
 const a=angleDegrees*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
 return symbol.paths.map(line=>line.map(([x,y],i)=>{const dx=(x-50)*size/100,dy=(y-50)*size/100;return{x:center.x+dx*c-dy*s,y:center.y+dx*s+dy*c,t:i*16}}));
}
export function normalizedCloud(strokes){return cloud(strokes)}
export function closeRingStroke(){return closeBaseRing();}
export function makeExample(ids=["wind","columns"],options={}){
 const selected=ids.map(id=>SYMBOLS.find(g=>g.id===id)).filter(Boolean),elems=selected.filter(s=>s.role==="sigil"),signs=selected.filter(s=>s.role==="sign");
 const nested=options.nested?Math.min(options.nested===true?1:options.nested,2):0,angle=Number.isFinite(options.rotate)?options.rotate:0,strokes=[],placements=[];
 const ringCenter={x:.5,y:.5};
 for(let i=0;i<elems.length;i++){
  const x=.5+(i-(elems.length-1)/2)*(elems.length>1?.19:0),y=options.spatial?.contain?.68:options.spatial?.link?.61:.52;
  const parts=renderSymbol(elems[i],{x,y},options.spatial?.contain?.18:elems.length>1?.18:.265);
  for(const path of parts)strokes.push(path);
  placements.push({id:elems[i].id,role:"sigil",center:{x,y}});
 }
 for(let i=0;i<signs.length;i++){
  const theta=-Math.PI/2+i*Math.PI*2/Math.max(3,signs.length);
  let x=.5+Math.cos(theta)*.27,y=.5+Math.sin(theta)*.27,scale=.12;
  if(options.spatial?.contain){
   const [outer,inner]=options.spatial.contain;
   if(signs[i].id===outer){x=.5;y=.34;scale=.27;}
   if(signs[i].id===inner){x=.5;y=.34;scale=.10;}
  }
  if(options.spatial?.link){
   const [from,to]=options.spatial.link;
   if(signs[i].id===from){x=.31;y=.31;scale=.12;}
   if(signs[i].id===to){x=.69;y=.31;scale=.12;}
  }
  const twist=options.rotateAll?angle:(i===0?angle:0);
  for(const path of renderSymbol(signs[i],{x,y},scale,twist))strokes.push(path);
  placements.push({id:signs[i].id,role:"sign",center:{x,y},rotationDegrees:twist});
 }
 if(options.spatial?.link){
  const [fromId,toId]=options.spatial.link,
    from=placements.find(p=>p.id===fromId&&p.role==="sign"),
    to=placements.find(p=>p.id===toId&&p.role==="sign");
  if(from&&to){
   const trace=Array.from({length:21},(_,i)=>({x:from.center.x+(to.center.x-from.center.x)*i/20,
    y:from.center.y+(to.center.y-from.center.y)*i/20,t:2200+i*11}));
   trace.intent="connector";strokes.push(trace);
  }
 }
 for(let i=0;i<nested;i++)strokes.push(circularPath(i===0?.185:.115,false,ringCenter));
 strokes.push(circularPath(.39,options.open!==false,ringCenter));
 return{strokes,ringIndex:strokes.length-1,nested,open:options.open!==false,placements};
}
export const recipes=[
 {tier:"beginner",ids:["fire"],label:"Fire Sigil",emoji:"🔥"},
 {tier:"beginner",ids:["water"],label:"Water Sigil",emoji:"💧"},
 {tier:"beginner",ids:["earth"],label:"Earth Sigil",emoji:"🪨"},
 {tier:"beginner",ids:["wind"],label:"Wind Sigil",emoji:"🌬️"},
 {tier:"beginner",ids:["wind","columns"],label:"Wind Blast",emoji:"🌬️"},
 {tier:"beginner",ids:["water","columns"],label:"Watershot",emoji:"💦"},
 {tier:"intermediate",ids:["wind","dispersion"],label:"Gust Wave",emoji:"🌪️"},
 {tier:"intermediate",ids:["fire","dispersion"],label:"Ring of Fire",emoji:"🔥"},
 {tier:"intermediate",ids:["fire","levitation"],label:"Pyreball",emoji:"🔥"},
 {tier:"intermediate",ids:["water","convergence"],label:"Water Orb",emoji:"💧"},
 {tier:"intermediate",ids:["earth","convergence"],label:"Stone Bastion",emoji:"🛡️"},
 {tier:"intermediate",ids:["fire","water"],label:"Steam Veil",emoji:"🌫️"},
 {tier:"intermediate",ids:["wind","veer"],rotate:90,label:"Curving Gale",emoji:"↪️"},
 {tier:"intermediate",ids:["water","orbit"],rotate:90,label:"Tidal Orbit",emoji:"🌀"},
 {tier:"advanced",ids:["wind","columns","expansion"],nested:1,label:"Nested Wind Cannon",emoji:"🌪️"},
 {tier:"advanced",ids:["fire","water","dispersion"],nested:1,label:"Steam Cathedral",emoji:"🌫️"},
 {tier:"advanced",ids:["wind","water","levitation"],nested:1,label:"Rain Spire",emoji:"🌧️"},
 {tier:"advanced",ids:["earth","wind","dispersion"],nested:1,label:"Sandstorm Barrier",emoji:"🏜️"},
 {tier:"advanced",ids:["fire","wind","veer","split"],rotate:90,label:"Forked Wildfire",emoji:"🔥"},
 {tier:"advanced",ids:["water","columns","veer"],rotate:90,nested:1,label:"Curving Watershot",emoji:"💦"},
 {tier:"advanced",ids:["fire","convergence","orbit"],nested:2,label:"Pyre Constellation",emoji:"✨"},
 {tier:"advanced",ids:["earth","water","convergence"],nested:1,label:"Living Clay",emoji:"🪨"},
 {tier:"advanced",ids:["wind","water","fire","expansion"],nested:1,label:"Tempest Crucible",emoji:"⛈️"},
 {tier:"advanced",ids:["earth","levitation","split"],nested:2,label:"Orbiting Shards",emoji:"🪨"},
 {tier:"advanced",ids:["wind","columns","veer"],spatial:{link:["columns","veer"]},label:"Guided Wind Lance",emoji:"🪄"},
 {tier:"advanced",ids:["wind","columns","veer"],spatial:{link:["veer","columns"]},label:"Deflected Wind Lance",emoji:"↪️"},
 {tier:"advanced",ids:["water","expansion","orbit"],spatial:{contain:["expansion","orbit"]},label:"Spiral Bloom",emoji:"🌀"},
 {tier:"advanced",ids:["fire","expansion","orbit"],spatial:{contain:["expansion","orbit"]},label:"Solar Vortex",emoji:"☀️"}
];
export const TIERS=[
{id:"beginner",name:"Beginner",subtitle:"Meet the elements",description:"One sigil at a time. Learn how enclosing a circle releases magic."},
{id:"intermediate",name:"Intermediate",subtitle:"Shape and redirect",description:"Use modifier signs, combine elements, and rotate asymmetric strokes."},
{id:"advanced",name:"Advanced",subtitle:"Layered spellcraft",description:"Combine multiple effects and nested focusing rings. Close the outermost ring last."}
];
