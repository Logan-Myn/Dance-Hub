"use client";

import { Suspense } from "react";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { loginPath, safeRedirectPath } from "@/lib/safe-redirect";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

function VerifyEmailContent() {
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading"
  );
  const [message, setMessage] = useState("Verifying your email...");
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  useEffect(() => {
    async function verifyEmail() {
      if (!token) {
        setStatus("error");
        setMessage("Invalid verification link. No token provided.");
        return;
      }

      try {
        // Use Better Auth client to verify email
        const result = await authClient.verifyEmail({
          query: {
            token,
          },
        });

        if (result.error) {
          setStatus("error");
          setMessage(result.error.message || "Failed to verify email.");
          return;
        }

        setStatus("success");
        setMessage("Your email has been verified successfully!");

        // Check localStorage for stored redirect URL (from auth modal). Only
        // same-origin paths are followed.
        const storedRedirectUrl = localStorage.getItem('auth_redirect_url');
        const redirectTo = safeRedirectPath(storedRedirectUrl) || '/dashboard';

        // Clear the stored redirect URL
        if (storedRedirectUrl) {
          localStorage.removeItem('auth_redirect_url');
        }

        // Redirect after 3 seconds
        setTimeout(() => {
          router.push(redirectTo);
        }, 3000);
      } catch (error) {
        console.error("Email verification error:", error);
        setStatus("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "An error occurred while verifying your email."
        );
      }
    }

    verifyEmail();
  }, [token, router]);

  return (
    <div className="container max-w-lg mx-auto mt-20 px-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {status === "loading" && (
              <Loader2 className="h-5 w-5 animate-spin" />
            )}
            {status === "success" && (
              <CheckCircle className="h-5 w-5 text-green-500" />
            )}
            {status === "error" && <XCircle className="h-5 w-5 text-red-500" />}
            Email Verification
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert
            variant={
              status === "loading"
                ? "default"
                : status === "success"
                  ? "default"
                  : "destructive"
            }
          >
            <AlertTitle>
              {status === "loading"
                ? "Verifying..."
                : status === "success"
                  ? "Success!"
                  : "Verification Failed"}
            </AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>

          {status === "success" && (
            <p className="text-sm text-muted-foreground text-center">
              Redirecting to dashboard in 3 seconds...
            </p>
          )}

          {status === "error" && (
            <div className="flex flex-col gap-2">
              <Button onClick={() => router.push(loginPath("/dashboard"))} className="w-full">
                Go to Login
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push("/")}
                className="w-full"
              >
                Go to Home
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function VerifyEmail() {
  return (
    <Suspense
      fallback={
        <div className="container max-w-lg mx-auto mt-20 px-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                Email Verification
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Alert>
                <AlertTitle>Loading...</AlertTitle>
                <AlertDescription>
                  Please wait while we load the verification page...
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
