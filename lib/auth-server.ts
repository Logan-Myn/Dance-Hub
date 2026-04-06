import { betterAuth } from "better-auth";
import { Pool } from "pg";
import { Resend } from "resend";
import React from "react";
import { render } from "@react-email/components";
import { SignupVerificationEmail } from "@/lib/resend/templates/auth/signup-verification";
import { PasswordResetEmail } from "@/lib/resend/templates/auth/password-reset";
import { WelcomeEmail } from "@/lib/resend/templates/auth/welcome";

// Initialize Resend for sending emails
const resend = new Resend(process.env.RESEND_API_KEY);
const emailFrom = process.env.EMAIL_FROM_ADDRESS || "DanceHub <account@dance-hub.io>";

// Get the base URL for Better Auth (supports Vercel preview deployments)
function getBaseURL(): string {
  if (process.env.BETTER_AUTH_URL) {
    return process.env.BETTER_AUTH_URL;
  }
  // Vercel preview deployments
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}

// Helper function to send emails without blocking
async function sendEmail(
  to: string,
  subject: string,
  reactElement: React.ReactElement
) {
  console.log(`[Email] Attempting to send email to ${to}: ${subject}`);
  console.log(`[Email] Using from address: ${emailFrom}`);
  console.log(`[Email] RESEND_API_KEY exists: ${!!process.env.RESEND_API_KEY}`);

  try {
    const html = await render(reactElement);
    console.log(`[Email] HTML rendered successfully, length: ${html.length}`);

    const result = await resend.emails.send({
      from: emailFrom,
      to,
      subject,
      html,
    });

    // Check if Resend returned an error in the response
    if ('error' in result && result.error) {
      console.error(`[Email] Resend API error:`, JSON.stringify(result.error));
      console.error(`[Email] Error name: ${result.error.name}`);
      console.error(`[Email] Error message: ${result.error.message}`);
      return;
    }

    console.log(`[Email] Resend API response:`, JSON.stringify(result));
    console.log(`[Email] Email sent successfully to ${to}: ${subject}`);
  } catch (error) {
    console.error(`[Email] Failed to send email to ${to}:`, error);
    if (error instanceof Error) {
      console.error(`[Email] Error name: ${error.name}`);
      console.error(`[Email] Error message: ${error.message}`);
      console.error(`[Email] Error stack: ${error.stack}`);
    }
    console.error(`[Email] Error details:`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
  }
}

const baseURL = getBaseURL();

// Build trusted origins list for Better Auth
function getTrustedOrigins(): string[] {
  const origins: string[] = [
    baseURL,
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    "http://localhost:3000",
  ];

  // Add Vercel preview URLs (multiple formats)
  if (process.env.VERCEL_URL) {
    origins.push(`https://${process.env.VERCEL_URL}`);
  }

  // Add branch-based Vercel URL if on Vercel
  if (process.env.VERCEL_GIT_REPO_SLUG && process.env.VERCEL_GIT_REPO_OWNER) {
    // Branch deployments have a different URL pattern
    origins.push(`https://${process.env.VERCEL_GIT_REPO_SLUG}-${process.env.VERCEL_GIT_REPO_OWNER}.vercel.app`);
  }

  // Allow all Vercel preview subdomains for this project
  if (process.env.VERCEL) {
    origins.push("https://dancehub-logan-myn-logans-projects-16abd628.vercel.app");
  }

  // Remove duplicates and empty values
  return Array.from(new Set(origins.filter(Boolean)));
}

export const auth = betterAuth({
  database: new Pool({
    connectionString: process.env.DATABASE_URL,
  }),

  baseURL,
  secret: process.env.BETTER_AUTH_SECRET,

  trustedOrigins: getTrustedOrigins(),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    sendResetPassword: async ({ user, url }) => {
      // Don't await - prevents timing attacks
      void sendEmail(
        user.email,
        "Reset your password",
        React.createElement(PasswordResetEmail, {
          name: user.name || "there",
          email: user.email,
          resetUrl: url,
        })
      );
    },
  },

  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      console.log(`[Auth] sendVerificationEmail called for user: ${user.email}`);
      console.log(`[Auth] Verification URL: ${url}`);
      // Actually await the email to catch errors in logs
      await sendEmail(
        user.email,
        "Verify your email address",
        React.createElement(SignupVerificationEmail, {
          name: user.name || "there",
          email: user.email,
          verificationUrl: url,
        })
      );
    },
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
  },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },

  user: {
    additionalFields: {
      displayName: {
        type: "string",
        required: false,
      },
      fullName: {
        type: "string",
        required: false,
      },
      avatarUrl: {
        type: "string",
        required: false,
      },
      isAdmin: {
        type: "boolean",
        defaultValue: false,
        input: false,
      },
      stripeAccountId: {
        type: "string",
        required: false,
        input: false,
      },
    },
    changeEmail: {
      enabled: true,
      sendChangeEmailVerification: async ({ user, newEmail, url }: { user: { name?: string }; newEmail: string; url: string }) => {
        // Send verification to the new email address
        void sendEmail(
          newEmail,
          "Verify your new email address",
          React.createElement(SignupVerificationEmail, {
            name: user.name || "there",
            email: newEmail,
            verificationUrl: url,
          })
        );
      },
    },
  },

  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google", "email-password"],
    },
  },

  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
    cookiePrefix: "dancehub",
  },

  callbacks: {
    onUserCreated: async ({ user }: { user: { id: string; email: string; name?: string } }) => {
      // Send welcome email after user is created and verified
      console.log(`New user created: ${user.email}`);
    },
  },
});

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
