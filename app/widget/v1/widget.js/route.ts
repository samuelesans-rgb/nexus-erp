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
    fetch(base+"/api/widget/v1/"+encodeURIComponent(key)+"/config").then(function(response){if(!response.ok)throw new Error();return response.json()}).then(function(config){
      var requested=script.getAttribute("data-mode");
      var mode=["INLINE","MODAL","FLOATING_BUTTON"].indexOf(requested)>=0?requested:config.mode;
      var frame=document.createElement("iframe");
      frame.src=base+"/embed/booking/"+encodeURIComponent(key);
      frame.title=script.getAttribute("data-title")||"Prenotazione tavolo";
      frame.loading="lazy";
      frame.setAttribute("allow","clipboard-write");
      if(mode==="INLINE"){
        frame.style.cssText="width:100%;height:720px;border:0;display:block;";
        script.insertAdjacentElement("afterend",frame);
      }else{
        var launcher=document.createElement("button"),overlay=document.createElement("div"),dialog=document.createElement("div"),close=document.createElement("button"),previousFocus=null;
        launcher.type="button";launcher.textContent=config.buttonLabel||"Prenota ora";launcher.setAttribute("aria-haspopup","dialog");launcher.setAttribute("aria-expanded","false");
        launcher.style.cssText="font:600 16px system-ui;padding:12px 18px;border:0;border-radius:"+config.borderRadius+"px;background:"+config.primaryColor+";color:"+config.secondaryColor+";cursor:pointer;"+(mode==="FLOATING_BUTTON"?"position:fixed;right:20px;bottom:20px;z-index:2147483646;box-shadow:0 8px 30px rgba(0,0,0,.25);":"");
        overlay.style.cssText="position:fixed;inset:0;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(15,23,42,.62);z-index:2147483647;";
        dialog.style.cssText="position:relative;width:min(760px,100%);height:min(90vh,820px);background:#fff;border-radius:"+config.borderRadius+"px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.35);";
        dialog.setAttribute("role","dialog");dialog.setAttribute("aria-modal","true");dialog.setAttribute("aria-label",config.heading||"Prenotazione tavolo");
        close.type="button";close.textContent="×";close.setAttribute("aria-label","Chiudi widget prenotazioni");close.style.cssText="position:absolute;right:10px;top:10px;z-index:2;width:40px;height:40px;border:0;border-radius:999px;background:#fff;color:#0f172a;font-size:26px;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.2);";
        frame.style.cssText="width:100%;height:100%;border:0;display:block;";
        dialog.appendChild(close);dialog.appendChild(frame);overlay.appendChild(dialog);document.body.appendChild(overlay);script.insertAdjacentElement("afterend",launcher);
        function open(){previousFocus=document.activeElement;overlay.style.display="flex";launcher.setAttribute("aria-expanded","true");document.body.style.overflow="hidden";close.focus()}
        function hide(){overlay.style.display="none";launcher.setAttribute("aria-expanded","false");document.body.style.overflow="";if(previousFocus&&previousFocus.focus)previousFocus.focus()}
        launcher.addEventListener("click",open);close.addEventListener("click",hide);overlay.addEventListener("click",function(event){if(event.target===overlay)hide()});
        overlay.addEventListener("keydown",function(event){if(event.key==="Escape")hide();if(event.key==="Tab"){var items=[close,frame],index=items.indexOf(document.activeElement);if(event.shiftKey&&index<=0){event.preventDefault();frame.focus()}else if(!event.shiftKey&&index===items.length-1){event.preventDefault();close.focus()}}});
      }
      window.addEventListener("message",function(event){
        if(event.origin!==base||event.source!==frame.contentWindow||!event.data||event.data.type!=="nexus-booking:resize")return;
        if(mode==="INLINE")frame.style.height=Math.max(320,Math.min(1200,Number(event.data.height)||720))+"px";
      });
    }).catch(function(){script.dataset.nexusError="1"});
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
