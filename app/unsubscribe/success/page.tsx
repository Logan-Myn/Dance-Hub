import Link from 'next/link';
import { CheckCircle } from 'lucide-react';

export default function UnsubscribeSuccess() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
          <CheckCircle className="h-6 w-6 text-emerald-600" />
        </div>

        <div className="space-y-2">
          <h1 className="font-display text-3xl text-foreground">
            You&apos;ve been unsubscribed
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
            You won&apos;t receive community broadcast emails anymore.
            You&apos;ll still get booking confirmations, class reminders,
            and account notifications as usual.
          </p>
        </div>

        <div className="pt-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Changed your mind? You can re-enable broadcasts anytime from
            your email preferences.
          </p>
          <Link
            href="/"
            className="inline-block text-sm text-primary hover:underline"
          >
            ← Back to DanceHub
          </Link>
        </div>
      </div>
    </div>
  );
}
