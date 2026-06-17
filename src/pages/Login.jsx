import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import BackgroundOrbs from '../components/BackgroundOrbs';
import { ShieldCheck, Mail, Lock, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';

export default function Login({ onAuth }) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim())    return setError('Email is required.');
    if (!password)        return setError('Password is required.');

    setLoading(true);
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);

    if (authError) {
      setError(authError.message || 'Login failed. Please try again.');
      return;
    }

    onAuth(data.session);
  };

  return (
    <div className="min-h-screen font-sans text-[var(--ink)] flex items-center justify-center px-4">
      <BackgroundOrbs />

      <div className="w-full max-w-md relative z-10">

        {/* Brand header */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 shadow-lg"
            style={{ background: 'var(--grad)' }}
          >
            <ShieldCheck size={26} color="#fff" strokeWidth={2.5} />
          </div>
          <h1
            className="font-display font-black text-3xl tracking-tight"
            style={{
              background: 'var(--grad)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            SHRAMIK Admin
          </h1>
          <p className="text-sm text-[var(--mut)] font-semibold mt-1">
            Sign in to access the admin console
          </p>
        </div>

        {/* Card */}
        <div className="glass-card rounded-3xl p-8">
          <form onSubmit={handleLogin} className="flex flex-col gap-5">

            {/* Error banner */}
            {error && (
              <div className="flex items-start gap-3 bg-[rgba(201,29,94,0.08)] border border-[rgba(201,29,94,0.2)] rounded-2xl px-4 py-3">
                <AlertCircle size={16} className="text-[var(--accent)] flex-shrink-0 mt-0.5" strokeWidth={2.5} />
                <p className="text-xs font-semibold text-[var(--accent)] leading-relaxed">{error}</p>
              </div>
            )}

            {/* Email field */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-[var(--mut)] uppercase tracking-wider">
                Email
              </label>
              <div className="relative">
                <Mail
                  size={15}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--faint)]"
                  strokeWidth={2}
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  placeholder="admin@shramik.in"
                  autoComplete="email"
                  className="w-full h-12 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)]
                             pl-9 pr-4 text-sm font-semibold text-[var(--ink)] outline-none
                             focus:border-[var(--accent)] focus:ring-2 focus:ring-[rgba(201,29,94,0.15)]
                             transition-all duration-200 placeholder:text-[var(--faint)]"
                />
              </div>
            </div>

            {/* Password field */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-[var(--mut)] uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <Lock
                  size={15}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--faint)]"
                  strokeWidth={2}
                />
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full h-12 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)]
                             pl-9 pr-11 text-sm font-semibold text-[var(--ink)] outline-none
                             focus:border-[var(--accent)] focus:ring-2 focus:ring-[rgba(201,29,94,0.15)]
                             transition-all duration-200 placeholder:text-[var(--faint)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--faint)]
                             hover:text-[var(--mut)] transition-colors cursor-pointer"
                  tabIndex={-1}
                >
                  {showPw
                    ? <EyeOff size={16} strokeWidth={2} />
                    : <Eye    size={16} strokeWidth={2} />
                  }
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl font-display font-bold text-base text-white
                         flex items-center justify-center gap-2 mt-1
                         disabled:opacity-70 disabled:cursor-not-allowed
                         transition-opacity duration-200 cursor-pointer border-0"
              style={{ background: 'var(--grad)', boxShadow: '0 8px 24px rgba(229,57,123,0.28)' }}
            >
              {loading
                ? <><Loader2 size={18} className="animate-spin" /> Signing in…</>
                : 'Sign In'
              }
            </button>

          </form>
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-[var(--faint)] font-semibold mt-6">
          Shramik Rojgar Pvt. Ltd. · Admin Access Only
        </p>
      </div>
    </div>
  );
}
