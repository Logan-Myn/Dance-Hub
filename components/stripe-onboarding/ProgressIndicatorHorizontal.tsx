"use client";

import React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  id: number;
  title: string;
  description: string;
}

interface ProgressIndicatorHorizontalProps {
  steps: Step[];
  currentStep: number;
  completedSteps: number[];
  onStepClick: (step: number) => void;
}

export function ProgressIndicatorHorizontal({
  steps,
  currentStep,
  completedSteps,
  onStepClick,
}: ProgressIndicatorHorizontalProps) {
  const canClickStep = (stepId: number) =>
    stepId === 1 || completedSteps.includes(stepId - 1) || stepId <= currentStep;

  return (
    <ol className="flex w-full items-start gap-2 overflow-x-auto pb-2 sm:gap-0">
      {steps.map((step, index) => {
        const isCompleted = completedSteps.includes(step.id);
        const isCurrent = step.id === currentStep;
        const isClickable = canClickStep(step.id);
        const isLast = index === steps.length - 1;

        return (
          <li
            key={step.id}
            className={cn("flex flex-1 items-start gap-2 sm:gap-0", isLast && "flex-none sm:flex-1")}
          >
            <div className="flex flex-1 flex-col items-center text-center">
              <button
                type="button"
                onClick={() => isClickable && onStepClick(step.id)}
                disabled={!isClickable}
                className={cn(
                  "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all duration-200",
                  isCompleted &&
                    "border-primary bg-primary text-primary-foreground",
                  !isCompleted && isCurrent &&
                    "border-primary bg-primary/10 text-primary",
                  !isCompleted && !isCurrent && isClickable &&
                    "border-border bg-background text-muted-foreground hover:border-primary/40",
                  !isCompleted && !isCurrent && !isClickable &&
                    "border-border bg-muted text-muted-foreground/60 cursor-not-allowed"
                )}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={`Step ${step.id}: ${step.title}`}
              >
                {isCompleted ? <Check className="h-5 w-5" /> : step.id}
              </button>
              <div className="mt-2 hidden sm:block">
                <p
                  className={cn(
                    "text-xs font-medium",
                    isCurrent ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {step.title}
                </p>
              </div>
            </div>
            {!isLast && (
              <div
                className={cn(
                  "mt-4 hidden h-0.5 flex-1 sm:block",
                  isCompleted ? "bg-primary" : "bg-border"
                )}
                aria-hidden
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
