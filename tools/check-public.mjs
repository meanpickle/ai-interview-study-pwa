import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function publicFiles(){
  const allowedTop=new Set(['web','tools','tests','docs','.github','.gitignore','README.md','LICENSE','package.json','THIRD_PARTY_NOTICES.md']);
  const files=[];
  function walk(folder){for(const item of fs.readdirSync(folder,{withFileTypes:true})){if(item.name==='.git')continue;const full=path.join(folder,item.name),rel=path.relative(root,full).split(path.sep).join('/');if(!allowedTop.has(rel.split('/')[0]))throw new Error('Unexpected publication path: '+rel);if(item.isSymbolicLink())throw new Error('Symlink is not publishable: '+rel);if(item.isDirectory())walk(full);else{
    if(/(?:study-pack|learning\.json|\.zip$|backup|备份|qa-data|test-results|\.env|\.token$|\.pem$)/i.test(rel))throw new Error('Private/generated artifact blocked: '+rel);
    if(fs.statSync(full).size>2*1024*1024)throw new Error('Unexpectedly large public file: '+rel);
    if(/\.(?:js|mjs|py|json|yml|md|html|txt|css)$/.test(rel)){
      const text=fs.readFileSync(full,'utf8');
      if(/(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/.test(text))throw new Error('Credential pattern blocked: '+rel);
      if(text.includes(['验证笔记','：Attention'].join(''))||text.includes(['界面测试','：学习 Attention'].join('')))throw new Error('Old QA/user record blocked: '+rel);
      if(rel==='web/catalog.json'){
        const c=JSON.parse(text);for(const r of c.repositories)for(const d of r.docs)if(Object.keys(d).some(k=>!['id','path','kind','title'].includes(k)))throw new Error('Study text/extra fields in public catalog');
      }
    }
    files.push(rel);
  }}}
  walk(root);return files.sort();
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const files=publicFiles();console.log('PASS public boundary:',files.length,'files;',files.reduce((n,f)=>n+fs.statSync(path.join(root,f)).size,0),'bytes. No corpus packs or learning records.');
}
