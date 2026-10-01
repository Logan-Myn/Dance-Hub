"use client";

import { useRouter } from "next/navigation";
import { OnboardingWizard } from "./OnboardingWizard";
import { communityPath } from "@/lib/safe-redirect";

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
        router.push(communityPath(communitySlug, '/admin/subscriptions'));
        router.refresh();
      }}
    />
  );
}
