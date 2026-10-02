"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, ArrowRight, CreditCard, Building2, AlertCircle, Mail } from "lucide-react";
import { toast } from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { STRIPE_COUNTRIES, type AccountLookup } from "../constants";
import {
  buildPayoutBankAccount,
  formatIbanForDisplay,
  getBankFields,
  getPayoutBankFormat,
  PAYOUT_SUPPORT_EMAIL,
  unsupportedCountryMessage,
} from "@/lib/payout-bank-formats";

interface BankAccountStepProps {
  data: {
    personalInfo: any;
    businessInfo: any;
    accountId?: string;
    /** Country of the payout account. Bank fields follow it. */
    accountCountry?: string;
    /** The payout account's default currency, when known. */
    accountCurrency?: string;
  };
  /** How far the wizard got looking up the linked account. */
  accountLookup?: AccountLookup;
  onNext: () => void;
  onPrevious: () => void;
  isLoading: boolean;
}

export function BankAccountStep({
  data,
  accountLookup = "done",
  onNext,
  onPrevious,
  isLoading,
}: BankAccountStepProps) {
  // Fields come only from the payout account's own country. No guessing
  // from an address while it loads: wrong fields are worse than a wait.
  const accountCountry = data.accountCountry ?? "";
  const format = getPayoutBankFormat(accountCountry);
  const countryName =
    STRIPE_COUNTRIES.find((c) => c.value === format.country)?.label ?? format.country;
  const currency = (data.accountCurrency || (format.kind === "unsupported" ? "" : format.currency)).toLowerCase();

  const defaultHolderName =
    data.businessInfo?.businessType === "company"
      ? data.businessInfo?.legalBusinessName ?? ""
      : [data.personalInfo?.firstName, data.personalInfo?.lastName].filter(Boolean).join(" ");

  // Bank details live only in this component's state. They are not saved in
  // the browser or passed up to the wizard.
  const [accountHolderName, setAccountHolderName] = useState<string>(defaultHolderName);
  const [values, setValues] = useState<Record<string, string>>({});
  const [useIban, setUseIban] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const { session } = useAuth();

  const fields = getBankFields(format, useIban);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!accountHolderName.trim()) {
      newErrors.accountHolderName = "Account holder name is required";
    }
    const built = buildPayoutBankAccount(format.country, values, useIban, { currency });
    if (!built.ok) Object.assign(newErrors, built.errors);
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) {
      toast.error("Please fix the validation errors");
      return;
    }

    if (!data.accountId) {
      toast.error("Account ID is missing. Please go back to the previous step.");
      return;
    }

    setIsSaving(true);

    try {
      if (!session) {
        throw new Error("Not authenticated");
      }

      // The server checks these again against the account's country and
      // picks the currency itself.
      const response = await fetch(`/api/stripe/custom-account/${data.accountId}/update`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          step: "bank_account",
          bankAccount: {
            account_holder_name: accountHolderName.trim(),
            fields: Object.fromEntries(
              fields.map((f) => [f.key, f.key === "iban" ? (values.iban ?? "").replace(/\s/g, "") : values[f.key] ?? ""])
            ),
            use_iban: useIban,
          },
          currentStep: 3,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (errorData.fieldErrors) setErrors(errorData.fieldErrors);
        throw new Error(errorData.error || "Failed to update bank account information");
      }

      const result = await response.json().catch(() => ({}));
      toast.success("Bank account saved");
      if (result.warning) toast(result.warning, { duration: 8000 });
      onNext();
    } catch (error) {
      console.error("Error updating bank account:", error);
      toast.error(error instanceof Error ? error.message : "Failed to save bank account information");
    } finally {
      setIsSaving(false);
    }
  };

  const updateValue = (key: string, raw: string) => {
    setValues((prev) => ({ ...prev, [key]: key === "iban" ? formatIbanForDisplay(raw) : raw }));
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: "" }));
    }
  };

  const toggleIban = () => {
    setUseIban((prev) => !prev);
    setValues({});
    setErrors({});
  };

  if (!data.accountId || !data.accountCountry) {
    let message: string;
    if (accountLookup === "loading") message = "Loading your payout account...";
    else if (data.accountId || accountLookup === "failed") {
      message = "We couldn't load your payout account. Please refresh the page to try again.";
    } else message = "We couldn't find your payout account. Go back to the first step to set it up.";

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold mb-2">Bank Account Information</h2>
          <p className="text-gray-600">{message}</p>
        </div>
        <div className="flex justify-between">
          <Button variant="outline" onClick={onPrevious} className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Previous
          </Button>
        </div>
      </div>
    );
  }

  if (format.kind === "unsupported") {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold mb-2">Bank Account Information</h2>
        </div>

        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Mail className="h-5 w-5 text-amber-700 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-amber-900 space-y-2">
                <p>{unsupportedCountryMessage(countryName || undefined)}</p>
                <a
                  href={`mailto:${PAYOUT_SUPPORT_EMAIL}`}
                  className="font-medium underline"
                >
                  {PAYOUT_SUPPORT_EMAIL}
                </a>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-between">
          <Button variant="outline" onClick={onPrevious} className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Previous
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">Bank Account Information</h2>
        <p className="text-gray-600">
          Add the bank account where you&apos;d like to receive your payments.
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">Important Information</p>
            <ul className="list-disc list-inside space-y-1 text-blue-700">
              {currency === "eur" ? (
                <li>Use a euro bank account in your name. It can be at a bank in another euro country</li>
              ) : (
                <li>Use a bank account in {countryName} in your name</li>
              )}
              <li>Payouts are paid in {currency.toUpperCase()}</li>
              <li>Payments typically arrive in 2-7 business days</li>
              <li>You can update this information later if needed</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Account Holder Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Account Holder
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="accountHolderName">Account Holder Name *</Label>
              <Input
                id="accountHolderName"
                value={accountHolderName}
                onChange={(e) => {
                  setAccountHolderName(e.target.value);
                  if (errors.accountHolderName) setErrors((prev) => ({ ...prev, accountHolderName: "" }));
                }}
                placeholder="Jane Doe"
                className={errors.accountHolderName ? "border-red-500" : ""}
              />
              {errors.accountHolderName && (
                <p className="text-red-500 text-sm mt-1">{errors.accountHolderName}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Must match the name on your bank account exactly
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Bank Account Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Bank Account Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {fields.map((field) => (
              <div key={field.key}>
                <Label htmlFor={field.key}>{field.label} *</Label>
                <Input
                  id={field.key}
                  value={values[field.key] ?? ""}
                  onChange={(e) => updateValue(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  inputMode={field.numeric ? "numeric" : "text"}
                  autoComplete="off"
                  className={errors[field.key] ? "border-red-500" : ""}
                />
                {errors[field.key] && (
                  <p className="text-red-500 text-sm mt-1">{errors[field.key]}</p>
                )}
                {field.hint && <p className="text-xs text-gray-500 mt-1">{field.hint}</p>}
              </div>
            ))}

            {format.kind === "local" && format.ibanAlternative && (
              <Button type="button" variant="link" className="px-0" onClick={toggleIban}>
                {useIban ? "Use sort code and account number instead" : "Use an IBAN instead"}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Security Notice */}
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="h-5 w-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="text-sm text-green-800">
                <p className="font-medium">Your information is secure</p>
                <p className="mt-1">
                  Your bank details are sent over an encrypted connection to our payment
                  provider. Dance-Hub only keeps the last 4 digits.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onPrevious} className="flex items-center gap-2">
          <ArrowLeft className="h-4 w-4" />
          Previous
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={isLoading || isSaving}
          className="flex items-center gap-2"
        >
          {isLoading || isSaving ? "Saving..." : "Continue"}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
