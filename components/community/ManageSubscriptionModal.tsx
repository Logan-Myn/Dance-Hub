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

type Status = "active" | "past_due" | "canceled" | "incomplete" | string;

interface SubscriptionSummary {
  status: Status;
  currency: string;
  amount: number;
  interval: string;
  currentPeriodEnd: number;
  defaultPaymentMethod: { brand: string; last4: string } | null;
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

export function ManageSubscriptionModal({
  isOpen,
  onClose,
  communitySlug,
}: Props) {
  const [summary, setSummary] = useState<SubscriptionSummary | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      fetch(`/api/community/${communitySlug}/subscription`).then((r) =>
        r.ok ? r.json() : Promise.reject(r)
      ),
      fetch(`/api/community/${communitySlug}/subscription/payments`).then((r) =>
        r.ok ? r.json() : Promise.reject(r)
      ),
    ])
      .then(([s, p]) => {
        if (cancelled) return;
        setSummary(s);
        setPayments(p.invoices ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Could not load subscription details.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, communitySlug]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage subscription</DialogTitle>
          <DialogDescription>
            View your plan and update the card on file.
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

        {!loading && summary && (
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
            </section>

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
                  disabled
                  title="Card update coming in next task"
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
      </DialogContent>
    </Dialog>
  );
}
