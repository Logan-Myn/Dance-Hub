import Link from 'next/link';
import { CheckCircle } from 'lucide-react';

export default function UnsubscribeSuccess({
  searchParams,
}: {
  searchParams: { community?: string };
}) {
  const communityName = searchParams.community?.trim();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
          <CheckCircle className="h-6 w-6 text-emerald-600" />
        </div>

        <div className="space-y-2">
          <h1 className="font-display text-3xl text-foreground">
            {communityName
              ? `Unsubscribed from ${communityName}`
              : "You've been unsubscribed"}
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
            {communityName
              ? `You won't receive emails from ${communityName} anymore. You'll still receive DanceHub account emails and broadcasts from your other communities.`
              : "You won't receive community broadcast emails anymore. You'll still get booking confirmations, class reminders, and account notifications as usual."}
          </p>
        </div>

        <div className="pt-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Changed your mind? You can re-enable emails anytime from your settings.
          </p>
          <Link
            href="/dashboard/settings"
            className="inline-block text-sm text-primary hover:underline"
          >
            Open settings
          </Link>
        </div>
      </div>
    </div>
  );
}
