"""Export a portable, fully offline Dayflight HTML and a source ZIP."""
from pathlib import Path
import argparse
import json
import re
import zipfile

root=Path(__file__).resolve().parent
parser=argparse.ArgumentParser()
parser.add_argument('--output',default=str(root.parent/'Dayflight-local'))
args=parser.parse_args()
out=Path(args.output).resolve()
out.mkdir(parents=True,exist_ok=True)
dist=root/'dist'
html=(dist/'index.html').read_text(encoding='utf-8')
css=(dist/'style.css').read_text(encoding='utf-8')
css=re.sub(r'@import\s+url\([^;]+;\s*','',css)
css+='\n.offline-actions{display:flex;gap:7px}.offline-actions button{font-size:11px}header{height:auto;min-height:91px;gap:12px;flex-wrap:wrap;padding-top:16px;padding-bottom:16px}.brand-sub{display:none}@media(max-width:720px){header{min-height:73px}.offline-actions{margin-left:auto}.offline-actions button{padding:8px 10px}}'
app=(dist/'app.js').read_text(encoding='utf-8')
vendor=(dist/'vendor/suncalc.js').read_text(encoding='utf-8')
for name in ['airports','land']:
    original=f"fetch('{name}.json')"
    replacement=f"Promise.resolve({{ok:true,json:async()=>JSON.parse(document.getElementById('offline-data-{name}').textContent)}})"
    assert original in app
    app=app.replace(original,replacement)
start=app.index("$('share').onclick=")
end=app.index("$('export').onclick=",start)
app=app[:start]+r'''
$('share').onclick=()=>{if(!flight)return;const blob=new Blob([JSON.stringify(planState(true),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`dayflight-${flight.a.code}-${flight.b.code}-plan.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Plan saved. Load it in any copy of Dayflight Offline.');};
$('loadPlan').onclick=()=>$('planFile').click();
$('planFile').onchange=async()=>{const file=$('planFile').files[0];if(!file)return;try{if(file.size>2*1024*1024)throw Error('Choose a Dayflight plan JSON file under 2 MB.');const state=JSON.parse(await file.text());if(!state||typeof state!=='object'||!['from','to','date','time','duration'].every(k=>typeof state[k]==='string')||!validPlanDate(state.date))throw Error('This is not a valid Dayflight plan file.');restore(state);calculate();if($('error').textContent)throw Error($('error').textContent);toast('Plan loaded.');}catch(err){$('error').textContent=err.message;}finally{$('planFile').value='';}};
'''+app[end:]
html=re.sub(r'<link rel="stylesheet" href="style\.css[^\"]*">',lambda _:f'<style>{css}</style>',html)
html=html.replace('<button id="share" class="quiet">↗ Share plan</button>','<div class="offline-actions"><button type="button" id="loadPlan" class="quiet">↑ Load plan</button><button id="share" class="quiet">↓ Save plan</button><input type="file" id="planFile" accept=".json,application/json" hidden></div>')
html=html.replace('<title>Dayflight · Follow the light</title>','<title>Dayflight Offline · Flight daylight planner</title>').replace('href="./"','href="#"')
def inline_script(text):
    return '<script>'+re.sub(r'</script',r'<\/script',text,flags=re.I)+'</script>'
data=''
for name in ['airports','land']:
    value=json.loads((dist/f'{name}.json').read_text(encoding='utf-8'))
    text=json.dumps(value,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')
    data+=f'<script type="application/json" id="offline-data-{name}">{text}</script>'
html=html.replace('<script src="vendor/suncalc.js"></script>',data+inline_script(vendor))
html=html.replace('<script src="vendor/tz-lookup.js"></script>',inline_script((dist/'vendor/tz-lookup.js').read_text(encoding='utf-8')))
for module_name in ['simbrief','import-ui']:
    html=re.sub(r'<script src="'+module_name+r'\.js[^\"]*"></script>',lambda _, name=module_name:inline_script((dist/(name+'.js')).read_text(encoding='utf-8')),html)
html=re.sub(r'<script src="app\.js[^\"]*"></script>',lambda _:inline_script(app),html)
assert not re.search(r'<script[^>]+src=',html)
assert '@import' not in html
assert "fetch('airports.json')" not in html and "fetch('land.json')" not in html
(out/'Dayflight-offline.html').write_text(html,encoding='utf-8')
readme='''DAYFLIGHT — LOCAL / OFFLINE COPY

1. Open Dayflight-offline.html in a modern desktop browser (Chrome, Edge, Firefox or Brave).
2. No server, install or account is required. Manual plans and imported OFP files work offline. Live SimBrief imports require internet access.
3. Save plan downloads a small JSON file. Load plan restores it on another computer.
4. Copy the HTML file to a USB drive or your cloud-storage folder for access on other devices.
5. You can send the HTML to friends. Send a plan JSON too if you want them to load your route.

All airport data, the world map, styles, scripts and SunCalc are embedded in the HTML.
SimBrief is contacted only when you click Import latest flight. OFP file import needs no connection.
Online documentation links only open if you choose them. Fonts use local fallbacks.
Browser-saved plans are local to that browser; they do not sync between devices.
This is a snapshot of the app. It does not automatically receive hosted-site updates.
Some phones or email previewers do not execute local HTML; open it in a full browser.

EDITABLE SOURCE
The ZIP includes source/dist plus check.cjs, README.md and export-offline.py.
Serve source/dist with a static server to develop it; rebuild the offline HTML with:
  python export-offline.py --output PATH
Run calculation checks with:
  node check.cjs
There are no server dependencies, credentials, Git metadata or hosting account bindings in this ZIP.

DATA / LICENSES
Dayflight code: MIT; see source/LICENSE.
Airport data: https://github.com/mwgg/Airports, MIT, (c) 2014 mwgg; see source/dist/vendor/airports-LICENSE.txt.
Natural Earth map data: public domain.
SunCalc 2.1.1: MIT; see source/dist/vendor/suncalc-LICENSE.txt.
Time-zone lookup: @photostructure/tz-lookup 11.7.0, CC0; see source/dist/vendor/tz-lookup-LICENSE.txt.

The route and celestial calculations are estimates for travel visualization.
For flight simulation and travel curiosity only; not for real-world navigation.
Not affiliated with or endorsed by Navigraph or SimBrief.
'''
(out/'START-HERE.txt').write_text(readme,encoding='utf-8')
archive=out/'Dayflight-local.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    z.write(out/'Dayflight-offline.html','Dayflight-offline.html')
    z.write(out/'START-HERE.txt','START-HERE.txt')
    for file in sorted(dist.rglob('*')):
        if file.is_file():z.write(file,'source/dist/'+file.relative_to(dist).as_posix())
    for test_file in sorted((root/'tests').glob('*')):
        if test_file.is_file():z.write(test_file,'source/tests/'+test_file.name)
    for name in ['README.md','PROJECT-NOTES.md','LICENSE','check.cjs','check-simbrief.cjs','export-offline.py']:
        z.write(root/name,'source/'+name)
print(json.dumps({'html':str(out/'Dayflight-offline.html'),'zip':str(archive),'html_bytes':(out/'Dayflight-offline.html').stat().st_size,'zip_bytes':archive.stat().st_size}))
