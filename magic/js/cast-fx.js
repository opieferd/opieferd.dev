/* Lightweight elemental cast feedback. All visual effects are CSS/DOM only. */
const PALETTE=Object.freeze({
 fire:["255,78,47","255,169,63"],water:["39,156,255","100,218,254"],
 earth:["198,132,64","246,205,114"],wind:["247,250,255","172,214,241"]
});
const CORNERS=["tl","tr","bl","br"],SOUND_KEY="opie_magic_cast_sound_v1";
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
export function castColors(elements=[]){
 const ids=[...new Set(elements)].filter(id=>Object.hasOwn(PALETTE,id));
 if(!ids.length)return["238,174,74","253,226,164","238,174,74","253,226,164"];
 if(ids.length===1){const[a,b]=PALETTE[ids[0]];return[a,b,b,a];}
 if(ids.length===2)return[PALETTE[ids[0]][0],PALETTE[ids[1]][0],PALETTE[ids[0]][1],PALETTE[ids[1]][1]];
 if(ids.length===3)return[PALETTE[ids[0]][0],PALETTE[ids[1]][0],PALETTE[ids[2]][0],PALETTE[ids[0]][1]];
 return ids.slice(0,4).map(id=>PALETTE[id][0]);
}
export function createCastEffects(){
 const page=document.createElement("div");page.className="magic-cast-fx";page.setAttribute("aria-hidden","true");document.body.appendChild(page);
 const parchment=document.querySelector(".magic-canvas-wrap"),seal=document.createElement("div");
 seal.className="magic-seal-fx";seal.setAttribute("aria-hidden","true");
 const bloom=document.createElement("span");bloom.className="magic-seal-fx-bloom";
 const ringA=document.createElement("span");ringA.className="magic-seal-fx-ring magic-seal-fx-ring-a";
 const ringB=document.createElement("span");ringB.className="magic-seal-fx-ring magic-seal-fx-ring-b";
 const sparks=document.createElement("span");sparks.className="magic-seal-fx-sparks";
 const title=document.createElement("span");title.className="magic-seal-fx-title";title.textContent="✦ SPELL CAST ✦";
 const dots=Array.from({length:16},(_,i)=>{
  const node=document.createElement("i");node.className="magic-seal-fx-spark";node.style.setProperty("--spark-delay",((i%4)*32)+"ms");sparks.appendChild(node);return node;
 });
 seal.append(bloom,ringA,ringB,sparks,title);parchment?.appendChild(seal);
 const sound=new Audio(new URL("../audio/cast-stinger.mp3",import.meta.url).href);
 const failureSound=new Audio(new URL("../audio/miscast-fizzle.mp3",import.meta.url).href);
 sound.preload="auto";sound.volume=.75;
 failureSound.preload="auto";failureSound.volume=.8;
 let soundOn=true;try{soundOn=localStorage.getItem(SOUND_KEY)!=="off";}catch{}
 function syncButton(button){
  if(!button)return;
  button.setAttribute("aria-pressed",String(soundOn));
  button.textContent=soundOn?"🔊 Sound on":"🔇 Sound off";
  button.setAttribute("aria-label",soundOn?"Mute casting sound":"Enable casting sound");
 }
 function updateSparks(center,radius,power){
  const side=parchment?.getBoundingClientRect().width||450;
  const distance=clamp(side*radius*.83,38,330),travel=clamp(18+power*.32,25,50);
  dots.forEach((dot,i)=>{
   const angle=i/dots.length*Math.PI*2+(i%3)*.09;
   dot.style.setProperty("--spark-x",(center.x*100+Math.cos(angle)*distance/side*100).toFixed(2)+"%");
   dot.style.setProperty("--spark-y",(center.y*100+Math.sin(angle)*distance/side*100).toFixed(2)+"%");
   dot.style.setProperty("--spark-dx",Math.round(Math.cos(angle)*travel)+"px");
   dot.style.setProperty("--spark-dy",Math.round(Math.sin(angle)*travel)+"px");
   dot.style.setProperty("--spark-size",i%5===0?"5px":"3px");
  });
 }
 function activate(elements,power,ring,mode){
  const miscast=mode!=="success",colors=miscast?["181,98,215","255,118,104","110,82,168","221,138,103"]:castColors(elements);
  CORNERS.forEach((c,i)=>page.style.setProperty("--cast-"+c,colors[i]));
  page.style.setProperty("--cast-alpha",miscast?".39":clamp(.29+(Number(power)||0)/560,.31,.46).toFixed(3));
  const center=ring?.center||{x:.5,y:.5},radius=clamp(ring?.radius||.39,.18,.48);
  seal.style.setProperty("--cast-primary",colors[0]);
  seal.style.setProperty("--cast-secondary",colors[1]);
  seal.style.setProperty("--cast-x",(center.x*100).toFixed(2)+"%");
  seal.style.setProperty("--cast-y",(center.y*100).toFixed(2)+"%");
  seal.style.setProperty("--cast-size",(2*radius*100).toFixed(2)+"%");
  title.textContent=mode==="lost-control"?"⚡ MAGIC UNBOUND ⚡":miscast?"✕ MISCAST ✕":"✦ SPELL CAST ✦";
  updateSparks(center,radius,Number(power)||50);
  page.classList.remove("is-active","is-miscast");
  seal.classList.remove("is-active","is-miscast");
  void seal.offsetWidth;
  if(miscast){page.classList.add("is-miscast");seal.classList.add("is-miscast");}
  page.classList.add("is-active");seal.classList.add("is-active");
  if(soundOn){
   try{
    const active=miscast?failureSound:sound,other=miscast?sound:failureSound;
    other.pause();active.pause();active.currentTime=0;
    const result=active.play();
    if(result&&typeof result.catch==="function")result.catch(()=>{});
   }catch{}
  }
 }
 return{
  syncButton,isSoundOn(){return soundOn;},
  setMuted(muted,button){
   soundOn=!muted;try{localStorage.setItem(SOUND_KEY,muted?"off":"on");}catch{}
   if(muted){sound.pause();failureSound.pause();}
   syncButton(button);
  },
  play(elements=[],power=50,ring=null){activate(elements,power,ring,"success");},
  playMiscast(elements=[],power=50,ring=null,type="failed"){activate(elements,power,ring,type==="lost-control"?"lost-control":"failed");}
 };

}
