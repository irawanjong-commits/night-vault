// Night Vault - level data: rooms, walls, patrols, loot. World 2560x1440.
export function mulberry(seed){ let a=seed>>>0; return function(){ a|=0; a=(a+0x6D2B79F5)|0; let t=Math.imul(a^(a>>>15),1|a); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; }; }
// Wall helper: axis-aligned rectangles {x,y,w,h}
export function buildLevel(seed){
 const rnd=mulberry(seed);
 const W=[]; const T=28; // wall thickness
 const add=(x,y,w,h)=>W.push({x,y,w,h});
 // Outer shell
 add(0,0,2560,T); add(0,1412,2560,T); add(0,0,T,1440); add(2532,0,T,1440);
 // Vertical dividers with door gaps
 // x=640 divider: gaps at y 300-400 and 950-1050
 add(640,0,T,300); add(640,400,T,550); add(640,1050,T,390);
 // x=1280 divider: gaps at 620-720 and 180-280
 add(1280,0,T,180); add(1280,280,T,340); add(1280,720,T,720);
 // x=1920 divider: gap at 950-1080 (vault approach) and 300-400
 add(1920,0,T,300); add(1920,400,T,550); add(1920,1080,T,360);
 // Horizontal dividers
 // y=720 in left block: gap x 280-400
 add(28,720,252,T); add(400,720,240,T);
 // y=720 mid block: gap x 1560-1680
 add(1308,720,252,T); add(1680,720,240,T);
 // Vault inner walls (room x 1960..2500, y 760..1380): entrance gap on left handled above; inner sanctum
 add(2180,760,T,240); add(2180,1120,T,292); // sanctum left wall, gap 1000-1120
 add(2180,760,320,T); // sanctum top
 // Display cases / cover blocks (low obstacles block movement & sight)
 const blocks=[
  {x:180,y:180,w:130,h:60},{x:380,y:520,w:150,h:60},{x:150,y:950,w:140,h:60},{x:420,y:1150,w:150,h:60},
  {x:820,y:220,w:150,h:60},{x:1000,y:480,w:60,h:150},{x:820,y:1000,w:150,h:60},{x:1050,y:1150,w:60,h:140},
  {x:1450,y:200,w:150,h:60},{x:1650,y:520,w:60,h:150},{x:1450,y:950,w:150,h:60},{x:1700,y:1150,w:140,h:60},
  {x:2050,y:220,w:150,h:60},{x:2280,y:480,w:140,h:60},{x:2050,y:1250,w:120,h:50},
 ];
 blocks.forEach(b=>W.push({...b,case:true}));
 const lootDefs=[
  ["Painting \u2018Moon over the Harbour\u2019",245,150,2500,"painting"],["Emerald Idol",455,490,1800,"gem"],
  ["Cash Stacks",220,920,1200,"cash"],["Golden Chalice",495,1120,2000,"artifact"],
  ["Sapphire Tiara",895,190,2200,"gem"],["Cash Stacks",895,970,1200,"cash"],
  ["Painting \u2018The Night Watchman\u2019",1105,420,2500,"painting"],["Ruby Brooch",1120,1120,1600,"gem"],
  ["Ancient Coin Hoard",1525,170,2400,"artifact"],["Cash Stacks",1525,920,1200,"cash"],
  ["Diamond Necklace",1765,1120,2600,"gem"],["Silver Tea Service",2125,190,1500,"artifact"],
  ["Opal Egg",2355,450,2100,"gem"],
 ];
 const loot=lootDefs.map((d,i)=>({id:i,name:d[0],x:d[1],y:d[2],value:d[3],kind:d[4],taken:false,bob:rnd()*6.28}));
 const guards=[
  {path:[[300,300],[560,300],[560,620],[300,620]],speed:62},
  {path:[[900,620],[1180,620],[1180,250],[900,250]],speed:58},
  {path:[[1500,620],[1800,620],[1800,300],[1500,300]],speed:66},
  {path:[[400,1250],[1100,1250],[1100,850],[400,850]],speed:55},
  {path:[[2050,650],[2400,650],[2400,880],[2050,880]],speed:70},
  {path:[[2280,1250],[2280,850],[2050,850]],speed:60},
 ];
 const cameras=[
  {x:640,y:60,base:0.9,range:0.85,speed:0.55},{x:1280,y:60,base:2.2,range:0.8,speed:-0.5},
  {x:1920,y:700,base:2.6,range:0.8,speed:0.6},{x:2210,y:790,base:1.57,range:0.7,speed:-0.45},
  {x:60,y:720,base:0,range:0.8,speed:0.5},
 ];
 const lasers=[
  {x1:668,y1:350,x2:1280,y2:350,id:"A"},{x1:668,y1:1000,x2:1280,y2:1000,id:"A"},
  {x1:1600,y1:748,x2:1600,y2:1412,id:"B"},{x1:1948,y1:1015,x2:2180,y2:1015,id:"B"},
 ];
 const panels=[
  {x:90,y:90,group:"CAM",label:"Camera Panel",done:false},{x:1330,y:1330,group:"A",label:"Laser Panel A",done:false},
  {x:1990,y:90,group:"B",label:"Laser Panel B",done:false},{x:90,y:1330,group:"CAM2",label:"Camera Panel 2",done:false},
 ];
 return {walls:W,blocks,loot,guards,cameras,lasers,panels,
  vault:{x:2340,y:1010,w:110,h:110,cracked:false,progress:0},
  exit:{x:70,y:620,w:110,h:110}, start:{x:120,y:665}};
}
// World geometry for the HUD minimap: overall size + room rectangles
// (x/y/w/h in world coordinates, matching the divider layout in buildLevel).
export const WORLD={w:2560,h:1440};
export const ROOM_RECTS=[
 {x:28,y:28,w:612,h:692},{x:28,y:748,w:612,h:664},
 {x:668,y:28,w:612,h:692},{x:668,y:748,w:612,h:664},
 {x:1308,y:28,w:612,h:692},{x:1308,y:748,w:612,h:664},
 {x:1948,y:28,w:584,h:692},{x:1948,y:748,w:584,h:664},
];
export const ROOM_LABELS=[
 {x:330,y:90,t:"WEST GALLERY"},{x:960,y:90,t:"SCULPTURE HALL"},{x:1600,y:90,t:"EAST GALLERY"},
 {x:330,y:780,t:"ARCHIVE WING"},{x:960,y:780,t:"COIN ROOM"},{x:1600,y:780,t:"JEWEL VAULT HALL"},
 {x:2240,y:90,t:"CURATOR\u2019S OFFICE"},{x:2240,y:820,t:"THE VAULT"},
];
