/* Ultimate Sanctuary, version 1. Made for Ahsan Ali. One page, sound packs loaded per world, offline per world.
   Every sound layer is a "doctor". The room holds a set number of doctors; extra invited doctors wait and can take turns. */
'use strict';
const VERSION=1, SKEY='ultimate-sanctuary-v1', SESS='ultimate-sanctuary-session-v1';
const $=id=>document.getElementById(id);
/* clamp(v,a,b) comes from conductor.js */
const rnd=(a,b)=>a+Math.random()*(b-a);
const pct=v=>Math.round(v)+' percent';
const g2=(v,max)=>Math.pow(Math.max(0,v)/100,2)*max;
function hold(p,t){ if(p.cancelAndHoldAtTime){ try{p.cancelAndHoldAtTime(t);return;}catch(e){} } const v=p.value; p.cancelScheduledValues(t); p.setValueAtTime(v,t); }
function setG(p,v,ctx,tc){ const t=ctx.currentTime; hold(p,t); p.setTargetAtTime(v,t,tc==null?0.15:tc); }
function rampTo(p,v,ctx,sec){ const t=ctx.currentTime; hold(p,t); p.linearRampToValueAtTime(v,t+Math.max(0.02,sec)); }
function makeIR(ctx,secs){ const sr=ctx.sampleRate,n=Math.floor(sr*secs),b=ctx.createBuffer(2,n,sr);
 for(let c=0;c<2;c++){ const d=b.getChannelData(c); let lp=0; for(let i=0;i<n;i++){ const t=i/sr; lp+=0.25*((Math.random()*2-1)-lp); d[i]=lp*Math.pow(1-i/n,2)*Math.exp(-t/1.1)*0.5; } } return b; }
let lastMsg=''; function say(m){ if(m===lastMsg) m=m+'\u00a0'; lastMsg=m; const s=$('status'); if(s) s.textContent=m; }
function minsWords(m){ m=Math.round(m); if(m<60) return m+' minute'+(m===1?'':'s'); const h=Math.floor(m/60), r=m%60; return h+' hour'+(h===1?'':'s')+(r?' '+r+' minute'+(r===1?'':'s'):''); }
function secsWords(s){ return s<90?Math.round(s)+' seconds':minsWords(s/60); }
function mb(b){ return (Math.round(b/1e5)/10)+' MB'; }
const EQUAL_IN=new Float32Array(32), EQUAL_OUT=new Float32Array(32); for(let i=0;i<32;i++){ EQUAL_IN[i]=Math.sin(Math.PI/2*i/31); EQUAL_OUT[i]=Math.cos(Math.PI/2*i/31); }

/* ---------- settings ---------- */
let MAN=null, LAY={}, WORLD={};
const SOLF=[[100,'100 hertz, low and soft'],[136.1,'136.1 hertz, the Om or Earth-year tone'],[174,'174 hertz solfeggio'],[285,'285 hertz solfeggio'],[396,'396 hertz solfeggio'],[417,'417 hertz solfeggio'],[432,'432 hertz'],[528,'528 hertz solfeggio'],[639,'639 hertz solfeggio'],[741,'741 hertz solfeggio'],[852,'852 hertz solfeggio'],[963,'963 hertz solfeggio']];
const BW_DEF={on:false,vol:25,carrier:136.1,beatStart:6,beatEnd:3,journey:40,drift:true,driftHz:0.3,driftMin:8,iso:false,isoVol:30,solf:0,solfVol:20};
const HYP_DEF={xfeed:{on:true,depth:25,period:90},filt:{on:true,depth:25,period:120,style:'lowpass'},breath:{on:false,depth:15,bpm:6}};
function defaults(){ const s={v:1,master:70,out:'stereo',audioMode:'background',doctors:{cap:6,full:'swap',turns:true,turnMin:15,limiter:true,limit:60},
  layers:{},ens:normEns({}),ensPreset:'',bw:JSON.parse(JSON.stringify(BW_DEF)),hyp:JSON.parse(JSON.stringify(HYP_DEF)),timer:{min:0,fade:10},open:{},presets:[]};
 if(MAN) for(const l of MAN.layers) s.layers[l.key]=layerDefault(l); return s; }
function layerDefault(l){ const o={on:!!l.on&&l.world==='clockfire',vol:l.vol==null?40:l.vol}; if(l.type==='event') o.interval=l.interval||600; return o; }
function merge(base,o){ if(!o||typeof o!=='object') return base; for(const k in base){ if(!(k in o)) continue; const b=base[k], v=o[k];
  if(b&&typeof b==='object'&&!Array.isArray(b)) base[k]=merge(b,v); else if(typeof v===typeof b||b==null) base[k]=v; } return base; }
function normS(o){ const s=defaults(); merge(s,o||{}); if(o&&o.layers) for(const k in s.layers) if(o.layers[k]) merge(s.layers[k],o.layers[k]); s.ens=normEns(o&&o.ens||{}); if(o&&Array.isArray(o.presets)) s.presets=o.presets.slice(0,30); s.doctors.cap=clamp(+s.doctors.cap||6,1,12); return s; }
let S={ens:normEns({}),device:'',out:'stereo'};
function load(){ try{ return normS(JSON.parse(localStorage.getItem(SKEY))); }catch(e){ return normS(null); } }
function save(){ try{ localStorage.setItem(SKEY,JSON.stringify(S)); }catch(e){} }

/* ---------- downloads, decoding ---------- */
const RAW={}, RAWP={}, loadErrors=[];
function fileUrl(w,f){ return WORLD[w].base+f; }
async function fetchRaw(url){ if(RAW[url]) return RAW[url]; if(RAWP[url]) return RAWP[url];
 return RAWP[url]=(async()=>{ let err; for(let a=0;a<3;a++){ try{ const r=await fetch(url,{mode:'cors'}); if(!r.ok) throw new Error('HTTP '+r.status); const b=await r.arrayBuffer(); RAW[url]=b; delete RAWP[url]; return b; }catch(e){ err=e; await new Promise(r=>setTimeout(r,1200*(a+1))); } } delete RAWP[url]; loadErrors.push(url); throw err; })(); }
function decode(ctx,ab){ return new Promise(res=>{ let done=false; const fin=b=>{ if(done) return; done=true; res(b||null); };
 try{ const p=ctx.decodeAudioData(ab.slice(0),b=>fin(b),()=>fin(null)); if(p&&p.then) p.then(fin,()=>fin(null)); }catch(e){ fin(null); } }); }
function normGain(f,target){ return clamp(Math.pow(10,((target||-23)-f.lufs)/20),0.05,6); }

/* ---------- noise for the synthesised doctors ---------- */
const NOISE={};
function noiseBuf(ctx,kind){ if(NOISE[kind]) return NOISE[kind]; const sr=ctx.sampleRate, n=sr*12, b=ctx.createBuffer(2,n,sr);
 for(let c=0;c<2;c++){ const d=b.getChannelData(c); let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0,br=0;
  for(let i=0;i<n;i++){ const w=Math.random()*2-1;
   if(kind==='brown'){ br=(br+0.02*w)/1.02; d[i]=br*3.5; }
   else { b0=0.99886*b0+w*0.0555179; b1=0.99332*b1+w*0.0750759; b2=0.969*b2+w*0.153852; b3=0.8665*b3+w*0.3104856; b4=0.55*b4+w*0.5329522; b5=-0.7616*b5-w*0.016898; d[i]=(b0+b1+b2+b3+b4+b5+b6+w*0.5362)*0.11; b6=w*0.115926; } }
  const F=Math.floor(sr*0.5); for(let i=0;i<F;i++){ const a=i/F; d[n-F+i]=d[n-F+i]*Math.cos(a*Math.PI/2)+d[i]*Math.sin(a*Math.PI/2); }
 }
 return NOISE[kind]=b; }
function lfo(ctx,periodSec,amount,target){ const o=ctx.createOscillator(); o.frequency.value=1/periodSec; const g=ctx.createGain(); g.gain.value=amount; o.connect(g); if(target) g.connect(target); o.start(); return {o,g}; }

/* ---------- the engine: mix -> filter drift -> crossfeed modulation -> breathing -> sleep timer -> master -> safety -> stereo or mono ---------- */
const SAFETY=(()=>{ const n=4097,c=new Float32Array(n); for(let i=0;i<n;i++){ const x=i/(n-1)*2-1,a=Math.abs(x); const y=a<=0.75?a:0.75+0.19*Math.tanh((a-0.75)/0.19); c[i]=Math.sign(x)*Math.min(y,0.93); } return c; })();
class Engine{
 constructor(ctx){ this.ctx=ctx; const c=ctx; this.render=false;
  const st=n=>{ n.channelCount=2; n.channelCountMode='explicit'; n.channelInterpretation='speakers'; return n; };
  this.mix=st(c.createGain()); this.duck=c.createGain();
  this.lp=c.createBiquadFilter(); this.lp.type='lowpass'; this.lp.Q.value=0.5; this.lp.frequency.value=20000;
  this.pk=c.createBiquadFilter(); this.pk.type='peaking'; this.pk.Q.value=0.8; this.pk.frequency.value=900; this.pk.gain.value=0;
  this.lpA=lfo(c,120,0,this.lp.detune); this.lpB=lfo(c,120*1.618,0,this.lp.detune); this.pkA=lfo(c,97,0,this.pk.detune); this.pkB=lfo(c,97*1.618,0,this.pk.detune);
  this.mix.connect(this.lp); this.lp.connect(this.pk);
  this.split=c.createChannelSplitter(2); this.merge=c.createChannelMerger(2); const pre=st(c.createGain()); this.pk.connect(pre); pre.connect(this.split);
  const G=()=>c.createGain(); this.gLL=G(); this.gRR=G(); this.gRL=G(); this.gLR=G();
  this.split.connect(this.gLL,0); this.gLL.connect(this.merge,0,0); this.split.connect(this.gRL,1); this.gRL.connect(this.merge,0,0);
  this.split.connect(this.gRR,1); this.gRR.connect(this.merge,0,1); this.split.connect(this.gLR,0); this.gLR.connect(this.merge,0,1);
  this.xA=lfo(c,90,0,this.gRL.gain); this.xAi=c.createGain(); this.xAi.gain.value=-1; this.xA.g.connect(this.xAi); this.xAi.connect(this.gLL.gain);
  this.xB=lfo(c,90*1.37,0,this.gLR.gain); this.xBi=c.createGain(); this.xBi.gain.value=-1; this.xB.g.connect(this.xBi); this.xBi.connect(this.gRR.gain);
  this.breath=st(c.createGain()); this.merge.connect(this.breath); this.br=lfo(c,10,0,this.breath.gain);
  this.timerG=st(c.createGain()); this.breath.connect(this.timerG);
  this.masterG=st(c.createGain()); this.timerG.connect(this.masterG);
  this.comp=c.createDynamicsCompressor(); this.comp.threshold.value=-10; this.comp.knee.value=8; this.comp.ratio.value=4; this.comp.attack.value=0.01; this.comp.release.value=0.4;
  this.safe=c.createWaveShaper(); this.safe.curve=SAFETY; this.masterG.connect(this.comp); this.comp.connect(this.safe);
  this.stG=c.createGain(); this.monoG=c.createGain(); this.safe.connect(this.stG);
  const ms=c.createChannelSplitter(2), sum=c.createGain(), mm=c.createChannelMerger(2); sum.gain.value=0.5; this.safe.connect(ms); ms.connect(sum,0); ms.connect(sum,1); sum.connect(mm,0,0); sum.connect(mm,0,1); mm.connect(this.monoG);
  this.output=st(c.createGain()); this.stG.connect(this.output); this.monoG.connect(this.output);
  this.applyAll(); }
 applyAll(){ this.applyMaster(); this.applyOut(); this.applyHyp(); }
 applyMaster(){ setG(this.masterG.gain,g2(S.master,1.5),this.ctx,0.2); }
 applyOut(){ const m=S.out==='mono'; S.device=m?'phone':''; setG(this.stG.gain,m?0:1,this.ctx,0.25); setG(this.monoG.gain,m?1:0,this.ctx,0.25); }
 applyHyp(){ const c=this.ctx, H=S.hyp, T=0.6;
  const d=H.xfeed.on?clamp(H.xfeed.depth,0,100)/100*0.5:0, P=clamp(H.xfeed.period,20,600);
  setG(this.gRL.gain,d/2,c,T); setG(this.gLR.gain,d/2,c,T); setG(this.gLL.gain,1-d/2,c,T); setG(this.gRR.gain,1-d/2,c,T);
  setG(this.xA.g.gain,d/2,c,T); setG(this.xB.g.gain,d/2,c,T); this.xA.o.frequency.setValueAtTime(1/P,c.currentTime); this.xB.o.frequency.setValueAtTime(1/(P*1.37),c.currentTime);
  const F=H.filt, fd=F.on?clamp(F.depth,0,100)/100:0, FP=clamp(F.period,20,900), lpOn=F.on&&F.style==='lowpass', pkOn=F.on&&F.style==='band';
  setG(this.lp.frequency,lpOn?6500:20000,c,T); setG(this.lpA.g.gain,lpOn?fd*1200:0,c,T); setG(this.lpB.g.gain,lpOn?fd*1200:0,c,T);
  setG(this.pk.gain,pkOn?2+fd*5:0,c,T); setG(this.pkA.g.gain,pkOn?fd*1300:0,c,T); setG(this.pkB.g.gain,pkOn?fd*1300:0,c,T);
  for(const [o,k] of [[this.lpA,1],[this.lpB,1.618],[this.pkA,1],[this.pkB,1.618]]) o.o.frequency.setValueAtTime(1/(FP*k),c.currentTime);
  const B=H.breath, a=B.on?clamp(B.depth,0,100)/100*0.5:0; setG(this.breath.gain,1-a/2,c,T); setG(this.br.g.gain,a/2,c,T); this.br.o.frequency.setValueAtTime(clamp(B.bpm,2,12)/60,c.currentTime); }
 hypState(){ return {gLL:this.gLL.gain.value,gRL:this.gRL.gain.value,xA:this.xA.g.gain.value,lpF:this.lp.frequency.value,lpDepth:this.lpA.g.gain.value,pkGain:this.pk.gain.value,breath:this.br.g.gain.value,stereo:this.stG.gain.value,mono:this.monoG.gain.value}; }
 set(p,v,init){ if(init) p.setValueAtTime(v,this.ctx.currentTime); else setG(p,v,this.ctx); }
}

/* ---------- a doctor's channel strip: input -> gentle limiter (or bypass) -> volume -> presence -> mix ---------- */
class Strip{
 constructor(eng){ const c=eng.ctx; this.c=c; this.in=c.createGain(); this.comp=c.createDynamicsCompressor(); this.byp=c.createGain(); this.lim=c.createGain();
  this.vol=c.createGain(); this.pres=c.createGain(); this.pres.gain.value=0;
  this.in.connect(this.comp); this.comp.connect(this.lim); this.in.connect(this.byp); this.lim.connect(this.vol); this.byp.connect(this.vol); this.vol.connect(this.pres); this.pres.connect(eng.mix);
  this.comp.knee.value=10; this.comp.ratio.value=6; this.comp.attack.value=0.02; this.comp.release.value=0.9; this.applyLimiter(true); }
 applyLimiter(init){ const on=S.doctors.limiter, th=-30+clamp(S.doctors.limit,0,100)*0.24;
  this.comp.threshold.value=th; const mk=on?Math.pow(10,(-th*0.25)/20):1;
  if(init){ this.lim.gain.value=on?mk:0; this.byp.gain.value=on?0:1; } else { setG(this.lim.gain,on?mk:0,this.c,0.3); setG(this.byp.gain,on?0:1,this.c,0.3); } }
 setVol(v,init){ const g=g2(v,2); if(init) this.vol.gain.value=g; else setG(this.vol.gain,g,this.c,0.2); }
 fadeIn(sec){ rampTo(this.pres.gain,1,this.c,sec); }
 fadeOut(sec){ rampTo(this.pres.gain,0,this.c,sec); }
 disconnect(){ try{ this.pres.disconnect(); }catch(e){} }
}

/* ---------- players ---------- */
const LOOKAHEAD=30;
class BedPlayer{ // random sections of the layer's files, joined with long equal-power crossfades, so nothing repeats exactly
 constructor(eng,L,strip){ this.c=eng.ctx; this.L=L; this.bufs=new Map(); this.decoding=new Set(); this.nextT=0; this.last=-1; this.lastOff=-1; this.srcs=[]; this.alive=true; this.chunks=0;
  this.maxDec=Math.min(3,L.files.length); this.out=this.c.createGain(); this.out.connect(strip.in); }
 url(i){ return fileUrl(this.L.world,this.L.files[i].f); }
 async load(){ const r=await Promise.all(this.L.files.map((f,i)=>fetchRaw(this.url(i)).catch(()=>null))); if(!r.some(x=>x)) throw new Error('no audio'); this.fill(); }
 fill(){ if(!this.alive) return; const idx=this.L.files.map((_,i)=>i).filter(i=>!this.bufs.has(i)&&!this.decoding.has(i)&&RAW[this.url(i)]);
  while(this.bufs.size+this.decoding.size<this.maxDec&&idx.length){ const i=idx.splice(Math.floor(Math.random()*idx.length),1)[0]; this.decoding.add(i);
   decode(this.c,RAW[this.url(i)]).then(b=>{ this.decoding.delete(i); if(b&&this.alive) this.bufs.set(i,b); }); } }
 rotate(){ // at most three sections decoded at once, for the iPhone's memory; swap one now and then
  if(this.L.files.length<=this.maxDec||this.bufs.size<this.maxDec) return; const inUse=new Set(this.srcs.map(s=>s._i)); const cand=[...this.bufs.keys()].filter(i=>!inUse.has(i)&&i!==this.last);
  if(cand.length){ this.bufs.delete(cand[Math.floor(Math.random()*cand.length)]); this.fill(); } }
 schedule(until){ if(!this.alive||!this.bufs.size) return; const now=this.c.currentTime; if(this.nextT<now+0.05) this.nextT=now+0.1;
  let guard=0; const L=this.L;
  while(this.nextT<until&&guard++<8){ const keys=[...this.bufs.keys()]; let i=keys[Math.floor(Math.random()*keys.length)]; if(keys.length>1&&i===this.last) i=keys[(keys.indexOf(i)+1)%keys.length];
   const b=this.bufs.get(i), f=L.files[i], xf=Math.min(L.xfade||4,b.duration/6); let len=rnd(L.minLen||15,L.maxLen||40); len=Math.min(len,b.duration-2*xf-0.2); if(len<xf+0.2) len=Math.max(xf+0.2,b.duration-2*xf-0.1);
   const span=Math.max(0.1,b.duration-len-xf-0.1); let off=rnd(0,span); if(this.bufs.size===1&&this.lastOff>=0&&Math.abs(off-this.lastOff)<len*0.5) off=(off+span*0.5)%span;
   const t=this.nextT, s=this.c.createBufferSource(); s.buffer=b; s.playbackRate.value=1+rnd(-0.003,0.003); s._i=i;
   const g=this.c.createGain(), ng=normGain(f); g.gain.value=0; s.connect(g); g.connect(this.out);
   try{ g.gain.setValueCurveAtTime(EQUAL_IN.map(x=>x*ng),t,xf); g.gain.setValueAtTime(ng,t+len); g.gain.setValueCurveAtTime(EQUAL_OUT.map(x=>x*ng),t+len+0.001,xf); }catch(e){ g.gain.setValueAtTime(ng,t); }
   s.start(t,off); s.stop(t+len+xf+0.05); this.srcs.push(s); s.onended=()=>{ const q=this.srcs.indexOf(s); if(q>=0) this.srcs.splice(q,1); try{ g.disconnect(); }catch(e){} };
   this.nextT=t+len; this.last=i; this.lastOff=off; this.chunks++; if(this.chunks%3===0) this.rotate(); } }
 stop(at){ this.alive=false; this.srcs.forEach(s=>{ try{ s.stop(at); }catch(e){} }); setTimeout(()=>{ try{ this.out.disconnect(); }catch(e){} this.bufs.clear(); },Math.max(0,(at-this.c.currentTime)*1000)+300); }
 info(){ return {decoded:this.bufs.size,chunks:this.chunks,sources:this.srcs.length}; }
}
class EventPlayer{ // one recording now and then, somewhere in the stereo field; the next is decoded just before it is needed
 constructor(eng,L,strip){ this.c=eng.ctx; this.L=L; this.alive=true; this.count=0; this.srcs=[]; this.buf=null; this.bi=-1; this.last=-1; this.decoding=false; this.out=this.c.createGain(); this.out.connect(strip.in);
  this.due=this.c.currentTime+Math.min(this.interval()*rnd(0.08,0.4),240); }
 interval(){ return Math.max(20,(S.layers[this.L.key]&&S.layers[this.L.key].interval)||this.L.interval||600); }
 reschedule(){ this.due=Math.min(this.due,this.c.currentTime+this.interval()*rnd(0.3,1)); }
 url(i){ return fileUrl(this.L.world,this.L.files[i].f); }
 async load(){ const r=await Promise.all(this.L.files.map((f,i)=>fetchRaw(this.url(i)).catch(()=>null))); if(!r.some(x=>x)) throw new Error('no audio'); this.prep(); }
 prep(){ if(this.buf||this.decoding||!this.alive) return; const n=this.L.files.length; let i=Math.floor(Math.random()*n); if(n>1&&i===this.last) i=(i+1)%n;
  const raw=RAW[this.url(i)]; if(!raw) return; this.decoding=true; decode(this.c,raw).then(b=>{ this.decoding=false; if(this.alive&&b){ this.buf=b; this.bi=i; } }); }
 now(){ this.due=this.c.currentTime+0.2; }
 schedule(until){ if(!this.alive) return; if(!this.buf){ this.prep(); return; } if(this.due>until) return; const t=Math.max(this.due,this.c.currentTime+0.1), b=this.buf, f=this.L.files[this.bi];
  const s=this.c.createBufferSource(); s.buffer=b; const g=this.c.createGain(), ng=normGain(f)*Math.pow(10,rnd(-2,1.5)/20); const pn=this.c.createStereoPanner?this.c.createStereoPanner():null;
  s.connect(g); if(pn){ pn.pan.value=rnd(-0.6,0.6); g.connect(pn); pn.connect(this.out); } else g.connect(this.out);
  const fd=Math.min(1.5,b.duration/5); g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(ng,t+fd); g.gain.setValueAtTime(ng,t+b.duration-fd); g.gain.linearRampToValueAtTime(0,t+b.duration);
  s.start(t); this.srcs.push(s); s.onended=()=>{ const q=this.srcs.indexOf(s); if(q>=0) this.srcs.splice(q,1); try{ g.disconnect(); if(pn) pn.disconnect(); }catch(e){} };
  this.count++; this.lastAt=t; this.last=this.bi; this.buf=null; this.due=t+b.duration+this.interval()*rnd(0.6,1.4)-b.duration; this.prep(); }
 stop(at){ this.alive=false; this.srcs.forEach(s=>{ try{ s.stop(at); }catch(e){} }); setTimeout(()=>{ try{ this.out.disconnect(); }catch(e){} },Math.max(0,(at-this.c.currentTime)*1000)+300); }
 info(){ return {count:this.count,due:Math.round(this.due-this.c.currentTime),ready:!!this.buf}; }
}
class SynthPlayer{ // synthesised doctors: all movement runs on the audio clock, so nothing depends on timers
 constructor(eng,L,strip){ const c=this.c=eng.ctx; this.L=L; this.nodes=[]; this.out=c.createGain(); this.out.connect(strip.in); const t=c.currentTime+0.05; const N=n=>{ this.nodes.push(n); return n; };
  const src=kind=>{ const s=N(c.createBufferSource()); s.buffer=noiseBuf(c,kind); s.loop=true; s.loopStart=0.5; s.loopEnd=s.buffer.duration; s.start(t,rnd(0.5,11)); return s; };
  const L2=(p,a,target)=>{ const x=lfo(c,p,a,target); N(x.o); return x; };
  const filt=(type,f,q)=>{ const b=N(c.createBiquadFilter()); b.type=type; b.frequency.value=f; b.Q.value=q==null?0.7:q; return b; };
  const gain=v=>{ const g=N(c.createGain()); g.gain.value=v; return g; };
  const pan=(node,v,move)=>{ const pn=c.createStereoPanner?N(c.createStereoPanner()):null; if(pn){ pn.pan.value=v; node.connect(pn); pn.connect(this.out); if(move) L2(move,0.5,pn.pan); } else node.connect(this.out); };
  if(L.synth==='drone'){ // pure fifths on A, gently breathing, with a slowly beating pair
   [[55,0.30,-0.3],[55.35,0.18,0.3],[82.5,0.16,-0.15],[110,0.12,0.15],[165,0.05,0]].forEach(([f,a,p],i)=>{ const o=N(c.createOscillator()); o.type=i===2?'triangle':'sine'; o.frequency.value=f; const g=gain(a*0.6); L2(17+i*7.3,a*0.35,g.gain); o.connect(g); pan(g,p); o.start(t); });
   this.level=0.9; }
  else if(L.synth==='ancientwind'){ // bare rock and no life: hiss, low gusts, and a thin whistle over stone
   const n=src('pink'); const lowb=filt('bandpass',320,0.8), mid=filt('bandpass',1100,1.4), whis=filt('bandpass',1900,14);
   const gl=gain(0.9), gm=gain(0.45), gw=gain(0.10), gust=gain(0.55); n.connect(lowb); n.connect(mid); n.connect(whis); lowb.connect(gl); mid.connect(gm); whis.connect(gw);
   L2(41,900,lowb.detune); L2(29,700,mid.detune); L2(67,1100,mid.detune); L2(23,1500,whis.detune); L2(53,0.07,gw.gain);
   [gl,gm,gw].forEach(g=>g.connect(gust)); L2(19,0.22,gust.gain); L2(47,0.18,gust.gain); L2(113,0.1,gust.gain); pan(gust,0,71); this.level=1.6; }
  else if(L.synth==='rumble'){ const n=src('brown'); const lp=filt('lowpass',80,0.9), mid=filt('lowpass',190,0.6), a=gain(1.1), b=gain(0.35), sw=gain(0.7);
   n.connect(lp); lp.connect(a); n.connect(mid); mid.connect(b); a.connect(sw); b.connect(sw); L2(31,0.25,sw.gain); L2(83,0.2,sw.gain); L2(57,500,lp.detune); sw.connect(this.out); this.level=2.2; }
  else if(L.synth==='sea'){ [[9.1,-0.55],[12.7,0.55],[16.3,0]].forEach(([p,pv])=>{ const n=src('pink'); const lp=filt('lowpass',650,0.5), g=gain(0.35); L2(p,1700,lp.detune); L2(p,0.3,g.gain); n.connect(lp); lp.connect(g); pan(g,pv); }); this.level=1.5; }
  this.out.gain.value=this.level||1; }
 load(){ return Promise.resolve(); }
 schedule(){}
 stop(at){ this.nodes.forEach(n=>{ try{ if(n.stop) n.stop(at); }catch(e){} }); setTimeout(()=>{ this.nodes.forEach(n=>{ try{ n.disconnect(); }catch(e){} }); try{ this.out.disconnect(); }catch(e){} },Math.max(0,(at-this.c.currentTime)*1000)+300); }
 info(){ return {nodes:this.nodes.length}; }
}
class EnsemblePlayer{ // the Night Fire Clock Ensemble's own conductor and clock voices
 constructor(eng,L,strip){ this.c=eng.ctx; this.L=L; ENS_FILES=L.ens; const host={ctx:this.c,render:false,clockIn:strip.in,duck:eng.duck,set:(p,v,i)=>eng.set(p,v,i)};
  this.ens=new ClockEnsemble(host); this.started=false; }
 async load(){ const L=this.L, W=L.world; const jobs=Object.keys(L.ens.clocks).map(k=>['clock_'+k,L.ens.clocks[k].file]).concat(Object.keys(L.ens.chimes).map(k=>['chime_'+k,L.ens.chimes[k].file]));
  const r=await Promise.all(jobs.map(([n,f])=>fetchRaw(fileUrl(W,f)).then(b=>{ if(!ENS_BUF[n]) ENS_RAW[n]=b; return 1; }).catch(()=>0))); if(!r.some(x=>x)) throw new Error('no audio'); await ensDecode(this.c); }
 schedule(until){ if(!this.started){ this.ens.start(this.c.currentTime); this.started=true; } this.ens.schedule(Math.min(until,this.c.currentTime+20)); }
 stop(at){ try{ this.ens.stopAll(Math.max(0,at-this.c.currentTime)); }catch(e){} }
 info(){ let segs=0; for(const k in this.ens.voices) segs+=this.ens.voices[k].segCount; return {segs,decoded:Object.keys(ENS_BUF).length,describe:this.ens.describe()}; }
}
class BrainwavePlayer{ // binaural tones, an optional isochronic pulse and solfeggio tone; the beat glides and drifts on the audio clock
 constructor(eng,L,strip){ const c=this.c=eng.ctx; this.L=L; this.nodes=[]; const N=n=>{ this.nodes.push(n); return n; }; const B=S.bw, t=c.currentTime+0.05;
  this.out=N(c.createGain()); this.out.connect(strip.in);
  this.beat=N(c.createConstantSource()); this.beat.offset.value=B.beatStart; this.beat.start(t);
  this.drift=lfo(c,Math.max(60,B.driftMin*60),B.drift?B.driftHz:0,this.beat.offset); N(this.drift.o);
  const half=N(c.createGain()); half.gain.value=0.5; const nhalf=N(c.createGain()); nhalf.gain.value=-0.5; this.beat.connect(half); this.beat.connect(nhalf);
  this.oL=N(c.createOscillator()); this.oR=N(c.createOscillator()); this.oL.frequency.value=B.carrier; this.oR.frequency.value=B.carrier; nhalf.connect(this.oL.frequency); half.connect(this.oR.frequency);
  const m=N(c.createChannelMerger(2)); this.binG=N(c.createGain()); this.binG.gain.value=0.22; this.oL.connect(m,0,0); this.oR.connect(m,0,1); m.connect(this.binG); this.binG.connect(this.out);
  this.iso=N(c.createOscillator()); this.iso.frequency.value=B.carrier; this.am=N(c.createGain()); this.am.gain.value=0.5; this.pulse=N(c.createOscillator()); this.pulse.frequency.value=0; this.beat.connect(this.pulse.frequency);
  const pg=N(c.createGain()); pg.gain.value=0.5; this.pulse.connect(pg); pg.connect(this.am.gain); this.iso.connect(this.am); this.isoG=N(c.createGain()); this.isoG.gain.value=B.iso?g2(B.isoVol,0.35):0; this.am.connect(this.isoG); this.isoG.connect(this.out);
  this.solf=N(c.createOscillator()); this.solf.frequency.value=B.solf||432; this.solfG=N(c.createGain()); this.solfG.gain.value=B.solf?g2(B.solfVol,0.12):0; const sw=lfo(c,23,0.3,null); N(sw.o); const swG=N(c.createGain()); swG.gain.value=0.7; sw.g.connect(swG.gain); this.solf.connect(swG); swG.connect(this.solfG); this.solfG.connect(this.out);
  [this.oL,this.oR,this.iso,this.pulse,this.solf].forEach(o=>o.start(t)); this.t0=t; this.journey(0); }
 journey(elapsed){ const c=this.c, B=S.bw, now=c.currentTime, J=Math.max(1,B.journey)*60, e=clamp(elapsed||0,0,J); this.t0=now-(elapsed||0); const p=this.beat.offset; hold(p,now);
  const cur=B.beatStart+(B.beatEnd-B.beatStart)*(e/J); p.setValueAtTime(cur,now); if(e<J) p.linearRampToValueAtTime(B.beatEnd,now+(J-e)); }
 elapsed(){ return this.c.currentTime-this.t0; }
 apply(){ const c=this.c, B=S.bw; [this.oL,this.oR,this.iso].forEach(o=>setG(o.frequency,B.carrier,c,0.5)); setG(this.drift.g.gain,B.drift?B.driftHz:0,c,0.5); this.drift.o.frequency.setValueAtTime(1/Math.max(60,B.driftMin*60),c.currentTime);
  setG(this.isoG.gain,B.iso?g2(B.isoVol,0.35):0,c,0.3); if(B.solf) setG(this.solf.frequency,B.solf,c,0.3); setG(this.solfG.gain,B.solf?g2(B.solfVol,0.12):0,c,0.5); }
 beatNow(){ const B=S.bw, J=Math.max(1,B.journey)*60, e=clamp(this.elapsed(),0,J); return B.beatStart+(B.beatEnd-B.beatStart)*(e/J); }
 load(){ return Promise.resolve(); } schedule(){}
 stop(at){ this.nodes.forEach(n=>{ try{ if(n.stop) n.stop(at); }catch(e){} }); setTimeout(()=>this.nodes.forEach(n=>{ try{ n.disconnect(); }catch(e){} }),Math.max(0,(at-this.c.currentTime)*1000)+300); }
 info(){ return {beat:+this.beatNow().toFixed(2),carrier:S.bw.carrier,iso:this.isoG.gain.value}; }
}
const BW_LAYER={key:'brainwave',world:'',name:'The brainwave doctor',type:'brainwave',files:[]};

/* ---------- the room: who is invited, who is in, who waits ---------- */
const room={present:new Map(),leaving:new Map(),waitSince:new Map(),lastTurn:0,turnJit:1,log:[]};
function lay(key){ return key==='brainwave'?BW_LAYER:LAY[key]; }
function invitedKeys(){ const k=MAN.layers.filter(l=>S.layers[l.key].on).map(l=>l.key); if(S.bw.on) k.push('brainwave'); return k; }
function layerVol(key){ return key==='brainwave'?S.bw.vol:S.layers[key].vol; }
function admit(key,fade){ if(room.present.has(key)) return; const L=lay(key); const strip=new Strip(engine); strip.setVol(layerVol(key),true);
 const P=L.type==='bed'?BedPlayer:L.type==='event'?EventPlayer:L.type==='synth'?SynthPlayer:L.type==='ensemble'?EnsemblePlayer:BrainwavePlayer;
 const pl=new P(engine,L,strip); const d={key,strip,player:pl,since:ctx.currentTime,loaded:false,failed:false}; room.present.set(key,d); room.waitSince.delete(key);
 pl.load().then(()=>{ d.loaded=true; renderRoomSoon(); }).catch(()=>{ d.failed=true; renderRoomSoon(); if(room.present.get(key)===d) say(L.name+' could not be downloaded. If you are offline, save '+(WORLD[L.world]?WORLD[L.world].name:'this world')+' for offline the next time you have internet.'); });
 strip.fadeIn(fade==null?6:fade); room.log.push(['in',key,Math.round(ctx.currentTime)]); if(room.log.length>60) room.log.shift(); }
function dismiss(key,fade,stayInvited){ const d=room.present.get(key); if(!d) return; room.present.delete(key); const f=fade==null?8:fade; d.strip.fadeOut(f); d.player.stop(ctx.currentTime+f+0.2);
 room.leaving.set(key,d); setTimeout(()=>{ d.strip.disconnect(); if(room.leaving.get(key)===d) room.leaving.delete(key); },(f+0.6)*1000); if(stayInvited) room.waitSince.set(key,Date.now()); room.log.push(['out',key,Math.round(ctx.currentTime)]); }
function longestPresent(except){ let best=null; for(const [k,d] of room.present){ if(k==='brainwave'||k===except) continue; if(!best||d.since<best.since) best=d; } return best; }
function reconcile(newcomer){ if(!playing||!engine) return ''; const inv=new Set(invitedKeys()), cap=S.doctors.cap; const msgs=[];
 for(const k of [...room.present.keys()]) if(!inv.has(k)) dismiss(k,8);
 for(const k of [...room.waitSince.keys()]) if(!inv.has(k)) room.waitSince.delete(k);
 for(const k of inv) if(!room.present.has(k)&&!room.waitSince.has(k)) room.waitSince.set(k,Date.now());
 if(newcomer&&inv.has(newcomer)&&!room.present.has(newcomer)&&room.present.size>=cap&&S.doctors.full==='swap'){ const o=longestPresent(newcomer); if(o){ dismiss(o.key,10,true); msgs.push(lay(o.key).name+' steps out to wait for a turn.'); } }
 while(room.present.size>cap){ const o=longestPresent(); if(!o) break; dismiss(o.key,10,true); }
 const order=[...room.waitSince.entries()].sort((a,b)=>(a[0]===newcomer?-1:b[0]===newcomer?1:a[1]-b[1]));
 for(const [k] of order){ if(room.present.size>=cap) break; admit(k); if(k===newcomer) msgs.unshift(lay(k).name+' joins the room.'); }
 if(newcomer&&room.waitSince.has(newcomer)) msgs.push('The room is full with '+cap+' doctors, so '+lay(newcomer).name+' waits outside for a turn.');
 renderRoomSoon(); return msgs.join(' '); }
function turnTaking(){ if(!S.doctors.turns||!room.waitSince.size) return; const now=Date.now(); if(!room.lastTurn) room.lastTurn=now; const want=S.doctors.turnMin*60e3*room.turnJit;
 if(now-room.lastTurn<want) return; room.lastTurn=now; room.turnJit=rnd(0.75,1.25); const o=longestPresent(); const w=[...room.waitSince.entries()].sort((a,b)=>a[1]-b[1])[0]; if(!o||!w) return;
 dismiss(o.key,30,true); admit(w[0],30); renderRoomSoon(); }
function askToLeave(key){ const was=room.present.has(key); if(key==='brainwave') S.bw.on=false; else S.layers[key].on=false; save(); if(playing) reconcile(); refreshLayer(key); renderRoomSoon();
 say(lay(key).name+(was?' thanks you and leaves the room, fading out gently.':' is no longer invited.')); }
function everyoneLeave(){ invitedKeys().forEach(k=>{ if(k==='brainwave') S.bw.on=false; else S.layers[k].on=false; }); save(); if(playing) reconcile(); refreshAllLayers(); renderRoomSoon(); say('Every doctor has been asked to leave. The room fades to silence.'); }
function invite(key,on){ if(key==='brainwave') S.bw.on=on; else S.layers[key].on=on; save(); let m=''; if(playing) m=reconcile(on?key:null)||''; refreshLayer(key); renderRoomSoon();
 if(!on) say(lay(key).name+(playing?' leaves the room, fading out gently.':' is no longer invited.')); else say(playing?(m||lay(key).name+' joins the room.'):lay(key).name+' is invited. Press Start to begin.'); }
function roomWords(){ const inr=[...room.present.keys()].map(k=>lay(k).name), wt=[...room.waitSince.keys()].map(k=>lay(k).name);
 if(!playing){ const inv=invitedKeys().map(k=>lay(k).name); return inv.length?'Nothing is playing. Invited: '+inv.join(', ')+'.':'Nothing is playing and no doctors are invited yet.'; }
 return (inr.length?inr.length+' doctor'+(inr.length===1?' is':'s are')+' in the room: '+inr.join(', ')+'.':'The room is empty.')+(wt.length?' Waiting for a turn: '+wt.join(', ')+'.':''); }

/* ---------- audio context, iOS unlock and output routing (the Cityland Drift approach) ---------- */
let ctx=null, engine=null, unlockEl=null, msd=null, playing=false, loopT=null, timerEnd=0, sessionStart=0;
function silentWav(){ const sr=8000,n=sr,b=new ArrayBuffer(44+n*2),v=new DataView(b),w=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
 w(0,'RIFF');v.setUint32(4,36+n*2,true);w(8,'WAVE');w(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sr,true);v.setUint32(28,sr*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,n*2,true);
 return URL.createObjectURL(new Blob([b],{type:'audio/wav'})); }
function setAudioSession(){ try{ if(navigator.audioSession) navigator.audioSession.type=S.audioMode==='mix'?'ambient':'playback'; }catch(e){} }
function ensureCtx(){ setAudioSession();
 if(!ctx){ const AC=window.AudioContext||window.webkitAudioContext; ctx=new AC({latencyHint:'playback'}); }
 if(S.audioMode!=='mix'){ if(!unlockEl){ unlockEl=new Audio(silentWav()); unlockEl.loop=true; unlockEl.setAttribute('playsinline',''); } unlockEl.play().catch(()=>{}); } else if(unlockEl) unlockEl.pause();
 if(ctx.state!=='running') ctx.resume().catch(()=>{});
 if(!engine){ engine=new Engine(ctx); routeOutput(); try{ ctx.addEventListener('statechange',onCtxState); }catch(e){} }
 return ctx; }
async function routeOutput(){ const out=$('liveOut'); try{ engine.output.disconnect(); }catch(e){}
 if(S.audioMode==='background'&&ctx.createMediaStreamDestination&&!window.__noStream){ try{ if(!msd) msd=ctx.createMediaStreamDestination(); engine.output.connect(msd); if(out.srcObject!==msd.stream) out.srcObject=msd.stream; await out.play(); if(unlockEl) unlockEl.pause(); return; }catch(e){ console.warn('stream route failed, using the normal output',e&&e.message); try{ engine.output.disconnect(); }catch(_){} } }
 try{ out.pause(); }catch(e){} engine.output.connect(ctx.destination); }

/* ---------- start, stop, the one-second loop ---------- */
async function start(R){ ensureCtx(); if(playing) return; playing=true; sessionStart=ctx.currentTime-(R&&R.session||0); room.present.clear(); room.waitSince.clear(); room.lastTurn=Date.now();
 engine.applyAll(); reconcile(); if(R&&R.bw!=null){ const d=room.present.get('brainwave'); if(d) d.player.journey(R.bw); }
 setTimer(R&&R.timerLeft); clearInterval(loopT); loopT=setInterval(loop,1000); loop(); mediaSession(true); renderPlay(); hideResume();
 say(room.present.size?'Started. '+roomWords():'Started, but no doctors are invited yet. Open a world below and invite some, and they will come straight in.'); }
function stop(msg){ if(!playing) return; playing=false; clearSession(); clearInterval(loopT); loopT=null; for(const k of [...room.present.keys()]) dismiss(k,2); room.waitSince.clear(); timerEnd=0; mediaSession(false); renderPlay(); renderRoomSoon(); renderTimerLeft(); say(msg||'Stopped. The doctors fade out.'); }
let lastSaveAt=0, interrupted=false, notRunningSince=0, lastTimerRender=0;
function loop(){ if(!playing) return;
 if(ctx.state!=='running'){ if(ctx.state!=='closed') ctx.resume().catch(()=>{}); if(!interrupted){ interrupted=true; notRunningSince=Date.now(); saveSession(); } if(!document.hidden&&Date.now()-notRunningSince>4000) showResume(); return; }
 if(interrupted) onCtxState();
 const until=ctx.currentTime+LOOKAHEAD; for(const d of room.present.values()){ try{ d.player.schedule(until); }catch(e){ console.error('schedule',d.key,e); } }
 turnTaking(); if(Date.now()-lastSaveAt>5000) saveSession();
 if(timerEnd&&ctx.currentTime>=timerEnd){ stop('The sleep timer has finished. Goodnight.'); return; }
 if(Date.now()-lastTimerRender>15000){ lastTimerRender=Date.now(); renderTimerLeft(); } }
function setTimer(leftSec){ if(!engine) return; const c=ctx, p=engine.timerG.gain; hold(p,c.currentTime); p.setTargetAtTime(1,c.currentTime,0.3);
 const m=+S.timer.min; if(!m||!playing){ timerEnd=0; renderTimerLeft(); return; } const len=leftSec!=null?leftSec:m*60, fade=Math.min(len,S.timer.fade*60);
 timerEnd=c.currentTime+len; const fa=Math.max(c.currentTime+1.5,timerEnd-fade); p.setValueAtTime(1,fa); p.linearRampToValueAtTime(0.0001,Math.max(fa+0.1,timerEnd)); renderTimerLeft(); }
function timerLeft(){ return timerEnd&&ctx?Math.max(0,timerEnd-ctx.currentTime):0; }
function mediaSession(on){ if(!('mediaSession' in navigator)) return; try{ navigator.mediaSession.metadata=new MediaMetadata({title:'Ultimate Sanctuary',artist:[...room.present.keys()].slice(0,3).map(k=>lay(k).name).join(', ')||'Meditation'});
 navigator.mediaSession.playbackState=on?'playing':'paused'; navigator.mediaSession.setActionHandler('pause',()=>stop()); navigator.mediaSession.setActionHandler('play',()=>{ if(!playing) start(); }); }catch(e){} }

/* ---------- phone calls and other interruptions: pause, then carry on where it was ---------- */
function sessionSnap(){ if(!playing||!ctx) return null; const b=room.present.get('brainwave'); return {v:1,savedAt:Date.now(),session:ctx.currentTime-sessionStart,timerLeft:timerEnd?timerLeft():null,bw:b?b.player.elapsed():null,settings:JSON.parse(JSON.stringify(S))}; }
function saveSession(){ const s=sessionSnap(); if(!s) return; lastSaveAt=Date.now(); try{ localStorage.setItem(SESS,JSON.stringify(s)); }catch(e){} }
function readSession(){ try{ const s=JSON.parse(localStorage.getItem(SESS)); if(s&&s.v===1&&Date.now()-s.savedAt<48*3600e3) return s; }catch(e){} return null; }
function clearSession(){ try{ localStorage.removeItem(SESS); }catch(e){} }
function onCtxState(){ if(!playing) return; if(ctx.state!=='running'){ if(!interrupted){ interrupted=true; notRunningSince=Date.now(); saveSession(); } }
 else if(interrupted){ interrupted=false; const was=!$('resumeBtn').hidden; hideResume(); if(was) say('Resumed where you left off. '+roomWords()); } }
function nudgeAudio(){ if(!ctx) return; if(S.audioMode==='playback'&&unlockEl) unlockEl.play().catch(()=>{}); if(S.audioMode==='background') $('liveOut').play().catch(()=>{}); if(ctx.state!=='running'&&ctx.state!=='closed') ctx.resume().catch(()=>{}); }
function tryAutoResume(){ if(!playing||!ctx) return; if(ctx.state==='closed'){ showResume(); return; } nudgeAudio(); setTimeout(()=>{ if(playing&&ctx&&ctx.state!=='running'&&!document.hidden) showResume(); },1800); }
function showResume(){ const b=$('resumeBtn'); if(!b.hidden) return; b.hidden=false; try{ b.focus(); }catch(e){} say('The sound was interrupted and is paused. Tap Resume session to carry on from where you left off.'); }
function hideResume(){ $('resumeBtn').hidden=true; }
function resumeNow(){ if(!playing){ hideResume(); const R=readSession(); if(R) resumeFrom(R); return; }
 if(ctx&&ctx.state!=='closed'){ setAudioSession(); nudgeAudio(); const p=ctx.resume(); const check=()=>{ if(ctx.state==='running'){ interrupted=false; hideResume(); say('Resumed where you left off. '+roomWords()); } else rebuild(); };
  if(p&&p.then) p.then(()=>setTimeout(check,250),()=>rebuild()); else setTimeout(check,400); return; } rebuild(); }
function rebuild(){ const R=sessionSnap()||readSession(); playing=false; clearInterval(loopT); try{ ctx.close(); }catch(e){} ctx=null; engine=null; msd=null; room.present.clear(); room.waitSince.clear(); for(const k in ENS_BUF) delete ENS_BUF[k];
 hideResume(); if(R) resumeFrom(R); else say('Sorry, the session could not be resumed. Tap Start.'); }
function resumeFrom(R){ S=normS(R.settings); save(); refreshAll(); $('resumeLast').hidden=true; return start(R); }
function offerResumeLast(){ const R=readSession(); if(!R) return; $('resumeLastInfo').textContent='Your last session was interrupted '+agoWords(R.savedAt)+', '+minsWords(Math.max(1,R.session/60))+' after you pressed Start. You can carry on with the same doctors and settings.'; $('resumeLast').hidden=false; }
function agoWords(ms){ const m=Math.round((Date.now()-ms)/60000); return m<1?'just now':m<90?minsWords(m)+' ago':'about '+Math.round(m/60)+' hours ago'; }
window.addEventListener('pagehide',()=>saveSession());
document.addEventListener('visibilitychange',()=>{ if(document.hidden) saveSession(); else tryAutoResume(); });
window.addEventListener('pageshow',()=>tryAutoResume());

/* ---------- offline: a cache per world, filled on request; the service worker answers from it ---------- */
const CACHE_PREFIX='us1-pack-';
function worldUrls(w){ const out=[]; for(const l of MAN.layers) if(l.world===w) for(const f of l.files) out.push([new URL(fileUrl(w,f.f),location.href).href,f.bytes]); return out; }
async function worldCached(w){ const all=worldUrls(w); if(!('caches' in window)) return {files:0,bytes:0,total:all.length}; try{ const c=await caches.open(CACHE_PREFIX+w); const keys=new Set((await c.keys()).map(r=>r.url)); let n=0,b=0;
 for(const [u,sz] of all) if(keys.has(u)){ n++; b+=sz; } return {files:n,bytes:b,total:all.length}; }catch(e){ return {files:0,bytes:0,total:all.length}; } }
const saving={};
async function saveWorld(w){ if(saving[w]) return; if(!('caches' in window)){ say('Sorry, this browser cannot save sounds for offline use.'); return; }
 saving[w]=true; const W=WORLD[w], files=worldUrls(w).map(x=>x[0]);
 try{ if(navigator.storage&&navigator.storage.persist) navigator.storage.persist().catch(()=>{}); }catch(e){}
 say('Saving '+W.name+' for offline, '+mb(W.bytes)+'. You can keep using the app while it saves.'); const c=await caches.open(CACHE_PREFIX+w); let done=0, fail=0; const have=new Set((await c.keys()).map(r=>r.url));
 const q=files.slice(); const el=$('off-'+w); const work=async()=>{ while(q.length){ const u=q.shift(); if(have.has(u)){ done++; continue; } let ok=false;
   for(let a=0;a<3&&!ok;a++){ try{ const r=await fetch(u,{mode:'cors',cache:'no-cache'}); if(!r.ok) throw new Error(r.status); await c.put(u,r); ok=true; }catch(e){ await new Promise(r=>setTimeout(r,1000*(a+1))); } }
   if(ok) done++; else fail++; if(el) el.textContent='Saving: '+done+' of '+files.length+' files.'; } };
 await Promise.all([work(),work(),work()]); saving[w]=false; await renderOffline(w); renderStorage();
 say(fail?W.name+': '+fail+' files could not be saved. Check the internet connection and press Save again; it carries on where it stopped.':W.name+' is saved for offline. It will play in Airplane Mode.'); }
async function removeWorld(w){ if('caches' in window) await caches.delete(CACHE_PREFIX+w); await renderOffline(w); renderStorage(); say(WORLD[w].name+': the offline copy is removed. It still plays when you are online.'); }
async function renderOffline(w){ const st=await worldCached(w), el=$('off-'+w), W=WORLD[w]; if(!el) return st;
 el.textContent=st.files>=st.total?'Saved for offline ('+mb(W.bytes)+'). Plays in Airplane Mode.':st.files?'Partly saved: '+st.files+' of '+st.total+' files ('+mb(st.bytes)+' of '+mb(W.bytes)+'). Press Save to finish.':'Not saved for offline yet, so it needs the internet. Saving takes '+mb(W.bytes)+'.';
 const rb=$('offrm-'+w); if(rb) rb.hidden=!st.files; return st; }
async function renderStorage(){ const el=$('storageInfo'); if(!el) return; let tot=0; const parts=[]; for(const w of MAN.worlds){ const st=await worldCached(w.id); tot+=st.bytes; if(st.files) parts.push(w.name+' '+mb(st.bytes)); }
 let est=''; try{ if(navigator.storage&&navigator.storage.estimate){ const e=await navigator.storage.estimate(); est=' The browser reports '+mb(e.usage||0)+' stored by this app in all.'; } }catch(e){}
 el.textContent=(tot?'Saved worlds use '+mb(tot)+': '+parts.join(', ')+'.':'No worlds are saved for offline yet.')+est; }

/* ---------- user interface ---------- */
function el(tag,attrs,kids){ const e=document.createElement(tag); for(const k in (attrs||{})){ const v=attrs[k]; if(v==null) continue; if(k==='text') e.textContent=v; else if(k.startsWith('on')) e.addEventListener(k.slice(2),v); else e.setAttribute(k,v); } (kids||[]).forEach(c=>c&&e.appendChild(typeof c==='string'?document.createTextNode(c):c)); return e; }
const CTL={};
function slider(id,label,min,max,step,get,setv,fmt){ const i=el('input',{type:'range',id,min,max,step}); const txt=el('span',{class:'val','aria-hidden':'true'}); const out=()=>{ i.setAttribute('aria-valuetext',fmt(+i.value)); txt.textContent=fmt(+i.value); };
 i.value=get(); out(); i.addEventListener('input',()=>{ setv(+i.value); out(); }); i.addEventListener('change',()=>save());
 CTL[id]={refresh:()=>{ i.value=get(); out(); }}; return el('div',{class:'field'},[el('label',{for:id},[label+': ',txt]),i]); }
function checkbox(id,label,get,setv){ const i=el('input',{type:'checkbox',id}); i.checked=!!get(); i.addEventListener('change',()=>{ setv(i.checked); save(); }); CTL[id]={refresh:()=>{ i.checked=!!get(); }}; return el('div',{class:'check'},[i,el('label',{for:id,text:label})]); }
function select(id,label,opts,get,setv){ const s=el('select',{id},opts.map(([v,t])=>el('option',{value:String(v),text:t}))); s.value=String(get()); s.addEventListener('change',()=>{ setv(s.value); save(); }); CTL[id]={refresh:()=>{ s.value=String(get()); }}; return el('div',{class:'field'},[el('label',{for:id,text:label}),s]); }
function section(id,title,kids,openDefault){ const open=S.open[id]!=null?S.open[id]:!!openDefault; const body=el('div',{id:'sec-'+id,class:'secbody'},kids); body.hidden=!open;
 const b=el('button',{type:'button',class:'sechead','aria-expanded':String(open),'aria-controls':'sec-'+id,id:'btn-'+id,text:title});
 b.addEventListener('click',()=>{ const o=b.getAttribute('aria-expanded')!=='true'; b.setAttribute('aria-expanded',String(o)); body.hidden=!o; S.open[id]=o; save(); if(o&&id.startsWith('w-')) renderOffline(id.slice(2)); });
 return el('section',{class:'sec'},[el('h2',{},[b]),body]); }
const volTxt=v=>v==0?'silent':pct(v);
const ivTxt=v=>'about every '+secsWords(v);
function hzTxt(v){ const b=v<4?'delta':v<8?'theta':v<13?'alpha':'beta'; return (Math.round(v*100)/100)+' hertz, '+b; }
const sid=k=>k.replace(/\W/g,'_');
function layerUI(L){ const k=L.key, id=sid(k); const st=el('p',{class:'lstate',id:'st-'+id});
 const ask=el('button',{type:'button',class:'ask',id:'ask-'+id,text:'Ask '+L.name+' to leave'}); ask.addEventListener('click',()=>askToLeave(k));
 const kids=[el('h3',{text:L.name}),el('p',{class:'about',text:L.about}),
  checkbox('inv-'+id,'Invite '+L.name,()=>S.layers[k].on,v=>invite(k,v)),
  slider('vol-'+id,L.name+' volume',0,100,1,()=>S.layers[k].vol,v=>{ S.layers[k].vol=v; const d=room.present.get(k); if(d) d.strip.setVol(v); },volTxt)];
 if(L.type==='event') kids.push(slider('iv-'+id,'How often '+L.name+' comes',30,3600,30,()=>S.layers[k].interval,v=>{ S.layers[k].interval=v; const d=room.present.get(k); if(d) d.player.reschedule(); },ivTxt));
 if(L.type==='ensemble'){ const ensUp=(re)=>{ const d=room.present.get(k); if(d){ d.player.ens.update(); if(re) d.player.ens.replanSoon(); } };
  kids.push(select('ensPreset','Clock conversation style',[['','Natural, as the clocks like it']].concat(ENS_PRESETS.map(p=>[p.id,p.name])),()=>S.ensPreset,v=>{ S.ensPreset=v; const p=ENS_PRESETS.find(x=>x.id===v); const keep={chimes:S.ens.chimes,chimeVol:S.ens.chimeVol};
    S.ens=normEns(p?Object.assign(JSON.parse(JSON.stringify(p.ens)),keep):keep); ensUp(true); if(p) say(p.name+'. '+p.desc); }),
   select('ensChimes','Clock chimes',[['off','No chimes'],['hours','On the hour'],['halves','Hours and half hours'],['quarters','Every quarter hour']],()=>S.ens.chimes,v=>{ S.ens.chimes=v; }),
   slider('ensChimeVol','Chime volume',0,100,1,()=>S.ens.chimeVol,v=>{ S.ens.chimeVol=v; ensUp(); },volTxt),
   slider('ensRoom','Room echo around the clocks',0,100,5,()=>S.ens.room,v=>{ S.ens.room=v; ensUp(); },v=>v==0?'dry':pct(v))); }
 kids.push(st,ask); return el('div',{class:'layer',id:'layer-'+id},kids); }
function refreshLayer(k){ const id=sid(k); ['inv-','vol-','iv-'].forEach(p=>CTL[p+id]&&CTL[p+id].refresh()); if(k==='brainwave'){ CTL.bwOn&&CTL.bwOn.refresh(); CTL.bwVol&&CTL.bwVol.refresh(); } stateText(k); }
function refreshAllLayers(){ MAN.layers.forEach(l=>refreshLayer(l.key)); refreshLayer('brainwave'); }
function stateText(k){ const id=sid(k), st=$('st-'+id), ask=$('ask-'+id); if(!st) return; const on=k==='brainwave'?S.bw.on:S.layers[k].on, d=room.present.get(k);
 st.textContent=!on?'Not invited.':!playing?'Invited. Comes in when you press Start.':d?(d.failed?'In the room, but its sound could not be downloaded.':d.loaded?'In the room.':'Coming in, downloading.'):'Invited, waiting outside for a turn.'; if(ask) ask.hidden=!on; }
let rrT=null; function renderRoomSoon(){ clearTimeout(rrT); rrT=setTimeout(renderRoom,120); }
function renderRoom(){ const ul=$('roomList'); if(!ul) return; ul.innerHTML=''; const keys=playing?[...room.present.keys(),...room.waitSince.keys()]:invitedKeys();
 if(!keys.length) ul.appendChild(el('li',{text:playing?'The room is empty.':'No doctors are invited yet.'}));
 keys.forEach(k=>{ const L=lay(k), inr=room.present.has(k); const b=el('button',{type:'button',text:'Ask '+L.name+' to leave'}); b.addEventListener('click',()=>askToLeave(k));
  ul.appendChild(el('li',{},[el('span',{text:L.name+(WORLD[L.world]?', '+WORLD[L.world].name:'')+(playing?(inr?', in the room. ':', waiting for a turn. '):', invited. ')}),b])); });
 $('roomSummary').textContent=roomWords(); MAN.layers.forEach(l=>stateText(l.key)); stateText('brainwave'); }
function renderPlay(){ $('playState').textContent=playing?'Playing.':'Stopped.'; }
function renderTimerLeft(){ const e=$('timerLeft'); if(!e) return; e.textContent=!+S.timer.min?'The sleep timer is off.':!playing||!timerEnd?'The sleep timer starts when you press Start.':'About '+minsWords(Math.max(1,timerLeft()/60))+' left, fading out over the last '+minsWords(S.timer.fade)+'.'; }
function refreshAll(){ for(const k in CTL) CTL[k].refresh(); if(engine) engine.applyAll(); for(const d of room.present.values()){ d.strip.setVol(layerVol(d.key)); d.strip.applyLimiter(); if(d.player.apply) d.player.apply(); } renderRoomSoon(); renderTimerLeft(); }

/* ---------- presets ---------- */
const BUILTIN=[
 {id:'nightfire',name:'Night Fire Clock Ensemble',desc:'The crackling fire, crickets, cicadas and night wind with the ten clocks in conversation, and a theta binaural beat gliding from 6 to 3 hertz.',
  on:{'clockfire.fire':60,'clockfire.crickets':35,'clockfire.cicadas':25,'clockfire.wind':30,'clockfire.clocks':55},bw:{on:true,carrier:136.1,beatStart:6,beatEnd:3,journey:40}},
 {id:'undersea',name:'Eight hours under the sea',desc:'Deep underwater all night, dolphins visiting about every seven minutes, faint surf above, and a slow delta beat on a low carrier. Set the sleep timer to eight hours if you like.',
  on:{'ocean.deep':60,'ocean.dolphins':35,'ocean.surf':15},bw:{on:true,carrier:100,beatStart:4,beatEnd:2,journey:60},iv:{'ocean.dolphins':420}},
 {id:'londonrain',name:'London rain at night',desc:'A London rooftop at night with rain, the Thames, trains far off, Big Ben now and then, and the warm hearth drone.',
  on:{'london.night':50,'london.rain':45,'london.thames':25,'london.nighttrain':20,'london.bigben':25,'clockfire.drone':15},bw:{on:false}},
 {id:'country',name:'Countryside night',desc:'Owls, ancient woodland and soft country rain, with a farm dog far off now and then, and a theta beat.',
  on:{'country.owls':35,'country.woodland':35,'country.crain':40,'country.farmdog':20},bw:{on:true,carrier:174,beatStart:6,beatEnd:4,journey:30}},
 {id:'river',name:'River and rain',desc:'A mountain stream and a Scottish brook, rain, and wind in the leaves, with alpha drifting down to theta.',
  on:{'river.stream':40,'river.brook':30,'river.rain':40,'river.leaves':25},bw:{on:true,carrier:136.1,beatStart:9,beatEnd:6,journey:30}},
 {id:'primordial',name:'Primordial Earth',desc:'The volcano at night, ancient winds over bare rock, the deep earth rumble, bubbling mud and the shallow sea, with a distant eruption now and then.',
  on:{'primordial.volcano':35,'primordial.ancientwind':40,'primordial.rumble':30,'primordial.mud':25,'primordial.sea':25,'primordial.eruption':20},bw:{on:true,carrier:100,beatStart:5,beatEnd:2.5,journey:45}},
 {id:'everything',name:'The whole sanctuary, taking turns',desc:'Doctors from every world invited at once. Six are in the room at a time and they take turns about every 15 minutes, so the night travels between fire, sea, rivers, London, the countryside and the young Earth.',
  on:{'clockfire.fire':55,'clockfire.clocks':50,'clockfire.crickets':30,'ocean.deep':50,'ocean.dolphins':30,'river.stream':35,'river.rain':40,'london.night':45,'country.owls':30,'country.woodland':35,'primordial.ancientwind':30,'primordial.volcano':25},bw:{on:true,carrier:136.1,beatStart:6,beatEnd:3,journey:60},doctors:{cap:6,turns:true,turnMin:15}},
];
function applyPreset(p,user){ if(user){ const keep={presets:S.presets,open:S.open}; S=normS(Object.assign(JSON.parse(JSON.stringify(p.s)),keep)); }
 else { for(const k in S.layers) S.layers[k].on=false; for(const k in p.on){ if(S.layers[k]){ S.layers[k].on=true; S.layers[k].vol=p.on[k]; } } for(const k in (p.iv||{})) if(S.layers[k]) S.layers[k].interval=p.iv[k];
  S.bw=Object.assign(JSON.parse(JSON.stringify(BW_DEF)),p.bw||{}); if(p.doctors) Object.assign(S.doctors,p.doctors); }
 save(); refreshAll(); refreshAllLayers(); if(playing){ reconcile(); const d=room.present.get('brainwave'); if(d){ d.player.apply(); d.player.journey(0); } }
 say((p.name||'Preset')+' loaded. '+(p.desc||'')+(playing?'':' Press Start to hear it.')); }
function renderPresets(){ const ul=$('userPresets'); ul.innerHTML=''; if(!S.presets.length) ul.appendChild(el('li',{text:'No saved presets yet.'}));
 S.presets.forEach((p,i)=>{ const lb=el('button',{type:'button',text:'Load '+p.name}); lb.addEventListener('click',()=>applyPreset(p,true)); const db=el('button',{type:'button',text:'Delete '+p.name}); db.addEventListener('click',()=>{ S.presets.splice(i,1); save(); renderPresets(); say(p.name+' deleted.'); }); ul.appendChild(el('li',{},[lb,' ',db])); }); }
function savePreset(){ const nm=($('presetName').value||'').trim()||('My sanctuary '+(S.presets.length+1)); if(S.presets.length>=30){ say('You have 30 saved presets, the most allowed. Delete one first.'); return; }
 const s=JSON.parse(JSON.stringify(S)); delete s.presets; delete s.open; const ex=S.presets.findIndex(p=>p.name===nm); if(ex>=0) S.presets[ex].s=s; else S.presets.push({name:nm,s}); save(); renderPresets(); $('presetName').value=''; say('Saved as '+nm+'.'); }

/* ---------- build the page ---------- */
function build(){ const host=$('app'); host.innerHTML='';
 host.appendChild(section('doctors','The doctors',[
  el('p',{class:'hint',text:'Every sound you invite is a friendly doctor. Choose how many may be in the room at once. Extra invited doctors wait outside and, if you like, take turns, so the night keeps changing. Any doctor can be asked to leave, and it fades out gently.'}),
  el('p',{id:'roomSummary'}), el('ul',{id:'roomList',class:'room'}),
  slider('cap','How many doctors in the room at once',1,12,1,()=>S.doctors.cap,v=>{ S.doctors.cap=v; if(playing) reconcile(); },v=>v+' doctor'+(v==1?'':'s')),
  select('full','When the room is full and you invite another',[['swap','The newcomer comes in, and the doctor who has been in longest waits outside'],['wait','The newcomer waits outside for a turn']],()=>S.doctors.full,v=>{ S.doctors.full=v; }),
  checkbox('turns','Waiting doctors take turns',()=>S.doctors.turns,v=>{ S.doctors.turns=v; room.lastTurn=Date.now(); }),
  slider('turnMin','How long each turn lasts',5,60,5,()=>S.doctors.turnMin,v=>{ S.doctors.turnMin=v; },v=>'about '+v+' minutes'),
  checkbox('limiter','Gentle limiter, so no doctor gets louder than you set',()=>S.doctors.limiter,v=>{ S.doctors.limiter=v; for(const d of room.present.values()) d.strip.applyLimiter(); say(v?'Gentle limiter on.':'Gentle limiter off.'); }),
  slider('limit','How lightly the limiter holds back loud moments',0,100,5,()=>S.doctors.limit,v=>{ S.doctors.limit=v; for(const d of room.present.values()) d.strip.applyLimiter(); },v=>v<30?pct(v)+', firm':v<70?pct(v)+', gentle':pct(v)+', very light'),
  el('button',{type:'button',id:'allLeave',text:'Ask every doctor to leave',onclick:()=>everyoneLeave()}) ],true));
 for(const W of MAN.worlds){ const ls=MAN.layers.filter(l=>l.world===W.id);
  const sv=el('button',{type:'button',id:'offsave-'+W.id,text:'Save '+W.name+' for offline'}); sv.addEventListener('click',()=>saveWorld(W.id));
  const rm=el('button',{type:'button',id:'offrm-'+W.id,text:'Remove the offline copy of '+W.name}); rm.hidden=true; rm.addEventListener('click',()=>removeWorld(W.id));
  host.appendChild(section('w-'+W.id,W.name,[el('p',{class:'hint',text:W.about+' '+ls.length+' doctors. Download size about '+mb(W.bytes)+'.'}),el('div',{class:'offline'},[el('p',{id:'off-'+W.id,text:'Checking the offline copy.'}),sv,' ',rm])].concat(ls.map(layerUI)),false)); }
 const bwA=()=>{ const d=room.present.get('brainwave'); if(d) d.player.apply(); }, bwJ=()=>{ const d=room.present.get('brainwave'); if(d) d.player.journey(d.player.elapsed()); };
 host.appendChild(section('brainwave','Brainwave tones',[
  el('p',{class:'hint',text:'Binaural beats: a slightly different tone in each ear, so wear stereo headphones and keep the output on Stereo. The beat glides from a start rate to an end rate and drifts a little around it. An isochronic pulse can be added underneath; it also works on a speaker. The brainwave doctor counts as one doctor and never takes turns.'}),
  checkbox('bwOn','Invite the brainwave doctor',()=>S.bw.on,v=>invite('brainwave',v)),
  slider('bwVol','Brainwave volume',0,100,1,()=>S.bw.vol,v=>{ S.bw.vol=v; const d=room.present.get('brainwave'); if(d) d.strip.setVol(v); },volTxt),
  select('bwCarrier','Carrier tone',SOLF,()=>S.bw.carrier,v=>{ S.bw.carrier=+v; bwA(); if(+v>500) say('Binaural beats are clearest on carriers under about 500 hertz; high carriers suit the isochronic pulse better.'); }),
  slider('bwStart','Beat at the start',0.5,14,0.5,()=>S.bw.beatStart,v=>{ S.bw.beatStart=v; bwJ(); },hzTxt),
  slider('bwEnd','Beat at the end of the glide',0.5,14,0.5,()=>S.bw.beatEnd,v=>{ S.bw.beatEnd=v; bwJ(); },hzTxt),
  slider('bwJourney','Length of the glide',5,480,5,()=>S.bw.journey,v=>{ S.bw.journey=v; bwJ(); },v=>minsWords(v)),
  checkbox('bwDrift','Beat drift, a slow wandering around the glide',()=>S.bw.drift,v=>{ S.bw.drift=v; bwA(); }),
  slider('bwDriftHz','How far the beat drifts',0.05,1.5,0.05,()=>S.bw.driftHz,v=>{ S.bw.driftHz=v; bwA(); },v=>'up and down by '+(Math.round(v*100)/100)+' hertz'),
  slider('bwDriftMin','How slowly it drifts',2,30,1,()=>S.bw.driftMin,v=>{ S.bw.driftMin=v; bwA(); },v=>'one wander every '+minsWords(v)),
  checkbox('bwIso','Isochronic pulse underneath',()=>S.bw.iso,v=>{ S.bw.iso=v; bwA(); }),
  slider('bwIsoVol','Isochronic pulse volume',0,100,1,()=>S.bw.isoVol,v=>{ S.bw.isoVol=v; bwA(); },volTxt),
  select('bwSolf','Extra solfeggio tone, softly swelling',[[0,'None']].concat(SOLF.filter(x=>x[0]>=174)),()=>S.bw.solf,v=>{ S.bw.solf=+v; bwA(); }),
  slider('bwSolfVol','Solfeggio tone volume',0,100,1,()=>S.bw.solfVol,v=>{ S.bw.solfVol=v; bwA(); },volTxt),
  el('p',{id:'st-brainwave',class:'lstate'}), el('button',{type:'button',id:'ask-brainwave',class:'ask',text:'Ask the brainwave doctor to leave',onclick:()=>askToLeave('brainwave')})],false));
 const H=()=>{ if(engine) engine.applyHyp(); };
 host.appendChild(section('hypnotic','Hypnotic modules',[
  el('p',{class:'hint',text:'Slow, low-intensity movements across the whole mix, each with its own switch. They start gentle. No voices, no guidance and nothing hidden.'}),
  el('h3',{text:'Crossfeed modulation'}),
  checkbox('xOn','Crossfeed modulation: left and right slowly borrow from each other',()=>S.hyp.xfeed.on,v=>{ S.hyp.xfeed.on=v; H(); say(v?'Crossfeed modulation on.':'Crossfeed modulation off.'); }),
  slider('xDepth','Crossfeed depth',0,100,5,()=>S.hyp.xfeed.depth,v=>{ S.hyp.xfeed.depth=v; H(); },v=>pct(v)+(v<=30?', subtle':v<=65?', noticeable':', strong')),
  slider('xPeriod','Crossfeed cycle',20,600,10,()=>S.hyp.xfeed.period,v=>{ S.hyp.xfeed.period=v; H(); },v=>'about '+secsWords(v)),
  el('h3',{text:'Filter drift'}),
  checkbox('fOn','Filter drift: the sound slowly darkens and brightens',()=>S.hyp.filt.on,v=>{ S.hyp.filt.on=v; H(); say(v?'Filter drift on.':'Filter drift off.'); }),
  select('fStyle','Filter drift style',[['lowpass','Darker and lighter, a gentle lowpass'],['band','A soft moving glow, a gentle band sweep']],()=>S.hyp.filt.style,v=>{ S.hyp.filt.style=v; H(); }),
  slider('fDepth','Filter drift depth',0,100,5,()=>S.hyp.filt.depth,v=>{ S.hyp.filt.depth=v; H(); },v=>pct(v)+(v<=30?', subtle':v<=65?', noticeable':', strong')),
  slider('fPeriod','Filter drift cycle',20,900,10,()=>S.hyp.filt.period,v=>{ S.hyp.filt.period=v; H(); },v=>'about '+secsWords(v)),
  el('h3',{text:'Breathing'}),
  checkbox('bOn','Breathing: the whole mix swells and settles like slow breaths',()=>S.hyp.breath.on,v=>{ S.hyp.breath.on=v; H(); say(v?'Breathing on.':'Breathing off.'); }),
  slider('bDepth','Breathing depth',0,100,5,()=>S.hyp.breath.depth,v=>{ S.hyp.breath.depth=v; H(); },v=>pct(v)+(v<=30?', subtle':', noticeable')),
  slider('bBpm','Breaths per minute',2,12,1,()=>S.hyp.breath.bpm,v=>{ S.hyp.breath.bpm=v; H(); },v=>v+' breaths a minute')],false));
 host.appendChild(section('output','Sound output and sleep timer',[
  select('outMode','Output',[['stereo','Stereo, for the living room or headphones'],['mono','Mono, for one bedroom speaker']],()=>S.out,v=>{ S.out=v; if(engine) engine.applyOut(); say(v==='mono'?'Mono, bedroom. Both sides are blended into one. Binaural beats need stereo, so add the isochronic pulse if you want the beat.':'Stereo, living room or headphones.'); }),
  slider('master','Master volume',0,100,1,()=>S.master,v=>{ S.master=v; if(engine) engine.applyMaster(); },volTxt),
  select('audioMode','When the phone is locked',[['background','Keep playing when the screen locks (recommended)'],['playback','Standard playback'],['mix','Mix with other apps, quieter']],()=>S.audioMode,v=>{ S.audioMode=v; if(ctx){ setAudioSession(); routeOutput(); } }),
  select('timerMin','Sleep timer',[[0,'Off, play until I stop it']].concat([15,30,45,60,90,120,180,240,300,360,420,480,600].map(m=>[m,minsWords(m)])),()=>S.timer.min,v=>{ S.timer.min=+v; setTimer(); say(+v?'Sleep timer: '+minsWords(+v)+(playing?', starting now.':', starting when you press Start.'):'Sleep timer off.'); }),
  select('timerFade','Fade out over the last',[1,5,10,15,20,30].map(m=>[m,minsWords(m)]),()=>S.timer.fade,v=>{ S.timer.fade=+v; setTimer(timerEnd?timerLeft():null); }),
  el('p',{id:'timerLeft'})],false));
 const pl=el('ul',{class:'presets'}); BUILTIN.forEach(p=>{ const b=el('button',{type:'button',id:'preset-'+p.id,text:p.name}); b.addEventListener('click',()=>applyPreset(p)); pl.appendChild(el('li',{},[b,el('p',{class:'hint',text:p.desc})])); });
 host.appendChild(section('presets','Presets',[el('h3',{text:'Ready-made'}),pl,el('h3',{text:'Your presets'}),el('div',{class:'field'},[el('label',{for:'presetName',text:'Name for a new preset'}),el('input',{type:'text',id:'presetName',autocomplete:'off'})]),
  el('button',{type:'button',id:'presetSave',text:'Save everything as a preset',onclick:savePreset}),el('ul',{id:'userPresets'})],false));
 host.appendChild(section('offline','Offline and storage',[el('p',{class:'hint',text:'Each world can be saved on the phone so it plays in Airplane Mode. Save the worlds you love; you do not need all of them. The app itself is saved the first time it opens.'}),el('p',{id:'storageInfo'}),
  el('button',{type:'button',id:'saveAll',text:'Save every world for offline, about '+mb(MAN.worlds.reduce((a,w)=>a+w.bytes,0)),onclick:async()=>{ for(const w of MAN.worlds) await saveWorld(w.id); }})],false));
 host.appendChild(section('credits','Credits and licences',[el('p',{},['Every recording is Creative Commons: CC0 (public domain) or CC BY (attribution). The same list is on the ',el('a',{href:'credits.html',text:'credits page'}),'.'])].concat(creditsList()),false));
 renderRoom(); renderPresets(); renderTimerLeft(); refreshAllLayers(); MAN.worlds.forEach(w=>renderOffline(w.id)); renderStorage(); }
function creditsList(){ const out=[]; for(const W of MAN.worlds){ const ul=el('ul',{}); MAN.layers.filter(l=>l.world===W.id).forEach(l=>{ if(!l.credits.length){ ul.appendChild(el('li',{text:l.name+': synthesised in the app, no recording.'})); return; }
  l.credits.forEach(c=>ul.appendChild(el('li',{},[l.name+': ',el('a',{href:c.url,text:'\u201c'+c.title+'\u201d by '+c.author}),', ',el('a',{href:c.licenceUrl,text:c.licence}),'.']))); }); out.push(el('h3',{text:W.name}),ul); } return out; }

/* ---------- boot ---------- */
async function boot(){ say('Ultimate Sanctuary version 1. Loading.');
 try{ const r=await fetch('manifest.json'); MAN=await r.json(); }catch(e){ say('Sorry, the list of sounds could not be loaded. Check the internet connection and reload.'); return; }
 const bases=window.US_BASES||{}; MAN.worlds.forEach(w=>{ w.base=bases[w.id]||('packs/'+w.id+'/'); WORLD[w.id]=w; }); MAN.layers.forEach(l=>LAY[l.key]=l);
 S=load(); build(); offerResumeLast();
 $('startBtn').addEventListener('click',()=>{ if(!playing) start(); else say('Already playing. '+roomWords()); });
 $('stopBtn').addEventListener('click',()=>{ if(playing) stop(); else say('Nothing is playing.'); });
 $('resumeBtn').addEventListener('click',resumeNow); $('resumeLastBtn').addEventListener('click',()=>{ const R=readSession(); if(R) resumeFrom(R); else { $('resumeLast').hidden=true; say('Nothing to resume.'); } });
 $('describeBtn').addEventListener('click',()=>say(roomWords()+(timerEnd?' '+$('timerLeft').textContent:'')));
 if('serviceWorker' in navigator&&location.protocol!=='file:'){ try{ await navigator.serviceWorker.register('sw.js'); }catch(e){ console.warn('service worker not registered',e&&e.message); } }
 const n=invitedKeys().length; say('Ultimate Sanctuary version 1. '+(n?n+' doctor'+(n===1?' is':'s are')+' invited. Press Start.':'Choose a preset, or open a world and invite some doctors, then press Start.')); }
window.__us={get S(){return S;},get MAN(){return MAN;},room,get engine(){return engine;},get ctx(){return ctx;},get playing(){return playing;},start,stop,invite,askToLeave,reconcile,applyPreset,BUILTIN,saveWorld,removeWorld,worldCached,loadErrors,RAW,ENS_BUF,
 layerInfo:()=>{ const o={}; for(const [k,d] of room.present) o[k]=Object.assign({loaded:d.loaded,failed:d.failed,pres:+d.strip.pres.gain.value.toFixed(3)},d.player.info()); return o; },waiting:()=>[...room.waitSince.keys()],timerLeft,setTimer,save,refreshAll,turnTaking};
document.addEventListener('DOMContentLoaded',boot);
