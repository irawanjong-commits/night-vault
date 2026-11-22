// Night Vault - main game logic: stealth, vision cones, alarm, vault crack, escape.
import { buildLevel, ROOM_LABELS, ROOM_RECTS, WORLD } from "./level.js";
import { Sfx } from "./audio.js";
const cv=document.getElementById("game"), ctx=cv.getContext("2d");
const VW=1280, VH=720;
const qs=new URLSearchParams(location.search);
const SEED=parseInt(qs.get("seed")||"7",10)||7;
const SHOT=qs.get("shot")||"";
const keys={}; let paused=false;
addEventListener("keydown",e=>{ keys[e.key.toLowerCase()]=true; if(["arrowup","arrowdown","arrowleft","arrowright"," "].includes(e.key.toLowerCase()))e.preventDefault();
 if((e.key==="p"||e.key==="P"||e.key==="Escape")&&state==="play"){ paused=!paused; draw(); }
 if(e.key==="Enter"&&state!=="play") startGame();
 if((e.key==="h"||e.key==="H")&&state==="title"){ state="howto"; draw(); }
 if(e.key==="Escape"&&state==="howto"){ state="title"; draw(); }
});
addEventListener("keyup",e=>{ keys[e.key.toLowerCase()]=false; });
cv.addEventListener("click",()=>{ if(state!=="play") startGame(); else if(paused) paused=false; });

let L, player, guards, cams, state="title", alarm=0, alarmLatched=false, lockdown=0;
let lootTaken=0, lootValue=0, elapsed=0, ghost=true, everSeen=false, camOffUntil=0, msg="", msgT=0, stepT=0, shake=0, endStats=null;
function reset(){
 L=buildLevel(SEED);
 player={x:L.start.x,y:L.start.y,r:15,face:-Math.PI/2,sneak:false,moving:false};
 guards=L.guards.map(g=>({x:g.path[0][0],y:g.path[0][1],path:g.path,wp:1,speed:g.speed,angle:0,alert:0}));
 cams=L.cameras.map(c=>({...c,angle:c.base,t:Math.random()*0}));
 // deterministic cam phase from seed instead of Math.random
 cams.forEach((c,i)=>{ c.t=i*1.7; });
 alarm=0; alarmLatched=false; lockdown=0; lootTaken=0; lootValue=0; elapsed=0; ghost=true; everSeen=false; camOffUntil=0; msg=""; msgT=0; paused=false; endStats=null;
}
function startGame(){ reset(); state="play"; Sfx.click(); }
function collide(x,y,r){
 for(const w of L.walls){ if(x+r>w.x&&x-r<w.x+w.w&&y+r>w.y&&y-r<w.y+w.h) return w; } return null;
}
function moveEntity(e,dx,dy){
 if(!collide(e.x+dx,e.y,e.r)) e.x+=dx; else if(!collide(e.x+dx*0.4,e.y,e.r)) e.x+=dx*0.4;
 if(!collide(e.x,e.y+dy,e.r)) e.y+=dy; else if(!collide(e.x,e.y+dy*0.4,e.r)) e.y+=dy*0.4;
 e.x=Math.max(20,Math.min(2540,e.x)); e.y=Math.max(20,Math.min(1420,e.y));
}
function losBlocked(x1,y1,x2,y2){
 // sample along segment against solid (non-case low blocks still block sight for simplicity except display cases are low: they do NOT block sight)
 const steps=Math.ceil(Math.hypot(x2-x1,y2-y1)/14);
 for(let i=1;i<steps;i++){ const t=i/steps, x=x1+(x2-x1)*t, y=y1+(y2-y1)*t;
  for(const w of L.walls){ if(w.case) continue; if(x>w.x&&x<w.x+w.w&&y>w.y&&y<w.y+w.h) return true; } }
 return false;
}
function angDiff(a,b){ let d=a-b; while(d>Math.PI)d-=2*Math.PI; while(d<-Math.PI)d+=2*Math.PI; return d; }
function seenByGuard(g){
 const dx=player.x-g.x, dy=player.y-g.y, d=Math.hypot(dx,dy);
 const range=player.sneak?190:250;
 if(d>range) return 0;
 if(Math.abs(angDiff(Math.atan2(dy,dx),g.angle))>0.62) return 0;
 if(losBlocked(g.x,g.y,player.x,player.y)) return 0;
 return d<70?2.2:(player.sneak?0.9:1.5);
}
function seenByCam(c,now){
 if(now<camOffUntil) return 0;
 const dx=player.x-c.x, dy=player.y-c.y, d=Math.hypot(dx,dy);
 if(d>230) return 0;
 if(Math.abs(angDiff(Math.atan2(dy,dx),c.angle))>0.5) return 0;
 if(losBlocked(c.x,c.y,player.x,player.y)) return 0;
 return player.sneak?0.8:1.3;
}
function laserHit(){
 for(const lz of L.lasers){ if(laserDisabled(lz)) continue;
  // distance point-to-segment
  const vx=lz.x2-lz.x1, vy=lz.y2-lz.y1, wx=player.x-lz.x1, wy=player.y-lz.y1;
  const t=Math.max(0,Math.min(1,(wx*vx+wy*vy)/(vx*vx+vy*vy||1)));
  const px=lz.x1+vx*t, py=lz.y1+vy*t;
  if(Math.hypot(player.x-px,player.y-py)<13) return lz; }
 return null;
}
function laserDisabled(lz){ return L.panels.some(p=>p.done&&p.group===lz.id); }
function nearPanel(){ return L.panels.find(p=>!p.done&&Math.hypot(player.x-(p.x+18),player.y-(p.y+18))<58); }
function nearVault(){ const v=L.vault; return !v.cracked&&Math.hypot(player.x-(v.x+v.w/2),player.y-(v.y+v.h/2))<105; }
let laserCooldown=0;
function update(dt){
 if(state!=="play"||paused) return;
 elapsed+=dt; laserCooldown=Math.max(0,laserCooldown-dt);
 // player move
 let dx=0,dy=0;
 if(keys["w"]||keys["arrowup"])dy-=1; if(keys["s"]||keys["arrowdown"])dy+=1;
 if(keys["a"]||keys["arrowleft"])dx-=1; if(keys["d"]||keys["arrowright"])dx+=1;
 player.sneak=!!(keys["shift"]);
 const mag=Math.hypot(dx,dy)||1; const sp=(player.sneak?88:168)*dt;
 player.moving=!!(dx||dy);
 if(player.moving){ player.face=Math.atan2(dy,dx); moveEntity(player,dx/mag*sp,dy/mag*sp);
   stepT-=dt; if(stepT<=0){ Sfx.step(player.sneak); stepT=player.sneak?0.42:0.3; } }
 // guards patrol
 const gSpeedMul=alarmLatched?1.55:1;
 for(const g of guards){ const tgt=g.path[g.wp]; const ddx=tgt[0]-g.x, ddy=tgt[1]-g.y, d=Math.hypot(ddx,ddy);
  if(d<8){ g.wp=(g.wp+1)%g.path.length; } else { const s=g.speed*gSpeedMul*dt; const a=Math.atan2(ddy,ddx);
   g.angle+=angDiff(a,g.angle)*Math.min(1,dt*6); moveEntity(g,Math.cos(a)*s,Math.sin(a)*s); }
  if(alarmLatched){ // drift toward player when close
   if(Math.hypot(player.x-g.x,player.y-g.y)<260&&!losBlocked(g.x,g.y,player.x,player.y)){ const a=Math.atan2(player.y-g.y,player.x-g.x); g.angle+=angDiff(a,g.angle)*Math.min(1,dt*4); } }
 }
 cams.forEach(c=>{ c.t+=dt; c.angle=c.base+Math.sin(c.t*c.speed*2)*c.range; });
 // detection
 let det=0; guards.forEach(g=>{ det=Math.max(det,seenByGuard(g)); });
 cams.forEach(c=>{ det=Math.max(det,seenByCam(c,elapsed)); });
 const lz=laserHit();
 if(lz&&laserCooldown<=0){ laserCooldown=1.2; alarm=Math.min(100,alarm+34); ghost=false; msg="LASER TRIPPED! Alarm rising!"; msgT=2.2; Sfx.laser(); shake=6; }
 if(det>0){ ghost=false; everSeen=true; alarm=Math.min(100,alarm+det*38*dt); if(Math.random()<dt*2)Sfx.spotted(); }
 else alarm=Math.max(0,alarm-9*dt);
 if(alarm>=100&&!alarmLatched){ alarmLatched=true; lockdown=30; msg="ALARM! LOCKDOWN IN 30s - RUN!"; msgT=3; Sfx.alarm(); shake=10; }
 if(alarmLatched){ lockdown-=dt; alarm=100; if(lockdown<=0){ finish(false,"Lockdown! The vault sealed and security swarmed you."); } }
 // loot pickup (walk over)
 for(const it of L.loot){ if(!it.taken&&Math.hypot(player.x-it.x,player.y-it.y)<30){ it.taken=true; lootTaken++; lootValue+=it.value; msg="Stole "+it.name+"  +$"+it.value.toLocaleString(); msgT=2.4; if(it.kind==="gem")Sfx.gem(); else Sfx.pickup(); } }
 // interact
 const panel=nearPanel(), atVault=nearVault();
 if(keys["e"]){
   if(panel){ panel.done=true; keys["e"]=false; Sfx.panel();
     if(panel.group==="CAM"||panel.group==="CAM2"){ camOffUntil=elapsed+20; msg="Cameras disabled for 20s!"; }
     else msg=panel.label+" off - lasers disabled!"; msgT=2.6; }
   else if(atVault){ const v=L.vault; v.progress+=dt/6; if(Math.floor(v.progress*24)!==Math.floor((v.progress-dt/6)*24))Sfx.crackTick();
     if(v.progress>=1){ v.cracked=true; lootValue+=25000; lootTaken++; msg="VAULT CRACKED! +$25,000 - GET TO THE VAN!"; msgT=3.5; Sfx.crackDone(); } }
 }
 if(!keys["e"]&&L.vault.progress>0&&!L.vault.cracked) L.vault.progress=Math.max(0,L.vault.progress-dt*0.5);
 msgT=Math.max(0,msgT-dt); shake=Math.max(0,shake-dt*22);
 // exit
 const ex=L.exit;
 if(player.x>ex.x&&player.x<ex.x+ex.w&&player.y>ex.y&&player.y<ex.y+ex.h){
   if(L.vault.cracked) finish(true);
   else if(lootValue>0) finish(true);
   else if(msgT<=0){ msg="Grab some loot first - the vault is the big prize!"; msgT=1.6; }
 }
}
function finish(won,reason){
 state=won?"win":"over";
 const timeBonus=Math.max(0,Math.round(6000-elapsed*8));
 const ghostBonus=(won&&ghost)?5000:0;
 const total=lootValue+(won?timeBonus+ghostBonus:0);
 endStats={won,reason:reason||"",total,timeBonus,ghostBonus,time:elapsed};
 if(won)Sfx.win(); else Sfx.lose();
}
function cam(){ return {x:Math.max(0,Math.min(2560-VW,player.x-VW/2)), y:Math.max(0,Math.min(1440-VH,player.y-VH/2))}; }
// ---------- drawing ----------
function cone(x,y,angle,half,range,color){
 ctx.beginPath(); ctx.moveTo(x,y);
 // clip cone by simple fan with LOS shortening
 const N=18;
 for(let i=0;i<=N;i++){ const a=angle-half+ (2*half)*(i/N); let r=range;
   for(let s=20;s<range;s+=20){ const px=x+Math.cos(a)*s, py=y+Math.sin(a)*s; let hit=false;
     for(const w of L.walls){ if(w.case)continue; if(px>w.x&&px<w.x+w.w&&py>w.y&&py<w.y+w.h){hit=true;break;} }
     if(hit){ r=s; break; } }
   ctx.lineTo(x+Math.cos(a)*r,y+Math.sin(a)*r); }
 ctx.closePath(); ctx.fillStyle=color; ctx.fill();
}
function drawWorld(){
 const c=cam(); ctx.save();
 const sx=(Math.random()-0.5)*shake, sy=(Math.random()-0.5)*shake;
 ctx.translate(-c.x+sx,-c.y+sy);
 // floor
 ctx.fillStyle="#232733"; ctx.fillRect(c.x-20,c.y-20,VW+40,VH+40);
 ctx.fillStyle="#262b38";
 for(let x=0;x<2560;x+=80)for(let y=0;y<1440;y+=80){ if(((x+y)/80)%2===0)ctx.fillRect(x,y,80,80); }
 // room tints
 ctx.fillStyle="rgba(212,175,55,0.05)"; ctx.fillRect(1948,748,584,664);
 ctx.fillStyle="rgba(90,140,255,0.04)"; ctx.fillRect(28,28,612,692);
 ctx.font="bold 22px monospace"; ctx.fillStyle="rgba(255,255,255,0.13)"; ctx.textAlign="center";
 ROOM_LABELS.forEach(r=>ctx.fillText(r.t,r.x,r.y));
 // exit / van
 const ex=L.exit; ctx.fillStyle="#17351f"; ctx.fillRect(ex.x,ex.y,ex.w,ex.h);
 ctx.fillStyle="#2e7d46"; roundRect(ex.x+14,ex.y+26,82,58,8); ctx.fill();
 ctx.fillStyle="#bfe3ff"; ctx.fillRect(ex.x+24,ex.y+36,26,18); ctx.fillRect(ex.x+56,ex.y+36,20,18);
 ctx.fillStyle="#111"; [[ex.x+28,ex.y+84],[ex.x+82,ex.y+84]].forEach(p=>{ctx.beginPath();ctx.arc(p[0],p[1],8,0,7);ctx.fill();});
 ctx.fillStyle="#e8f5e9"; ctx.font="bold 13px monospace"; ctx.fillText("GETAWAY VAN",ex.x+55,ex.y+16);
 // lasers
 for(const lz of L.lasers){ if(laserDisabled(lz))continue; ctx.strokeStyle="rgba(255,60,60,0.9)"; ctx.lineWidth=2.5; ctx.setLineDash([8,5]); ctx.beginPath(); ctx.moveTo(lz.x1,lz.y1); ctx.lineTo(lz.x2,lz.y2); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle="#ff5252"; [ [lz.x1,lz.y1],[lz.x2,lz.y2] ].forEach(p=>{ctx.beginPath();ctx.arc(p[0],p[1],5,0,7);ctx.fill();}); }
 // loot
 for(const it of L.loot){ if(it.taken)continue; const bobY=Math.sin(elapsed*2+it.bob)*3;
  ctx.fillStyle="rgba(255,215,64,0.18)"; ctx.beginPath(); ctx.arc(it.x,it.y+bobY,22,0,7); ctx.fill();
  if(it.kind==="painting"){ ctx.fillStyle="#8d6e63"; ctx.fillRect(it.x-16,it.y-13+bobY,32,26); ctx.fillStyle="#5d8aa8"; ctx.fillRect(it.x-12,it.y-9+bobY,24,18); ctx.fillStyle="#ffd54f"; ctx.beginPath(); ctx.arc(it.x+4,it.y-3+bobY,4,0,7); ctx.fill(); }
  else if(it.kind==="gem"){ ctx.fillStyle="#4dd0e1"; ctx.beginPath(); ctx.moveTo(it.x,it.y-14+bobY); ctx.lineTo(it.x+11,it.y+bobY); ctx.lineTo(it.x,it.y+14+bobY); ctx.lineTo(it.x-11,it.y+bobY); ctx.closePath(); ctx.fill(); ctx.fillStyle="rgba(255,255,255,.7)"; ctx.beginPath(); ctx.moveTo(it.x,it.y-14+bobY); ctx.lineTo(it.x+5,it.y+bobY); ctx.lineTo(it.x-5,it.y+bobY); ctx.closePath(); ctx.fill(); }
  else if(it.kind==="cash"){ ctx.fillStyle="#43a047"; ctx.fillRect(it.x-15,it.y-9+bobY,30,18); ctx.fillStyle="#a5d6a7"; ctx.fillRect(it.x-11,it.y-5+bobY,22,10); ctx.fillStyle="#1b5e20"; ctx.font="bold 11px monospace"; ctx.fillText("$",it.x,it.y+4+bobY); }
  else { ctx.fillStyle="#ffb300"; ctx.beginPath(); ctx.arc(it.x,it.y+bobY,11,0,7); ctx.fill(); ctx.fillStyle="#ff8f00"; ctx.beginPath(); ctx.arc(it.x,it.y+bobY,6,0,7); ctx.fill(); }
 }
 // panels
 for(const p of L.panels){ ctx.fillStyle=p.done?"#37474f":"#00897b"; ctx.fillRect(p.x,p.y,36,36); ctx.fillStyle="#fff"; ctx.font="bold 15px monospace"; ctx.fillText(p.done?"x":"!",p.x+18,p.y+24);
  ctx.font="10px monospace"; ctx.fillStyle="rgba(255,255,255,0.55)"; ctx.fillText(p.group,p.x+18,p.y+50); }
 // vault
 const v=L.vault; ctx.fillStyle=v.cracked?"#4e342e":"#546e7a"; roundRect(v.x,v.y,v.w,v.h,10); ctx.fill();
 ctx.strokeStyle=v.cracked?"#ffb300":"#cfd8dc"; ctx.lineWidth=4; ctx.beginPath(); ctx.arc(v.x+55,v.y+55,30,0,7); ctx.stroke();
 ctx.beginPath(); ctx.arc(v.x+55,v.y+55,7,0,7); ctx.fillStyle="#eceff1"; ctx.fill();
 ctx.fillStyle="#fff"; ctx.font="bold 14px monospace"; ctx.fillText(v.cracked?"OPEN":"VAULT $25k",v.x+55,v.y+132);
 if(v.progress>0&&!v.cracked){ ctx.fillStyle="#111"; ctx.fillRect(v.x-10,v.y-26,130,14); ctx.fillStyle="#ffd54f"; ctx.fillRect(v.x-8,v.y-24,126*v.progress,10); }
 // walls
 for(const w of L.walls){ if(w.case){ ctx.fillStyle="#3d4457"; ctx.fillRect(w.x,w.y,w.w,w.h); ctx.strokeStyle="#ffd54f"; ctx.lineWidth=1.5; ctx.strokeRect(w.x+4,w.y+4,w.w-8,w.h-8); ctx.fillStyle="#90caf9"; ctx.fillRect(w.x+w.w/2-9,w.y+w.h/2-9,18,18); }
  else { ctx.fillStyle="#4a5165"; ctx.fillRect(w.x,w.y,w.w,w.h); ctx.fillStyle="#5b6378"; ctx.fillRect(w.x,w.y,w.w,5); } }
 // camera cones + bodies
 const camActive=elapsed>=camOffUntil;
 cams.forEach(cm2=>{ if(camActive) cone(cm2.x,cm2.y,cm2.angle,0.5,230,"rgba(255,200,60,0.16)");
  ctx.fillStyle=camActive?"#ef5350":"#616161"; ctx.beginPath(); ctx.arc(cm2.x,cm2.y,10,0,7); ctx.fill();
  ctx.strokeStyle="#eee"; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(cm2.x,cm2.y); ctx.lineTo(cm2.x+Math.cos(cm2.angle)*16,cm2.y+Math.sin(cm2.angle)*16); ctx.stroke(); });
 // guard cones + bodies
 guards.forEach(g=>{ const det=seenByGuard(g); cone(g.x,g.y,g.angle,0.62,250,det>0?"rgba(255,60,60,0.30)":"rgba(255,235,120,0.15)");
  ctx.fillStyle="#283593"; ctx.beginPath(); ctx.arc(g.x,g.y,16,0,7); ctx.fill();
  ctx.fillStyle="#1a237e"; ctx.beginPath(); ctx.arc(g.x,g.y-4,9,0,7); ctx.fill();
  ctx.fillStyle="#ffd54f"; ctx.fillRect(g.x-10,g.y-14,20,4);
  ctx.fillStyle="#fff"; ctx.beginPath(); ctx.arc(g.x+Math.cos(g.angle)*6,g.y+Math.sin(g.angle)*6,3,0,7); ctx.fill();
  if(det>0){ ctx.fillStyle="#ff1744"; ctx.font="bold 24px monospace"; ctx.fillText("!",g.x,g.y-26); } });
 // player
 ctx.fillStyle="rgba(0,0,0,0.35)"; ctx.beginPath(); ctx.ellipse(player.x,player.y+13,13,5,0,0,7); ctx.fill();
 ctx.fillStyle=player.sneak?"#37474f":"#11151c"; ctx.beginPath(); ctx.arc(player.x,player.y,15,0,7); ctx.fill();
 ctx.strokeStyle="#ffd54f"; ctx.lineWidth=2.5; ctx.stroke();
 ctx.fillStyle="#ffd54f"; ctx.beginPath(); ctx.arc(player.x+Math.cos(player.face)*8,player.y+Math.sin(player.face)*8,4.5,0,7); ctx.fill();
 ctx.fillStyle="#ffd54f"; ctx.fillRect(player.x-9,player.y-20,18,6); // hood stripe / mask band
 ctx.restore();
 // interact prompt
 const panel=nearPanel();
 if(panel) prompt("Hold E - use "+panel.label);
 else if(nearVault()) prompt("HOLD E - crack the vault");
}
function roundRect(x,y,w,h,r){ ctx.beginPath(); ctx.roundRect(x,y,w,h,r); }
function prompt(t){ ctx.fillStyle="rgba(0,0,0,0.75)"; const w=ctx.measureText(t).width+36; roundRect(VW/2-260,VH-118,520,44,10); ctx.fill(); ctx.fillStyle="#ffd54f"; ctx.font="bold 19px monospace"; ctx.textAlign="center"; ctx.fillText(t,VW/2,VH-89); }
// ---------- minimap (live HUD overview of the whole museum) ----------
// Rendered in screen space in the bottom-right corner at a fixed scale:
// room outlines, un-looted loot (gold), guards (red), the vault, the getaway
// van, and the thief (bright pulsing dot). Reads only live game state, so it
// updates every frame and also shows in the deterministic ?shot= scenes.
const MM_W=256, MM_H=144, MM_SCALE=MM_W/WORLD.w; // 2560x1440 -> 256x144
function drawMinimap(){
 const mx=VW-MM_W-14, my=VH-MM_H-14;
 const px=x=>mx+x*MM_SCALE, py=y=>my+y*MM_SCALE;
 // panel backing + border (gold while the vault is still shut, green once cracked)
 ctx.fillStyle="rgba(5,7,12,0.86)"; roundRect(mx-6,my-22,MM_W+12,MM_H+28,8); ctx.fill();
 ctx.strokeStyle=L.vault.cracked?"#2e7d46":"#8a6d1f"; ctx.lineWidth=1.5; roundRect(mx-6,my-22,MM_W+12,MM_H+28,8); ctx.stroke();
 ctx.fillStyle="#ffd54f"; ctx.font="bold 11px monospace"; ctx.textAlign="left";
 ctx.fillText("MINIMAP",mx,my-8);
 ctx.fillStyle="#cfd8dc"; ctx.font="10px monospace"; ctx.textAlign="right";
 ctx.fillText(L.vault.cracked?"VAULT OPEN":"vault: east",mx+MM_W,my-8);
 // room outlines
 ctx.strokeStyle="rgba(160,180,210,0.55)"; ctx.lineWidth=1;
 for(const r of ROOM_RECTS) ctx.strokeRect(px(r.x),py(r.y),r.w*MM_SCALE,r.h*MM_SCALE);
 // solid walls as faint blocks so corridors/door gaps read at a glance
 ctx.fillStyle="rgba(120,135,165,0.35)";
 for(const w of L.walls){ if(w.case) continue; ctx.fillRect(px(w.x),py(w.y),Math.max(1,w.w*MM_SCALE),Math.max(1,w.h*MM_SCALE)); }
 // getaway van / exit (green block + label)
 const ex=L.exit; ctx.fillStyle="#2e7d46"; ctx.fillRect(px(ex.x),py(ex.y),ex.w*MM_SCALE,ex.h*MM_SCALE);
 ctx.strokeStyle="#7ee787"; ctx.lineWidth=1; ctx.strokeRect(px(ex.x),py(ex.y),ex.w*MM_SCALE,ex.h*MM_SCALE);
 // vault (gold square with a dark $ once cracked it flashes green/gold)
 const v=L.vault, blink=L.vault.cracked&&(Math.floor(elapsed*2)%2===0);
 ctx.fillStyle=blink?"#7ee787":"#ffd54f"; ctx.fillRect(px(v.x),py(v.y),v.w*MM_SCALE,v.h*MM_SCALE);
 ctx.fillStyle="#11151c"; ctx.font="bold 9px monospace"; ctx.textAlign="center";
 ctx.fillText("$",px(v.x+v.w/2),py(v.y+v.h/2)+3);
 // un-looted loot (gold dots; taken loot disappears)
 ctx.fillStyle="#ffca28";
 for(const it of L.loot){ if(it.taken) continue; ctx.beginPath(); ctx.arc(px(it.x),py(it.y),2.4,0,7); ctx.fill(); }
 // guards (red dots, brighter ring while that guard can see the thief)
 for(const g of guards){ const seen=seenByGuard(g)>0;
  ctx.fillStyle="#ff1744"; ctx.beginPath(); ctx.arc(px(g.x),py(g.y),3,0,7); ctx.fill();
  if(seen){ ctx.strokeStyle="#ff8a80"; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(px(g.x),py(g.y),5.5,0,7); ctx.stroke(); } }
 // cameras (small amber squares, grey while disabled from a panel)
 const camActive=elapsed>=camOffUntil;
 ctx.fillStyle=camActive?"#ffb300":"#616161";
 for(const c of cams) ctx.fillRect(px(c.x)-2,py(c.y)-2,4,4);
 // thief: bright white/gold pulsing dot on top of everything else
 const pulse=2.6+Math.sin(elapsed*5)*0.7;
 ctx.fillStyle="rgba(255,213,79,0.35)"; ctx.beginPath(); ctx.arc(px(player.x),py(player.y),pulse+3.4,0,7); ctx.fill();
 ctx.fillStyle="#ffffff"; ctx.beginPath(); ctx.arc(px(player.x),py(player.y),pulse,0,7); ctx.fill();
 ctx.strokeStyle="#ffd54f"; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(px(player.x),py(player.y),pulse,0,7); ctx.stroke();
 // camera viewport rectangle so the player can place the main view
 const c=cam(); ctx.strokeStyle="rgba(255,255,255,0.4)"; ctx.lineWidth=1;
 ctx.strokeRect(px(c.x),py(c.y),VW*MM_SCALE,VH*MM_SCALE);
}
function drawHUD(){
 // top bar
 ctx.fillStyle="rgba(8,10,16,0.82)"; ctx.fillRect(0,0,VW,64);
 ctx.fillStyle="#ffd54f"; ctx.font="bold 24px monospace"; ctx.textAlign="left"; ctx.fillText("$ "+lootValue.toLocaleString(),22,40);
 ctx.fillStyle="#cfd8dc"; ctx.font="15px monospace"; ctx.fillText("Loot "+lootTaken+"/14",230,40);
 // alarm meter
 ctx.fillStyle="#fff"; ctx.font="bold 14px monospace"; ctx.textAlign="center"; ctx.fillText(alarmLatched?("LOCKDOWN "+Math.ceil(lockdown)+"s"):"ALARM",VW/2,22);
 ctx.fillStyle="#263238"; roundRect(VW/2-170,28,340,20,8); ctx.fill();
 ctx.fillStyle=alarm>66?"#ff1744":alarm>33?"#ff9100":"#ffd54f"; if(alarm>0){ roundRect(VW/2-170,28,340*alarm/100,20,8); ctx.fill(); }
 ctx.strokeStyle="#90a4ae"; ctx.lineWidth=1.5; roundRect(VW/2-170,28,340,20,8); ctx.stroke();
 // detection eye
 let det=0; guards.forEach(g=>det=Math.max(det,seenByGuard(g))); cams.forEach(c=>det=Math.max(det,seenByCam(c,elapsed)));
 ctx.font="24px monospace"; ctx.textAlign="right"; ctx.fillStyle=det>0?"#ff1744":"rgba(255,255,255,0.35)"; ctx.fillText(det>0?"👁 SEEN!":"👁 hidden",VW-22,40);
 ctx.font="15px monospace"; ctx.fillStyle="#cfd8dc"; ctx.fillText(fmtTime(elapsed),VW-22,86);
 // objective
 ctx.textAlign="left"; ctx.fillStyle="rgba(8,10,16,0.7)"; roundRect(14,VH-52,640,38,8); ctx.fill();
 ctx.fillStyle="#eceff1"; ctx.font="15px monospace";
 const obj=L.vault.cracked?"Objective: ESCAPE to the getaway van (west)!":(lootValue>0?"Objective: crack the VAULT (east) or escape west":"Objective: steal loot - the VAULT (east) holds $25,000");
 ctx.fillText(obj,26,VH-27);
 if(elapsed<camOffUntil){ ctx.fillStyle="#80cbc4"; ctx.fillText("Cameras OFF "+Math.ceil(camOffUntil-elapsed)+"s",1000,VH-27); }
 if(msgT>0){ ctx.fillStyle="rgba(0,0,0,0.78)"; roundRect(VW/2-330,76,660,42,10); ctx.fill(); ctx.fillStyle="#ffd54f"; ctx.font="bold 18px monospace"; ctx.textAlign="center"; ctx.fillText(msg,VW/2,103); }
 drawMinimap();
 if(paused) overlay("PAUSED","Press P or click to resume");
}
function fmtTime(s){ const m=Math.floor(s/60), ss=Math.floor(s%60); return m+":"+String(ss).padStart(2,"0"); }
function overlay(title,sub){ ctx.fillStyle="rgba(4,6,12,0.78)"; ctx.fillRect(0,0,VW,VH); ctx.fillStyle="#ffd54f"; ctx.font="bold 56px monospace"; ctx.textAlign="center"; ctx.fillText(title,VW/2,VH/2-20); ctx.fillStyle="#eceff1"; ctx.font="20px monospace"; ctx.fillText(sub,VW/2,VH/2+28); }
function draw(){
 ctx.fillStyle="#0b0e14"; ctx.fillRect(0,0,VW,VH);
 if(state==="title"){ drawWorld(); ctx.fillStyle="rgba(4,6,12,0.72)"; ctx.fillRect(0,0,VW,VH);
  ctx.textAlign="center"; ctx.fillStyle="#ffd54f"; ctx.font="bold 84px monospace"; ctx.fillText("NIGHT VAULT",VW/2,250);
  ctx.fillStyle="#eceff1"; ctx.font="22px monospace"; ctx.fillText("One thief. One museum. Every gem in the dark.",VW/2,300);
  ctx.font="20px monospace"; ctx.fillText("Sneak past guards & cameras, crack the vault, reach the van.",VW/2,345);
  ctx.fillStyle="#ffd54f"; ctx.font="bold 24px monospace"; ctx.fillText("Press ENTER or click to start      H = How to play",VW/2,430);
  ctx.fillStyle="#90a4ae"; ctx.font="16px monospace"; ctx.fillText("WASD / Arrows move - SHIFT sneak - E interact - P pause",VW/2,480); return; }
 if(state==="howto"){ ctx.fillStyle="#10141f"; ctx.fillRect(0,0,VW,VH); ctx.textAlign="center"; ctx.fillStyle="#ffd54f"; ctx.font="bold 44px monospace"; ctx.fillText("HOW TO PLAY",VW/2,110);
  ctx.fillStyle="#eceff1"; ctx.font="19px monospace"; const lines=["Move: WASD or Arrow keys. Hold SHIFT to sneak (slower, harder to spot).","Yellow cones are guard & camera vision. Red means you are being seen - the ALARM fills.","Lasers trip the alarm. Use control panels (!) to disable cameras (20s) or laser groups.","Walk over loot to steal it. Hold E at the VAULT to crack it for $25,000.","Full alarm = LOCKDOWN: escape within 30 seconds or the run ends.","Reach the green getaway van on the west side to finish.","Score = loot + time bonus + $5,000 GHOST bonus if never detected.","Press ENTER to start - ESC to go back"]; lines.forEach((l,i)=>ctx.fillText(l,VW/2,180+i*52)); return; }
 drawWorld(); drawHUD();
 if(state==="win"){ const s=endStats; overlay("CLEAN GETAWAY!",""); ctx.fillStyle="#eceff1"; ctx.font="21px monospace"; ctx.textAlign="center";
  ctx.fillText("Loot stolen:  $"+lootValue.toLocaleString()+"   ("+lootTaken+" items)",VW/2,VH/2+40);
  ctx.fillText("Time bonus:  $"+s.timeBonus.toLocaleString()+"    Time: "+fmtTime(s.time),VW/2,VH/2+74);
  ctx.fillText(s.ghostBonus?("GHOST bonus:  $"+s.ghostBonus.toLocaleString()+" - never detected!"):"Detected during the job - no ghost bonus",VW/2,VH/2+108);
  ctx.fillStyle="#ffd54f"; ctx.font="bold 30px monospace"; ctx.fillText("TOTAL SCORE:  $"+s.total.toLocaleString(),VW/2,VH/2+158);
  ctx.fillStyle="#90a4ae"; ctx.font="17px monospace"; ctx.fillText(L.vault.cracked?"The vault was cracked - a perfect heist.":"You escaped, but the vault stayed shut.",VW/2,VH/2+196);
  ctx.fillText("Press ENTER to play again",VW/2,VH/2+232); }
 if(state==="over"){ overlay("BUSTED!",""); ctx.fillStyle="#eceff1"; ctx.font="20px monospace"; ctx.textAlign="center"; ctx.fillText(endStats.reason,VW/2,VH/2+42); ctx.fillText("You had stolen $"+lootValue.toLocaleString()+" before it went wrong.",VW/2,VH/2+80); ctx.fillStyle="#90a4ae"; ctx.font="17px monospace"; ctx.fillText("Press ENTER to try again",VW/2,VH/2+124); }
}
// ---------- screenshot scenes ----------
function setupShot(){
 reset();
 if(SHOT==="cover"){
   // Thief crossing West Gallery, guard cone + camera + loot + alarm all in frame (camera centred on player start area)
   player.x=430; player.y=350; player.face=0.4;
   guards[0].x=560; guards[0].y=470; guards[0].angle=-2.2;
   cams[0].x=600; cams[0].y=170; cams[0].angle=2.3;
   alarm=42; elapsed=48; lootValue=3700; lootTaken=2; L.loot[2].taken=false;
   msg=""; state="play";
 } else if(SHOT==="play"){
   player.x=2080; player.y=1015; player.face=0.2; L.vault.progress=0.55;
   guards[4].x=2240; guards[4].y=880; guards[4].angle=2.4; guards[5].x=2140; guards[5].y=1180; guards[5].angle=-0.6;
   alarm=58; elapsed=132; lootValue=12400; lootTaken=6; state="play";
 } else if(SHOT==="end"){
   player.x=200; player.y=665; guards.forEach(g=>{ g.x=2400; g.y=200; g.angle=0; }); cams.forEach(c=>{ c.angle=0; }); L.vault.cracked=true; lootValue=37400; lootTaken=11; elapsed=214; ghost=false;
   finish(true); state="win";
 } else { state="play"; }
 draw();
}
let last=performance.now();
function loop(now){ const dt=Math.min(0.05,(now-last)/1000); last=now; if(!SHOT){ update(dt); draw(); } requestAnimationFrame(loop); }
reset();
if(SHOT){ const h=document.querySelector("header"), f=document.querySelector("footer"); if(h)h.style.display="none"; if(f)f.style.display="none"; cv.style.width="1280px"; cv.style.height="720px"; cv.style.border="none"; document.body.style.justifyContent="flex-start"; setupShot(); }
else { state="title"; draw(); }
requestAnimationFrame(loop);
document.title="Night Vault";
