# 🚀 Simple Stripe API Testing Guide

## ✨ **Easy Browser Testing (Recommended)**

**No JWT tokens needed!** Just test in your browser with your normal login.

### **Step 1: Start your development server**
```bash
npm run dev
```

### **Step 2: Log in to your app**
- Go to http://localhost:3000
- Log in with your normal account

### **Step 3: Run the tests**
- Go to http://localhost:3000/test-stripe
- Click "Run All Tests"
- Watch the results in real-time!

**That's it!** ✅

---

## 🎯 **What the Tests Do**

The browser test will automatically:

1. **Create a Stripe Account** for your Test_Month community
2. **Update Business Info** (name, address, website)
3. **Update Personal Info** (name, DOB, SSN, etc.)
4. **Add Bank Account** (test routing/account numbers)
5. **Check Status** (completion percentage, requirements)
6. **Verify Account** (final verification check)

---

## 📊 **Understanding Results**

### ✅ **PASS** - Test worked correctly
### ❌ **FAIL** - Test failed (shows error message)
### ⚠️ **ERROR** - Something went wrong with the request

---

## 🔧 **If Tests Fail**

### **Common Issues:**

1. **"Not authenticated"** 
   - Make sure you're logged in to your app
   - Refresh the page and try again

2. **"Community not found or unauthorized"**
   - The test uses the "Test_Month" community
   - Make sure you own this community or update the community ID in the test

3. **"Community already has a Stripe account"**
   - The Test_Month community already has a Stripe account
   - Either use a different community or delete the existing Stripe account

4. **Stripe API errors**
   - Check your Stripe API keys in environment variables
   - Make sure you're using test keys, not live keys

---

## 🛠️ **Advanced Testing (Command Line)**

If you prefer command line testing, you can still use the original approach:

```bash
# 1. Get your session token from browser dev tools
# 2. Edit test-stripe-endpoints.js and add the token
# 3. Run the test
node test-stripe-endpoints.js
```

---

## 🎉 **Expected Results**

**✅ Most tests should PASS**
- Account creation should work
- Info updates should work  
- Status should show progress

**⚠️ Verification will likely be INCOMPLETE**
- This is expected with test data
- Real verification requires real documents

---

## 💡 **Next Steps After Testing**

Once tests pass, you can:

1. **Build the frontend UI** for the custom onboarding flow
2. **Add file upload** for document verification
3. **Integrate with your community settings**
4. **Style the onboarding process**

---

## 🆘 **Need Help?**

If you encounter issues:

1. Check the browser console for detailed errors
2. Check your server logs (`npm run dev` terminal)
3. Verify your Stripe API keys are configured
4. Make sure the database migration ran successfully

**Test URL:** http://localhost:3000/test-stripe 