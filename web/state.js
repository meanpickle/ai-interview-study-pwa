/* Shared pure state logic. Also used by Node's built-in test runner. */
(function(root){
  'use strict';
  function fresh(){return {version:1,targetMinutes:30,updatedAt:'',lastDocument:'',lastRepository:'',documents:{},days:{}};}
  function chinaDay(now=new Date()){
    return new Date(now.getTime()+8*3600000).toISOString().slice(0,10);
  }
  function validKey(key){return typeof key==='string'&&key.length<2000&&!['__proto__','constructor','prototype'].includes(key);}
  function validate(candidate){
    if(!candidate||candidate.version!==1||!candidate.documents||!candidate.days||Array.isArray(candidate.documents)||Array.isArray(candidate.days))throw new Error('请选择本学习台或 Windows 学习台导出的完整 JSON 记录。');
    const s=JSON.parse(JSON.stringify(candidate));
    if(!Number.isInteger(s.targetMinutes)||s.targetMinutes<1||s.targetMinutes>600)throw new Error('每日目标无效。');
    if(Object.keys(s.documents).length>50000||Object.keys(s.days).length>30000)throw new Error('备份记录过多。');
    for(const [key,p] of Object.entries(s.documents)){
      if(!validKey(key)||!p||!Number.isFinite(p.scroll)||p.scroll<0||p.scroll>1||!['reading','done'].includes(p.status)||typeof p.note!=='string'||p.note.length>1000000)throw new Error('备份中的阅读记录或笔记无效。');
      if(p.anchorOffset!==undefined&&!Number.isFinite(p.anchorOffset))throw new Error('章节偏移无效。');
      if(typeof p.updatedAt!=='string'||!Number.isFinite(Date.parse(p.updatedAt)))throw new Error('阅读更新时间无效。');
    }
    for(const [key,d] of Object.entries(s.days)){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(key)||new Date(key+'T12:00:00Z').toISOString().slice(0,10)!==key||!d||typeof d.checkedIn!=='boolean'||typeof d.note!=='string'||!d.seconds||Array.isArray(d.seconds)||!Array.isArray(d.learned))throw new Error('备份中的日期或每日记录无效。');
      if(Object.entries(d.seconds).some(([id,n])=>!validKey(id)||!Number.isInteger(n)||n<0||n>86400)||d.learned.some(id=>!validKey(id)))throw new Error('备份中的学习时长或已学内容无效。');
      d.learned=[...new Set(d.learned)];
    }
    return s;
  }
  function apply(input,action,day=chinaDay(),now=new Date().toISOString()){
    const s=JSON.parse(JSON.stringify(input));
    if(!action||typeof action.type!=='string')throw new Error('无效操作。');
    const a=action,id=a.id;
    if(['progress','learned','unlearn','time'].includes(a.type)&&!validKey(id))throw new Error('资料标识无效。');
    const d=s.days[day]||{checkedIn:false,note:'',seconds:{},learned:[]};
    if(['progress','learned','unlearn'].includes(a.type)){
      const p=s.documents[id]||{scroll:0,anchorOffset:0,status:'reading',note:'',updatedAt:'',heading:'',headingLabel:''};
      if(a.type==='progress'){
        if(a.scroll!==undefined){if(!Number.isFinite(a.scroll))throw new Error('阅读位置无效。');p.scroll=Math.max(0,Math.min(1,a.scroll));}
        if(a.note!==undefined)p.note=String(a.note);
        if(a.heading!==undefined)p.heading=String(a.heading);
        if(a.headingLabel!==undefined)p.headingLabel=String(a.headingLabel);
        if(a.anchorOffset!==undefined){if(!Number.isFinite(a.anchorOffset))throw new Error('章节偏移无效。');p.anchorOffset=Math.max(-10000,Math.min(1000000,a.anchorOffset));}
        if(a.status!==undefined){if(!['done','reading'].includes(a.status))throw new Error('阅读状态无效。');p.status=a.status;}
      }else if(a.type==='learned'){p.status='done';if(!d.learned.includes(id))d.learned.push(id);s.days[day]=d;}
      else p.status='reading';
      p.updatedAt=now;s.documents[id]=p;s.lastDocument=id;s.lastRepository=id.split('/')[0];
    }else if(a.type==='checkin'){d.checkedIn=true;s.days[day]=d;}
    else if(a.type==='journal'){d.note=String(a.note||'');s.days[day]=d;}
    else if(a.type==='target'){const n=Number(a.minutes);if(!Number.isInteger(n)||n<1||n>600)throw new Error('目标请输入 1–600 分钟。');s.targetMinutes=n;}
    else if(a.type==='time'){const n=Number(a.seconds);if(!Number.isFinite(n)||n<0)throw new Error('时长无效。');d.seconds[id]=Math.min(86400,(d.seconds[id]||0)+Math.min(60,Math.floor(n)));s.days[day]=d;}
    else throw new Error('未知操作。');
    s.updatedAt=now;return s;
  }
  root.StudyState={fresh,validate,apply,chinaDay};
})(globalThis);
