"""Convert the quarter master-data workbook (sheets "Master Data-I", "Master Data-II" ...) into quarters-type<TYPE>.json.
usage: python3 -I convert_quarters.py <out_dir> <Master_Data.xlsx>"""
import json, re, sys, collections, openpyxl
out, src = sys.argv[1], sys.argv[2]
sp = lambda v: re.sub(r'\s+', ' ', str(v)).strip() if v is not None else ''
POOL = {'div': 'Div', 'hq': 'HQ', 'rpf': 'RPF', 'med': 'Med', 'med.': 'Med', 'dy cmm': 'Dy CMM', 'dy.cmm': 'Dy CMM', 'c.rly': 'C.Rly',
        'nrmu': 'NRMU', 'rb': 'RB', 'const': 'Const', 'const.': 'Const', 'plw': 'PLW', 'wcr': 'WCR', 'ncr': 'NCR', 'irca': 'IRCA',
        'urmu': 'URMU', 'cms': 'CMS', 'nmo': 'NMO', 'airf': 'AIRF', 'drp': 'DRP', 'fta': 'FTA', 'w.rly': 'W.Rly', 'icf': 'ICF',
        'rcf': 'RCF', 'tkd': 'TKD', 'tmc': 'TMC', 'civ': 'Civ', 'union': 'Union', 'eastern rly': 'Eastern Rly'}
OFFICE = ('office', 'barrak', 'baric', 'police', 'union', 'nrmu', 'urmu', 'airf', 'nrwwo', 'branch', 'secy', 'sect', 'sanitary', 'protocol', 'n.r.m.u')
def status(raw):
    l = raw.lower()
    if l in ('', 'vacant', 'vavant', 'vacated'): return 'vacant', ''
    if l.startswith('occupied'): return 'occupied', '' if l == 'occupied' else raw
    if any(k in l for k in ('unsafe', 'dismant', 'dismen', 'demolish', 'abandon', 'seal', 'no record')): return 'under_maintenance', raw
    if any(k in l for k in OFFICE): return 'reserved', raw
    if l.startswith('vacant'): return 'vacant', raw
    return 'occupied', raw  # a name / an allotment letter
wb = openpyxl.load_workbook(src, read_only=True)
# Types III and up are checked against what is already loaded: a quarter that is repeated in its own sheet, or that is
# already listed under an earlier type (same colony + number), is NOT added again; every such row goes to the report.
# (Types I and II keep their rows as first loaded, repeated numbers renamed "(dup2)".)
CHECKED = ('III', 'IV', 'V', 'VI')
taken = {}            # (colony, number) -> 'Type X (sheet row n)'
skipped = []          # rows not added
key_of = lambda colony, num: (colony.strip().lower(), re.sub(r'\s+', '', num).lower())
for ws in wb:
    if not re.fullmatch(r'Master Data-.*', ws.title.strip()): continue
    rows = list(ws.iter_rows(values_only=True))
    h = next(i for i, r in enumerate(rows) if any(sp(c).lower().startswith('colony') for c in r))
    head = [sp(c).lower() for c in rows[h]]
    ix = lambda *keys: next((j for j, c in enumerate(head) if any(k in c for k in keys)), None)
    c_col, c_blk, c_no, c_st, c_pool, c_fa, c_typ = ix('colony'), ix('block'), ix('qtr no'), ix('occupant', 'current status', 'status'), ix('pool'), ix('father'), ix('type of')
    seen = collections.Counter(); by_type = collections.defaultdict(list); stats = collections.Counter()
    sheet_type = (re.fullmatch(r'Master Data-(I|II|III|IV|V|VI)', ws.title.strip()) or [None, None])[1]
    for r in rows[h + 1:]:
        if not sp(r[c_col]): continue   # colony heading rows carry no quarter
        row_type = re.sub(r'\(.*', '', sp(r[c_typ])).strip().upper() if c_typ is not None else ''
        qtype = sheet_type or row_type
        if qtype not in ('I', 'II', 'III', 'IV', 'V', 'VI'):
            print(f'  skipped row with unknown type {sp(r[c_typ])!r}: {sp(r[c_col])} {sp(r[c_blk])}/{sp(r[c_no])}'); continue
        col, blk, no = sp(r[c_col]), sp(r[c_blk]), sp(r[c_no])
        num = '/'.join(x for x in (blk, no) if x) or f'#{sp(r[0])}'
        k = key_of(col, num)
        if qtype in CHECKED:
            if k in taken:
                skipped.append((qtype, col, num, sp(r[0]), taken[k])); continue
        else:
            seen[(qtype, col, num)] += 1
            if seen[(qtype, col, num)] > 1: num = f'{num} (dup{seen[(qtype, col, num)]})'
        taken.setdefault(k, f'Type {qtype} (no. {sp(r[0])})')
        st, note = status(sp(r[c_st]))
        pool = sp(r[c_pool]) if c_pool is not None else ''
        pool = POOL.get(pool.lower(), pool) or None
        notes = []
        if c_typ is not None and 'peela' in sp(r[c_typ]).lower(): notes.append('Peela')
        if note and st == 'occupied' and not note.lower().startswith(('occupied', 'alloted', 'qtr')): note = f'Occupant: {note}'
        if note: notes.append(note)
        if c_fa is not None and sp(r[c_fa]): notes.append(f'Father/Husband: {sp(r[c_fa])}')
        stats[(qtype, st)] += 1
        by_type[qtype].append(dict(sno=r[0], colony=col, block=blk or None, number=num, status=st, pool=pool, remarks='; '.join(notes) or None))
    for qtype, out_rows in by_type.items():
        json.dump(out_rows, open(f'{out}/quarters-type{qtype}.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        st = {k[1]: v for k, v in stats.items() if k[0] == qtype}
        print(f'{ws.title.strip()} -> Type {qtype}: {len(out_rows)} quarters {st}; renamed duplicates: {sum(1 for r in out_rows if "(dup" in r["number"])}')

if skipped:
    import csv
    with open(f'{out}/quarters-duplicates-report.csv', 'w', newline='', encoding='utf-8-sig') as fh:
        w = csv.writer(fh); w.writerow(['Type', 'Colony', 'Quarter no.', 'S.No in sheet', 'NOT ADDED because it already exists as'])
        for row in skipped: w.writerow(row)
    print(f'not added (already exist): {len(skipped)} -> quarters-duplicates-report.csv')
    for row in skipped: print('  ', row)
