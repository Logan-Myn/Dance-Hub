import React from 'react';
import { Button, Heading, Text, Section, Hr } from '@react-email/components';
import { BaseLayout } from '../base-layout';
import { EMAIL_STYLES, EMAIL_COLORS } from '../index';

interface BookingConfirmationEmailProps {
  studentName: string;
  teacherName: string;
  lessonTitle: string;
  lessonDate: string;
  lessonTime: string;
  duration: number;
  price: number;
  videoRoomUrl?: string;
  bookingId: string;
  paymentMethod: string;
}

export const BookingConfirmationEmail: React.FC<BookingConfirmationEmailProps> = ({
  studentName,
  teacherName,
  lessonTitle,
  lessonDate,
  lessonTime,
  duration,
  price,
  videoRoomUrl,
  bookingId,
  paymentMethod,
}) => {
  const preview = `Booking confirmed for ${lessonTitle} with ${teacherName}`;
  
  return (
    <BaseLayout preview={preview}>
      <Heading style={EMAIL_STYLES.heading}>
        Booking Confirmed! 🎉
      </Heading>
      
      <Text style={EMAIL_STYLES.paragraph}>
        Hi {studentName},
      </Text>
      
      <Text style={EMAIL_STYLES.paragraph}>
        Great news! Your private lesson has been successfully booked. Here are your booking details:
      </Text>
      
      <Section style={{
        backgroundColor: EMAIL_COLORS.background,
        borderRadius: '8px',
        padding: '20px',
        margin: '24px 0',
      }}>
        <Text style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px', color: EMAIL_COLORS.primary }}>
          {lessonTitle}
        </Text>
        
        <div style={{ marginBottom: '12px' }}>
          <Text style={{ fontSize: '14px', color: EMAIL_COLORS.textLight, margin: '4px 0' }}>
            <strong>Teacher:</strong> {teacherName}
          </Text>
          <Text style={{ fontSize: '14px', color: EMAIL_COLORS.textLight, margin: '4px 0' }}>
            <strong>Date:</strong> {lessonDate}
          </Text>
          <Text style={{ fontSize: '14px', color: EMAIL_COLORS.textLight, margin: '4px 0' }}>
            <strong>Time:</strong> {lessonTime}
          </Text>
          <Text style={{ fontSize: '14px', color: EMAIL_COLORS.textLight, margin: '4px 0' }}>
            <strong>Duration:</strong> {duration} minutes
          </Text>
        </div>
        
        <Hr style={{ margin: '16px 0', border: 'none', borderTop: `1px solid ${EMAIL_COLORS.border}` }} />
        
        <div>
          <Text style={{ fontSize: '14px', color: EMAIL_COLORS.textLight, margin: '4px 0' }}>
            <strong>Booking ID:</strong> {bookingId}
          </Text>
          <Text style={{ fontSize: '14px', color: EMAIL_COLORS.textLight, margin: '4px 0' }}>
            <strong>Amount Paid:</strong> €{price.toFixed(2)}
          </Text>
          <Text style={{ fontSize: '14px', color: EMAIL_COLORS.textLight, margin: '4px 0' }}>
            <strong>Payment Method:</strong> {paymentMethod}
          </Text>
        </div>
      </Section>
      
      <Text style={EMAIL_STYLES.paragraph}>
        <strong>How to join your lesson:</strong>
      </Text>
      
      <Text style={EMAIL_STYLES.paragraph}>
        When it's time for your lesson, you can join the video session directly from your dashboard or by clicking the button below:
      </Text>
      
      {videoRoomUrl && (
        <div style={{ textAlign: 'center', margin: '32px 0' }}>
          <Button
            href={videoRoomUrl}
            style={{
              ...EMAIL_STYLES.button,
              display: 'inline-block',
            }}
          >
            Join Video Session
          </Button>
        </div>
      )}
      
      <Section style={{
        backgroundColor: '#fef3c7',
        borderLeft: `4px solid ${EMAIL_COLORS.warning}`,
        padding: '16px',
        margin: '24px 0',
      }}>
        <Text style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
          Important Reminders:
        </Text>
        <Text style={{ fontSize: '14px', margin: '4px 0' }}>
          • Test your camera and microphone before the lesson
        </Text>
        <Text style={{ fontSize: '14px', margin: '4px 0' }}>
          • Find a space with good lighting and enough room to move
        </Text>
        <Text style={{ fontSize: '14px', margin: '4px 0' }}>
          • Join the session 2-3 minutes early to ensure everything works
        </Text>
        <Text style={{ fontSize: '14px', margin: '4px 0' }}>
          • We'll send you a reminder 15 minutes before your lesson starts
        </Text>
      </Section>
      
      <Text style={{ ...EMAIL_STYLES.paragraph, fontSize: '14px', color: EMAIL_COLORS.textLight }}>
        Need to reschedule or cancel? Please contact your teacher at least 24 hours in advance through your dashboard.
      </Text>
      
      <Text style={{ ...EMAIL_STYLES.paragraph, fontSize: '14px', fontWeight: '600', marginTop: '24px' }}>
        Looking forward to your lesson!<br />
        DanceHub
      </Text>
    </BaseLayout>
  );
};