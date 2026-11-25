/* Clock Ensemble conductor: pure logic, no Web Audio. Shared by the app and the Node tests.
   It plans "passages" (ensemble, duet, solo, assert) and emits per-clock level ramps.
   Weighted, stateful turn-taking: airtime deficits against each clock's presence target,
   memory of recent speakers, reprises, answering partners, and hard rules (no cacophony,
   a solo is capped at two minutes, and after a solo the next turn never goes to two small clocks). */
'use strict';
const CLOCK_DEFS=[
 {key:'ceremonious', name:'The Ceremonious Grandfather', size:'grand', magisterial:true, pres:200, vol:80, base:1.0, pan:-0.35,
  kind:'Grandfather (longcase) clock', chime:{hour:'deep',half:'deep1'},
  personality:'Magisterial. Slow, ceremonious ticking with the deepest, darkest voice in the room. Speaks often and with authority, and loves to have the last word. Strikes the hour with deep, slow strokes when it is his turn.',
  credit:{title:'20060810.peters.clock.01.flac',author:'dobroide',url:'https://freesound.org/people/dobroide/sounds/21934/',license:'CC BY 4.0',licUrl:'https://creativecommons.org/licenses/by/4.0/',note:'"slow, ceremonious ticking of Peter\'s grandfather clock"'}},
 {key:'greatpendulum', name:'The Great Slow Pendulum', size:'grand', magisterial:true, pres:200, vol:80, base:1.0, pan:0.4,
  kind:'Large pendulum clock', chime:{hour:'deepest',half:'deepest1'},
  personality:'Magisterial. The slowest tick of all, about one beat every 1.1 seconds, unhurried and wise. Often steps forward with a gentle swell and holds the floor for a minute or two while the others listen softly.',
  credit:{title:'pendulum slow ticking.wav',author:'klankbeeld',url:'https://freesound.org/people/klankbeeld/sounds/253202/',license:'CC BY 4.0',licUrl:'https://creativecommons.org/licenses/by/4.0/',note:'a large, slow pendulum clock in "my old daddy\'s room"'}},
 {key:'longcase', name:'The Old Longcase', size:'grand', pres:115, vol:75, base:0.9, pan:-0.05,
  kind:'19th-century longcase clock', chime:{hour:'westminster',half:'strike1',quarter:'westminster_quarter'},
  personality:'The elder statesman. Clear, steady, exactly one tick a second, and keeps everyone in time. Plays the Westminster chime before striking the hour, and the quarter chime when quarters are on.',
  credit:{title:'Ticking Grandfather Clock',author:'nightcustard',url:'https://freesound.org/people/nightcustard/sounds/620573/',license:'CC BY 4.0',licUrl:'https://creativecommons.org/licenses/by/4.0/',note:'a 19th-century longcase clock, close miked'}},
 {key:'norman', name:"Grandpa's Norman Clock", size:'grand', pres:95, vol:75, base:0.95, pan:0.7,
  kind:'1940s Norman wooden longcase clock', chime:null,
  personality:'The warm storyteller. A big wooden clock from Normandy with a round, homely tick. Loves a duet with the Old Longcase, and often answers the magisterial clocks.',
  credit:{title:"240519_2743_FR_Grandpa's_clock_ticking",author:'kevp888',url:'https://freesound.org/people/kevp888/sounds/737600/',license:'CC BY 4.0',licUrl:'https://creativecommons.org/licenses/by/4.0/',note:'a 1940s Norman wooden clock cared for by the recordist\'s grandfather'}},
 {key:'escapement', name:"The Clockmaker's Escapement", size:'medium', pres:80, vol:70, base:0.8, pan:-0.7,
  kind:'Large clock, escapement close up', chime:null,
  personality:'The thoughtful mechanic. A large clock heard right at its escapement, so you can hear the gears think between ticks. Fills the pauses in a conversation and rarely interrupts.',
  credit:{title:'Ticking Clock with Escapement Slow.wav',author:'Rollo145',url:'https://freesound.org/people/Rollo145/sounds/256476/',license:'CC BY 3.0',licUrl:'https://creativecommons.org/licenses/by/3.0/',note:'"large clock with escapement, slow"'}},
 {key:'wallclock', name:'The German Wall Clock', size:'medium', pres:75, vol:70, base:0.85, pan:0.85,
  kind:'German Fauch wall clock', chime:{hour:'bell_bright',half:'bell_bright1'},
  personality:'The courteous neighbour. A brisk half-second tick-tock, quick to agree and keep a conversation going. Sometimes strikes the hour on a bright bell when it is its turn.',
  credit:{title:'German Clock Tic-Toc.wav',author:'canoeCG',url:'https://freesound.org/people/canoeCG/sounds/453159/',license:'CC0 1.0',licUrl:'https://creativecommons.org/publicdomain/zero/1.0/',note:'a German-made Fauch wall clock in a quiet room'}},
 {key:'staccato', name:'The Staccato Wall Clock', size:'medium', pres:67.5, vol:70, base:0.85, pan:0.2,
  kind:'Wall clock, recorded from behind', chime:null,
  personality:'Crisp and precise: exactly one short, dry tick a second. Tone-matched so it sits at the same middle pitch as the rest of the ensemble, just sharper at the edges. Makes its point briefly, then lets others speak.',
  credit:{title:'Wall Clock Ticking',author:'michaelkoehler',url:'https://freesound.org/people/michaelkoehler/sounds/268810/',license:'CC BY 4.0',licUrl:'https://creativecommons.org/licenses/by/4.0/',note:'recorded at the rear, near the mechanism'}},
 {key:'mantel', name:'The Seth Thomas Mantel Clock', size:'small', pres:70, vol:70, base:0.85, pan:-0.5,
  kind:'Seth Thomas mantel clock', chime:{hour:'bell',half:'bell1'},
  personality:'The gentle gossip. A small, quick, friendly tick that chats happily with the Wall Clock and the Cuckoo. Strikes the hour on a mellow bell when it is its turn.',
  credit:{title:'antique clock tick 2.wav',author:'keweldog',url:'https://freesound.org/people/keweldog/sounds/223131/',license:'CC0 1.0',licUrl:'https://creativecommons.org/publicdomain/zero/1.0/',note:'"my grandfather\'s antique Seth Thomas mantle clock"'}},
 {key:'travel', name:'The Little Travel Alarm', size:'small', pres:35, vol:60, base:0.6, pan:0.55,
  kind:'Mid-century wind-up travel alarm clock', chime:null,
  personality:'The fast ticker: five tiny ticks a second, busy and a little excitable. Pops in briefly, is shy around the grand clocks, and never takes over.',
  credit:{title:'ticking watch clock midcentury travel alarm.wav',author:'tenkism',url:'https://freesound.org/people/tenkism/sounds/508859/',license:'CC0 1.0',licUrl:'https://creativecommons.org/publicdomain/zero/1.0/',note:'a mid-century Phinney-Walker wind-up alarm clock'}},
 {key:'cuckoo', name:'The Black Forest Cuckoo', size:'small', pres:62.5, vol:65, base:0.8, pan:-0.85,
  kind:'Small Black Forest cuckoo clock', chime:{hour:'cuckoo',half:'cuckoo1'},
  personality:'Playful and light, with a slightly rustic tick. When it is its turn, its cuckoo calls the hours, and once on the half hour.',
  credit:{title:'Kukuklok tikken.wav',author:'HerbertBoland',url:'https://freesound.org/people/HerbertBoland/sounds/28115/',license:'CC BY 4.0',licUrl:'https://creativecommons.org/licenses/by/4.0/',note:'a small Black Forest cuckoo clock ticking'}},
];
const CHIME_CREDITS=[
 {use:'Westminster hour chime and the strike used for the grandfather clocks (slowed down for the two magisterial clocks)',title:'4_gustav_becker_westminster_hour.wav',author:'claudius9uk',url:'https://freesound.org/people/claudius9uk/sounds/96717/',license:'CC0 1.0',licUrl:'https://creativecommons.org/publicdomain/zero/1.0/'},
 {use:'Westminster quarter chime',title:'Quarter-hour Westminster chimes',author:'nightcustard',url:'https://freesound.org/people/nightcustard/sounds/620591/',license:'CC BY 4.0',licUrl:'https://creativecommons.org/licenses/by/4.0/'},
 {use:'Bell strike for the mantel clock and the wall clock (raised in pitch for the wall clock)',title:'Antique fireplace clock bell one strike',author:'Kinoton',url:'https://freesound.org/people/Kinoton/sounds/347139/',license:'CC0 1.0',licUrl:'https://creativecommons.org/publicdomain/zero/1.0/'},
 {use:'Cuckoo call',title:'Cuckoo Clock, Single, A.wav',author:'InspectorJ',url:'https://freesound.org/people/InspectorJ/sounds/398194/',license:'CC BY 4.0',licUrl:'https://creativecommons.org/licenses/by/4.0/'},
];
/* chime voices: sample, playback rate, gap between strikes (seconds) */
const CHIME_VOICES={
 deep:{sample:'becker_strike',rate:0.84,gap:2.8}, deepest:{sample:'becker_strike',rate:0.75,gap:3.3},
 westminster:{intro:'westminster_hour',introLen:13.3,sample:'becker_strike',rate:1,gap:2.3},
 strike1:{sample:'becker_strike',rate:1,gap:2.3,one:true}, deep1:{sample:'becker_strike',rate:0.84,gap:2.8,one:true}, deepest1:{sample:'becker_strike',rate:0.75,gap:3.3,one:true},
 bell:{sample:'hermle_bell',rate:1,gap:2.1}, bell1:{sample:'hermle_bell',rate:1,gap:2.1,one:true},
 bell_bright:{sample:'hermle_bell',rate:1.26,gap:1.7}, bell_bright1:{sample:'hermle_bell',rate:1.26,gap:1.7,one:true},
 cuckoo:{sample:'cuckoo_call',rate:1,gap:1.35}, cuckoo1:{sample:'cuckoo_call',rate:1,gap:1.35,one:true},
 westminster_quarter:{sample:'westminster_quarter',rate:1,gap:0,one:true,len:16},
};
const ENS_DEFAULTS={on:true,master:70,live:50,soloFreq:40,density:50,width:80,room:30,centre:25,chimes:'hours',chimeVol:50,strikeCount:true,answer:true,announce:false,preset:'',clocks:{}};
function ensClockDefaults(){ const o={}; CLOCK_DEFS.forEach(d=>o[d.key]={vol:d.vol,pres:d.pres,mute:false,solo:false}); return o; }
function normEns(o){ o=o&&typeof o==='object'?o:{}; const s=Object.assign(JSON.parse(JSON.stringify(ENS_DEFAULTS)),o); const cd=ensClockDefaults(); s.clocks={};
 for(const k in cd){ const c=Object.assign({},cd[k],(o.clocks||{})[k]||{}); c.vol=clamp(+c.vol||0,0,100); c.pres=clamp(isFinite(+c.pres)?+c.pres:cd[k].pres,0,300); c.mute=!!c.mute; c.solo=!!c.solo; s.clocks[k]=c; }
 ['master','live','soloFreq','density','width','room','centre','chimeVol'].forEach(k=>{ s[k]=clamp(isFinite(+s[k])?+s[k]:ENS_DEFAULTS[k],0,100); });
 if(!['off','hours','halves','quarters'].includes(s.chimes)) s.chimes='hours'; s.on=s.on!==false; return s; }
function clamp(v,a,b){ return Math.min(b,Math.max(a,v)); }
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }

const FG=0.3, MAX_AUDIBLE=6, SOLO_CAP=120, SWELL=1.6, BG_MAX=0.2;
const TYPE_WORDS={ens:'an ensemble passage',duet:'a duet',solo:'a solo',assert:'a solo with a gentle swell',peer:'a reply',rest:'a pause'};

class Conductor{
 constructor(defs,opts){ opts=opts||{}; this.defs=defs; this.by={}; defs.forEach(d=>this.by[d.key]=d); this.rng=opts.rng||Math.random; this.getP=opts.params||(()=>normEns({})); this.keepHist=opts.keepHist||40; this.reset(opts.t0||0); }
 reset(t){ this.t=t; this.ev=[]; this.out=[]; this.lv={}; this.ramps={}; this.air={}; this.hist=[]; this.forced=null; this.airBase={};
  for(const d of this.defs){ this.lv[d.key]={v:0,t:t}; this.ramps[d.key]=[]; this.air[d.key]=0; this.airBase[d.key]=0; } }
 r(a,b){ return a+this.rng()*(b-a); }
 pick(items,w){ let s=0; for(const x of w) s+=Math.max(0,x); if(!(s>0)) return null; let u=this.rng()*s; for(let i=0;i<items.length;i++){ u-=Math.max(0,w[i]); if(u<=0) return items[i]; } return items[items.length-1]; }
 params(){ return this.getP(); }
 enabled(P){ const c=P.clocks||{}; const solo=this.defs.filter(d=>c[d.key]&&c[d.key].solo&&!c[d.key].mute); const base=solo.length?solo:this.defs.filter(d=>!(c[d.key]&&c[d.key].mute));
  return base.filter(d=>{ const x=c[d.key]; return !x || (x.pres>0); }).map(d=>d.key); }
 presOf(P,k){ const c=(P.clocks||{})[k]; return c? c.pres : this.by[k].pres; }
 /* ---- level bookkeeping ---- */
 levelAt(k,t){ const R=this.ramps[k]; let v=0; for(let i=R.length-1;i>=0;i--){ const r=R[i]; if(r.t0<=t){ if(t>=r.t1) return r.v1; return r.v0+(r.v1-r.v0)*(t-r.t0)/Math.max(1e-6,r.t1-r.t0); } } return v; }
 ramp(k,t0,t1,v){ const L=this.lv[k]; if(t0<L.t) t0=L.t; if(t1<t0+0.05) t1=t0+0.05; const v0=L.v; if(Math.abs(v-v0)<1e-4 && v0===0) { return; }
  // airtime: hold segment, then the ramp segment
  if(v0>=FG) this.air[k]+=t0-L.t;
  const d=t1-t0; if(v0>=FG&&v>=FG) this.air[k]+=d; else if(v0>=FG||v>=FG){ const f=(FG-v0)/(v-v0); const tx=d*clamp(f,0,1); this.air[k]+= v>=FG? d-tx : tx; }
  const e={key:k,t0:+t0.toFixed(4),t1:+t1.toFixed(4),v0:+v0.toFixed(4),v1:+v.toFixed(4)};
  this.ramps[k].push(e); if(this.ramps[k].length>400){ const R=this.ramps[k], cut=R.splice(0,100); this.airBase[k]=(this.airBase[k]||0)+this.rampsAir(cut,R[0].t0); }
  this.out.push(e); L.v=v; L.t=t1; }
 /* air for clock k up to time t (including a hold at the last level) */
 airTo(k,t){ const L=this.lv[k]; return this.air[k]+(L.v>=FG?Math.max(0,t-L.t):0); }
 audible(k){ return this.lv[k].v>0.001; }
 takeEvents(){ const o=this.out; this.out=[]; return o; }
 /* drop everything planned after time tc (used for mute, solo, presets and "speak next") */
 truncate(tc){ for(const d of this.defs){ const k=d.key; const v=this.levelAt(k,tc); let keep=this.ramps[k].filter(r=>r.t0<tc);
   const last=keep[keep.length-1]; if(last&&last.t1>tc) keep[keep.length-1]=Object.assign({},last,{t1:tc,v1:+v.toFixed(4)});
   this.ramps[k]=keep; this.lv[k]={v:+v.toFixed(4),t:keep.length?Math.max(tc,0):tc}; this.air[k]=(this.airBase[k]||0)+this.rampsAir(keep,tc); }
  this.out=[]; this.t=tc; this.forced=null; const h=this.hist[this.hist.length-1]; if(h&&h.T+h.L>tc) h.L=Math.max(0,tc-h.T); }
 segAir(r){ const d=r.t1-r.t0; if(r.v0>=FG&&r.v1>=FG) return d; if(r.v0<FG&&r.v1<FG) return 0; const f=clamp((FG-r.v0)/(r.v1-r.v0),0,1); return r.v1>=FG? d*(1-f) : d*f; }
 rampsAir(R,endT){ let s=0; for(let i=0;i<R.length;i++){ const r=R[i]; s+=this.segAir(r); const nt=i+1<R.length?R[i+1].t0:endT; if(r.v1>=FG&&nt!=null) s+=Math.max(0,nt-r.t1); } return s; }
 /* ---- planning ---- */
 plan(until){ let g=0; while(this.t<until && g++<2000) this.nextPassage(); }
 speakNext(k,tc){ this.truncate(tc); this.forced=k; }
 deficit(P,en,k,T){ let sw=0; en.forEach(x=>sw+=this.presOf(P,x)); let tot=0; en.forEach(x=>tot+=this.airTo(x,T)); if(tot<1) return 0; return this.presOf(P,k)/sw*tot-this.airTo(k,T); }
 score(P,en,k,T,role){ const w=this.presOf(P,k)/100; if(!(w>0)) return 0; let s=w*Math.exp(clamp(this.deficit(P,en,k,T)/35,-4,4));
  const h=this.hist; const last=h[h.length-1], prev2=h[h.length-2];
  if(last&&last.lead===k) s*= role==='lead'?0.05:0.6;
  if(prev2&&prev2.lead===k&&role==='lead') s*=0.5;
  if(role==='lead' && last && last.type==='assert' && last.lead===k) s=0;
  return s; }
 sc(P){ return 1.6-1.1*(P.live/100); }
 cap(P){ return Math.max(2,Math.min(MAX_AUDIBLE,2+Math.round(P.density/100*4))); }
 pickType(P,en){ const n=en.length, last=this.hist[this.hist.length-1]; const sf=P.soloFreq/100*2, dn=P.density/100, cap=this.cap(P);
  if(this.forced) return this.rng()<0.35*sf+0.15?'assert':'solo';
  if(!last) return n>=3&&cap>=3?'ens':(n>=2?'duet':'solo');
  if(n===1) return last.type==='assert'?'solo':(this.rng()<0.3*sf?'assert':'solo');
  let w;
  switch(last.type){
   case 'ens': w={duet:.45,solo:.25,assert:.25*sf,ens:.08}; break;
   case 'duet': w={solo:.3,ens:.35,duet:.15,assert:.2*sf}; break;
   case 'solo': w={duet:.35,ens:.4,solo:.08,assert:.17*sf}; break;
   case 'assert': w={ens:.65,peer:.35}; break;
   default: w={ens:.5,duet:.3,solo:.2};
  }
  if(w.ens!=null) w.ens*=(0.35+1.3*dn);
  if(w.duet!=null) w.duet*=(1.25-0.5*dn);
  if(n<3||cap<3){ if(last.type==='assert'){ w={peer:1}; } else w.ens=0; }
  const types=Object.keys(w); return this.pick(types,types.map(t=>w[t]))||'solo'; }
 nextPassage(){
  const P=this.params(), en=this.enabled(P), T=this.t, sc=this.sc(P), cap=this.cap(P);
  if(!en.length){ for(const d of this.defs) if(this.audible(d.key)) this.ramp(d.key,T,T+2,0); const L=5; this.hist.push({type:'rest',T,L,lead:null,members:[]}); this.t=T+L; this.trim(); return this.hist[this.hist.length-1]; }
  let type=this.pickType(P,en); const last=this.hist[this.hist.length-1];
  const afterAssert=last&&last.type==='assert';
  let members=[], lead=null, reprise=[];
  const cont=en.filter(k=>this.audible(k)&&this.levelAt(k,T)>=FG*0.5);
  const sizeOf=k=>this.by[k].size;
  const weighted=(cands,role,extra)=>{ const w=cands.map(k=>this.score(P,en,k,T,role)*(extra?extra(k):1)); return this.pick(cands,w); };
  const repriseBoost=k=>{ const h=this.hist; const inLast=last&&last.members.includes(k); const inOld=h.slice(-4,-1).some(p=>p.members.includes(k)); return (!inLast&&inOld&&this.rng()<0.5)?2.2:1; };
  if(type==='peer'){ const s=sizeOf(last.lead); let cands=en.filter(k=>k!==last.lead&&sizeOf(k)===s); if(!cands.length) cands=en.filter(k=>k!==last.lead&&sizeOf(k)!=='small'); if(!cands.length){ type= en.length>=3&&cap>=3?'ens':'solo'; } else { const l=weighted(cands,'lead'); type=(s!=='small'&&cands.length>1&&this.rng()<0.5)?'duet':'solo'; lead=l; members=[l]; if(type==='duet'){ const c2=cands.filter(k=>k!==l); const b=weighted(c2,'voice'); if(b) members.push(b); else type='solo'; } } }
  if(type==='solo'||type==='assert'){
   if(!lead){ let cands=en.filter(k=>!(afterAssert&&k===last.lead)); if(afterAssert) cands=cands.filter(k=>sizeOf(k)===sizeOf(last.lead)); if(!cands.length) cands=en.filter(k=>!(last&&k===last.lead)); if(!cands.length) cands=en.slice();
    if(this.forced&&en.includes(this.forced)) lead=this.forced; else lead=weighted(cands,'lead',k=>type==='assert'?Math.pow(this.presOf(P,k)/100,1.2):1); members=[lead]; }
  }
  if(type==='duet'&&!members.length){ let cands=en.slice(); const l=weighted(cands.filter(k=>!(last&&k===last.lead))||cands,'lead',k=>cont.includes(k)?1.6:1)||weighted(cands,'lead'); lead=l;
   const aff=k=>{ const a=sizeOf(l),b=sizeOf(k); return a===b?1.4:(a==='small'||b==='small')&&(a==='grand'||b==='grand')?0.75:1.0; };
   let c2=cands.filter(k=>k!==l); if(afterAssert&&sizeOf(l)==='small') c2=c2.filter(k=>sizeOf(k)!=='small');
   const b=weighted(c2,'voice',k=>aff(k)*repriseBoost(k)); members=b?[l,b]:[l]; if(!b) type='solo'; }
  if(type==='ens'){ const m=Math.min(en.length,3+Math.floor(this.rng()*(cap-2))); let pool=en.slice();
   // continuity: at least one clock carries over from what is already sounding
   const carry=cont.filter(k=>pool.includes(k)); if(carry.length){ const c=weighted(carry,'voice'); if(c){ members.push(c); pool=pool.filter(k=>k!==c); } }
   while(members.length<m&&pool.length){ const k=weighted(pool,'voice',repriseBoost); if(!k) break; members.push(k); pool=pool.filter(x=>x!==k); }
   if(afterAssert){ // flow back into the ensemble: at least two clocks that are not small
    let ns=members.filter(k=>sizeOf(k)!=='small').length; const big=en.filter(k=>sizeOf(k)!=='small'&&!members.includes(k));
    while(ns<2&&big.length){ const k=weighted(big,'voice')||big[0]; const si=members.findIndex(x=>sizeOf(x)==='small'); if(si>=0) members[si]=k; else members.push(k); big.splice(big.indexOf(k),1); ns++; } }
   lead=members.slice().sort((a,b)=>this.presOf(P,b)-this.presOf(P,a))[0]; if(members.length<3) type=members.length===2?'duet':'solo'; }
  this.forced=null;
  members=[...new Set(members.filter(Boolean))]; if(!members.length){ members=[en[0]]; lead=en[0]; type='solo'; }
  if(!lead) lead=members[0];
  const h=this.hist; members.forEach(k=>{ if(!(last&&last.members.includes(k)) && h.slice(-4,-1).some(p=>p.members.includes(k))) reprise.push(k); });
  // length
  let L= type==='ens'? this.r(28,60)*sc : type==='duet'? this.r(22,50)*sc : type==='solo'? this.r(12,35)*sc : this.r(45,120)*(0.7+0.3*sc);
  if(type==='solo'&&sizeOf(lead)==='small') L*=0.6;
  if(type==='assert') L=Math.min(SOLO_CAP-8,L); else if(type==='solo') L=Math.min(L,70);
  L=Math.max(8,L);
  // background companions for an assert: up to two, kept soft
  let bg=[];
  if(type==='assert'){ const pool=en.filter(k=>k!==lead); const nb=Math.min(pool.length,this.rng()<0.8?(this.rng()<0.5?2:1):0); let p2=pool.slice(); for(let i=0;i<nb;i++){ const k=weighted(p2,'voice',x=>cont.includes(x)?1.5:1); if(!k) break; bg.push(k); p2=p2.filter(x=>x!==k); } }
  if(type==='solo'&&en.length>1&&this.rng()<0.35){ const pool=en.filter(k=>k!==lead); const k=weighted(pool,'voice'); if(k) bg.push(k); }
  const pass={type,T,L,lead,members:members.slice(),bg:bg.slice(),reprise};
  this.build(pass,P,sc);
  this.hist.push(pass); this.trim(); this.t=T+L; return pass; }
 trim(){ if(this.hist.length>this.keepHist) this.hist.splice(0,this.hist.length-this.keepHist); }
 build(p,P,sc){ const {T,L,type,lead}=p; const all=p.members.concat(p.bg); const wanted=new Set(all);
  // 1. thin out: clocks not in this passage fade, staggered
  let outEnd=T; for(const d of this.defs){ const k=d.key; if(!wanted.has(k)&&this.audible(k)){ const a=T+this.r(0,1.5), b=a+this.r(1.5,3.5); this.ramp(k,a,b,0); outEnd=Math.max(outEnd,b); } }
  const fadingAt=t=>this.defs.filter(d=>!wanted.has(d.key)&&this.levelAt(d.key,t)>0.001).length;
  // entry helper: respects the audible ceiling
  const entered=new Set(all.filter(k=>this.audible(k)));
  const enter=(k,te,fi,v)=>{ if(!this.audible(k)){ let n=entered.size+fadingAt(te); if(n>=MAX_AUDIBLE) te=Math.max(te,outEnd+0.1); entered.add(k); } this.ramp(k,te,te+fi,v); };
  const lvlFor=k=>{ const s=this.by[k].size; return s==='grand'?0.95:s==='medium'?0.85:0.75; };
  if(type==='solo'){ enter(lead,T+this.r(0,1.2),this.r(1.5,3),1.0);
   for(const k of p.bg){ const a=T+this.r(3,Math.max(4,L*0.3)), b=Math.min(T+L-1,a+this.r(6,Math.max(7,L*0.6))); enter(k,a,2.5,this.r(0.1,BG_MAX)); this.ramp(k,b,b+2.5,0); } }
  else if(type==='assert'){ const a=T+this.r(0,1); enter(lead,a,2,1.0); const s0=a+this.r(1,3); const s1=s0+this.r(4,8); this.ramp(lead,s0,s1,SWELL*this.r(0.9,1.0)); const back=T+L-this.r(6,10); this.ramp(lead,Math.max(s1+5,back),Math.max(s1+5,back)+this.r(4,6),1.0);
   for(const k of p.bg) enter(k,T+this.r(0.5,4),this.r(2,4),this.r(0.1,BG_MAX)); }
  else if(type==='duet'){ const [A,B]=p.members; enter(A,T+this.r(0,1),2,1.0); let t=T+this.r(2,6)*sc; enter(B,t,2,0.45); let spk=B, lis=A, g=0;
   while(t<T+L-6&&g++<20){ const len=this.r(7,15)*sc; const te=Math.min(T+L-2,t+len); // speaker rises, listener settles
    this.ramp(spk,t,t+1.5,1.0); if(this.rng()<0.22&&te-t>8){ this.ramp(lis,t+0.5,t+2,0.0); this.ramp(lis,te-3,te-1,0.45); } else this.ramp(lis,t,t+1.5,this.r(0.4,0.6));
    t=te; [spk,lis]=[lis,spk]; } }
  else if(type==='ens'){ // staggered entries, conversational surges, then thinning
   const order=p.members.slice().sort((a,b)=>(this.audible(b)?1:0)-(this.audible(a)?1:0)); let t=T;
   order.forEach((k,i)=>{ if(this.audible(k)) this.ramp(k,T,T+2,lvlFor(k)); else { t+= this.r(1.5,5)*sc; enter(k,Math.min(t,T+L*0.5),this.r(1.5,3),lvlFor(k)); } });
   let u=T+L*0.35; let g=0; while(u<T+L*0.75&&g++<12){ const k=order[Math.floor(this.rng()*order.length)]; const v=Math.min(1.1,lvlFor(k)*this.r(0.65,1.2)); this.ramp(k,u,u+this.r(1.5,3),v); u+=this.r(5,12)*sc; }
   const leave=order.filter(k=>k!==lead).slice(0,Math.max(0,Math.floor(order.length/2)-0)); let w=T+L*0.75; leave.forEach(k=>{ this.ramp(k,w,w+this.r(2,4),0); w+=this.r(1.5,4)*sc; }); }
 }
 current(t){ for(let i=this.hist.length-1;i>=0;i--){ const p=this.hist[i]; if(p.T<=t) return p; } return null; }
 snapshot(t){ const o={}; for(const d of this.defs){ o[d.key]=this.levelAt(d.key,t); } return o; }
 describe(t,names){ names=names||(k=>this.by[k].name); const p=this.current(t); const lv=this.snapshot(t);
  const lead=[],speak=[],soft=[]; for(const d of this.defs){ const v=lv[d.key]; if(v>1.15) lead.push(d.key); else if(v>=FG) speak.push(d.key); else if(v>0.01) soft.push(d.key); }
  const list=a=>a.length<=1?a.map(names).join(''):a.slice(0,-1).map(names).join(', ')+' and '+names(a[a.length-1]);
  if(!lead.length&&!speak.length&&!soft.length) return 'The clocks are quiet for a moment.';
  let s='';
  if(p) s+='Now: '+(TYPE_WORDS[p.type]||'a passage')+'. ';
  if(lead.length) s+=list(lead)+(lead.length>1?' are':' is')+' leading, swelling gently. ';
  if(speak.length) s+=list(speak)+(speak.length>1?' are speaking. ':' is speaking. ');
  if(soft.length) s+=list(soft)+(soft.length>1?' are':' is')+' soft in the background. ';
  if(p&&p.reprise&&p.reprise.length) s+=list(p.reprise)+(p.reprise.length>1?' have':' has')+' returned with a reprise. ';
  return s.trim(); }
}
/* chime turn-taking (pure). key: 'h'|'half'|'q'. Returns [{clock, voice, strikes, delay}] */
function planChime(kind,hour24,P,state,rng,defs){ defs=defs||CLOCK_DEFS; rng=rng||Math.random; state=state||{};
 const c=P.clocks||{}; const solo=defs.filter(d=>c[d.key]&&c[d.key].solo&&!c[d.key].mute); const en=(solo.length?solo:defs.filter(d=>!(c[d.key]&&c[d.key].mute))).filter(d=>d.chime);
 const pres=d=>(c[d.key]?c[d.key].pres:d.pres)||0;
 const pickW=(arr,w)=>{ let s=0; w.forEach(x=>s+=x); if(!(s>0)) return null; let u=rng()*s; for(let i=0;i<arr.length;i++){ u-=w[i]; if(u<=0) return arr[i]; } return arr[arr.length-1]; };
 const n=P.strikeCount===false?1:((hour24%12)||12);
 if(kind==='h'){ let cand=en.filter(d=>d.chime.hour&&pres(d)>0); if(!cand.length) return [];
  const notLast=cand.filter(d=>d.key!==state.lastHour); if(notLast.length) cand=notLast;
  const first=pickW(cand,cand.map(d=>pres(d)*(d.magisterial?1.3:1))); state.lastHour=first.key;
  const out=[{clock:first.key,voice:first.chime.hour,strikes:n,delay:0}];
  if(P.answer!==false){ const rest=en.filter(d=>d.chime.hour&&d.key!==first.key&&pres(d)>0); if(rest.length&&rng()<0.4){ const a=pickW(rest,rest.map(d=>pres(d))); out.push({clock:a.key,voice:a.chime.hour,strikes:n,delay:'after',gap:6+rng()*24}); } }
  return out; }
 if(kind==='half'){ let cand=en.filter(d=>d.chime.half&&pres(d)>0); if(!cand.length) return []; const nl=cand.filter(d=>d.key!==state.lastHalf); if(nl.length) cand=nl;
  const a=pickW(cand,cand.map(d=>pres(d)*(d.key==='cuckoo'?2.5:1))); state.lastHalf=a.key; return [{clock:a.key,voice:a.chime.half,strikes:1,delay:0}]; }
 if(kind==='q'){ let cand=en.filter(d=>d.chime.quarter&&pres(d)>0); if(cand.length) return [{clock:cand[0].key,voice:cand[0].chime.quarter,strikes:1,delay:0}];
  cand=en.filter(d=>d.chime.half&&pres(d)>0&&d.key!=='cuckoo'); if(!cand.length) return []; const a=pickW(cand,cand.map(d=>pres(d))); return [{clock:a.key,voice:a.chime.half,strikes:1,delay:0}]; }
 return []; }
function chimeKindFor(minute,mode){ if(mode==='off') return null; if(minute===0) return 'h'; if(minute===30&&(mode==='halves'||mode==='quarters')) return 'half'; if((minute===15||minute===45)&&mode==='quarters') return 'q'; return null; }
function chimeLength(voice,strikes){ const v=CHIME_VOICES[voice]; if(!v) return 0; if(v.len) return v.len; const n=v.one?1:strikes; return (v.intro?(v.introLen||13):0)+(n-1)*v.gap+9/v.rate; }
if(typeof module!=='undefined'&&module.exports) module.exports={CLOCK_DEFS,CHIME_CREDITS,CHIME_VOICES,ENS_DEFAULTS,normEns,ensClockDefaults,Conductor,mulberry32,planChime,chimeKindFor,chimeLength,FG,MAX_AUDIBLE,SOLO_CAP,SWELL,BG_MAX};
