"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, CreditCard, LogOut, RotateCcw } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InlineConfirm } from "@/components/ds/inline-confirm";
import { MENU_ITEM, MENU_SEP, POP } from "@/components/community-shell/menu-styles";
import { communityPath } from "@/lib/safe-redirect";
import { cn } from "@/lib/utils";
import { BTN_PRIMARY, BTN_SECONDARY } from "../feed-header";
import { RailSection } from "./rail-section";

const day = (iso: string, timeZone: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone });

/** The viewer's own membership: plan line, renewal, manage and leave. */
export function MembershipCard({
  communityName,
  paid,
  monthlyPrice,
  yearlyEnabled,
  subscriptionStatus,
  accessEndDate,
  canManageBilling,
  timeZone,
  onManageBilling,
  onLeave,
  onRejoin,
}: {
  communityName: string;
  paid: boolean;
  monthlyPrice: number;
  yearlyEnabled: boolean;
  subscriptionStatus: string | null;
  accessEndDate: string | null;
  canManageBilling: boolean;
  timeZone: string;
  onManageBilling: () => void;
  /** Resolves when the request is done; the card closes its confirm then. */
  onLeave: () => Promise<void>;
  onRejoin: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const canceling = subscriptionStatus === "canceling";
  const plan = !paid ? "Free membership" : yearlyEnabled ? "Paid membership" : `Monthly, €${monthlyPrice}`;
  const dateLine = accessEndDate
    ? canceling
      ? `Ends ${day(accessEndDate, timeZone)}`
      : paid
        ? `Renews ${day(accessEndDate, timeZone)}`
        : null
    : null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <RailSection title="Your membership">
      <div className="flex flex-col gap-2.5 text-[14px] text-ink-2">
        <div className="flex items-center justify-between gap-2">
          <span>
            <strong className="text-ink">{plan}</strong>
            {dateLine && (
              <>
                <br />
                {dateLine}
              </>
            )}
          </span>
          {canceling ? (
            <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => run(onRejoin)}>
              <RotateCcw aria-hidden="true" />
              Rejoin
            </button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger className={cn(BTN_SECONDARY, "data-[state=open]:bg-surface-2")}>
                Manage
                <ChevronDown className="!h-4 !w-4" aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" sideOffset={8} className={cn(POP, "w-64")}>
                {paid && canManageBilling && (
                  <>
                    <DropdownMenuItem className={MENU_ITEM} onSelect={onManageBilling}>
                      <CreditCard aria-hidden="true" />
                      Plan and payment method
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className={MENU_SEP} />
                  </>
                )}
                <DropdownMenuItem className={cn(MENU_ITEM, "text-live [&>svg]:text-live")} onSelect={() => setConfirming(true)}>
                  <LogOut aria-hidden="true" />
                  Leave community
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {canceling && (
          <p className="text-[13px] text-ink-3">
            Your membership is canceled. You keep access until it ends, and you can rejoin before then.
          </p>
        )}
        {confirming && (
          <InlineConfirm
            title={`Leave ${communityName}?`}
            confirmLabel={busy ? "Leaving…" : "Leave community"}
            cancelLabel="Stay"
            busy={busy}
            onCancel={() => setConfirming(false)}
            onConfirm={() => run(onLeave)}
          >
            {paid
              ? accessEndDate
                ? `Your subscription is canceled and you keep access until ${day(accessEndDate, timeZone)}. You can rejoin anytime before then.`
                : "Your subscription is canceled and you keep access until the end of the period you paid for."
              : "You lose access to posts, classes and courses. You can join again anytime."}
          </InlineConfirm>
        )}
      </div>
    </RailSection>
  );
}

/** Site admins who aren't members join from the About page, like everyone else. */
export function AdminJoinCard({ slug }: { slug: string }) {
  return (
    <RailSection title="Membership">
      <p className="text-[14px] text-ink-2">You can see this community as a site admin. You aren&apos;t a member.</p>
      <Link href={communityPath(slug, "/about")} className={cn(BTN_SECONDARY, "w-full")}>
        Join from the About page
      </Link>
    </RailSection>
  );
}
