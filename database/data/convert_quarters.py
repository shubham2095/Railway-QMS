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
    if any(k in l for k in ('unsafe', 'dismant', 'dismen', 'abandon', 'seal', 'no record')): return 'under_maintenance', raw
    if any(k in l for k in OFFICE): return 'reserved', raw
    if l.startswith('vacant'): return 'vacant', raw
    return 'occupied', raw  # a name / an allotment letter
wb = openpyxl.load_workbook(src, read_only=True)
for ws in wb:
    m = re.fullmatch(r'Master Data-(I|II|III|IV|V|VI)', ws.title.strip())
    if not m: continue
    qtype = m.group(1)
    rows = list(ws.iter_rows(values_only=True))
    h = next(i for i, r in enumerate(rows) if any(sp(c).lower().startswith('colony') for c in r))
    head = [sp(c).lower() for c in rows[h]]
    ix = lambda *keys: next((j for j, c in enumerate(head) if any(k in c for k in keys)), None)
    c_col, c_blk, c_no, c_st, c_pool, c_fa, c_typ = ix('colony'), ix('block'), ix('qtr no'), ix('occupant', 'current status', 'status'), ix('pool'), ix('father'), ix('type of')
    seen = collections.Counter(); out_rows = []; stats = collections.Counter()
    for r in rows[h + 1:]:
        if not sp(r[c_col]): continue
        col, blk, no = sp(r[c_col]), sp(r[c_blk]), sp(r[c_no])
        num = '/'.join(x for x in (blk, no) if x) or f'#{sp(r[0])}'
        seen[(col, num)] += 1
        if seen[(col, num)] > 1: num = f'{num} (dup{seen[(col, num)]})'
        st, note = status(sp(r[c_st]))
        pool = sp(r[c_pool]) if c_pool is not None else ''
        pool = POOL.get(pool.lower(), pool) or None
        notes = []
        if c_typ is not None and 'peela' in sp(r[c_typ]).lower(): notes.append('Peela')
        if note and st == 'occupied' and not note.lower().startswith(('occupied', 'alloted', 'qtr')): note = f'Occupant: {note}'
        if note: notes.append(note)
        if c_fa is not None and sp(r[c_fa]): notes.append(f'Father/Husband: {sp(r[c_fa])}')
        stats[st] += 1
        out_rows.append(dict(sno=r[0], colony=col, block=blk or None, number=num, status=st, pool=pool, remarks='; '.join(notes) or None))
    json.dump(out_rows, open(f'{out}/quarters-type{qtype}.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'Type {qtype}: {len(out_rows)} quarters {dict(stats)}; renamed duplicates: {sum(1 for r in out_rows if "(dup" in r["number"])}')
