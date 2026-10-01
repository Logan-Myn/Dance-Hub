"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, CheckCircle, Clock, AlertTriangle, Loader2, Shield, CreditCard, FileText, User } from "lucide-react";
import { toast } from "react-hot-toast";

interface VerificationStepProps {
  data: {
    accountId?: string;
    businessInfo: any;
    personalInfo: any;
    bankAccount?: any;
    documents: any[];
  };
  onPrevious: () => void;
  onFinish: () => void;
  isLoading: boolean;
}

interface AccountStatus {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirements: {
    currentlyDue: Array<string | { code: string; message: string; category: string }>;
    pastDue: Array<string | { code: string; message: string; category: string }>;
    eventuallyDue: Array<string | { code: string; message: string; category: string }>;
    pendingVerification?: Array<string | { code: string; message: string; category: string }>;
  };
  capabilities: Record<string, any>;
}

export function VerificationStep({
  data,
  onPrevious,
  onFinish,
  isLoading,
}: VerificationStepProps) {
  const [accountStatus, setAccountStatus] = useState<AccountStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [verificationComplete, setVerificationComplete] = useState(false);

  const formatRequirement = (req: string | { code: string; message: string; category: string }): string => {
    if (typeof req === 'string') {
      // Handle legacy string format - convert snake_case to readable text
      return req.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    } else {
      // Use the user-friendly message from the API
      return req.message;
    }
  };

  useEffect(() => {
    checkAccountStatus();
  }, []);

  const checkAccountStatus = async () => {
    if (!data.accountId) {
      toast.error("Account ID is missing");
      return;
    }

    try {
      setChecking(true);
      const response = await fetch(`/api/stripe/custom-account/${data.accountId}/status`);
      
      if (!response.ok) {
        throw new Error("Failed to check account status");
      }

      const statusData = await response.json();
      setAccountStatus(statusData);
      
      // Check if verification is complete
      const isComplete = statusData.chargesEnabled && 
                        statusData.payoutsEnabled && 
                        statusData.requirements.currentlyDue.length === 0 &&
                        statusData.requirements.pastDue.length === 0;
      
      setVerificationComplete(isComplete);
    } catch (error) {
      console.error("Error checking account status:", error);
      toast.error("Failed to check verification status");
    } finally {
      setChecking(false);
    }
  };

  const getVerificationStatus = () => {
    if (checking) return "checking";
    if (verificationComplete) return "complete";
    if (accountStatus?.requirements.currentlyDue.length || accountStatus?.requirements.pastDue.length) {
      return "incomplete";
    }
    if (accountStatus?.requirements.pendingVerification?.length) {
      return "pending";
    }
    return "complete";
  };

  const renderStatusIcon = (status: string) => {
    switch (status) {
      case "checking":
        return <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />;
      case "complete":
        return <CheckCircle className="h-8 w-8 text-green-500" />;
      case "pending":
        return <Clock className="h-8 w-8 text-yellow-500" />;
      case "incomplete":
        return <AlertTriangle className="h-8 w-8 text-red-500" />;
      default:
        return <Clock className="h-8 w-8 text-gray-400" />;
    }
  };

  const renderStatusMessage = (status: string) => {
    switch (status) {
      case "checking":
        return {
          title: "Checking Verification Status",
          description: "Please wait while we verify your information with Stripe...",
        };
      case "complete":
        return {
          title: "Verification Complete!",
          description: "Your account has been successfully verified and is ready to accept payments.",
        };
      case "pending":
        return {
          title: "Verification in Progress",
          description: "Your information is being reviewed. This typically takes 1-2 business days.",
        };
      case "incomplete":
        return {
          title: "Additional Information Required",
          description: "Please provide the missing information to complete verification.",
        };
      default:
        return {
          title: "Status Unknown",
          description: "Unable to determine verification status.",
        };
    }
  };

  const status = getVerificationStatus();
  const statusMessage = renderStatusMessage(status);

  const completedSteps = [
    {
      icon: <User className="h-5 w-5" />,
      title: "Personal Information",
      description: "Identity and contact details verified",
      completed: true,
    },
    {
      icon: <FileText className="h-5 w-5" />,
      title: "Business Information",
      description: "Business details and address confirmed",
      completed: true,
    },
    {
      icon: <CreditCard className="h-5 w-5" />,
      title: "Bank Account",
      description: "Payment destination configured",
      completed: true,
    },
    {
      icon: <Shield className="h-5 w-5" />,
      title: "Document Verification",
      description: "Identity documents uploaded and verified",
      completed: data.documents.length > 0,
    },
  ];

  const canFinish = status === "complete" || status === "pending";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">Verification & Review</h2>
        <p className="text-gray-600">
          Review your information and complete the verification process.
        </p>
      </div>

      {/* Verification Status */}
      <Card className="text-center">
        <CardContent className="pt-8 pb-8">
          <div className="flex flex-col items-center space-y-4">
            {renderStatusIcon(status)}
            <div>
              <h3 className="text-xl font-semibold text-gray-900">{statusMessage.title}</h3>
              <p className="text-gray-600 mt-1">{statusMessage.description}</p>
            </div>
            
            {status === "checking" && (
              <Button 
                variant="outline" 
                onClick={checkAccountStatus}
                disabled={checking}
                className="mt-4"
              >
                Refresh Status
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Requirements (if any) */}
      {accountStatus?.requirements && (
        <>
          {accountStatus.requirements.currentlyDue.length > 0 && (
            <Card className="border-red-200 bg-red-50">
              <CardHeader>
                <CardTitle className="text-red-800">Required Information</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc list-inside space-y-1 text-red-700">
                  {accountStatus.requirements.currentlyDue.map((req, index) => (
                    <li key={index}>
                      {formatRequirement(req)}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {accountStatus.requirements.pendingVerification && accountStatus.requirements.pendingVerification.length > 0 && (
            <Card className="border-yellow-200 bg-yellow-50">
              <CardHeader>
                <CardTitle className="text-yellow-800">Pending Verification</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc list-inside space-y-1 text-yellow-700">
                  {accountStatus.requirements.pendingVerification.map((req, index) => (
                    <li key={index}>
                      {formatRequirement(req)}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Completed Steps Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Setup Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {completedSteps.map((step, index) => (
              <div key={index} className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${step.completed ? 'bg-green-100' : 'bg-gray-100'}`}>
                  <div className={step.completed ? 'text-green-600' : 'text-gray-400'}>
                    {step.icon}
                  </div>
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{step.title}</p>
                  <p className="text-sm text-gray-600">{step.description}</p>
                </div>
                {step.completed && (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Next Steps */}
      {status === "complete" && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <CheckCircle className="h-6 w-6 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-green-900 mb-2">Congratulations!</h4>
                <p className="text-sm text-green-800 mb-3">
                  Your Stripe account is fully set up and ready to accept payments. You can now:
                </p>
                <ul className="list-disc list-inside space-y-1 text-sm text-green-700">
                  <li>Accept subscription payments from community members</li>
                  <li>Receive automatic payouts to your bank account</li>
                  <li>View payment analytics in your community dashboard</li>
                  <li>Manage your Stripe settings anytime</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {status === "pending" && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Clock className="h-6 w-6 text-yellow-600 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-yellow-900 mb-2">Verification in Progress</h4>
                <p className="text-sm text-yellow-800 mb-3">
                  Your account setup is complete, but verification is still in progress. You can:
                </p>
                <ul className="list-disc list-inside space-y-1 text-sm text-yellow-700">
                  <li>Start accepting payments once verification is complete</li>
                  <li>Check back in 1-2 business days for updates</li>
                  <li>Contact support if you need assistance</li>
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
          onClick={onFinish} 
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