import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default async function AdminFocusedLayout(
  props: {
    children: React.ReactNode;
    params: Promise<{ communitySlug: string }>;
  }
) {
  const params = await props.params;
  const { children } = props;

  return (
    <div className="space-y-6">
      <Link
        href={`/${params.communitySlug}/admin/subscriptions`}
        className="inline-flex items-center gap-2 text-sm font-medium text-ink-2 hover:text-ink transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to pricing and payouts
      </Link>
      <div>{children}</div>
    </div>
  );
}
