import { useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import AuthShell, { EyeToggle, LangToggle, LockIcon, MailIcon, PhoneIcon, UserIcon, fieldBox, iconBox, inputCls, useAuthConfig, useLang } from '../components/AuthShell.jsx';
import { useAuth } from '../lib/auth.jsx';

const T = {
  title: { en: 'Create your account', hi: 'अपना खाता बनाएँ' },
  sub: { en: 'For railway employees applying for quarters', hi: 'क्वार्टर हेतु आवेदन करने वाले रेल कर्मचारियों के लिए' },
  name: { en: 'Full name', hi: 'पूरा नाम' },
  email: { en: 'Email', hi: 'ईमेल' },
  mobile: { en: 'Mobile (optional)', hi: 'मोबाइल (वैकल्पिक)' },
  pw: { en: 'Password', hi: 'पासवर्ड' },
  pwHint: { en: 'At least 8 characters', hi: 'कम से कम 8 अक्षर' },
  confirm: { en: 'Confirm password', hi: 'पासवर्ड की पुष्टि करें' },
  submit: { en: 'Create account', hi: 'खाता बनाएँ' },
  have: { en: 'Already have an account?', hi: 'पहले से खाता है?' },
  login: { en: 'Sign in', hi: 'लॉगिन करें' },
  next: { en: 'After signing up you will add your employee details (Employee ID, station, service dates) before applying for a quarter.', hi: 'खाता बनाने के बाद आप क्वार्टर हेतु आवेदन से पहले अपने कर्मचारी विवरण (कर्मचारी आईडी, स्टेशन, सेवा तिथियाँ) भरेंगे।' },
  off: { en: 'Self-registration is currently switched off.', hi: 'स्वयं पंजीकरण फ़िलहाल बंद है।' },
  offHint: { en: 'Please contact the Estate Office to get an account.', hi: 'खाते के लिए कृपया संपदा कार्यालय से संपर्क करें।' },
  mismatch: { en: 'The two passwords do not match.', hi: 'दोनों पासवर्ड मेल नहीं खाते।' },
};

// Defined at module level on purpose: a component declared inside Signup() would get a new identity on every
// render, remounting the inputs and dropping focus after each keystroke.
function Field({ id, label, icon, error, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink">{label}</label>
      <div className={`${fieldBox} ${error ? 'border-rose-400' : ''}`}>
        <span className={iconBox}>{icon}</span>
        {children}
      </div>
      {error && <p className="mt-1 text-xs text-rose-600" role="alert">{error}</p>}
    </div>
  );
}

export default function Signup() {
  const { register, user } = useAuth();
  const navigate = useNavigate();
  const cfg = useAuthConfig();
  const [lang, setLang] = useLang();
  const t = (k) => T[k][lang];

  const [f, setF] = useState({ name: '', email: '', mobile: '', password: '', password_confirmation: '' });
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false); // see Login.jsx: stops the signed-in redirect racing our own navigate()
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  if (user && !submitting.current) return <Navigate to="/dashboard" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setErrors({});
    setMessage('');
    if (f.password !== f.password_confirmation) {
      setErrors({ password_confirmation: [t('mismatch')] });
      return;
    }
    setBusy(true);
    submitting.current = true;
    try {
      await register(f);
      navigate('/profile/edit', {
        replace: true,
        state: { flash: lang === 'hi' ? 'खाता बन गया। क्वार्टर हेतु आवेदन से पहले कृपया अपनी कर्मचारी जानकारी भरें।' : 'Account created. Please complete your employee profile to apply for a quarter.' },
      });
    } catch (err) {
      submitting.current = false;
      setErrors(err.errors || {});
      setMessage(err.errors ? '' : err.message);
      setBusy(false);
    }
  };

  const err = (k) => errors[k]?.[0];

  return (
    <AuthShell>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-bold text-ink">{t('title')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('sub')}</p>
        </div>
        <LangToggle lang={lang} setLang={setLang} />
      </div>

      {cfg.loaded && !cfg.signup ? (
        <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          <p className="font-semibold">{t('off')}</p>
          <p className="mt-1">{t('offHint')}</p>
          <Link to="/login" className="mt-3 inline-block font-semibold underline">{t('login')}</Link>
        </div>
      ) : (
        <>
          {message && (
            <div className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{message}</div>
          )}

          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            <Field id="name" label={t('name')} icon={<UserIcon />} error={err('name')}>
              <input id="name" name="name" required autoFocus autoComplete="name" maxLength={120} value={f.name} onChange={set('name')} className={inputCls} />
            </Field>
            <Field id="email" label={t('email')} icon={<MailIcon />} error={err('email')}>
              <input id="email" name="email" type="email" required autoComplete="email" value={f.email} onChange={set('email')} placeholder="name@example.com" className={inputCls} />
            </Field>
            <Field id="mobile" label={t('mobile')} icon={<PhoneIcon />} error={err('mobile')}>
              <input id="mobile" name="mobile" type="tel" autoComplete="tel" maxLength={20} value={f.mobile} onChange={set('mobile')} className={inputCls} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="password" label={t('pw')} icon={<LockIcon />} error={err('password')}>
                <input id="password" name="password" required minLength={8} maxLength={72} autoComplete="new-password" type={show ? 'text' : 'password'}
                  value={f.password} onChange={set('password')} placeholder="••••••••" className={inputCls} />
                <EyeToggle shown={show} onClick={() => setShow(!show)} label={show ? 'Hide password' : 'Show password'} />
              </Field>
              <Field id="password_confirmation" label={t('confirm')} icon={<LockIcon />} error={err('password_confirmation')}>
                <input id="password_confirmation" name="password_confirmation" required maxLength={72} autoComplete="new-password" type={show ? 'text' : 'password'}
                  value={f.password_confirmation} onChange={set('password_confirmation')} placeholder="••••••••" className={inputCls} />
              </Field>
            </div>
            <p className="-mt-2 text-xs text-slate-400">{t('pwHint')}</p>

            <button type="submit" disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-rail px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-ink focus:outline-none focus:ring-2 focus:ring-rail/40 focus:ring-offset-2 disabled:opacity-60">
              {busy ? '…' : t('submit')}
            </button>
          </form>

          <p className="mt-4 rounded-lg bg-canvas px-3 py-2.5 text-xs text-rail">{t('next')}</p>

          <div className="mt-5 border-t border-edge pt-4 text-center text-sm text-slate-500">
            {t('have')}{' '}
            <Link to="/login" className="font-semibold text-rail underline-offset-2 hover:underline">{t('login')}</Link>
          </div>
        </>
      )}
    </AuthShell>
  );
}
