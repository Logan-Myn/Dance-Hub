"use client";

import { NextStep } from "nextstepjs";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { tourSteps } from "@/lib/tourSteps";

interface NextStepWrapperProps {
  children: React.ReactNode;
}

// Selectors that live on a different page than the one the user is currently
// on need an explicit route. Anything not listed here is assumed to live on
// the community feed page (`/[communitySlug]`).
const STEP_ROUTES: Record<string, (slug: string) => string> = {
  "#settings-general": (slug) => `/${slug}/admin/general`,
  "#settings-subscriptions": (slug) => `/${slug}/admin/subscriptions`,
  "#settings-thread_categories": (slug) => `/${slug}/admin/thread-categories`,
  "#manage-private-lessons": (slug) => `/${slug}/private-lessons`,
  "#community-header": (slug) => `/${slug}`,
  "#manage-community-button": (slug) => `/${slug}`,
  "#member-count": (slug) => `/${slug}`,
  "#write-post": (slug) => `/${slug}`,
  "#thread-categories": (slug) => `/${slug}`,
};

// All onboarding-tour pages nest under /[communitySlug], so the first
// non-empty path segment is always the slug.
function extractCommunitySlug(pathname: string | null): string | null {
  if (!pathname) return null;
  return pathname.split("/").filter(Boolean)[0] ?? null;
}

function markTourCompleted(slug: string | null) {
  if (!slug || typeof window === "undefined") return;
  const key = `onboarding-tour-completed-${slug}`;
  if (!localStorage.getItem(key)) {
    localStorage.setItem(key, "true");
    toast.success("Welcome to your community! 🎉");
  }
}

export default function NextStepWrapper({ children }: NextStepWrapperProps) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <NextStep
      steps={tourSteps}
      onStepChange={(stepIndex, tourName) => {
        if (tourName !== "onboarding") return;

        const onboarding = tourSteps.find((t) => t.tour === "onboarding");
        const step = onboarding?.steps[stepIndex];
        const selector = step?.selector;
        if (!selector) return;

        const routeFor = STEP_ROUTES[selector];
        if (!routeFor) return;

        const slug = extractCommunitySlug(pathname);
        if (!slug) return;

        const target = routeFor(slug);
        if (pathname !== target) {
          router.push(target);
        }

        // Wait for the destination element to mount before nudging the tour
        // to recompute its highlight position.
        const waitAndReposition = () => {
          setTimeout(() => {
            const el = document.querySelector(selector);
            if (el && (el as HTMLElement).offsetParent !== null) {
              window.dispatchEvent(new Event("resize"));
              requestAnimationFrame(() =>
                window.dispatchEvent(new Event("scroll"))
              );
            } else {
              setTimeout(waitAndReposition, 100);
            }
          }, 150);
        };
        waitAndReposition();
      }}
      onComplete={(tourName) => {
        if (tourName === "onboarding") {
          markTourCompleted(extractCommunitySlug(pathname));
        }
      }}
      onSkip={(_step, tourName) => {
        if (tourName === "onboarding") {
          markTourCompleted(extractCommunitySlug(pathname));
        }
      }}
    >
      {children}
    </NextStep>
  );
}
