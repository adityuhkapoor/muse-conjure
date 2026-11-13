// Two fixed-layout links served by the gateway: /m/ is always the mobile interface and /d/ always
// the desktop one. Each is a tiny page that embeds the app (at "/") in an iframe; inside an iframe the
// app's own media queries see the iframe's width, so nothing in the app changes.

type Kind = "m" | "d";

const STYLE = `
:root{color-scheme:light}
*{box-sizing:border-box}
html,body{margin:0;height:100%;overflow:hidden;background:#E9EBEE;color:#65686C;font:13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif}
html::-webkit-scrollbar,body::-webkit-scrollbar{display:none}
iframe{border:0;display:block;background:#fff}
a{color:#0064D1}
`;

// An iPhone frame around the embedded app: a black bezel (padding 14, radius 69, matching
// mockup/components/Phone.tsx) holding a 393x852 screen (radius 55) with the iframe filling it,
// a dynamic-island pill and home indicator painted over it (z-index above the iframe; painting
// over an iframe needs no access into it), and side buttons on the bezel. On a real phone
// (<500px wide) all of this collapses away to the plain full-bleed app: real hardware already
// has its own screen edges and notch.
//
// #bezel has overflow:hidden (on top of its own border-radius) so nothing can show past its outer
// rounded silhouette. The side buttons intentionally stick out past that silhouette by a few px,
// so they are #stage's children, not #bezel's, scaled by #stage's own transform instead of being
// clipped by #bezel.
//
// #mask is the real fix for the screen's own corners: clipping the iframe from the OUTSIDE
// (overflow:hidden on an ancestor in this document) does not reliably contain every compositor
// layer inside it in Chrome - video, an image carousel, can still paint past the rounded corner.
// Instead of clipping the iframe, #mask paints OVER it: a borderless box the same size as the
// screen, with the screen's own radius, whose box-shadow spreads 9999px in the bezel's color. A
// non-inset box-shadow only ever paints outside its element's own rounded edge, so everything
// between that edge and the screen's square corner gets covered in bezel color - hiding whatever
// is underneath regardless of what the iframe does, with no dependency on cross-frame clipping.
//
// #chrome holds that mask plus the island/home pieces, as a SEPARATE layer from #bezel (not
// nested inside it alongside the iframe): #frame's #bezel (scaled, containing the iframe) and
// #bezel's own, independent transform:translateZ(0)+z-index promote it to its own composited
// layer, painted after #bezel's regardless of how Chrome squashes the scaled iframe's layer -
// the failure mode this replaces was the iframe's GPU layer occasionally winning over a mask
// that was merely a sibling z-indexed node inside the same stacking context. #chrome's own
// overflow:hidden (radius 69, matching the bezel's outer silhouette) clips #mask's 9999px
// spread; that clip is safe here because nothing inside #chrome is an iframe.
const MOBILE = `
body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;overflow:hidden}
#stage{position:relative;flex:none}
#frame{position:absolute;inset:0;width:421px;height:880px;transform-origin:0 0}
#bezel{position:absolute;inset:0;padding:14px;border-radius:69px;background:#1C1C1E;box-shadow:0 0 0 2px #3A3A3C,0 20px 60px rgba(0,0,0,.35);overflow:hidden}
#screen{position:relative;width:393px;height:852px;border-radius:55px;overflow:hidden;background:#fff}
#app{position:absolute;inset:0;width:100%;height:100%}
#chrome{position:absolute;inset:0;border-radius:69px;overflow:hidden;pointer-events:none;z-index:1000;transform:translateZ(0)}
#mask{position:absolute;left:14px;top:14px;width:393px;height:852px;border-radius:55px;box-shadow:0 0 0 9999px #1C1C1E}
#island{position:absolute;left:50%;top:25px;width:125px;height:37px;margin-left:-62.5px;border-radius:19px;background:#000}
#home{position:absolute;left:50%;bottom:22px;width:139px;height:5px;margin-left:-69.5px;border-radius:3px;background:#000}
#side1,#side2,#side3,#side4{position:absolute;background:#2C2C2E;pointer-events:none}
#side1{left:-3px;top:180px;width:3px;height:32px;border-radius:2px 0 0 2px}
#side2{left:-3px;top:240px;width:3px;height:62px;border-radius:2px 0 0 2px}
#side3{left:-3px;top:312px;width:3px;height:62px;border-radius:2px 0 0 2px}
#side4{right:-3px;top:260px;width:3px;height:96px;border-radius:0 2px 2px 0}
#cap{flex:none;height:22px;display:flex;gap:10px;white-space:nowrap}
@media (max-width:499px){
  body{display:block;background:#fff}
  #stage{position:fixed;inset:0;width:auto!important;height:auto!important}
  #frame{width:100%!important;height:100%!important;transform:none!important}
  #bezel{padding:0;border-radius:0;background:none;box-shadow:none;overflow:visible}
  #screen{width:100%!important;height:100%!important;border-radius:0}
  #chrome,#side1,#side2,#side3,#side4{display:none}
  #cap{display:none}
}`;

const DESKTOP = `
body{overflow:auto}
#app{width:100%;height:100vh;height:100dvh}
@media (max-width:1099px){#app{width:1440px}}
`;

const MOBILE_JS = `
var stage=document.getElementById("stage"),frame=document.getElementById("frame");
function fit(){
  if(innerWidth<500)return;
  var s=Math.min(1,(innerHeight-60)/880,(innerWidth-24)/421);
  stage.style.width=421*s+"px";stage.style.height=880*s+"px";
  frame.style.transform="scale("+s+")";
}
fit();addEventListener("resize",fit);`;

export function linkPage(kind: Kind, search: string): string {
  const q = new URLSearchParams(search);
  const mobile = kind === "m";
  // safe=1: simulate the iPhone's safe-area insets (ui.svelte.ts), so the app reserves the same
  // top/bottom clearance a real notch/dynamic island would get, which is where the frame below
  // paints its own dynamic-island pill and home indicator instead of over real content.
  if (mobile) {
    q.set("phone", "1");
    q.set("safe", "1");
  }
  const inner = "/" + (q.toString() ? "?" + q.toString() : "");
  const title = `Muse prototype · ${mobile ? "mobile" : "desktop"}`;
  const body = mobile
    ? `<div id="stage"><div id="frame">
<div id="bezel"><div id="screen"><iframe id="app" title="Muse prototype" src="${inner.replace(/&/g, "&amp;")}" allow="clipboard-write; fullscreen"></iframe></div></div>
<div id="chrome"><div id="mask"></div><div id="island"></div><div id="home"></div></div>
<div id="side1"></div><div id="side2"></div><div id="side3"></div><div id="side4"></div>
</div></div>
<div id="cap"><span>Prototype · mobile</span><a href="/d/" id="other">Open desktop</a></div>`
    : `<iframe id="app" title="Muse prototype" src="${inner.replace(/&/g, "&amp;")}" allow="clipboard-write; fullscreen"></iframe>`;
  // Keep the outer query equal to the app's own, so a reload returns to the same place.
  const mirror = `
var f=document.getElementById("app"),last="";
function sync(){try{
  var p=new URLSearchParams(f.contentWindow.location.search);${mobile ? 'p.delete("phone");p.delete("safe");' : ""}
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

export function isMultiPath(pathname: string): boolean {
  return pathname === "/multi" || pathname === "/multi/";
}

// /multi: several phones side by side, one person each, for watching a demo from every side at
// once (ported from keep-list's mockup/app/multi/page.tsx; adapted to this app's own ?as= and
// ?chat= query params instead of a hardcoded chat).
//   /multi                           -> calvin, aditya, maya
//   /multi?p=arun,will,tsai,calvin    -> any 1-4 people, each on their own inbox
//   /multi?p=arun,calvin&chat=senior  -> both open the same chat instead of their inbox
//   /multi?...&rec=1                 -> recording mode: clean name pills on a soft backdrop, no controls
const PEOPLE = ["maya", "noa", "priya", "aditya", "calvin", "arun", "tsai", "will", "jonah", "theo"];
const label = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);

// The same iPhone bezel as the single /m/ view (#frame/#bezel/#screen/#chrome in linkPage above),
// as reusable classes instead of ids since /multi holds several at once. Each .stage scales its
// .frame with a plain transform:scale() sized to its own column, instead of /m/'s resize-the-box
// trick - simpler here since there is no outer page scroll to fight.
const BEZEL_CSS = `
.stage{position:relative;flex:1;min-width:0;min-height:0;display:flex;align-items:center;justify-content:center;overflow:hidden}
.frame{position:relative;width:421px;height:880px;flex:none;transform-origin:center center}
.bezel{position:absolute;inset:0;padding:14px;border-radius:69px;background:#1C1C1E;box-shadow:0 0 0 2px #3A3A3C,0 20px 60px rgba(0,0,0,.35);overflow:hidden}
.screen{position:relative;width:393px;height:852px;border-radius:55px;overflow:hidden;background:#fff}
.screen iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff}
.chrome{position:absolute;inset:0;border-radius:69px;overflow:hidden;pointer-events:none;z-index:1000;transform:translateZ(0)}
.mask{position:absolute;left:14px;top:14px;width:393px;height:852px;border-radius:55px;box-shadow:0 0 0 9999px #1C1C1E}
.island{position:absolute;left:50%;top:25px;width:125px;height:37px;margin-left:-62.5px;border-radius:19px;background:#000}
.home{position:absolute;left:50%;bottom:22px;width:139px;height:5px;margin-left:-69.5px;border-radius:3px;background:#000}
.side1,.side2,.side3,.side4{position:absolute;background:#2C2C2E;pointer-events:none}
.side1{left:-3px;top:180px;width:3px;height:32px;border-radius:2px 0 0 2px}
.side2{left:-3px;top:240px;width:3px;height:62px;border-radius:2px 0 0 2px}
.side3{left:-3px;top:312px;width:3px;height:62px;border-radius:2px 0 0 2px}
.side4{right:-3px;top:260px;width:3px;height:96px;border-radius:0 2px 2px 0}`;
const BEZEL_JS = `
function fitMulti(){
  document.querySelectorAll("[data-stage]").forEach(function(stage){
    var frame=stage.querySelector(".frame");
    var s=Math.min(1,(stage.clientWidth-8)/421,(stage.clientHeight-8)/880);
    frame.style.transform="scale("+s+")";
  });
}
fitMulti();addEventListener("resize",fitMulti);`;
const bezelFrame = (iframe: string) => `<div class="frame">
<div class="bezel"><div class="screen">${iframe}</div></div>
<div class="chrome"><div class="mask"></div><div class="island"></div><div class="home"></div></div>
<div class="side1"></div><div class="side2"></div><div class="side3"></div><div class="side4"></div>
</div>`;

export function multiPage(search: string): string {
  const q = new URLSearchParams(search);
  const rec = q.get("rec") === "1";
  const chat = q.get("chat");
  const people = (q.get("p") ?? "calvin,aditya,maya")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 4);
  // phone=1&safe=1: the same safe-area simulation /m/ uses, so the app clears the island/home
  // indicator this bezel paints, instead of running its content underneath them.
  const src = (id: string) => `/?as=${encodeURIComponent(id)}&phone=1&safe=1${chat ? `&chat=${encodeURIComponent(chat)}` : ""}${rec ? "&rec=1" : ""}`;

  if (rec) {
    const cols = people
      .map(
        (id) => `<div class="col">
<div class="pill">${label(id)}</div>
<div class="stage" data-stage>${bezelFrame(`<iframe src="${src(id)}" title="${label(id)}"></iframe>`)}</div>
</div>`,
      )
      .join("");
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Muse prototype · multi (recording)</title>
<style>
*{box-sizing:border-box}
html,body{margin:0;height:100%;font:13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif}
body{display:flex;align-items:stretch;justify-content:center;gap:8px;overflow:hidden;padding:22px 40px 10px;background:radial-gradient(120% 90% at 50% 0%,#F4F7FF 0%,#E3EAFB 55%,#D9E1F5 100%)}
.col{display:flex;flex-direction:column;align-items:center;flex:1;min-width:0;min-height:0;max-width:560px}
.pill{margin-bottom:2px;padding:6px 16px;border-radius:999px;background:rgba(255,255,255,.85);box-shadow:0 2px 10px rgba(8,102,255,.1);font-size:19px;font-weight:700;color:#050505}
${BEZEL_CSS}
</style></head>
<body>${cols}<script>${BEZEL_JS}</script></body></html>`;
  }

  const unused = PEOPLE.find((id) => !people.includes(id)) ?? "noa";
  const options = (current: string) => PEOPLE.map((id) => `<option value="${id}"${id === current ? " selected" : ""}>${label(id)}</option>`).join("");
  const cols = people
    .map(
      (id, i) => `<div class="col">
<div class="row">
<select aria-label="Whose phone" data-i="${i}">${options(id)}</select>
${people.length > 1 ? `<button data-rm="${i}" title="Remove this phone" aria-label="Remove this phone">&times;</button>` : ""}
</div>
<div class="stage" data-stage>${bezelFrame(`<iframe data-frame="${i}" src="${src(id)}" title="${label(id)}"></iframe>`)}</div>
</div>`,
    )
    .join("");
  const script = `
var PEOPLE=${JSON.stringify(PEOPLE)},chat=${JSON.stringify(chat)};
function ids(){return [].map.call(document.querySelectorAll("select[data-i]"),function(s){return s.value})}
function save(next){
  var q=new URLSearchParams(location.search);q.set("p",next.join(","));
  location.search="?"+q.toString();
}
document.querySelectorAll("select[data-i]").forEach(function(s){
  s.addEventListener("change",function(){var l=ids();l[+s.dataset.i]=s.value;save(l);});
});
document.querySelectorAll("button[data-rm]").forEach(function(b){
  b.addEventListener("click",function(){var l=ids();l.splice(+b.dataset.rm,1);save(l);});
});
var add=document.getElementById("add");
if(add)add.addEventListener("click",function(){
  var l=ids(),unused=PEOPLE.find(function(id){return l.indexOf(id)<0})||"noa";save(l.concat(unused));
});
${BEZEL_JS}`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Muse prototype · multi</title>
<style>
*{box-sizing:border-box}
html,body{margin:0;height:100%;font:13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;background:#E9EBEE}
body{display:flex;gap:12px;overflow:hidden;padding:12px}
.col{display:flex;flex-direction:column;min-width:0;min-height:0;flex:1}
.row{display:flex;align-items:center;justify-content:center;gap:6px;padding-bottom:8px}
select{max-width:100%;cursor:pointer;appearance:none;border-radius:8px;background:transparent;padding:2px 8px;text-align:center;font-size:20px;font-weight:700;color:#050505;border:0}
select:hover{background:#DADDE1}
button[data-rm]{border:0;background:transparent;border-radius:999px;padding:0 6px;font-size:16px;color:#65676B;cursor:pointer}
button[data-rm]:hover{background:#DADDE1}
${BEZEL_CSS}
#add{align-self:center;border:0;border-radius:999px;background:#fff;padding:10px 14px;font-size:20px;font-weight:700;color:#0866FF;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.2)}
</style></head>
<body>${cols}${people.length < 4 ? `<button id="add" title="Add a phone" aria-label="Add a phone">+</button>` : ""}
<script>${script}</script></body></html>`;
}
