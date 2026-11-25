import { createContext, useContext, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useFlash } from '../lib/flash.jsx';
import { Icon } from './ui.jsx';

const HeaderContext = createContext(() => {});

/** Pages call useHeader('Title', 'subtitle') to set the top bar. */
export function useHeader(title, subtitle = '') {
  const set = useContext(HeaderContext);
  useEffect(() => {
    set({ title, subtitle });
    document.title = `${title} · RQMS`;
  }, [title, subtitle, set]);
}

function NavItem({ to, icon, badge = 0, children, end = false, onClick }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 rounded-md px-3 py-2 transition ${
          isActive ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-signal" />}
          <Icon name={icon} className={`h-4 w-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'}`} />
          <span className="flex-1 truncate">{children}</span>
          {badge > 0 && <span className="rounded-full bg-signal px-1.5 py-0.5 text-[10px] font-semibold text-white">{badge}</span>}
        </>
      )}
    </NavLink>
  );
}

const Section = ({ title, children }) => (
  <div>
    <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</p>
    {children}
  </div>
);

export default function Layout() {
  const { user, badges, hasRole, hasPermission, logout, refresh, needsProfile, canApply } = useAuth();
  const { flash, success, clear } = useFlash();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [header, setHeader] = useState({ title: '', subtitle: '' });

  // Flash messages ride along on navigation state (the equivalent of Laravel's session flash).
  useEffect(() => {
    if (location.state?.flash) success(location.state.flash);
    else clear();
    setOpen(false);
    setMenu(false);
    refresh(); // keep the sidebar work badges current
    // deps are intentionally keyed on the serialised params / route key
  }, [location.key]);

  const close = () => setOpen(false);
  const verifyBadge = badges.applications_to_verify ?? 0;
  const decideBadge = badges.applications_to_decide ?? 0;
  const initials = user.name.slice(0, 2).toUpperCase();

  return (
    <HeaderContext.Provider value={setHeader}>
      <div className="min-h-full lg:flex">
        {/* ============ SIDEBAR ============ */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex w-64 transform flex-col bg-ink text-slate-300 transition-transform lg:static lg:translate-x-0 ${
            open ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex h-16 shrink-0 items-center gap-3 border-b border-white/10 px-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-signal font-display text-lg font-bold text-white">R</div>
            <div className="leading-tight">
              <div className="font-display text-sm font-semibold tracking-wide text-white">RQMS</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Quarter Management</div>
            </div>
          </div>

          <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5 text-sm">
            {needsProfile ? (
              <Section title="Get started">
                <NavItem to="/profile/edit" icon="user" onClick={close}>Complete your profile</NavItem>
              </Section>
            ) : (
            <>
            <Section title="Workspace">
              <NavItem to="/dashboard" icon="grid" onClick={close}>Dashboard</NavItem>
              <NavItem to="/applications" icon="doc" badge={verifyBadge} onClick={close}>Applications</NavItem>
              <NavItem to="/allotments" icon="key" onClick={close}>Allotments</NavItem>
              <NavItem to="/vacations" icon="exit" badge={badges.clearances_for_me ?? 0} onClick={close}>Vacations</NavItem>
              <NavItem to="/certificates" icon="seal" onClick={close}>Certificates</NavItem>
              <NavItem to="/notifications" icon="bell" onClick={close}>Notifications</NavItem>
              <NavItem to="/profile" icon="user" onClick={close}>{canApply ? 'My Profile' : 'My Account'}</NavItem>
            </Section>

            {hasRole('quarter_clerk', 'estate_officer', 'admin', 'super_admin') && (
              <Section title="Estate Office">
                <NavItem to="/employees" icon="users" onClick={close}>Employees</NavItem>
                <NavItem to="/quarters" icon="building" onClick={close}>Quarter Master</NavItem>
                {hasPermission('application.decide') && <NavItem to="/approval-queue" icon="list" badge={decideBadge} onClick={close}>Approval Queue</NavItem>}
                <NavItem to="/waiting-list" icon="list" onClick={close}>Approved Applicants</NavItem>
                <NavItem to="/legacy-waiting-list" icon="list" onClick={close}>Pending Requests (old list)</NavItem>
                <NavItem to="/retirements" icon="clock" onClick={close}>Retirement</NavItem>
                {hasPermission('reports.view') && <NavItem to="/reports" icon="chart" onClick={close}>Reports &amp; MIS</NavItem>}
              </Section>
            )}

            {hasRole('super_admin') && (
              <Section title="Administration">
                <NavItem to="/admin/users" icon="users" onClick={close}>Users &amp; Roles</NavItem>
                <NavItem to="/audit" icon="shield" onClick={close}>Audit Trail</NavItem>
              </Section>
            )}
            </>
            )}
          </nav>
        </aside>

        {open && <div onClick={close} className="fixed inset-0 z-30 bg-black/40 lg:hidden" />}

        {/* ============ MAIN ============ */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-edge bg-paper/90 px-4 backdrop-blur lg:px-8">
            <button onClick={() => setOpen(!open)} className="rounded-md p-2 text-rail hover:bg-canvas lg:hidden" aria-label="Toggle menu">
              <Icon name="menu" className="h-5 w-5" strokeWidth={2} />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-lg font-semibold text-ink">{header.title}</h1>
              {header.subtitle && <p className="truncate text-xs text-slate-500">{header.subtitle}</p>}
            </div>

            <div className="flex items-center gap-3">
              <span className="hidden rounded-full bg-canvas px-3 py-1 text-xs font-medium text-rail ring-1 ring-edge sm:inline">
                {user.profile?.station ?? 'No station'}
              </span>
              <div className="relative">
                <button onClick={() => setMenu(!menu)} className="flex items-center gap-2 rounded-full p-1 pr-2 hover:bg-canvas">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-rail text-xs font-semibold text-white">{initials}</span>
                  <span className="hidden text-left sm:block">
                    <span className="block text-xs font-semibold leading-tight text-ink">{user.name}</span>
                    <span className="block text-[10px] capitalize leading-tight text-slate-500">{user.roles.join(', ').replace(/_/g, ' ')}</span>
                  </span>
                </button>
                {menu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                    <div className="absolute right-0 z-20 mt-2 w-48 rounded-lg border border-edge bg-paper py-1 shadow-lg">
                      <Link to="/profile" className="block px-4 py-2 text-sm text-rail hover:bg-canvas">My Profile</Link>
                      <button
                        className="block w-full px-4 py-2 text-left text-sm text-signal hover:bg-canvas"
                        onClick={logout}
                      >
                        Sign out
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 lg:px-8">
            {flash && (
              <div className="mb-5 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
                <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
                <span>{flash.message}</span>
              </div>
            )}
            <Outlet />
          </main>

          <footer className="border-t border-edge px-4 py-4 text-center text-[11px] text-slate-400 lg:px-8">
            Railway Quarter Management System · Node.js · Express · React · MySQL · {new Date().getFullYear()}
          </footer>
        </div>
      </div>
    </HeaderContext.Provider>
  );
}
