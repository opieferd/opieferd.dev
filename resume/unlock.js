"use strict";
const form=document.getElementById("unlock-form"),input=document.getElementById("access-key"),msg=document.getElementById("message"),button=document.getElementById("unlock-button");
const rotate=(v,n)=>(v<<n)|(v>>>(32-n));
function quarter(x,a,b,c,d){x[a]=(x[a]+x[b])>>>0;x[d]=rotate(x[d]^x[a],16);x[c]=(x[c]+x[d])>>>0;x[b]=rotate(x[b]^x[c],12);x[a]=(x[a]+x[b])>>>0;x[d]=rotate(x[d]^x[a],8);x[c]=(x[c]+x[d])>>>0;x[b]=rotate(x[b]^x[c],7)}
function words(hex){const out=[];for(let i=0;i<hex.length;i+=8){const t=hex.slice(i,i+8);out.push(parseInt(t.slice(6,8)+t.slice(4,6)+t.slice(2,4)+t.slice(0,2),16)>>>0)}return out}
function block(key,nonce,counter){
 const s=new Uint32Array([0x61707865,0x3320646e,0x79622d32,0x6b206574,...words(key),counter>>>0,...words(nonce)]),x=Uint32Array.from(s);
 for(let i=0;i<10;i++){quarter(x,0,4,8,12);quarter(x,1,5,9,13);quarter(x,2,6,10,14);quarter(x,3,7,11,15);quarter(x,0,5,10,15);quarter(x,1,6,11,12);quarter(x,2,7,8,13);quarter(x,3,4,9,14)}
 const result=new Uint8Array(64);
 for(let i=0;i<16;i++){const v=(x[i]+s[i])>>>0;for(let j=0;j<4;j++)result[i*4+j]=(v>>>(8*j))&255}
 return result;
}
function decode(bytes,key,nonce){const result=new Uint8Array(bytes.length);for(let i=0;i<bytes.length;i+=64){const stream=block(key,nonce,1+i/64);for(let j=0;j<64&&i+j<bytes.length;j++)result[i+j]=bytes[i+j]^stream[j]}return result}
let active=false;
async function unlock(raw){
 const key=raw.trim().toLowerCase();
 if(!/^[a-f0-9]{64}$/.test(key)){msg.textContent="Invalid access-key format.";msg.className="error";return}
 if(active)return;active=true;button.disabled=true;msg.className="";msg.textContent="Opening private portfolio…";
 try{
  const response=await fetch("./secure-content.json",{cache:"no-store"});
  if(!response.ok)throw new Error("Unavailable");
  const data=await response.json();
  if(data.version!==1||data.cipher!=="ChaCha20"||!(/^[a-f0-9]{24}$/).test(data.nonce))throw new Error("Unsupported format");
  const bytes=Uint8Array.from(atob(data.content),x=>x.charCodeAt(0));
  const html=new TextDecoder("utf-8",{fatal:true}).decode(decode(bytes,key,data.nonce));
  if(!html.startsWith("<!doctype html>")||!html.includes('id="page-title"'))throw new Error("Incorrect key");
  history.replaceState(null,"",location.pathname+location.search+"#access="+key);
  const safe=html.replace(/<head>/i,'<head><meta name="robots" content="noindex,nofollow,noarchive,nosnippet,noimageindex"><meta name="referrer" content="no-referrer">');
  document.open();document.write(safe);document.close();
 }catch{msg.textContent="Could not unlock. Check your access key.";msg.className="error";button.disabled=false;active=false}
}
form.addEventListener("submit",event=>{event.preventDefault();unlock(input.value)});
const key=new URLSearchParams(location.hash.slice(1)).get("access");
if(key){input.value=key;unlock(key)}
