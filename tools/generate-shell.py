"""Generate native bitmap icons and the offline app shell file inventory."""
from pathlib import Path
import json,hashlib
from PIL import Image, ImageDraw,ImageFont
root=Path(__file__).resolve().parents[1]/'web'
icons=root/'icons';icons.mkdir(exist_ok=True)
for name,size in [('icon-192.png',192),('icon-512.png',512),('icon-maskable.png',512)]:
    image=Image.new('RGB',(size,size),'#17243b');draw=ImageDraw.Draw(image)
    margin=int(size*.18);draw.rounded_rectangle((margin,margin,size-margin,size-margin),radius=int(size*.14),fill='#5575e6')
    try:font=ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc',int(size*.43))
    except OSError:font=ImageFont.load_default()
    box=draw.textbbox((0,0),'知',font=font);width=box[2]-box[0];height=box[3]-box[1]
    draw.text(((size-width)/2-box[0],(size-height)/2-box[1]),'知',font=font,fill='white')
    image.save(icons/name)
(icons/'icon.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" rx="40" fill="#17243b"/><rect x="34" y="34" width="124" height="124" rx="26" fill="#5575e6"/><text x="96" y="124" text-anchor="middle" font-size="82" font-family="sans-serif" font-weight="700" fill="white">知</text></svg>','utf-8')
files=sorted(p.relative_to(root).as_posix() for p in root.rglob('*') if p.is_file() and p.name not in ('sw.js','shell-files.js','.nojekyll'))
revision=hashlib.sha256()
for name in files:revision.update(name.encode('utf-8'));revision.update((root/name).read_bytes())
(root/'shell-files.js').write_text('self.STUDY_SHELL_REVISION='+json.dumps(revision.hexdigest()[:16])+';\nself.STUDY_SHELL_FILES='+json.dumps(files,ensure_ascii=False)+';\n','utf-8')
(root/'.nojekyll').write_text('','utf-8')
print('Offline shell:',len(files)+1,'files')
