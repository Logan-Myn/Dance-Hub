export interface EmailTemplate {
  preview: string;
  subject: string;
}

export interface EmailFooterProps {
  unsubscribeUrl?: string;
  preferencesUrl?: string;
  showUnsubscribe?: boolean;
}

export const EMAIL_COLORS = {
  primary: '#6366f1', // Indigo
  primaryDark: '#4f46e5',
  text: '#374151',
  textLight: '#6b7280',
  border: '#e5e7eb',
  background: '#f9fafb',
  white: '#ffffff',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
} as const;

export const EMAIL_STYLES = {
  container: {
    maxWidth: '600px',
    margin: '0 auto',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  card: {
    backgroundColor: EMAIL_COLORS.white,
    borderRadius: '8px',
    padding: '32px',
    border: `1px solid ${EMAIL_COLORS.border}`,
  },
  heading: {
    fontSize: '24px',
    fontWeight: '600',
    color: EMAIL_COLORS.text,
    marginBottom: '16px',
  },
  paragraph: {
    fontSize: '16px',
    lineHeight: '24px',
    color: EMAIL_COLORS.text,
    marginBottom: '16px',
  },
  button: {
    display: 'inline-block',
    padding: '12px 24px',
    backgroundColor: EMAIL_COLORS.primary,
    color: EMAIL_COLORS.white,
    textDecoration: 'none',
    borderRadius: '6px',
    fontWeight: '500',
    fontSize: '16px',
  },
  footer: {
    marginTop: '32px',
    paddingTop: '24px',
    borderTop: `1px solid ${EMAIL_COLORS.border}`,
    fontSize: '14px',
    color: EMAIL_COLORS.textLight,
    textAlign: 'center' as const,
  },
  link: {
    color: EMAIL_COLORS.primary,
    textDecoration: 'underline',
  },
} as const;