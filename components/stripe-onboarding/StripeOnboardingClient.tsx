"use client";

import { useRouter } from "next/navigation";
import { OnboardingWizard } from "./OnboardingWizard";

interface Props {
  communityId: string;
  communitySlug: string;
}

export function StripeOnboardingClient({ communityId, communitySlug }: Props) {
  const router = useRouter();

  return (
    <OnboardingWizard
      communityId={communityId}
      communitySlug={communitySlug}
      onComplete={() => {
        router.push(`/${communitySlug}/admin/subscriptions`);
        router.refresh();
      }}
    />
  );
}
