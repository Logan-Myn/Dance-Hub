import Link from 'next/link';
import { AlertCircle } from 'lucide-react';

export default function UnsubscribeInvalid() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
          <AlertCircle className="h-6 w-6 text-amber-600" />
        </div>

        <div className="space-y-2">
          <h1 className="font-display text-3xl text-foreground">
            Invalid or expired link
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
            This unsubscribe link is no longer valid. It may have already
            been used, or your preferences may have been updated since.
          </p>
        </div>

        <div className="pt-4">
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
