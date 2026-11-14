'use client';
import React, { useMemo, useState } from 'react';
import { UserPlus, Eye, EyeOff } from 'lucide-react';
import api, { apiErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button, Field, Input, Notice, PageHeader, Panel } from '@/components/ui';

function strength(pw: string): { score: number; label: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  return { score, label: ['Too short', 'Weak', 'Fair', 'Good', 'Strong'][score] };
}

export default function CreateAdminPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ success: boolean; message: string } | null>(null);
  const pw = useMemo(() => strength(password), [password]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    try {
      await api.post('/create-admin', {
        email: email.trim().toLowerCase(),
        password,
        full_name: fullName.trim(),
      });
      setStatus({ success: true, message: `${fullName.trim()} can now sign in to this dashboard with ${email.trim().toLowerCase()}. Share the password with them privately.` });
      setEmail('');
      setPassword('');
      setFullName('');
    } catch (err) {
      setStatus({ success: false, message: apiErrorMessage(err, 'The admin account was not created.') });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Add admin"
        description="Create a dashboard account for a teammate. It can't be used to sign in to the mobile app."
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-6 items-start">
        <Panel>
          <form onSubmit={handleCreate} className="space-y-5">
            <Field label="Full name" htmlFor="name">
              <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Priya Sharma" autoComplete="off" required maxLength={255} />
            </Field>
            <Field label="Work email" htmlFor="email" hint="They sign in with this address.">
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="priya@bodhi.app" autoComplete="off" required />
            </Field>
            <Field label="Temporary password" htmlFor="password" hint="At least 8 characters.">
              <div className="relative">
                <Input
                  id="password"
                  type={show ? 'text' : 'password'}
                  minLength={8}
                  maxLength={128}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  aria-label={show ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md flex items-center justify-center text-muted hover:text-ink"
                >
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {password && (
                <div className="flex items-center gap-3 pt-1" aria-live="polite">
                  <div className="flex gap-1 flex-1">
                    {[0, 1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className={cn(
                          'h-1 flex-1 rounded-full',
                          i < pw.score ? (pw.score <= 1 ? 'bg-madder' : pw.score === 2 ? 'bg-turmeric' : 'bg-leaf') : 'bg-sunken',
                        )}
                      />
                    ))}
                  </div>
                  <span className="text-[12px] text-muted w-16 text-right">{pw.label}</span>
                </div>
              )}
            </Field>

            {status && <Notice tone={status.success ? 'leaf' : 'madder'}>{status.message}</Notice>}

            <Button type="submit" variant="primary" icon={UserPlus} disabled={loading || password.length < 8}>
              {loading ? 'Creating account…' : 'Create admin account'}
            </Button>
          </form>
        </Panel>

        <Panel title="What admins can do">
          <ul className="space-y-3 text-[14px] leading-relaxed text-muted">
            <li><span className="text-ink font-medium">Admins</span> see every page, suspend members and send announcements.</li>
            <li><span className="text-ink font-medium">Super admins</span> can also read the audit log and suspend other admins.</li>
            <li>Every suspension, announcement and new admin is recorded in the audit log.</li>
          </ul>
        </Panel>
      </div>
    </>
  );
}
