import {SYMBOLS,analyzeSeal,makeExample,normalizedCloud,recipes,TIERS} from "./arcana-engine.js?v=arcana-4";
const $=id=>document.getElementById(id), ink=$("magic-ink"),overlay=$("magic-debug-layer"),ctx=ink.getContext("2d"),ox=overlay.getContext("2d");
let strokes=[],active=null,pointer=null,selected="wind",selectedTier="beginner",showGuide=true,mode="practice",casted=false,analysis=analyzeSeal([]);
const status=$("magic-status"),result=$("magic-result"),book=$("magic-book");
const make=(tag,className,text)=>{const x=document.createElement(tag);if(className)x.className=className;if(text!==undefined)x.textContent=text;return x};
const clamp=(v,lo=0,hi=1)=>Math.min(hi,Math.max(lo,v));
const size=()=>({w:ink.getBoundingClientRect().width,h:ink.getBoundingClientRect().height});
function poly(ctx,s,w,h,color,width=2,dash=[]){if(!s.length)return;ctx.save();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.lineCap="round";ctx.lineJoin="round";ctx.beginPath();ctx.moveTo(s[0].x*w,s[0].y*h);for(let i=1;i<s.length;i++)ctx.lineTo(s[i].x*w,s[i].y*h);ctx.stroke();ctx.restore();}
function symbolSvg(sym){const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");svg.setAttribute("viewBox","0 0 120 120");svg.setAttribute("aria-hidden","true");const NS="http://www.w3.org/2000/svg";
const circle=document.createElementNS(NS,"circle");circle.setAttribute("cx","60");circle.setAttribute("cy","60");circle.setAttribute("r","53");circle.setAttribute("fill","none");circle.setAttribute("stroke","#b5894670");circle.setAttribute("stroke-width","1.3");circle.setAttribute("stroke-dasharray","4 4");svg.append(circle);
for(const path of sym.paths){const line=document.createElementNS(NS,"polyline");line.setAttribute("points",path.map(([x,y])=>(10+x)+","+(10+y)).join(" "));line.setAttribute("stroke",sym.color);line.setAttribute("stroke-width","3");line.setAttribute("stroke-linecap","round");line.setAttribute("stroke-linejoin","round");line.setAttribute("fill","none");svg.append(line)}
return svg;}
function setCanvasSize(){const ratio=Math.min(devicePixelRatio||1,2.3);for(const canvas of [ink,overlay]){const r=canvas.getBoundingClientRect();canvas.width=Math.round(r.width*ratio);canvas.height=Math.round(r.height*ratio);canvas.getContext("2d").setTransform(ratio,0,0,ratio,0,0)}draw();}
function draw(){const{w,h}=size();ctx.clearRect(0,0,w,h);ctx.shadowColor="#ebaf3675";ctx.shadowBlur=10;for(const s of strokes)poly(ctx,s,w,h,"#f1c980",3.1);if(active)poly(ctx,active,w,h,"#ffdda1",3.2);ctx.shadowBlur=0;$("magic-strokes").textContent=strokes.length+" strokes · "+analysis.recognized.length+" detected";debugPaint();}
function guidePaths(sym){const sigil=sym.role==="sigil",cx=.5,cy=sigil?.51:.24,z=sigil?.28:.145;return sym.paths.map(s=>s.map(([x,y])=>({x:cx+(x-50)*z/100,y:cy+(y-50)*z/100})));}
function debugPaint(){const{w,h}=size();ox.clearRect(0,0,w,h);
if(showGuide&&!casted){
 const angles=Array.from({length:93},(_,i)=>.23+(Math.PI*2-.46)*i/92);
 const ring=angles.map(a=>({x:.5+.39*Math.cos(a),y:.5+.39*Math.sin(a)}));
 poly(ox,ring,w,h,"#edb85d35",1.8,[5,7]);
 const sym=SYMBOLS.find(s=>s.id===selected);
 if(sym&&strokes.length<12){for(const path of guidePaths(sym))poly(ox,path,w,h,"#ebaf365c",2,[4,7]);}
 if(selectedTier==="advanced"&&!analysis.innerRings.length){const inner=Array.from({length:96},(_,i)=>({x:.5+.185*Math.cos(i*2*Math.PI/95),y:.5+.185*Math.sin(i*2*Math.PI/95)}));poly(ox,inner,w,h,"#a990ef55",1.6,[3,7]);}
}
if(analysis.pendingRing&&!analysis.boundary){
 const stroke=analysis.strokes[analysis.pendingRing.strokeIndex],endpoints=[stroke?.[0],stroke?.at(-1)].filter(Boolean);
 if(endpoints.length===2){
  poly(ox,endpoints,w,h,"#ffc970a8",1.7,[3,5]);
  for(const p of endpoints){ox.save();ox.fillStyle="#ffc970";ox.shadowColor="#ebaf36";ox.shadowBlur=11;ox.beginPath();ox.arc(p.x*w,p.y*h,5.5,0,Math.PI*2);ox.fill();ox.restore();}
 }
}
if(mode==="practice")return;
const fit=$("debug-fit").checked,boxes=$("debug-boxes").checked,labels=$("debug-labels").checked,points=$("debug-points").checked;
const boundary=analysis.boundary||analysis.pendingRing;
if(fit&&boundary){ox.save();ox.beginPath();ox.setLineDash([7,5]);ox.strokeStyle=analysis.ready?"#a3f8b3":"#ffe1a0";ox.lineWidth=1.8;ox.arc(boundary.center.x*w,boundary.center.y*h,boundary.radius*Math.min(w,h),0,2*Math.PI);ox.stroke();ox.restore();}
for(const inner of analysis.innerRings||[]){ox.save();ox.beginPath();ox.setLineDash([3,6]);ox.strokeStyle="#b9a2ff";ox.lineWidth=2;ox.arc(inner.center.x*w,inner.center.y*h,inner.radius*Math.min(w,h),0,Math.PI*2);ox.stroke();ox.restore();}
for(const r of analysis.regions){const b=r.bounds,col=r.accepted?"#9cdca7":"#f28f8f";
 if(boxes){ox.save();ox.strokeStyle=col;ox.lineWidth=1.8;ox.setLineDash([4,5]);ox.strokeRect(b.x*w-6,b.y*h-6,b.w*w+12,b.h*h+12);ox.restore();}
 if(labels){const label=(r.recognized||"unknown")+" "+Math.round(r.confidence*100)+"%";ox.save();ox.font="11px 'DM Mono',monospace";const width=ox.measureText(label).width+13,x=clamp(b.x*w-4,0,Math.max(0,w-width));ox.fillStyle="#15110de8";ox.fillRect(x,Math.max(0,b.y*h-22),width,19);ox.fillStyle=col;ox.fillText(label,x+5,Math.max(12,b.y*h-8));ox.restore();}
}
if(mode==="deep"&&points){const ringIndices=new Set(analysis.boundary?.strokeIndices||[]);strokes.forEach((s,i)=>{ox.fillStyle=ringIndices.has(i)?"#ffc86d":"#cda1ff";const skip=Math.max(1,Math.round(s.length/40));for(let j=0;j<s.length;j+=skip){ox.beginPath();ox.arc(s[j].x*w,s[j].y*h,2,0,Math.PI*2);ox.fill();}})}
}
function point(e){const r=ink.getBoundingClientRect();return{x:clamp((e.clientX-r.left)/r.width),y:clamp((e.clientY-r.top)/r.height),t:performance.now()};}
function add(e){if(!active)return;const p=point(e),last=active.at(-1);if(!last||Math.hypot(p.x-last.x,p.y-last.y)>.0009)active.push(p)}
ink.addEventListener("pointerdown",e=>{if(pointer!==null)return;if(casted&&analysis.ready){status.textContent="The ring is already sealed. Undo the last stroke or clear the parchment to prepare another spell.";return;}pointer=e.pointerId;ink.setPointerCapture(pointer);active=[];add(e);draw()});
ink.addEventListener("pointermove",e=>{if(e.pointerId!==pointer||!active)return;const ev=typeof e.getCoalescedEvents==="function"?e.getCoalescedEvents():[e];for(const v of ev)add(v);draw()});
function finish(e){
 if(e.pointerId!==pointer)return;
 add(e);const added=active?.length>1;if(added)strokes.push(active);active=null;pointer=null;
 refresh({checkClosure:added});draw();
}
ink.addEventListener("pointerup",finish);ink.addEventListener("pointercancel",finish);
function refresh({checkClosure=false}={}){
 const wasClosed=analysis.ready;
 analysis=analyzeSeal(strokes); // Fully automatic, with no explicit stroke-group hints.
 const justClosed=checkClosure&&!wasClosed&&analysis.ready&&analysis.completion?.completedAt===strokes.length-1;
 if(justClosed){
  casted=true;
  if(analysis.ir.valid){
   save();
   status.textContent="✦ Circle closed! "+analysis.ir.output.title+" was cast automatically.";
  }else status.textContent="The ring closed, but the inscriptions were unstable. "+(analysis.warnings.at(-1)||"Try another sigil.");
 }else if(!analysis.ready){
  casted=false;
  if(analysis.pendingRing)status.textContent="Seal prepared. Connect the two glowing endpoints to close the ring and cast.";
  else if(analysis.recognized.length)status.textContent=analysis.recognized.map(g=>g.name).join(" + ")+" detected. Draw a large outer ring last to cast.";
  else status.textContent="Draw elemental sigils and modifier signs first, then close a large circle around them.";
 }
 const ringStatus=$("magic-ring-state");
 ringStatus.textContent=casted?"✦ Ring sealed — spell activated":analysis.pendingRing?"◌ Ring open — connect endpoints":"◌ Magic prepared — awaiting ring";
 ringStatus.dataset.sealed=String(casted);
 renderResult();inspect();
}
function renderResult(){
 const ir=analysis.ir;result.replaceChildren();
 result.append(make("div","magic-output-emoji",ir.output.emoji),make("h3","",ir.output.title),make("p","",ir.output.text));
 if(casted&&ir.valid){const stats=make("div","magic-stats");stats.append(make("span","","Power "+ir.power+" / 100"),make("span","","Recognition "+ir.reading+" / 100"),make("span","",TIERS.find(t=>t.id===ir.tier)?.name||"Beginner"));if(ir.rings?.nested?.length)stats.append(make("span","",ir.rings.nested.length+" nested ring(s)"));if(ir.effects?.some(e=>e.asymmetric))stats.append(make("span","","Direction "+ir.direction));result.append(stats);}
}

const key="opie_magic_wha_lab_v1";function loadSaved(){try{return JSON.parse(localStorage.getItem(key)||"{}")||{}}catch{return{}}}
function save(){try{const data=loadSaved(),ir=analysis.ir,signature=[...ir.elements].sort().join("+")+"::"+[...ir.signs].sort().join("+");data[signature]={emoji:ir.output.emoji,title:ir.output.title,power:Math.max(data[signature]?.power||0,ir.power),tier:ir.tier,rotation:ir.rotationDegrees,nested:ir.rings?.nested?.length||0};localStorage.setItem(key,JSON.stringify(data));showSaved()}catch{status.textContent="Spell cast successfully. Your browser did not allow saving it."}}
function showSaved(){
 book.replaceChildren();
 const entries=Object.values(loadSaved()).filter(v=>(v.tier||"beginner")===selectedTier);
 if(!entries.length){book.append(make("p","magic-note","No "+selectedTier+" discoveries yet. Explore a recipe, close its outer ring, and it will appear here."));return;}
 for(const spell of entries){const item=make("div","magic-book-entry");item.append(make("span","",spell.emoji+" "+spell.title),make("small","","Power "+spell.power));book.append(item);}
 const counts=Object.values(loadSaved());
 for(const button of document.querySelectorAll("[data-book-tier]"))button.querySelector(".magic-tier-count").textContent=counts.filter(v=>(v.tier||"beginner")===button.dataset.bookTier).length;
}
function displayLesson(id){selected=id;const s=SYMBOLS.find(g=>g.id===id);if(!s)return;document.querySelectorAll(".magic-lesson").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.glyph===id)));$("lesson-name").textContent=s.emoji+" "+s.name;$("lesson-role").textContent=s.role==="sigil"?"Central sigil":"Modifier sign";$("lesson-steps").textContent=s.tip+" "+s.paths.length+" pen stroke"+(s.paths.length===1?"":"s")+".";
$("lesson-source").hidden=!s.source;$("lesson-source").href=s.source||"#lessons";$("lesson-source").textContent=s.source?"Source: Sigils / Signs Explained ↗":"";
$("lesson-credit").textContent=s.experimental?"Original experimental modifier for this web prototype; not a canonical manga sign.":s.credit?"Reference illustration: "+s.credit+" · Independent Witch Hat Atelier Wiki":"Interactive sign study based on the Independent Witch Hat Atelier Wiki";debugPaint()}
function showLessons(){const out=$("magic-lessons-grid");for(const s of SYMBOLS){const b=make("button","magic-lesson");b.type="button";b.dataset.glyph=s.id;b.dataset.lessonLevel=s.experimental?"advanced":s.role==="sign"&&s.id!=="columns"?"intermediate":"beginner";b.setAttribute("aria-pressed","false");const art=make("span","magic-lesson-art");if(s.referenceImage){const image=make("img","magic-reference-sigil");image.src=s.referenceImage;image.loading="lazy";image.alt="Reference drawing of the "+s.name+" sigil";image.onerror=()=>{image.replaceWith(symbolSvg(s))};art.append(image)}else art.append(symbolSvg(s));const copy=make("span","magic-lesson-copy");copy.append(make("span","magic-lesson-role",s.experimental?"Experimental sign":s.role==="sigil"?"Elemental sigil":"Directional / modifier sign"),make("strong","",s.emoji+" "+s.name),make("small","",s.tip));b.append(art,copy);b.addEventListener("click",()=>displayLesson(s.id));out.append(b)}}
function loadExample(recipe){
 const ids=Array.isArray(recipe)?recipe:recipe.ids;
 const nested=Array.isArray(recipe)?0:recipe.nested||0,rotate=Array.isArray(recipe)?0:recipe.rotate||0;
 const ex=makeExample(ids,{open:true,nested,rotate});
 strokes=ex.strokes;casted=false;refresh();draw();
 status.textContent="Recipe prepared"+(nested?" with "+nested+" focusing ring(s)":"")+(rotate?" and a rotated sign":"")+". Join the glowing endpoints of the outer ring to cast.";
}
function showRecipes(){
 const out=$("magic-recipes-grid");out.replaceChildren();
 const visible=recipes.filter(r=>r.tier===selectedTier);
 for(const r of visible){
  const b=make("button","magic-recipe");b.type="button";
  b.append(make("span","magic-recipe-icon",r.emoji),make("span","magic-recipe-title",r.label),make("small","",r.ids.map(id=>SYMBOLS.find(s=>s.id===id)?.name||id).join(" + ")));
  if(r.nested||r.rotate){const flags=make("span","magic-recipe-flags",(r.nested?"◎ "+r.nested+" inner ring(s) ":"")+(r.rotate?"↻ "+r.rotate+"°":""));b.append(flags);}
  b.addEventListener("click",()=>loadExample(r));out.append(b);
 }
 const t=TIERS.find(x=>x.id===selectedTier);
 $("magic-tier-description").textContent=t.description+" · "+visible.length+" guided recipes.";
}
function setTier(tier){
 if(!TIERS.some(x=>x.id===tier))return;
 selectedTier=tier;for(const tab of document.querySelectorAll("[data-book-tier]")){const on=tab.dataset.bookTier===tier;tab.setAttribute("aria-selected",String(on));tab.tabIndex=on?0:-1;}
 for(const card of document.querySelectorAll(".magic-lesson")){const req=card.dataset.lessonLevel;card.hidden=(tier==="beginner"&&req!=="beginner")||(tier==="intermediate"&&req==="advanced");}
 const chosen=document.querySelector('.magic-lesson[aria-pressed="true"]');if(chosen?.hidden)displayLesson("wind");
 showRecipes();showSaved();debugPaint();
}
function setupTiers(){
 for(const holder of [$("magic-book-tabs"),$("magic-tier-tabs")]){
  for(const t of TIERS){const btn=make("button","magic-tier-tab");btn.type="button";btn.dataset.bookTier=t.id;btn.setAttribute("role","tab");btn.setAttribute("aria-selected","false");
   const text=make("span","",t.name),count=make("span","magic-tier-count","");
   btn.append(text,count);btn.addEventListener("click",()=>setTier(t.id));holder.append(btn);}
 }
}

$("magic-undo").addEventListener("click",()=>{strokes.pop();casted=false;refresh();draw();});
$("magic-clear").addEventListener("click",()=>{strokes=[];casted=false;refresh();draw();});
$("magic-demo").addEventListener("click",()=>loadExample(["wind","columns"]));
$("lesson-demo").addEventListener("click",()=>loadExample(SYMBOLS.find(s=>s.id===selected)?.role==="sign"?["wind",selected]:[selected]));

$("magic-guide").addEventListener("click",()=>{showGuide=!showGuide;$("magic-guide").setAttribute("aria-pressed",String(showGuide));debugPaint()});
for(const btn of document.querySelectorAll(".magic-mode"))btn.addEventListener("click",()=>setMode(btn.dataset.mode));for(const id of ["debug-fit","debug-boxes","debug-labels","debug-points"])$(id).addEventListener("change",debugPaint);
function setMode(value){mode=value;document.querySelectorAll(".magic-mode").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.mode===value)));$("magic-inspector").hidden=value==="practice";$("deep-settings").hidden=value!=="deep";$("magic-json-wrap").hidden=value!=="deep";inspect();draw()}
function inspect(){if(mode==="practice")return;const info=$("debug-summary"),regions=$("debug-regions");info.textContent=analysis.boundary?"Outer ring "+Math.round(analysis.boundary.quality*100)+"% · "+analysis.innerRings.length+" inner ring(s) · "+analysis.recognized.length+" glyphs":analysis.pendingRing?"Outer ring open · "+analysis.innerRings.length+" inner ring(s) · "+analysis.recognized.length+" glyphs":"Prepared · "+analysis.innerRings.length+" inner ring(s) · "+analysis.recognized.length+" glyphs";regions.replaceChildren();if(!analysis.regions.length)regions.append(make("p","magic-note","No symbols detected yet. Draw the individual marks of a sigil and they will be grouped automatically."));for(const r of analysis.regions){const box=make("div","magic-debug-row"),left=make("div",""),right=make("div","");left.append(make("strong","",(r.recognized||"Unknown")+" · strokes "+r.strokeIndices.map(i=>i+1).join(",")),make("small","",(r.reason||"Group recognized")+" · "+r.zone+" · "+r.rotationDegrees+"°"));for(const c of r.candidates.slice(0,3))right.append(make("div","",c.name+" "+Math.round(c.score*100)+"%"));box.append(left,right);regions.append(box)}
$("magic-json").textContent=JSON.stringify({ast:analysis.ast,spell:analysis.ir,warnings:analysis.warnings},null,2);
const mini=$("magic-normalized"),ratio=Math.min(devicePixelRatio||1,2),rect=mini.getBoundingClientRect(),c=mini.getContext("2d");mini.width=Math.round(rect.width*ratio);mini.height=Math.round(rect.height*ratio);c.setTransform(ratio,0,0,ratio,0,0);c.clearRect(0,0,rect.width,rect.height);const first=analysis.regions.find(r=>r.accepted)||analysis.regions[0];if(first){const paths=first.strokeIndices.map(i=>analysis.strokes[i]),cloud=normalizedCloud(paths),symbol=SYMBOLS.find(s=>s.id===first.candidates[0]?.id);for(const p of cloud){c.fillStyle="#ebaf36";c.fillRect(rect.width*(.5+p.x*.64),rect.height*(.5+p.y*.64),3,3)}if(symbol){const target=normalizedCloud(symbol.paths.map(path=>path.map(([x,y])=>({x:x/100,y:y/100}))));for(const p of target){c.fillStyle="#b18cffaa";c.fillRect(rect.width*(.5+p.x*.64),rect.height*(.5+p.y*.64),2,2)}}}}
$("magic-export").addEventListener("click",()=>{const blob=new Blob([JSON.stringify({schemaVersion:4,date:new Date().toISOString(),strokes,analysis},null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="witch-hat-seal-test.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
$("magic-reset-book").addEventListener("click",()=>{if(!confirm("Erase this version's grimoire entries?"))return;localStorage.removeItem(key);showSaved()});
showLessons();setupTiers();setTier("beginner");displayLesson("wind");refresh();setMode(new URLSearchParams(location.search).has("debug")?"deep":"practice");if("ResizeObserver"in window)new ResizeObserver(setCanvasSize).observe(ink);else window.addEventListener("resize",setCanvasSize);setCanvasSize();
