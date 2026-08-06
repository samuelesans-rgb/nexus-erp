const source = String.raw`(function(){
  "use strict";
  var current=document.currentScript;
  var scripts=current&&current.hasAttribute("data-nexus-booking")?[current]:Array.prototype.slice.call(document.querySelectorAll("script[data-nexus-booking]"));
  scripts.forEach(function(script){
    if(script.dataset.nexusReady)return;
    script.dataset.nexusReady="1";
    var key=script.getAttribute("data-nexus-booking");
    if(!key)return;
    var base=new URL(script.src).origin;
    var frame=document.createElement("iframe");
    frame.src=base+"/embed/booking/"+encodeURIComponent(key);
    frame.title=script.getAttribute("data-title")||"Prenotazione tavolo";
    frame.loading="lazy";
    frame.style.cssText="width:100%;height:720px;border:0;display:block;";
    frame.setAttribute("allow","clipboard-write");
    script.insertAdjacentElement("afterend",frame);
    fetch(base+"/api/widget/v1/"+encodeURIComponent(key)+"/config").then(function(response){return response.ok?response.json():null}).then(function(config){
      if(!config||config.mode!=="MODAL")return;
      frame.style.cssText="position:fixed;inset:5%;width:90%;height:90%;border:0;z-index:2147483647;background:#fff;display:none;box-shadow:0 20px 60px rgba(0,0,0,.35);";
      var open=document.createElement("button");open.type="button";open.textContent=config.buttonLabel||"Prenota ora";
      var close=document.createElement("button");close.type="button";close.textContent="Chiudi";close.setAttribute("aria-label","Chiudi widget prenotazioni");close.style.cssText="position:fixed;right:6%;top:6%;z-index:2147483647;display:none;";
      script.insertAdjacentElement("afterend",open);document.body.appendChild(close);
      open.onclick=function(){frame.style.display="block";close.style.display="block"};close.onclick=function(){frame.style.display="none";close.style.display="none"};
      window.addEventListener("keydown",function(event){if(event.key==="Escape")close.click()});
    }).catch(function(){});
    window.addEventListener("message",function(event){
      if(event.origin!==base||event.source!==frame.contentWindow||!event.data||event.data.type!=="nexus-booking:resize")return;
      var height=Math.max(320,Math.min(1200,Number(event.data.height)||720));
      frame.style.height=height+"px";
    });
  });
})();`;

export function GET() {
  return new Response(source, { headers: {
    "Content-Type": "application/javascript; charset=utf-8",
    "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "cross-origin",
  } });
}
