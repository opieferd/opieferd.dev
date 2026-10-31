/* Fan-made vector study of Witch Hat Atelier's sigils/signs.
 * Names and functions are sourced from the independent wiki; this test engine is unofficial.
 * Input and output are plain objects so the math can later be ported to Roblox Luau.
 */
const P=(...strokes)=>strokes;
export const SYMBOLS=[
{id:"fire",name:"Fire",role:"sigil",emoji:"🔥",color:"#ffac70",paths:P([[50,13],[86,78],[14,78],[50,13]],[[50,77],[50,97]],[[17,48],[36,60]],[[83,48],[64,60]]),referenceImage:"https://static.telepedia.net/witchhatatelierwiki/d/d8/Fire_sigil.png",credit:"Chromatic Flare",tip:"The manga's fire sigil: a triangle, two diagonal marks, and a short stem.",source:"https://witchhatatelier.telepedia.net/wiki/Sigils_Explained"},
{id:"water",name:"Water",role:"sigil",emoji:"💧",color:"#81bdfe",paths:P([[64,9],[50,10],[39,23],[40,39],[53,56],[64,73],[62,88],[48,95]],[[18,37],[11,60],[17,71],[24,62],[18,37]],[[80,39],[72,50],[78,76],[86,51],[80,39]]),referenceImage:"https://static.telepedia.net/witchhatatelierwiki/9/9d/Water.png",credit:"Chromatic Flare",tip:"The manga's water sigil: one flowing S and two droplet marks.",source:"https://witchhatatelier.telepedia.net/wiki/Sigils_Explained"},
{id:"earth",name:"Earth",role:"sigil",emoji:"🪨",color:"#dab990",paths:P([[22,14],[78,14]],[[50,14],[50,86]],[[35,32],[16,55],[50,85],[84,55],[65,32]],[[24,96],[76,96]]),referenceImage:"https://static.telepedia.net/witchhatatelierwiki/1/1e/Earth.png",credit:"Chromatic Flare and Bleuseil",tip:"The manga's earth sigil: a capped vertical pillar above a pointed diamond and lower bar. Side dots are ornamental.",source:"https://witchhatatelier.telepedia.net/wiki/Sigils_Explained"},
{id:"wind",name:"Wind",role:"sigil",emoji:"🌬️",color:"#9cddc8",paths:P([[62,16],[52,8],[40,12],[32,24],[33,35],[43,44],[52,43],[55,34],[47,29],[40,35],[50,47],[63,57],[68,69],[60,85],[44,91],[36,82],[36,70],[46,64],[54,71],[50,79]],[[13,27],[23,37]],[[7,51],[28,51]],[[13,72],[23,62]],[[77,37],[87,27]],[[73,51],[94,51]],[[77,62],[87,72]]),referenceImage:"https://static.telepedia.net/witchhatatelierwiki/d/d7/Wind_%28redirect%29.png",credit:"Chromatic Flare",tip:"The manga's wind sigil: a double curl flanked by three outward motion marks on each side.",source:"https://witchhatatelier.telepedia.net/wiki/Sigils_Explained"},
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

function circle(stroke,i){
 const s=pts(stroke);if(s.length<14)return null;
 const b=bbox(s);if(b.w<.43||b.h<.43)return null;
 const sampled=arcResample(s,96),center={x:sampled.reduce((sum,p)=>sum+p.x,0)/sampled.length,y:sampled.reduce((sum,p)=>sum+p.y,0)/sampled.length};
 const radii=sampled.map(p=>d(p,center)),radius=radii.reduce((sum,v)=>sum+v,0)/radii.length;
 const radialError=Math.sqrt(radii.reduce((sum,v)=>sum+(v-radius)**2,0)/radii.length)/radius;
 const aspect=Math.min(b.w,b.h)/Math.max(b.w,b.h),gap=d(s[0],s.at(-1))/radius;
 const circumference=s.slice(1).reduce((sum,p,i)=>sum+d(p,s[i]),0)/(2*Math.PI*radius);
 const quality=clamp(1-radialError*2.6-(1-aspect)-gap*.32);
 return {strokeIndex:i,strokeIndices:[i],completedAt:i,center,radius,quality:+quality.toFixed(3),gap:+gap.toFixed(3),radialError:+radialError.toFixed(3),coverage:+circumference.toFixed(3),valid:radialError<.22&&aspect>.65&&gap<.15&&circumference>.72&&quality>.52};
}
function boundaryScan(strokes){
 const candidates=strokes.map(circle).filter(Boolean),loops=candidates.filter(c=>c.valid);
 // An almost-complete ring can be activated with one final connecting stroke.
 for(const arc of candidates.filter(c=>!c.valid&&c.radialError<.22&&c.coverage>.68&&c.gap<1.05)){
  for(let j=arc.strokeIndex+1;j<strokes.length;j++){
   const a=strokes[arc.strokeIndex],b=strokes[j];
   if(b.length<2)continue;
   const tolerance=Math.max(.037,arc.radius*.19);
   const forwards=d(a.at(-1),b[0])<tolerance&&d(b.at(-1),a[0])<tolerance;
   const reversed=d(a.at(-1),b.at(-1))<tolerance&&d(b[0],a[0])<tolerance;
   if(!forwards&&!reversed)continue;
   const joined=a.concat(forwards?b:b.slice().reverse());
   const fitted=circle(joined,j);
   if(fitted?.valid)loops.push({...fitted,strokeIndices:[arc.strokeIndex,j],completedAt:j,closureType:"joined-strokes"});
  }
 }
 loops.sort((a,b)=>b.radius-a.radius||b.quality-a.quality);
 candidates.sort((a,b)=>b.radius-a.radius);
 return{boundary:loops[0]||null,candidates,pendingRing:candidates.find(c=>!c.valid&&c.radialError<.23&&c.coverage>.66&&c.gap<1.1)||null};
}
function autoSegment(strokes,indices,ring){
 // Drawing-order dynamic programming: recognize each multi-stroke symbol without a Finish button.
 const n=indices.length;if(!n)return[];
 const dp=Array(n+1).fill(-Infinity),choice=Array(n);dp[n]=0;
 for(let i=n-1;i>=0;i--){
  dp[i]=dp[i+1]-.075;choice[i]={length:1,unknown:true};
  for(let k=1;k<=Math.min(8,n-i);k++){
   const ids=indices.slice(i,i+k),lines=ids.map(j=>strokes[j]),b=bbox(lines.flat()),center={x:b.cx,y:b.cy};
   if(Math.max(b.w,b.h)<.025||!ring||d(center,ring.center)>ring.radius*.97)continue;
   const ranking=scores(lines),best=ranking[0],margin=best.score-(ranking[1]?.score||0);
   if(best.score<.49||(margin<.015&&best.score<.81))continue;
   const definition=SYMBOLS.find(s=>s.id===best.id),countDiff=Math.abs(k-definition.paths.length);
   if(countDiff>2)continue;
   const radial=d(center,ring.center)/ring.radius;
   const spatial=best.role==="sigil"?(radial<.58?.075:-.13):(radial>.28?.05:-.035);
   const utility=1.4*(best.score-.50)+.085*(k-1)-.105-.07*countDiff+spatial;
   const total=utility+dp[i+k];
   if(total>dp[i]){dp[i]=total;choice[i]={length:k,unknown:false};}
  }
 }
 const groups=[];
 for(let i=0;i<n;){const c=choice[i];if(c.unknown){groups.push([indices[i]]);i++;continue;}groups.push(indices.slice(i,i+c.length));i+=c.length;}
 return groups;
}
function segment(strokes,excluded,groups,ring){
 const used=new Set(excluded),out=[];
 if(Array.isArray(groups))for(const group of groups){
  const ids=group.filter(i=>i>=0&&i<strokes.length&&!used.has(i));
  if(!ids.length)continue;
  ids.forEach(i=>used.add(i));out.push(ids);
 }
 const rest=strokes.map((_,i)=>i).filter(i=>!used.has(i));
 out.push(...autoSegment(strokes,rest,ring));
 return out;
}
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
function parse(boundary,recognized,warnings,inkCount=0){const elemental=recognized.filter(g=>g.role==="sigil"),signs=recognized.filter(g=>g.role==="sign"),unique=[...new Set(elemental.map(g=>g.id))],mods=[...new Set(signs.map(g=>g.id))];if(boundary&&!elemental.length&&!signs.length&&inkCount===0)return{schemaVersion:3,valid:true,elements:[],signs:[],power:Math.round(boundary.quality*35),reading:Math.round(boundary.quality*100),seal:{center:boundary.center,radius:boundary.radius,quality:boundary.quality},glyphs:[],output:{emoji:"💥",title:"Empty-Ring Shockwave",text:"A closed ring without a sigil releases a sudden pulse of raw magical energy."},warnings};
if(!boundary||!elemental.length)return{schemaVersion:3,valid:false,elements:[],signs:mods,power:0,output:{emoji:"📜",title:"Unfinished seal",text:"Complete a ring and draw at least one elemental sigil."},warnings};
const key=unique.slice().sort().join("+"),base=reactions[key],primary=unique[0],selected=mods[0],simple=special[primary+"|"+selected],name=unique.map(id=>SYMBOLS.find(g=>g.id===id).name).join(" + "),emoji=unique.map(id=>SYMBOLS.find(g=>g.id===id).emoji).join(" "),actions={columns:"The spell projects in a directed column.",dispersion:"The effect disperses across a broad area.",levitation:"The magic rises and lifts its target.",convergence:"Its energy concentrates into a compact point.",expansion:"The effected area grows.",pull:"The effect draws its targets inward."},title=unique.length===1&&simple?simple[0]:base?base[0]:name+" Working",description=unique.length===1&&simple?simple[1]:base?base[1]:"A combined working weaves together "+name.toLowerCase()+" magic.",tail=mods.length>1?" Other signs: "+mods.slice(1).map(k=>actions[k]).filter(Boolean).join(" "):unique.length>1&&selected?" "+actions[selected]:"";
const size=elemental.reduce((a,g)=>a+g.relativeSize,0)/elemental.length,power=Math.round(clamp((.21+size*.95)*boundary.quality+Math.min(signs.length*.025,.1))*100);
return{schemaVersion:3,valid:true,elements:unique,signs:mods,power,reading:Math.round(recognized.reduce((sum,g)=>sum+g.score,0)/recognized.length*100),spellType:"fan interpretation",seal:{center:boundary.center,radius:boundary.radius,quality:boundary.quality},glyphs:recognized.map(g=>({id:g.id,role:g.role,strokeIndices:g.strokeIndices,confidence:g.score,relativeSize:g.relativeSize})),output:{emoji,title,text:description+tail},warnings}}

export function analyzeSeal(raw,groups=[]){
 const strokes=(Array.isArray(raw)?raw:[]).slice(0,120).map(pts).filter(s=>s.length>1);
 const {boundary,candidates:boundaryCandidates,pendingRing}=boundaryScan(strokes);
 const teachingRing=boundary||pendingRing||{center:{x:.5,y:.5},radius:.39,quality:0};
 const excluded=new Set([...(boundary?.strokeIndices||[]),...(pendingRing?[pendingRing.strokeIndex]:[])]);
 const warnings=[],regions=[],recognized=[];
 if(!boundary)warnings.push(pendingRing?"Close the gap in the outer ring to cast your spell.":"Your magic is prepared. Draw and close the outer ring to cast.");
 for(const ids of segment(strokes,excluded,groups,teachingRing)){
  const lines=ids.map(i=>strokes[i]),b=bbox(lines.flat()),inside=d({x:b.cx,y:b.cy},teachingRing.center)<teachingRing.radius*.97;
  const ranking=scores(lines),best=ranking[0],lead=best.score-(ranking[1]?.score||0);
  const accepted=inside&&best.score>=.49&&(lead>=.015||best.score>.81);
  const reason=!inside?"Outside the outer ring":best.score<.49?"No matching sigil or sign":lead<.015?"Ambiguous symbol":"";
  regions.push({strokeIndices:ids,bounds:b,inside,recognized:accepted?best.id:null,candidates:ranking.slice(0,4),confidence:best.score,accepted,reason});
  if(accepted){const s=SYMBOLS.find(x=>x.id===best.id);recognized.push({...best,name:s.name,strokeIndices:ids,relativeSize:+(Math.max(b.w,b.h)/(2*teachingRing.radius)).toFixed(3)})}
  else if(boundary)warnings.push("Strokes "+ids.map(i=>i+1).join(", ")+": "+reason+".");
 }
 if(boundary&&!recognized.some(g=>g.role==="sigil")&&regions.length)warnings.push("The ring closed, but its inscriptions need a recognizable elemental sigil.");
 const ast={schemaVersion:3,ring:boundary?{strokeIndices:boundary.strokeIndices,completedAt:boundary.completedAt,quality:boundary.quality,center:boundary.center,radius:boundary.radius}:null,
  pendingRing:pendingRing?{strokeIndex:pendingRing.strokeIndex,gap:pendingRing.gap,quality:pendingRing.quality}:null,
  regions:regions.map(r=>({strokes:r.strokeIndices,recognized:r.recognized,score:r.confidence})),symbols:recognized.map(g=>({id:g.id,role:g.role,strokes:g.strokeIndices}))};
 const inkCount=strokes.length-excluded.size;
 const ir=parse(boundary,recognized,warnings,inkCount);
 if(!boundary){ir.valid=false;ir.output={emoji:"🖋️",title:"Spell prepared",text:recognized.length?recognized.map(g=>g.name).join(" + ")+" inscribed. Close the outer ring to activate it.":"Draw elemental sigils and modifier signs, then close the outer circle."};}
 return{strokes,boundary,boundaryCandidates,pendingRing,regions,recognized,ast,warnings,ir,
  ready:!!boundary,completion:boundary?{strokeIndices:boundary.strokeIndices,completedAt:boundary.completedAt,type:boundary.closureType||"single-stroke"}:null};
}

function ring(open=false){
 const start=open?.23:0,end=open?Math.PI*2-.23:Math.PI*2;
 return Array.from({length:open?93:97},(_,i)=>{const a=start+(end-start)*i/(open?92:96);return{x:.5+.39*Math.cos(a),y:.5+.39*Math.sin(a),t:2000+i*12}});
}
export function closeRingStroke(){return Array.from({length:13},(_,i)=>{const angle=Math.PI*2-.23+.46*i/12;return{x:.5+.39*Math.cos(angle),y:.5+.39*Math.sin(angle),t:4000+i*12}});}
function place(symbol,center,size){return symbol.paths.map(path=>path.map(([x,y],i)=>({x:center.x+(x-50)*size/100,y:center.y+(y-50)*size/100,t:i*15})))}
export function makeExample(ids=["wind","columns"],options={}){
 const chosen=ids.map(id=>SYMBOLS.find(g=>g.id===id)).filter(Boolean),
 elements=chosen.filter(g=>g.role==="sigil"),signs=chosen.filter(g=>g.role==="sign");
 const strokes=[],groups=[];
 for(let i=0;i<elements.length;i++){
  const x=.5+(i-(elements.length-1)/2)*.2,paths=place(elements[i],{x,y:.52},elements.length>1?.19:.27),indices=[];
  for(const path of paths){indices.push(strokes.length);strokes.push(path)}groups.push(indices);
 }
 for(let i=0;i<signs.length;i++){
  const angle=-Math.PI/2+i*Math.PI*2/Math.max(3,signs.length),
  paths=place(signs[i],{x:.5+Math.cos(angle)*.28,y:.5+Math.sin(angle)*.28},.12),indices=[];
  for(const path of paths){indices.push(strokes.length);strokes.push(path)}groups.push(indices);
 }
 strokes.push(ring(!!options.open));
 return{strokes,groups,ringIndex:strokes.length-1,open:!!options.open};
}
export function normalizedCloud(group){return normCloud(group)}
export const recipes=[
{ids:["wind","columns"],label:"Wind Blast",emoji:"🌬️"},{ids:["wind","dispersion"],label:"Gust Wave",emoji:"🌪️"},{ids:["wind","levitation"],label:"Skysoaring",emoji:"🫧"},
{ids:["water","columns"],label:"Watershot",emoji:"💦"},{ids:["water","levitation"],label:"Floating Drops",emoji:"🫧"},{ids:["water","convergence"],label:"Water Orb",emoji:"💧"},
{ids:["fire","columns"],label:"Flame Shot",emoji:"🔥"},{ids:["fire","dispersion"],label:"Ring of Fire",emoji:"🔥"},{ids:["earth","columns"],label:"Earth Lift",emoji:"🪨"},
{ids:["earth","convergence"],label:"Stone Bastion",emoji:"🛡️"},{ids:["fire","water","dispersion"],label:"Steam Veil",emoji:"🌫️"},
{ids:["wind","water","levitation"],label:"Rain Current",emoji:"🌧️"},{ids:["earth","wind","dispersion"],label:"Dustwhirl",emoji:"🌪️"}
];
