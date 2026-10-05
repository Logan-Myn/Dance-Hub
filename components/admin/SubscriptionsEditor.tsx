"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { AlertTriangle, Banknote, CheckCircle2, Loader2, TrendingUp } from "lucide-react";
import { BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY } from "@/components/community-feed/feed-header";
import { Card, Screen, ScreenHead } from "@/components/community-admin/ui";
import { FIELD_INPUT, FIELD_LABEL } from "@/components/ds/app-dialog";
import { Pill } from "@/components/ds/pill";
import { SaveBar } from "@/components/ds/save-bar";
import { Skeleton } from "@/components/ds/skeleton";
import { Switch } from "@/components/ds/switch";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { PayoutScheduleForm } from "@/components/admin/PayoutScheduleForm";
import { communityPath } from "@/lib/safe-redirect";
import { LAUNCH_PROMO_DAYS } from "@/lib/platform-fees";

// Ported from CommunitySettingsModal.tsx lines 92-120.
interface StripeRequirement {
  code: string;
  message: string;
}

interface StripeRequirements {
  currentlyDue: StripeRequirement[];
  pastDue: StripeRequirement[];
  eventuallyDue: StripeRequirement[];
  currentDeadline?: number;
  disabledReason?: string;
}

interface StripeAccountStatus {
  isEnabled: boolean;
  needsSetup: boolean;
  accountId?: string;
  details?: {
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    requirements: StripeRequirements;
    businessType?: string;
    capabilities?: Record<string, string>;
    payoutSchedule?: unknown;
    defaultCurrency?: string;
    email?: string;
  };
}

// Ported from CommunitySettingsModal.tsx lines 122-137.
interface PayoutData {
  balance: {
    available: number;
    pending: number;
    currency: string;
  };
  payouts: Array<{
    id: string;
    amount: number;
    currency: string;
    arrivalDate: string;
    status: string;
    type: string;
    bankAccount: { last4?: string } | null;
  }>;
}

interface BankAccount {
  iban?: string;
  last4?: string;
  bank_name?: string;
}

interface SubscriptionsEditorProps {
  communityId: string;
  communitySlug: string;
  initialStripeAccountId: string | null;
  initialMembershipEnabled: boolean;
  initialMembershipPrice: number;
  initialYearlyEnabled: boolean;
  initialYearlyPrice: number;
  initialYearlyBenefits: string;
  communityCreatedAt: string;
}

function daysLeftInPromo(createdAt: string): number {
  const created = new Date(createdAt).getTime();
  const ends = created + LAUNCH_PROMO_DAYS * 24 * 60 * 60 * 1000;
  const remainingMs = ends - Date.now();
  return Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

export function SubscriptionsEditor({
  communityId,
  communitySlug,
  initialStripeAccountId,
  initialMembershipEnabled,
  initialMembershipPrice,
  initialYearlyEnabled,
  initialYearlyPrice,
  initialYearlyBenefits,
  communityCreatedAt,
}: SubscriptionsEditorProps) {
  const promoDaysLeft = daysLeftInPromo(communityCreatedAt);
  const isInPromoPeriod = promoDaysLeft > 0;
  const router = useRouter();
  const { session } = useAuth();

  // Stripe account ID is sourced from the DB (via RSC) but may change locally
  // after onboarding completes — store in state so the rest of the component
  // reacts immediately without waiting for router.refresh().
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(
    initialStripeAccountId
  );
  const [isMembershipEnabled, setIsMembershipEnabled] = useState(
    initialMembershipEnabled
  );
  const [price, setPrice] = useState(initialMembershipPrice);
  const [isYearlyEnabled, setIsYearlyEnabled] = useState(initialYearlyEnabled);
  const [yearlyPrice, setYearlyPrice] = useState(initialYearlyPrice);
  const [yearlyBenefits, setYearlyBenefits] = useState(initialYearlyBenefits);
  const [isSavingPrice, setIsSavingPrice] = useState(false);

  // Live Stripe state — fetched client-side on mount + whenever stripeAccountId
  // changes (ported from modal lines 299-358). Server-side RSC cannot cache
  // this safely since it's live Stripe API data.
  const [stripeAccountStatus, setStripeAccountStatus] =
    useState<StripeAccountStatus>({
      isEnabled: false,
      needsSetup: true,
      accountId: initialStripeAccountId || undefined,
      details: undefined,
    });
  const [isLoadingStripeStatus, setIsLoadingStripeStatus] = useState(false);

  // Payout data — only fetched once Stripe is fully enabled (modal lines 461-491).
  const [payoutData, setPayoutData] = useState<PayoutData | null>(null);
  const [isLoadingPayouts, setIsLoadingPayouts] = useState(false);

  // Bank account — only fetched once Stripe is fully enabled (modal lines 494-522).
  const [bankAccount, setBankAccount] = useState<BankAccount | null>(null);
  const [isLoadingBank, setIsLoadingBank] = useState(false);
  const [isUpdatingIban, setIsUpdatingIban] = useState(false);
  const [showIbanUpdateForm, setShowIbanUpdateForm] = useState(false);
  const [newIban, setNewIban] = useState("");
  const [newAccountHolderName, setNewAccountHolderName] = useState("");

  // Onboarding wizard visibility.

  // Fetch Stripe account status (modal lines 299-358).
  useEffect(() => {
    async function fetchStripeStatus() {
      if (!stripeAccountId) {
        setStripeAccountStatus({
          isEnabled: false,
          needsSetup: true,
          accountId: undefined,
          details: undefined,
        });
        return;
      }

      setIsLoadingStripeStatus(true);
      try {
        const response = await fetch(
          `/api/stripe/account-status/${stripeAccountId}`
        );
        if (!response.ok) {
          throw new Error(
            `Failed to fetch Stripe status: ${response.status}`
          );
        }

        const data = await response.json();
        setStripeAccountStatus({
          isEnabled: data.chargesEnabled && data.payoutsEnabled,
          needsSetup: !data.detailsSubmitted,
          accountId: stripeAccountId,
          details: {
            chargesEnabled: data.chargesEnabled,
            payoutsEnabled: data.payoutsEnabled,
            detailsSubmitted: data.detailsSubmitted,
            requirements: data.requirements,
            businessType: data.businessType,
            capabilities: data.capabilities,
            payoutSchedule: data.payoutSchedule,
            defaultCurrency: data.defaultCurrency,
            email: data.email,
          },
        });
      } catch (error) {
        console.error("Error in fetchStripeStatus:", error);
        setStripeAccountStatus({
          isEnabled: false,
          needsSetup: true,
          accountId: stripeAccountId,
          details: undefined,
        });
      } finally {
        setIsLoadingStripeStatus(false);
      }
    }

    fetchStripeStatus();
  }, [stripeAccountId]);

  // Refresh Stripe status after return from Stripe onboarding redirect
  // (?setup=complete). Ported from modal lines 361-391.
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const setup = urlParams.get("setup");

    if (setup === "complete" && stripeAccountId) {
      const refetch = async () => {
        setIsLoadingStripeStatus(true);
        try {
          const response = await fetch(
            `/api/stripe/account-status/${stripeAccountId}`
          );
          if (!response.ok) throw new Error("Failed to fetch status");
          const data = await response.json();
          setStripeAccountStatus({
            isEnabled: data.chargesEnabled && data.payoutsEnabled,
            needsSetup: !data.detailsSubmitted,
            accountId: stripeAccountId,
            details: data,
          });
        } catch (error) {
          console.error("Error refreshing Stripe status:", error);
        } finally {
          setIsLoadingStripeStatus(false);
        }
      };
      refetch();
    }
  }, [stripeAccountId]);

  // Fetch payout data (modal lines 461-491).
  useEffect(() => {
    async function fetchPayoutData() {
      if (!stripeAccountId || !stripeAccountStatus.isEnabled) return;
      setIsLoadingPayouts(true);
      try {
        const response = await fetch(
          `/api/community/${communitySlug}/payouts`
        );
        if (!response.ok) throw new Error("Failed to fetch payout data");
        const data = await response.json();
        setPayoutData(data);
      } catch (error) {
        console.error("Error fetching payout data:", error);
        toast.error("Couldn't load your payouts. Reload the page.");
      } finally {
        setIsLoadingPayouts(false);
      }
    }

    fetchPayoutData();
  }, [communitySlug, stripeAccountId, stripeAccountStatus.isEnabled]);

  // Fetch bank account details (modal lines 494-522).
  useEffect(() => {
    async function fetchBankAccount() {
      if (!stripeAccountId || !stripeAccountStatus.isEnabled) return;
      setIsLoadingBank(true);
      try {
        const response = await fetch(
          `/api/stripe/bank-account/${stripeAccountId}`
        );
        if (!response.ok) throw new Error("Failed to fetch bank account");
        const data = await response.json();
        setBankAccount(data);
      } catch (error) {
        console.error("Error fetching bank account:", error);
        toast.error("Couldn't load your bank account. Reload the page.");
      } finally {
        setIsLoadingBank(false);
      }
    }

    fetchBankAccount();
  }, [stripeAccountId, stripeAccountStatus.isEnabled]);

  // --- Handlers ported from CommunitySettingsModal ---

  // Opens Stripe-managed dashboard / update link to manage bank account
  // (modal lines 524-562).
  const handleUpdateIban = useCallback(async () => {
    if (!stripeAccountId) return;

    setIsUpdatingIban(true);
    try {
      const response = await fetch(
        `/api/stripe/bank-account/${stripeAccountId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Couldn't open your payout account. Try again.");
      }

      const { url, requiresOnboarding, accountType, message } =
        await response.json();

      if (requiresOnboarding) {
        toast.success("Finish setting up payouts first, then you can manage your bank account");
      } else if (message) {
        toast.success(message);
      } else if (accountType === "custom") {
        toast.success("Opening your payout account");
      }

      window.location.href = url;
    } catch (error) {
      console.error("Error accessing Stripe dashboard:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn't open your payout account. Try again."
      );
    } finally {
      setIsUpdatingIban(false);
    }
  }, [stripeAccountId]);

  // Submits a new IBAN + holder name to replace current bank account
  // (modal lines 564-616).
  const handleSubmitIbanUpdate = useCallback(async () => {
    if (!stripeAccountId || !newIban || !newAccountHolderName) {
      toast.error("Fill in the IBAN and the account holder name.");
      return;
    }

    if (!session) {
      toast.error("Sign in again to change your bank account.");
      return;
    }

    setIsUpdatingIban(true);
    try {
      const response = await fetch(
        `/api/stripe/bank-account/${stripeAccountId}/update-iban`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            iban: newIban,
            accountHolderName: newAccountHolderName,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update bank account");
      }

      const { bankAccount: updated, message } = await response.json();

      setBankAccount({
        last4: updated.last4,
        bank_name: "Updated",
      });

      setShowIbanUpdateForm(false);
      setNewIban("");
      setNewAccountHolderName("");

      toast.success(message || "Bank account replaced");
    } catch (error) {
      console.error("Error updating IBAN:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to update bank account"
      );
    } finally {
      setIsUpdatingIban(false);
    }
  }, [stripeAccountId, newIban, newAccountHolderName, session]);

  // Opens Stripe's hosted update link for completing verification requirements
  // (modal lines 826-849).
  const handleCompleteVerification = useCallback(async () => {
    try {
      const response = await fetch("/api/stripe/create-update-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accountId: stripeAccountId,
          returnUrl: window.location.href,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create update link");
      }

      const { url } = await response.json();
      window.location.href = url;
    } catch (error) {
      console.error("Error creating update link:", error);
      toast.error("Couldn't open the verification form. Try again.");
    }
  }, [stripeAccountId]);

  // The custom onboarding flow now lives at /[slug]/admin/stripe-onboarding
  // (a dedicated page in the (focused) route group). Triggers in this editor
  // navigate there via Link instead of mounting the wizard modal here.
  const handleStartCustomOnboarding = useCallback(() => {
    router.push(communityPath(communitySlug, '/admin/stripe-onboarding'));
  }, [router, communitySlug]);

  // Creates / updates the Stripe Price + toggles membership on/off
  // (modal lines 880-917).
  const handlePriceUpdate = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/community/${communitySlug}/update-price`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            price,
            enabled: isMembershipEnabled,
            yearlyEnabled: isYearlyEnabled,
            yearlyPrice,
            yearlyBenefits,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error("Server error details:", data);
        throw new Error(data.error || "Failed to update price");
      }

      toast.success("Prices saved");
      router.refresh();
    } catch (error) {
      console.error("Error updating price:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to update price"
      );
    }
  }, [communitySlug, price, isMembershipEnabled, isYearlyEnabled, yearlyPrice, yearlyBenefits, router]);

  // --- Render ---

  const monthlyNum = Number(price) || 0;
  const yearlyNum = Number(yearlyPrice) || 0;
  const yearlySaving = Math.round((monthlyNum * 12 - yearlyNum) * 100) / 100;
  const priceDirty =
    isMembershipEnabled !== initialMembershipEnabled ||
    monthlyNum !== Number(initialMembershipPrice || 0) ||
    isYearlyEnabled !== initialYearlyEnabled ||
    (isYearlyEnabled && yearlyNum !== Number(initialYearlyPrice || 0)) ||
    (isYearlyEnabled && yearlyBenefits !== (initialYearlyBenefits || ""));
  const [savingPrice, setSavingPrice] = [isSavingPrice, setIsSavingPrice];
  const savePrice = async () => {
    setSavingPrice(true);
    try {
      await handlePriceUpdate();
    } finally {
      setSavingPrice(false);
    }
  };
  const discardPrice = () => {
    setIsMembershipEnabled(initialMembershipEnabled);
    setPrice(initialMembershipPrice);
    setIsYearlyEnabled(initialYearlyEnabled);
    setYearlyPrice(initialYearlyPrice);
    setYearlyBenefits(initialYearlyBenefits);
  };
  const requirements = stripeAccountStatus.details?.requirements;
  const dueCount = (requirements?.currentlyDue.length ?? 0) + (requirements?.pastDue.length ?? 0);
  const euro = (n: number) => `€${n.toFixed(n % 1 ? 2 : 0)}`;

  const payoutStatus = !stripeAccountId ? (
    <div className="flex gap-3.5 rounded-xl border border-live/25 bg-live-soft p-4">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-live" aria-hidden="true" />
      <div className="min-w-0">
        <strong className="block text-[15px] text-ink">Payouts aren&apos;t set up</strong>
        <p className="mt-0.5 text-[14px] text-ink-2">Connect a bank account so members can pay and you get paid. You&apos;ll need:</p>
        <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-[14px] text-ink-2">
          <li>Your legal name and date of birth</li>
          <li>Your bank account number (IBAN)</li>
          <li>Sometimes, a photo of your ID</li>
        </ol>
        <button type="button" onClick={handleStartCustomOnboarding} className={cn(BTN_PRIMARY, "mt-3.5")}>
          <Banknote aria-hidden="true" />
          Set up payouts
        </button>
      </div>
    </div>
  ) : !stripeAccountStatus.isEnabled ? (
    <div className="flex gap-3.5 rounded-xl border border-warn/30 bg-warn-soft p-4">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warn" aria-hidden="true" />
      <div className="min-w-0">
        <strong className="block text-[15px] text-ink">Payouts need a few more details</strong>
        <p className="mt-0.5 text-[14px] text-ink-2">
          Finish verifying your account to take payments and receive payouts.
          {dueCount > 0 ? ` ${dueCount} ${dueCount === 1 ? "item is" : "items are"} still needed.` : ""}
        </p>
        {(requirements?.pastDue.length ?? 0) > 0 && (
          <p className="mt-2">
            <Pill variant="live">{requirements!.pastDue.length} past due</Pill>
          </p>
        )}
        <div className="mt-3.5 flex flex-wrap gap-2">
          <button type="button" onClick={handleCompleteVerification} className={BTN_PRIMARY}>
            Finish verification
          </button>
          <button type="button" onClick={handleStartCustomOnboarding} className={BTN_GHOST}>
            Open the setup steps
          </button>
        </div>
      </div>
    </div>
  ) : (
    <div className="flex gap-3.5 rounded-xl border border-ok/25 bg-ok-soft p-4">
      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-ok" aria-hidden="true" />
      <div className="min-w-0">
        <strong className="block text-[15px] text-ink">Payouts are on</strong>
        <p className="mt-0.5 text-[14px] text-ink-2">
          {bankAccount?.last4 ? `Money goes to your account ending in ${bankAccount.last4}.` : "Money goes to your bank account."}
        </p>
      </div>
    </div>
  );

  // Optional lightweight loading indicator while the initial account status
  // fetch is in flight, so a connected community doesn't flash "set up".
  const showInitialStripeLoader = stripeAccountId && isLoadingStripeStatus && !stripeAccountStatus.details;

  return (
    <Screen>
      <ScreenHead title="Pricing and payouts" sub="What members pay, and how you get paid." />
      <div id="settings-subscriptions" className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <Card as="section" aria-labelledby="price-h" className="flex flex-col gap-4 p-5">
          <h2 id="price-h" className="font-display text-[17px] font-semibold text-ink">
            Membership price
          </h2>
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="sr-only">Membership type</legend>
            {(
              [
                [false, "Free membership", "Members join for free. You can still sell private lessons."],
                [true, "Paid membership", "Monthly, with an optional yearly plan."],
              ] as const
            ).map(([paid, title, text]) => {
              const disabled = paid && !stripeAccountStatus.isEnabled && !isMembershipEnabled;
              return (
                <label
                  key={String(paid)}
                  className={cn(
                    "flex cursor-pointer gap-2.5 rounded-xl border p-3.5 transition-colors",
                    isMembershipEnabled === paid ? "border-brand bg-brand-soft" : "border-line hover:border-line-strong",
                    disabled && "cursor-not-allowed opacity-60"
                  )}
                >
                  <input
                    type="radio"
                    name="membership-model"
                    checked={isMembershipEnabled === paid}
                    disabled={disabled}
                    onChange={() => setIsMembershipEnabled(paid)}
                    className="mt-1 accent-[rgb(var(--ds-brand))]"
                  />
                  <span>
                    <strong className="block text-[14.5px] text-ink">{title}</strong>
                    <span className="text-[13px] text-ink-2">{disabled ? "Set up payouts first." : text}</span>
                  </span>
                </label>
              );
            })}
          </fieldset>

          {isMembershipEnabled && (
            <>
              <div>
                <label htmlFor="price-monthly" className={FIELD_LABEL}>
                  Monthly price
                </label>
                <div className="relative max-w-[220px]">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-3">€</span>
                  <input
                    id="price-monthly"
                    type="number"
                    min="0"
                    step="0.01"
                    value={price || ""}
                    onChange={(e) => setPrice(Number(e.target.value))}
                    placeholder="0.00"
                    className={cn(FIELD_INPUT, "pl-7 tabular-nums")}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-3 border-t border-line pt-4">
                <Switch checked={isYearlyEnabled} onChange={setIsYearlyEnabled} label="Offer a yearly plan" />
                {isYearlyEnabled && (
                  <>
                    <div>
                      <label htmlFor="price-yearly" className={FIELD_LABEL}>
                        Yearly price
                      </label>
                      <div className="relative max-w-[220px]">
                        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-3">€</span>
                        <input
                          id="price-yearly"
                          type="number"
                          min="0"
                          step="0.01"
                          value={yearlyPrice || ""}
                          onChange={(e) => setYearlyPrice(Number(e.target.value))}
                          placeholder="0.00"
                          className={cn(FIELD_INPUT, "pl-7 tabular-nums")}
                        />
                      </div>
                      <p className={cn("mt-1.5 text-[12.5px]", yearlySaving > 0 ? "text-ok" : "text-ink-3")}>
                        {yearlyNum > 0 && monthlyNum > 0
                          ? yearlySaving > 0
                            ? `Members save ${euro(yearlySaving)} compared to twelve monthly payments.`
                            : "Set it below twelve monthly payments so the yearly plan is a better deal."
                          : "About 10 times the monthly price gives members roughly two months free."}
                      </p>
                    </div>
                    <div>
                      <label htmlFor="yearly-benefits" className={FIELD_LABEL}>
                        Why go yearly? <span className="font-normal text-ink-3">optional</span>
                      </label>
                      <input
                        id="yearly-benefits"
                        value={yearlyBenefits}
                        onChange={(e) => setYearlyBenefits(e.target.value)}
                        placeholder="For example: two months free and one private lesson"
                        maxLength={200}
                        className={FIELD_INPUT}
                      />
                      <p className="mt-1.5 text-[12.5px] text-ink-3">Shown to members when they choose a plan.</p>
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          <div className="rounded-xl bg-surface-2 px-4 py-3">
            <p className="text-[12.5px] font-semibold text-ink-3">What visitors see</p>
            <p className="mt-1 text-[15px] tabular-nums text-ink">
              {isMembershipEnabled && monthlyNum > 0 ? (
                <>
                  <strong className="font-display text-[20px]">{euro(monthlyNum)}</strong> a month
                  {isYearlyEnabled && yearlyNum > 0 && (
                    <span className="text-ink-2">
                      {" "}
                      or {euro(yearlyNum)} a year{yearlySaving > 0 ? `, save ${euro(yearlySaving)}` : ""}
                    </span>
                  )}
                </>
              ) : (
                <strong className="font-display text-[20px]">Free to join</strong>
              )}
            </p>
          </div>

          {isInPromoPeriod && (
            <p className="flex gap-2.5 rounded-xl border border-brand-line bg-brand-soft px-4 py-3 text-[13.5px] text-ink-2">
              <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-brand-ink" aria-hidden="true" />
              <span>
                <strong className="block text-ink">No platform fee for your first {LAUNCH_PROMO_DAYS} days</strong>
                {promoDaysLeft === 1 ? "1 day left." : `${promoDaysLeft} days left.`} After that the fee goes from 8% to 6% to 4% as your community grows.
              </span>
            </p>
          )}
        </Card>

        <div className="flex flex-col gap-5">
          <Card as="section" aria-labelledby="pay-h" className="flex flex-col gap-4 p-5">
            <h2 id="pay-h" className="font-display text-[17px] font-semibold text-ink">
              Payouts
            </h2>
            {showInitialStripeLoader ? (
              <div className="flex flex-col gap-2.5">
                <Skeleton className="h-16" />
                <Skeleton className="h-10" />
              </div>
            ) : (
              <>
                {payoutStatus}
                {stripeAccountStatus.isEnabled &&
                  (isLoadingPayouts ? (
                    <Skeleton className="h-24" />
                  ) : payoutData ? (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl bg-surface-2 px-4 py-3">
                          <p className="text-[13px] text-ink-2">Available</p>
                          <p className="font-display text-[22px] font-semibold tabular-nums text-ink">{formatCurrency(payoutData.balance.available, payoutData.balance.currency)}</p>
                        </div>
                        <div className="rounded-xl bg-surface-2 px-4 py-3">
                          <p className="text-[13px] text-ink-2">On the way</p>
                          <p className="font-display text-[22px] font-semibold tabular-nums text-ink">{formatCurrency(payoutData.balance.pending, payoutData.balance.currency)}</p>
                        </div>
                      </div>
                      <div>
                        <p className={FIELD_LABEL}>Recent payouts</p>
                        {payoutData.payouts.length > 0 ? (
                          <ul className="divide-y divide-line rounded-xl border border-line">
                            {payoutData.payouts.map((payout) => (
                              <li key={payout.id} className="flex items-center gap-3 px-3.5 py-2.5 text-[14px]">
                                <span className="min-w-0 flex-1 tabular-nums text-ink-2">
                                  {new Date(payout.arrivalDate).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                                  {payout.bankAccount?.last4 ? `, to ${payout.bankAccount.last4}` : ""}
                                </span>
                                <span className="font-semibold tabular-nums text-ink">{formatCurrency(payout.amount, payout.currency)}</span>
                                <Pill variant={payout.status === "paid" ? "ok" : payout.status === "pending" || payout.status === "in_transit" ? "warn" : "muted"}>
                                  {payout.status === "paid" ? "Paid" : payout.status === "in_transit" ? "On the way" : payout.status === "pending" ? "Pending" : payout.status === "failed" ? "Failed" : payout.status}
                                </Pill>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="rounded-xl bg-surface-2 px-4 py-3 text-[14px] text-ink-2">No payouts yet. They start once members pay.</p>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="rounded-xl bg-surface-2 px-4 py-3 text-[14px] text-ink-2">No payout information yet.</p>
                  ))}
              </>
            )}
          </Card>

          {stripeAccountStatus.isEnabled && (
            <PayoutScheduleForm
              communitySlug={communitySlug}
              initialInterval={((stripeAccountStatus.details?.payoutSchedule as { interval?: string } | undefined)?.interval) ?? "daily"}
              initialWeeklyAnchor={((stripeAccountStatus.details?.payoutSchedule as { weekly_anchor?: string | null } | undefined)?.weekly_anchor) ?? null}
              initialMonthlyAnchor={((stripeAccountStatus.details?.payoutSchedule as { monthly_anchor?: number | null } | undefined)?.monthly_anchor) ?? null}
            />
          )}

          {stripeAccountStatus.isEnabled && (
            <Card as="section" aria-labelledby="bank-h" className="flex flex-col gap-3.5 p-5">
              <h2 id="bank-h" className="font-display text-[17px] font-semibold text-ink">
                Bank account
              </h2>
              {isLoadingBank ? (
                <Skeleton className="h-14" />
              ) : bankAccount ? (
                <>
                  <p className="rounded-xl bg-surface-2 px-4 py-3 text-[14.5px] text-ink">
                    {bankAccount.bank_name || "Your bank"}, account ending in {bankAccount.last4 || "unknown"}
                  </p>
                  {showIbanUpdateForm ? (
                    <div className="flex flex-col gap-3 rounded-xl border border-brand-line bg-brand-soft p-4">
                      <div>
                        <label htmlFor="iban" className={FIELD_LABEL}>
                          New IBAN
                        </label>
                        <input id="iban" placeholder="EE38 2200 2210 2014 5685" value={newIban} onChange={(e) => setNewIban(e.target.value.toUpperCase())} className={FIELD_INPUT} />
                      </div>
                      <div>
                        <label htmlFor="iban-name" className={FIELD_LABEL}>
                          Account holder name
                        </label>
                        <input
                          id="iban-name"
                          placeholder="Your full name as it appears on the account"
                          value={newAccountHolderName}
                          onChange={(e) => setNewAccountHolderName(e.target.value)}
                          className={FIELD_INPUT}
                        />
                      </div>
                      <p className="text-[12.5px] text-ink-3">This replaces your current bank account.</p>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={handleSubmitIbanUpdate} disabled={isUpdatingIban || !newIban || !newAccountHolderName} className={BTN_PRIMARY}>
                          {isUpdatingIban && <Loader2 className="animate-spin" aria-hidden="true" />}
                          Replace bank account
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowIbanUpdateForm(false);
                            setNewIban("");
                            setNewAccountHolderName("");
                          }}
                          className={BTN_GHOST}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setShowIbanUpdateForm(true)} className={cn(BTN_SECONDARY, "self-start")}>
                      Change bank account
                    </button>
                  )}
                </>
              ) : (
                <>
                  <p className="rounded-xl bg-surface-2 px-4 py-3 text-[14px] text-ink-2">No bank account found yet.</p>
                  <button type="button" onClick={handleUpdateIban} disabled={isUpdatingIban} className={cn(BTN_PRIMARY, "self-start")}>
                    {isUpdatingIban && <Loader2 className="animate-spin" aria-hidden="true" />}
                    Add a bank account
                  </button>
                </>
              )}
            </Card>
          )}
        </div>
      </div>
      <SaveBar show={priceDirty} saving={savingPrice} onSave={savePrice} onDiscard={discardPrice} saveLabel="Save prices" />
    </Screen>
  );
}
