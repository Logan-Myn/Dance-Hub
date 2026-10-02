'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { EmailEditor } from './EmailEditor';
import { QuotaBadge } from './QuotaBadge';
import { UpgradeDialog } from './UpgradeDialog';
import { communityPath } from '@/lib/safe-redirect';

interface Props {
  communityId: string;
  communitySlug: string;
  communityName: string;
  ownerEmail: string;
  activeMemberCount: number;
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

  const atLimit = props.quota.limit !== null && props.quota.used >= props.quota.limit;

  const validate = () => {
    if (!subject.trim()) {
      toast.error('Subject is required');
      return false;
    }
    if (!html.trim() || html === '<p></p>') {
      toast.error('Message is empty');
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
        body: JSON.stringify({ subject, htmlContent: html, editorJson: json, previewText }),
      });
      if (res.status === 402) {
        setUpgradeOpen(true);
        return;
      }
      if (!res.ok) {
        const body = await res.text();
        let msg = 'Send failed';
        try {
          msg = JSON.parse(body).error || msg;
        } catch {}
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
        toast('Still sending. The broadcast page will show how it went.', { duration: 8000 });
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
        toast.success(`Published to ${outcome.recipientCount} readers.`);
      }
      router.push(broadcastPage);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSending(false);
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
        throw new Error(body.error || 'Test send failed');
      }
      toast.success(`Test sent to ${props.ownerEmail}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test send failed');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_18rem] gap-10">
      {/* Composer */}
      <div className="space-y-8 min-w-0">
        <div className="space-y-1">
          <label
            htmlFor="subject"
            className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium"
          >
            Subject
          </label>
          <input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Your headline"
            className="w-full bg-transparent border-0 border-b border-border/60 rounded-none px-0 py-2 font-display text-3xl leading-tight text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary transition-colors"
          />
        </div>

        <div className="space-y-1">
          <label
            htmlFor="preview"
            className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium"
          >
            Preview text
          </label>
          <input
            id="preview"
            value={previewText}
            onChange={(e) => setPreviewText(e.target.value)}
            placeholder="The line people see in their inbox before opening"
            className="w-full bg-transparent border-0 border-b border-border/60 rounded-none px-0 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary transition-colors italic"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium">
            Body
          </label>
          <EmailEditor
            communitySlug={props.communitySlug}
            onChange={(h, j) => {
              setHtml(h);
              setJson(j);
            }}
          />
        </div>
      </div>

      {/* Side panel */}
      <aside className="space-y-8">
        <section>
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium mb-3">
            Readership
          </p>
          <p className="font-display text-3xl leading-none text-foreground">
            {props.activeMemberCount}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {props.activeMemberCount === 1 ? 'active member' : 'active members'}
          </p>
        </section>

        <section className="pt-6 border-t border-border/50">
          <QuotaBadge {...props.quota} />
        </section>

        <section className="space-y-2 pt-2">
          <button
            type="button"
            onClick={handleSend}
            disabled={sending}
            className="w-full bg-primary text-primary-foreground py-3 px-4 rounded-sm text-sm font-medium tracking-wide hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending
              ? 'Publishing…'
              : atLimit && props.quota.tier === 'free'
              ? 'Upgrade to publish →'
              : 'Publish broadcast'}
          </button>
          <button
            type="button"
            onClick={handleSendTest}
            disabled={testing}
            className="w-full bg-transparent text-foreground py-3 px-4 rounded-sm text-sm font-medium border border-border hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
          >
            {testing ? 'Sending test…' : 'Send test to myself'}
          </button>
        </section>
      </aside>

      <UpgradeDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        communitySlug={props.communitySlug}
      />
    </div>
  );
}
