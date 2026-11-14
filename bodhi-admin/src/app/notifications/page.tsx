'use client';
import React, { useState } from 'react';
import { Send, Info, CheckCircle2, AlertTriangle, Siren } from 'lucide-react';
import api, { apiErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { BodhiMark } from '@/components/Sidebar';
import { Button, Field, Input, Notice, PageHeader, Panel, Segmented, Textarea } from '@/components/ui';

type Kind = 'INFO' | 'SUCCESS' | 'WARNING' | 'ALERT';
type Audience = 'user' | 'admin' | 'all';

const kinds: Record<Kind, { label: string; icon: typeof Info; color: string; soft: string }> = {
  INFO: { label: 'Update', icon: Info, color: 'text-sky', soft: 'bg-sky-soft' },
  SUCCESS: { label: 'Good news', icon: CheckCircle2, color: 'text-leaf', soft: 'bg-leaf-soft' },
  WARNING: { label: 'Warning', icon: AlertTriangle, color: 'text-turmeric', soft: 'bg-turmeric-soft' },
  ALERT: { label: 'Urgent', icon: Siren, color: 'text-madder', soft: 'bg-madder-soft' },
};

const audienceLabel: Record<Audience, string> = {
  user: 'all members',
  admin: 'admins only',
  all: 'everyone, including staff',
};

export default function NotificationsPage() {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState<Audience>('user');
  const [kind, setKind] = useState<Kind>('INFO');
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const canSend = title.trim().length > 0 && message.trim().length > 0;

  const send = async () => {
    setSending(true);
    setResult(null);
    try {
      const res = await api.post('/notifications/bulk', {
        title: title.trim(),
        message: message.trim(),
        target_role: audience === 'all' ? null : audience,
        type: kind,
      });
      const n: number = res.data.recipients;
      setResult({ ok: true, text: `Sent to ${n.toLocaleString('en-IN')} ${n === 1 ? 'person' : 'people'}. It's in their notifications now.` });
      setTitle('');
      setMessage('');
    } catch (err) {
      setResult({ ok: false, text: apiErrorMessage(err, 'The announcement was not sent. Try again.') });
    } finally {
      setSending(false);
      setConfirming(false);
    }
  };

  const K = kinds[kind];

  return (
    <>
      <PageHeader
        title="Announcements"
        description="Send an in-app notification. Members see it in their notification list the next time they open BODHI."
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 items-start">
        <Panel>
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSend) setConfirming(true);
            }}
          >
            <Field label="Title" htmlFor="title" hint={`${title.length}/200`}>
              <Input id="title" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="UPI transfers are back to normal" required />
            </Field>
            <Field label="Message" htmlFor="message" hint={`${message.length}/2000`}>
              <Textarea
                id="message"
                maxLength={2000}
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Payments sent between 2 and 3 pm were delayed. Every one of them has now gone through, and no money was lost."
                required
              />
            </Field>

            <div className="grid sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <p className="text-[13px] font-medium">Send to</p>
                <Segmented<Audience>
                  label="Audience"
                  value={audience}
                  onChange={setAudience}
                  options={[
                    { value: 'user', label: 'Members' },
                    { value: 'admin', label: 'Admins' },
                    { value: 'all', label: 'Everyone' },
                  ]}
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-[13px] font-medium">Tone</p>
                <div role="radiogroup" aria-label="Tone" className="flex flex-wrap gap-1.5">
                  {(Object.keys(kinds) as Kind[]).map((k) => {
                    const Icon = kinds[k].icon;
                    return (
                      <button
                        type="button"
                        key={k}
                        role="radio"
                        aria-checked={kind === k}
                        onClick={() => setKind(k)}
                        className={cn(
                          'h-8 px-2.5 inline-flex items-center gap-1.5 rounded-md text-[13px] border transition-colors',
                          kind === k ? cn(kinds[k].soft, kinds[k].color, 'border-transparent font-medium') : 'border-line text-muted hover:text-ink',
                        )}
                      >
                        <Icon className="w-3.5 h-3.5" aria-hidden />
                        {kinds[k].label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {result && <Notice tone={result.ok ? 'leaf' : 'madder'}>{result.text}</Notice>}

            {confirming ? (
              <div className="rounded-lg border border-line-strong p-4 space-y-3">
                <p className="text-[14px]">
                  Send “{title.trim()}” to <strong className="font-semibold">{audienceLabel[audience]}</strong>? It can&apos;t be recalled once sent.
                </p>
                <div className="flex gap-2">
                  <Button type="button" variant="primary" icon={Send} disabled={sending} onClick={send}>
                    {sending ? 'Sending…' : 'Send announcement'}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>Keep editing</Button>
                </div>
              </div>
            ) : (
              <Button type="submit" variant="primary" icon={Send} disabled={!canSend}>
                Review and send
              </Button>
            )}
          </form>
        </Panel>

        {/* Live preview of how it lands in the app */}
        <div className="lg:sticky lg:top-6">
          <p className="text-[13px] text-muted mb-2">Preview on a phone</p>
          <div className="mx-auto max-w-[320px] rounded-[28px] border border-line-strong bg-sunken p-3 shadow-panel">
            <div className="rounded-[20px] bg-paper px-3 pt-3 pb-6 min-h-[300px]">
              <div className="flex justify-between text-[11px] text-muted px-1 mb-4 tabular-nums">
                <span>9:41</span>
                <span>Notifications</span>
              </div>
              <div className="rounded-2xl bg-surface border border-line p-3.5 flex gap-3">
                <span className={cn('w-9 h-9 rounded-full flex items-center justify-center shrink-0', K.soft, K.color)}>
                  <K.icon className="w-[18px] h-[18px]" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold leading-snug break-words">{title.trim() || 'Your title appears here'}</p>
                  <p className="text-[13px] text-muted mt-1 leading-relaxed break-words whitespace-pre-line line-clamp-6">
                    {message.trim() || 'And the message underneath it.'}
                  </p>
                  <p className="text-[11px] text-faint mt-2">now</p>
                </div>
              </div>
              <div className="mt-3 rounded-2xl bg-surface/60 border border-line p-3.5 flex gap-3 opacity-60" aria-hidden>
                <span className="w-9 h-9 rounded-full bg-leaf-soft text-leaf flex items-center justify-center shrink-0">
                  <BodhiMark className="w-[18px] h-[18px]" />
                </span>
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-2.5 rounded bg-sunken w-3/4" />
                  <div className="h-2 rounded bg-sunken w-1/2" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
