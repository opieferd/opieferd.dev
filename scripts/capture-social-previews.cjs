/**
 * Capture honest, page-specific social sharing screenshots.
 * Run from the repository root after: npm install --no-save playwright
 * python3 -m http.server 4173 --bind 127.0.0.1
 * node scripts/capture-social-previews.cjs
 *
 * Every card is a Chromium screenshot of the actual page at 1200x630.
 * GitHub Actions checks generated PNGs into social-previews/.
 */
const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');

const pages=[
  {route:'/',slug:'home'},
  {route:'/donate/',slug:'donate'},
  {route:'/guessthefood/',slug:'guessthefood'},
  {route:'/magic/',slug:'magic'},
  {route:'/magic-original/',slug:'magic-original'},
  {route:'/lafire.html',slug:'lafire'},
  {route:'/opieferd-old.dev/',slug:'legacy-site'},
  {route:'/watch/',slug:'watch'},
  {route:'/watch/ad/',slug:'watch-support'},
  {route:'/watch/categories/',slug:'watch-categories'},
  {route:'/watch/movies/',slug:'watch-movies'},
  {route:'/watch/party/',slug:'watch-party'},
  {route:'/watch/search/',slug:'watch-search'},
  {route:'/watch/trending/',slug:'watch-trending'},
  {route:'/watch/tv/',slug:'watch-tv'},
  {route:'/watch/upgrade/',slug:'watch-upgrade'}
];
const host=process.env.PREVIEW_BASE_URL||'http://127.0.0.1:4173';
const out=path.resolve('social-previews');
const wait=ms=>new Promise(r=>setTimeout(r,ms));

async function run(){
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 let errors=0;
 try{
  for(const {route,slug} of pages){
   const page=await browser.newPage({
    viewport:{width:1200,height:630},deviceScaleFactor:1,
    colorScheme:'dark',reducedMotion:'reduce',locale:'en-US'
   });
   const failures=[];
   page.on('pageerror',e=>failures.push(e.message));
   try{
    const url=new URL(route,host).toString();
    const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:25000});
    if(!response||!response.ok())throw Error('HTTP '+(response?.status()||'no response'));
    await page.evaluate(async()=>{
     document.fonts?.ready&&await Promise.race([document.fonts.ready,new Promise(resolve=>setTimeout(resolve,1800))]);
     document.querySelectorAll('video,audio').forEach(el=>{try{el.pause()}catch{}});
    });
    await wait(1800);
    const filename=path.join(out,slug+'.png');
    await page.screenshot({path:filename,type:'png',fullPage:false,animations:'disabled',caret:'hide',timeout:15000});
    const size=fs.statSync(filename).size;
    if(size<5000||size>5000000)throw Error('Unexpected PNG size: '+size);
    console.log('Captured '+route+' -> '+filename+' ('+Math.round(size/1024)+' KiB)');
    if(failures.length)console.log('Non-fatal page JS issues on '+route+': '+failures.slice(0,2).join(' | '));
   }catch(err){
    errors++;console.error('Could not capture '+route+': '+err.message);
   }finally{await page.close();}
  }
 }finally{await browser.close();}
 if(errors)throw Error(errors+' page(s) failed; previews not ready for publishing');
 console.log('All '+pages.length+' social preview screenshots generated.');
}
run().catch(err=>{console.error(err);process.exitCode=1;});
