import React from 'react';
import { Button, Heading, Text } from '@react-email/components';
import { BaseLayout } from '../base-layout';
import { EMAIL_STYLES } from '../index';

interface SignupVerificationEmailProps {
  name: string;
  email: string;
  verificationUrl: string;
}

export const SignupVerificationEmail: React.FC<SignupVerificationEmailProps> = ({
  name,
  email,
  verificationUrl,
}) => {
  const preview = `Verify your DanceHub account`;

  return (
    <BaseLayout preview={preview}>
      <Heading style={EMAIL_STYLES.heading}>
        Welcome to DanceHub, {name}!
      </Heading>
      
      <Text style={EMAIL_STYLES.paragraph}>
        Thanks for signing up! We're excited to have you join our dance community.
      </Text>
      
      <Text style={EMAIL_STYLES.paragraph}>
        Please verify your email address ({email}) by clicking the button below:
      </Text>
      
      <div style={{ textAlign: 'center', margin: '32px 0' }}>
        <Button
          href={verificationUrl}
          style={{
            ...EMAIL_STYLES.button,
            display: 'inline-block',
          }}
        >
          Verify Email Address
        </Button>
      </div>
      
      <Text style={{ ...EMAIL_STYLES.paragraph, fontSize: '14px', color: '#6b7280' }}>
        Or copy and paste this link in your browser:
      </Text>
      
      <Text style={{ 
        ...EMAIL_STYLES.paragraph, 
        fontSize: '14px', 
        color: '#6b7280',
        wordBreak: 'break-all',
        backgroundColor: '#f3f4f6',
        padding: '12px',
        borderRadius: '4px',
      }}>
        {verificationUrl}
      </Text>
      
      <Text style={{ ...EMAIL_STYLES.paragraph, fontSize: '14px', color: '#6b7280', marginTop: '24px' }}>
        This verification link will expire in 24 hours. If you didn't create an account with DanceHub, 
        you can safely ignore this email.
      </Text>
    </BaseLayout>
  );
};