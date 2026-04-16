import Link from 'next/link';
import { AlertCircle } from 'lucide-react';

export default function UnsubscribeError() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center">
          <AlertCircle className="h-6 w-6 text-rose-600" />
        </div>

        <div className="space-y-2">
          <h1 className="font-display text-3xl text-foreground">
            Something went wrong
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
            We couldn&apos;t process your unsubscribe request. Please try
            again, or contact us if the problem persists.
          </p>
        </div>

        <div className="pt-4">
          <Link
            href="mailto:hello@dance-hub.io"
            className="inline-block text-sm text-primary hover:underline"
          >
            Contact hello@dance-hub.io
          </Link>
        </div>
      </div>
    </div>
  );
}
