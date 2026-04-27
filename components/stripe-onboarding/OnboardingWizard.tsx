"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "react-hot-toast";
import { ArrowLeft, ArrowRight, CheckCircle } from "lucide-react";

import ErrorBoundary from "./ErrorBoundary";
import { ProgressIndicator } from "./ProgressIndicator";
import { BusinessInfoStep } from "./steps/BusinessInfoStep";
import { PersonalInfoStep } from "./steps/PersonalInfoStep";
import { BankAccountStep } from "./steps/BankAccountStep";
import { DocumentUploadStep } from "./steps/DocumentUploadStep";
import { VerificationStep } from "./steps/VerificationStep";

interface OnboardingData {
  accountId?: string;
  businessInfo: {
    businessType: "individual" | "company";
    legalBusinessName: string;
    businessAddress: {
      line1: string;
      line2?: string;
      city: string;
      state: string;
      postalCode: string;
      country: string;
    };
    businessPhone: string;
    businessWebsite?: string;
    mccCode: string;
  };
  personalInfo: {
    firstName: string;
    lastName: string;
    dateOfBirth: {
      day: number;
      month: number;
      year: number;
    };
    address: {
      line1: string;
      line2?: string;
      city: string;
      state: string;
      postalCode: string;
      country: string;
    };
    phone: string;
    email: string;
    ssnLast4: string;
  };
  bankAccount: {
    // International fields
    iban?: string;
    // US fields  
    accountNumber?: string;
    routingNumber?: string;
    accountHolderName: string;
    accountType?: "checking" | "savings";
    country: string;
    currency: string;
  };
  documents: Array<{
    type: string;
    purpose: string;
    file: File;
  }>;
}

interface OnboardingWizardProps {
  isOpen: boolean;
  onClose: () => void;
  communityId: string;
  communitySlug: string;
  onComplete: (accountId: string) => void;
}

const STEPS = [
  { id: 1, title: "Business Information", description: "Tell us about your dance community" },
  { id: 2, title: "Personal Information", description: "Your personal details for verification" },
  { id: 3, title: "Bank Account", description: "Where you'll receive payments" },
  { id: 4, title: "Document Upload", description: "Verify your identity" },
  { id: 5, title: "Verification", description: "Final review and verification" },
];

export function OnboardingWizard({ isOpen, onClose, communityId, communitySlug, onComplete }: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [onboardingData, setOnboardingData] = useState<OnboardingData>({
    businessInfo: {
      businessType: "individual",
      legalBusinessName: "",
      businessAddress: {
        line1: "",
        city: "",
        state: "",
        postalCode: "",
        country: "US",
      },
      businessPhone: "",
      mccCode: "8299", // Educational services
    },
    personalInfo: {
      firstName: "",
      lastName: "",
      dateOfBirth: {
        day: 1,
        month: 1,
        year: 1990,
      },
      address: {
        line1: "",
        city: "",
        state: "",
        postalCode: "",
        country: "US",
      },
      phone: "",
      email: "",
      ssnLast4: "",
    },
    bankAccount: {
      accountNumber: "",
      routingNumber: "",
      accountHolderName: "",
      accountType: "checking",
      country: "US",
      currency: "usd",
    },
    documents: [],
  });

  const { user, session } = useAuth();

  // Check for existing Stripe account when wizard opens
  useEffect(() => {
    const checkExistingAccount = async () => {
      console.log("useEffect triggered", {
        isOpen,
        hasSession: !!session,
        communitySlug
      });

      if (isOpen && session) {
        console.log("Checking for existing Stripe account...", { 
          communitySlug, 
          hasSession: !!session, 
          hasUser: !!user 
        });
        
        try {
          const response = await fetch(`/api/community/${communitySlug}`);

          if (response.ok) {
            const data = await response.json();
            console.log("Community data:", data);
            
            if (data.stripe_account_id) {
              console.log("Found existing Stripe account ID:", data.stripe_account_id);
              
              // Validate that the Stripe account still exists
              try {
                const statusResponse = await fetch(`/api/stripe/custom-account/${data.stripe_account_id}/status`);
                if (statusResponse.ok) {
                  console.log("Existing Stripe account is valid");
                  setOnboardingData(prev => ({ 
                    ...prev, 
                    accountId: data.stripe_account_id 
                  }));
                  toast.success("Loaded existing Stripe account");
                } else {
                  console.log("Existing Stripe account is invalid, will create new one");
                  toast("Previous Stripe account was invalid, you can create a new one");
                }
              } catch (statusError) {
                console.log("Failed to validate existing Stripe account:", statusError);
                toast("Previous Stripe account was invalid, you can create a new one");
              }
            } else {
              console.log("No Stripe account found in community data");
            }
          } else {
            console.error("Failed to fetch community data:", response.status);
          }
        } catch (error) {
          console.error("Error checking existing Stripe account:", error);
        }
      } else {
        console.log("Skipping account check:", {
          isOpen,
          hasSession: !!session
        });
      }
    };

    // Add a small delay to ensure session is properly loaded
    const timeoutId = setTimeout(checkExistingAccount, 100);
    
    return () => clearTimeout(timeoutId);
  }, [isOpen, session, communitySlug]);

  useEffect(() => {
    if (isOpen) {
      // Load any existing progress from localStorage
      const savedProgress = localStorage.getItem(`stripe-onboarding-${communityId}`);
      if (savedProgress) {
        try {
          const parsed = JSON.parse(savedProgress);
          setOnboardingData(parsed.data || onboardingData);
          setCurrentStep(parsed.currentStep || 1);
          setCompletedSteps(parsed.completedSteps || []);
        } catch (error) {
          console.error("Failed to load saved progress:", error);
        }
      }
    }
  }, [isOpen, communityId]);

  const saveProgress = useCallback(() => {
    const progressData = {
      data: onboardingData,
      currentStep,
      completedSteps,
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem(`stripe-onboarding-${communityId}`, JSON.stringify(progressData));
  }, [onboardingData, currentStep, completedSteps, communityId]);

  const updateData = useCallback((stepData: Partial<OnboardingData>) => {
    setOnboardingData(prev => ({ ...prev, ...stepData }));
    // Auto-save progress with a debounce
    setTimeout(saveProgress, 100);
  }, [saveProgress]);

  const markStepCompleted = (step: number) => {
    if (!completedSteps.includes(step)) {
      setCompletedSteps(prev => [...prev, step]);
    }
  };

  const canProceedToStep = (step: number): boolean => {
    if (step === 1) return true;
    return completedSteps.includes(step - 1);
  };

  const handleNext = async () => {
    if (currentStep < STEPS.length) {
      markStepCompleted(currentStep);
      setCurrentStep(currentStep + 1);
      saveProgress();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleCreateAccount = async () => {
    console.log("handleCreateAccount called, current accountId:", onboardingData.accountId);

    setIsLoading(true);
    try {
      if (!session) {
        throw new Error("Not authenticated");
      }

      // First check if we already have an account ID loaded
      if (onboardingData.accountId) {
        console.log("Account ID already exists, returning:", onboardingData.accountId);
        return onboardingData.accountId;
      }

      console.log("No account ID found, creating new account...");

      const response = await fetch("/api/stripe/custom-account/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          communityId,
          country: onboardingData.businessInfo.businessAddress.country,
          businessType: onboardingData.businessInfo.businessType,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.log("Account creation failed:", errorData);
        
        // If account already exists, try to get the existing account ID
        if (errorData.error === "Community already has a Stripe account") {
          console.log("Account already exists, fetching existing account...");
          try {
            const communityResponse = await fetch(`/api/community/${communitySlug}`);
            if (communityResponse.ok) {
              const communityData = await communityResponse.json();
              console.log("Fetched community data for existing account:", communityData);
              if (communityData.stripe_account_id) {
                console.log("Found existing account ID:", communityData.stripe_account_id);
                setOnboardingData(prev => ({ 
                  ...prev, 
                  accountId: communityData.stripe_account_id 
                }));
                toast.success("Using existing Stripe account");
                return communityData.stripe_account_id;
              }
            }
          } catch (fetchError) {
            console.warn("Could not fetch existing account:", fetchError);
          }
        }
        
        throw new Error(errorData.error || "Failed to create Stripe account");
      }

      const result = await response.json();
      console.log("New account created:", result);
      setOnboardingData(prev => ({ ...prev, accountId: result.accountId }));
      
      // Immediately notify parent component to update community data
      console.log("Calling onComplete to update community with new account ID:", result.accountId);
      onComplete(result.accountId);
      
      toast.success("Stripe account created successfully!");
      return result.accountId;
    } catch (error) {
      console.error("Error creating Stripe account:", error);
      toast.error(error instanceof Error ? error.message : "Failed to create Stripe account");
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const handleFinish = async () => {
    try {
      setIsLoading(true);
      
      if (!onboardingData.accountId) {
        throw new Error("No account ID available");
      }

      // Verify the account is ready
      const statusResponse = await fetch(`/api/stripe/custom-account/${onboardingData.accountId}/status`);
      const statusData = await statusResponse.json();

      if (statusData.requiresVerification) {
        // Final verification step
        const verifyResponse = await fetch(`/api/stripe/custom-account/${onboardingData.accountId}/verify`, {
          method: "POST",
        });

        if (!verifyResponse.ok) {
          throw new Error("Verification failed");
        }
      }

      // Clear the saved progress
      localStorage.removeItem(`stripe-onboarding-${communityId}`);
      
      toast.success("Stripe onboarding completed successfully!");
      onComplete(onboardingData.accountId);
      onClose();
    } catch (error) {
      console.error("Error completing onboarding:", error);
      toast.error("Failed to complete onboarding");
    } finally {
      setIsLoading(false);
    }
  };

  const renderCurrentStep = () => {
    const stepProps = {
      data: onboardingData,
      updateData,
      onNext: handleNext,
      onPrevious: handlePrevious,
      isLoading,
      accountId: onboardingData.accountId,
      onCreateAccount: handleCreateAccount,
      communitySlug,
    };

    switch (currentStep) {
      case 1:
        return <BusinessInfoStep {...stepProps} />;
      case 2:
        return <PersonalInfoStep {...stepProps} />;
      case 3:
        return <BankAccountStep {...stepProps} />;
      case 4:
        return <DocumentUploadStep {...stepProps} />;
      case 5:
        return <VerificationStep {...stepProps} onFinish={handleFinish} />;
      default:
        return null;
    }
  };

  const progressPercentage = (completedSteps.length / STEPS.length) * 100;

  return (
    <ErrorBoundary>
      <ResponsiveDialog open={isOpen} onOpenChange={onClose}>
        <ResponsiveDialogContent className="max-w-4xl lg:h-[90vh] lg:w-[95vw] flex flex-col">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>
              <span className="text-xl sm:text-2xl font-bold">Stripe Payment Setup</span>
            </ResponsiveDialogTitle>

            <div className="space-y-2 mt-4">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Step {currentStep} of {STEPS.length}</span>
                <span>{Math.round(progressPercentage)}% Complete</span>
              </div>
              <Progress value={progressPercentage} className="w-full" />
            </div>
          </ResponsiveDialogHeader>

          <div className="flex flex-col lg:flex-row gap-6 lg:flex-1 lg:min-h-0 lg:overflow-hidden">
            {/* Progress Sidebar — desktop only. On mobile the top progress bar
                + step counter already convey state, and the vertical step list
                eats half the viewport making the form unreachable. */}
            <div className="hidden lg:block lg:w-64 lg:flex-shrink-0 lg:overflow-y-auto">
              <ProgressIndicator
                steps={STEPS}
                currentStep={currentStep}
                completedSteps={completedSteps}
                onStepClick={(step: number) => {
                  if (canProceedToStep(step)) {
                    setCurrentStep(step);
                  }
                }}
              />
            </div>

            {/* Main Content */}
            <div className="flex-1 min-w-0 lg:overflow-y-auto">
              <Card className="p-4 sm:p-6">
                {renderCurrentStep()}
              </Card>
            </div>
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </ErrorBoundary>
  );
} 