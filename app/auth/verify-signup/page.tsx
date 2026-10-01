'use client';

import { Suspense } from 'react';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle } from 'lucide-react';
import { safeRedirectPath } from '@/lib/safe-redirect';

function VerifySignupContent() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Verifying your email...');
  const [redirectPath, setRedirectPath] = useState('/');
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  useEffect(() => {
    async function verifyEmail() {
      if (!token) {
        setStatus('error');
        setMessage('Invalid verification link.');
        return;
      }

      try {
        const response = await fetch('/api/auth/verify-signup-token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token }),
        });

        const data = await response.json();
        console.log('Verification response:', data); // Debug log

        if (response.ok) {
          setStatus('success');
          setMessage('Email verified successfully!');
          // Check localStorage for stored redirect URL (from auth modal). Only
          // same-origin paths are followed.
          const storedRedirectUrl = localStorage.getItem('auth_redirect_url');
          const redirectTo =
            safeRedirectPath(storedRedirectUrl) || safeRedirectPath(data.redirectTo) || '/dashboard';
          console.log('Will redirect to:', redirectTo); // Debug log
          setRedirectPath(redirectTo);
          // Clear the stored redirect URL
          if (storedRedirectUrl) {
            localStorage.removeItem('auth_redirect_url');
          }
          // Redirect to the original page after 3 seconds
          setTimeout(() => {
            console.log('Redirecting to:', redirectTo); // Debug log
            router.push(redirectTo);
          }, 3000);
        } else {
          setStatus('error');
          setMessage(data.error || 'Failed to verify email.');
        }
      } catch (error) {
        console.error('Error during verification:', error); // Debug log
        setStatus('error');
        setMessage('An error occurred while verifying your email.');
      }
    }

    verifyEmail();
  }, [token, router]);

  return (
    <div className="container max-w-lg mx-auto mt-20 px-4">
      <Card>
        <CardHeader>
          <CardTitle>Email Verification</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant={status === 'loading' ? 'default' : status === 'success' ? 'default' : 'destructive'}>
            {status === 'loading' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : status === 'success' ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <Loader2 className="h-4 w-4" />
            )}
            <AlertTitle>
              {status === 'loading' ? 'Verifying...' : 
               status === 'success' ? 'Success!' : 'Error'}
            </AlertTitle>
            <AlertDescription>
              {message}
              {status === 'success' && (
                <p className="mt-2 text-sm text-gray-500">
                  You will be redirected back to {redirectPath === '/' ? 'the homepage' : 'where you came from'} in a few seconds...
                </p>
              )}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}

export default function VerifySignup() {
  return (
    <Suspense fallback={
      <div className="container max-w-lg mx-auto mt-20 px-4">
        <Card>
          <CardHeader>
            <CardTitle>Email Verification</CardTitle>
          </CardHeader>
          <CardContent>
            <Alert>
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertTitle>Loading...</AlertTitle>
              <AlertDescription>
                Please wait while we load the verification page...
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    }>
      <VerifySignupContent />
    </Suspense>
  );
} 