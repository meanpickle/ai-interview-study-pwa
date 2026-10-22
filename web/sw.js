/* This worker caches the original app shell, never publishes downloaded study text. */
importScripts('./shell-files.js');
const VERSION='ai-study-shell-'+self.STUDY_SHELL_REVISION,IMAGES='ai-study-images-v1';
const base=new URL('./',self.location.href);
const absolute=path=>new URL(path,base).href;
self.addEventListener('install',event=>{event.waitUntil((async()=>{const cache=await caches.open(VERSION);await cache.addAll([...self.STUDY_SHELL_FILES.map(absolute),absolute('shell-files.js')]);await self.skipWaiting();})());});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith('ai-study-shell-')&&name!==VERSION)await caches.delete(name);await self.clients.claim();})());});
async function image(request){
  const cache=await caches.open(IMAGES),saved=await cache.match(request.url);if(saved)return saved;
  try{
    const response=await fetch(request.url,{mode:'cors',credentials:'omit',referrerPolicy:'no-referrer'});
    if(response.ok&&(await response.clone().blob()).size<=2*1024*1024){await cache.put(request.url,response.clone());const keys=await cache.keys();for(const key of keys.slice(0,Math.max(0,keys.length-80)))await cache.delete(key);}
    return response;
  }catch{return fetch(request);}
}
self.addEventListener('fetch',event=>{
  const request=event.request;if(request.method!=='GET')return;const url=new URL(request.url);
  if(url.origin===base.origin&&url.pathname.startsWith(base.pathname)){
    if(request.mode==='navigate')event.respondWith((async()=>{try{const response=await fetch(request);if(response.ok)return response;}catch{}return (await caches.match(absolute('index.html')))||Response.error();})());
    else event.respondWith((async()=>{const cached=await caches.match(request);return cached||fetch(request);})());
  }else if(request.destination==='image'&&['raw.githubusercontent.com','user-images.githubusercontent.com'].includes(url.hostname))event.respondWith(image(request));
});
