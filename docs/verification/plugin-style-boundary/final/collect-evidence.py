"""Collect this run only; fail instead of silently accepting missing evidence."""
import json
from pathlib import Path
root = Path(__file__).resolve().parent
records = [json.loads(p.read_text()) for p in sorted((root / 'computed-raw').glob('*.json'))]
assert len(records) == 32, len(records)
assert all(r['status'] == 'PASS' for r in records)
base = [r for r in records if not r.get('boundary') and not r.get('typography')]
assert len(base) == 24
explicit = [r for r in records if r.get('typography')]
assert len(explicit) == 2
assert all(r['withoutBoundary']['height'] == '42px' and r['comparisons'][0]['inside']['height'] == '36px' and r['comparisons'][0]['inside']['line-height'] == '24px' for r in explicit)
native = json.loads((root / 'runtime-native-ant.json').read_text())
assert len(native['rows']) == 8 and all(r['status'] == 'PASS' for r in native['rows'])
def save(name, value):
    target = root / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
save('typography/design-system.json', {'explicitHostTypography': explicit, 'originalDesignSystem': [r for r in base if r['scene'] in ['A', 'C']]})
save('typography/antd.json', [r for r in base if r['scene'] == 'B'])
save('modal/modal-computed-style.json', {'matchedContainers': [{'scene': r['scene'], 'width': r['width'], 'theme': r['theme'], 'locale': r['locale'], 'portal': r['portal'], 'input': r['modals']} for r in base], 'actualRuntime': native})
save('regression/plugin.json', {'status': 'PASS', 'matrix': 24, 'nestedBoundaries': 6, 'explicitTypography': 2, 'actualAntdRuntime': 8, 'records': records})
results = json.loads((root / 'regression/browser-results.json').read_text())
assert results['stats']['expected'] == 128 and results['stats']['unexpected'] == 0 and results['stats']['skipped'] == 0
save('regression/agent-ui.json', {'status': 'PASS', 'stats': results['stats'], 'coverage': ['Composer', 'Sidebar', 'Thread List', 'ToolTimeline', 'ThinkingIndicator'], 'results': 'browser-results.json'})
screenshots = root / 'modal/screenshots'
screenshots.mkdir(parents=True, exist_ok=True)
for source in (root / 'visual').rglob('*-modal-*.png'):
    source.replace(screenshots / source.name)
assert len(list(screenshots.glob('*.png'))) == 64
print('32 boundary cases + 8 actual Runtime cases + 128 official cases: PASS')
