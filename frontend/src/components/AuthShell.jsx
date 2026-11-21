import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

/** EN / हिं preference shared by the login and signup pages (remembered in this browser). */
export function useLang() {
  const [lang, setLangState] = useState(() => {
    try { return localStorage.getItem('rqms_lang') === 'hi' ? 'hi' : 'en'; } catch { return 'en'; }
  });
  const setLang = (l) => {
    setLangState(l);
    try { localStorage.setItem('rqms_lang', l); } catch { /* storage unavailable */ }
  };
  return [lang, setLang];
}

/** Public feature flags (is self-registration enabled?). Defaults to enabled until the server answers. */
export function useAuthConfig() {
  const [cfg, setCfg] = useState({ signup: true, loaded: false });
  useEffect(() => {
    let alive = true;
    api.get('/auth/config').then((c) => alive && setCfg({ ...c, loaded: true })).catch(() => alive && setCfg({ signup: false, loaded: true }));
    return () => { alive = false; };
  }, []);
  return cfg;
}

export function LangToggle({ lang, setLang }) {
  return (
    <div className="flex shrink-0 items-center overflow-hidden rounded-lg border border-edge text-xs font-semibold">
      <button type="button" onClick={() => setLang('en')} className={`px-3 py-1.5 transition ${lang === 'en' ? 'bg-rail text-white' : 'bg-white text-slate-500 hover:bg-canvas'}`}>EN</button>
      <button type="button" onClick={() => setLang('hi')} className={`deva px-3 py-1.5 transition ${lang === 'hi' ? 'bg-rail text-white' : 'bg-white text-slate-500 hover:bg-canvas'}`}>हिं</button>
    </div>
  );
}

/** Two-panel layout shared by the login and signup pages: brand panel on the left, `children` on the right. */
export default function AuthShell({ children }) {
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
          <div className="bg-white p-8 sm:p-10">{children}</div>
        </div>
      </div>
    </div>
  );
}

// ---- small shared form pieces ----
export const fieldBox = 'flex items-stretch overflow-hidden rounded-lg border border-edge bg-white transition focus-within:border-rail focus-within:ring-2 focus-within:ring-rail/20';
export const iconBox = 'flex w-11 items-center justify-center border-r border-edge bg-canvas text-rail';
export const inputCls = 'w-full bg-white px-3 py-2.5 text-sm text-ink placeholder:text-slate-400 focus:outline-none';

export const MailIcon = () => <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M3 7l9 6 9-6" /><rect x="3" y="5" width="18" height="14" rx="2" /></svg>;
export const LockIcon = () => <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;
export const UserIcon = () => <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>;
export const PhoneIcon = () => <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></svg>;

export function EyeToggle({ shown, onClick, label }) {
  return (
    <button type="button" onClick={onClick} aria-label={label}
      className="flex w-11 items-center justify-center border-l border-edge bg-canvas text-slate-500 hover:text-rail">
      {shown ? (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="m3 3 18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.9 5.1A9.8 9.8 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.8 3.6M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 3.2-.5" /></svg>
      ) : (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
      )}
    </button>
  );
}
