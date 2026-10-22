"""Embed the KaTeX WOFF2 fonts in its CSS for portable offline distribution."""
from pathlib import Path
import argparse,re,base64
p=argparse.ArgumentParser();p.add_argument('--fonts',type=Path,required=True);args=p.parse_args()
css_path=Path(__file__).resolve().parents[1]/'web'/'vendor'/'katex.min.css'
css=css_path.read_text('utf-8')
matches=list(re.finditer(r'src:url\((fonts/[^)]+\.woff2)\)[^;}]*',css))
for match in reversed(matches):
    data=base64.b64encode((args.fonts/Path(match.group(1)).name).read_bytes()).decode('ascii')
    css=css[:match.start()]+'src:url(data:font/woff2;base64,'+data+') format("woff2")'+css[match.end():]
css_path.write_text(css,'utf-8')
print('Embedded font faces:',len(matches),'CSS bytes:',css_path.stat().st_size)
