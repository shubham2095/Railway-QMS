import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

const T = {
  title: { en: 'Officer Login', hi: 'अधिकारी लॉगिन' },
  sub: { en: 'Access restricted to authorised personnel only', hi: 'केवल अधिकृत कर्मियों हेतु' },
  id: { en: 'Email or Employee ID', hi: 'ईमेल या कर्मचारी आईडी' },
  pw: { en: 'Password', hi: 'पासवर्ड' },
  secure: { en: 'Session secured', hi: 'सुरक्षित सत्र' },
  login: { en: 'Login', hi: 'लॉगिन करें' },
  noreg: { en: 'Self-registration is not available.', hi: 'स्वयं पंजीकरण उपलब्ध नहीं है।' },
  prov: { en: 'Accounts are provisioned by the Estate Office.', hi: 'खाते संपदा कार्यालय द्वारा प्रदान किए जाते हैं।' },
};

const DEMO = [
  ['super@rqms.test', 'Super Admin'], ['admin@rqms.test', 'Admin'], ['estate@rqms.test', 'Estate Officer'],
  ['clerk@rqms.test', 'Quarter Clerk'], ['electrical@rqms.test', 'Electrical'], ['water@rqms.test', 'Water'],
  ['accounts@rqms.test', 'Accounts'], ['emp@rqms.test', 'Employee'],
];

// Demo logins are shown in development only. Enable on a public build with VITE_SHOW_DEMO=true.
const SHOW_DEMO = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO === 'true';

const fieldBox = 'flex items-stretch overflow-hidden rounded-lg border border-edge bg-white transition focus-within:border-rail focus-within:ring-2 focus-within:ring-rail/20';
const iconBox = 'flex w-11 items-center justify-center border-r border-edge bg-canvas text-rail';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [lang, setLang] = useState('en');
  const [showPass, setShowPass] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const t = (k) => T[k][lang];

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      navigate(location.state?.from || '/dashboard', { replace: true });
    } catch (err) {
      setError(err.errors?.email?.[0] || err.message);
      setBusy(false);
    }
  };

  return (
    <div className="login-bg flex min-h-full items-center justify-center p-4 sm:p-6">
      <div className="rise w-full max-w-[980px] overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-black/5">
        <div className="flex h-1.5 w-full">
          <span className="h-full flex-1 bg-saffron" /><span className="h-full flex-1 bg-white" /><span className="h-full flex-1 bg-india" />
        </div>

        <div className="grid lg:grid-cols-2">
          {/* ============ BRAND PANEL ============ */}
          <div className="relative overflow-hidden bg-gradient-to-br from-navy via-rail to-ink p-8 text-white sm:p-10">
            <div className="blueprint pointer-events-none absolute inset-0 opacity-50" />
            <div className="relative flex h-full flex-col">
              <div className="flex flex-col items-center text-center">
                <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/15">
                  <svg viewBox="0 0 100 100" className="h-20 w-20" fill="none">
                    <circle cx="50" cy="50" r="46" stroke="#FF9933" strokeWidth="1.5" opacity=".8" />
                    <circle cx="50" cy="50" r="38" stroke="#ffffff" strokeWidth="1" opacity=".5" />
                    <circle cx="50" cy="50" r="20" stroke="#ffffff" strokeWidth="2.5" />
                    <circle cx="50" cy="50" r="5" fill="#8A1538" />
                    <g stroke="#ffffff" strokeWidth="2" strokeLinecap="round">
                      <line x1="50" y1="30" x2="50" y2="38" /><line x1="50" y1="62" x2="50" y2="70" />
                      <line x1="30" y1="50" x2="38" y2="50" /><line x1="62" y1="50" x2="70" y2="50" />
                      <line x1="36" y1="36" x2="41" y2="41" /><line x1="59" y1="59" x2="64" y2="64" />
                      <line x1="64" y1="36" x2="59" y2="41" /><line x1="41" y1="59" x2="36" y2="64" />
                    </g>
                    <path d="M22 84 L42 74 M78 84 L58 74" stroke="#FF9933" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
                <h1 className="deva mt-4 text-xl font-bold leading-tight tracking-wide">भारतीय रेल</h1>
                <p className="font-display text-sm font-semibold tracking-wide text-slate-200">Indian Railways</p>
                <div className="deva mt-3 text-base font-semibold text-saffron">आवास एवं संपदा प्रभाग</div>
                <p className="text-xs uppercase tracking-[0.12em] text-slate-300">Housing &amp; Estate Division</p>
              </div>
              <div className="my-6 h-px w-full bg-white/10" />
              <div className="text-center">
                <div className="deva text-base font-semibold text-white">क्वार्टर प्रबंधन प्रणाली</div>
                <p className="font-display text-sm font-semibold text-slate-200">Quarter Management System</p>
              </div>
              <div className="mt-auto flex flex-wrap justify-center gap-x-5 gap-y-1 pt-8 text-[11px] text-slate-400">
                <span>Allotment</span><span className="text-white/20">·</span>
                <span>Occupancy</span><span className="text-white/20">·</span>
                <span>Vacation NOC</span><span className="text-white/20">·</span>
                <span>Retention</span>
              </div>
            </div>
          </div>

          {/* ============ FORM PANEL ============ */}
          <div className="bg-white p-8 sm:p-10">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-display text-2xl font-bold text-ink">{t('title')}</h2>
                <p className="mt-1 text-sm text-slate-500">{t('sub')}</p>
              </div>
              <div className="flex items-center overflow-hidden rounded-lg border border-edge text-xs font-semibold">
                <button type="button" onClick={() => setLang('en')} className={`px-3 py-1.5 transition ${lang === 'en' ? 'bg-rail text-white' : 'bg-white text-slate-500 hover:bg-canvas'}`}>EN</button>
                <button type="button" onClick={() => setLang('hi')} className={`deva px-3 py-1.5 transition ${lang === 'hi' ? 'bg-rail text-white' : 'bg-white text-slate-500 hover:bg-canvas'}`}>हिं</button>
              </div>
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
                  <span className={iconBox}>
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M3 7l9 6 9-6" /><rect x="3" y="5" width="18" height="14" rx="2" /></svg>
                  </span>
                  <input id="email" name="email" type="text" autoFocus required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="officer@railnet.gov.in" className="w-full bg-white px-3 py-2.5 text-sm text-ink placeholder:text-slate-400 focus:outline-none" />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-ink">{t('pw')}</label>
                <div className={fieldBox}>
                  <span className={iconBox}>
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
                  </span>
                  <input id="password" name="password" required autoComplete="current-password" type={showPass ? 'text' : 'password'} value={password}
                    onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="w-full bg-white px-3 py-2.5 text-sm text-ink placeholder:text-slate-400 focus:outline-none" />
                  <button type="button" onClick={() => setShowPass(!showPass)} aria-label={showPass ? 'Hide password' : 'Show password'}
                    className="flex w-11 items-center justify-center border-l border-edge bg-canvas text-slate-500 hover:text-rail">
                    {showPass ? (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="m3 3 18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.9 5.1A9.8 9.8 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.8 3.6M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 3.2-.5" /></svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
                    )}
                  </button>
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
              <p>{t('noreg')}</p>
              <p className="text-xs text-slate-400">{t('prov')}</p>
            </div>

            {/* demo accounts (dev convenience) */}
            {SHOW_DEMO && <div className="mt-4">
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
            </div>}
          </div>
        </div>
      </div>
    </div>
  );
}
