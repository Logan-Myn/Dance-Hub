"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft,
  CheckCircle,
  Clock,
  AlertTriangle,
  Loader2,
  Shield,
  CreditCard,
  FileText,
  User,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { PAYOUT_SUPPORT_EMAIL } from "@/lib/payout-bank-formats";
import type { AccountLookup } from "../constants";

interface VerificationStepProps {
  data: {
    accountId?: string;
    businessInfo: any;
    personalInfo: any;
    documents: any[];
  };
  onPrevious: () => void;
  /** Resolves true when onboarding finished, false when the owner should stay here. */
  onFinish: () => Promise<boolean>;
  /** Jump back to a step to fix what's missing. */
  onGoToStep?: (step: number) => void;
  /** How far the wizard got looking up the linked account. */
  accountLookup?: AccountLookup;
  isLoading: boolean;
}

interface Requirement {
  code: string;
  message: string;
  category: string;
}

// Shape returned by /api/stripe/custom-account/[accountId]/status.
interface AccountStatus {
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  requirements: {
    currentlyDue?: Requirement[];
    pastDue?: Requirement[];
    eventuallyDue?: Requirement[];
    pendingVerification?: Requirement[];
    disabledReason?: string | null;
    errors?: Array<{ code: string; reason: string }>;
  };
}

type ViewStatus =
  | "missing"
  | "lookup_failed"
  | "checking"
  | "error"
  | "complete"
  | "action_required"
  | "pending"
  | "rejected";

function deriveStatus(status: AccountStatus): ViewStatus {
  const r = status.requirements ?? {};
  const due = (r.currentlyDue?.length ?? 0) + (r.pastDue?.length ?? 0);
  if (typeof r.disabledReason === "string" && r.disabledReason.startsWith("rejected")) return "rejected";
  // "Complete" needs both: charges alone still leaves payouts blocked. It
  // also needs details_submitted, as /verify does, or finishing would fail
  // with nothing listed to fix.
  if (status.charges_enabled && status.payouts_enabled && status.details_submitted && due === 0) {
    return "complete";
  }
  if (due > 0) return "action_required";
  return "pending";
}

const STEP_FOR_CATEGORY: Record<string, { step: number; title: string }> = {
  business: { step: 1, title: "Business Information" },
  personal: { step: 2, title: "Personal Information" },
  banking: { step: 3, title: "Bank Account" },
  documents: { step: 4, title: "Document Upload" },
};

function stepFor(req: Requirement) {
  if (req.code.includes("verification.document") || req.code.includes("verification.additional_document")) {
    return STEP_FOR_CATEGORY.documents;
  }
  return STEP_FOR_CATEGORY[req.category];
}

// Several codes share a message (dob.day, dob.month, dob.year).
function uniqueByMessage(reqs: Requirement[]): Requirement[] {
  const seen = new Set<string>();
  return reqs.filter((r) => (seen.has(r.message) ? false : (seen.add(r.message), true)));
}

const STATUS_COPY: Record<ViewStatus, { title: string; description: string }> = {
  missing: {
    title: "We couldn't find your payout account",
    description: "Go back to the first step to set it up.",
  },
  lookup_failed: {
    title: "We couldn't load your payout account",
    description: "Please refresh the page to try again.",
  },
  checking: {
    title: "Checking your verification status",
    description: "This takes a few seconds.",
  },
  error: {
    title: "We couldn't check your status",
    description: "Please try again in a moment.",
  },
  complete: {
    title: "Verification complete",
    description: "Your account is verified and ready to accept payments.",
  },
  pending: {
    title: "Verification in progress",
    description:
      "Your details are being reviewed. This usually takes 1-2 business days. You can finish now and check back later.",
  },
  action_required: {
    title: "More information needed",
    description: "Add the details below to finish verification.",
  },
  rejected: {
    title: "We couldn't verify your account",
    description: "Payments can't be enabled for this account.",
  },
};

function SupportLine({ text }: { text: string }) {
  return (
    <p className="text-sm text-gray-700">
      {text} Email <a href={`mailto:${PAYOUT_SUPPORT_EMAIL}`} className="font-medium underline">{PAYOUT_SUPPORT_EMAIL}</a>{" "}
      and we&apos;ll help.
    </p>
  );
}

export function VerificationStep({
  data,
  onPrevious,
  onFinish,
  onGoToStep,
  accountLookup = "done",
  isLoading,
}: VerificationStepProps) {
  const accountId = data.accountId;
  const [refreshCount, setRefreshCount] = useState(0);
  const [result, setResult] = useState<{ key: string; status: AccountStatus | null } | null>(null);

  // Each (account, refresh) pair is one request; we're checking until its
  // result has arrived.
  const requestKey = `${accountId ?? ""}:${refreshCount}`;

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    const key = `${accountId}:${refreshCount}`;
    fetch(`/api/stripe/custom-account/${accountId}/status`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to check account status");
        return (await response.json()) as AccountStatus;
      })
      .then(
        (status) => !cancelled && setResult({ key, status }),
        (error) => {
          console.error("Error checking account status:", error);
          if (!cancelled) setResult({ key, status: null });
        }
      );
    return () => {
      cancelled = true;
    };
  }, [accountId, refreshCount]);

  const refresh = useCallback(() => setRefreshCount((n) => n + 1), []);

  let status: ViewStatus;
  if (!accountId) {
    status = accountLookup === "loading" ? "checking" : accountLookup === "failed" ? "lookup_failed" : "missing";
  } else if (result?.key !== requestKey) status = "checking";
  else if (!result.status) status = "error";
  else status = deriveStatus(result.status);

  const accountStatus = result?.key === requestKey ? result.status : null;
  const stillNeeded = uniqueByMessage([
    ...(accountStatus?.requirements?.pastDue ?? []),
    ...(accountStatus?.requirements?.currentlyDue ?? []),
  ]);
  const beingReviewed = uniqueByMessage(accountStatus?.requirements?.pendingVerification ?? []);
  const verificationErrors = accountStatus?.requirements?.errors ?? [];
  const stepsToFix = Array.from(
    new Map(
      stillNeeded.map(stepFor).filter(Boolean).map((s) => [s!.step, s!])
    ).values()
  ).sort((a, b) => a.step - b.step);

  const canFinish = status === "complete" || status === "pending";

  const handleFinish = async () => {
    const finished = await onFinish();
    if (!finished) refresh();
  };

  const renderStatusIcon = () => {
    switch (status) {
      case "checking":
        return <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />;
      case "complete":
        return <CheckCircle className="h-8 w-8 text-green-500" />;
      case "pending":
        return <Clock className="h-8 w-8 text-yellow-500" />;
      case "rejected":
        return <XCircle className="h-8 w-8 text-red-500" />;
      default:
        return <AlertTriangle className="h-8 w-8 text-red-500" />;
    }
  };

  const copy = STATUS_COPY[status];

  const summary = [
    { icon: <FileText className="h-5 w-5" />, title: "Business Information", description: "Business details and address submitted" },
    { icon: <User className="h-5 w-5" />, title: "Personal Information", description: "Identity and contact details submitted" },
    { icon: <CreditCard className="h-5 w-5" />, title: "Bank Account", description: "Payout bank account added" },
    {
      icon: <Shield className="h-5 w-5" />,
      title: "Document Upload",
      description: data.documents.length > 0 ? "Identity document uploaded" : "No document uploaded in this session",
      completed: data.documents.length > 0,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">Verification & Review</h2>
        <p className="text-gray-600">
          Check your verification status and finish setting up payments.
        </p>
      </div>

      {/* Verification Status */}
      <Card className="text-center">
        <CardContent className="pt-8 pb-8">
          <div className="flex flex-col items-center space-y-4">
            {renderStatusIcon()}
            <div>
              <h3 className="text-xl font-semibold text-gray-900">{copy.title}</h3>
              <p className="text-gray-600 mt-1">{copy.description}</p>
            </div>

            {accountId && (
              <Button
                variant="outline"
                onClick={refresh}
                disabled={status === "checking"}
                className="mt-4 flex items-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh status
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {status === "action_required" && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-800">Still needed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="list-disc list-inside space-y-1 text-red-700">
              {stillNeeded.map((req) => (
                <li key={req.code}>{req.message}</li>
              ))}
            </ul>
            {onGoToStep && stepsToFix.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {stepsToFix.map((s) => (
                  <Button key={s.step} variant="outline" size="sm" onClick={() => onGoToStep(s.step)}>
                    Go to {s.title}
                  </Button>
                ))}
              </div>
            )}
            <SupportLine text="If something here can't be added in these steps," />
          </CardContent>
        </Card>
      )}

      {verificationErrors.length > 0 && status !== "complete" && (
        <section aria-label="Needs fixing">
          <Card className="border-red-200 bg-red-50">
            <CardHeader>
              <CardTitle className="text-red-800">Needs fixing</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc list-inside space-y-1 text-red-700">
                {verificationErrors.map((e) => (
                  <li key={`${e.code}-${e.reason}`}>{e.reason}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      )}

      {beingReviewed.length > 0 && status !== "complete" && (
        <section aria-label="Being reviewed">
          <Card className="border-yellow-200 bg-yellow-50">
            <CardHeader>
              <CardTitle className="text-yellow-800">Being reviewed</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc list-inside space-y-1 text-yellow-700">
                {beingReviewed.map((req) => (
                  <li key={req.code}>{req.message}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      )}

      {status === "rejected" && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <SupportLine text="To find out why or to try again," />
          </CardContent>
        </Card>
      )}

      {/* Submitted steps */}
      <Card>
        <CardHeader>
          <CardTitle>Setup Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {summary.map((step) => {
              const completed = step.completed ?? true;
              return (
                <div key={step.title} className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${completed ? "bg-green-100" : "bg-gray-100"}`}>
                    <div className={completed ? "text-green-600" : "text-gray-400"}>{step.icon}</div>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{step.title}</p>
                    <p className="text-sm text-gray-600">{step.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {status === "complete" && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <CheckCircle className="h-6 w-6 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-green-900 mb-2">Congratulations!</h4>
                <p className="text-sm text-green-800 mb-3">
                  Your payout account is fully set up. You can now:
                </p>
                <ul className="list-disc list-inside space-y-1 text-sm text-green-700">
                  <li>Accept subscription payments from community members</li>
                  <li>Receive automatic payouts to your bank account</li>
                  <li>View payment analytics in your community dashboard</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onPrevious} className="flex items-center gap-2">
          <ArrowLeft className="h-4 w-4" />
          Previous
        </Button>
        <Button
          onClick={handleFinish}
          disabled={!canFinish || isLoading}
          className="flex items-center gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Finalizing...
            </>
          ) : (
            <>
              Complete Setup
              <CheckCircle className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
