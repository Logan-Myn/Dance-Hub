# Custom Stripe Onboarding Implementation Plan

## Overview
Replace the current Stripe Connect Express flow with a custom onboarding experience that keeps teachers within your application throughout the entire process.

## Technical Approach
- **Current**: Stripe Connect Express (redirects to Stripe)
- **New**: Stripe Connect Custom (custom UI within app)
- **API**: Use Stripe Account API and File Upload API

---

## Phase 1: Backend API Setup

### 1.1 Create Stripe Account Management Endpoints

**New API Routes needed:**
```
POST /api/stripe/custom-account/create
PUT /api/stripe/custom-account/:accountId/update
POST /api/stripe/custom-account/:accountId/upload-document
GET /api/stripe/custom-account/:accountId/status
POST /api/stripe/custom-account/:accountId/verify
```

### 1.2 Account Creation Flow
- Create Stripe Express account with `country` and `type: 'express'`
- Store account ID in community table
- Set up account with minimal required fields initially

### 1.3 Document Upload Handler
- Implement file upload for verification documents
- Support multiple file types (PDF, JPG, PNG)
- Validate file sizes and formats
- Use Stripe File Upload API

---

## Phase 2: Frontend Components

### 2.1 Onboarding Wizard Component
```
components/
├── stripe-onboarding/
│   ├── OnboardingWizard.tsx
│   ├── steps/
│   │   ├── BusinessInfoStep.tsx
│   │   ├── PersonalInfoStep.tsx
│   │   ├── BankAccountStep.tsx
│   │   ├── DocumentUploadStep.tsx
│   │   └── VerificationStep.tsx
│   ├── ProgressIndicator.tsx
│   └── DocumentUploader.tsx
```

### 2.2 Progress Tracking
- Multi-step progress indicator
- Save progress locally/database
- Allow users to return and complete later
- Show completion percentage

---

## Phase 3: Onboarding Steps Implementation

### Step 1: Business Information
**Required Fields:**
- Business type (individual/company)
- Legal business name
- Business address
- Business phone
- Business website (optional)
- Industry/MCC code (education)

**UI Considerations:**
- Country-specific address formats
- Auto-complete for addresses
- Business type explanation for teachers

### Step 2: Personal Information (Account Owner)
**Required Fields:**
- Full legal name
- Date of birth
- Home address (if different from business)
- Phone number
- Email address
- Last 4 digits of SSN/Tax ID

**UI Considerations:**
- Clear explanation of why personal info is needed
- Privacy assurance messaging
- Date picker for DOB

### Step 3: Bank Account Information
**Required Fields:**
- Bank account number
- Routing number (US) / IBAN (EU)
- Account holder name
- Bank name and address

**UI Considerations:**
- Bank account verification explanation
- Support for different countries
- Micro-deposit verification flow

### Step 4: Document Upload
**Required Documents:**
- Government-issued ID (driver's license, passport)
- Business documents (if applicable)
- Bank statements (for verification)
- Additional documents based on country/business type

**UI Considerations:**
- Drag & drop file upload
- Document type guidance
- Photo capture option for mobile
- File size/format validation

### Step 5: Verification & Review
**Features:**
- Review all submitted information
- Show verification status
- Handle additional requirements
- Enable account for payments

---

## Phase 4: State Management

### 4.1 Onboarding State
```typescript
interface OnboardingState {
  accountId: string;
  currentStep: number;
  completedSteps: number[];
  businessInfo: BusinessInfo;
  personalInfo: PersonalInfo;
  bankAccount: BankAccountInfo;
  documents: DocumentInfo[];
  verificationStatus: VerificationStatus;
  requirements: StripeRequirements;
}
```

### 4.2 Form Validation
- Real-time validation for each field
- Country-specific validation rules
- Required field indicators
- Error message handling

---

## Phase 5: Error Handling & Edge Cases

### 5.1 Common Error Scenarios
- Invalid documents
- Failed verification
- Missing required fields
- Country-specific restrictions
- Age restrictions
- Blocked business types

### 5.2 Error Recovery
- Clear error messages with solutions
- Re-upload document flow
- Contact support options
- Progress preservation on errors

### 5.3 Additional Requirements Handling
- Dynamic requirement updates from Stripe
- Notification system for new requirements
- Easy re-entry to complete missing items

---

## Phase 6: UI/UX Enhancements

### 6.1 User Experience Features
- **Progress saving**: Auto-save form progress
- **Mobile optimization**: Responsive design for all steps
- **Help system**: Contextual help for each field
- **Preview mode**: Show how info will appear to customers
- **Status dashboard**: Overview of verification status

### 6.2 Educational Content
- Why each piece of information is needed
- How long verification typically takes
- What happens after approval
- Payment processing timeline explanation

### 6.3 Success States
- Completion celebration screen
- Next steps guidance
- Setup subscription pricing flow
- Community promotion tips

---

## Phase 7: Integration Points

### 7.1 Community Settings Integration
- Replace current Stripe connect button
- Add onboarding status indicator
- Link to re-complete if verification fails
- Show account health status

### 7.2 Dashboard Integration
- Onboarding completion status
- Outstanding requirements alerts
- Quick access to manage account
- Payout information display

---

## Phase 8: Testing Strategy

### 8.1 Stripe Test Mode
- Use Stripe test environment
- Test with various country configurations
- Test document upload with test files
- Verify webhook handling

### 8.2 User Testing
- Test with real teachers (in test mode)
- Gather feedback on flow complexity
- Time completion rates
- Identify friction points

### 8.3 Edge Case Testing
- Network interruptions during upload
- Large file uploads
- Invalid document formats
- Multiple browser tabs
- Mobile vs desktop experience

---

## Phase 9: Compliance & Security

### 9.1 Data Security
- Encrypt sensitive data at rest
- Secure file upload handling
- PCI compliance considerations
- GDPR compliance for EU users

### 9.2 Compliance Requirements
- Know Your Customer (KYC) compliance
- Anti-Money Laundering (AML) compliance
- Different country regulations
- Document retention policies

---

## Phase 10: Monitoring & Analytics

### 10.1 Completion Metrics
- Track completion rates by step
- Identify drop-off points
- Time to complete each step
- Error rates by field/step

### 10.2 Success Metrics
- Overall onboarding completion rate
- Time from start to verification
- Support ticket reduction
- Teacher satisfaction scores

---

## Implementation Timeline

### Week 1-2: Backend Setup
- Create API endpoints
- Set up Stripe account creation
- Implement document upload

### Week 3-4: Core Components
- Build onboarding wizard structure
- Implement step navigation
- Create form components

### Week 5-6: Step Implementation
- Build all onboarding steps
- Implement validation
- Add error handling

### Week 7-8: Integration & Polish
- Integrate with existing components
- Add progress saving
- Implement help system

### Week 9-10: Testing & Refinement
- User testing
- Bug fixes
- Performance optimization

---

## Success Criteria

✅ **Completion Rate**: >85% of teachers complete onboarding  
✅ **Time to Complete**: <20 minutes average  
✅ **Support Reduction**: 50% fewer Stripe-related support tickets  
✅ **User Satisfaction**: >4.5/5 rating for onboarding experience  
✅ **Mobile Compatibility**: Fully functional on mobile devices  

---

## Future Enhancements

- **Multi-language support** for international teachers
- **Video tutorials** embedded in steps
- **Live chat support** during onboarding
- **Bulk document upload** for multiple requirements
- **Integration with tax preparation** services
- **Automated requirement checking** before submission

---

## Resources & Documentation

- [Stripe Connect Custom Accounts](https://stripe.com/docs/connect/custom-accounts)
- [Stripe File Upload API](https://stripe.com/docs/file-upload)
- [Account API Reference](https://stripe.com/docs/api/accounts)
- [Connect Onboarding Best Practices](https://stripe.com/docs/connect/onboarding) 