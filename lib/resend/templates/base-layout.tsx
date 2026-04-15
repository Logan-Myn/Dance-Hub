import React from 'react';
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Img,
  Text,
  Link,
  Hr,
  Preview,
} from '@react-email/components';
import { EMAIL_COLORS, EMAIL_STYLES, EmailFooterProps } from './index';

interface BaseLayoutProps {
  preview: string;
  children: React.ReactNode;
  footer?: EmailFooterProps;
  /** When true, omit the DanceHub logo at the top. Used for broadcasts
   *  where the community is the sender and the platform retreats to a
   *  small signature in a custom footer. */
  hideLogo?: boolean;
}

export const BaseLayout: React.FC<BaseLayoutProps> = ({
  preview,
  children,
  footer,
  hideLogo = false,
}) => {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: EMAIL_COLORS.background, margin: 0, padding: '40px 20px' }}>
        <Container style={EMAIL_STYLES.container}>
          <Section style={EMAIL_STYLES.card}>
            {/* Logo */}
            {!hideLogo && (
              <Img
                src="https://dance-hub.io/Logo.png"
                width="150"
                height="50"
                alt="DanceHub"
                style={{ marginBottom: '24px' }}
              />
            )}
            
            {/* Main Content */}
            {children}
            
            {/* Footer */}
            {footer && (
              <>
                <Hr style={{ marginTop: '32px', marginBottom: '24px', border: 'none', borderTop: `1px solid ${EMAIL_COLORS.border}` }} />
                <Section style={EMAIL_STYLES.footer}>
                  <Text style={{ marginBottom: '8px', color: EMAIL_COLORS.textLight }}>
                    DanceHub - Elevate your dance journey
                  </Text>
                  
                  {footer.showUnsubscribe && (
                    <Text style={{ fontSize: '12px', color: EMAIL_COLORS.textLight, marginTop: '8px' }}>
                      {footer.preferencesUrl && (
                        <>
                          <Link href={footer.preferencesUrl} style={EMAIL_STYLES.link}>
                            Update preferences
                          </Link>
                          {' | '}
                        </>
                      )}
                      {footer.unsubscribeUrl && (
                        <Link href={footer.unsubscribeUrl} style={EMAIL_STYLES.link}>
                          Unsubscribe
                        </Link>
                      )}
                    </Text>
                  )}
                  
                  <Text style={{ fontSize: '12px', color: EMAIL_COLORS.textLight, marginTop: '16px' }}>
                    © {new Date().getFullYear()} DanceHub. All rights reserved.
                  </Text>
                  
                  <Text style={{ fontSize: '12px', color: EMAIL_COLORS.textLight, marginTop: '8px' }}>
                    Questions? Contact us at{' '}
                    <Link href="mailto:hello@dance-hub.io" style={EMAIL_STYLES.link}>
                      hello@dance-hub.io
                    </Link>
                  </Text>
                </Section>
              </>
            )}
          </Section>
        </Container>
      </Body>
    </Html>
  );
};