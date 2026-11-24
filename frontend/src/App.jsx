import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { Card, Loading } from './components/ui.jsx';
import { useAuth } from './lib/auth.jsx';

import AdminUserForm from './pages/AdminUserForm.jsx';
import AdminUsers from './pages/AdminUsers.jsx';
import AllotmentDetail from './pages/AllotmentDetail.jsx';
import Allotments from './pages/Allotments.jsx';
import ApplicationDetail from './pages/ApplicationDetail.jsx';
import ApplicationForm from './pages/ApplicationForm.jsx';
import Applications from './pages/Applications.jsx';
import Audit from './pages/Audit.jsx';
import Certificates from './pages/Certificates.jsx';
import Dashboard from './pages/Dashboard.jsx';
import EmployeeDetail from './pages/EmployeeDetail.jsx';
import Employees from './pages/Employees.jsx';
import Login from './pages/Login.jsx';
import Notifications from './pages/Notifications.jsx';
import Signup from './pages/Signup.jsx';
import ProfileEdit from './pages/ProfileEdit.jsx';
import ProfileShow from './pages/ProfileShow.jsx';
import QuarterDetail from './pages/QuarterDetail.jsx';
import QuarterForm from './pages/QuarterForm.jsx';
import Quarters from './pages/Quarters.jsx';
import Reports from './pages/Reports.jsx';
import Retirements from './pages/Retirements.jsx';
import VacationDetail from './pages/VacationDetail.jsx';
import VacationForm from './pages/VacationForm.jsx';
import Vacations from './pages/Vacations.jsx';
import WaitingList from './pages/WaitingList.jsx';
import ApprovalQueue from './pages/ApprovalQueue.jsx';
import LegacyWaitingList from './pages/LegacyWaitingList.jsx';

function Forbidden() {
  return (
    <Card>
      <div className="py-8 text-center">
        <h3 className="font-display text-base font-semibold text-ink">Access denied</h3>
        <p className="mt-1 text-sm text-slate-500">Your role does not allow you to open this page.</p>
        <Link to="/dashboard" className="btn-primary mt-4 inline-block">Back to dashboard</Link>
      </div>
    </Card>
  );
}

/** Route guard - the API enforces the same rules; this only avoids showing dead pages. */
function Guard({ roles, permission, children }) {
  const { hasRole, hasPermission } = useAuth();
  if (roles && !hasRole(...roles)) return <Forbidden />;
  if (permission && !hasPermission(permission)) return <Forbidden />;
  return children;
}

function Protected() {
  const { user, ready, signedOut, needsProfile } = useAuth();
  const location = useLocation();
  if (!ready) return <Loading />;
  if (!user) {
    // Explicit sign-out: say so. Expired session / deep link: remember the page and return to it after login.
    const state = signedOut ? { flash: 'You have been signed out.' } : { from: location.pathname + location.search };
    return <Navigate to="/login" replace state={state} />;
  }
  // First login: an employee has to complete the profile before anything else.
  if (needsProfile && location.pathname !== '/profile/edit') {
    return <Navigate to="/profile/edit" replace />;
  }
  return <Layout />;
}

const STAFF = ['quarter_clerk', 'estate_officer', 'admin', 'super_admin'];

export default function App() {
  const { ready } = useAuth();
  if (!ready) return <Loading />;

  return (
    <Routes>
      {/* Login / Signup redirect already-signed-in visitors themselves (see `submitting` in those pages) */}
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      <Route element={<Protected />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />

        <Route path="/profile" element={<ProfileShow />} />
        <Route path="/profile/edit" element={<ProfileEdit />} />

        <Route path="/applications" element={<Applications />} />
        <Route path="/applications/new" element={<Guard roles={['employee']}><ApplicationForm /></Guard>} />
        <Route path="/applications/:id" element={<ApplicationDetail />} />

        <Route path="/employees" element={<Guard roles={STAFF}><Employees /></Guard>} />
        <Route path="/employees/:id" element={<Guard roles={STAFF}><EmployeeDetail /></Guard>} />
        <Route path="/approval-queue" element={<Guard permission="application.decide"><ApprovalQueue /></Guard>} />
        <Route path="/legacy-waiting-list" element={<Guard roles={STAFF}><LegacyWaitingList /></Guard>} />
        <Route path="/waiting-list" element={<Guard roles={STAFF}><WaitingList /></Guard>} />

        <Route path="/quarters" element={<Guard roles={STAFF}><Quarters /></Guard>} />
        <Route path="/quarters/new" element={<Guard permission="quarter.manage"><QuarterForm /></Guard>} />
        <Route path="/quarters/:id" element={<Guard roles={STAFF}><QuarterDetail /></Guard>} />
        <Route path="/quarters/:id/edit" element={<Guard permission="quarter.manage"><QuarterForm /></Guard>} />

        <Route path="/allotments" element={<Allotments />} />
        <Route path="/allotments/:id" element={<AllotmentDetail />} />

        <Route path="/vacations" element={<Vacations />} />
        <Route path="/vacations/new" element={<VacationForm />} />
        <Route path="/vacations/:id" element={<VacationDetail />} />

        <Route path="/retirements" element={<Guard roles={STAFF}><Retirements /></Guard>} />
        <Route path="/certificates" element={<Certificates />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/reports" element={<Guard permission="reports.view"><Reports /></Guard>} />
        <Route path="/audit" element={<Guard roles={['super_admin']}><Audit /></Guard>} />

        <Route path="/admin/users" element={<Guard permission="users.manage"><AdminUsers /></Guard>} />
        <Route path="/admin/users/new" element={<Guard permission="users.manage"><AdminUserForm /></Guard>} />
        <Route path="/admin/users/:id/edit" element={<Guard permission="users.manage"><AdminUserForm /></Guard>} />

        <Route
          path="*"
          element={
            <Card>
              <div className="py-8 text-center">
                <h3 className="font-display text-base font-semibold text-ink">Page not found</h3>
                <Link to="/dashboard" className="btn-primary mt-4 inline-block">Back to dashboard</Link>
              </div>
            </Card>
          }
        />
      </Route>
    </Routes>
  );
}
