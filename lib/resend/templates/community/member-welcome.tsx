import React from 'react';
import { Button, Heading, Text, Img } from '@react-email/components';
import { BaseLayout } from '../base-layout';
import { EMAIL_STYLES, EMAIL_COLORS } from '../index';

interface MemberWelcomeEmailProps {
  memberName: string;
  communityName: string;
  communityLogo?: string;
  communityUrl: string;
}

export const MemberWelcomeEmail: React.FC<MemberWelcomeEmailProps> = ({
  memberName,
  communityName,
  communityLogo,
  communityUrl,
}) => {
  const preview = `Welcome to ${communityName}!`;

  return (
    <BaseLayout preview={preview}>
      {communityLogo && (
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <Img
            src={communityLogo}
            alt={communityName}
            width="100"
            height="100"
            style={{
              borderRadius: '50%',
              border: `2px solid ${EMAIL_COLORS.border}`,
            }}
          />
        </div>
      )}

      <Heading style={{ ...EMAIL_STYLES.heading, textAlign: 'center' }}>
        Welcome to {communityName}!
      </Heading>

      <Text style={EMAIL_STYLES.paragraph}>
        Hi {memberName},
      </Text>

      <Text style={EMAIL_STYLES.paragraph}>
        You're in. Jump in whenever you're ready, the rest of us are looking forward to meeting you.
      </Text>

      <div style={{ textAlign: 'center', margin: '32px 0' }}>
        <Button
          href={communityUrl}
          style={{
            ...EMAIL_STYLES.button,
            display: 'inline-block',
          }}
        >
          Enter {communityName}
        </Button>
      </div>

      <Text style={{ ...EMAIL_STYLES.paragraph, fontSize: '14px', fontWeight: '600', marginTop: '24px' }}>
        See you inside,<br />
        {communityName}
      </Text>
    </BaseLayout>
  );
};
