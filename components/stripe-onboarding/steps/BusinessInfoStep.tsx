"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Building, User, Globe, Phone, MapPin, Shield } from "lucide-react";
import { toast } from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";

interface BusinessInfo {
  businessType: "individual" | "company";
  legalBusinessName: string;
  businessAddress: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  businessPhone: string;
  businessWebsite?: string;
  mccCode: string;
}

interface BusinessInfoStepProps {
  data: {
    businessInfo: BusinessInfo;
    accountId?: string;
  };
  updateData: (data: any) => void;
  onNext: () => void;
  onCreateAccount: () => Promise<string>;
  isLoading: boolean;
  communitySlug?: string;
}

const STRIPE_COUNTRIES = [
  { value: "US", label: "United States" },
  { value: "CA", label: "Canada" },
  { value: "GB", label: "United Kingdom" },
  { value: "AU", label: "Australia" },
  { value: "AT", label: "Austria" },
  { value: "BE", label: "Belgium" },
  { value: "BG", label: "Bulgaria" },
  { value: "HR", label: "Croatia" },
  { value: "CY", label: "Cyprus" },
  { value: "CZ", label: "Czech Republic" },
  { value: "DK", label: "Denmark" },
  { value: "EE", label: "Estonia" },
  { value: "FI", label: "Finland" },
  { value: "FR", label: "France" },
  { value: "DE", label: "Germany" },
  { value: "GR", label: "Greece" },
  { value: "HU", label: "Hungary" },
  { value: "IE", label: "Ireland" },
  { value: "IT", label: "Italy" },
  { value: "LV", label: "Latvia" },
  { value: "LT", label: "Lithuania" },
  { value: "LU", label: "Luxembourg" },
  { value: "MT", label: "Malta" },
  { value: "NL", label: "Netherlands" },
  { value: "NO", label: "Norway" },
  { value: "PL", label: "Poland" },
  { value: "PT", label: "Portugal" },
  { value: "RO", label: "Romania" },
  { value: "SK", label: "Slovakia" },
  { value: "SI", label: "Slovenia" },
  { value: "ES", label: "Spain" },
  { value: "SE", label: "Sweden" },
  { value: "CH", label: "Switzerland" },
  { value: "AE", label: "United Arab Emirates" },
  { value: "BR", label: "Brazil" },
  { value: "MX", label: "Mexico" },
  { value: "SG", label: "Singapore" },
  { value: "HK", label: "Hong Kong" },
  { value: "JP", label: "Japan" },
  { value: "MY", label: "Malaysia" },
  { value: "NZ", label: "New Zealand" },
  { value: "TH", label: "Thailand" },
];

const US_STATES = [
  { value: "AL", label: "Alabama" },
  { value: "AK", label: "Alaska" },
  { value: "AZ", label: "Arizona" },
  { value: "AR", label: "Arkansas" },
  { value: "CA", label: "California" },
  { value: "CO", label: "Colorado" },
  { value: "CT", label: "Connecticut" },
  { value: "DE", label: "Delaware" },
  { value: "FL", label: "Florida" },
  { value: "GA", label: "Georgia" },
  { value: "HI", label: "Hawaii" },
  { value: "ID", label: "Idaho" },
  { value: "IL", label: "Illinois" },
  { value: "IN", label: "Indiana" },
  { value: "IA", label: "Iowa" },
  { value: "KS", label: "Kansas" },
  { value: "KY", label: "Kentucky" },
  { value: "LA", label: "Louisiana" },
  { value: "ME", label: "Maine" },
  { value: "MD", label: "Maryland" },
  { value: "MA", label: "Massachusetts" },
  { value: "MI", label: "Michigan" },
  { value: "MN", label: "Minnesota" },
  { value: "MS", label: "Mississippi" },
  { value: "MO", label: "Missouri" },
  { value: "MT", label: "Montana" },
  { value: "NE", label: "Nebraska" },
  { value: "NV", label: "Nevada" },
  { value: "NH", label: "New Hampshire" },
  { value: "NJ", label: "New Jersey" },
  { value: "NM", label: "New Mexico" },
  { value: "NY", label: "New York" },
  { value: "NC", label: "North Carolina" },
  { value: "ND", label: "North Dakota" },
  { value: "OH", label: "Ohio" },
  { value: "OK", label: "Oklahoma" },
  { value: "OR", label: "Oregon" },
  { value: "PA", label: "Pennsylvania" },
  { value: "RI", label: "Rhode Island" },
  { value: "SC", label: "South Carolina" },
  { value: "SD", label: "South Dakota" },
  { value: "TN", label: "Tennessee" },
  { value: "TX", label: "Texas" },
  { value: "UT", label: "Utah" },
  { value: "VT", label: "Vermont" },
  { value: "VA", label: "Virginia" },
  { value: "WA", label: "Washington" },
  { value: "WV", label: "West Virginia" },
  { value: "WI", label: "Wisconsin" },
  { value: "WY", label: "Wyoming" },
];

export function BusinessInfoStep({
  data,
  updateData,
  onNext,
  onCreateAccount,
  isLoading,
  communitySlug,
}: BusinessInfoStepProps) {
  const [businessInfo, setBusinessInfo] = useState<BusinessInfo>(data.businessInfo);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tosAccepted, setTosAccepted] = useState(false);
  const { session } = useAuth();

  // Auto-fill website URL with community page
  const communityWebsiteUrl = `https://dance-hub.io/${communitySlug}`;

  // Auto-fill website URL if not already set
  useEffect(() => {
    if (communitySlug && !businessInfo.businessWebsite) {
      setBusinessInfo(prev => ({
        ...prev,
        businessWebsite: communityWebsiteUrl
      }));
    }
  }, [communitySlug, businessInfo.businessWebsite, communityWebsiteUrl]);

  // Only update parent when businessInfo actually changes
  useEffect(() => {
    const hasChanges = JSON.stringify(businessInfo) !== JSON.stringify(data.businessInfo);
    if (hasChanges) {
      updateData({ businessInfo });
    }
  }, [businessInfo]); // Remove updateData from dependencies to prevent loops

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!businessInfo.legalBusinessName.trim()) {
      newErrors.legalBusinessName = "Business name is required";
    }

    if (!businessInfo.businessAddress.line1.trim()) {
      newErrors.addressLine1 = "Address line 1 is required";
    }

    if (!businessInfo.businessAddress.city.trim()) {
      newErrors.city = "City is required";
    }

    if (!businessInfo.businessAddress.state) {
      newErrors.state = "State/Province is required";
    }

    if (!businessInfo.businessAddress.country) {
      newErrors.country = "Country is required";
    }

    if (!businessInfo.businessAddress.postalCode.trim()) {
      newErrors.postalCode = "Postal code is required";
    } else {
      // Validate postal code based on country
      const country = businessInfo.businessAddress.country;
      const postalCode = businessInfo.businessAddress.postalCode;
      
      if (country === "US" && !/^\d{5}(-\d{4})?$/.test(postalCode)) {
        newErrors.postalCode = "Invalid US ZIP code format (e.g., 12345 or 12345-6789)";
      } else if (country === "CA" && !/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/.test(postalCode)) {
        newErrors.postalCode = "Invalid Canadian postal code format (e.g., K1A 0A6)";
      } else if (country === "GB" && !/^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i.test(postalCode)) {
        newErrors.postalCode = "Invalid UK postal code format (e.g., SW1A 1AA)";
      } else if (postalCode.length < 3 || postalCode.length > 10) {
        newErrors.postalCode = "Postal code must be between 3 and 10 characters";
      }
    }

    if (!businessInfo.businessPhone.trim()) {
      newErrors.businessPhone = "Business phone is required";
    }

    if (!tosAccepted) {
      newErrors.tosAccepted = "You must accept Stripe's Terms of Service to continue";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    console.log("BusinessInfoStep handleSubmit called");
    console.log("Current data.accountId:", data.accountId);
    console.log("Current businessInfo:", businessInfo);
    
    if (!validateForm()) {
      toast.error("Please fix the validation errors");
      return;
    }

    try {
      let accountId = data.accountId;
      console.log("Initial accountId:", accountId);

      // If we don't have an account ID yet, create the Stripe account
      if (!accountId) {
        console.log("No accountId found, calling onCreateAccount...");
        accountId = await onCreateAccount();
        console.log("onCreateAccount returned:", accountId);
      } else {
        console.log("Using existing accountId:", accountId);
      }

      if (!session) {
        throw new Error("Not authenticated");
      }

      if (!accountId) {
        throw new Error("Failed to get account ID");
      }

      console.log("Updating business info for account:", accountId);

      // Update the business information via API
      const response = await fetch(`/api/stripe/custom-account/${accountId}/update`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          step: "business_info",
          businessInfo: {
            type: businessInfo.businessType,
            name: businessInfo.legalBusinessName,
            url: businessInfo.businessWebsite,
            address: {
              line1: businessInfo.businessAddress.line1,
              line2: businessInfo.businessAddress.line2 || "",
              city: businessInfo.businessAddress.city,
              state: businessInfo.businessAddress.state,
              postal_code: businessInfo.businessAddress.postalCode,
              country: businessInfo.businessAddress.country,
            },
            phone: businessInfo.businessPhone,
            mcc: businessInfo.mccCode,
          },
          tosAcceptance: {
            accepted: tosAccepted,
            date: new Date().toISOString(),
            ip: null, // Will be filled by server from request headers
            userAgent: navigator.userAgent,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Business info update failed:", errorData);
        throw new Error(errorData.error || "Failed to update business information");
      }

      console.log("Business information updated successfully");
      toast.success("Business information saved successfully!");
      onNext();
    } catch (error) {
      console.error("Error updating business info:", error);
      toast.error(error instanceof Error ? error.message : "Failed to save business information");
    }
  };

  const updateField = (field: string, value: string) => {
    if (field.startsWith("address.")) {
      const addressField = field.split(".")[1];
      setBusinessInfo(prev => ({
        ...prev,
        businessAddress: {
          ...prev.businessAddress,
          [addressField]: value,
        },
      }));
    } else {
      setBusinessInfo(prev => ({
        ...prev,
        [field]: value,
      }));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">Business Information</h2>
        <p className="text-gray-600">
          Tell us about your dance community so we can set up payments for you.
        </p>
      </div>

      <div className="space-y-6">
        {/* Business Type */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="h-5 w-5" />
              Business Type
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => updateField("businessType", "individual")}
                className={`p-4 border rounded-lg text-left transition-colors ${
                  businessInfo.businessType === "individual"
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <User className="h-5 w-5" />
                  <span className="font-medium">Individual</span>
                </div>
                <p className="text-sm text-gray-600">
                  You're a sole proprietor or independent dance instructor
                </p>
              </button>

              <button
                type="button"
                onClick={() => updateField("businessType", "company")}
                className={`p-4 border rounded-lg text-left transition-colors ${
                  businessInfo.businessType === "company"
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Building className="h-5 w-5" />
                  <span className="font-medium">Company</span>
                </div>
                <p className="text-sm text-gray-600">
                  You have a registered business entity (LLC, Corp, etc.)
                </p>
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Business Details */}
        <Card>
          <CardHeader>
            <CardTitle>Business Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="businessName">
                {businessInfo.businessType === "individual" ? "Your Name" : "Legal Business Name"} *
              </Label>
              <Input
                id="businessName"
                value={businessInfo.legalBusinessName}
                onChange={(e) => updateField("legalBusinessName", e.target.value)}
                placeholder={
                  businessInfo.businessType === "individual" 
                    ? "John Doe" 
                    : "Dance Studio LLC"
                }
                className={errors.legalBusinessName ? "border-red-500" : ""}
              />
              {errors.legalBusinessName && (
                <p className="text-red-500 text-sm mt-1">{errors.legalBusinessName}</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="businessPhone">Business Phone *</Label>
                <Input
                  id="businessPhone"
                  value={businessInfo.businessPhone}
                  onChange={(e) => updateField("businessPhone", e.target.value)}
                  placeholder="+1 (555) 123-4567"
                  className={errors.businessPhone ? "border-red-500" : ""}
                />
                {errors.businessPhone && (
                  <p className="text-red-500 text-sm mt-1">{errors.businessPhone}</p>
                )}
              </div>

              <div>
                <Label htmlFor="businessWebsite">Business Website</Label>
                <Input
                  id="businessWebsite"
                  value={businessInfo.businessWebsite || ""}
                  readOnly
                  disabled
                  className="bg-gray-50 text-gray-600 cursor-not-allowed"
                />
                <p className="text-sm text-gray-600 mt-1">
                  Your community page URL (automatically set to your community page)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Business Address */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Business Address
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="addressLine1">Address Line 1 *</Label>
              <Input
                id="addressLine1"
                value={businessInfo.businessAddress.line1}
                onChange={(e) => updateField("address.line1", e.target.value)}
                placeholder="123 Main Street"
                className={errors.addressLine1 ? "border-red-500" : ""}
              />
              {errors.addressLine1 && (
                <p className="text-red-500 text-sm mt-1">{errors.addressLine1}</p>
              )}
            </div>

            <div>
              <Label htmlFor="addressLine2">Address Line 2 (Optional)</Label>
              <Input
                id="addressLine2"
                value={businessInfo.businessAddress.line2 || ""}
                onChange={(e) => updateField("address.line2", e.target.value)}
                placeholder="Suite 100"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="city">City *</Label>
                <Input
                  id="city"
                  value={businessInfo.businessAddress.city}
                  onChange={(e) => updateField("address.city", e.target.value)}
                  placeholder="New York"
                  className={errors.city ? "border-red-500" : ""}
                />
                {errors.city && (
                  <p className="text-red-500 text-sm mt-1">{errors.city}</p>
                )}
              </div>

              <div>
                <Label htmlFor="state">State/Province *</Label>
                <Input
                  id="state"
                  value={businessInfo.businessAddress.state}
                  onChange={(e) => updateField("address.state", e.target.value)}
                  placeholder="State or Province"
                  className={errors.state ? "border-red-500" : ""}
                />
                {errors.state && (
                  <p className="text-red-500 text-sm mt-1">{errors.state}</p>
                )}
              </div>

              <div>
                <Label htmlFor="postalCode">Postal Code *</Label>
                <Input
                  id="postalCode"
                  value={businessInfo.businessAddress.postalCode}
                  onChange={(e) => updateField("address.postalCode", e.target.value)}
                  placeholder="12345"
                  className={errors.postalCode ? "border-red-500" : ""}
                />
                {errors.postalCode && (
                  <p className="text-red-500 text-sm mt-1">{errors.postalCode}</p>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="country">Country *</Label>
              <Select
                value={businessInfo.businessAddress.country}
                onValueChange={(value) => updateField("address.country", value)}
              >
                <SelectTrigger className={errors.country ? "border-red-500" : ""}>
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  {STRIPE_COUNTRIES.map((country) => (
                    <SelectItem key={country.value} value={country.value}>
                      {country.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.country && (
                <p className="text-red-500 text-sm mt-1">{errors.country}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Terms of Service Acceptance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Terms of Service
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start space-x-3">
              <input
                type="checkbox"
                id="tosAccepted"
                checked={tosAccepted}
                onChange={(e) => setTosAccepted(e.target.checked)}
                className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <div className="flex-1">
                <label htmlFor="tosAccepted" className="text-sm text-gray-700">
                  I acknowledge that I understand and agree to Stripe's{" "}
                  <a
                    href="https://stripe.com/ssa"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 underline"
                  >
                    Terms of Service
                  </a>{" "}
                  and{" "}
                  <a
                    href="https://stripe.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 underline"
                  >
                    Privacy Policy
                  </a>
                  . I understand that by checking this box and proceeding, I am legally accepting these terms on behalf of my business.
                </label>
                {errors.tosAccepted && (
                  <p className="text-sm text-red-500 mt-1">{errors.tosAccepted}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSubmit} disabled={isLoading} className="flex items-center gap-2">
          {isLoading ? "Saving..." : "Continue"}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
} 