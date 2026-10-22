"""Download documents directly from original GitHub repositories into a local pack.

Uses the public file-path catalog; no credentials, third-party corpus or uploads.
"""
import argparse,json,time,urllib.request,urllib.parse
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
ROOT=Path(__file__).resolve().parents[1]
def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--repo',default='wdndev/llm_interview_note',help='owner/name or all')
    p.add_argument('--output',type=Path,default=ROOT/'content-packs')
    args=p.parse_args();catalog=json.loads((ROOT/'web'/'catalog.json').read_text('utf-8'))
    repos=[r for r in catalog['repositories'] if args.repo=='all' or r['repo']==args.repo]
    if not repos:raise SystemExit('Unknown source. Choose --repo all or one of the owners in web/catalog.json.')
    args.output.mkdir(parents=True,exist_ok=True)
    for repo in repos:
        def fetch_doc(doc):
            url='https://raw.githubusercontent.com/'+repo['repo']+'/'+repo.get('ref','HEAD')+'/'+urllib.parse.quote(doc['path'],safe='/')
            for attempt in range(3):
                try:
                    req=urllib.request.Request(url,headers={'User-Agent':'AIInterviewStudyPWA/2'})
                    with urllib.request.urlopen(req,timeout=45) as response:raw=response.read(4*1024*1024+1)
                    if len(raw)>4*1024*1024:raise ValueError('Document too large')
                    return {'id':doc['id'],'text':raw.decode('utf-8',errors='replace')}
                except Exception:
                    if attempt==2:raise
                    time.sleep(attempt+1)
        documents=[];failed=[]
        with ThreadPoolExecutor(max_workers=3) as executor:
            futures={executor.submit(fetch_doc,d):d for d in repo['docs']}
            for f in as_completed(futures):
                try:documents.append(f.result())
                except Exception as e:failed.append({'id':futures[f]['id'],'error':str(e)})
        pack={'format':'ai-study-content-pack','version':1,'sources':[{'repo':repo['repo'],'url':repo['url'],'licenseNotice':'Check the original repository license before reuse or redistribution.'}],'documents':documents}
        target=args.output/(repo['id']+'.study-pack.json');target.write_text(json.dumps(pack,ensure_ascii=False),'utf-8')
        print(repo['repo'],len(documents),'saved;',len(failed),'failed;',target)
        if failed:(args.output/(repo['id']+'.failed.json')).write_text(json.dumps(failed,ensure_ascii=False,indent=2),'utf-8')
    print('These packs are local-only. Do not commit them or personal learning backups to your public repository.')
if __name__=='__main__':main()
