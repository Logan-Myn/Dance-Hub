import { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/app/components/Navbar";
import { Footer } from "@/components/landing/footer";
import { Shield, Mail, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth-session";
import { getProfileForUser } from "@/lib/community-data";

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "Privacy Policy - DanceHub",
  description: "Learn how DanceHub collects, uses, and protects your personal information.",
};

export default async function PrivacyPolicyPage() {
  const lastUpdated = "January 25, 2025";
  const session = await getSession();
  const profile = session ? await getProfileForUser(session.user.id) : null;

  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-neutral-950">
      <Navbar initialUser={session?.user ?? null} initialProfile={profile} />

      <main className="flex-grow">
        {/* Header */}
        <section className="relative overflow-hidden bg-gradient-to-b from-violet-50 via-white to-white dark:from-neutral-900 dark:via-neutral-950 dark:to-neutral-950">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(139,92,246,0.1),transparent_50%)] pointer-events-none" />
          <div className="container mx-auto px-4 py-16 md:py-24">
            <div className="max-w-3xl mx-auto">
              <Button variant="ghost" size="sm" asChild className="mb-6">
                <Link href="/" className="text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Home
                </Link>
              </Button>
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center">
                  <Shield className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h1 className="text-4xl md:text-5xl font-bold text-neutral-900 dark:text-white">
                    Privacy Policy
                  </h1>
                  <p className="text-muted-foreground mt-1">Last updated: {lastUpdated}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Content */}
        <section className="py-12 md:py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto prose prose-neutral dark:prose-invert prose-headings:font-semibold prose-h2:text-2xl prose-h2:mt-12 prose-h2:mb-4 prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3 prose-p:text-neutral-600 dark:prose-p:text-neutral-400 prose-li:text-neutral-600 dark:prose-li:text-neutral-400">

              <p className="lead text-lg text-neutral-700 dark:text-neutral-300">
                At DanceHub, we take your privacy seriously. This Privacy Policy explains how we collect,
                use, disclose, and safeguard your information when you use our platform.
              </p>

              <h2>1. Information We Collect</h2>

              <h3>Information You Provide</h3>
              <p>When you create an account or use our services, we may collect:</p>
              <ul>
                <li><strong>Account Information:</strong> Name, email address, and profile picture</li>
                <li><strong>Payment Information:</strong> Processed securely through Stripe (we do not store your full payment card details)</li>
                <li><strong>Content:</strong> Information you provide when creating communities, courses, or communicating with other users</li>
              </ul>

              <h3>Information from Third-Party Services</h3>
              <p>
                If you sign in using Google, we receive your name, email address, and profile picture
                from your Google account. We use this information solely for authentication and creating
                your DanceHub account.
              </p>

              <h3>Automatically Collected Information</h3>
              <p>We automatically collect certain information when you use DanceHub, including:</p>
              <ul>
                <li>Device information (browser type, operating system)</li>
                <li>Usage data (pages visited, features used)</li>
                <li>IP address and general location</li>
              </ul>

              <h2>2. How We Use Your Information</h2>
              <p>We use the information we collect to:</p>
              <ul>
                <li>Provide, maintain, and improve our services</li>
                <li>Process transactions and send related information</li>
                <li>Send you technical notices, updates, and support messages</li>
                <li>Respond to your comments and questions</li>
                <li>Analyze usage patterns to improve user experience</li>
                <li>Protect against fraudulent or illegal activity</li>
              </ul>

              <h2>3. Information Sharing</h2>
              <p>We do not sell your personal information. We may share your information only in the following circumstances:</p>
              <ul>
                <li><strong>With Your Consent:</strong> When you explicitly agree to sharing</li>
                <li><strong>Service Providers:</strong> With trusted third parties who assist in operating our platform (e.g., Stripe for payments, Daily.co for video)</li>
                <li><strong>Legal Requirements:</strong> When required by law or to protect our rights</li>
                <li><strong>Community Interactions:</strong> Your public profile information may be visible to other community members</li>
              </ul>

              <h2>4. Data Security</h2>
              <p>
                We implement appropriate technical and organizational measures to protect your personal
                information against unauthorized access, alteration, disclosure, or destruction. This includes:
              </p>
              <ul>
                <li>Encryption of data in transit and at rest</li>
                <li>Regular security assessments</li>
                <li>Access controls and authentication requirements</li>
                <li>Secure hosting infrastructure</li>
              </ul>

              <h2>5. Data Retention</h2>
              <p>
                We retain your personal information for as long as your account is active or as needed
                to provide you services. You may request deletion of your account and associated data
                at any time by contacting us.
              </p>

              <h2>6. Your Rights</h2>
              <p>Depending on your location, you may have the right to:</p>
              <ul>
                <li>Access the personal information we hold about you</li>
                <li>Request correction of inaccurate information</li>
                <li>Request deletion of your personal information</li>
                <li>Object to or restrict certain processing</li>
                <li>Data portability</li>
              </ul>

              <h2>7. Cookies and Tracking</h2>
              <p>
                We use cookies and similar technologies to maintain your session, remember your preferences,
                and analyze how our services are used. You can control cookie settings through your browser.
              </p>

              <h2>8. Third-Party Services</h2>
              <p>Our platform integrates with third-party services that have their own privacy policies:</p>
              <ul>
                <li><strong>Stripe:</strong> For payment processing</li>
                <li><strong>Daily.co:</strong> For video conferencing</li>
                <li><strong>Google:</strong> For authentication (optional)</li>
              </ul>

              <h2>9. Children&apos;s Privacy</h2>
              <p>
                DanceHub is not intended for children under 13. We do not knowingly collect personal
                information from children under 13. If we learn we have collected such information,
                we will delete it promptly.
              </p>

              <h2>10. Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy from time to time. We will notify you of any changes
                by posting the new Privacy Policy on this page and updating the &ldquo;Last updated&rdquo; date.
              </p>

              <h2>11. Contact Us</h2>
              <p>
                If you have any questions about this Privacy Policy or our data practices, please contact us:
              </p>
              <div className="not-prose mt-6 p-6 rounded-2xl bg-gradient-to-b from-neutral-50 to-white dark:from-neutral-900 dark:to-neutral-950 border border-neutral-200 dark:border-neutral-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center">
                    <Mail className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-medium text-neutral-900 dark:text-white">Email Us</p>
                    <a
                      href="mailto:support@dance-hub.io"
                      className="text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300"
                    >
                      support@dance-hub.io
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
