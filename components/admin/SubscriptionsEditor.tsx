"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Loader2, TrendingUp } from "lucide-react";
import { CreditCardIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { OnboardingWizard } from "@/components/stripe-onboarding/OnboardingWizard";

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
}: SubscriptionsEditorProps) {
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
  const [isOnboardingWizardOpen, setIsOnboardingWizardOpen] = useState(false);

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
        toast.error("Failed to fetch payout data");
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
        toast.error("Failed to fetch bank account details");
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
        throw new Error(error.error || "Failed to access Stripe dashboard");
      }

      const { url, requiresOnboarding, accountType, message } =
        await response.json();

      if (requiresOnboarding) {
        toast.success(
          "Completing Stripe setup first, then you can manage your bank account"
        );
      } else if (message) {
        toast.success(message);
      } else if (accountType === "custom") {
        toast.success("Opening Stripe Dashboard to manage your bank account");
      }

      window.location.href = url;
    } catch (error) {
      console.error("Error accessing Stripe dashboard:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to access Stripe dashboard"
      );
    } finally {
      setIsUpdatingIban(false);
    }
  }, [stripeAccountId]);

  // Submits a new IBAN + holder name to replace current bank account
  // (modal lines 564-616).
  const handleSubmitIbanUpdate = useCallback(async () => {
    if (!stripeAccountId || !newIban || !newAccountHolderName) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (!session) {
      toast.error("You must be logged in to update bank account");
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

      toast.success(message || "Bank account updated successfully!");
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
      toast.error("Failed to open verification form");
    }
  }, [stripeAccountId]);

  // Opens the custom onboarding wizard (modal lines 852-854).
  const handleStartCustomOnboarding = useCallback(() => {
    setIsOnboardingWizardOpen(true);
  }, []);

  // Called when the OnboardingWizard signals success (modal lines 856-878).
  // Ported + adapted: the old modal pushed the new account id up to the
  // parent via onCommunityUpdate; here we persist locally and then invoke
  // router.refresh() so the RSC re-reads stripe_account_id from the DB.
  const handleOnboardingComplete = useCallback(
    async (accountId: string) => {
      setStripeAccountId(accountId);
      setIsOnboardingWizardOpen(false);

      try {
        const response = await fetch(
          `/api/stripe/account-status/${accountId}`
        );
        if (response.ok) {
          const data = await response.json();
          setStripeAccountStatus({
            isEnabled: data.chargesEnabled && data.payoutsEnabled,
            needsSetup: !data.detailsSubmitted,
            accountId,
            details: data,
          });
        }
        toast.success("Stripe account setup completed successfully!");
        router.refresh();
      } catch (error) {
        console.error("Error completing onboarding:", error);
        toast.error("Setup completed but failed to update status");
      }
    },
    [router]
  );

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
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error("Server error details:", data);
        throw new Error(data.error || "Failed to update price");
      }

      toast.success("Membership settings updated successfully");
      router.refresh();
    } catch (error) {
      console.error("Error updating price:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to update price"
      );
    }
  }, [communitySlug, price, isMembershipEnabled, router]);

  // --- Render helpers ported from modal ---

  const renderStripeConnectionStatus = () => (
    <div className="space-y-6">
      {/* Custom Onboarding Option - Fluid Movement style */}
      <div className="bg-primary/5 border border-primary/20 rounded-2xl p-8">
        <div className="text-center space-y-5">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <CreditCardIcon className="h-7 w-7 text-primary" />
          </div>
          <div>
            <h4 className="font-display text-xl font-semibold text-foreground">
              Complete Stripe Setup
            </h4>
            <p className="text-sm text-muted-foreground mt-3 max-w-md mx-auto">
              To enable paid memberships, you&apos;ll need to complete Stripe
              onboarding. This secure process requires business information,
              identity verification, and bank details.
            </p>
          </div>
          <Button
            onClick={handleStartCustomOnboarding}
            className="w-full max-w-sm h-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-sm hover:shadow-md transition-all duration-200"
          >
            <CreditCardIcon className="mr-2 h-5 w-5" />
            Start Stripe Setup
          </Button>
        </div>
      </div>
    </div>
  );

  const renderMembershipSettings = () => (
    <div className="space-y-6">
      {/* Stripe Requirements Alert - Fluid Movement style */}
      {stripeAccountId && !stripeAccountStatus.isEnabled && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-5">
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <div className="h-10 w-10 rounded-xl bg-yellow-500/20 flex items-center justify-center">
                <svg
                  className="h-5 w-5 text-yellow-600"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            </div>
            <div className="flex-1">
              <h3 className="font-display text-base font-semibold text-yellow-800 dark:text-yellow-200">
                Complete Stripe Setup Required
              </h3>
              <p className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
                Complete your Stripe account setup to enable subscriptions and
                receive payments.
              </p>
              {stripeAccountStatus.details?.requirements && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {stripeAccountStatus.details.requirements.currentlyDue.length >
                    0 && (
                    <span className="px-3 py-1 text-xs font-medium rounded-full bg-yellow-500/20 text-yellow-800">
                      {
                        stripeAccountStatus.details.requirements.currentlyDue
                          .length
                      }{" "}
                      requirement(s) due
                    </span>
                  )}
                  {stripeAccountStatus.details.requirements.pastDue.length >
                    0 && (
                    <span className="px-3 py-1 text-xs font-medium rounded-full bg-destructive/20 text-destructive">
                      {stripeAccountStatus.details.requirements.pastDue.length}{" "}
                      past due
                    </span>
                  )}
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleCompleteVerification}
                className="mt-4 rounded-lg bg-yellow-500/20 text-yellow-800 border-yellow-500/30 hover:bg-yellow-500/30 transition-all"
              >
                Complete Stripe Setup
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Membership Toggle Card */}
      <div className="bg-card rounded-2xl p-6 border border-border/50 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-display text-lg font-semibold text-foreground">
              Paid Membership
            </h4>
            <p className="text-sm text-muted-foreground mt-1">
              Enable paid membership for your community
            </p>
          </div>
          <Switch
            checked={isMembershipEnabled}
            onCheckedChange={setIsMembershipEnabled}
            disabled={!stripeAccountStatus.isEnabled}
          />
        </div>

        {isMembershipEnabled && (
          <div className="space-y-4 pt-4 border-t border-border/50">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Monthly Membership Price
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <span className="text-muted-foreground font-medium">€</span>
                </div>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value))}
                  className="pl-8 rounded-xl border-border/50"
                  placeholder="0.00"
                />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Set the monthly price for your community membership
              </p>
            </div>

            <Button
              onClick={handlePriceUpdate}
              className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 transition-all"
            >
              Update Membership Price
            </Button>
          </div>
        )}

        {!isMembershipEnabled && (
          <div className="bg-muted/30 p-4 rounded-xl">
            <p className="text-sm text-muted-foreground">
              Your community is currently free to join. Enable paid membership
              to start monetizing your community.
            </p>
          </div>
        )}
      </div>

      {/* Promotional Period Info - Fluid Movement style */}
      <div className="bg-secondary/10 border border-secondary/20 rounded-2xl p-5">
        <div className="flex gap-4">
          <div className="flex-shrink-0">
            <div className="h-10 w-10 rounded-xl bg-secondary/20 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-secondary" />
            </div>
          </div>
          <div className="flex-1">
            <h4 className="font-display text-base font-semibold text-foreground">
              First Month Free Promotion
            </h4>
            <p className="text-sm text-muted-foreground mt-2">
              New communities get 0% platform fees for the first 30 days. After
              that, standard tiered pricing applies (8% → 6% → 4% based on
              member count).
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderPayoutManagement = () => {
    if (!stripeAccountStatus.isEnabled) {
      return null;
    }

    return (
      <div className="space-y-6 pt-6 border-t border-border/50">
        {/* Payout Management Section - Fluid Movement style */}
        <div className="bg-card rounded-2xl p-6 border border-border/50 space-y-6">
          <h3 className="font-display text-lg font-semibold text-foreground">
            Payout Management
          </h3>
          {isLoadingPayouts ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : payoutData ? (
            <div className="space-y-6">
              {/* Current Balance */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-primary/5 rounded-xl p-4 border border-primary/10">
                  <p className="text-sm text-muted-foreground mb-1">
                    Available
                  </p>
                  <p className="font-display text-2xl font-bold text-foreground">
                    {formatCurrency(
                      payoutData.balance.available,
                      payoutData.balance.currency
                    )}
                  </p>
                </div>
                <div className="bg-secondary/10 rounded-xl p-4 border border-secondary/10">
                  <p className="text-sm text-muted-foreground mb-1">Pending</p>
                  <p className="font-display text-2xl font-bold text-foreground">
                    {formatCurrency(
                      payoutData.balance.pending,
                      payoutData.balance.currency
                    )}
                  </p>
                </div>
              </div>

              {/* Recent Payouts */}
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-3">
                  Recent Payouts
                </h4>
                <div className="space-y-3">
                  {payoutData.payouts.length > 0 ? (
                    payoutData.payouts.map((payout) => (
                      <div
                        key={payout.id}
                        className="bg-muted/30 p-4 rounded-xl border border-border/50 hover:border-border transition-colors"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-semibold text-foreground">
                              {formatCurrency(payout.amount, payout.currency)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(
                                payout.arrivalDate
                              ).toLocaleDateString()}
                            </p>
                          </div>
                          <span
                            className={`px-3 py-1 text-xs font-semibold rounded-full ${
                              payout.status === "paid"
                                ? "bg-primary/10 text-primary"
                                : payout.status === "pending"
                                ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {payout.status}
                          </span>
                        </div>
                        {payout.bankAccount && (
                          <p className="text-sm text-muted-foreground mt-2">
                            To: •••• {payout.bankAccount.last4}
                          </p>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-6 bg-muted/20 rounded-xl">
                      No recent payouts
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8 bg-muted/20 rounded-xl">
              No payout information available yet.
            </p>
          )}
        </div>

        {/* Bank Account Details Section - Fluid Movement style */}
        <div className="bg-card rounded-2xl p-6 border border-border/50 space-y-4">
          <h3 className="font-display text-lg font-semibold text-foreground">
            Bank Account Details
          </h3>
          {isLoadingBank ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : bankAccount ? (
            <div className="space-y-4">
              <div className="bg-muted/30 p-4 rounded-xl">
                <p className="text-sm text-foreground">
                  <span className="text-muted-foreground">Bank Name:</span>{" "}
                  {bankAccount.bank_name || "N/A"}
                </p>
                <p className="text-sm text-foreground mt-1">
                  <span className="text-muted-foreground">Account:</span> ••••{" "}
                  {bankAccount.last4 || "N/A"}
                </p>
              </div>

              {/* IBAN Update Form */}
              {showIbanUpdateForm ? (
                <div className="bg-primary/5 border border-primary/20 p-5 rounded-xl space-y-4">
                  <h4 className="font-display font-semibold text-foreground">
                    Update Bank Account
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        IBAN
                      </label>
                      <Input
                        type="text"
                        placeholder="FR76 1234 5678 9012 3456 7890 123"
                        value={newIban}
                        onChange={(e) =>
                          setNewIban(e.target.value.toUpperCase())
                        }
                        className="rounded-xl border-border/50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Account Holder Name
                      </label>
                      <Input
                        type="text"
                        placeholder="Your full name as it appears on the account"
                        value={newAccountHolderName}
                        onChange={(e) =>
                          setNewAccountHolderName(e.target.value)
                        }
                        className="rounded-xl border-border/50"
                      />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button
                        onClick={handleSubmitIbanUpdate}
                        disabled={
                          isUpdatingIban ||
                          !newIban ||
                          !newAccountHolderName
                        }
                        className="flex-1 rounded-xl bg-primary hover:bg-primary/90"
                      >
                        {isUpdatingIban && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Update Bank Account
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowIbanUpdateForm(false);
                          setNewIban("");
                          setNewAccountHolderName("");
                        }}
                        className="rounded-xl border-border/50"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Note: This will replace your current bank account with the
                    new one.
                  </p>
                </div>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => setShowIbanUpdateForm(true)}
                  className="w-full rounded-xl border-border/50 hover:bg-primary/5 hover:border-primary/30 transition-all"
                >
                  Update Bank Account
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground bg-muted/20 p-4 rounded-xl">
                No bank account information found. Please add your bank account
                details via Stripe.
              </p>
              <Button
                onClick={handleUpdateIban}
                disabled={isUpdatingIban}
                className="w-full rounded-xl bg-primary hover:bg-primary/90"
              >
                {isUpdatingIban && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Manage Bank Account
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Optional lightweight loading indicator while the initial Stripe status
  // fetch is in flight — avoids a flash of "Complete Stripe Setup" for
  // communities that already have a connected account.
  const showInitialStripeLoader =
    stripeAccountId && isLoadingStripeStatus && !stripeAccountStatus.details;

  return (
    <div id="settings-subscriptions" className="space-y-6">
      {showInitialStripeLoader ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* Stripe connection status - only show if setup is incomplete
              (matches modal line 1017). */}
          {(!stripeAccountId || !stripeAccountStatus.isEnabled) &&
            renderStripeConnectionStatus()}

          {/* Membership settings */}
          {renderMembershipSettings()}

          {/* Payout management */}
          {renderPayoutManagement()}
        </>
      )}

      {/* Custom Stripe Onboarding Wizard — mounted alongside the form so the
          dialog overlays the entire admin page (matches modal lines 1938-1945). */}
      <OnboardingWizard
        isOpen={isOnboardingWizardOpen}
        onClose={() => setIsOnboardingWizardOpen(false)}
        communityId={communityId}
        communitySlug={communitySlug}
        onComplete={handleOnboardingComplete}
      />
    </div>
  );
}
