import { Metadata } from "next";
import { FileText } from "lucide-react";
import { LegalPageLayout } from "@/components/landing/legal-page-layout";

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "Terms of Service - DanceHub",
  description: "Read the terms and conditions for using DanceHub, the platform for dance communities.",
};

export default function TermsOfServicePage() {
  return (
    <LegalPageLayout title="Terms of Service" icon={FileText} lastUpdated="January 25, 2025">
      <p className="lead text-lg text-neutral-700 dark:text-neutral-300">
        Welcome to DanceHub. By accessing or using our platform, you agree to be bound by these
        Terms of Service. Please read them carefully.
      </p>

      <h2>1. Acceptance of Terms</h2>
      <p>
        By creating an account or using DanceHub, you agree to these Terms of Service and our
        Privacy Policy. If you do not agree to these terms, please do not use our services.
      </p>

      <h2>2. Description of Service</h2>
      <p>
        DanceHub is a platform that enables dance teachers and choreographers to build online
        communities, create and sell courses, host live classes, and offer private lessons.
        We provide the tools and infrastructure; you provide the content and expertise.
      </p>

      <h2>3. Account Registration</h2>
      <p>To use certain features of DanceHub, you must create an account. You agree to:</p>
      <ul>
        <li>Provide accurate and complete registration information</li>
        <li>Maintain the security of your account credentials</li>
        <li>Promptly update any changes to your information</li>
        <li>Accept responsibility for all activities under your account</li>
        <li>Notify us immediately of any unauthorized use</li>
      </ul>

      <h2>4. User Conduct</h2>
      <p>When using DanceHub, you agree not to:</p>
      <ul>
        <li>Violate any applicable laws or regulations</li>
        <li>Infringe on intellectual property rights of others</li>
        <li>Upload harmful, offensive, or inappropriate content</li>
        <li>Harass, abuse, or harm other users</li>
        <li>Attempt to gain unauthorized access to our systems</li>
        <li>Use the platform for spam or fraudulent purposes</li>
        <li>Interfere with the proper functioning of the service</li>
      </ul>

      <h2>5. Content Ownership</h2>

      <h3>Your Content</h3>
      <p>
        You retain ownership of content you create and upload to DanceHub (courses, videos,
        community posts, etc.). By uploading content, you grant us a limited license to host,
        display, and distribute your content as necessary to provide our services.
      </p>

      <h3>Our Content</h3>
      <p>
        DanceHub and its licensors own all rights to the platform, including its design,
        features, and branding. You may not copy, modify, or distribute our content without
        permission.
      </p>

      <h2>6. Payments and Fees</h2>

      <h3>Platform Fees</h3>
      <p>
        DanceHub charges a percentage-based fee on transactions processed through the platform.
        Current fee structure is displayed on our pricing page and may be updated with notice.
      </p>

      <h3>Payment Processing</h3>
      <p>
        Payments are processed through Stripe. By using our payment features, you also agree
        to Stripe&apos;s terms of service. We are not responsible for payment processing errors
        caused by third-party services.
      </p>

      <h3>Refunds</h3>
      <p>
        Refund policies for courses and lessons are set by individual community owners.
        DanceHub may facilitate refunds but is not responsible for refund disputes between
        users and community owners.
      </p>

      <h2>7. Community Guidelines</h2>
      <p>Community owners on DanceHub are responsible for:</p>
      <ul>
        <li>Moderating their community content and interactions</li>
        <li>Setting appropriate pricing for their offerings</li>
        <li>Delivering promised content and services</li>
        <li>Handling member inquiries and support</li>
        <li>Complying with all applicable laws and regulations</li>
      </ul>

      <h2>8. Termination</h2>
      <p>
        We may suspend or terminate your account if you violate these Terms of Service or
        engage in conduct that we determine is harmful to other users or the platform.
        You may also delete your account at any time through your account settings.
      </p>
      <p>Upon termination:</p>
      <ul>
        <li>Your right to access the service will immediately cease</li>
        <li>We may delete your content after a reasonable period</li>
        <li>Provisions that should survive termination will remain in effect</li>
      </ul>

      <h2>9. Disclaimers</h2>
      <p>
        DanceHub is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties of any kind.
        We do not guarantee that the service will be uninterrupted, secure, or error-free.
      </p>
      <p>
        We are not responsible for the content, quality, or accuracy of courses and lessons
        provided by community owners. Users engage with community content at their own discretion.
      </p>

      <h2>10. Limitation of Liability</h2>
      <p>
        To the maximum extent permitted by law, DanceHub shall not be liable for any indirect,
        incidental, special, consequential, or punitive damages, or any loss of profits or
        revenues, whether incurred directly or indirectly, or any loss of data, use, goodwill,
        or other intangible losses.
      </p>

      <h2>11. Indemnification</h2>
      <p>
        You agree to indemnify and hold harmless DanceHub and its officers, directors, employees,
        and agents from any claims, damages, losses, or expenses arising from your use of the
        service or violation of these Terms.
      </p>

      <h2>12. Changes to Terms</h2>
      <p>
        We may modify these Terms of Service at any time. We will notify users of significant
        changes by email or through the platform. Continued use of DanceHub after changes
        constitutes acceptance of the new terms.
      </p>

      <h2>13. Governing Law</h2>
      <p>
        These Terms of Service shall be governed by and construed in accordance with applicable
        laws, without regard to conflict of law principles.
      </p>

      <h2>14. Contact Us</h2>
      <p>
        If you have any questions about these Terms of Service, please contact us:
      </p>
    </LegalPageLayout>
  );
}
