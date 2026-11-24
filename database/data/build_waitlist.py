"""Build the pending-request lists (waitlist-<UNIT>.json) from any number of "House Requisition" Excel reports.

usage: python3 -I build_waitlist.py <out_dir> <file-or-folder> [more ...]

Reads both report layouts (sheet "House Requisition Details" and the older "House Requisition"), then:
  * the same request number seen in several reports (older snapshots) counts once;
  * the same employee (PF number) with the same quarter type more than once -> only the entry with the OLDEST
    request date is kept (a later one is dropped); the same PF in different quarter types is kept as is;
  * rows without a PF number cannot be matched, so they are always kept.
A CSV of everything that was dropped is written next to the JSON files."""
import csv, glob, json, os, re, sys
import openpyxl

out, srcs = sys.argv[1], sys.argv[2:]
files = []
for s in srcs:
    files += sorted(glob.glob(os.path.join(s, '**', '*.xlsx'), recursive=True)) if os.path.isdir(s) else [s]

sp = lambda v: re.sub(r'\s+', ' ', str(v)).strip() if v is not None else ''
def nice(s):
    s = sp(s)
    return s.title() if s and (s.isupper() or s.islower()) else s
CAT = {'essential': 'essential', 'non essential': 'non_essential', 'non-essential': 'non_essential'}
def pf_key(v):
    k = re.sub(r'[^0-9A-Z]', '', sp(v).upper())
    return k.lstrip('0') or None if k else None

records = {}                      # request_no -> record (first seen wins; fields filled from later copies)
seen_in = {}
for f in files:
    wb = openpyxl.load_workbook(f, read_only=True)
    sheet = next((n for n in ('House Requisition Details', 'House Requisition') if n in wb.sheetnames), None)
    if not sheet: print('skipped (no requisition sheet):', os.path.basename(f)); continue
    rows = list(wb[sheet].iter_rows(values_only=True))
    head = ' '.join(sp(c) for r in rows[:3] for c in r if c)
    if 'Report Information' in wb.sheetnames:
        head += ' ' + ' '.join(sp(c) for r in wb['Report Information'].iter_rows(values_only=True) for c in r if c)
    m = re.search(r'House Type:\s*TYPE-?\s*([IVX]+)', head); rtype = m.group(1) if m else ''
    m = re.search(r'Category:\s*(Essential|Non[ -]Essential)', head, re.I); rcat = CAT.get(m.group(1).lower().replace('  ', ' ')) if m else None
    for r in rows:
        if not r[1] or not str(r[1]).startswith('DRM/') or not hasattr(r[2], 'strftime'): continue
        req = sp(r[1]); unit = req.split('/')[1]
        qt = re.sub(r'^TYPE-?\s*', '', sp(r[5]).upper()) or rtype
        rec = dict(request_no=req, request_date=r[2].strftime('%Y-%m-%d'), name=nice(r[3]) or None, designation=nice(r[4]) or None,
                   quarter_type=qt, category=CAT.get(sp(r[6]).lower().replace('  ', ' ')) or (rcat if rtype and rcat else None),
                   pay_scale=sp(r[7]) or None, pf_number=sp(r[8]) or None, unit=unit)
        old = records.get(req)
        if old:
            for k, v in rec.items():
                if old.get(k) in (None, '') and v: old[k] = v
        else:
            records[req] = rec
        seen_in.setdefault(req, set()).add(os.path.basename(f))

# --- duplicates: same PF + same type -> keep the oldest request
groups = {}
for rec in records.values():
    k = pf_key(rec['pf_number'])
    if k: groups.setdefault((k, rec['quarter_type']), []).append(rec)
dropped = []
for (k, qt), lst in groups.items():
    if len(lst) < 2: continue
    lst.sort(key=lambda x: (x['request_date'], x['request_no']))
    keep = lst[0]
    for d in lst[1:]:
        for fld in ('name', 'designation', 'category', 'pay_scale'):
            if not keep.get(fld) and d.get(fld): keep[fld] = d[fld]
        dropped.append((keep, d))
        records.pop(d['request_no'], None)

by_unit = {}
for rec in records.values(): by_unit.setdefault(rec['unit'], []).append(rec)
for unit, rows in by_unit.items():
    rows.sort(key=lambda x: (x['request_date'], x['request_no']))
    json.dump(rows, open(os.path.join(out, f'waitlist-{unit}.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
with open(os.path.join(out, 'waitlist-duplicates-report.csv'), 'w', newline='', encoding='utf-8-sig') as fh:
    w = csv.writer(fh)
    w.writerow(['PF number', 'Quarter type', 'KEPT request no', 'KEPT date', 'DROPPED request no', 'DROPPED date', 'Name'])
    for keep, d in sorted(dropped, key=lambda x: x[0]['pf_number'] or ''):
        w.writerow([keep['pf_number'], keep['quarter_type'], keep['request_no'], keep['request_date'], d['request_no'], d['request_date'], keep['name']])
import collections
print(f'files read: {len(files)}; distinct requests: {len(records) + len(dropped)}; duplicates dropped: {len(dropped)}; kept: {len(records)}')
print('by unit:', {u: len(r) for u, r in by_unit.items()})
print('by type:', dict(sorted(collections.Counter(r['quarter_type'] for r in records.values()).items())))
print('without PF:', sum(1 for r in records.values() if not pf_key(r['pf_number'])))
