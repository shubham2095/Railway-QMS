import { Link, useParams } from 'react-router-dom';
import { useHeader } from '../components/Layout.jsx';
import { Async, Card, Dl, Pill } from '../components/ui.jsx';
import { CATEGORIES, SERVICE_TYPES, quarterTypeLabel } from '../lib/constants.js';
import { fmtDate, inr } from '../lib/format.js';
import { useApi } from '../lib/hooks.js';

export default function EmployeeDetail() {
  const { id } = useParams();
  const q = useApi(`/employees/${id}`);
  useHeader(q.data ? q.data.user.name : 'Employee', 'Employee profile');

  return (
    <Async q={q}>
      {({ profile: p, user, family_members: family, applications }) => {
        return (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Card title="Personal details">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
                  <Dl label="Full name">{user.name}</Dl>
                  <Dl label="Email ID">{user.email}</Dl>
                  <Dl label="Phone number">{user.mobile}</Dl>
                  <Dl label="Father's name">{p.father_name}</Dl>
                  <Dl label="Date of birth">{fmtDate(p.date_of_birth)}</Dl>
                  <Dl label="Account">{user.is_active ? 'Active' : 'Inactive'}</Dl>
                  <Dl label="Current address" className="col-span-2 whitespace-pre-line sm:col-span-3">{p.current_address}</Dl>
                </dl>
              </Card>

              <Card title="Service details">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
                  <Dl label="Employee ID" mono>{p.employee_id}</Dl>
                  <Dl label="PF number" mono>{p.pf_number}</Dl>
                  <Dl label="Designation">{p.designation}</Dl>
                  <Dl label="Department">{p.department}</Dl>
                  <Dl label="Station">{p.station}</Dl>
                  <Dl label="Division">{p.division}</Dl>
                  <Dl label="Railway zone">{p.railway_zone}</Dl>
                  <Dl label="Category">{CATEGORIES[p.category]}</Dl>
                  <Dl label="Service type">{SERVICE_TYPES[p.service_type]}</Dl>
                  <Dl label="Grade pay">{p.grade_pay != null ? inr(p.grade_pay) : null}</Dl>
                  <Dl label="Pay level">{p.pay_level}</Dl>
                  <Dl label="Date of joining">{fmtDate(p.date_of_joining)}</Dl>
                  <Dl label="Retirement date">{fmtDate(p.retirement_date)}</Dl>
                  <Dl label="Service years">{`${p.service_years} yr`}</Dl>
                </dl>
              </Card>

              <Card title="Family details">
                {family.length === 0 ? <p className="text-sm text-slate-400">No family members recorded.</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-400"><th className="pb-2 font-medium">Name</th><th className="pb-2 font-medium">Relation</th><th className="pb-2 font-medium">Date of birth</th><th className="pb-2 font-medium">Dependent</th></tr></thead>
                      <tbody>
                        {family.map((m) => (
                          <tr key={m.id} className="border-t border-edge">
                            <td className="py-2.5 font-medium text-ink">{m.name}</td><td className="py-2.5 text-slate-600">{m.relation}</td>
                            <td className="py-2.5 text-slate-600">{fmtDate(m.date_of_birth)}</td><td className="py-2.5 text-slate-600">{m.is_dependent ? 'Yes' : 'No'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>

            <div className="space-y-6">
              <Card title="Applications">
                {applications.length === 0 ? <p className="text-sm text-slate-400">No applications yet.</p> : (
                  <div className="space-y-2">
                    {applications.map((a) => (
                      <Link key={a.id} to={`/applications/${a.id}`} className="flex items-center justify-between rounded-lg border border-edge px-3 py-2.5 text-sm hover:bg-canvas">
                        <div><span className="mono font-medium text-ink">{a.reference_no}</span><p className="text-xs text-slate-500">{quarterTypeLabel(a.preferred_quarter_type)} · {fmtDate(a.applied_at)}</p></div>
                        <Pill status={a.status} />
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>
        );
      }}
    </Async>
  );
}
