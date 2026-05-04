import React from 'react';
import { Heading, Text, Section, Hr, Link } from '@react-email/components';
import { BaseLayout } from '../base-layout';
import { EMAIL_STYLES, EMAIL_COLORS } from '../index';

interface PaymentReceiptEmailProps {
  recipientName: string;
  receiptNumber: string;
  paymentDate: string;
  paymentMethod: string;
  last4?: string;
  items: Array<{
    description: string;
    quantity: number;
    price: number;
    total: number;
  }>;
  subtotal: number;
  tax?: number;
  total: number;
  currency?: string;
  billingAddress?: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
}

export const PaymentReceiptEmail: React.FC<PaymentReceiptEmailProps> = ({
  recipientName,
  receiptNumber,
  paymentDate,
  paymentMethod,
  last4,
  items,
  subtotal,
  tax = 0,
  total,
  currency = 'USD',
  billingAddress,
}) => {
  const preview = `Receipt #${receiptNumber} from DanceHub`;
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount / 100);
  };
  
  return (
    <BaseLayout preview={preview}>
      <Heading style={EMAIL_STYLES.heading}>
        Payment Receipt
      </Heading>
      
      <Text style={EMAIL_STYLES.paragraph}>
        Hi {recipientName},
      </Text>
      
      <Text style={EMAIL_STYLES.paragraph}>
        Thank you for your payment. This email is your official receipt.
      </Text>
      
      <Section style={{
        backgroundColor: EMAIL_COLORS.background,
        borderRadius: '8px',
        padding: '20px',
        margin: '24px 0',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <Text style={{ fontSize: '14px', color: EMAIL_COLORS.textLight, margin: '4px 0' }}>
              <strong>Receipt Number:</strong> {receiptNumber}
            </Text>
            <Text style={{ fontSize: '14px', color: EMAIL_COLORS.textLight, margin: '4px 0' }}>
              <strong>Payment Date:</strong> {paymentDate}
            </Text>
            <Text style={{ fontSize: '14px', color: EMAIL_COLORS.textLight, margin: '4px 0' }}>
              <strong>Payment Method:</strong> {paymentMethod} {last4 && `ending in ${last4}`}
            </Text>
          </div>
        </div>
        
        <Hr style={{ margin: '16px 0', border: 'none', borderTop: `1px solid ${EMAIL_COLORS.border}` }} />
        
        {/* Items */}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ 
                textAlign: 'left', 
                padding: '8px 0', 
                borderBottom: `1px solid ${EMAIL_COLORS.border}`,
                fontSize: '14px',
                fontWeight: '600',
              }}>
                Description
              </th>
              <th style={{ 
                textAlign: 'center', 
                padding: '8px 0', 
                borderBottom: `1px solid ${EMAIL_COLORS.border}`,
                fontSize: '14px',
                fontWeight: '600',
              }}>
                Qty
              </th>
              <th style={{ 
                textAlign: 'right', 
                padding: '8px 0', 
                borderBottom: `1px solid ${EMAIL_COLORS.border}`,
                fontSize: '14px',
                fontWeight: '600',
              }}>
                Price
              </th>
              <th style={{ 
                textAlign: 'right', 
                padding: '8px 0', 
                borderBottom: `1px solid ${EMAIL_COLORS.border}`,
                fontSize: '14px',
                fontWeight: '600',
              }}>
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={index}>
                <td style={{ 
                  padding: '12px 0', 
                  fontSize: '14px',
                  borderBottom: `1px solid ${EMAIL_COLORS.border}`,
                }}>
                  {item.description}
                </td>
                <td style={{ 
                  padding: '12px 0', 
                  fontSize: '14px',
                  textAlign: 'center',
                  borderBottom: `1px solid ${EMAIL_COLORS.border}`,
                }}>
                  {item.quantity}
                </td>
                <td style={{ 
                  padding: '12px 0', 
                  fontSize: '14px',
                  textAlign: 'right',
                  borderBottom: `1px solid ${EMAIL_COLORS.border}`,
                }}>
                  {formatCurrency(item.price)}
                </td>
                <td style={{ 
                  padding: '12px 0', 
                  fontSize: '14px',
                  textAlign: 'right',
                  borderBottom: `1px solid ${EMAIL_COLORS.border}`,
                }}>
                  {formatCurrency(item.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {/* Totals */}
        <div style={{ marginTop: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <Text style={{ fontSize: '14px' }}>Subtotal</Text>
            <Text style={{ fontSize: '14px' }}>{formatCurrency(subtotal)}</Text>
          </div>
          {tax > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <Text style={{ fontSize: '14px' }}>Tax</Text>
              <Text style={{ fontSize: '14px' }}>{formatCurrency(tax)}</Text>
            </div>
          )}
          <Hr style={{ margin: '8px 0', border: 'none', borderTop: `1px solid ${EMAIL_COLORS.border}` }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
            <Text style={{ fontSize: '16px', fontWeight: '600' }}>Total</Text>
            <Text style={{ fontSize: '16px', fontWeight: '600', color: EMAIL_COLORS.primary }}>
              {formatCurrency(total)}
            </Text>
          </div>
        </div>
      </Section>
      
      {billingAddress && (
        <Section style={{ marginTop: '24px' }}>
          <Text style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
            Billing Address:
          </Text>
          <Text style={{ fontSize: '14px', color: EMAIL_COLORS.textLight, margin: '2px 0' }}>
            {billingAddress.line1}
          </Text>
          {billingAddress.line2 && (
            <Text style={{ fontSize: '14px', color: EMAIL_COLORS.textLight, margin: '2px 0' }}>
              {billingAddress.line2}
            </Text>
          )}
          <Text style={{ fontSize: '14px', color: EMAIL_COLORS.textLight, margin: '2px 0' }}>
            {billingAddress.city}, {billingAddress.state} {billingAddress.postalCode}
          </Text>
          <Text style={{ fontSize: '14px', color: EMAIL_COLORS.textLight, margin: '2px 0' }}>
            {billingAddress.country}
          </Text>
        </Section>
      )}
      
      <Text style={{ ...EMAIL_STYLES.paragraph, fontSize: '14px', color: EMAIL_COLORS.textLight, marginTop: '24px' }}>
        This is an official receipt for your records. If you have any questions about this payment,
        please <Link href="mailto:billing@dance-hub.io" style={EMAIL_STYLES.link}>contact our billing team</Link>.
      </Text>
    </BaseLayout>
  );
};