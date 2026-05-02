'use client';

import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'react-hot-toast';

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
        if (!cancelled) toast.error('Could not load email preferences');
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
      toast.error('Failed to update preference');
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
      toast.error('Failed to update preference');
    }
  }

  if (loading || !platform) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Email preferences</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading…</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email preferences</CardTitle>
      </CardHeader>
      <CardContent className="space-y-8">
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground">DanceHub emails</h3>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="marketing">DanceHub product updates</Label>
              <p className="text-xs text-muted-foreground">
                Occasional emails from us about new features and tips.
              </p>
            </div>
            <Switch
              id="marketing"
              checked={platform.marketing_emails}
              onCheckedChange={(v) => togglePlatform('marketing_emails', v)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Account, billing, and booking confirmation emails are always sent.
          </p>
        </section>

        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Community emails</h3>
          {communities.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You&apos;re not a member of any communities yet.
            </p>
          ) : (
            <div className="space-y-3">
              {communities.map((c) => (
                <div key={c.communityId} className="flex items-center justify-between">
                  <Label htmlFor={`community-${c.communityId}`}>{c.name}</Label>
                  <Switch
                    id={`community-${c.communityId}`}
                    checked={c.broadcastsEnabled && platform.teacher_broadcast}
                    disabled={!platform.teacher_broadcast}
                    onCheckedChange={(v) => toggleCommunity(c.communityId, v)}
                  />
                </div>
              ))}
            </div>
          )}
          <div className="pt-2 flex items-center justify-between border-t">
            <div className="space-y-1">
              <Label htmlFor="all-broadcasts">Receive emails from all communities</Label>
              <p className="text-xs text-muted-foreground">
                Master switch. Turn off to silence every community at once.
              </p>
            </div>
            <Switch
              id="all-broadcasts"
              checked={platform.teacher_broadcast}
              onCheckedChange={(v) => togglePlatform('teacher_broadcast', v)}
            />
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
