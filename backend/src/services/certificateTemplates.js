import { escapeHtml as e, titleCase } from '../utils/helpers.js';
import { certificateLabel } from '../domain.js';

const dateLabel = () =>
  new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const flat = (value) =>
  value && typeof value === 'object'
    ? Object.entries(value)
        .map(([k, v]) => (v !== null && typeof v === 'object' ? k : `${k}: ${v}`))
        .join(', ')
    : (value ?? '');

const page = ({ title, accent, bg, body }) => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>${e(title)}</title>
    <style>
        * { box-sizing: border-box; }
        body { font-family: "DejaVu Sans", Arial, sans-serif; color:#1a1a1a; margin:0; padding:40px; }
        .sheet { max-width:760px; margin:0 auto; border:2px solid ${accent}; padding:36px 44px; }
        .head { text-align:center; border-bottom:2px solid ${accent}; padding-bottom:16px; margin-bottom:24px; }
        .head h1 { margin:0; font-size:20px; color:${accent}; letter-spacing:1px; }
        .head p { margin:4px 0 0; font-size:12px; color:#555; }
        .title { text-align:center; font-size:17px; font-weight:bold; text-transform:uppercase; margin:24px 0; letter-spacing:2px; }
        .meta { display:flex; justify-content:space-between; font-size:13px; margin-bottom:24px; }
        .body { font-size:14px; line-height:1.7; margin-top:18px; }
        table { width:100%; border-collapse:collapse; font-size:13px; margin:16px 0; }
        th, td { text-align:left; padding:8px 10px; border:1px solid #ddd; vertical-align:top; }
        th { background:${bg}; width:32%; color:${accent}; }
        .sign { margin-top:64px; display:flex; justify-content:space-between; font-size:13px; }
        .sign.right { justify-content:flex-end; }
        .sign .line { display:inline-block; border-top:1px solid #333; padding-top:6px; min-width:220px; text-align:center; }
        .foot { margin-top:32px; font-size:11px; color:#888; text-align:center; }
        @media print { body { padding:0; } }
    </style>
</head>
<body>
${body}
</body>
</html>`;

const templates = {
  allotment_order({ data, number }) {
    const q = data.quarter ?? {};
    const emp = data.employee ?? {};
    return page({
      title: `Allotment Order - ${number}`,
      accent: '#1e3a8a',
      bg: '#eef2ff',
      body: `<div class="sheet">
    <div class="head"><h1>INDIAN RAILWAYS - ESTATE OFFICE</h1></div>
    <div class="title">Allotment Order</div>
    <div class="meta">
        <span><strong>Order No:</strong> ${e(data.allotment_order_no ?? number)}</span>
        <span><strong>Date:</strong> ${dateLabel()}</span>
    </div>
    <div class="body">
        <p>Sanction is hereby accorded for the allotment of the railway quarter detailed
        below, subject to the rules governing railway residential accommodation and the
        terms of occupation in force.</p>
        <table>
            <tr><th>Quarter Number</th><td>${e(q.quarter_number ?? '—')}</td></tr>
            <tr><th>Quarter Type</th><td>${e(q.quarter_type ?? '—')}</td></tr>
            <tr><th>Colony</th><td>${e(q.colony_name ?? '—')}</td></tr>
            <tr><th>Station</th><td>${e(q.station ?? '—')}</td></tr>
            <tr><th>Allottee (Employee ID)</th><td>${e(emp.employee_id ?? '—')}</td></tr>
            <tr><th>Designation</th><td>${e(emp.designation ?? '—')}</td></tr>
        </table>
        <p>The allottee shall take possession within the stipulated period, failing which
        this allotment is liable to be cancelled.</p>
    </div>
    <div class="sign right"><span class="line">Estate Officer</span></div>
</div>`,
    });
  },

  vacation_noc({ data, number }) {
    return page({
      title: `Vacation NOC - ${number}`,
      accent: '#14532d',
      bg: '#f0fdf4',
      body: `<div class="sheet">
    <div class="head"><h1>INDIAN RAILWAYS - ESTATE OFFICE</h1></div>
    <div class="title">No Objection Certificate (Vacation)</div>
    <div class="meta">
        <span><strong>NOC No:</strong> ${e(number)}</span>
        <span><strong>Date:</strong> ${dateLabel()}</span>
    </div>
    <div class="body">
        <p>This is to certify that all departmental clearances - quarter inspection,
        electrical, water and accounts - in respect of vacation reference
        <strong>${e(data.reference_no ?? '—')}</strong> have been duly completed and
        no objection remains for the vacation/handover of the said railway quarter.</p>
        <p>No dues are outstanding against the occupant as on the date of this certificate.</p>
    </div>
    <div class="sign right"><span class="line">Estate Officer</span></div>
</div>`,
    });
  },

  generic({ type, data, number }) {
    const rows = Object.entries(data ?? {})
      .map(([k, v]) => `<tr><th>${e(titleCase(k))}</th><td>${e(flat(v))}</td></tr>`)
      .join('\n                ');
    const label = certificateLabel(type);
    return page({
      title: `${label} - ${number}`,
      accent: '#14532d',
      bg: '#f0fdf4',
      body: `<div class="sheet">
    <div class="head">
        <h1>INDIAN RAILWAYS</h1>
        <p>Railway Quarter Management System</p>
    </div>
    <div class="meta">
        <span><strong>Certificate No:</strong> ${e(number)}</span>
        <span><strong>Date:</strong> ${dateLabel()}</span>
    </div>
    <div class="title">${e(label)}</div>
    ${rows ? `<table>\n                ${rows}\n            </table>` : ''}
    <p style="font-size:13px;margin-top:24px;">
        This document is generated by the Railway Quarter Management System and is
        valid as an official record of the above transaction in respect of railway
        residential accommodation.
    </p>
    <div class="sign">
        <div><div class="line">Issued By</div></div>
        <div><div class="line">Estate Officer</div></div>
    </div>
    <div class="foot">System-generated document · ${e(label)} · ${e(number)}</div>
</div>`,
    });
  },
};

export function renderCertificate(type, data, number) {
  return (templates[type] ?? templates.generic)({ type, data, number });
}
