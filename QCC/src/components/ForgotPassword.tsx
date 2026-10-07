import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Mail, KeyRound, Lock, Loader2, AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

/**
 * Password recovery, shown in place of the sign-in form.
 *
 * Three steps: ask for the account's email, enter the 6-digit code that arrives in
 * that inbox, then choose a new password. Finishing signs the user straight in — the
 * backend hands back a session with the reset — and every other device that was
 * signed in as this user is signed out.
 */

const CODE_LENGTH = 6;
const RESEND_SECONDS = 60;

type Step = 'email' | 'code' | 'password';

export default function ForgotPassword({ onBack }: { onBack: () => void }) {
  const { adoptSession } = useAuth();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  // Set when the server has no SMTP credentials yet: the code is printed in the
  // backend window instead of being emailed, so say so rather than let the user wait.
  const [mailOff, setMailOff] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const codeRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === 'code') codeRef.current?.focus();
    if (step === 'password') pwRef.current?.focus();
  }, [step]);

  // Countdown that re-enables "Resend code".
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown(c => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const sendCode = async (resend = false) => {
    const addr = email.trim();
    if (!addr) { setError('Enter the email address of your account.'); return; }
    setError(''); setBusy(true);
    try {
      const res = await api.forgotPassword(addr);
      setMailOff(!res.emailConfigured);
      setStep('code');
      setCooldown(RESEND_SECONDS);
      setNotice(resend ? 'A new code has been sent.' : res.message);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not send the code. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    if (code.trim().length !== CODE_LENGTH) { setError(`Enter the ${CODE_LENGTH}-digit code from your email.`); return; }
    setError(''); setBusy(true);
    try {
      const { resetToken: t } = await api.verifyResetCode(email.trim(), code.trim());
      setResetToken(t);
      setNotice('');
      setStep('password');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not verify that code.');
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = async () => {
    if (newPw.length < 6) { setError('New password must be at least 6 characters.'); return; }
    if (newPw !== confirmPw) { setError('The two passwords do not match.'); return; }
    setError(''); setBusy(true);
    try {
      const { accessToken, user } = await api.resetPassword(resetToken, newPw);
      adoptSession(accessToken, user); // signed in immediately with the new password
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not reset the password.');
      setBusy(false);
    }
  };

  const inputCls =
    'w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all';

  const STEP_META: Record<Step, { icon: React.ReactNode; title: string; hint: string }> = {
    email: {
      icon: <Mail size={18} className="text-blue-600" />,
      title: 'Reset your password',
      hint: 'Enter your account email and we will send you a verification code.',
    },
    code: {
      icon: <KeyRound size={18} className="text-blue-600" />,
      title: 'Enter the code',
      hint: `We sent a ${CODE_LENGTH}-digit code to ${email.trim()}. It expires in 10 minutes.`,
    },
    password: {
      icon: <Lock size={18} className="text-blue-600" />,
      title: 'Choose a new password',
      hint: 'Signing in everywhere else will require this new password.',
    },
  };
  const meta = STEP_META[step];

  return (
    <div className="bg-white rounded-2xl shadow-2xl p-8">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4"
      >
        <ArrowLeft size={15} /> Back to sign in
      </button>

      <div className="flex items-start gap-3 mb-1">
        <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">{meta.icon}</div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">{meta.title}</h2>
          <p className="text-sm text-slate-500 mt-0.5">{meta.hint}</p>
        </div>
      </div>

      {/* Step dots */}
      <div className="flex items-center gap-1.5 my-5">
        {(['email', 'code', 'password'] as Step[]).map((s, i) => {
          const idx = ['email', 'code', 'password'].indexOf(step);
          return (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${i <= idx ? 'bg-blue-600' : 'bg-slate-200'}`}
            />
          );
        })}
      </div>

      {error && (
        <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg mb-4">
          <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      {!error && notice && (
        <div className="flex items-start gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg mb-4">
          <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-emerald-700">{notice}</p>
        </div>
      )}
      {step === 'code' && mailOff && (
        <div className="flex items-start gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg mb-4">
          <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            Email is not set up on the server yet, so the code was printed in the
            <span className="font-semibold"> QCC Backend </span>window instead of being sent.
          </p>
        </div>
      )}

      {step === 'email' && (
        <form onSubmit={e => { e.preventDefault(); sendCode(); }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Email address</label>
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(''); }}
              placeholder="you@qcc.com"
              autoComplete="email"
              className={inputCls}
              required
            />
            <p className="text-xs text-slate-400 mt-1.5">Use the full email you sign in with, not the short username.</p>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
          >
            {busy ? <><Loader2 size={16} className="animate-spin" /> Sending code...</> : 'Send verification code'}
          </button>
        </form>
      )}

      {step === 'code' && (
        <form onSubmit={e => { e.preventDefault(); verifyCode(); }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Verification code</label>
            <input
              ref={codeRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH)); setError(''); }}
              placeholder="------"
              className={`${inputCls} text-center text-2xl font-bold tracking-[0.5em] font-mono`}
              required
            />
          </div>
          <button
            type="submit"
            disabled={busy || code.length !== CODE_LENGTH}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
          >
            {busy ? <><Loader2 size={16} className="animate-spin" /> Verifying...</> : 'Verify code'}
          </button>
          <div className="text-center">
            <button
              type="button"
              onClick={() => sendCode(true)}
              disabled={busy || cooldown > 0}
              className="text-sm text-blue-600 hover:text-blue-700 disabled:text-slate-400 font-medium"
            >
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </button>
          </div>
        </form>
      )}

      {step === 'password' && (
        <form onSubmit={e => { e.preventDefault(); submitPassword(); }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">New password</label>
            <div className="relative">
              <input
                ref={pwRef}
                type={showPw ? 'text' : 'password'}
                value={newPw}
                onChange={e => { setNewPw(e.target.value); setError(''); }}
                placeholder="At least 6 characters"
                autoComplete="new-password"
                className={`${inputCls} pr-10`}
                required
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirm new password</label>
            <input
              type={showPw ? 'text' : 'password'}
              value={confirmPw}
              onChange={e => { setConfirmPw(e.target.value); setError(''); }}
              placeholder="Re-enter the new password"
              autoComplete="new-password"
              className={inputCls}
              required
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
          >
            {busy ? <><Loader2 size={16} className="animate-spin" /> Saving...</> : 'Set password and sign in'}
          </button>
        </form>
      )}
    </div>
  );
}
