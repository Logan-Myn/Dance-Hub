import React from 'react';
import { Section, Text } from '@react-email/components';
import { BaseLayout } from '../base-layout';

interface BroadcastEmailProps {
  communityName: string;
  subject: string;
  bodyHtml: string;
  previewText?: string;
}

/**
 * Broadcast email template. The bodyHtml placeholders ({{unsubscribeUrl}},
 * {{displayName}}) are replaced per-recipient at send time by sender.ts.
 */
export const BroadcastEmail: React.FC<BroadcastEmailProps> = ({
  communityName,
  subject,
  bodyHtml,
  previewText,
}) => (
  <BaseLayout
    preview={previewText ?? subject}
    footer={{
      showUnsubscribe: true,
      unsubscribeUrl: '{{unsubscribeUrl}}',
      preferencesUrl: '{{unsubscribeUrl}}',
    }}
  >
    <Section>
      <Text style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
        A message from {communityName}
      </Text>
      <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
    </Section>
  </BaseLayout>
);
