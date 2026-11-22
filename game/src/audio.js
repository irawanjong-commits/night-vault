// Night Vault - tiny synthesized sound kit (WebAudio, no files).
let ctx=null, master=null;
function ac(){ if(!ctx){ try{ ctx=new (window.AudioContext||window.webkitAudioContext)(); master=ctx.createGain(); master.gain.value=0.35; master.connect(ctx.destination);}catch(e){} } if(ctx&&ctx.state==="suspended")ctx.resume(); return ctx; }
function tone(f0,f1,dur,type="sine",vol=0.5,when=0){ const c=ac(); if(!c)return; const t=c.currentTime+when; const o=c.createOscillator(), g=c.createGain(); o.type=type; o.frequency.setValueAtTime(f0,t); o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+dur); g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(0.001,t+dur); o.connect(g); g.connect(master); o.start(t); o.stop(t+dur+0.02); }
function noise(dur=0.08,vol=0.2,when=0){ const c=ac(); if(!c)return; const n=Math.floor(c.sampleRate*dur); const b=c.createBuffer(1,n,c.sampleRate); const d=b.getChannelData(0); for(let i=0;i<n;i++)d[i]=(Math.random()*2-1)*(1-i/n); const s=c.createBufferSource(); s.buffer=b; const g=c.createGain(); g.gain.value=vol; const f=c.createBiquadFilter(); f.type="highpass"; f.frequency.value=900; s.connect(f); f.connect(g); g.connect(master); s.start(c.currentTime+when); }
export const Sfx={
 unlock(){ ac(); },
 pickup(){ tone(880,1320,0.12,"triangle",0.5); tone(1320,1760,0.1,"triangle",0.3,0.07); },
 gem(){ tone(1200,2400,0.18,"sine",0.5); tone(1800,2600,0.14,"sine",0.3,0.06); },
 step(sneak){ noise(0.04, sneak?0.03:0.07); },
 spotted(){ tone(220,110,0.25,"sawtooth",0.4); },
 alarm(){ tone(660,660,0.16,"square",0.35); tone(520,520,0.16,"square",0.35,0.18); },
 crackTick(){ tone(1400,900,0.05,"square",0.25); noise(0.03,0.12); },
 crackDone(){ [523,659,784,1046].forEach((f,i)=>tone(f,f,0.16,"triangle",0.45,i*0.09)); },
 panel(){ tone(300,600,0.12,"square",0.3); tone(600,900,0.1,"square",0.25,0.1); },
 laser(){ tone(1800,400,0.2,"sawtooth",0.35); },
 win(){ [392,523,659,784,1046,1318].forEach((f,i)=>tone(f,f,0.22,"triangle",0.45,i*0.11)); },
 lose(){ [440,349,293,220].forEach((f,i)=>tone(f,f*0.98,0.28,"sawtooth",0.3,i*0.16)); },
 click(){ tone(700,500,0.06,"square",0.25); },
};
