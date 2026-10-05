'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { Send } from 'lucide-react';
import { EmailEditor } from './EmailEditor';
import { QuotaBadge } from './QuotaBadge';
import { UpgradeDialog } from './UpgradeDialog';
import { AUDIENCE_LABEL } from './BroadcastHistoryList';
import { BTN_PRIMARY, BTN_SECONDARY } from '@/components/community-feed/feed-header';
import { Card } from '@/components/community-admin/ui';
import { FIELD_INPUT, FIELD_LABEL } from '@/components/ds/app-dialog';
import { InlineConfirm } from '@/components/ds/inline-confirm';
import { AUDIENCES, type Audience } from '@/lib/broadcasts/audience';
import { communityPath } from '@/lib/safe-redirect';
import { cn } from '@/lib/utils';

interface Props {
  communityId: string;
  communitySlug: string;
  communityName: string;
  senderName: string;
  ownerEmail: string;
  audienceCounts: Record<Audience, number>;
  quota: { tier: 'vip' | 'paid' | 'free'; used: number; limit: number | null };
}

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

interface SendOutcome {
  status: 'sending' | 'sent' | 'partial_failure' | 'failed';
  recipientCount: number;
  /** Null when the server can't tell how many missed it. */
  failedCount: number | null;
}

/**
 * Publishing returns as soon as the send has started; this follows it until
 * it has finished. Null when it is still sending after POLL_TIMEOUT_MS.
 */
async function waitForSend(communitySlug: string, broadcastId: string): Promise<SendOutcome | null> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(
        `/api/community/${communitySlug}/broadcasts/${broadcastId}/status`,
        { cache: 'no-store' }
      );
      if (res.ok) {
        const outcome = (await res.json()) as SendOutcome;
        if (outcome.status !== 'sending') return outcome;
      }
    } catch {
      // A dropped poll isn't a failed send; try again.
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return null;
}

export function EmailComposer(props: Props) {
  const router = useRouter();
  const [subject, setSubject] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [html, setHtml] = useState('');
  const [json, setJson] = useState<unknown>(null);
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [audience, setAudience] = useState<Audience>('all');
  const [confirming, setConfirming] = useState(false);
  const count = props.audienceCounts[audience];

  const atLimit = props.quota.limit !== null && props.quota.used >= props.quota.limit;

  const validate = () => {
    if (!subject.trim()) {
      toast.error('Add a subject.');
      return false;
    }
    if (!html.trim() || html === '<p></p>') {
      toast.error('Write a message first.');
      return false;
    }
    return true;
  };

  const handleSend = async () => {
    if (atLimit && props.quota.tier === 'free') {
      setUpgradeOpen(true);
      return;
    }
    if (!validate()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/community/${props.communitySlug}/broadcasts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subject, htmlContent: html, editorJson: json, previewText, audience }),
      });
      if (res.status === 402) {
        setUpgradeOpen(true);
        return;
      }
      if (!res.ok) {
        const body = await res.text();
        let msg = "Couldn't send the email. Try again.";
        try {
          msg = JSON.parse(body).error || msg;
        } catch {}
        // The owner isn't a recipient, so a community without members has nobody.
        if (msg === 'no_recipients') msg = 'Nobody in this group can get emails right now.';
        throw new Error(msg);
      }
      const data = await res.json();
      const broadcastPage = communityPath(props.communitySlug, `/admin/emails/${data.broadcastId}`);

      let outcome: SendOutcome | null = data;
      if (data.status === 'sending') {
        const progress = toast.loading(`Sending to ${data.recipientCount} members…`);
        outcome = await waitForSend(props.communitySlug, data.broadcastId);
        toast.dismiss(progress);
      }
      if (!outcome) {
        toast('Still sending. The email page shows how it went.', { duration: 8000 });
        router.push(broadcastPage);
        return;
      }

      if (outcome.status === 'failed') {
        // Nothing went out (and it doesn't count against the monthly quota):
        // keep the draft so the owner can try again.
        toast.error("Your email couldn't be sent to anyone. Please try again in a few minutes.", {
          duration: 8000,
        });
        return;
      }
      if (outcome.status === 'partial_failure') {
        const { recipientCount, failedCount } = outcome;
        toast.error(
          failedCount === null
            ? `Some of your ${recipientCount} members didn't receive it.`
            : `Sent to ${recipientCount - failedCount} of ${recipientCount} members. ${failedCount} didn't receive it.`,
          { duration: 8000 }
        );
      } else {
        toast.success(`Sent to ${outcome.recipientCount} ${outcome.recipientCount === 1 ? 'member' : 'members'}.`);
      }
      router.push(broadcastPage);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send the email. Try again.");
    } finally {
      setSending(false);
      setConfirming(false);
    }
  };

  const handleSendTest = async () => {
    if (!validate()) return;
    setTesting(true);
    try {
      const res = await fetch(
        `/api/community/${props.communitySlug}/broadcasts/test`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ subject, htmlContent: html, previewText }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Couldn't send the test. Try again.");
      }
      toast.success(`Test sent to ${props.ownerEmail}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send the test. Try again.");
    } finally {
      setTesting(false);
    }
  };

  const blocked = atLimit && props.quota.tier === 'free';

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <Card as="section" aria-label="Write the email" className="flex min-w-0 flex-col gap-4 p-5">
        <div>
          <label htmlFor="audience" className={FIELD_LABEL}>
            Send to
          </label>
          <select id="audience" value={audience} onChange={(e) => setAudience(e.target.value as Audience)} className={cn(FIELD_INPUT, 'h-10 py-0')}>
            {AUDIENCES.filter((a) => a === 'all' || props.audienceCounts[a] > 0).map((a) => (
              <option key={a} value={a}>
                {AUDIENCE_LABEL[a]} ({props.audienceCounts[a]})
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[12.5px] text-ink-3">Members who turned off community emails aren&apos;t counted.</p>
        </div>
        <div>
          <label htmlFor="subject" className={FIELD_LABEL}>
            Subject
          </label>
          <input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="For example: Showcase rehearsal on Saturday"
            maxLength={200}
            className={FIELD_INPUT}
          />
        </div>
        <div>
          <label htmlFor="preview" className={FIELD_LABEL}>
            Preview line <span className="font-normal text-ink-3">optional</span>
          </label>
          <input
            id="preview"
            value={previewText}
            onChange={(e) => setPreviewText(e.target.value)}
            placeholder="What people see in their inbox before opening"
            maxLength={200}
            className={FIELD_INPUT}
          />
        </div>
        <div>
          <p className={FIELD_LABEL}>Message</p>
          <EmailEditor
            communitySlug={props.communitySlug}
            onChange={(h, j) => {
              setHtml(h);
              setJson(j);
            }}
          />
        </div>
        <QuotaBadge {...props.quota} />
        {confirming ? (
          <InlineConfirm
            title={`Send to ${count} ${count === 1 ? 'member' : 'members'} now?`}
            confirmLabel={sending ? 'Sending…' : 'Send now'}
            cancelLabel="Not yet"
            destructive={false}
            busy={sending}
            onCancel={() => setConfirming(false)}
            onConfirm={() => void handleSend()}
          >
            You can&apos;t unsend an email.
          </InlineConfirm>
        ) : (
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={handleSendTest} disabled={testing} className={BTN_SECONDARY}>
              {testing ? 'Sending test…' : 'Send me a test'}
            </button>
            <button
              type="button"
              disabled={sending || count === 0}
              onClick={() => (blocked ? setUpgradeOpen(true) : validate() && setConfirming(true))}
              className={BTN_PRIMARY}
            >
              <Send aria-hidden="true" />
              {blocked ? 'Upgrade to send' : `Send to ${count} ${count === 1 ? 'member' : 'members'}`}
            </button>
          </div>
        )}
      </Card>

      <Card as="section" aria-label="Preview" className="overflow-hidden lg:sticky lg:top-[calc(env(safe-area-inset-top)+84px)]">
        <div className="flex flex-col gap-0.5 border-b border-line bg-surface-2 px-5 py-3 text-[13px] text-ink-2">
          <span>
            <strong className="text-ink">{props.senderName} at {props.communityName}</strong>
          </span>
          <span>To: {AUDIENCE_LABEL[audience].toLowerCase()}</span>
          <span className="truncate font-semibold text-ink">{subject || 'Your subject'}</span>
          {previewText && <span className="truncate text-ink-3">{previewText}</span>}
        </div>
        {html && html !== '<p></p>' ? (
          <div
            className="prose max-w-none px-5 py-4 text-[15px] leading-[1.65] text-ink prose-a:text-brand-ink prose-headings:font-display prose-headings:text-ink"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <p className="px-5 py-6 text-[14.5px] text-ink-3">Your message shows up here as you type.</p>
        )}
        <p className="border-t border-line px-5 py-3 text-[12.5px] text-ink-3">
          You get this because you&apos;re a member of {props.communityName}. Unsubscribe from community emails.
        </p>
      </Card>

      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} communitySlug={props.communitySlug} />
    </div>
  );
}
