/* Ultimate Sanctuary service worker: keeps the app itself for offline use, and answers sound files from the world caches
   that "Save for offline" fills. Sounds that were not saved are fetched from the internet as usual and not stored. */
const SHELL='us1-shell-v1';
const FILES=['./','index.html','app.js','conductor.js','ens.js','manifest.json','credits.html'];
self.addEventListener('install',e=>{ e.waitUntil(caches.open(SHELL).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())); });
self.addEventListener('activate',e=>{ e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch',e=>{ const r=e.request; if(r.method!=='GET') return; const u=new URL(r.url);
 if(/\/packs\/[^/]+\/[^/]+\.mp3$/.test(u.pathname)){ e.respondWith(caches.match(r.url,{ignoreSearch:true}).then(m=>m||fetch(r).catch(()=>new Response('',{status:503,statusText:'Offline'})))); return; }
 if(u.origin!==self.location.origin) return;
 e.respondWith(fetch(r).then(resp=>{ if(resp&&resp.ok&&resp.type==='basic'){ const cp=resp.clone(); caches.open(SHELL).then(c=>c.put(r,cp)).catch(()=>{}); } return resp; })
  .catch(()=>caches.match(r,{ignoreSearch:true}).then(m=>m||(r.mode==='navigate'?caches.match('./'):undefined)).then(m=>m||new Response('Offline',{status:503,statusText:'Offline'})))); });
