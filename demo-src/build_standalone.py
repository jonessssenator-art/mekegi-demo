from pathlib import Path
import base64,json,re
root=Path(__file__).resolve().parent
assets={p.stem:'data:image/jpeg;base64,'+base64.b64encode(p.read_bytes()).decode() for p in (root/'assets').glob('*.jpg')}
html=(root/'index.html').read_text()
css=(root/'style.css').read_text()
js=(root/'app.js').read_text()
html=html.replace('<script src="business.js"></script>','<script>'+(root/'business.js').read_text()+'</script>')
html=html.replace('<script src="realtime.js"></script>','<script>'+(root/'realtime.js').read_text()+'</script>')
for name,data in assets.items():html=html.replace('assets/'+name+'.jpg',data)
js=re.sub(r'assets/\$\{([^}]+)\}\.jpg',lambda m:'${MEKEGI_ASSETS['+m.group(1)+']}',js)
html=html.replace('<link rel="stylesheet" href="style.css">','<style>'+css+'</style>')
html=html.replace('<script src="app.js"></script>','<script>const MEKEGI_ASSETS='+json.dumps(assets)+';\n'+js+'</script>')
output=root/'mekegi-presentation.html'
output.write_text(html)
print(str(output))
print(f'{output.stat().st_size/1024:.0f} KB; all product photos embedded')
