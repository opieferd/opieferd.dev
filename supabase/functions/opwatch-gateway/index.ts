// OPwatch diagnostic gateway: never proxies arbitrary URLs or YouTube media.
const allowedOrigin = "https://opieferd.dev";
const headers = {"Access-Control-Allow-Origin":allowedOrigin,"Access-Control-Allow-Methods":"GET, OPTIONS","Access-Control-Allow-Headers":"content-type, authorization, apikey","Cache-Control":"no-store"};
Deno.serve(async (req) => {
  if(req.method==="OPTIONS") return new Response(null,{status:204,headers});
  if(req.method!=="GET") return Response.json({error:"Method not allowed"},{status:405,headers});
  const url=new URL(req.url);
  if(url.pathname.endsWith("/health")) return Response.json({ok:true,service:"opwatch-gateway",mode:"diagnostics-only"},{headers});
  if(url.searchParams.get("action")!=="diagnose") return Response.json({error:"Unknown action"},{status:400,headers});
  const id=url.searchParams.get("id")||"";
  if(!/^[A-Za-z0-9_-]{11}$/.test(id)) return Response.json({error:"Invalid YouTube video ID"},{status:400,headers});
  const endpoints=[
    ["youtube-oembed","https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D"+id+"&format=json"],
    ["youtube-thumbnail","https://i.ytimg.com/vi/"+id+"/hqdefault.jpg"]
  ];
  const checks=await Promise.all(endpoints.map(async ([name,endpoint])=>{
    const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),4500);
    try{const response=await fetch(endpoint,{method:"HEAD",signal:controller.signal});return {name,reachable:response.ok,status:response.status};}
    catch(error){return {name,reachable:false,error:String(error)}}
    finally{clearTimeout(timeout)}
  }));
  return Response.json({id,checks,playback:"YouTube stream URLs are not supplied by the Data API. Use the official embed for YouTube, or direct licensed media sources for HTML5."},{headers});
});
