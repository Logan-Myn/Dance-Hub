'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Catches render errors anywhere inside a community (feed, classroom,
// calendar...) so one failing widget doesn't take down the whole page.
export default function CommunityError({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  unstable_retry?: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center">
          <AlertCircle className="h-6 w-6 text-rose-600" />
        </div>

        <div className="space-y-2">
          <h1 className="font-display text-3xl text-foreground">
            Something went wrong
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
            This page couldn&apos;t load. Please try again. If it keeps
            happening, contact hello@dance-hub.io.
          </p>
        </div>

        <div className="flex items-center justify-center gap-3">
          <Button onClick={() => (unstable_retry ?? reset)()}>Try again</Button>
          <Button variant="outline" asChild>
            <Link href="/">Go home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
