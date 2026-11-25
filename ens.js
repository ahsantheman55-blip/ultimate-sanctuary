/* Clock Ensemble engine, ported unchanged from the Night Fire Clock Ensemble (src/ensemble.js lines 1-98). */
/* ---------- Clock Ensemble: audio engine ---------- */
let ENS_FILES = {clocks:{},chimes:{}};
const ENS_RAW={}, ENS_BUF={}, ENS_OFF={}, ENS_DECP={};

function ensNames(){ return Object.keys(ENS_FILES.clocks).map(k=>'clock_'+k).concat(Object.keys(ENS_FILES.chimes).map(k=>'chime_'+k)); }
function ensFile(name){ return name.startsWith('clock_')? ENS_FILES.clocks[name.slice(6)].file : ENS_FILES.chimes[name.slice(6)].file; }
/* MP3 decoders differ in how much start padding they remove, so line the decoded audio up with the tick times measured at build time */
function measureOffset(buf,ticks){ try{ const d=buf.getChannelData(0), sr=buf.sampleRate; const W=Math.round(sr*0.006); let best=0,bs=-1;
  for(let s=-40;s<=90;s++){ const sh=s/1000; let sc=0; for(const t of ticks){ const a=Math.round((t+sh)*sr); if(a<0||a+W>=d.length) continue; for(let i=a;i<a+W;i+=3){ const x=d[i]; sc+=x*x; } } if(sc>bs){ bs=sc; best=sh; } }
  return best; }catch(e){ return 0; } }
function ensDecodeOne(c,name){ if(ENS_BUF[name]) return Promise.resolve(ENS_BUF[name]); if(ENS_DECP[name]) return ENS_DECP[name]; const raw=ENS_RAW[name]; if(!raw) return Promise.resolve(null);
 return ENS_DECP[name]=new Promise(res=>{ let done=false; const fin=b=>{ if(done) return; done=true; delete ENS_DECP[name]; if(b){ ENS_BUF[name]=b; delete ENS_RAW[name]; if(name.startsWith('clock_')) { const m=ENS_FILES.clocks[name.slice(6)]; ENS_OFF[name]=Math.round((measureOffset(b,m.ticks)-(m.bias||0))*1000)/1000; } } res(b||null); };
  try{ const p=c.decodeAudioData(raw.slice(0),b=>fin(b),()=>fin(null)); if(p&&p.catch) p.catch(()=>fin(null)); }catch(e){ fin(null); } }); }
function ensDecode(c){ return Promise.all(ensNames().map(n=>ensDecodeOne(c,n))); }
const SAFETY_CURVE=(()=>{ const n=4097, c=new Float32Array(n); for(let i=0;i<n;i++){ const x=i/(n-1)*2-1, a=Math.abs(x); const y=a<=0.75?a:0.75+0.19*Math.tanh((a-0.75)/0.19); c[i]=Math.sign(x)*Math.min(y,0.93); } return c; })();

class ClockVoice{
 constructor(ens,def){ const c=ens.c; this.ens=ens; this.c=c; this.def=def; this.key=def.key; this.name='clock_'+def.key; this.meta=ENS_FILES.clocks[def.key]||{ticks:[],cuts:[]};
  this.vol=c.createGain(); this.mute=c.createGain(); this.pan=c.createStereoPanner?c.createStereoPanner():null; this.send=c.createGain(); this.send.gain.value=0.35;
  this.vol.connect(this.mute); if(this.pan){ this.mute.connect(this.pan); this.pan.connect(ens.out); } else this.mute.connect(ens.out); this.mute.connect(this.send); this.send.connect(ens.rev);
  this.runs=[]; this.rate=1+(Math.random()*2-1)*0.0015; this.segCount=0; }
 newRun(t0){ const g=this.c.createGain(); g.gain.value=0; g.gain.setValueAtTime(0,t0); g.connect(this.vol); const r={g,start:t0,end:null,nextT:t0,segs:[],prevCut:null}; this.runs.push(r); return r; }
 applyRamp(e){ let r=this.runs[this.runs.length-1];
  if(!r||(r.end!=null&&e.t0>r.end+1.0)){ if(!(e.v1>0)) return; r=this.newRun(e.t0); }
  if(e.v1>0) r.end=null;
  try{ r.g.gain.setValueAtTime(e.v0,e.t0); r.g.gain.linearRampToValueAtTime(e.v1,e.t1); }catch(err){}
  if(!(e.v1>0)) r.end=e.t1; }
 hold(tc,level){ const r=this.runs[this.runs.length-1]; if(!r) return; hold(r.g.gain,tc); if(!(level>0.001)){ r.g.gain.linearRampToValueAtTime(0,tc+0.3); r.end=tc+0.3; } else r.end=null; }
 level(){ return this.ens.cond.levelAt(this.key,this.ens.now()); }
 pickStart(C,T,prev){ const n=C.length; if(n<4) return 0; if(prev==null) return Math.floor(Math.random()*(n-3));
  const i=prev, target=(T[i+1]!=null&&T[i]!=null)?T[i+1]-T[i]:0.5, pre=C[i]-T[i]; const cand=[];
  for(let j=(i%2);j<=n-3;j+=2){ if(j===i) continue; const post=T[j+1]-C[j]; cand.push([Math.abs(pre+post-target),j]); }
  if(!cand.length) return Math.max(0,Math.min(n-3,i%2)); cand.sort((a,b)=>a[0]-b[0]); const top=cand.slice(0,Math.min(6,cand.length)); return top[Math.floor(Math.random()*top.length)][1]; }
 feed(until,now){ const buf=ENS_BUF[this.name]; const C=this.meta.cuts, T=this.meta.ticks; const off=ENS_OFF[this.name]||0;
  for(let ri=0;ri<this.runs.length;ri++){ const r=this.runs[ri];
   if(r.end!=null&&now>r.end+0.5&&!this.ens.render){ r.segs.forEach(s=>{ try{s.stop();}catch(e){} }); const g=r.g; setTimeout(()=>{ try{g.disconnect();}catch(e){} },400); this.runs.splice(ri,1); ri--; continue; }
   if(!buf||C.length<4) continue;
   if(!this.ens.render&&r.nextT<now){ r.nextT=now+0.05; r.prevCut=null; }
   let guard=0;
   while(r.nextT<until&&(r.end==null||r.nextT<r.end)&&guard++<12){
    const j=this.pickStart(C,T,r.prevCut); const maxK=C.length-1; const want=3+Math.random()*13; let k=j+2; while(k+2<=maxK&&C[k]-C[j]<want) k+=2; if(k>maxK) k=j+1<=maxK?j+1:j; if(k<=j) break;
    const rate=this.rate*(1+(Math.random()*2-1)*0.0008); const D=(C[k]-C[j])/rate; const X=0.015; const t=r.nextT;
    let stopAt=t+D+X+0.01; if(r.end!=null) stopAt=Math.min(stopAt,r.end+0.3);
    const src=this.c.createBufferSource(); src.buffer=buf; src.playbackRate.value=rate; const sg=this.c.createGain(); const lv=Math.pow(10,(Math.random()*2-1)*0.6/20);
    src.connect(sg); sg.connect(r.g); sg.gain.setValueAtTime(0,t); sg.gain.linearRampToValueAtTime(lv,t+X); sg.gain.setValueAtTime(lv,t+D); sg.gain.linearRampToValueAtTime(0,t+D+X);
    try{ src.start(t,Math.max(0,C[j]+off),Math.max(0.05,(stopAt-t)*rate)); src.stop(stopAt+0.02); }catch(e){}
    r.segs.push(src); src.onended=()=>{ const q=r.segs.indexOf(src); if(q>=0) r.segs.splice(q,1); try{ sg.disconnect(); }catch(e){} };
    r.nextT=t+D; r.prevCut=k; this.segCount++; }
  } }
 stopAll(at){ this.runs.forEach(r=>{ r.segs.forEach(s=>{ try{s.stop(at);}catch(e){} }); }); }
}
class ClockEnsemble{
 constructor(eng){ this.e=eng; const c=this.c=eng.ctx; this.render=eng.render;
  this.out=c.createGain(); this.out.gain.value=0; this.out.connect(eng.clockIn);
  this.rev=c.createConvolver(); this.rev.buffer=makeIR(c,2.4); this.revG=c.createGain(); this.revG.gain.value=0.3; this.rev.connect(this.revG); this.revG.connect(this.out);
  this.chimeG=c.createGain(); this.chimeG.connect(this.out); const cs=c.createGain(); cs.gain.value=0.4; this.chimeG.connect(cs); cs.connect(this.rev);
  this.voices={}; for(const d of CLOCK_DEFS) this.voices[d.key]=new ClockVoice(this,d);
  this.cond=new Conductor(CLOCK_DEFS,{params:()=>S.ens}); this.chime={state:{},next:null,busyUntil:0,log:[],sounding:null}; this.running=false; this.wasOn=null; this.lastLead=null; this.lastAnn=0; this.passLog=[]; }
 now(){ return this.render?0:this.c.currentTime; }
 start(t){ this.cond.reset(t+0.3); this.running=true; this.wasOn=S.ens.on; this.update(true); if(!this.render) ensDecode(this.c); }
 enabled(){ return new Set(this.cond.enabled(S.ens)); }
 update(init){ const E=S.ens, e=this.e; const en=this.enabled(); const devScale=S.device==='phone'?0.6:1;
  e.set(this.out.gain,E.on?g2(E.master,1.1):0,init); e.set(this.revG.gain,g2(E.room,1.0),init); e.set(this.chimeG.gain,g2(E.chimeVol,0.9),init);
  e.set(e.duck.gain,E.on?1-0.6*E.centre/100:1,init);
  for(const d of CLOCK_DEFS){ const v=this.voices[d.key], cl=E.clocks[d.key]; e.set(v.vol.gain,g2(cl.vol,1.0)*d.base,init); e.set(v.mute.gain,en.has(d.key)?1:0,init); if(v.pan) e.set(v.pan.pan,Math.max(-1,Math.min(1,d.pan*(E.width/100)*devScale)),init); } }
 interrupt(tc){ for(const d of CLOCK_DEFS){ const k=d.key; this.voices[k].hold(tc,this.cond.levelAt(k,tc)); } this.cond.truncate(tc); }
 replanSoon(){ if(!this.running||this.render) return; const tc=this.c.currentTime+0.3; this.interrupt(tc); this.update(); this.schedule(this.c.currentTime+10); }
 speakNext(k){ if(!this.running) return false; const tc=this.c.currentTime+0.3; this.interrupt(tc); this.cond.speakNext(k,tc); this.schedule(this.c.currentTime+10); return true; }
 schedule(until){ if(!this.running) return; const E=S.ens, now=this.now();
  if(!E.on){ if(this.wasOn!==false){ this.interrupt(now+0.05); for(const d of CLOCK_DEFS) if(this.cond.audible(d.key)) this.cond.ramp(d.key,now+0.05,now+1.5,0); this.cond.t=now+1.5; for(const ev of this.cond.takeEvents()) this.voices[ev.key].applyRamp(ev); } this.wasOn=false; for(const k in this.voices) this.voices[k].feed(until,now); return; }
  if(this.wasOn===false){ this.cond.truncate(now); this.cond.t=now+0.3; } this.wasOn=true;
  if(this.cond.t<now-1) this.cond.truncate(now);
  if(!this.render && ensNames().some(n=>ENS_RAW[n]&&!ENS_BUF[n])) ensDecode(this.c);
  this.cond.plan(until+2);
  for(const ev of this.cond.takeEvents()) this.voices[ev.key].applyRamp(ev);
  for(const k in this.voices) this.voices[k].feed(until,now);
  if(!this.render){ this.schedChimes(until,now); this.announce(now); } }
 announce(now){ const p=this.cond.current(now); if(!p) return; if(this.passLog[this.passLog.length-1]!==p){ this.passLog.push(p); if(this.passLog.length>20) this.passLog.shift(); }
  if(!S.ens.announce||p.lead===this.lastLead||Date.now()-this.lastAnn<20000) return; this.lastLead=p.lead; this.lastAnn=Date.now(); const nm=CLOCK_DEFS.find(d=>d.key===p.lead); if(nm) say(p.type==='assert'?nm.name+' steps forward.':p.type==='ens'?'An ensemble passage, led by '+nm.name+'.':p.type==='duet'?nm.name+' begins a duet.':nm.name+' speaks.'); }
 schedChimes(until,now){ const E=S.ens; if(E.chimes==='off'||!E.on) return; const ms=Date.now(), q=900000; const nb=Math.ceil((ms+50)/q)*q; const lead=(nb-ms)/1000;
  if(lead<=12&&this.chime.next!==nb){ this.chime.next=nb; const d=new Date(nb); const kind=chimeKindFor(d.getMinutes(),E.chimes); if(kind) this.ring(kind,d.getHours(),now+lead); } }
 ring(kind,hour,t){ const acts=planChime(kind,hour,S.ens,this.chime.state); let busy=Math.max(this.chime.busyUntil,0); const out=[];
  for(const a of acts){ const start= a.delay==='after'? Math.max(t,busy+(a.gap||10)) : Math.max(t,busy+0.3); this.playChime(a.clock,a.voice,a.strikes,start); busy=start+chimeLength(a.voice,a.strikes); out.push(Object.assign({start},a)); }
  this.chime.busyUntil=busy; this.chime.log.push({kind,hour,acts:out}); if(this.chime.log.length>30) this.chime.log.shift(); return out; }
 playChime(clock,voice,strikes,start){ const v=CHIME_VOICES[voice]; if(!v) return; const c=this.c, d=CLOCK_DEFS.find(x=>x.key===clock); const devScale=S.device==='phone'?0.6:1;
  const pn=c.createStereoPanner?c.createStereoPanner():null; const g=c.createGain(); g.gain.value=1; if(pn){ pn.pan.value=Math.max(-1,Math.min(1,(d?d.pan:0)*(S.ens.width/100)*devScale)); g.connect(pn); pn.connect(this.chimeG); } else g.connect(this.chimeG);
  const srcs=[]; const play=(name,at,rate,gain)=>{ const b=ENS_BUF['chime_'+name]; if(!b) return 0; const s=c.createBufferSource(); s.buffer=b; s.playbackRate.value=rate; const sg=c.createGain(); sg.gain.value=gain; s.connect(sg); sg.connect(g); s.start(at); srcs.push(s); s.onended=()=>{ try{sg.disconnect();}catch(e){} }; return b.duration/rate; };
  let t=start, end=start;
  if(v.intro){ end=Math.max(end,t+play(v.intro,t,1,0.9)); t+=v.introLen; }
  const n=v.one?1:Math.max(1,strikes||1);
  for(let i=0;i<n;i++){ const at=t+i*v.gap+(i?(Math.random()*2-1)*0.04:0); end=Math.max(end,at+play(v.sample,at,v.rate*(1+(Math.random()*2-1)*0.002),Math.pow(10,(Math.random()*2-1)*1.2/20))); }
  this.chime.sounding={clock,voice,start,end,strikes:n}; setTimeout(()=>{ try{ g.disconnect(); if(pn) pn.disconnect(); }catch(e){} },Math.max(0,(end-c.currentTime)*1000)+2000); return {start,end}; }
 chimeNow(){ const d=new Date(); return this.ring('h',d.getHours(),this.c.currentTime+0.2); }
 describe(){ const now=this.now(); if(!S.ens.on) return 'The Clock Ensemble is switched off.'; let s=this.cond.describe(now); const ch=this.chime.sounding; if(ch&&now>=ch.start-0.2&&now<=ch.end){ const nm=CLOCK_DEFS.find(x=>x.key===ch.clock); s+=' '+(nm?nm.name:'A clock')+' is chiming'+(ch.strikes>1?', '+ch.strikes+' strikes':'')+'.'; } return s; }
 stopAll(fade){ const at=this.c.currentTime+fade+0.1; for(const k in this.voices) this.voices[k].stopAll(at); this.running=false; }
}
const ENS_PRESETS=[
 {id:'magisterial',name:'Magisterial Night',desc:'The two magisterial grandfather clocks lead, slow and deep, with long gentle swells. Small clocks only visit. Hourly strikes.',
  ens:{live:30,soloFreq:65,density:40,room:35,centre:30,chimes:'hours',master:72,clocks:{ceremonious:{pres:230},greatpendulum:{pres:230},longcase:{pres:120},norman:{pres:95},escapement:{pres:60},wallclock:{pres:55},staccato:{pres:45},mantel:{pres:45},travel:{pres:20},cuckoo:{pres:35}}},
  sugg:{text:'Suggested with it: theta 5 hertz binaural beat on a 90 hertz carrier at 30 percent, fire 60 percent, crickets 25, cicadas 15, wind 30, and one deep recorded bowl about every 90 seconds.',s:{mode:'binaural',toneVol:30,bin:[{beat:5,carrier:90,drift:30}],bowlL:[{type:'recorded',pitch:87,every:90,vol:60}],bowlVol:35,nat:{fire:60,crickets:25,cicadas:15,wind:30}}}},
 {id:'study',name:'Quiet Study',desc:'Calm and sparse: mostly duets and short solos, very few swells, the crisp Staccato and the Mantel clock a little more present. No chimes.',
  ens:{live:25,soloFreq:15,density:25,room:20,centre:20,chimes:'off',master:60,clocks:{ceremonious:{pres:150},greatpendulum:{pres:150},longcase:{pres:120},norman:{pres:90},escapement:{pres:80},wallclock:{pres:80},staccato:{pres:95},mantel:{pres:90},travel:{pres:25},cuckoo:{pres:40}}},
  sugg:{text:'Suggested with it: isochronic alpha 10 hertz on a 180 hertz carrier at 25 percent (works on speakers), fire 40 percent, crickets 15, wind 20, a little pink noise, bowls off.',s:{mode:'isochronic',toneVol:25,iso:[{beat:10,carrier:180,drift:15,soft:75}],bowlVol:0,bowlL:[{on:false}],noiseType:'pink',noiseVol:8,nat:{fire:40,crickets:15,cicadas:10,wind:20}}}},
 {id:'grandhall',name:'Grand Hall',desc:'All ten clocks at their natural presence in a large, resonant room, with big ensemble passages, wide stereo and the quarter chimes.',
  ens:{live:55,soloFreq:45,density:85,room:70,width:100,centre:30,chimes:'quarters',master:72,clocks:{}},
  sugg:{text:'Suggested with it: theta 6 hertz binaural at 25 percent, solfeggio 396 and 528 hertz placed left and right, an occasional gong, and the fire at 50 percent.',s:{mode:'binaural',toneVol:25,bin:[{beat:6,carrier:136.1,drift:35}],solfL:[{freq:396,vol:40,swell:40,pan:-50},{freq:528,vol:35,swell:45,pan:50}],solfVol:28,gongVol:20,gongEvery:120,nat:{fire:50,crickets:25,cicadas:20,wind:25}}}},
 {id:'shop',name:"Lively Clockmaker's Shop",desc:'A busy, cheerful workshop: quick turns, lots of small clocks chatting, the Cuckoo and the Travel Alarm far more present, quarter chimes.',
  ens:{live:90,soloFreq:30,density:75,room:25,centre:25,chimes:'quarters',master:70,clocks:{ceremonious:{pres:140},greatpendulum:{pres:130},longcase:{pres:110},norman:{pres:95},escapement:{pres:110},wallclock:{pres:110},staccato:{pres:100},mantel:{pres:115},travel:{pres:90},cuckoo:{pres:110}}},
  sugg:{text:'Suggested with it: isochronic alpha 10 hertz at 20 percent, fire 50 percent with lively nature conversation, crickets 30.',s:{mode:'isochronic',toneVol:20,iso:[{beat:10,carrier:220,drift:20,soft:70}],natDrift:70,nat:{fire:50,crickets:30,cicadas:20,wind:20}}}},
 {id:'duet',name:'Fireside Duet',desc:"The Old Longcase and Grandpa's Norman Clock talk quietly by the fire, mostly as a duet, with the others rarely heard. Hourly strikes.",
  ens:{live:35,soloFreq:25,density:10,room:30,centre:20,chimes:'hours',master:68,clocks:{ceremonious:{pres:45},greatpendulum:{pres:45},longcase:{pres:220},norman:{pres:220},escapement:{pres:25},wallclock:{pres:25},staccato:{pres:20},mantel:{pres:30},travel:{pres:5},cuckoo:{pres:15}}},
  sugg:{text:'Suggested with it: fire 75 percent, crickets 25, cicadas 15, wind 25, theta 5 hertz binaural at 30 percent, and a recorded bowl about every 75 seconds.',s:{mode:'binaural',toneVol:30,bin:[{beat:5,carrier:90,drift:30}],bowlL:[{type:'recorded',pitch:87,every:75,vol:65}],bowlVol:40,nat:{fire:75,crickets:25,cicadas:15,wind:25}}}},
 {id:'meditation',name:'Deep Meditation',desc:'Very slow and still. The magisterial clocks breathe in long passages, the fast ticker is muted, small clocks almost silent, no chimes, clocks a little quieter.',
  ens:{live:8,soloFreq:20,density:20,room:45,centre:40,chimes:'off',master:55,clocks:{ceremonious:{pres:220},greatpendulum:{pres:220},longcase:{pres:110},norman:{pres:90},escapement:{pres:40},wallclock:{pres:30},staccato:{pres:20},mantel:{pres:20},travel:{pres:0,mute:true},cuckoo:{pres:10}}},
  sugg:{text:'Suggested with it: delta 3 hertz binaural on a 65 hertz carrier at 30 percent, a soft 174 hertz solfeggio swell, a quiet didgeridoo drone, a little brown noise, fire 55 and crickets 15.',s:{mode:'binaural',toneVol:30,bin:[{beat:3,carrier:65,drift:35}],solfL:[{freq:174,vol:45,swell:40,swellSecs:30}],solfVol:25,didgVol:25,noiseType:'brown',noiseVol:8,nat:{fire:55,crickets:15,cicadas:10,wind:30}}}},
];
