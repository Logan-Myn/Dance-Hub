import React from 'react';
import { Section, Text, Link, Hr } from '@react-email/components';
import { BaseLayout } from '../base-layout';
import { EMAIL_COLORS, EMAIL_STYLES } from '..';

interface BroadcastEmailProps {
  communityName: string;
  subject: string;
  bodyHtml: string;
  previewText?: string;
  /**
   * Sender.ts renders this template once with a placeholder token for the
   * unsubscribe link, then string-replaces the token per recipient before
   * sending. Keeps rendering to O(1) instead of O(recipients).
   */
  unsubscribePlaceholder: string;
}

/**
 * Broadcast email template. Uses a *community-first* footer — the community
 * name is the primary identity, with DanceHub as a small "powered by" line.
 * This differs from other transactional emails (auth, bookings), where
 * DanceHub is itself the sender and the full BaseLayout footer is appropriate.
 */
export const BroadcastEmail: React.FC<BroadcastEmailProps> = ({
  communityName,
  subject,
  bodyHtml,
  previewText,
  unsubscribePlaceholder,
}) => (
  <BaseLayout preview={previewText ?? subject} hideLogo>
    <Section>
      <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
    </Section>

    {/* Community-first footer */}
    <Hr
      style={{
        marginTop: '40px',
        marginBottom: '20px',
        border: 'none',
        borderTop: `1px solid ${EMAIL_COLORS.border}`,
      }}
    />
    <Section style={{ textAlign: 'center' as const }}>
      <Text
        style={{
          fontSize: '11px',
          color: EMAIL_COLORS.textLight,
          marginBottom: '8px',
          lineHeight: '1.5',
        }}
      >
        You&apos;re receiving this because you&apos;re a member of{' '}
        <strong style={{ color: EMAIL_COLORS.text }}>{communityName}</strong>.
      </Text>
      <Text
        style={{
          fontSize: '11px',
          color: EMAIL_COLORS.textLight,
          marginBottom: '20px',
        }}
      >
        <Link href={unsubscribePlaceholder} style={{ ...EMAIL_STYLES.link, fontSize: '11px' }}>
          Manage preferences
        </Link>
        {' · '}
        <Link href={unsubscribePlaceholder} style={{ ...EMAIL_STYLES.link, fontSize: '11px' }}>
          Unsubscribe
        </Link>
      </Text>
      <Text
        style={{
          fontSize: '10px',
          color: EMAIL_COLORS.textLight,
          opacity: 0.7,
          marginTop: '12px',
        }}
      >
        Powered by{' '}
        <Link
          href="https://dance-hub.io"
          style={{ color: EMAIL_COLORS.textLight, textDecoration: 'none', fontSize: '10px' }}
        >
          DanceHub
        </Link>
      </Text>
    </Section>
  </BaseLayout>
);
