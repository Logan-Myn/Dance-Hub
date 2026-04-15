import { sql, queryOne } from "@/lib/db";

/**
 * Email Preferences Check
 *
 * Handles checking user email preferences and generating unsubscribe URLs
 *
 * Migrated from Supabase to Neon database
 */

export type EmailCategory =
  | 'transactional'
  | 'marketing'
  | 'course_announcements'
  | 'lesson_reminders'
  | 'community_updates'
  | 'weekly_digest'
  | 'teacher_broadcast';

interface EmailPreferences {
  email: string;
  unsubscribe_token: string | null;
  unsubscribed_all: boolean;
  marketing_emails: boolean | null;
  course_announcements: boolean | null;
  lesson_reminders: boolean | null;
  community_updates: boolean | null;
  weekly_digest: boolean | null;
  teacher_broadcast: boolean | null;
}

interface ProfileId {
  id: string;
}

/**
 * Check if a user has opted in to receive a specific category of emails
 */
export async function canSendEmail(
  userEmail: string,
  category: EmailCategory
): Promise<boolean> {
  try {
    // Transactional emails are always allowed
    if (category === 'transactional') {
      return true;
    }

    // Get email preferences
    const preferences = await queryOne<EmailPreferences>`
      SELECT
        email,
        unsubscribe_token,
        unsubscribed_all,
        marketing_emails,
        course_announcements,
        lesson_reminders,
        community_updates,
        weekly_digest,
        teacher_broadcast
      FROM email_preferences
      WHERE email = ${userEmail}
    `;

    if (!preferences) {
      // If no preferences exist, default to allowing emails
      // (preferences will be created on first login)
      console.warn(`No email preferences found for ${userEmail}, defaulting to allow`);
      return true;
    }

    // Check if user has unsubscribed from all
    if (preferences.unsubscribed_all) {
      return false;
    }

    // Check specific category preference
    switch (category) {
      case 'marketing':
        return preferences.marketing_emails ?? true;
      case 'course_announcements':
        return preferences.course_announcements ?? true;
      case 'lesson_reminders':
        return preferences.lesson_reminders ?? true;
      case 'community_updates':
        return preferences.community_updates ?? true;
      case 'weekly_digest':
        return preferences.weekly_digest ?? false;
      case 'teacher_broadcast':
        return preferences.teacher_broadcast ?? true;
      default:
        return true;
    }
  } catch (error) {
    console.error('Error checking email preferences:', error);
    // Default to sending if there's an error
    return true;
  }
}

/**
 * Get unsubscribe URL for a user
 */
export async function getUnsubscribeUrl(
  userEmail: string,
  emailType?: EmailCategory
): Promise<string> {
  try {
    const preferences = await queryOne<{ unsubscribe_token: string | null }>`
      SELECT unsubscribe_token
      FROM email_preferences
      WHERE email = ${userEmail}
    `;

    if (preferences?.unsubscribe_token) {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://dance-hub.io';
      const url = new URL('/api/email/unsubscribe', baseUrl);
      url.searchParams.set('token', preferences.unsubscribe_token);
      if (emailType && emailType !== 'transactional') {
        url.searchParams.set('type', emailType);
      }
      return url.toString();
    }
  } catch (error) {
    console.error('Error getting unsubscribe URL:', error);
  }

  // Fallback URL
  return `${process.env.NEXT_PUBLIC_SITE_URL || 'https://dance-hub.io'}/settings/email-preferences`;
}

/**
 * Get preferences URL for a user
 */
export async function getPreferencesUrl(userEmail: string): Promise<string> {
  try {
    const preferences = await queryOne<{ unsubscribe_token: string | null }>`
      SELECT unsubscribe_token
      FROM email_preferences
      WHERE email = ${userEmail}
    `;

    if (preferences?.unsubscribe_token) {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://dance-hub.io';
      return `${baseUrl}/settings/email-preferences?token=${preferences.unsubscribe_token}`;
    }
  } catch (error) {
    console.error('Error getting preferences URL:', error);
  }

  // Fallback URL
  return `${process.env.NEXT_PUBLIC_SITE_URL || 'https://dance-hub.io'}/settings/email-preferences`;
}

/**
 * Log email event for tracking
 */
export async function logEmailEvent(
  userEmail: string,
  eventType: 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'failed',
  emailType: EmailCategory,
  metadata?: unknown
): Promise<void> {
  try {
    // Get user ID from email
    const userData = await queryOne<ProfileId>`
      SELECT id
      FROM profiles
      WHERE email = ${userEmail}
    `;

    await sql`
      INSERT INTO email_events (user_id, email, event_type, email_type, metadata)
      VALUES (
        ${userData?.id || null},
        ${userEmail},
        ${eventType},
        ${emailType},
        ${metadata ? JSON.stringify(metadata) : null}
      )
    `;
  } catch (error) {
    console.error('Error logging email event:', error);
  }
}
