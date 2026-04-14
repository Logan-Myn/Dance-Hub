import Link from 'next/link';
import { queryOne } from '@/lib/db';
import { Button } from '@/components/ui/button';

interface BroadcastRow {
  id: string;
  subject: string;
  html_content: string;
  preview_text: string | null;
  recipient_count: number;
  status: 'pending' | 'sending' | 'sent' | 'partial_failure' | 'failed';
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
}

export default async function BroadcastDetailPage({
  params,
}: {
  params: { communitySlug: string; broadcastId: string };
}) {
  const community = await queryOne<{ id: string }>`
    SELECT id FROM communities WHERE slug = ${params.communitySlug}
  `;
  if (!community) return null;

  const broadcast = await queryOne<BroadcastRow>`
    SELECT * FROM email_broadcasts
    WHERE id = ${params.broadcastId} AND community_id = ${community.id}
  `;
  if (!broadcast) return <p>Broadcast not found.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">{broadcast.subject}</h2>
          <p className="text-sm text-muted-foreground">
            {broadcast.sent_at ? `Sent ${new Date(broadcast.sent_at).toLocaleString()}` : 'Not sent'}
            {' · '}
            {broadcast.recipient_count} recipients · {broadcast.status}
          </p>
          {broadcast.error_message && (
            <p className="text-sm text-rose-600 mt-2">Error: {broadcast.error_message}</p>
          )}
        </div>
        <Button variant="outline" asChild>
          <Link href={`/${params.communitySlug}/admin/emails`}>Back</Link>
        </Button>
      </div>

      <div className="border rounded-lg p-6 bg-white">
        <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: broadcast.html_content }} />
      </div>
    </div>
  );
}
