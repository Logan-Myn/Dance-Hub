import { betterAuth } from "better-auth";
import { Pool } from "pg";
import React from "react";
import { getEmailService } from "@/lib/resend/email-service";
import { SignupVerificationEmail } from "@/lib/resend/templates/auth/signup-verification";
import { PasswordResetEmail } from "@/lib/resend/templates/auth/password-reset";

function getBaseURL(): string {
  if (process.env.BETTER_AUTH_URL) {
    return process.env.BETTER_AUTH_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}

function sendAuthEmail(to: string, subject: string, element: React.ReactElement) {
  void getEmailService()
    .sendAuthEmail(to, subject, element)
    .catch((error) => {
      console.error(`[Auth] Failed to send "${subject}" to ${to}:`, error);
    });
}

const baseURL = getBaseURL();

function getTrustedOrigins(): string[] {
  const origins: string[] = [
    baseURL,
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    "http://localhost:3000",
  ];

  if (process.env.VERCEL_URL) {
    origins.push(`https://${process.env.VERCEL_URL}`);
  }

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
      sendAuthEmail(
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
      sendAuthEmail(
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
        sendAuthEmail(
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
});

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
