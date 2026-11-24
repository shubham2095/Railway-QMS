"""Convert "House Requisition Details" Excel reports (possess_report_*.xlsx) into database/data/waitlist-<UNIT>.json.
usage: python3 -I convert_waitlist.py <out_dir> <report.xlsx> [more.xlsx ...]   (rows are merged by request number)"""
import json, re, sys, openpyxl
out, files = sys.argv[1], sys.argv[2:]
sp = lambda v: re.sub(r'\s+', ' ', str(v)).strip() if v is not None else ''
def nice(s):
    s = sp(s)
    return s.title() if s and (s.isupper() or s.islower()) else s
CAT = {'essential': 'essential', 'non essential': 'non_essential', 'non-essential': 'non_essential'}
by_unit = {}
for f in files:
    ws = openpyxl.load_workbook(f, read_only=True)['House Requisition Details']
    for r in ws.iter_rows(min_row=2, values_only=True):
        if not r[1]: continue
        req = sp(r[1]); unit = req.split('/')[1] if req.count('/') >= 2 else 'NA'
        qt = re.sub(r'^TYPE-?\s*', '', sp(r[5]).upper())
        by_unit.setdefault(unit, {})[req] = dict(
            request_no=req, request_date=r[2].strftime('%Y-%m-%d') if r[2] else None, name=nice(r[3]) or None,
            designation=nice(r[4]) or None, quarter_type=qt, category=CAT.get(sp(r[6]).lower()),
            pay_scale=sp(r[7]) or None, pf_number=sp(r[8]) or None, unit=unit)
import os
for unit, rows in by_unit.items():
    path = f'{out}/waitlist-{unit}.json'
    if os.path.exists(path):  # a later report for the same unit adds to / refreshes what is already there
        old = {x['request_no']: x for x in json.load(open(path, encoding='utf-8'))}
        old.update(rows); rows = old
    rows = sorted(rows.values(), key=lambda x: (x['request_date'] or '', x['request_no']))
    json.dump(rows, open(path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(unit, len(rows))
