'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { EmailEditor } from './EmailEditor';
import { QuotaBadge } from './QuotaBadge';
import { UpgradeDialog } from './UpgradeDialog';

interface Props {
  communityId: string;
  communitySlug: string;
  communityName: string;
  ownerEmail: string;
  activeMemberCount: number;
  quota: { tier: 'vip' | 'paid' | 'free'; used: number; limit: number | null };
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
      if (data.status === 'partial_failure') {
        toast(
          `Sent to ${data.successfulCount} of ${data.recipientCount}. ${data.failedCount} failed.`,
          { icon: '⚠️' }
        );
      } else {
        toast.success(`Published to ${data.recipientCount} readers.`);
      }
      router.push(`/${props.communitySlug}/admin/emails/${data.broadcastId}`);
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
      if (!res.ok) throw new Error('Test send failed');
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
