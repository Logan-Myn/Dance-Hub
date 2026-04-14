'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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
    if (!subject.trim()) { toast.error('Subject is required'); return false; }
    if (!html.trim() || html === '<p></p>') { toast.error('Message is empty'); return false; }
    return true;
  };

  const handleSend = async () => {
    if (atLimit && props.quota.tier === 'free') { setUpgradeOpen(true); return; }
    if (!validate()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/community/${props.communitySlug}/broadcasts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subject, htmlContent: html, editorJson: json, previewText }),
      });
      if (res.status === 402) { setUpgradeOpen(true); return; }
      if (!res.ok) throw new Error((await res.json()).error || 'Send failed');
      const data = await res.json();
      if (data.status === 'partial_failure') {
        toast(`Sent to ${data.successfulCount} of ${data.recipientCount}. ${data.failedCount} failed.`, { icon: '⚠️' });
      } else {
        toast.success(`Sent to ${data.recipientCount} members.`);
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
      const res = await fetch(`/api/community/${props.communitySlug}/broadcasts/test`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subject, htmlContent: html, previewText }),
      });
      if (!res.ok) throw new Error('Test send failed');
      toast.success(`Test sent to ${props.ownerEmail}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test send failed');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <div>
          <Label htmlFor="subject">Subject</Label>
          <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g., Spring schedule update" />
        </div>
        <div>
          <Label htmlFor="preview">Preview text (optional)</Label>
          <Input id="preview" value={previewText} onChange={(e) => setPreviewText(e.target.value)} placeholder="Short description shown in inbox" />
        </div>
        <EmailEditor communitySlug={props.communitySlug} onChange={(h, j) => { setHtml(h); setJson(j); }} />
      </div>

      <aside className="space-y-4">
        <div className="border rounded-lg p-4 space-y-3">
          <div>
            <div className="text-xs text-muted-foreground">Recipients</div>
            <div className="text-lg font-semibold">{props.activeMemberCount} active members</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Sending from</div>
            <div className="text-sm">{props.communityName} &lt;community@dance-hub.io&gt;</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Reply-to</div>
            <div className="text-sm">{props.ownerEmail}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Quota</div>
            <QuotaBadge {...props.quota} />
          </div>
        </div>

        <div className="space-y-2">
          <Button onClick={handleSend} disabled={sending} className="w-full">
            {sending ? 'Sending…' : atLimit && props.quota.tier === 'free' ? 'Upgrade to send →' : 'Send now'}
          </Button>
          <Button variant="outline" onClick={handleSendTest} disabled={testing} className="w-full">
            {testing ? 'Sending test…' : 'Send test to me'}
          </Button>
        </div>
      </aside>

      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} communitySlug={props.communitySlug} />
    </div>
  );
}
