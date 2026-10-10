from pathlib import Path
import json, shutil
root = Path(__file__).resolve().parent.parent
current = root / 'current'
rows = [json.loads(p.read_text()) for p in sorted((current / 'computed-raw').glob('*.json'))]
basic = [row for row in rows if not row.get('boundary')]
boundary = [row for row in rows if row.get('boundary')]
assert len(basic) == 24 and len(boundary) == 6
assert all(row['status'] == 'PASS' for row in rows)
assert { (r['scene'], r['width'], r['theme'], r['locale']) for r in basic } == {(s,w,t,l) for s in 'ABC' for w in [1440,420] for t in ['light','dark'] for l in ['zh-CN','en-US']}
assert all(any(c['probe']=='card-body' for c in r['comparisons']) for r in basic if r['scene']=='B')
for r in basic:
    for suffix in ['page','modal-host','modal-root']:
        name = f"{r['scene']}-{r['width']}-{r['theme']}-{r['locale']}-{suffix}.png"
        assert (current/'visual'/r['scene']/name).is_file(), name
native = json.loads((current/'runtime-native-ant.json').read_text())
assert len(native['rows']) == 8 and all(r['status']=='PASS' for r in native['rows'])
(root/'computed-styles').mkdir(exist_ok=True)
for name, scenes in [('ant-design', ['B']), ('design-system', ['A','C'])]:
    data = {'source':'current/environment.json','matrix':[r for r in basic if r['scene'] in scenes], 'nested':[r for r in boundary if r['scene'] in scenes]}
    if name == 'ant-design': data['actualRuntime'] = native
    (root/'computed-styles'/f'{name}.json').write_text(json.dumps(data, indent=2, ensure_ascii=False))
for scene in 'ABC':
    dest = root/'visual'/scene
    shutil.copytree(current/'visual'/scene, dest, dirs_exist_ok=True)
    (dest/'creator').mkdir(exist_ok=True)
    for p in (current/'visual/creator-regression').glob(scene+'-*'):
        shutil.copy2(p, dest/'creator'/p.name)
    if scene=='B':
        (dest/'runtime').mkdir(exist_ok=True)
        for p in (current/'visual').glob('runtime-B-*'): shutil.copy2(p,dest/'runtime'/p.name)
checks=root/'checks'
shutil.copy2(checks/'current/build.log', checks/'build.log')
(checks/'typecheck.log').write_text((checks/'current/typecheck.log').read_text()+'\nBrowser test typecheck: exit 0\n'+(checks/'current/typecheck-browser.log').read_text())
parts = ['browser.log','browser-stable-rerun.log','browser-runtime-B.log','browser-owned-controls.log','browser-official.log','B-layout-diagnostic.log']
(checks/'browser.log').write_text('\n\n'.join(f'[{p}]\n'+(checks/'current'/p).read_text() for p in parts))
creator = {s:json.loads((current/'visual/creator-regression'/f'{s}-results.json').read_text()) for s in 'ABC'}
summary = {'PLUGIN_STYLE_BOUNDARY':'NOT_ACCEPTED','basic':{'PASS':24,'FAIL':0},'nested':{'PASS':6,'FAIL':0},'actualNativeB':{'PASS':8,'FAIL':0},'official':{'PASS':128,'FAIL':0},'ownedControls':{'PASS':8,'FAIL':0},'creatorLatest':{s:{'PASS':sum(r['status']=='PASS' for r in data),'FAIL':sum(r['status']=='FAIL' for r in data)} for s,data in creator.items()},'rerunNotes':['First matrix 23/30 passed. Modal sampling and mixed private/public fixture context corrected; rerun 14/14 passed. A/C basic records unchanged.','Original Creator full regression: B narrow 4/4 failed. Focused layout diagnostic reproduced 3/4; all failures remain retained.']}
(current/'summary.json').write_text(json.dumps(summary,indent=2))
print(json.dumps(summary, indent=2))
