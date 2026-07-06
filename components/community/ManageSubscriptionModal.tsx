"use client";

import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle } from "lucide-react";
import { loadStripe, type Stripe as StripeClient } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { toast } from "react-hot-toast";

type Status = "active" | "past_due" | "canceled" | "incomplete" | string;

interface SubscriptionSummary {
  status: Status;
  currency: string;
  amount: number;
  interval: string;
  currentPeriodEnd: number;
  defaultPaymentMethod: { brand: string; last4: string } | null;
  upgrade: { available: boolean; yearlyAmount: number; yearlyBenefits: string | null } | null;
}

interface Payment {
  id: string;
  paidAt: number;
  amount: number;
  currency: string;
  hostedInvoiceUrl: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  communitySlug: string;
  stripeAccountId: string;
}

const formatMoney = (minor: number, currency: string) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(minor / 100);

const formatDate = (unixSec: number) =>
  new Date(unixSec * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

const intervalLabel = (interval: string) =>
  interval === "month" ? "Monthly" : interval === "year" ? "Yearly" : interval;

const brandLabel = (brand: string) =>
  brand.charAt(0).toUpperCase() + brand.slice(1);

function UpdateCardForm({
  communitySlug,
  onSuccess,
  onCancel,
}: {
  communitySlug: string;
  onSuccess: (result: { retried: boolean; retryError?: string }) => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);

    try {
      const { error, setupIntent } = await stripe.confirmSetup({
        elements,
        redirect: "if_required",
      });
      if (error) throw error;
      if (!setupIntent || setupIntent.status !== "succeeded") {
        throw new Error("Card was not saved. Please try again.");
      }
      const paymentMethodId =
        typeof setupIntent.payment_method === "string"
          ? setupIntent.payment_method
          : setupIntent.payment_method?.id;
      if (!paymentMethodId) throw new Error("Missing payment method.");

      const resp = await fetch(
        `/api/community/${communitySlug}/subscription/payment-method`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentMethodId }),
        }
      );
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error ?? "Failed to update card.");
      }
      onSuccess({ retried: data.retried, retryError: data.retryError });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update card.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 py-2">
      <PaymentElement />
      <div className="flex gap-2 justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={!stripe || submitting}>
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving
            </>
          ) : (
            "Save"
          )}
        </Button>
      </div>
    </form>
  );
}

function UpgradeConfirmForm({
  stripePromise,
  clientSecret,
  onDone,
  onCancel,
}: {
  stripePromise: Promise<StripeClient | null>;
  clientSecret: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [stripe, setStripe] = useState<StripeClient | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    stripePromise.then((s) => {
      if (active) setStripe(s);
    });
    return () => {
      active = false;
    };
  }, [stripePromise]);

  const handleConfirm = async () => {
    if (!stripe) return;
    setSubmitting(true);
    try {
      // The saved default card is already attached to the invoice's PaymentIntent.
      // Just clear the pending "requires_action" (e.g. 3DS) on it, no new card needed.
      const { error, paymentIntent } = await stripe.handleNextAction({ clientSecret });
      if (error) throw error;
      if (paymentIntent?.status === "succeeded") {
        onDone();
      } else {
        throw new Error("The payment was not confirmed. Please try again.");
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Could not confirm the payment.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 py-2">
      <p className="text-sm text-muted-foreground">
        Your bank needs to confirm this payment before we finish switching you to the yearly plan.
      </p>
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="button" onClick={handleConfirm} disabled={!stripe || submitting}>
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Confirming
            </>
          ) : (
            "Confirm with your bank"
          )}
        </Button>
      </div>
    </div>
  );
}

export function ManageSubscriptionModal({
  isOpen,
  onClose,
  communitySlug,
  stripeAccountId,
}: Props) {
  const [summary, setSummary] = useState<SubscriptionSummary | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"details" | "update" | "upgrade">("details");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [stripePromise, setStripePromise] =
    useState<Promise<StripeClient | null> | null>(null);
  const [upgrading, setUpgrading] = useState(false);
  const [upgradePreview, setUpgradePreview] = useState<{ prorationAmount: number; currency: string; yearlyAmount: number } | null>(null);
  const [upgradeSecret, setUpgradeSecret] = useState<string | null>(null);

  const fetchAll = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, p] = await Promise.all([
        fetch(`/api/community/${communitySlug}/subscription`).then((r) =>
          r.ok ? r.json() : Promise.reject(r)
        ),
        fetch(`/api/community/${communitySlug}/subscription/payments`).then(
          (r) => (r.ok ? r.json() : Promise.reject(r))
        ),
      ]);
      setSummary(s);
      setPayments(p.invoices ?? []);
    } catch {
      setError("Could not load subscription details.");
    } finally {
      setLoading(false);
    }
  }, [communitySlug]);

  useEffect(() => {
    if (!isOpen) {
      setView("details");
      setClientSecret(null);
      setUpgradePreview(null);
      setUpgradeSecret(null);
      return;
    }
    fetchAll();
  }, [isOpen, fetchAll]);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!key) return;
    setStripePromise(loadStripe(key, { stripeAccount: stripeAccountId }));
  }, [stripeAccountId]);

  const startUpdate = async () => {
    try {
      const resp = await fetch(
        `/api/community/${communitySlug}/subscription/setup-intent`,
        { method: "POST" }
      );
      const data = await resp.json();
      if (!resp.ok || !data.clientSecret) {
        throw new Error(data.error ?? "Could not start card update.");
      }
      setClientSecret(data.clientSecret);
      setView("update");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not start card update.");
    }
  };

  const handleUpdateSuccess = (result: {
    retried: boolean;
    retryError?: string;
  }) => {
    if (result.retryError) {
      toast.success("Card updated. We'll retry the pending charge automatically.");
    } else if (result.retried) {
      toast.success("Card updated and payment completed.");
    } else {
      toast.success("Card updated.");
    }
    setView("details");
    setClientSecret(null);
    fetchAll();
  };

  const startUpgrade = async () => {
    try {
      const resp = await fetch(`/api/community/${communitySlug}/subscription/upgrade-yearly`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "Could not preview the upgrade.");
      setUpgradePreview(data);
      setView("upgrade");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not preview the upgrade.");
    }
  };

  const confirmUpgrade = async () => {
    setUpgrading(true);
    try {
      const resp = await fetch(`/api/community/${communitySlug}/subscription/upgrade-yearly`, { method: "POST" });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "Could not switch to yearly.");
      if (data.requiresAction && data.clientSecret) {
        setUpgradeSecret(data.clientSecret);   // hand off to the 3DS confirm step
        return;
      }
      toast.success("You're on the yearly plan now.");
      setView("details");
      setUpgradePreview(null);
      fetchAll();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not switch to yearly.");
    } finally {
      setUpgrading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage subscription</DialogTitle>
          <DialogDescription>
            {view === "details"
              ? "View your plan and update the card on file."
              : view === "upgrade"
                ? "Review your switch to the yearly plan."
                : "Enter a new card. The old one will be replaced."}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && error && (
          <p className="text-sm text-destructive py-4">{error}</p>
        )}

        {!loading && summary && view === "details" && (
          <div className="space-y-6 py-2">
            <section>
              <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                Plan
              </h3>
              <p className="text-sm">
                {intervalLabel(summary.interval)} ·{" "}
                {formatMoney(summary.amount, summary.currency)}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Next charge: {formatDate(summary.currentPeriodEnd)}
              </p>

              {summary.status === "past_due" && (
                <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <p>
                    Your last payment did not go through. Update your card to
                    fix it.
                  </p>
                </div>
              )}

              {summary.status !== "active" && summary.status !== "past_due" && (
                <div className="mt-3 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                  This subscription is no longer active.
                </div>
              )}
            </section>

            {summary.interval === "month" && summary.upgrade?.available && (
              <section>
                <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                  Switch to yearly
                </h3>
                <div className="rounded-md border border-primary/40 bg-primary/5 p-3">
                  <p className="text-sm">
                    Pay once a year: {formatMoney(summary.upgrade.yearlyAmount, summary.currency)}/year.
                  </p>
                  {summary.upgrade.yearlyBenefits && (
                    <p className="text-sm text-muted-foreground whitespace-pre-line mt-1">
                      {summary.upgrade.yearlyBenefits}
                    </p>
                  )}
                  <Button
                    size="sm"
                    className="mt-3"
                    onClick={startUpgrade}
                    disabled={summary.status !== "active"}
                  >
                    Switch to yearly
                  </Button>
                </div>
              </section>
            )}

            <section>
              <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                Payment method
              </h3>
              <div className="flex items-center justify-between rounded-md border p-3">
                <p className="text-sm">
                  {summary.defaultPaymentMethod
                    ? `${brandLabel(summary.defaultPaymentMethod.brand)} •••• ${summary.defaultPaymentMethod.last4}`
                    : "No card on file"}
                </p>
                <Button
                  variant={summary.defaultPaymentMethod ? "outline" : "default"}
                  size="sm"
                  onClick={startUpdate}
                  disabled={
                    summary.status !== "active" &&
                    summary.status !== "past_due"
                  }
                >
                  Update
                </Button>
              </div>
            </section>

            <section>
              <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                Recent payments
              </h3>
              {payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No payments yet.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {payments.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <span>
                        {formatDate(p.paidAt)} ·{" "}
                        {formatMoney(p.amount, p.currency)}
                      </span>
                      {p.hostedInvoiceUrl && (
                        <a
                          href={p.hostedInvoiceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline text-xs"
                        >
                          Receipt
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        {view === "update" && clientSecret && stripePromise && (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: { theme: "stripe" as const },
            }}
          >
            <UpdateCardForm
              communitySlug={communitySlug}
              onSuccess={handleUpdateSuccess}
              onCancel={() => {
                setView("details");
                setClientSecret(null);
              }}
            />
          </Elements>
        )}

        {view === "upgrade" && upgradePreview && !upgradeSecret && (
          <div className="space-y-4 py-2">
            <p className="text-sm">
              You'll pay {formatMoney(upgradePreview.prorationAmount, upgradePreview.currency)} now for the
              rest of this period, then {formatMoney(upgradePreview.yearlyAmount, upgradePreview.currency)}/year.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setView("details"); setUpgradePreview(null); }} disabled={upgrading}>
                Cancel
              </Button>
              <Button onClick={confirmUpgrade} disabled={upgrading}>
                {upgrading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Switching</>) : "Confirm switch"}
              </Button>
            </div>
          </div>
        )}

        {view === "upgrade" && upgradeSecret && stripePromise && (
          <UpgradeConfirmForm
            stripePromise={stripePromise}
            clientSecret={upgradeSecret}
            onDone={() => {
              setUpgradeSecret(null);
              setUpgradePreview(null);
              setView("details");
              toast.success("You're on the yearly plan now.");
              fetchAll();
            }}
            onCancel={() => { setUpgradeSecret(null); setUpgradePreview(null); setView("details"); }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
