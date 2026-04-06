# Pre-Registration Feature Implementation

## Overview

This document outlines the implementation of the community pre-registration feature, which allows teachers to set their community to "pre-registration" mode with a defined opening date. Students can pre-register by saving their payment method without being charged immediately. On the opening date, the system automatically charges all pre-registered members and grants them access.

## Implementation Summary

### 1. Database Schema Changes

#### Communities Table
Added three new fields to the `communities` table:

```sql
- status TEXT DEFAULT 'active' CHECK (status IN ('active', 'pre_registration', 'inactive'))
- opening_date TIMESTAMP WITH TIME ZONE
- can_change_opening_date BOOLEAN DEFAULT true
```

**Migrations:**
- `supabase/migrations/20250911_add_community_status_and_pre_registration.sql`

#### Community Members Table
Added three new fields to track pre-registration:

```sql
- pre_registration_payment_method_id TEXT
- stripe_invoice_id TEXT
- pre_registration_date TIMESTAMP WITH TIME ZONE
```

Updated status constraint to include:
- `pending_pre_registration` - Setting up payment method
- `pre_registered` - Payment method saved, awaiting opening

**Migrations:**
- `supabase/migrations/20250912_add_pre_registration_fields_to_members.sql`

### 2. TypeScript Types

Updated `types/supabase.ts` with:
- New community fields (status, opening_date, can_change_opening_date)
- New community_members fields (pre_registration_payment_method_id, stripe_invoice_id, pre_registration_date)
- Type exports:
  - `CommunityStatus = 'active' | 'pre_registration' | 'inactive'`
  - `MemberStatus = 'active' | 'pending' | 'inactive' | 'pending_pre_registration' | 'pre_registered'`

### 3. API Routes

#### Pre-Registration Join Flow

**`/api/community/[communitySlug]/join-pre-registration` (POST)**
- Verifies community is in pre-registration status
- Creates Stripe Customer on connected account
- Creates Stripe SetupIntent to save payment method without charging
- Inserts member with status `pending_pre_registration`
- Returns `clientSecret` for Stripe Elements

**`/api/community/[communitySlug]/confirm-pre-registration` (POST)**
- Retrieves SetupIntent to get saved payment method
- Creates scheduled Stripe Invoice with `automatically_finalizes_at` set to opening_date
- Adds membership invoice item
- Updates member status to `pre_registered`
- Stores `stripe_invoice_id` and `pre_registration_payment_method_id`

**`/api/community/[communitySlug]/cancel-pre-registration` (POST)**
- Voids scheduled Stripe invoice
- Detaches payment method
- Deletes Stripe customer
- Removes member record from database
- Allows students to cancel without being charged

#### Cron Job

**`/api/cron/process-community-openings` (GET)**
- Runs hourly via Vercel Cron (`vercel.json` configuration)
- Finds communities with `status='pre_registration'` and `opening_date <= now`
- For each community:
  - Retrieves all `pre_registered` members
  - Finalizes invoices (Stripe auto-charges)
  - Updates community status to `active`
  - Webhook handles member status updates on payment success/failure

**Security:** Protected by `CRON_SECRET` environment variable

### 4. Stripe Integration Architecture

The implementation uses **Stripe Scheduled Invoice Finalization**:

1. **Pre-Registration Phase:**
   - SetupIntent saves payment method without charging
   - Scheduled Invoice created with `automatically_finalizes_at: opening_timestamp`
   - Invoice items added for membership subscription

2. **Opening Date:**
   - Cron job manually finalizes invoices if needed
   - Stripe automatically charges invoices
   - `invoice.payment_succeeded` webhook updates member to `active`
   - `invoice.payment_failed` webhook handles failures

3. **Rescheduling Support:**
   - Teachers can change opening_date (up to 1 month max recommended)
   - Update invoice's `automatically_finalizes_at` timestamp
   - Notify pre-registered students of date change

### 5. Email Templates

Created 3 React Email templates using existing email system:

**`lib/resend/templates/community/pre-registration-confirmation.tsx`**
- Sent after payment method successfully saved
- Shows opening date and membership price
- Explains automatic charge process
- Includes cancellation instructions

**`lib/resend/templates/community/community-opening.tsx`**
- Sent when payment succeeds on opening date
- Welcome message for founding members
- Lists membership benefits
- Provides next steps

**`lib/resend/templates/community/pre-registration-payment-failed.tsx`**
- Sent when opening date charge fails
- Explains common failure reasons
- Provides 7-day grace period info
- CTA to update payment method

### 6. Webhook Updates (Required for Completion)

**Note:** The following webhook handlers need to be added/updated in `/app/api/webhooks/stripe/route.ts`:

```typescript
case 'invoice.payment_succeeded':
  // Check if invoice has metadata: is_pre_registration_charge
  if (invoice.metadata?.is_pre_registration_charge === 'true') {
    const { user_id, community_id } = invoice.metadata;

    // Create subscription for the member
    const subscription = await connectedStripe.subscriptions.create({
      customer: invoice.customer,
      items: [{ price: community.stripe_price_id }],
      default_payment_method: invoice.default_payment_method,
      metadata: {
        user_id,
        community_id,
        platform_fee_percentage: invoice.metadata.platform_fee_percentage
      },
      application_fee_percent: parseFloat(invoice.metadata.platform_fee_percentage)
    });

    // Update member to active status
    await supabase
      .from('community_members')
      .update({
        status: 'active',
        stripe_subscription_id: subscription.id,
        subscription_status: subscription.status,
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString()
      })
      .eq('community_id', community_id)
      .eq('user_id', user_id);

    // Send community-opening email
    // ...
  }
  break;

case 'invoice.payment_failed':
  // Check if invoice has metadata: is_pre_registration_charge
  if (invoice.metadata?.is_pre_registration_charge === 'true') {
    const { user_id, community_id } = invoice.metadata;

    // Update member subscription_status to past_due
    await supabase
      .from('community_members')
      .update({ subscription_status: 'past_due' })
      .eq('community_id', community_id)
      .eq('user_id', user_id);

    // Send payment-failed email with retry instructions
    // ...
  }
  break;
```

## UI/UX Implementation (Not Yet Implemented)

The following frontend components still need to be created:

### 1. Community Settings UI
- **File:** `app/[communitySlug]/settings/page.tsx` or similar
- Add status dropdown: Active, Pre-Registration, Inactive
- Opening date/time picker (conditional on pre-registration status)
- Validation: Opening date must be in future
- Warning if changing date with existing pre-registrations

### 2. Pre-Registered Members List
- **File:** New component to show pre-registered users
- Display: Name, email, pre-registration date
- Actions: View details, manual cancellation
- Count badge showing total pre-registrations

### 3. Community Cards Updates
- **Files:** Community listing/card components
- Show "Pre-Registration" badge when status = 'pre_registration'
- Display opening date countdown
- "Pre-Register Now" vs "Join Now" button logic

### 4. Join Flow Updates
- **Files:** Join/payment modal components
- Detect community status
- If pre-registration:
  - Show SetupIntent flow (save payment, no charge)
  - Display: "You'll be charged on [date]"
  - Call `/join-pre-registration` instead of `/join-paid`
  - After SetupIntent success, call `/confirm-pre-registration`
- If active: Use existing paid join flow

### 5. Access Control Updates
- **Files:** Community page, classroom, private lessons pages
- Check community status in addition to member status
- Pre-registered members:
  - Show "Coming Soon" page
  - Display countdown to opening
  - Provide cancellation option
  - No access to community content

### 6. About Page Updates
- Show opening date for pre-registration communities
- Display pre-registration CTA
- Explain what happens on opening date

## Environment Variables

Add to `.env.local` and Vercel:

```bash
# Existing
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_...

# New (for cron job)
CRON_SECRET=<generate with: openssl rand -hex 32>
```

## Deployment Checklist

### Database
- [x] Run migration for communities table
- [x] Run migration for community_members table
- [x] Verify indexes created

### Backend
- [x] Deploy API routes
- [x] Deploy cron job
- [x] Update vercel.json with cron config
- [ ] Add webhook handlers for invoice events
- [x] Create email templates

### Frontend (TO DO)
- [ ] Community settings UI
- [ ] Pre-registration join flow
- [ ] Access control updates
- [ ] Community cards with badge
- [ ] Pre-registered members list

### Testing
- [ ] Test pre-registration flow end-to-end
- [ ] Test cron job manually
- [ ] Test cancellation flow
- [ ] Test opening date charge
- [ ] Test failed payment scenarios
- [ ] Test email delivery

### Environment
- [x] Add CRON_SECRET to Vercel
- [ ] Verify webhook endpoints in Stripe dashboard
- [ ] Configure Stripe Smart Retries (4 attempts, 30 days)

## Testing Pre-Registration Locally

1. **Set opening date to near future:**
   ```sql
   UPDATE communities
   SET status = 'pre_registration',
       opening_date = NOW() + INTERVAL '5 minutes'
   WHERE slug = 'test-community';
   ```

2. **Pre-register a user:**
   - Use Stripe test cards: `4242 4242 4242 4242`
   - Verify SetupIntent succeeds
   - Check member status = 'pre_registered'

3. **Trigger cron manually:**
   ```bash
   curl -X GET http://localhost:3000/api/cron/process-community-openings \
     -H "Authorization: Bearer $CRON_SECRET"
   ```

4. **Verify results:**
   - Community status changed to 'active'
   - Invoice finalized and charged
   - Member status updated via webhook

## Key Design Decisions

### Why Scheduled Invoices Instead of Subscriptions?

**Chosen Approach:** SetupIntent + Scheduled Invoice
- ✅ Save payment method without immediate charge
- ✅ Schedule exact charge date up to 5 years in future
- ✅ Can reschedule invoice finalization date
- ✅ After first charge, create subscription for recurring billing

**Rejected Alternative:** Subscription with trial_end
- ❌ Trial limited to specific periods
- ❌ Less flexible for date changes
- ❌ More complex to handle edge cases

### Grace Period & Retry Logic

Following industry best practices from research:
- **Grace Period:** 7 days for failed charges
- **Retry Strategy:** Stripe Smart Retries (4 attempts over 30 days)
- **Communication:** Immediate email on failure with clear instructions
- **Recovery Rate:** Expected 70-80% with proper dunning

### Date Change Restrictions

**Recommendation:** Allow changes up to 1 month from current date
- Prevents indefinite delays
- Gives students certainty
- Invoice `automatically_finalizes_at` can be updated via Stripe API
- Send email notification to all pre-registered members

## Future Enhancements

1. **Early Access Tiers:** Different opening dates for different member tiers
2. **Waitlist Mode:** Collect emails before opening pre-registration
3. **Limited Slots:** Cap pre-registrations to create urgency
4. **Referral Bonuses:** Discount for bringing pre-registered friends
5. **Pre-Registration Analytics:** Dashboard showing conversion metrics
6. **Automated Reminders:** Email X days before opening
7. **Partial Refunds:** If teacher delays opening significantly

## Support & Troubleshooting

### Common Issues

**Issue:** Invoice not charging on opening date
- **Cause:** Cron job not running or failing
- **Solution:** Check Vercel cron logs, verify CRON_SECRET

**Issue:** Member stuck in pre_registered status
- **Cause:** Webhook not firing or failing
- **Solution:** Check Stripe webhook logs, verify endpoint

**Issue:** Payment method expired before opening
- **Cause:** Card expired between pre-reg and opening
- **Solution:** Email user to update, Stripe will detect on charge attempt

**Issue:** Opening date in past but community still pre_registration
- **Cause:** Cron job didn't run
- **Solution:** Manually trigger cron endpoint

## Files Created/Modified

### Created Files
1. `supabase/migrations/20250911_add_community_status_and_pre_registration.sql`
2. `supabase/migrations/20250912_add_pre_registration_fields_to_members.sql`
3. `app/api/community/[communitySlug]/join-pre-registration/route.ts`
4. `app/api/community/[communitySlug]/confirm-pre-registration/route.ts`
5. `app/api/community/[communitySlug]/cancel-pre-registration/route.ts`
6. `app/api/cron/process-community-openings/route.ts`
7. `lib/resend/templates/community/pre-registration-confirmation.tsx`
8. `lib/resend/templates/community/community-opening.tsx`
9. `lib/resend/templates/community/pre-registration-payment-failed.tsx`

### Modified Files
1. `types/supabase.ts` - Added new fields and type exports
2. `vercel.json` - Added cron job configuration

### Files Requiring Updates
1. `app/api/webhooks/stripe/route.ts` - Add invoice payment handlers
2. Community settings page (TBD) - Add status/date controls
3. Join flow components (TBD) - Add pre-registration flow
4. Community cards (TBD) - Add pre-registration badge
5. Access control pages (TBD) - Add pre-registration restrictions

## Documentation & Resources

- [Stripe Scheduled Invoice Docs](https://docs.stripe.com/invoicing/scheduled-finalization)
- [Stripe Smart Retries](https://docs.stripe.com/billing/revenue-recovery/smart-retries)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)
- [GitHub Issue #8](https://github.com/Logan-Myn/dancehub_v3/issues/8)
