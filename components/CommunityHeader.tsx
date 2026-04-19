'use client';

import { useRouter } from 'next/navigation';
import { StripeRequirementsAlert } from './StripeRequirementsAlert';

interface CommunityHeaderProps {
  community: {
    id: string;
    name: string;
    description: string;
    image_url: string;
    created_by: string;
    stripeAccountId: string | null;
    customLinks: any[];
    threadCategories: any[];
    slug: string;
  };
  currentUserId: string | null;
}

export function CommunityHeader({ community, currentUserId }: CommunityHeaderProps) {
  const router = useRouter();

  const isCreator = community.created_by === currentUserId;

  return (
    <>
      {isCreator && (
        <div className="bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <StripeRequirementsAlert
              stripeAccountId={community.stripeAccountId}
              onSettingsClick={() => router.push(`/${community.slug}/admin/subscriptions`)}
            />
          </div>
        </div>
      )}
    </>
  );
}