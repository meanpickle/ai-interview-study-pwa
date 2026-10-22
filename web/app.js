'use strict';
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const main = $('#main');
let state, repositories, docs, docMap, repoMap, token, today, dataDirectory;
let view = 'dashboard', selectedRepo = '', libraryQuery = '', libraryStatus = 'all', libraryPage = 0, fullText = false;
let currentDoc = null, headings = [], restoring = false, openGeneration = 0, monthCursor;
let saveChain = Promise.resolve(), noteTimer, scrollTimer, journalTimer, searchTimer, toastTimer;
let lastActivity = Date.now(), pendingSeconds = 0, lastTick = Date.now(), tickDocument = '', searchGeneration = 0;
const noteDrafts = new Map();
const DRAFT_KEY = 'ai-study-unsaved-drafts-v1';
try { for (const [id, note] of Object.entries(JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'))) noteDrafts.set(id, note); } catch {}
function saveDraftCache() { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(Object.fromEntries(noteDrafts))); } catch {} }
function toast(message, error = false) {
  const box = $('#toast'); box.textContent = message; box.className = 'toast show' + (error ? ' error' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => box.classList.remove('show'), error ? 7000 : 3200);
}
async function fetchText(url, options) {
  if(url.startsWith('/api/'))return StudyPlatform.request(url,options);
  const response = await fetch(url, options);
  if (!response.ok) throw new Error((await response.text()) || `请求失败 (${response.status})`);
  return response.text();
}
async function json(url, options) { return JSON.parse(await fetchText(url, options)); }
function mutate(action, quiet = false) {
  const task = saveChain.then(async () => {
    $('#saveStatus').textContent = '正在保存…';
    const result = await json('/api/action', {method:'POST', headers:{'Content-Type':'application/json','X-Study-Token':token}, body:JSON.stringify(action)});
    state = result.state; today = result.today;
    $('#saveStatus').textContent = '已保存到本机';
    if (action.type === 'progress' && Object.hasOwn(action, 'note') && noteDrafts.get(action.id) === action.note) { noteDrafts.delete(action.id); saveDraftCache(); }
    return result;
  });
  saveChain = task.catch(error => {
    $('#saveStatus').textContent = '保存失败，请检查设备空间';
    if (!quiet) toast(error.message, true);
    if ($('#noteStatus')) $('#noteStatus').textContent = '保存失败，草稿暂存在浏览器中';
  });
  return task;
}
function dayKey(date) {
  const d = typeof date === 'string' ? new Date(date + 'T12:00:00Z') : date;
  return d.toISOString().slice(0,10);
}
function shiftDay(key, n) { const d = new Date(key + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return dayKey(d); }
function weekday(key) { return new Date(key + 'T12:00:00Z').getUTCDay(); }
function daySeconds(day) { return Object.values(day?.seconds || {}).reduce((sum, x) => sum + x, 0); }
function allSeconds() { return Object.values(state.days).reduce((sum, day) => sum + daySeconds(day), 0); }
function duration(seconds) { return seconds < 60 ? (seconds > 0 ? '不足 1 分钟' : '0 分钟') : seconds < 3600 ? `${Math.floor(seconds / 60)} 分钟` : `${Math.floor(seconds / 3600)} 小时 ${Math.floor(seconds % 3600 / 60)} 分钟`; }
function streak() { let day = state.days[today]?.checkedIn ? today : shiftDay(today,-1), n = 0; while (state.days[day]?.checkedIn) { n++; day=shiftDay(day,-1); } return n; }
function learnedCount(repo) { return docs.filter(d => (!repo || d.repoId === repo) && state.documents[d.id]?.status === 'done').length; }
function recentDocs(limit = 5) { return Object.entries(state.documents).filter(([id]) => docMap.has(id)).sort((a,b) => b[1].updatedAt.localeCompare(a[1].updatedAt)).slice(0,limit).map(([id,p]) => ({doc:docMap.get(id),progress:p})); }
function studyDocIds(day) { return [...new Set([...Object.keys(day?.seconds || {}), ...(day?.learned || [])])].filter(id => docMap.has(id)); }
function progress(id) { return state.documents[id] || {scroll:0,status:'new',note:'',heading:'',anchorOffset:0}; }
function docButton(id, label, cls = 'text-button') { return `<button class="${cls}" data-open="${esc(id)}">${esc(label || docMap.get(id)?.title || id)}</button>`; }
function checkinButton() { return state.days[today]?.checkedIn ? '<button class="button green" data-checkin disabled>✓ 今天已签到</button>' : '<button class="button primary" data-checkin>＋ 记录今天的坚持</button>'; }
function checkedDays() { return Object.values(state.days).filter(d => d.checkedIn).length; }
function changeView(name, options = {}) {
  if (view === 'reader') { savePosition(); flushTime(); }
  currentDoc = null; headings = []; tickDocument = ''; openGeneration++;
  view = name; document.body.classList.remove('reading');
  if (options.repo !== undefined) selectedRepo = options.repo;
  if (options.reset) {libraryQuery='';libraryStatus='all';libraryPage=0;fullText=false;}
  const labels = {dashboard:'学习概览',library:'我的资料库',journal:'签到与复盘',notes:'我的笔记'};
  $('#breadcrumbs').innerHTML = `我的学习空间 <span>/</span> ${labels[name] || '学习概览'}`;
  $$('.nav-item').forEach(b => b.classList.toggle('active',b.dataset.view===name));
  if(name==='library') renderLibrary();else if(name==='journal')renderJournal();else if(name==='notes')renderNotes();else renderDashboard();
  window.scrollTo(0,0); history.replaceState(null,'','#'+name);
}
function repoCard(repo) {
  const n = learnedCount(repo.id), percent = Math.round(n / Math.max(1,repo.docs.length)*100);
  const last = recentDocs(1000).find(x => x.doc.repoId === repo.id);
  const cached=repo.docs.filter(d=>StudyPlatform.hasCached(d.id)).length;
  return `<button class="card repo-card" data-repository="${esc(repo.id)}"><span class="repo-icon">${esc({'大模型':'✦','机器学习':'M','代码手撕':'⌘','深度学习':'D','Agent / RAG':'A'}[repo.category] || '▤')}</span><span class="pill repo-category">${esc(repo.category)}</span><h3>${esc(repo.title)}</h3><p class="repo-description">${esc(repo.description)}</p><div class="repo-meta"><span>${repo.docs.length} 篇资料 · <span class="offline-count">已缓存 ${cached}</span></span><span>已学 ${n} 篇</span></div><div class="progress-track"><i style="width:${percent}%"></i></div><div class="repo-footer"><span>${last ? '上次阅读 ' + new Date(last.progress.updatedAt).toLocaleDateString('zh-CN') : '从第一篇开始'}</span><span>${percent}% <span aria-hidden="true">↗</span></span></div></button>`;
}
function renderDashboard() {
  const last=docMap.get(state.lastDocument), p=last?progress(last.id):null;
  const todaySec=daySeconds(state.days[today]), target=state.targetMinutes;
  main.innerHTML=`<div class="page-intro"><div><div class="eyebrow">YOUR LEARNING JOURNEY</div><h1>让知识，一点点成为底气。</h1><p>从理解一个原理，到讲清一个答案。今天也往前走一点。</p></div><span class="pill green">● ${StudyPlatform.getCacheIds().size} 篇已缓存 · ${repositories.length} 个资料源</span></div>
  ${StudyPlatform.getCacheIds().size?'':'<div class="source-notice"><span>首次使用可联网打开文章，或导入已有资料包。已缓存正文可在断网后继续阅读。</span><button class="text-button" data-offline>离线与迁移 →</button></div>'}
  <section class="welcome-grid"><div class="card continue-card"><div class="copy"><div class="eyebrow">${last?'PICK UP WHERE YOU LEFT OFF':'A GOOD PLACE TO START'}</div><h2>${esc(last?last.title:'今天，从这里开始')}</h2><p>${last?esc(repoMap.get(last.repoId).title)+' · '+(p.headingLabel?esc(p.headingLabel)+' · ':'')+'上次读到 '+Math.round(p.scroll*100)+'%':'机器学习基础 → 大模型原理 → 代码手撕，选一条主线开始积累。'}</p><button class="button primary" data-open="${esc(last?.id||repositories[0].docs[0].id)}">${last?'继续上次阅读':'开始第一篇'} <span>→</span></button></div><div class="book-art" aria-hidden="true"></div></div>
  <div class="card checkin-card"><span class="check-label">今日学习 · 每日目标 ${target} 分钟</span><div class="goal">${Math.floor(todaySec/60)} <small>/ ${target} min</small></div><div class="progress-track"><i style="width:${Math.min(100,todaySec/(target*60)*100)}%"></i></div>${checkinButton()}<p class="tiny">${state.days[today]?.checkedIn?'今天的努力已经记下，明天继续。':'签到记下坚持，阅读自动记录时长。'}</p></div></section>
  <section class="stats-grid"><div class="card stat"><div class="label">累计学习时长 <span>◷</span></div><div class="value">${(allSeconds()/3600).toFixed(1)}<small>小时</small></div><div class="sub">只累计当前打开页面的活跃阅读</div></div><div class="card stat"><div class="label">已学完资料 <span>✓</span></div><div class="value">${learnedCount()}<small>/ ${docs.length} 篇</small></div><div class="sub">理解后手动标记，稳步积累</div></div><div class="card stat"><div class="label">连续签到 <span>↗</span></div><div class="value">${streak()}<small>天</small></div><div class="sub">累计签到 ${checkedDays()} 天</div></div><div class="card stat"><div class="label">我的学习笔记 <span>✎</span></div><div class="value">${Object.values(state.documents).filter(p=>p.note?.trim()).length}<small>篇</small></div><div class="sub">留下理解，也留下待解决的问题</div></div></section>
  <section><div class="section-heading"><h2>你的学习主线 <span class="muted tiny"> / 建议从这三套开始</span></h2><button class="text-button tiny" data-view="library">查看全部资料 →</button></div><div class="repo-grid">${repositories.slice(0,3).map(repoCard).join('')}</div></section>
  <section class="dashboard-bottom"><div class="card"><div class="section-heading"><h2>每一天，都算数</h2><span class="muted tiny">最近 26 周</span></div>${heatmap()}<div style="margin-top:23px;border-top:1px solid var(--border);padding-top:17px"><div class="inline"><span class="pill green">连续 ${streak()} 天</span><span class="muted tiny">${checkedDays()?'已经留下 '+checkedDays()+' 天的学习足迹。':'第一块绿色，从今天开始。'}</span><span class="spacer"></span><button class="text-button tiny" data-view="journal">学习日历 ↗</button></div></div></div><div class="card"><div class="section-heading"><h2>最近在读</h2><span class="muted tiny">自动记住位置</span></div>${recentDocs().length?recentDocs().map(({doc,p})=>`<div class="recent-row"><span class="document-icon">▤</span><div class="recent-copy">${docButton(doc.id)}<small>${esc(repoMap.get(doc.repoId).title)} · ${Math.round(progress(doc.id).scroll*100)}%</small></div><span class="muted tiny">↗</span></div>`).join(''):'<div class="empty">打开一篇资料，<br>下次就能从这里接着读。</div>'}</div></section>`;
}
function heatmap() {
  const end = shiftDay(today,6-weekday(today)), start = shiftDay(end,-181);
  let cells='';
  for(let i=0;i<182;i++) {
    const key=shiftDay(start,i), day=state.days[key], seconds=daySeconds(day);
    const activity=seconds>0||day?.checkedIn||day?.note?.trim()||day?.learned?.length;
    const level=!activity?0:seconds>=3600?4:seconds>=1800?3:seconds>=600?2:1;
    cells+=`<button class="heat-cell ${key===today?'today':''}" data-day="${key}" data-level="${level}" title="${key} · ${duration(seconds)}${day?.checkedIn?' · 已签到':''}" aria-label="${key}，${duration(seconds)}${day?.checkedIn?'，已签到':''}" ${key>today?'disabled':''}></button>`;
  }
  return `<div class="heatmap-wrap"><div class="heatmap-layout"><div class="heatmap-labels"><span></span><span>一</span><span></span><span>三</span><span></span><span>五</span><span></span></div><div class="heatmap">${cells}</div></div></div><div class="heatmap-footer"><span>${start} — ${today}</span><div class="legend">少 <i style="background:#edf1f5"></i><i style="background:#d8ecdf"></i><i style="background:#a2d5b5"></i><i style="background:#63b68a"></i><i style="background:#2e8e62"></i> 多</div></div>`;
}
function renderLibrary() {
  const repo=repoMap.get(selectedRepo);
  main.innerHTML=`<div class="page-intro"><div><div class="eyebrow">YOUR OFFLINE LIBRARY</div><h1>我的资料库</h1><p>${repositories.length} 个原始仓库 · ${docs.length} 篇文件索引 · 已缓存 ${StudyPlatform.getCacheIds().size} 篇</p></div><button class="text-button tiny" id="toggleRepoOverview">查看仓库总览 ↗</button></div><div id="repoOverview" class="repo-grid" hidden>${repositories.map(repoCard).join('')}</div>
  <div class="source-notice"><span>正文直接从原仓库获取，首次打开后自动缓存；全文搜索只覆盖本设备已缓存的内容。</span><button class="text-button" data-offline>管理离线正文 ↓</button></div>
  <div class="toolbar"><div class="search-box"><span>⌕</span><input id="librarySearch" aria-label="搜索资料" placeholder="搜索知识点、标题或文件路径…" value="${esc(libraryQuery)}"></div><label class="search-check"><input id="fullText" type="checkbox" ${fullText?'checked':''}> 搜索已缓存正文（至少 2 个字）</label></div>
  <div class="library-layout"><aside class="repo-list" aria-label="仓库筛选"><button data-filter-repo="" class="${!selectedRepo?'active':''}">全部资料<small>${docs.length}</small></button>${repositories.map(r=>`<button class="${selectedRepo===r.id?'active':''}" data-filter-repo="${esc(r.id)}">${esc(r.title)}<small>${r.docs.length}</small></button>`).join('')}</aside><div><div class="section-heading"><h2>${esc(repo?.title||'全部学习资料')}</h2>${repo?`<a class="text-button tiny" href="${esc(repo.url)}" target="_blank" rel="noopener noreferrer">原始仓库 ↗</a>`:''}</div><div class="filter-tabs">${[['all','全部'],['new','未开始'],['reading','学习中'],['done','已学完']].map(([k,label])=>`<button class="filter-tab ${k===libraryStatus?'active':''}" data-status="${k}">${label}</button>`).join('')}</div><div id="documentsResults"></div></div></div>`;
  $('#toggleRepoOverview').onclick=()=>{const box=$('#repoOverview');box.hidden=!box.hidden;box.style.marginBottom=box.hidden?'0':'25px';};
  $('#librarySearch').oninput=e=>{libraryQuery=e.target.value;libraryPage=0;clearTimeout(searchTimer);searchTimer=setTimeout(renderDocumentResults,fullText?420:100);};
  $('#fullText').onchange=e=>{fullText=e.target.checked;libraryPage=0;renderDocumentResults();};
  renderDocumentResults();
}
async function renderDocumentResults() {
  const target=$('#documentsResults');if(!target)return;
  const generation=++searchGeneration;
  let filtered=docs.filter(d=>(!selectedRepo||d.repoId===selectedRepo)&&(libraryStatus==='all'||progress(d.id).status===libraryStatus));
  const query=libraryQuery.trim().toLocaleLowerCase();let snippets=new Map();
  if(query) {
    if(fullText&&query.length>=2) {
      target.innerHTML='<div class="loading"><span class="spinner"></span>正在搜索离线正文…</div>';
      try {const result=await json('/api/search?q='+encodeURIComponent(query)+'&repo='+encodeURIComponent(selectedRepo));snippets=new Map(result.hits.map(h=>[h.id,h.snippet]));}
      catch(e){if(generation===searchGeneration){target.innerHTML=`<div class="empty">${esc(e.message)}</div>`;}return;}
      if(generation!==searchGeneration||view!=='library')return;
    }
    filtered=filtered.filter(d=>(d.title+' '+d.path+' '+repoMap.get(d.repoId).title).toLocaleLowerCase().includes(query)||snippets.has(d.id));
  }
  const pageSize=35,pages=Math.max(1,Math.ceil(filtered.length/pageSize));libraryPage=Math.min(libraryPage,pages-1);
  target.innerHTML=`<div class="list-info">共 ${filtered.length} 篇${fullText&&query.length>=2?' · 只搜索已缓存正文，匹配最多显示 80 篇':''}${fullText&&query.length===1?' · 请再输入一个字符搜索正文':''}</div><div class="card document-list">${filtered.length?filtered.slice(libraryPage*pageSize,(libraryPage+1)*pageSize).map(d=>{const p=progress(d.id);return `<div class="doc-row"><span class="doc-badge">${esc(d.kind.toUpperCase())}</span><div class="doc-main">${docButton(d.id,d.title,'doc-title')}<div class="doc-path">${StudyPlatform.hasCached(d.id)?'<span class="doc-cache">↓ 已缓存</span>':''}${esc(!selectedRepo?repoMap.get(d.repoId).title+' / ':'')}${esc(d.path)}</div>${snippets.has(d.id)?`<div class="doc-snippet">…${esc(snippets.get(d.id))}…</div>`:''}</div><span class="doc-status ${p.status}">${p.status==='done'?'✓ 已学完':p.status==='reading'?Math.round(p.scroll*100)+'%':'未开始'}</span></div>`;}).join(''):'<div class="empty">没有匹配的资料，试试其他关键词；搜索正文前可先下载或导入资料包。</div>'}</div>${pages>1?`<div class="pagination"><button class="button small" data-page="${libraryPage-1}" ${libraryPage===0?'disabled':''}>上一页</button><span>${libraryPage+1} / ${pages}</span><button class="button small" data-page="${libraryPage+1}" ${libraryPage===pages-1?'disabled':''}>下一页</button></div>`:''}`;
}
function getReadingPosition() {
  if(!currentDoc||!$('#article'))return null;
  const max=Math.max(1,document.documentElement.scrollHeight-innerHeight),scroll=Math.max(0,Math.min(1,scrollY/max));
  const anchor=headings.filter(h=>h.getBoundingClientRect().top<=160).at(-1);
  return {type:'progress',id:currentDoc.id,scroll,heading:anchor?.id||'',headingLabel:anchor?.textContent||'',anchorOffset:anchor?scrollY-(anchor.getBoundingClientRect().top+scrollY):0};
}
function savePosition(includeNote=false) {
  if(restoring)return Promise.resolve();
  const action=getReadingPosition();if(!action)return Promise.resolve();
  if(includeNote||noteDrafts.has(action.id))action.note=noteDrafts.has(action.id)?noteDrafts.get(action.id):($('#articleNote')?.value??progress(action.id).note);
  return mutate(action).catch(()=>{});
}
async function openDoc(id, anchor) {
  const doc=docMap.get(id);if(!doc){toast('这篇资料不在当前离线索引中。',true);return;}
  clearTimeout(noteTimer);clearTimeout(scrollTimer);
  if(view==='reader'){await savePosition(true);await flushTime();}
  const generation=++openGeneration;
  currentDoc=doc;view='reader';tickDocument='';restoring=true;headings=[];
  document.body.classList.add('reading');$$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view==='library'));
  const repo=repoMap.get(doc.repoId),p=progress(id);
  $('#breadcrumbs').innerHTML=`我的资料库 <span>/</span> ${esc(repo.title)}`;
  history.replaceState(null,'','#read/'+encodeURIComponent(id));
  main.innerHTML=`<div class="reader-toolbar"><button class="button small" data-back>← 资料库</button><div class="reader-title"><h2>${esc(doc.title)}</h2><small>${esc(doc.path)}</small></div><button class="button toc-toggle" id="tocToggle">目录</button><button class="button note-toggle" id="noteToggle">笔记</button><a class="button" href="${esc(repo.url+'/blob/HEAD/'+doc.path.split('/').map(encodeURIComponent).join('/'))}" target="_blank" rel="noopener noreferrer">原文 ↗</a><button class="button ${p.status==='done'?'green':'primary'}" id="learnedBtn">${p.status==='done'?'✓ 已学完':'标记已学完'}</button></div><div class="reading-progress"><i id="readingProgress" style="width:${p.scroll*100}%"></i></div><div class="reader-layout"><aside class="toc" id="toc"><div class="side-caption">本篇目录</div></aside><div class="reader-center"><div class="article-label"><span>${esc(repo.category)}</span><i class="dot"></i><span>${esc(repo.repo)}</span><span class="spacer"></span><span id="readingPercent">${Math.round(p.scroll*100)}%</span></div><div id="restoreMessage" class="reader-message" ${p.status==='new'?'hidden':''}>已恢复上次位置${p.headingLabel?' · '+esc(p.headingLabel):''}。 <button class="text-button" id="readFromTop">从头阅读</button></div><article id="article" class="article"><div class="loading"><span class="spinner"></span>正在读取本地资料…</div></article><div id="readerBottom" class="reader-bottom"></div></div><aside class="reader-note"><h3>✎ 本篇学习笔记</h3><p class="muted">理解、追问、还没想通的地方，都记下来。</p><label for="articleNote" class="only-screenreader">本篇学习笔记</label><textarea id="articleNote" placeholder="用自己的话写下：&#10;&#10;1. 核心原理是什么？&#10;2. 为什么这样设计？&#10;3. 面试官可能怎么追问？&#10;4. 能联系哪个项目？"></textarea><div id="noteStatus" class="note-status">输入后自动保存到本机</div><button class="button small" id="saveNoteBtn">立即保存笔记</button><div class="note-tips" style="margin-top:25px"><b>把知识，变成自己的答案</b>先讲结论，再讲原理。<br>补充适用场景与局限。<br>用一个项目例子收尾。</div></aside></div>`;
  $('#articleNote').value=noteDrafts.has(id)?noteDrafts.get(id):(p.note||'');
  $('#articleNote').oninput=e=>{noteDrafts.set(id,e.target.value);saveDraftCache();$('#noteStatus').textContent='正在记录草稿…';clearTimeout(noteTimer);noteTimer=setTimeout(()=>persistNote(id),650);};
  $('#saveNoteBtn').onclick=()=>persistNote(id,true);
  $('#learnedBtn').onclick=()=>toggleLearned(id);
  if($('#noteToggle'))$('#noteToggle').onclick=()=>$('.reader-layout').classList.toggle('notes-open');
  if($('#tocToggle'))$('#tocToggle').onclick=()=>$('.reader-layout').classList.toggle('toc-open');
  $('#readFromTop').onclick=()=>{restoring=false;window.scrollTo(0,0);$('#restoreMessage').hidden=true;savePosition();};
  try {
    const source=await fetchText('/api/document?id='+encodeURIComponent(id));if(generation!==openGeneration)return;
    let html;
    if(['md','mdx'].includes(doc.kind))html=marked.parse(source,{gfm:true,breaks:false});
    else if(doc.kind==='ipynb') {const notebook=JSON.parse(source);html=(notebook.cells||[]).map(cell=>cell.cell_type==='markdown'?marked.parse((cell.source||[]).join('')):'<pre><code class="language-python">'+esc((cell.source||[]).join(''))+'</code></pre>').join('');}
    else html='<pre><code'+(doc.kind==='py'?' class="language-python"':'')+'>'+esc(source)+'</code></pre>';
    const article=$('#article');
    article.innerHTML=DOMPurify.sanitize(html,{FORBID_TAGS:['style','form','input','button','iframe','object','embed','script'],FORBID_ATTR:['style','srcdoc','srcset','onerror','onload']});
    enhanceArticle(article,doc);
    headings=$$('h1,h2,h3,h4',article);let used=new Map();
    headings.forEach((h,i)=>{const base=h.id||h.textContent.trim().toLowerCase().replace(/[^\p{L}\p{N}_\- ]/gu,'').replace(/\s+/g,'-')||'section-'+i;const n=used.get(base)||0;used.set(base,n+1);h.id=base+(n?'-'+n:'');});
    $('#toc').innerHTML='<div class="side-caption">本篇目录</div>'+(headings.length?headings.slice(0,180).map(h=>`<button data-anchor="${esc(h.id)}" data-level="${h.tagName.substring(1)}">${esc(h.textContent.slice(0,120))}</button>`).join(''):'<div class="muted tiny">本篇没有章节标题</div>');
    const position=repo.docs.findIndex(d=>d.id===id),prev=repo.docs[position-1],next=repo.docs[position+1];
    $('#readerBottom').innerHTML=`${prev?docButton(prev.id,'← '+prev.title,'button'):'<span></span>'}${next?docButton(next.id,next.title+' →','button'):'<span class="muted tiny">你已经读到本仓库最后一篇。</span>'}`;
    const restore=()=>{
      if(generation!==openGeneration)return;
      if(anchor){const el=findAnchor(anchor);if(el)el.scrollIntoView({block:'start'});else window.scrollTo(0,0);}
      else if(p.heading&&document.getElementById(p.heading)){const h=document.getElementById(p.heading);window.scrollTo(0,h.getBoundingClientRect().top+scrollY+(p.anchorOffset||0));}
      else window.scrollTo(0,p.scroll*Math.max(0,document.documentElement.scrollHeight-innerHeight));
    };
    restore();await new Promise(resolve=>setTimeout(resolve,80));restore();
    const imagePromises=$$('img',article).filter(img=>!img.complete).map(img=>new Promise(resolve=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',resolve,{once:true});}));
    if(imagePromises.length)await Promise.race([Promise.all(imagePromises),new Promise(resolve=>setTimeout(resolve,1200))]);
    if(generation!==openGeneration)return;
    restore();restoring=false;tickDocument=id;lastTick=Date.now();lastActivity=Date.now();updateReadingMeter();
    await savePosition();
    if(noteDrafts.has(id))persistNote(id);
  } catch(error) {
    if(generation!==openGeneration)return;restoring=false;
    $('#article').innerHTML=`<div class="empty">${esc(error.message)}<br><br><button class="button primary" data-open="${esc(id)}">重试读取</button> <button class="button" data-offline>导入离线资料包</button></div>`;
    toast('资料读取失败',true);
  }
}
function findAnchor(hash) {
  let decoded=hash;try{decoded=decodeURIComponent(hash);}catch{}
  return document.getElementById(decoded)||headings.find(h=>h.id===decoded||h.textContent.trim()===decoded||h.id.replace(/^user-content-/,'')===decoded);
}
function localReference(raw, doc) {
  const repo=repoMap.get(doc.repoId);let value=raw||'';
  if(value.startsWith('#'))return {anchor:value.slice(1)};
  if(/^https?:/i.test(value)) {
    try {
      const url=new URL(value);
      if(url.hostname==='github.com') {
        const rootRepo=repositories.find(r=>('/'+r.repo).toLowerCase()===url.pathname.replace(/\/$/,'').toLowerCase());
        if(rootRepo)return {id:rootRepo.docs.find(d=>d.path.toLowerCase()==='readme.md')?.id||rootRepo.docs[0].id,anchor:url.hash.slice(1)};
        const match=url.pathname.match(/^\/([^/]+\/[^/]+)\/(?:blob|raw|tree)\/[^/]+\/(.*)/);
        const targetRepo=match&&repositories.find(r=>r.repo.toLowerCase()===match[1].toLowerCase());
        if(targetRepo)return {id:targetRepo.id+'/'+decodeURIComponent(match[2]),anchor:url.hash.slice(1)};
      }
      if(url.hostname==='raw.githubusercontent.com') {
        const match=url.pathname.match(/^\/([^/]+\/[^/]+)\/[^/]+\/(.*)/);
        const targetRepo=match&&repositories.find(r=>r.repo.toLowerCase()===match[1].toLowerCase());
        if(targetRepo)return {id:targetRepo.id+'/'+decodeURIComponent(match[2]),anchor:url.hash.slice(1)};
      }
    }catch{}
    return null;
  }
  if(/^(?:data:|mailto:|tel:)/i.test(value)||value.startsWith('//'))return null;
  try {
    const base=new URL('https://local.invalid/'+doc.path.split('/').map(encodeURIComponent).join('/'));
    const u=new URL(value,base);if(u.origin!==base.origin)return null;
    return {id:repo.id+'/'+decodeURIComponent(u.pathname.slice(1)),anchor:u.hash.slice(1)};
  }catch{return null;}
}
function enhanceArticle(article,doc) {
  $$('a',article).forEach(a=>{
    const raw=a.getAttribute('href');if(!raw)return;
    const ref=localReference(raw,doc);
    if(ref?.id) {
      let target=ref.id;if(!docMap.has(target)&&docMap.has(target.replace(/\/$/,'')+'/README.md'))target=target.replace(/\/$/,'')+'/README.md';
      if(!docMap.has(target)&&docMap.has(target+'.md'))target+='.md';
      if(!docMap.has(target)&&/\.html$/i.test(target)&&docMap.has(target.replace(/\.html$/i,'.md')))target=target.replace(/\.html$/i,'.md');
      if(docMap.has(target)){a.href='#read/'+encodeURIComponent(target);a.dataset.open=target;if(ref.anchor)a.dataset.linkAnchor=ref.anchor;}
      else if(docs.some(d=>d.id.startsWith(target.replace(/\/$/,'')+'/'))){a.href='#library';a.dataset.folder=target.substring(target.indexOf('/')+1).replace(/\/$/,'');a.dataset.folderRepo=target.split('/')[0];}
      else {a.href=StudyPlatform.knownFileURL(ref.id,{repositories});a.target='_blank';a.rel='noopener noreferrer';}
    } else if(ref?.anchor) {a.href='#'+ref.anchor;a.dataset.articleAnchor=ref.anchor;}
    else if(/^https?:/i.test(a.href)){a.target='_blank';a.rel='noopener noreferrer';}
  });
  $$('img',article).forEach(img=>{
    const ref=localReference(img.getAttribute('src'),doc);if(ref?.id)img.src=StudyPlatform.knownFileURL(ref.id,{repositories});
    img.addEventListener('error',()=>{img.classList.add('image-unavailable');img.alt=img.alt?'图片暂不可用：'+img.alt:'图片暂不可用（可能是远程图片）';},{once:true});
  });
  $$('pre code',article).forEach(code=>{
    try{if(code.textContent.length<150000)hljs.highlightElement(code);}catch{}
    const button=document.createElement('button');button.type='button';button.className='code-copy';button.textContent='复制';
    button.onclick=async()=>{try{await navigator.clipboard.writeText(code.textContent);button.textContent='已复制';setTimeout(()=>button.textContent='复制',1500);}catch{toast('无法访问剪贴板，请手动选择复制。',true);}};
    code.parentElement.append(button);
  });
  try{renderMathInElement(article,{delimiters:[{left:'$$',right:'$$',display:true},{left:'\\[',right:'\\]',display:true},{left:'\\(',right:'\\)',display:false},{left:'$',right:'$',display:false}],throwOnError:false,trust:false,strict:'ignore'});}catch{}
}
async function persistNote(id,notify=false) {
  if(!noteDrafts.has(id)&&!notify)return;
  const note=noteDrafts.has(id)?noteDrafts.get(id):($('#articleNote')?.value||'');
  const action=currentDoc?.id===id?{type:'progress',id,...getReadingPosition(),note}:{type:'progress',id,note};
  try{await mutate(action);if(currentDoc?.id===id&&$('#noteStatus'))$('#noteStatus').textContent='✓ 已保存 · '+new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});if(notify)toast('笔记已保存');}catch{}
}
async function toggleLearned(id) {
  const learned=progress(id).status==='done';
  await savePosition(true);
  try {
    await mutate({type:learned?'unlearn':'learned',id});
    if(currentDoc?.id===id){const b=$('#learnedBtn');b.className='button '+(learned?'primary':'green');b.textContent=learned?'标记已学完':'✓ 已学完';}
    toast(learned?'已改为学习中，历史学习记录仍保留':'已记录到今天的已学内容');
  }catch{}
}
function updateReadingMeter() {
  if(view!=='reader'||!currentDoc||restoring)return;
  const p=getReadingPosition();if(!p)return;
  $('#readingProgress').style.width=p.scroll*100+'%';$('#readingPercent').textContent=Math.round(p.scroll*100)+'%';
  $$('#toc button').forEach(b=>b.classList.toggle('active',b.dataset.anchor===p.heading));
}
function renderNotes() {
  const notes=Object.entries(state.documents).filter(([id,p])=>p.note?.trim()&&docMap.has(id)).sort((a,b)=>b[1].updatedAt.localeCompare(a[1].updatedAt));
  main.innerHTML=`<div class="page-intro"><div><div class="eyebrow">MAKE KNOWLEDGE YOUR OWN</div><h1>我的学习笔记</h1><p>${notes.length} 篇笔记，把看过的知识变成自己的理解。</p></div><button id="exportNotes" class="button small">导出为 Markdown ↓</button></div><div class="toolbar"><div class="search-box"><span>⌕</span><input id="noteSearch" aria-label="搜索笔记" placeholder="搜索笔记内容、标题或仓库…"></div></div><div class="notes-grid" id="noteCards"></div>`;
  const paint=(query='')=>{const filtered=notes.filter(([id,p])=>(docMap.get(id).title+' '+repoMap.get(docMap.get(id).repoId).title+' '+p.note).toLowerCase().includes(query.toLowerCase()));$('#noteCards').innerHTML=filtered.length?filtered.map(([id,p])=>{const d=docMap.get(id);return `<div class="card note-card"><span class="muted tiny">${esc(repoMap.get(d.repoId).title)}</span><h3 style="margin-top:8px">${docButton(id,d.title)}</h3><div class="note-text">${esc(p.note)}</div><div class="note-bottom"><span>${esc(new Date(p.updatedAt).toLocaleString('zh-CN'))}</span>${docButton(id,'回到原文 ↗')}</div></div>`;}).join(''):'<div class="card empty" style="grid-column:1/-1">'+(query?'没有匹配的笔记。':'阅读时在右侧写下理解，笔记会自动汇集在这里。')+'</div>';};paint();$('#noteSearch').oninput=e=>paint(e.target.value);
  $('#exportNotes').onclick=()=>download('AI面试学习笔记-'+today+'.md','# AI 面试学习笔记\n\n'+notes.map(([id,p])=>{const d=docMap.get(id),r=repoMap.get(d.repoId);return '## '+d.title+'\n\n来源：'+r.url+'/blob/HEAD/'+d.path+'\n\n更新：'+p.updatedAt+'\n\n'+p.note;}).join('\n\n---\n\n'),'text/markdown;charset=utf-8');
}
function renderJournal() {
  const day=state.days[today];
  monthCursor=monthCursor||today.slice(0,7);
  main.innerHTML=`<div class="page-intro"><div><div class="eyebrow">SMALL STEPS, REAL PROGRESS</div><h1>签到与复盘</h1><p>给今天一个记录，也给明天一个清晰的起点。</p></div>${checkinButton()}</div><div class="journal-layout"><div><div class="card journal-today"><div class="section-heading"><h2>今天，我学到了什么？</h2><span class="muted tiny">${today}</span></div><div class="inline"><span class="pill">阅读 ${duration(daySeconds(day))}</span><span class="pill green">标记已学 ${day?.learned?.length||0} 篇</span></div><label class="only-screenreader" for="journalNote">今日学习复盘</label><textarea id="journalNote" placeholder="今日学到的核心知识、解决的问题、明天想继续的方向…"></textarea><div class="inline" style="margin-top:10px"><span class="muted tiny" id="journalSaveStatus">停止输入后自动保存</span><span class="spacer"></span><button class="button small" id="saveJournal">保存今日复盘</button></div><div id="todayDocList" class="journal-docs">${studyDocIds(day).map(id=>docButton(id,'▤ '+docMap.get(id).title)).join('')}</div></div><div class="journal-days card"><div class="section-heading"><h2>学习足迹</h2><span class="muted tiny">按日期回顾</span></div><div id="journalHistory"></div></div></div><aside class="journal-side"><div class="card"><div id="monthCalendar"></div><div class="calendar-key">绿色：已签到　蓝点：有学习记录<br>点击日期查看当天学习内容。</div></div><div class="card" style="margin-top:20px"><div class="section-heading"><h2>最近 7 天</h2><span class="muted tiny">分钟</span></div>${weeklyChart()}</div></aside></div>`;
  $('#journalNote').value=day?.note||'';
  $('#journalNote').oninput=()=>{clearTimeout(journalTimer);$('#journalSaveStatus').textContent='正在记录…';const value=$('#journalNote').value;journalTimer=setTimeout(()=>saveJournal(value),650);};
  $('#saveJournal').onclick=()=>{clearTimeout(journalTimer);saveJournal($('#journalNote').value,true);};
  renderCalendar();renderJournalHistory();
}
async function saveJournal(note,notify=false){try{await mutate({type:'journal',note});if($('#journalSaveStatus'))$('#journalSaveStatus').textContent='✓ 已保存到本机';if(view==='journal')renderJournalHistory();if(notify)toast('今日复盘已保存');}catch{}}
function renderJournalHistory() {
  const keys=Object.keys(state.days).filter(k=>{const d=state.days[k];return d.checkedIn||daySeconds(d)>0||d.note?.trim()||d.learned?.length;}).sort().reverse();
  const target=$('#journalHistory');if(!target)return;
  target.innerHTML=keys.length?keys.slice(0,90).map(key=>{const d=state.days[key];return `<div class="journal-row"><div class="journal-date">${key.slice(5).replace('-',' / ')}<br><span class="muted tiny">${key.slice(0,4)}</span></div><div class="content"><div class="inline"><span class="pill ${d.checkedIn?'green':''}">${d.checkedIn?'✓ 已签到':'学习记录'}</span><span class="muted tiny">${duration(daySeconds(d))} · 已学 ${d.learned.length} 篇</span></div>${d.note?`<p>${esc(d.note)}</p>`:''}<div class="journal-docs">${studyDocIds(d).slice(0,10).map(id=>docButton(id,(d.learned.includes(id)?'✓ ':'▤ ')+docMap.get(id).title)).join('')}</div></div><button class="text-button tiny" data-day="${key}">详情 ↗</button></div>`;}).join(''):'<div class="empty">写下第一条复盘，开始你的学习足迹。</div>';
}
function renderCalendar() {
  const [year,month]=monthCursor.split('-').map(Number),first=monthCursor+'-01',count=new Date(Date.UTC(year,month,0)).getUTCDate();let html='';
  for(const name of ['日','一','二','三','四','五','六'])html+=`<span class="weekday">${name}</span>`;
  html+='<span></span>'.repeat(weekday(first));
  for(let n=1;n<=count;n++){const key=monthCursor+'-'+String(n).padStart(2,'0'),d=state.days[key];html+=`<button class="${d?.checkedIn?'checked ':''}${daySeconds(d)||d?.learned?.length||d?.note?.trim()?'has-study ':''}${key===today?'current':''}" data-day="${key}" ${key>today?'disabled':''} aria-label="${key}${d?.checkedIn?'，已签到':''}">${n}</button>`;}
  $('#monthCalendar').innerHTML=`<div class="month-controls"><button class="icon-button" data-month="-1" aria-label="上个月">‹</button><h3>${year} 年 ${month} 月</h3><button class="icon-button" data-month="1" aria-label="下个月">›</button></div><div class="calendar">${html}</div>`;
}
function weeklyChart() {
  const days=Array.from({length:7},(_,i)=>shiftDay(today,i-6)),max=Math.max(30,...days.map(d=>daySeconds(state.days[d])/60));
  return '<div class="bar-chart">'+days.map(d=>{const minutes=Math.floor(daySeconds(state.days[d])/60);return `<div class="bar-item ${d===today?'current':''}" title="${d}：${minutes} 分钟"><span class="bar-value">${minutes}</span><i style="height:${Math.max(2,minutes/max*85)}px"></i><small>${d===today?'今天':d.slice(5).replace('-','/')}</small></div>`;}).join('')+'</div>';
}
function showDay(key) {
  const day=state.days[key];$('#recordTitle').textContent=key+' · 学习记录';
  $('#recordBody').innerHTML=`<div class="record-stats"><span>${day?.checkedIn?'✓ 已签到':'未签到'}</span><span>阅读 ${duration(daySeconds(day))}</span><span>已学 ${day?.learned?.length||0} 篇</span></div><h3>当日复盘</h3><p class="muted pre-wrap">${esc(day?.note||'这一天还没有复盘记录。')}</p><h3 style="margin-top:24px">学习过的内容</h3><div class="journal-docs">${studyDocIds(day).map(id=>`<div class="recent-row"><div class="recent-copy">${docButton(id,(day.learned.includes(id)?'✓ ':'▤ ')+docMap.get(id).title)}<small>${esc(repoMap.get(docMap.get(id).repoId).title)} · ${duration(day.seconds[id]||0)}</small></div></div>`).join('')||'<p class="muted">暂无学习内容。</p>'}</div>`;
  $('#recordDialog').showModal();
}
function download(name, content, type='application/json') {const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
async function doCheckin() {
  try{await mutate({type:'checkin'});toast('今天的坚持，已记下。');if(view==='dashboard')renderDashboard();if(view==='journal')renderJournal();}catch{}
}
async function flushTime() {
  if(!tickDocument||pendingSeconds<1)return;
  const id=tickDocument,seconds=pendingSeconds;pendingSeconds=0;
  try{await mutate({type:'time',id,seconds},true);}catch{if(tickDocument===id)pendingSeconds+=seconds;}
}
function installEvents() {
  document.addEventListener('click',async e=>{
    const b=e.target.closest('button,a');if(!b)return;
    if(b.dataset.open){e.preventDefault();if($('#recordDialog').open)$('#recordDialog').close();openDoc(b.dataset.open,b.dataset.linkAnchor);}
    else if(b.hasAttribute('data-folder')){e.preventDefault();selectedRepo=b.dataset.folderRepo;libraryQuery=b.dataset.folder;libraryPage=0;libraryStatus='all';fullText=false;changeView('library');}
    else if(b.dataset.articleAnchor){e.preventDefault();findAnchor(b.dataset.articleAnchor)?.scrollIntoView({behavior:'auto',block:'start'});}
    else if(b.dataset.anchor){e.preventDefault();findAnchor(b.dataset.anchor)?.scrollIntoView({behavior:'auto',block:'start'});}
    else if(b.dataset.view){e.preventDefault();changeView(b.dataset.view);}
    else if(b.dataset.repository){selectedRepo=b.dataset.repository;libraryQuery='';libraryStatus='all';libraryPage=0;changeView('library');}
    else if(b.hasAttribute('data-filter-repo')){selectedRepo=b.dataset.filterRepo;libraryPage=0;renderLibrary();}
    else if(b.dataset.status){libraryStatus=b.dataset.status;libraryPage=0;$$('.filter-tab').forEach(x=>x.classList.toggle('active',x.dataset.status===libraryStatus));renderDocumentResults();}
    else if(b.dataset.page){libraryPage=Number(b.dataset.page);renderDocumentResults();window.scrollTo(0,0);}
    else if(b.hasAttribute('data-back')){changeView('library',{repo:currentDoc.repoId});}
    else if(b.hasAttribute('data-checkin'))doCheckin();
    else if(b.dataset.day)showDay(b.dataset.day);
    else if(b.dataset.month){const d=new Date(monthCursor+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+Number(b.dataset.month));monthCursor=dayKey(d).slice(0,7);renderCalendar();}
    else if(b.dataset.close)document.getElementById(b.dataset.close).close();
  });
  $('#continueTop').onclick=()=>openDoc(docMap.has(state.lastDocument)?state.lastDocument:repositories[0].docs[0].id);
  $('.brand').onclick=e=>{e.preventDefault();changeView('dashboard');};
  $('#backupBtn').onclick=()=>{$('#targetInput').value=state.targetMinutes;$('#dataPath').textContent=dataDirectory;$('#settingsDialog').showModal();};
  $('#saveTarget').onclick=async()=>{const value=Number($('#targetInput').value);if(!Number.isInteger(value)||value<1||value>600){toast('目标请输入 1–600 之间的整数。',true);return;}try{await mutate({type:'target',minutes:value});toast('每日目标已保存');if(view==='dashboard')renderDashboard();}catch{}};
  $('#exportBtn').onclick=async()=>{await savePosition(true);await flushTime();await saveChain;try{const data=await fetchText('/api/export');download('AI面试学习记录-'+today+'.json',data);toast('备份文件已导出');}catch(e){toast(e.message,true);}};
  $('#importBtn').onclick=()=>$('#importInput').click();
  $('#importInput').onchange=async e=>{
    const file=e.target.files[0];e.target.value='';if(!file)return;
    if(file.size>20*1024*1024){toast('备份文件超过 20 MB。',true);return;}
    try {
      const text=await file.text(),candidate=JSON.parse(text);
      if(candidate.version!==1||!candidate.documents||!candidate.days)throw new Error('请选择本学习台导出的 JSON 备份。');
      if(!confirm(`将导入 ${Object.keys(candidate.documents).length} 篇阅读记录、${Object.keys(candidate.days).length} 天的学习数据。\n这会替换当前记录，导入前会自动保存本机副本。\n是否继续？`))return;
      await savePosition(true);await flushTime();await saveChain;
      const result=await json('/api/import',{method:'POST',headers:{'Content-Type':'application/json','X-Study-Token':token},body:text});
      state=result.state;today=result.today;noteDrafts.clear();saveDraftCache();$('#settingsDialog').close();changeView('dashboard');toast('备份已恢复，可以继续学习了。');
    }catch(e){toast('导入失败：'+e.message,true);}
  };
  window.addEventListener('scroll',()=>{lastActivity=Date.now();if(view!=='reader'||restoring)return;updateReadingMeter();clearTimeout(scrollTimer);scrollTimer=setTimeout(()=>savePosition(),500);},{passive:true});
  for(const name of ['pointerdown','keydown','wheel','touchstart'])document.addEventListener(name,()=>lastActivity=Date.now(),{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){savePosition(true);flushTime();}lastTick=Date.now();});
  window.addEventListener('pagehide',()=>{
    const position=getReadingPosition();
    if(position){if(noteDrafts.has(position.id))position.note=noteDrafts.get(position.id);StudyPlatform.emergency(position);}
    if(tickDocument&&pendingSeconds>0)StudyPlatform.emergency({type:'time',id:tickDocument,seconds:pendingSeconds});
  });
  setInterval(()=>{
    const now=Date.now(),delta=Math.min(2,Math.max(0,Math.round((now-lastTick)/1000)));lastTick=now;
    if(view==='reader'&&tickDocument&&!restoring&&!document.hidden&&document.hasFocus()&&now-lastActivity<120000)pendingSeconds+=delta;
    if(pendingSeconds>=15)flushTime();
  },1000);
  setInterval(()=>{if(view==='reader')savePosition();},15000);
}
async function boot() {
  try {
    const [initial,catalog]=await Promise.all([json('/api/boot'),json('/api/catalog')]);
    ({state,token,today,dataDirectory}=initial);repositories=catalog.repositories;repoMap=new Map(repositories.map(r=>[r.id,r]));
    docs=repositories.flatMap(r=>r.docs.map(d=>({...d,repoId:r.id})));docMap=new Map(docs.map(d=>[d.id,d]));
    $('#repoCount').textContent=repositories.length;$('#dateLabel').textContent=today.replaceAll('-',' / ');
    $('#quickRepos').innerHTML=repositories.slice(0,3).map(r=>`<button data-repository="${esc(r.id)}"><i class="repo-dot"></i>${esc(r.title)}</button>`).join('');
    installEvents();
    const hash=location.hash;
    if(hash.startsWith('#read/'))openDoc(decodeURIComponent(hash.slice(6)));
    else changeView(['library','journal','notes'].includes(hash.slice(1))?hash.slice(1):'dashboard');
    if(initial.recovered)toast('已恢复上次退出时暂存的阅读记录。');
    if(noteDrafts.size)toast('发现上次未保存的笔记草稿，打开对应文章后将自动恢复。');
    window.dispatchEvent(new CustomEvent('study-ready'));
  }catch(e){main.innerHTML=`<div class="card error-card"><h2>学习台暂时无法打开</h2><p class="muted">${esc(e.message)}</p><p>请使用允许本地存储的现代浏览器，并在首次使用时联网打开完整网址。</p><button class="button primary" id="retryBoot">重新加载</button></div>`;$('#retryBoot').onclick=()=>location.reload();}
}
boot();
