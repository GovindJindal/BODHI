'use client';
import React, { useState } from 'react';
import { LogIn } from 'lucide-react';
import api, { apiErrorMessage } from '@/lib/api';
import { config } from '@/lib/config';
import { BodhiMark } from '@/components/Sidebar';
import { Button, Field, Input, Notice } from '@/components/ui';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.append('username', email.trim().toLowerCase());
      params.append('password', password);
      const res = await api.post('/login', params);
      localStorage.setItem(config.STORAGE_KEYS.TOKEN, res.data.access_token);
      localStorage.setItem(config.STORAGE_KEYS.USER, JSON.stringify(res.data.user));
      window.location.href = '/';
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not reach the BODHI API. Check your connection and try again.'));
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen grid place-items-center px-4 py-12">
      <div className="w-full max-w-[380px]">
        <div className="flex items-center gap-2.5 mb-10">
          <BodhiMark className="w-9 h-9 text-leaf" />
          <span className="text-xl font-bold tracking-[-0.01em]">BODHI</span>
          <span className="text-muted">Admin</span>
        </div>

        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em]">Sign in</h1>
        <p className="mt-2 text-[15px] text-muted leading-relaxed">
          Use the email and password of an admin, super admin or support account.
        </p>

        <form className="mt-8 space-y-5" onSubmit={handleLogin} noValidate={false}>
          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@bodhi.app"
              required
              autoFocus
            />
          </Field>
          <Field label="Password" htmlFor="password">
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>

          {error && <Notice tone="madder">{error}</Notice>}

          <Button type="submit" variant="primary" icon={LogIn} disabled={loading} className="w-full h-11">
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <p className="mt-10 text-[13px] text-faint leading-relaxed">
          After ten attempts in a minute, sign-in pauses briefly. Ask a super admin if you have lost access.
        </p>
      </div>
    </main>
  );
}
