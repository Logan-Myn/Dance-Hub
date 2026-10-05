'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/community-admin/ui';
import { Skeleton } from '@/components/ds/skeleton';
import { Switch } from '@/components/ds/switch';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';

interface CommunityRow {
  communityId: string;
  name: string;
  slug: string;
  broadcastsEnabled: boolean;
}

interface PlatformPrefs {
  marketing_emails: boolean;
  teacher_broadcast: boolean;
}

export function EmailPreferencesCard() {
  const [communities, setCommunities] = useState<CommunityRow[]>([]);
  const [platform, setPlatform] = useState<PlatformPrefs | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [prefsRes, communitiesRes] = await Promise.all([
          fetch('/api/email/preferences'),
          fetch('/api/email/preferences/communities'),
        ]);
        if (!prefsRes.ok || !communitiesRes.ok) throw new Error('Failed to load preferences');
        const prefsData = await prefsRes.json();
        const communitiesData = await communitiesRes.json();
        if (cancelled) return;
        setPlatform({
          marketing_emails: prefsData.preferences.marketing_emails,
          teacher_broadcast: prefsData.preferences.teacher_broadcast,
        });
        setCommunities(communitiesData.communities);
      } catch (err) {
        console.error(err);
        if (!cancelled) toast.error("Couldn't load your email preferences. Reload the page.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function togglePlatform(field: keyof PlatformPrefs, value: boolean) {
    if (!platform) return;
    const next = { ...platform, [field]: value };
    setPlatform(next);
    try {
      const res = await fetch('/api/email/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) throw new Error('Failed');
    } catch {
      setPlatform(platform);
      toast.error("Couldn't save that. Try again.");
    }
  }

  async function toggleCommunity(communityId: string, enabled: boolean) {
    const previous = communities;
    setCommunities((prev) =>
      prev.map((c) => (c.communityId === communityId ? { ...c, broadcastsEnabled: enabled } : c))
    );
    try {
      const res = await fetch('/api/email/preferences/communities', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, enabled }),
      });
      if (!res.ok) throw new Error('Failed');
    } catch {
      setCommunities(previous);
      toast.error("Couldn't save that. Try again.");
    }
  }

  const title = (
    <h2 id="email-prefs-h" className="font-display text-[17px] font-semibold text-ink">
      Email preferences
    </h2>
  );

  if (loading || !platform) {
    return (
      <Card as="section" aria-labelledby="email-prefs-h" className="flex flex-col gap-3 p-5 sm:p-6" aria-busy="true">
        {title}
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </Card>
    );
  }

  const row = "flex items-center justify-between gap-4 py-3";
  return (
    <Card as="section" aria-labelledby="email-prefs-h" className="flex flex-col gap-5 p-5 sm:p-6">
      {title}
      <div>
        <h3 className="text-[13px] font-semibold text-ink-2">From Dance-Hub</h3>
        <div className={row}>
          <div className="min-w-0">
            <p className="text-[14.5px] font-medium text-ink">Product updates</p>
            <p className="text-[13px] text-ink-3">Now and then: new features and tips.</p>
          </div>
          <Switch
            checked={platform.marketing_emails}
            onChange={(v) => togglePlatform('marketing_emails', v)}
            label="Product updates"
            hideLabel
          />
        </div>
        <p className="text-[12.5px] text-ink-3">Account, payment and booking emails are always sent.</p>
      </div>

      <div>
        <h3 className="text-[13px] font-semibold text-ink-2">From your communities</h3>
        <div className={cn(row, "border-b border-line")}>
          <div className="min-w-0">
            <p className="text-[14.5px] font-medium text-ink">All community emails</p>
            <p className="text-[13px] text-ink-3">Turn off to silence every community at once.</p>
          </div>
          <Switch
            checked={platform.teacher_broadcast}
            onChange={(v) => togglePlatform('teacher_broadcast', v)}
            label="All community emails"
            hideLabel
          />
        </div>
        {communities.length === 0 ? (
          <p className="pt-3 text-[14px] text-ink-2">You&apos;re not a member of any communities yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {communities.map((c) => (
              <li key={c.communityId} className={row}>
                <span className="min-w-0 truncate text-[14.5px] text-ink">{c.name}</span>
                <Switch
                  checked={c.broadcastsEnabled && platform.teacher_broadcast}
                  disabled={!platform.teacher_broadcast}
                  onChange={(v) => toggleCommunity(c.communityId, v)}
                  label={`Emails from ${c.name}`}
                  hideLabel
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
