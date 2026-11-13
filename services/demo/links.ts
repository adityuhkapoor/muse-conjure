// Two fixed-layout links served by the gateway: /m/ is always the mobile interface and /d/ always
// the desktop one. Each is a tiny page that embeds the app (at "/") in an iframe; inside an iframe the
// app's own media queries see the iframe's width, so nothing in the app changes.

type Kind = "m" | "d";

const STYLE = `
:root{color-scheme:dark}
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:#17181a;color:#9a9ea6;font:13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif}
iframe{border:0;display:block;background:#fff}
a{color:#c9ccd2}
`;

const MOBILE = `
body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;overflow:hidden}
#stage{position:relative;flex:none}
#app{position:absolute;left:0;top:0;width:393px;height:852px;border-radius:44px;transform-origin:0 0;box-shadow:0 0 0 1px #2c2e33,0 20px 60px #0008}
#cap{flex:none;height:22px;display:flex;gap:10px;white-space:nowrap}
@media (max-width:499px){
  body{display:block}
  #stage{position:fixed;inset:0;width:auto!important;height:auto!important}
  #app{width:100%!important;height:100%!important;border-radius:0;transform:none!important;box-shadow:none}
  #cap{display:none}
}`;

const DESKTOP = `
body{overflow:auto}
#app{width:100%;height:100vh;height:100dvh}
@media (max-width:1099px){#app{width:1440px}}
`;

const MOBILE_JS = `
var app=document.getElementById("app"),stage=document.getElementById("stage");
function fit(){
  if(innerWidth<500)return;
  var s=Math.min(1,(innerHeight-60)/852,(innerWidth-24)/393);
  stage.style.width=393*s+"px";stage.style.height=852*s+"px";
  app.style.transform="scale("+s+")";
}
fit();addEventListener("resize",fit);`;

export function linkPage(kind: Kind, search: string): string {
  const q = new URLSearchParams(search);
  const mobile = kind === "m";
  if (mobile) q.set("phone", "1");
  const inner = "/" + (q.toString() ? "?" + q.toString() : "");
  const title = `Muse prototype · ${mobile ? "mobile" : "desktop"}`;
  const body = mobile
    ? `<div id="stage"><iframe id="app" title="Muse prototype" src="${inner.replace(/&/g, "&amp;")}" allow="clipboard-write; fullscreen"></iframe></div>
<div id="cap"><span>Prototype · mobile</span><a href="/d/" id="other">Open desktop</a></div>`
    : `<iframe id="app" title="Muse prototype" src="${inner.replace(/&/g, "&amp;")}" allow="clipboard-write; fullscreen"></iframe>`;
  // Keep the outer query equal to the app's own, so a reload returns to the same place.
  const mirror = `
var f=document.getElementById("app"),last="";
function sync(){try{
  var p=new URLSearchParams(f.contentWindow.location.search);${mobile ? 'p.delete("phone");' : ""}
  var s=p.toString(),want=s?"?"+s:"";
  if(want!==last&&f.contentWindow.location.pathname==="/"){last=want;history.replaceState(null,"",location.pathname+want);var o=document.getElementById("other");if(o)o.href="/d/"+want;}
}catch(e){}}
f.addEventListener("load",sync);setInterval(sync,400);`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${title}</title><style>${STYLE}${mobile ? MOBILE : DESKTOP}</style></head>
<body>${body}<script>${mobile ? MOBILE_JS : ""}${mirror}</script></body></html>`;
}

/** The kind for a request path (/m, /m/, /d, /d/), or null. */
export function linkKind(pathname: string): Kind | null {
  if (pathname === "/m" || pathname === "/m/") return "m";
  if (pathname === "/d" || pathname === "/d/") return "d";
  return null;
}
