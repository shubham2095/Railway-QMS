"""Convert the gazetted officers' priority-list workbook (one sheet per list: Transit, Type-IV, Type-IV Spl, Type-V ...)
into database/data/waitlist-GAZETTED.json.   usage: python3 -I convert_gazetted.py <out_dir> <priority.xlsx>"""
import json, re, sys, openpyxl
out, src = sys.argv[1], sys.argv[2]
sp = lambda v: re.sub(r'\s+', ' ', str(v)).strip() if v is not None else ''
LISTS = {  # sheet title (stripped, lower) -> (list name, quarter_type)
    'transit': ('Gazetted Transit flat', 'TRANSIT'), 'type-iv': ('Gazetted Type-IV', 'IV'), 'type-iv spl.': ('Gazetted Type-IV Spl', 'IV SPL'),
    'type v (safdarjung)': ('Gazetted Type-V Safdarjung', 'V'), 'type v': ('Gazetted Type-V', 'V'), 'type vi': ('Gazetted Type-VI', 'VI'),
}
DATE = re.compile(r'(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})')
def iso(d, m, y): return f'{int(y):04d}-{int(m):02d}-{int(d):02d}'
def hdr(c): return sp(c).lower()
rows_out, problems = [], []
wb = openpyxl.load_workbook(src, read_only=True)
for ws in wb:
    key = ws.title.strip().lower()
    if key not in LISTS: problems.append(f'skipped sheet {ws.title!r}'); continue
    list_name, qtype = LISTS[key]
    rows = list(ws.iter_rows(values_only=True))
    h = next(i for i, r in enumerate(rows) if any(hdr(c) == 'name of officer' for c in r))
    head = rows[h]
    col = lambda *names: next((j for j, c in enumerate(head) if any(hdr(c).startswith(n) for n in names)), None)
    c_name, c_des, c_reg = col('name of officer'), col('desig'), col('reg')
    c_present = col('present flat', 'currently occupied')
    c_place = col('place of registration')
    # place-of-registration columns: every "Place of Registration ..." header plus the unnamed columns right after it
    place_cols = []
    if c_place is not None:
        for j in range(c_place, len(head)):
            if hdr(head[j]).startswith('place of registration') or not hdr(head[j]): place_cols.append(j)
            else: break
    c_contact, c_remarks, c_scale = col('contact'), col('remarks'), col('scale', 'grade', "officer's grade")
    mapped = {c_name, c_des, c_reg, c_present, c_contact, c_remarks, c_scale, c_name - 1, *place_cols} - {None}
    seq = 0
    for i, r in enumerate(rows[h + 1:], start=h + 1):
        name = sp(r[c_name]) if len(r) > c_name else ''
        if not name or not isinstance(r[c_name - 1], (int, float)): continue
        regtxt = sp(r[c_reg]); dates = DATE.findall(regtxt)
        if not dates: problems.append(f'{ws.title}: no date for {name!r} ({regtxt!r})'); continue
        eff = iso(*dates[-1])                       # a later "date of refusal" is the date the priority counts from
        places = [sp(r[j]) for j in place_cols if j < len(r) and sp(r[j]) and sp(r[j]) not in 'ABCDEF']
        contact, notes = None, []
        for j in (c_contact, c_remarks):
            if j is None or j >= len(r) or r[j] in (None, ' ', ''): continue
            v = sp(r[j])
            if re.fullmatch(r'\d{10}', v): contact = v
            else: notes.append(v)
        for j, c in enumerate(r):
            if j not in mapped and sp(c) and j > c_name: notes.append(sp(c))
        if len(dates) > 1 or regtxt != '.'.join(dates[0]) and not re.fullmatch(r'\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4}', regtxt):
            notes.insert(0, f'Registered: {regtxt}')
        seq += 1
        rows_out.append(dict(
            request_no=f"GZ/{qtype.replace(' ', '')}/{eff}/{re.sub(r'[^a-z]', '', name.lower())[:30]}", request_date=eff, name=name,
            designation=sp(r[c_des]) or None, quarter_type=qtype, category=None, pay_scale=sp(r[c_scale]) or None if c_scale is not None else None,
            pf_number=None, unit='GAZETTED', list_name=list_name, staff_kind='gazetted',
            present_accommodation=sp(r[c_present]) or None if c_present is not None else None,
            preferred_colonies=' | '.join(places) or None, contact_no=contact, remarks='; '.join(notes) or None, sheet_no=seq))
# unique request numbers (same officer twice on a list with the same date)
seen = {}
for x in rows_out:
    n = seen.get(x['request_no'], 0); seen[x['request_no']] = n + 1
    if n: x['request_no'] += f'/{n + 1}'
by = {}
for x in rows_out: by.setdefault(x['list_name'], []).append(x)
for l, xs in by.items():
    order = [x['request_date'] for x in xs]
    flag = '' if order == sorted(order) else '  (sheet order differs from date order)'
    print(f'{l}: {len(xs)}{flag}')
json.dump(rows_out, open(f'{out}/waitlist-GAZETTED.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('problems:', problems)
