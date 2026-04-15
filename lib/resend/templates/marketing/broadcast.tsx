import React from 'react';
import { Section, Text } from '@react-email/components';
import { BaseLayout } from '../base-layout';

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

export const BroadcastEmail: React.FC<BroadcastEmailProps> = ({
  communityName,
  subject,
  bodyHtml,
  previewText,
  unsubscribePlaceholder,
}) => (
  <BaseLayout
    preview={previewText ?? subject}
    footer={{
      showUnsubscribe: true,
      unsubscribeUrl: unsubscribePlaceholder,
      preferencesUrl: unsubscribePlaceholder,
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
