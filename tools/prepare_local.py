"""Prepare a metadata-only public catalog and private, local content packs.

No study text or learning records are written beneath the GitHub project.
"""
from pathlib import Path
import json, argparse, shutil

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--desktop',type=Path,required=True)
    parser.add_argument('--output-packs',type=Path,required=True)
    args=parser.parse_args()
    project=Path(__file__).resolve().parents[1]
    output=args.output_packs.resolve()
    if project.resolve() in output.parents or output==project.resolve():
        raise SystemExit('Private content packs must be generated outside the public GitHub project.')
    output.mkdir(parents=True,exist_ok=True)
    source=json.loads((args.desktop/'catalog.json').read_text('utf-8'))
    public={'version':1,'indexDate':'2026-10-22','contentPolicy':'metadata-and-original-links-only','repositories':[]}
    all_documents=[];all_sources=[]
    for repo in source['repositories']:
        entry={key:repo[key] for key in ('id','repo','title','category','description','url')}
        entry['ref']='HEAD'
        entry['docs']=[{'id':d['id'],'path':d['path'],'kind':d['kind'],'title':(repo['title']+' · 导读') if Path(d['path']).name.lower()=='readme.md' else Path(d['path']).stem.replace('_',' ')} for d in repo['docs']]
        public['repositories'].append(entry)
        provenance={'repo':repo['repo'],'url':repo['url'],'downloadedAt':repo['downloadedAt'],'archiveSha256':repo['archiveSha256'],'licenseNotice':'Original sources retain their respective licenses. This pack is local-only and is not published by the app.'}
        docs=[{'id':d['id'],'text':(args.desktop/'资料库'/d['id']).read_text('utf-8',errors='replace')} for d in repo['docs']]
        pack={'format':'ai-study-content-pack','version':1,'sources':[provenance],'documents':docs}
        (output/(repo['id']+'.study-pack.json')).write_text(json.dumps(pack,ensure_ascii=False),'utf-8')
        all_documents.extend(docs);all_sources.append(provenance)
    (project/'web'/'catalog.json').write_text(json.dumps(public,ensure_ascii=False),'utf-8')
    full={'format':'ai-study-content-pack','version':1,'sources':all_sources,'documents':all_documents}
    (output/'全部9仓库正文.study-pack.json').write_text(json.dumps(full,ensure_ascii=False),'utf-8')
    (output/'手机导入说明.txt').write_text('先在安卓 Chrome 或 Edge 中打开已部署的学习台 HTTPS 网页，可添加到主屏幕。\n点击顶部“离线”→“导入离线资料包”，选择全部9仓库正文.study-pack.json；也可按仓库分别导入较小的文件。\n资料只保存在这台设备，不上传到 GitHub。\n此包包含 918 篇正文和代码，不包含原仓库图片；图片在联网阅读时按需缓存。\n已有 Windows 阅读位置、笔记、签到需要另外在 Windows 学习台“备份与设置”中导出，再在手机“备份与设置”导入。\n正文包不改变学习记录，记录备份不包含正文，两者可独立迁移。\n请遵守各原始仓库许可，不要将此私人资料包上传到公开仓库。\n',encoding='utf-8')
    print('Public metadata:',len(public['repositories']),'repositories;',len(all_documents),'document paths')
    print('Private packs:',output,'full pack MiB:',round((output/'全部9仓库正文.study-pack.json').stat().st_size/1024**2,1))

if __name__=='__main__':main()
