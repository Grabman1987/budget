"""Validate documentation traceability without executing product or upstream code.

Run: python docs/research/rea/validate-research.py
Only standard-library reads; prints counts and failures, never source financial data.
"""
from __future__ import annotations

import csv
import json
import re
from collections import Counter
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
REQUIRED = ('id name description user_problem benefit source_url source_locator '
            'retrieved_at version evidence_status uncertainty').split()
STATUSES = {'present', 'partial', 'missing', 'different', 'deferred', 'not-useful'}
errors: list[str] = []


def check(condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


def read_csv(path: Path) -> list[dict]:
    if not path.exists():
        errors.append(f'Missing {path.relative_to(ROOT)}')
        return []
    with path.open(encoding='utf-8-sig', newline='') as f:
        rows = list(csv.DictReader(f))
    for index, row in enumerate(rows, 2):
        check(None not in row and all(v is not None for v in row.values()),
              f'Malformed CSV {path.name}:{index}')
    return rows


features: dict[str, dict] = {}
counts = {}
for name in ('ynab', 'toolkit', 'actual', 'portfolio-performance'):
    rows = read_csv(HERE / 'inventories' / f'{name}.csv')
    counts[name] = len(rows)
    for r in rows:
        check(all(r.get(k, '').strip() for k in REQUIRED), f'Incomplete inventory {r.get("id")}')
        fid = r.get('id', '')
        check(fid not in features, f'Duplicate feature {fid}')
        features[fid] = r
        check(r.get('evidence_status') in {'observed', 'source-confirmed', 'documented', 'inferred'},
              f'Invalid evidence {fid}')
        check(r.get('retrieved_at') == '2026-10-15', f'Unexpected retrieval date {fid}')
        parsed = urlparse(r.get('source_url', ''))
        check(parsed.scheme == 'https' and bool(parsed.netloc) and ' ' not in r.get('source_url', ''),
              f'Noncanonical primary URL {fid}')

matrix = read_csv(ROOT / 'docs/product/feature-matrix/features.csv')
mapped = Counter(r.get('feature_id') for r in matrix)
check(set(mapped) == set(features), 'Matrix membership differs from inventory')
check(all(n == 1 for n in mapped.values()), 'Matrix duplicate IDs')
caps = {r['id']: r for r in read_csv(ROOT / 'docs/product/feature-matrix/capabilities.csv')}
specs = {p.stem[:8]: p for p in (ROOT / 'docs/product/specs').glob('SPEC-*.md')}
packages = {r['id']: r for r in read_csv(ROOT / 'docs/product/roadmap/work-packages.csv')}
for r in matrix:
    fid = r.get('feature_id', '')
    check(r.get('status') in STATUSES, f'Invalid disposition {fid}')
    check(r.get('capability_id') in caps, f'Unknown capability {fid}')
    check(bool(r.get('decision', '').strip()) and bool(r.get('difference', '').strip()),
          f'Missing decision/difference {fid}')
    for evidence in r.get('budget_evidence', '').split(';'):
        path = evidence.strip().split(':', 1)[0]
        check(bool(path) and (ROOT / path).is_file(), f'Unresolved Budget evidence {fid}: {path}')
    sid, wid = r.get('spec_id'), r.get('work_package_id')
    if r.get('status') in {'deferred', 'not-useful'}:
        check(sid == '-' and wid == '-', f'Excluded alternative has implementation promise {fid}')
    if sid != '-':
        check(sid in specs, f'Unknown specification {fid}: {sid}')
        check(wid in packages, f'Unknown work package {fid}: {wid}')
    else:
        check(wid == '-', f'Package without specification {fid}')

for sid, path in specs.items():
    content = path.read_text(encoding='utf-8')
    fields = re.findall(r'^## (\d+)\.', content, re.M)
    check(fields == [str(i) for i in range(1, 16)], f'{sid} missing/duplicate specification fields')
    check(bool(re.search(r'AC-' + sid[-3:] + r'-\d+', content)), f'{sid} lacks acceptance IDs')
    check(bool(re.search(r'WP-\d{3}', content)), f'{sid} lacks work-package trace')

for wid, r in packages.items():
    for sid in r.get('spec_ids', '').split(';'):
        check(sid in specs, f'{wid} unknown spec {sid}')
    for cid in r.get('capability_ids', '').split(';'):
        check(cid in caps, f'{wid} unknown capability {cid}')
    for dep in r.get('depends_on', '').split(';'):
        if dep != '-':
            check(dep in packages and dep != wid, f'{wid} invalid dependency {dep}')
    for acceptance in r.get('acceptance_ids', '').split(';'):
        sid = 'SPEC-' + acceptance.split('-')[1] if '-' in acceptance else ''
        check(sid in specs and acceptance in specs[sid].read_text(encoding='utf-8'),
              f'{wid} invalid acceptance {acceptance}')

visiting, visited = set(), set()


def visit_package(wid: str) -> None:
    if wid in visiting:
        errors.append(f'Cyclic dependency at {wid}')
        return
    if wid in visited or wid not in packages:
        return
    visiting.add(wid)
    for dep in packages[wid].get('depends_on', '').split(';'):
        if dep != '-':
            visit_package(dep)
    visiting.remove(wid)
    visited.add(wid)


for wid in packages:
    visit_package(wid)

files = list(HERE.rglob('*.md')) + list((ROOT / 'docs/product').rglob('*.md'))
for path in files:
    content = path.read_text(encoding='utf-8')
    check(not re.search(r'app\.ynab\.com/[0-9a-f]{8}-[0-9a-f-]{27,}', content, re.I),
          f'Private YNAB identifier in {path.name}')
    check(not re.search(r'C:[/\\]Users[/\\]', content, re.I), f'Local user path in {path.name}')
    for target in re.findall(r'\[[^\]]*\]\(([^)]+)\)', content):
        target = target.strip('<>')
        if re.match(r'^[a-z][a-z0-9+.-]*:', target, re.I) or target.startswith('#'):
            continue
        bare = unquote(target.split('#', 1)[0])
        if bare:
            check((path.parent / bare).exists(), f'Broken local link {path.name}: {target}')

for path in list(HERE.rglob('*.csv')) + list(HERE.rglob('*.json')) + list((ROOT / 'docs/product').rglob('*.csv')):
    content = path.read_text(encoding='utf-8-sig')
    check(not re.search(r'app\.ynab\.com/[0-9a-f]{8}-[0-9a-f-]{27,}', content, re.I),
          f'Private YNAB identifier in {path.name}')
    check(not re.search(r'C:[/\\]Users[/\\]', content, re.I), f'Local user path in {path.name}')

manifest = json.loads((HERE / 'source-manifest.json').read_text(encoding='utf-8'))
check(len(manifest['products']) == 4, 'Source manifest product count')
print(json.dumps({'inventory_counts': counts, 'total_records': len(features),
                  'matrix_rows': len(matrix), 'capabilities': len(caps), 'specifications': len(specs),
                  'work_packages': len(packages),
                  'matrix_dispositions': dict(Counter(r['status'] for r in matrix)), 'errors': errors}, indent=2))
raise SystemExit(1 if errors else 0)
