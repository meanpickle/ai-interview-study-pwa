'use strict';
let deferredInstall=null,stopBatch=false,batchBusy=false;
const offlineDialog=document.getElementById('offlineDialog');
function networkStatus(){const badge=document.getElementById('networkBadge');badge.textContent=navigator.onLine?'在线':'离线';badge.classList.toggle('offline',!navigator.onLine);}
window.addEventListener('online',networkStatus);window.addEventListener('offline',networkStatus);networkStatus();
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;document.getElementById('installApp').textContent='安装到主屏幕';});
window.addEventListener('appinstalled',()=>{deferredInstall=null;toast('学习台已添加到主屏幕');});
function shellStatus(message){document.getElementById('offlineShellStatus').textContent=message;}
if('serviceWorker' in navigator&&window.isSecureContext){
  navigator.serviceWorker.register('./sw.js',{scope:'./'}).then(()=>navigator.serviceWorker.ready).then(()=>{shellStatus('✓ 应用页面、公式和代码组件已可离线启动。正文缓存单独管理。');}).catch(()=>shellStatus('离线页面尚未准备好，请保持联网并刷新后重试。'));
}else shellStatus('安装与离线启动需要 HTTPS 或 localhost。请使用已部署的 HTTPS 网址。');
async function storageStatus(){
  try{const estimate=await navigator.storage?.estimate(),persisted=await navigator.storage?.persisted();document.getElementById('storageInfo').textContent=estimate?'本应用已用约 '+(estimate.usage/1024/1024).toFixed(1)+' MB / 当前可用配额约 '+(estimate.quota/1024/1024).toFixed(0)+' MB。'+(persisted?'已获得持久存储。':'浏览器仍可能回收缓存，重要笔记请定期导出。'):'重要笔记请定期导出备份。';}catch{}
}
async function renderOfflineRepos(){
  const c=await StudyPlatform.catalog();
  document.getElementById('offlineRepos').innerHTML=c.repositories.map(r=>{
    const n=r.docs.filter(d=>StudyPlatform.hasCached(d.id)).length,percentage=Math.round(n/r.docs.length*100);
    return `<section class="offline-repo"><h3>${esc(r.title)}</h3><span class="muted tiny">已缓存 ${n} / ${r.docs.length} 篇正文 · ${esc(r.repo)}</span><div class="progress-track"><i style="width:${percentage}%"></i></div><div class="inline"><button class="button" data-download-repo="${esc(r.id)}" ${batchBusy?'disabled':''}>下载未缓存正文</button><button class="button ghost" data-clear-repo="${esc(r.id)}" ${batchBusy||!n?'disabled':''}>清除正文缓存</button><a class="text-button tiny" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">原始仓库 ↗</a></div></section>`;
  }).join('');
}
async function showOffline(){offlineDialog.showModal();await StudyPlatform.listCached();await renderOfflineRepos();}
document.getElementById('offlineTop').onclick=showOffline;document.getElementById('offlineSide').onclick=showOffline;
document.getElementById('mobileSettings').onclick=()=>document.getElementById('backupBtn').click();
document.getElementById('cancelDownload').onclick=()=>{stopBatch=true;document.getElementById('packProgress').textContent='正在停止；已下载的正文会保留。';};
document.getElementById('importPackBtn').onclick=()=>document.getElementById('packInput').click();
document.getElementById('packInput').onchange=async e=>{
  const files=[...e.target.files];e.target.value='';if(!files.length)return;
  const status=document.getElementById('packProgress');status.classList.remove('error');let imported=0;
  try{
    for(const file of files){if(file.size>120*1024*1024)throw new Error('单个资料包超过 120 MB，请使用分仓库包。');status.textContent='正在导入 '+file.name+'…';const pack=JSON.parse(await file.text());imported+=await StudyPlatform.importPack(pack);}
    status.textContent='✓ 已导入 '+imported+' 篇正文。学习记录保持不变。';await renderOfflineRepos();if(view==='dashboard')renderDashboard();if(view==='library')renderLibrary();
  }catch(error){status.classList.add('error');status.textContent='导入未完成：'+error.message+(imported?'\n已完成的前序资料包保留。':'');}
};
async function batchDownload(repoId){
  if(batchBusy)return;
  const c=await StudyPlatform.catalog(),repo=c.repositories.find(r=>r.id===repoId);if(!repo)return;
  const pending=repo.docs.filter(d=>!StudyPlatform.hasCached(d.id));if(!pending.length){toast('这个仓库的正文已经全部缓存');return;}
  batchBusy=true;stopBatch=false;await renderOfflineRepos();document.getElementById('cancelDownload').hidden=false;
  const status=document.getElementById('packProgress');status.classList.remove('error');let next=0,ok=0,failed=0;
  async function worker(){while(!stopBatch&&next<pending.length){const d=pending[next++];try{await StudyPlatform.documentText(d.id);ok++;}catch{failed++;}status.textContent=repo.title+'：已下载 '+ok+' / '+pending.length+'，失败 '+failed+'。';}}
  await Promise.all(Array.from({length:Math.min(3,pending.length)},worker));
  batchBusy=false;document.getElementById('cancelDownload').hidden=true;
  status.textContent=(stopBatch?'已停止。':'下载结束。')+'成功 '+ok+' 篇，失败 '+failed+' 篇。'+(failed?'可再次下载重试，或导入电脑生成的资料包。':'正文可以离线阅读。');
  await renderOfflineRepos();if(view==='dashboard')renderDashboard();if(view==='library')renderLibrary();
}
document.addEventListener('click',async e=>{
  const button=e.target.closest('button');if(!button)return;
  if(button.hasAttribute('data-offline'))showOffline();
  if(button.dataset.downloadRepo)batchDownload(button.dataset.downloadRepo);
  if(button.dataset.clearRepo){if(!confirm('只清除这个仓库的离线正文，保留所有阅读位置、笔记与签到。之后可以重新下载。是否继续？'))return;await StudyPlatform.clearRepository(button.dataset.clearRepo);await renderOfflineRepos();if(view==='dashboard')renderDashboard();if(view==='library')renderLibrary();toast('正文缓存已清除，学习记录仍保留');}
  if(button.id==='backupBtn')storageStatus();
});
document.addEventListener('click',e=>{
  if(!e.target.closest('#noteToggle')||!matchMedia('(max-width:700px)').matches)return;
  e.preventDefault();e.stopImmediatePropagation();
  const source=document.getElementById('articleNote');if(!source)return;
  document.getElementById('mobileNoteText').value=source.value;document.getElementById('mobileNoteDialog').showModal();
},true);
document.getElementById('mobileNoteText').oninput=e=>{const source=document.getElementById('articleNote');if(source){source.value=e.target.value;source.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('mobileNoteStatus').textContent='正在保存…';}};
document.getElementById('mobileSaveNote').onclick=async()=>{if(currentDoc){await persistNote(currentDoc.id,true);document.getElementById('mobileNoteStatus').textContent=noteDrafts.has(currentDoc.id)?'尚未保存，请检查设备空间。':'✓ 已保存在当前设备';}};
document.getElementById('mobileNoteDialog').addEventListener('close',()=>{if(currentDoc)persistNote(currentDoc.id);});
document.getElementById('restorePrevious').onclick=async()=>{
  try{const previous=await StudyPlatform.getBeforeImport();if(!previous){toast('还没有导入前副本');return;}if(!confirm('恢复到上一次导入前的学习记录？当前记录会作为新的副本保留。'))return;await savePosition(true);await flushTime();await saveChain;state=await StudyPlatform.replaceState(previous);document.getElementById('settingsDialog').close();changeView('dashboard');toast('已恢复导入前记录');}catch(e){toast(e.message,true);}
};
document.getElementById('installApp').onclick=async()=>{
  if(deferredInstall){await deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;}
  else if(matchMedia('(display-mode:standalone)').matches)toast('当前已在独立应用窗口中运行');
  else toast('请用安卓 Chrome / Edge 打开 HTTPS 网址，在浏览器菜单选择“安装应用”或“添加到主屏幕”。');
};
document.getElementById('persistStorage').onclick=async()=>{try{const accepted=await navigator.storage?.persist?.();toast(accepted?'已获得持久存储；仍建议定期导出笔记':'浏览器暂未批准。可以继续使用，请定期导出学习记录。');storageStatus();}catch{toast('当前浏览器暂不支持此操作');}};
window.addEventListener('study-ready',storageStatus);
