import { useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import AuthShell, { EyeToggle, LangToggle, LockIcon, MailIcon, fieldBox, iconBox, inputCls, useAuthConfig, useLang } from '../components/AuthShell.jsx';
import { useAuth } from '../lib/auth.jsx';

const T = {
  title: { en: 'Officer Login', hi: 'अधिकारी लॉगिन' },
  sub: { en: 'Sign in to your RQMS account', hi: 'अपने RQMS खाते में लॉगिन करें' },
  id: { en: 'Email or Employee ID', hi: 'ईमेल या कर्मचारी आईडी' },
  pw: { en: 'Password', hi: 'पासवर्ड' },
  secure: { en: 'Session secured', hi: 'सुरक्षित सत्र' },
  login: { en: 'Login', hi: 'लॉगिन करें' },
  noreg: { en: 'Self-registration is not available.', hi: 'स्वयं पंजीकरण उपलब्ध नहीं है।' },
  prov: { en: 'Accounts are provisioned by the Estate Office.', hi: 'खाते संपदा कार्यालय द्वारा प्रदान किए जाते हैं।' },
  newHere: { en: 'New employee?', hi: 'नए कर्मचारी?' },
  create: { en: 'Create an account', hi: 'खाता बनाएँ' },
  createHint: { en: 'Staff accounts (clerk, officers, departments) are created by the Estate Office.', hi: 'स्टाफ खाते (क्लर्क, अधिकारी, विभाग) संपदा कार्यालय द्वारा बनाए जाते हैं।' },
};

const DEMO = [
  ['super@rqms.test', 'Super Admin'], ['admin@rqms.test', 'Admin'], ['estate@rqms.test', 'Estate Officer'],
  ['clerk@rqms.test', 'Quarter Clerk'], ['electrical@rqms.test', 'Electrical'], ['water@rqms.test', 'Water'],
  ['accounts@rqms.test', 'Accounts'], ['emp@rqms.test', 'Employee'],
];

// Demo logins are shown in development only. Enable on a public build with VITE_SHOW_DEMO=true.
const SHOW_DEMO = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO === 'true';

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const cfg = useAuthConfig();
  const [lang, setLang] = useLang();
  const [showPass, setShowPass] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // While submitting, `user` becomes set before our own navigate() runs. Without this guard the
  // "already signed in -> dashboard" redirect below would race it and drop the intended destination.
  const submitting = useRef(false);
  const t = (k) => T[k][lang];

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    submitting.current = true;
    try {
      await login(email, password);
      navigate(location.state?.from || '/dashboard', { replace: true });
    } catch (err) {
      submitting.current = false;
      setError(err.errors?.email?.[0] || err.message);
      setBusy(false);
    }
  };

  if (user && !submitting.current) return <Navigate to="/dashboard" replace />;

  return (
    <AuthShell>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-bold text-ink">{t('title')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('sub')}</p>
        </div>
        <LangToggle lang={lang} setLang={setLang} />
      </div>

      {location.state?.flash && (
        <div className="mt-5 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
          {location.state.flash}
        </div>
      )}
      {error && (
        <div className="mt-5 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
          <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 9v4m0 4h.01M10.3 4.3 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" /></svg>
          {error}
        </div>
      )}

      <form onSubmit={submit} className="mt-6 space-y-5">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-ink">{t('id')}</label>
          <div className={fieldBox}>
            <span className={iconBox}><MailIcon /></span>
            <input id="email" name="email" type="text" autoFocus required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="officer@railnet.gov.in" className={inputCls} />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-ink">{t('pw')}</label>
          <div className={fieldBox}>
            <span className={iconBox}><LockIcon /></span>
            <input id="password" name="password" required autoComplete="current-password" type={showPass ? 'text' : 'password'} value={password}
              onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className={inputCls} />
            <EyeToggle shown={showPass} onClick={() => setShowPass(!showPass)} label={showPass ? 'Hide password' : 'Show password'} />
          </div>
        </div>

        <div className="flex items-center justify-end">
          <span className="text-xs text-slate-400">{t('secure')}</span>
        </div>

        <button type="submit" disabled={busy}
          className="group flex w-full items-center justify-center gap-2 rounded-lg bg-rail px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-ink focus:outline-none focus:ring-2 focus:ring-rail/40 focus:ring-offset-2 disabled:opacity-60">
          <svg className="h-4 w-4 transition group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" /></svg>
          <span>{busy ? '…' : t('login')}</span>
        </button>
      </form>

      <div className="mt-6 border-t border-edge pt-5 text-center text-sm text-slate-500">
        {cfg.signup ? (
          <>
            <p>
              {t('newHere')}{' '}
              <Link to="/signup" className="font-semibold text-rail underline-offset-2 hover:underline">{t('create')}</Link>
            </p>
            <p className="mt-1 text-xs text-slate-400">{t('createHint')}</p>
          </>
        ) : (
          <>
            <p>{t('noreg')}</p>
            <p className="text-xs text-slate-400">{t('prov')}</p>
          </>
        )}
      </div>

      {/* demo accounts (dev convenience) */}
      {SHOW_DEMO && (
        <div className="mt-4">
          <button type="button" onClick={() => setDemoOpen(!demoOpen)}
            className="flex w-full items-center justify-between rounded-lg bg-canvas px-3 py-2 text-xs font-medium text-rail ring-1 ring-edge hover:bg-white">
            <span>Demo accounts (password: <span className="mono">password</span>)</span>
            <svg className={`h-4 w-4 transition ${demoOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg>
          </button>
          {demoOpen && (
            <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px]">
              {DEMO.map(([mail, role]) => (
                <button key={mail} type="button" onClick={() => { setEmail(mail); setPassword('password'); }}
                  className="flex flex-col rounded-md border border-edge bg-white px-2.5 py-1.5 text-left hover:border-rail hover:bg-canvas">
                  <span className="font-semibold text-rail">{role}</span>
                  <span className="mono truncate text-slate-400">{mail}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </AuthShell>
  );
}
