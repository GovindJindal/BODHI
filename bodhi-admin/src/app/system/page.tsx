'use client';
import React from 'react';
import { CheckCircle2, CircleDashed, Database, RefreshCw, ShieldCheck, WifiOff } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { config } from '@/lib/config';
import { formatDate } from '@/lib/utils';
import { Badge, Button, EmptyState, PageHeader, Panel } from '@/components/ui';

type SystemStatus = {
  database: { ok: boolean; latency_ms: number };
  integrations: { key: string; name: string; configured: boolean }[];
  rate_limiting: boolean;
  checked_at: string;
};

const help: Record<string, string> = {
  email: 'Sends sign-up codes and M-PIN reset codes. Set SMTP_USER and SMTP_PASSWORD.',
  razorpay: 'Lets members add money to their wallet. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.',
  razorpay_webhook: 'Confirms payments if the app closes mid-checkout. Set RAZORPAY_WEBHOOK_SECRET.',
  gemini: 'Answers questions and logs expenses in the AI assistant. Set GEMINI_API_KEY.',
  sarvam: 'Speaks and transcribes in the voice assistant. Set SARVAM_API_KEY.',
  google: 'Lets members continue with Google. Set GOOGLE_CLIENT_ID and the Android and iOS client IDs.',
  sms: 'Sends text-message codes. Set SMS_API_KEY.',
  rapidapi: 'Powers airport and flight search in travel booking. Set RAPIDAPI_KEY.',
};

export default function SystemPage() {
  const { data, loading, error, reload } = useApi<SystemStatus>('/system');
  const ready = data?.integrations.filter((i) => i.configured).length ?? 0;

  return (
    <>
      <PageHeader
        title="System status"
        description="Whether the backend can reach its database and which outside services are set up. Secret values are never shown here."
        actions={<Button size="sm" variant="ghost" icon={RefreshCw} onClick={reload} disabled={loading}>Check again</Button>}
      />

      {error ? (
        <Panel>
          <EmptyState icon={WifiOff} title="The API didn't respond" description={`${error} The dashboard is pointed at ${config.API_GATEWAY_URL}.`} action={<Button onClick={reload}>Try again</Button>} />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.7fr] gap-6 items-start">
          <Panel title="Backend">
            <ul className="space-y-4 text-[14px]">
              <li className="flex items-start gap-3">
                <Database className="w-[18px] h-[18px] text-leaf mt-0.5" aria-hidden />
                <span>
                  <span className="block font-medium">Database connected</span>
                  <span className="block text-muted">{data ? `Answered in ${data.database.latency_ms} ms` : 'Checking…'}</span>
                </span>
              </li>
              <li className="flex items-start gap-3">
                <ShieldCheck className={data?.rate_limiting === false ? 'w-[18px] h-[18px] text-turmeric mt-0.5' : 'w-[18px] h-[18px] text-leaf mt-0.5'} aria-hidden />
                <span>
                  <span className="block font-medium">Rate limiting {data?.rate_limiting === false ? 'is off' : 'is on'}</span>
                  <span className="block text-muted">Slows down repeated sign-in and code attempts.</span>
                </span>
              </li>
              <li className="pt-3 border-t border-line text-[13px] text-muted">
                API: <span className="text-ink break-all">{config.API_GATEWAY_URL}</span>
                {data && <span className="block mt-1">Checked {formatDate(data.checked_at)}</span>}
              </li>
            </ul>
          </Panel>

          <Panel title="Integrations" description={data ? `${ready} of ${data.integrations.length} set up` : undefined} flush>
            <ul>
              {(data?.integrations ?? []).map((i) => (
                <li key={i.key} className="flex items-start gap-3 px-5 py-3.5 border-b border-line last:border-b-0">
                  {i.configured ? (
                    <CheckCircle2 className="w-[18px] h-[18px] text-leaf shrink-0 mt-0.5" aria-hidden />
                  ) : (
                    <CircleDashed className="w-[18px] h-[18px] text-turmeric shrink-0 mt-0.5" aria-hidden />
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14px] font-medium">{i.name}</span>
                    <span className="block text-[13px] text-muted leading-relaxed">{help[i.key]}</span>
                  </span>
                  <Badge tone={i.configured ? 'leaf' : 'turmeric'}>{i.configured ? 'Set up' : 'Missing'}</Badge>
                </li>
              ))}
              {loading && !data && [0, 1, 2, 3].map((n) => (
                <li key={n} className="px-5 py-4 border-b border-line"><div className="skeleton h-4 w-1/2" /></li>
              ))}
            </ul>
          </Panel>
        </div>
      )}
    </>
  );
}
