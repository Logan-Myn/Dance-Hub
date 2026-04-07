# Custom Stripe Onboarding API Testing Guide

## Test Environment Setup

**Test Community Data:**
- Community ID: `1e9aec95-1006-40b2-aa50-5a8db69fdf32` (Test_Month)
- Community Slug: `test-month` 
- Current Stripe Account: `null` (perfect for testing)

**Base URL:** `https://your-domain.com` (replace with your actual domain)

---

## Test Sequence

### 1. Test Account Creation

**Endpoint:** `POST /api/stripe/custom-account/create`

```bash
curl -X POST https://your-domain.com/api/stripe/custom-account/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "communityId": "1e9aec95-1006-40b2-aa50-5a8db69fdf32",
    "country": "US",
    "businessType": "individual"
  }'
```

**Expected Response:**
```json
{
  "accountId": "acct_xxxxxxxxxx",
  "country": "US",
  "businessType": "individual",
  "currentStep": 1,
  "message": "Stripe account created successfully. Ready for custom onboarding."
}
```

**Save the `accountId` for subsequent tests!**

---

### 2. Test Business Info Update

**Endpoint:** `PUT /api/stripe/custom-account/[accountId]/update`

```bash
curl -X PUT https://your-domain.com/api/stripe/custom-account/ACCOUNT_ID/update \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "step": "business_info",
    "currentStep": 2,
    "businessInfo": {
      "type": "individual",
      "name": "Test Dance Academy",
      "address": {
        "line1": "123 Dance Street",
        "city": "New York",
        "state": "NY",
        "postal_code": "10001",
        "country": "US"
      },
      "phone": "+1234567890",
      "website": "https://testdanceacademy.com",
      "mcc": "8299"
    }
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "accountId": "acct_xxxxxxxxxx",
  "step": "business_info",
  "requirements": {
    "currentlyDue": [...],
    "pastDue": [],
    "eventuallyDue": [...]
  },
  "charges_enabled": false,
  "payouts_enabled": false,
  "details_submitted": false,
  "message": "business_info updated successfully"
}
```

---

### 3. Test Personal Info Update

```bash
curl -X PUT https://your-domain.com/api/stripe/custom-account/ACCOUNT_ID/update \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "step": "personal_info",
    "currentStep": 3,
    "personalInfo": {
      "first_name": "John",
      "last_name": "Doe",
      "email": "john.doe@testdanceacademy.com",
      "phone": "+1234567890",
      "dob": {
        "day": 15,
        "month": 8,
        "year": 1985
      },
      "address": {
        "line1": "123 Dance Street",
        "city": "New York",
        "state": "NY",
        "postal_code": "10001",
        "country": "US"
      },
      "ssn_last_4": "1234"
    }
  }'
```

---

### 4. Test Bank Account Update

```bash
curl -X PUT https://your-domain.com/api/stripe/custom-account/ACCOUNT_ID/update \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "step": "bank_account",
    "currentStep": 4,
    "bankAccount": {
      "account_number": "000123456789",
      "routing_number": "110000000",
      "account_holder_name": "John Doe",
      "account_holder_type": "individual",
      "country": "US",
      "currency": "usd"
    }
  }'
```

---

### 5. Test Document Upload

**Endpoint:** `POST /api/stripe/custom-account/[accountId]/upload-document`

```bash
curl -X POST https://your-domain.com/api/stripe/custom-account/ACCOUNT_ID/upload-document \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@test-id.jpg" \
  -F "documentType=identity_document" \
  -F "purpose=identity_document"
```

**Note:** You'll need a test image file. Create a small test image or PDF file for this.

**Expected Response:**
```json
{
  "success": true,
  "file": {
    "id": "file_xxxxxxxxxx",
    "filename": "test-id.jpg",
    "size": 12345,
    "type": "identity_document",
    "uploadedAt": "2024-01-01T12:00:00Z"
  },
  "requirements": {
    "currentlyDue": [...],
    "pastDue": [],
    "eventuallyDue": [...]
  },
  "charges_enabled": false,
  "payouts_enabled": false,
  "details_submitted": false,
  "message": "Document uploaded successfully"
}
```

---

### 6. Test Status Check

**Endpoint:** `GET /api/stripe/custom-account/[accountId]/status`

```bash
curl -X GET https://your-domain.com/api/stripe/custom-account/ACCOUNT_ID/status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response:**
```json
{
  "accountId": "acct_xxxxxxxxxx",
  "charges_enabled": false,
  "payouts_enabled": false,
  "details_submitted": false,
  "business_type": "individual",
  "country": "US",
  "default_currency": "usd",
  "email": null,
  "isFullyVerified": false,
  "needsAttention": true,
  "completionPercentage": 60,
  "suggestedNextStep": "documents",
  "requirements": {
    "currentlyDue": [...],
    "pastDue": [],
    "eventuallyDue": [...]
  },
  "progress": {
    "currentStep": 4,
    "completedSteps": [1, 2, 3],
    "businessInfo": {...},
    "personalInfo": {...},
    "bankAccount": {...},
    "documents": [...],
    "updatedAt": "2024-01-01T12:00:00Z"
  },
  "capabilities": {...},
  "bankAccounts": [...]
}
```

---

### 7. Test Final Verification

**Endpoint:** `POST /api/stripe/custom-account/[accountId]/verify`

```bash
curl -X POST https://your-domain.com/api/stripe/custom-account/ACCOUNT_ID/verify \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response (if incomplete):**
```json
{
  "success": false,
  "verified": false,
  "accountId": "acct_xxxxxxxxxx",
  "charges_enabled": false,
  "payouts_enabled": false,
  "requirements": {
    "currentlyDue": ["individual.verification.document"],
    "pastDue": [],
    "missing": ["Government-issued photo ID"]
  },
  "message": "Account verification incomplete. Please complete the missing requirements.",
  "nextSteps": ["Government-issued photo ID"]
}
```

---

## Testing with Database Verification

After each test, verify the data was saved correctly:

### Check Communities Table
```sql
SELECT id, name, stripe_account_id, stripe_onboarding_type 
FROM communities 
WHERE id = '1e9aec95-1006-40b2-aa50-5a8db69fdf32';
```

### Check Onboarding Progress
```sql
SELECT * FROM stripe_onboarding_progress 
WHERE community_id = '1e9aec95-1006-40b2-aa50-5a8db69fdf32';
```

---

## Quick Test Script

Create a file `test-stripe-api.sh`:

```bash
#!/bin/bash

# Configuration
BASE_URL="https://your-domain.com"
COMMUNITY_ID="1e9aec95-1006-40b2-aa50-5a8db69fdf32"
JWT_TOKEN="YOUR_JWT_TOKEN"

echo "🧪 Testing Custom Stripe Onboarding API"
echo "======================================="

# Test 1: Create Account
echo "1️⃣ Creating Stripe Account..."
RESPONSE=$(curl -s -X POST "$BASE_URL/api/stripe/custom-account/create" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d "{\"communityId\": \"$COMMUNITY_ID\", \"country\": \"US\", \"businessType\": \"individual\"}")

echo "Response: $RESPONSE"

# Extract account ID (you'll need jq for this)
ACCOUNT_ID=$(echo $RESPONSE | jq -r '.accountId')
echo "Account ID: $ACCOUNT_ID"

# Test 2: Update Business Info
echo "2️⃣ Updating Business Info..."
curl -s -X PUT "$BASE_URL/api/stripe/custom-account/$ACCOUNT_ID/update" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "step": "business_info",
    "businessInfo": {
      "type": "individual",
      "name": "Test Dance Academy"
    }
  }' | jq '.'

# Continue with other tests...
```

---

## Troubleshooting

### Common Issues:

1. **401 Unauthorized**: Check your JWT token and authentication
2. **404 Not Found**: Verify the account ID is correct
3. **400 Bad Request**: Check the request body format
4. **500 Internal Server Error**: Check server logs for detailed error

### Debugging Commands:

```bash
# Check if account exists in Stripe
curl -X GET "https://api.stripe.com/v1/accounts/ACCOUNT_ID" \
  -H "Authorization: Bearer sk_test_..." | jq '.'

# Check database state
SELECT * FROM stripe_onboarding_progress ORDER BY created_at DESC LIMIT 1;
```

---

## Expected Test Results

✅ **Success Indicators:**
- Account creation returns valid account ID
- Each update step saves progress to database
- Status endpoint shows increasing completion percentage
- Document upload creates file in Stripe
- Requirements list decreases with each completed step

❌ **Failure Indicators:**
- 500 errors (check server logs)
- Database not updating (check RLS policies)
- Stripe errors (check API keys and account permissions)

---

## Security Notes

🔒 **Important:**
- Use test Stripe keys only
- Never commit real API keys to version control
- Test with non-production data
- Verify RLS policies are working correctly 