/* Browser-local persistence and direct, user-triggered source downloads. */
(function(root){
  'use strict';
  const DB_NAME='ai-interview-study-v2',WAL_PREFIX='ai-study-wal-v2-',DOC_LIMIT=4*1024*1024;
  let dbPromise,catalogPromise,cacheIds=new Set(),lastState;
  const nativeFetch=root.fetch.bind(root);
  const pathURL=path=>new URL(path,document.baseURI).href;
  function database(){
    if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{
      if(!root.indexedDB){reject(new Error('当前浏览器不支持本地数据库，请使用新版 Chrome 或 Edge。'));return;}
      const request=indexedDB.open(DB_NAME,1);
      request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('records');db.createObjectStore('documents',{keyPath:'id'});db.createObjectStore('meta');};
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
      request.onblocked=()=>reject(new Error('数据库升级被旧页面阻塞，请关闭其他学习台页面后重试。'));
    });
    return dbPromise;
  }
  async function get(store,key){return new Promise(async(resolve,reject)=>{try{const db=await database(),tx=db.transaction(store,'readonly'),r=tx.objectStore(store).get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);}catch(e){reject(e);}});}
  async function set(store,key,value){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');if(store==='documents')tx.objectStore(store).put(value);else tx.objectStore(store).put(value,key);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||new Error('保存失败，请检查剩余存储空间。'));tx.onerror=()=>{};});}
  async function currentState(){return (await get('records','state'))||StudyState.fresh();}
  async function catalog(){if(!catalogPromise)catalogPromise=nativeFetch(pathURL('catalog.json')).then(r=>{if(!r.ok)throw new Error('资料索引无法读取，请联网打开应用一次。');return r.json();}).catch(e=>{catalogPromise=null;throw e;});return catalogPromise;}
  async function validateDocument(id){const c=await catalog();if(!c.repositories.some(r=>r.docs.some(d=>d.id===id)))throw new Error('资料不在当前索引中。');}
  async function update(action,day,walKey){
    if(['progress','learned','unlearn','time'].includes(action?.type))await validateDocument(action.id);
    const db=await database();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(['records','meta'],'readwrite'),store=tx.objectStore('records'),request=store.get('state');let result;
      request.onsuccess=()=>{
        const before=request.result||StudyState.fresh();
        const apply=()=>{try{result=StudyState.apply(before,action,day);store.put(result,'state');if(walKey)tx.objectStore('meta').put(true,'applied:'+walKey);}catch(e){reject(e);tx.abort();}};
        if(walKey){const dedupe=tx.objectStore('meta').get('applied:'+walKey);dedupe.onsuccess=()=>{if(dedupe.result)result=before;else apply();};}
        else apply();
      };
      tx.oncomplete=()=>{lastState=result;resolve(result);};tx.onabort=()=>reject(tx.error||new Error('本地保存没有完成，请保留当前页面后重试。'));
      tx.onerror=()=>{};
    });
  }
  function emergency(action){
    if(!action)return;
    try{const key=WAL_PREFIX+Date.now()+'-'+Math.random().toString(36).slice(2);localStorage.setItem(key,JSON.stringify({action,day:StudyState.chinaDay()}));}catch{}
  }
  async function recover(){
    let keys=[];try{keys=Object.keys(localStorage).filter(k=>k.startsWith(WAL_PREFIX)).sort();}catch{return false;}
    for(const key of keys){try{const entry=JSON.parse(localStorage.getItem(key));await update(entry.action,entry.day,key);localStorage.removeItem(key);}catch(e){console.warn('Uncommitted study draft retained:',e.message);}}
    return keys.length>0;
  }
  async function listCached(){const db=await database();return new Promise((resolve,reject)=>{const r=db.transaction('documents').objectStore('documents').getAllKeys();r.onsuccess=()=>{cacheIds=new Set(r.result);resolve(cacheIds);};r.onerror=()=>reject(r.error);});}
  async function sourceURL(id){const c=await catalog(),repo=c.repositories.find(r=>id.startsWith(r.id+'/'));if(!repo)throw new Error('未知资料来源。');return 'https://raw.githubusercontent.com/'+repo.repo+'/'+(repo.ref||'HEAD')+'/'+id.slice(repo.id.length+1).split('/').map(encodeURIComponent).join('/');}
  function knownFileURL(id,c){const repo=c.repositories.find(r=>id.startsWith(r.id+'/'));if(!repo)return '';return 'https://raw.githubusercontent.com/'+repo.repo+'/'+(repo.ref||'HEAD')+'/'+id.slice(repo.id.length+1).split('/').map(encodeURIComponent).join('/');}
  async function documentText(id){
    await validateDocument(id);const saved=await get('documents',id);if(saved)return saved.text;
    const url=await sourceURL(id);let response;
    try{response=await nativeFetch(url,{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(25000)});}catch{throw new Error('这篇正文尚未下载，当前无法连接原始 GitHub。请联网后重试，或在“离线与迁移”导入本地资料包。');}
    if(!response.ok)throw new Error('原仓库暂时无法读取这篇资料（HTTP '+response.status+'）。可点击原文，或导入已有离线资料包。');
    const text=await response.text();if(text.length>DOC_LIMIT)throw new Error('正文超过单篇缓存上限。');
    try{await set('documents',id,{id,text,cachedAt:new Date().toISOString()});cacheIds.add(id);}catch(e){throw new Error('正文已下载，但手机存储空间不足，未能完成离线保存。请释放空间后重试。');}
    return text;
  }
  async function search(q,repo){
    if(q.length<2||q.length>160)return {hits:[]};
    const db=await database();return new Promise((resolve,reject)=>{
      const hits=[],request=db.transaction('documents').objectStore('documents').openCursor();
      request.onsuccess=()=>{const cursor=request.result;if(!cursor||hits.length>=80){resolve({hits});return;}const d=cursor.value;
        if(!repo||d.id.startsWith(repo+'/')){const pos=d.text.toLocaleLowerCase().indexOf(q.toLocaleLowerCase());if(pos>=0){const start=Math.max(0,pos-45);hits.push({id:d.id,snippet:d.text.slice(start,start+180)});}}
        cursor.continue();};request.onerror=()=>reject(request.error);
    });
  }
  async function replaceState(candidate){
    const value=StudyState.validate(candidate),db=await database();
    return new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite'),store=tx.objectStore('records'),r=store.get('state');r.onsuccess=()=>{store.put(r.result||StudyState.fresh(),'before-import');store.put(value,'state');};tx.oncomplete=()=>{lastState=value;resolve(value);};tx.onabort=()=>reject(tx.error||new Error('导入失败，旧记录仍保留。'));});
  }
  async function importPack(pack,report=()=>{}){
    if(!pack||pack.format!=='ai-study-content-pack'||pack.version!==1||!Array.isArray(pack.documents)||pack.documents.length>10000)throw new Error('请选择本工具生成的 .study-pack.json 资料包。');
    const c=await catalog(),known=new Set(c.repositories.flatMap(r=>r.docs.map(d=>d.id))),seen=new Set();
    for(const d of pack.documents){if(!d||!known.has(d.id)||seen.has(d.id)||typeof d.text!=='string'||d.text.length>DOC_LIMIT)throw new Error('资料包包含未知、重复或过大的文件，未导入。');seen.add(d.id);}
    const db=await database();
    await new Promise((resolve,reject)=>{const tx=db.transaction(['documents','meta'],'readwrite'),store=tx.objectStore('documents');for(const d of pack.documents)store.put({id:d.id,text:d.text,cachedAt:new Date().toISOString()});tx.objectStore('meta').put({at:new Date().toISOString(),sources:pack.sources||[]},'last-content-import');tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||new Error('空间不足或导入中断，原缓存未改变。'));});
    await listCached();report(pack.documents.length,pack.documents.length);return pack.documents.length;
  }
  async function clearRepository(repoId){
    const db=await database();await new Promise((resolve,reject)=>{const tx=db.transaction('documents','readwrite'),r=tx.objectStore('documents').openCursor();r.onsuccess=()=>{const cursor=r.result;if(!cursor)return;if(cursor.key.startsWith(repoId+'/'))cursor.delete();cursor.continue();};tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});await listCached();
  }
  async function request(path,options={}){
    const url=new URL(path,'https://local.invalid'),name=url.pathname;let value;
    if(name==='/api/boot'){
      await database();const recovered=await recover();await listCached();lastState=await currentState();value={state:lastState,today:StudyState.chinaDay(),token:'browser-local-only',dataDirectory:'本设备浏览器数据库（IndexedDB），不会上传到 GitHub',recovered};
    }else if(name==='/api/catalog')value=await catalog();
    else if(name==='/api/document')return documentText(url.searchParams.get('id'));
    else if(name==='/api/search')value=await search(url.searchParams.get('q')||'',url.searchParams.get('repo')||'');
    else if(name==='/api/action')value={state:await update(JSON.parse(options.body)),today:StudyState.chinaDay()};
    else if(name==='/api/import')value={state:await replaceState(JSON.parse(options.body)),today:StudyState.chinaDay()};
    else if(name==='/api/export')value=await currentState();
    else throw new Error('未知本地操作。');
    return JSON.stringify(value);
  }
  root.StudyPlatform={request,catalog,documentText,importPack,clearRepository,sourceURL,knownFileURL,emergency,replaceState,validateState:StudyState.validate,currentState,listCached,getCacheIds:()=>new Set(cacheIds),hasCached:id=>cacheIds.has(id),getBeforeImport:()=>get('records','before-import'),database};
})(globalThis);
