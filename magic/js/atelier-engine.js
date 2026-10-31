/* Fan-made vector study of Witch Hat Atelier's sigils/signs.
 * Names and functions are sourced from the independent wiki; this test engine is unofficial.
 * Input and output are plain objects so the math can later be ported to Roblox Luau.
 */
const P=(...strokes)=>strokes;
export const SYMBOLS=[
{id:"fire",name:"Fire",role:"sigil",emoji:"🔥",color:"#ffac70",paths:P([[50,12],[85,77],[15,77],[50,12]],[[50,76],[50,94]],[[13,45],[32,57]],[[87,45],[68,57]]),tip:"A central triangle, a descending stem, and two crossing strokes.",source:"https://witchhatatelier.telepedia.net/wiki/Sigils_Explained"},
{id:"water",name:"Water",role:"sigil",emoji:"💧",color:"#81bdfe",paths:P([[54,9],[39,15],[34,30],[50,45],[60,57],[55,76],[41,89]],[[18,39],[11,54],[17,67],[24,54],[18,39]],[[79,33],[73,46],[78,59],[85,49],[79,33]]),tip:"A winding central current with droplets on either side.",source:"https://witchhatatelier.telepedia.net/wiki/Sigils_Explained"},
{id:"earth",name:"Earth",role:"sigil",emoji:"🪨",color:"#dab990",paths:P([[18,23],[82,77]],[[37,14],[89,67]],[[11,36],[63,88]],[[82,23],[18,77]],[[63,14],[11,67]],[[89,36],[37,88]]),tip:"An interwoven lattice of six diagonal strokes.",source:"https://witchhatatelier.telepedia.net/wiki/Sigils_Explained"},
{id:"wind",name:"Wind",role:"sigil",emoji:"🌬️",color:"#9cddc8",paths:P([[58,10],[39,13],[29,30],[45,44],[67,55],[64,75],[45,89],[35,78]],[[6,36],[21,38]],[[6,57],[21,57]],[[78,36],[94,33]],[[79,56],[94,57]]),tip:"An S-shaped current with paired motion marks on both sides.",source:"https://witchhatatelier.telepedia.net/wiki/Sigils_Explained"},
{id:"columns",name:"Columns",role:"sign",emoji:"➤",color:"#d5b4fa",paths:P([[50,13],[50,87]],[[20,18],[80,18]]),tip:"A long stem and perpendicular bar. Directs the magic like a beam.",source:"https://witchhatatelier.telepedia.net/wiki/Signs_Explained"},
{id:"dispersion",name:"Dispersion",role:"sign",emoji:"✺",color:"#f9d48d",paths:P([[50,79],[50,24]],[[26,33],[50,15],[74,33]]),tip:"A spreading fork. Sends magic out into a wider area.",source:"https://witchhatatelier.telepedia.net/wiki/Signs_Explained"},
{id:"levitation",name:"Levitation",role:"sign",emoji:"🫧",color:"#d2c3fb",paths:P([[50,85],[50,20]],[[25,45],[50,16],[75,45]],[[34,87],[66,87]]),tip:"An upward lifting arrow with a lower balance mark.",source:"https://witchhatatelier.telepedia.net/wiki/Signs_Explained"},
{id:"convergence",name:"Convergence",role:"sign",emoji:"🔹",color:"#f5b991",paths:P([[18,25],[50,77],[82,25],[18,25]]),tip:"A pointed triangular focus to gather magic together.",source:"https://witchhatatelier.telepedia.net/wiki/Signs_Explained"},
{id:"expansion",name:"Expansion",role:"sign",emoji:"↗️",color:"#f3c86e",paths:P([[18,42],[18,18],[42,18]],[[58,18],[82,18],[82,42]],[[82,58],[82,82],[58,82]],[[42,82],[18,82],[18,58]]),tip:"Four outward corners that widen or enlarge the magic.",source:"https://witchhatatelier.telepedia.net/wiki/Signs_Explained"},
{id:"pull",name:"Pull",role:"sign",emoji:"🧲",color:"#b5d4ff",paths:P([[50,15],[50,86]],[[25,58],[50,85],[75,58]]),tip:"A stem and inward-pointing arrow. Draw the arrow toward its target.",source:"https://witchhatatelier.telepedia.net/wiki/Signs_Explained"}
];
const clamp=(x,lo=0,hi=1)=>Math.max(lo,Math.min(hi,x));
const d=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const pts=stroke=>(stroke||[]).filter(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)).slice(0,3000).map(p=>({x:clamp(p.x),y:clamp(p.y),t:p.t??0}));
function bbox(flat){let loX=Infinity,loY=Infinity,hiX=-Infinity,hiY=-Infinity;for(const p of flat){loX=Math.min(loX,p.x);loY=Math.min(loY,p.y);hiX=Math.max(hiX,p.x);hiY=Math.max(hiY,p.y);}return{x:loX,y:loY,w:hiX-loX,h:hiY-loY,cx:(loX+hiX)/2,cy:(loY+hiY)/2};}
function arcResample(stroke,n=24){if(!stroke.length)return[];if(stroke.length===1)return Array.from({length:n},()=>stroke[0]);const lengths=[0];for(let i=1;i<stroke.length;i++)lengths[i]=lengths[i-1]+d(stroke[i],stroke[i-1]);let idx=1;const total=lengths.at(-1);if(total<1e-8)return Array.from({length:n},()=>stroke[0]);const out=[];for(let i=0;i<n;i++){const target=total*i/(n-1);while(idx<lengths.length-1&&lengths[idx]<target)idx++;const a=stroke[idx-1],b=stroke[idx],f=clamp((target-lengths[idx-1])/(lengths[idx]-lengths[idx-1]||1));out.push({x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f})}return out}
function normCloud(strokes){const all=strokes.flat();if(!all.length)return[];const b=bbox(all),scale=Math.max(b.w,b.h,.00001);return strokes.flatMap(s=>arcResample(s,Math.max(8,Math.round(100/strokes.length))).map(p=>({x:(p.x-b.cx)/scale,y:(p.y-b.cy)/scale})))}
const reference=new Map(SYMBOLS.map(g=>[g.id,normCloud(g.paths.map(s=>s.map(([x,y])=>({x:x/100,y:y/100}))))]));
function pointDistance(a,b){let sum=0;for(const p of a){let best=Infinity;for(const q of b){const v=(p.x-q.x)**2+(p.y-q.y)**2;if(v<best)best=v}sum+=Math.sqrt(best)}return sum/Math.max(a.length,1)}
function scores(strokes){if(!strokes.length)return[];const cloud=normCloud(strokes),box=bbox(strokes.flat());return SYMBOLS.map(symbol=>{const target=reference.get(symbol.id),raw=(pointDistance(cloud,target)+pointDistance(target,cloud))*.5;const nDiff=Math.abs(strokes.length-symbol.paths.length),aspect=bbox(symbol.paths.flat().map(([x,y])=>({x:x/100,y:y/100})));const aspectError=Math.abs(box.w/Math.max(box.h,.00001)-aspect.w/Math.max(aspect.h,.00001));const penalty=Math.min(.2,nDiff*.055)+Math.min(.1,aspectError*.08);const confidence=clamp(1-raw/.28-penalty);return{id:symbol.id,name:symbol.name,role:symbol.role,emoji:symbol.emoji,score:+confidence.toFixed(3),error:+raw.toFixed(4)}}).sort((a,b)=>b.score-a.score)}
function circle(stroke,i){if(stroke.length<14)return null;const b=bbox(stroke);if(b.w<.43||b.h<.43)return null;const sampled=arcResample(stroke,80),c={x:sampled.reduce((s,p)=>s+p.x,0)/sampled.length,y:sampled.reduce((s,p)=>s+p.y,0)/sampled.length};const radii=sampled.map(p=>d(p,c)),radius=radii.reduce((a,b)=>a+b,0)/radii.length,variance=Math.sqrt(radii.reduce((sum,v)=>sum+(v-radius)**2,0)/radii.length)/radius,aspect=Math.min(b.w,b.h)/Math.max(b.w,b.h),gap=d(stroke[0],stroke.at(-1))/radius;return{strokeIndex:i,center:c,radius,quality:+clamp(1-variance*2.8-(1-aspect)-gap*.75).toFixed(3),gap:+gap.toFixed(3),radialError:+variance.toFixed(3),valid:variance<.22&&aspect>.65&&gap<.73}}
function segment(strokes,ringIndex,groups,ring){const used=new Set(),out=[];if(Array.isArray(groups))for(const indices of groups){const list=indices.filter(i=>i!==ringIndex&&i>=0&&i<strokes.length&&!used.has(i));if(list.length){list.forEach(i=>used.add(i));out.push(list)}}
const rest=strokes.map((_,i)=>i).filter(i=>i!==ringIndex&&!used.has(i));const parent=new Map(rest.map(i=>[i,i]));
// Uncommitted strokes near the center usually belong to one multi-stroke elemental sigil.
// Explicitly finished symbols remain separate, so two adjacent elements can still coexist.
const central=ring?rest.filter(i=>{const b=bbox(strokes[i]);return d({x:b.cx,y:b.cy},ring.center)<ring.radius*.46}):[];
if(central.length>1)for(const i of central.slice(1))parent.set(i,central[0]);function root(x){while(parent.get(x)!==x)x=parent.get(x);return x}function merge(a,b){parent.set(root(a),root(b))}
const gapBetween=(a,b)=>{const x=Math.max(0,Math.max(a.x,b.x)-Math.min(a.x+a.w,b.x+b.w)),y=Math.max(0,Math.max(a.y,b.y)-Math.min(a.y+a.h,b.y+b.h));return Math.hypot(x,y)};
for(let k=0;k<rest.length;k++)for(let j=k+1;j<rest.length;j++){const a=bbox(strokes[rest[k]]),b=bbox(strokes[rest[j]]);const distance=gapBetween(a,b);if(distance<.026)merge(rest[k],rest[j])}
const clusters=new Map();for(const i of rest){const k=root(i);if(!clusters.has(k))clusters.set(k,[]);clusters.get(k).push(i)}out.push(...clusters.values());return out}
const reactions={
"earth+fire":["Magma Working","Stone heats and softens, becoming molten rock."],
"earth+water":["Clay Shaping","Water saturates the earth, gathering into malleable clay."],
"earth+wind":["Dustwhirl","A whirling current lifts dust and sand into the air."],
"fire+water":["Steam Veil","Heat and water mingle into a billowing cloud of steam."],
"fire+wind":["Wildfire Gust","A swift current feeds and carries a roaring flame."],
"water+wind":["Rain Current","Air catches suspended droplets and moves them in a streaming cloud."]
};
const special={
"wind|columns":["Wind Blast","A focused, forceful blast of moving air shoots outward."],
"wind|dispersion":["Gust Wave","A wide wave of wind spreads in every direction."],
"wind|levitation":["Skysoaring Current","A rising current carries its target upward."],
"wind|convergence":["Wind Wall","Air gathers into a dense, protective wall."],
"wind|pull":["Grasping Wind","The current pulls loose objects toward the casting circle."],
"wind|expansion":["Great Gale","A widening mass of air sweeps across the area."],
"water|columns":["Watershot","A compressed jet of water surges along a fixed path."],
"water|dispersion":["Rising Wave","Water surges outward in a spreading wave."],
"water|levitation":["Floating Drops","Suspended globes of water drift above the seal."],
"water|convergence":["Water Orb","Water condenses into a floating concentrated sphere."],
"water|expansion":["Tidal Bloom","The gathered water expands into a broad flood."],
"fire|columns":["Flame Shot","A fierce column of fire is propelled outward."],
"fire|dispersion":["Ring of Fire","Flames spill outward to surround the seal."],
"fire|levitation":["Pyreball","A floating fireball rises and burns steadily."],
"fire|convergence":["Kindled Ember","A compact, concentrated ember burns brightly."],
"fire|expansion":["Flame Burst","The flame swells and bursts out from the circle."],
"earth|columns":["Earth Lift","A pillar of soil and rock is forced upward."],
"earth|dispersion":["Shifting Ground","Stone and earth spread across the surrounding ground."],
"earth|levitation":["Suspended Stone","Nearby rocks lift from the ground and hover."],
"earth|convergence":["Stone Bastion","Loose earth compacts into a strong barrier."],
"earth|expansion":["Stone Bloom","Existing stone swells and extends into a larger structure."]
};
function parse(boundary,recognized,warnings){const elemental=recognized.filter(g=>g.role==="sigil"),signs=recognized.filter(g=>g.role==="sign"),unique=[...new Set(elemental.map(g=>g.id))],mods=[...new Set(signs.map(g=>g.id))];if(!boundary||!elemental.length)return{schemaVersion:2,valid:false,elements:[],signs:mods,power:0,output:{emoji:"📜",title:"Unfinished seal",text:"Complete a ring and draw at least one elemental sigil."},warnings};
const key=unique.slice().sort().join("+"),base=reactions[key],primary=unique[0],selected=mods[0],simple=special[primary+"|"+selected],name=unique.map(id=>SYMBOLS.find(g=>g.id===id).name).join(" + "),emoji=unique.map(id=>SYMBOLS.find(g=>g.id===id).emoji).join(" "),actions={columns:"The spell projects in a directed column.",dispersion:"The effect disperses across a broad area.",levitation:"The magic rises and lifts its target.",convergence:"Its energy concentrates into a compact point.",expansion:"The effected area grows.",pull:"The effect draws its targets inward."},title=unique.length===1&&simple?simple[0]:base?base[0]:name+" Working",description=unique.length===1&&simple?simple[1]:base?base[1]:"A combined working weaves together "+name.toLowerCase()+" magic.",tail=mods.length>1?" Other signs: "+mods.slice(1).map(k=>actions[k]).filter(Boolean).join(" "):unique.length>1&&selected?" "+actions[selected]:"";
const size=elemental.reduce((a,g)=>a+g.relativeSize,0)/elemental.length,power=Math.round(clamp((.21+size*.95)*boundary.quality+Math.min(signs.length*.025,.1))*100);
return{schemaVersion:2,valid:true,elements:unique,signs:mods,power,reading:Math.round(recognized.reduce((sum,g)=>sum+g.score,0)/recognized.length*100),spellType:"fan interpretation",seal:{center:boundary.center,radius:boundary.radius,quality:boundary.quality},glyphs:recognized.map(g=>({id:g.id,role:g.role,strokeIndices:g.strokeIndices,confidence:g.score,relativeSize:g.relativeSize})),output:{emoji,title,text:description+tail},warnings}}
export function analyzeSeal(raw,groups=[]){const strokes=(Array.isArray(raw)?raw:[]).slice(0,120).map(pts).filter(s=>s.length>1);const boundaryCandidates=strokes.map(circle).filter(Boolean).sort((a,b)=>Number(b.valid)-Number(a.valid)||b.quality-a.quality),boundary=boundaryCandidates.find(b=>b.valid)||null,warnings=[];if(!boundary)warnings.push("Draw one continuous, closed outer ring before casting.");
const regions=[],recognized=[];for(const ids of segment(strokes,boundary?.strokeIndex,groups,boundary)){const lines=ids.map(i=>strokes[i]),b=bbox(lines.flat()),inside=!!boundary&&d({x:b.cx,y:b.cy},boundary.center)<boundary.radius*.95,ranking=scores(lines),winner=ranking[0],lead=winner.score-(ranking[1]?.score||0),accepted=!!boundary&&inside&&winner.score>=.47&&(lead>=.03||winner.score>.72),reason=!inside?"Outside the ring":winner.score<.47?"No matching manga sigil/sign":lead<.03?"Ambiguous symbol":"";regions.push({strokeIndices:ids,bounds:b,inside,recognized:accepted?winner.id:null,candidates:ranking.slice(0,4),confidence:winner.score,accepted,reason});if(accepted){const symbol=SYMBOLS.find(s=>s.id===winner.id);recognized.push({...winner,name:symbol.name,strokeIndices:ids,relativeSize:+(Math.max(b.w,b.h)/(2*boundary.radius)).toFixed(3)})}else if(boundary)warnings.push("Strokes "+ids.map(i=>i+1).join(", ")+": "+reason+".")}
if(boundary&&!recognized.some(g=>g.role==="sigil"))warnings.push("The seal needs a recognizable elemental sigil.");
const ast={schemaVersion:2,ring:boundary?{strokeIndex:boundary.strokeIndex,quality:boundary.quality,center:boundary.center,radius:boundary.radius}:null,regions:regions.map(r=>({strokes:r.strokeIndices,recognized:r.recognized,score:r.confidence})),symbols:recognized.map(g=>({id:g.id,role:g.role,strokes:g.strokeIndices}))};
return{strokes,boundary,boundaryCandidates,regions,recognized,ast,warnings,ir:parse(boundary,recognized,warnings)}}
function ring(){return Array.from({length:97},(_,i)=>({x:.5+.39*Math.cos(i*2*Math.PI/96),y:.5+.39*Math.sin(i*2*Math.PI/96),t:i*12}))}
function place(symbol,center,size){return symbol.paths.map(path=>path.map(([x,y],i)=>({x:center.x+(x-50)*size/100,y:center.y+(y-50)*size/100,t:i*15})))}
export function makeExample(ids=["wind","columns"]){const chosen=ids.map(id=>SYMBOLS.find(g=>g.id===id)).filter(Boolean),elements=chosen.filter(g=>g.role==="sigil"),signs=chosen.filter(g=>g.role==="sign"),strokes=[ring()],groups=[];for(let i=0;i<elements.length;i++){const x=.5+(i-(elements.length-1)/2)*.2,paths=place(elements[i],{x,y:.52},elements.length>1?.19:.27),indices=[];for(const path of paths){indices.push(strokes.length);strokes.push(path)}groups.push(indices)}for(let i=0;i<signs.length;i++){const angle=-Math.PI/2+i*Math.PI*2/Math.max(3,signs.length),paths=place(signs[i],{x:.5+Math.cos(angle)*.28,y:.5+Math.sin(angle)*.28},.12),indices=[];for(const path of paths){indices.push(strokes.length);strokes.push(path)}groups.push(indices)}return{strokes,groups}}
export function normalizedCloud(group){return normCloud(group)}
export const recipes=[
{ids:["wind","columns"],label:"Wind Blast",emoji:"🌬️"},{ids:["wind","dispersion"],label:"Gust Wave",emoji:"🌪️"},{ids:["wind","levitation"],label:"Skysoaring",emoji:"🫧"},
{ids:["water","columns"],label:"Watershot",emoji:"💦"},{ids:["water","levitation"],label:"Floating Drops",emoji:"🫧"},{ids:["water","convergence"],label:"Water Orb",emoji:"💧"},
{ids:["fire","columns"],label:"Flame Shot",emoji:"🔥"},{ids:["fire","dispersion"],label:"Ring of Fire",emoji:"🔥"},{ids:["earth","columns"],label:"Earth Lift",emoji:"🪨"},
{ids:["earth","convergence"],label:"Stone Bastion",emoji:"🛡️"},{ids:["fire","water","dispersion"],label:"Steam Veil",emoji:"🌫️"},
{ids:["wind","water","levitation"],label:"Rain Current",emoji:"🌧️"},{ids:["earth","wind","dispersion"],label:"Dustwhirl",emoji:"🌪️"}
];
