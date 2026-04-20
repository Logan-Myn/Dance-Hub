"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, ArrowRight, User, Calendar, MapPin, Shield } from "lucide-react";
import { toast } from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";

interface PersonalInfo {
  firstName: string;
  lastName: string;
  dateOfBirth: {
    day: number;
    month: number;
    year: number;
  };
  address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  phone: string;
  email: string;
  ssnLast4: string;
}

interface PersonalInfoStepProps {
  data: {
    personalInfo: PersonalInfo;
    businessInfo: any;
    accountId?: string;
  };
  updateData: (data: any) => void;
  onNext: () => void;
  onPrevious: () => void;
  isLoading: boolean;
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

const MONTHS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

export function PersonalInfoStep({
  data,
  updateData,
  onNext,
  onPrevious,
  isLoading,
}: PersonalInfoStepProps) {
  const [personalInfo, setPersonalInfo] = useState<PersonalInfo>(data.personalInfo);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sameAsBusinessAddress, setSameAsBusinessAddress] = useState(false);
  const { session } = useAuth();

  // Only update parent when personalInfo actually changes
  useEffect(() => {
    const hasChanges = JSON.stringify(personalInfo) !== JSON.stringify(data.personalInfo);
    if (hasChanges) {
      updateData({ personalInfo });
    }
  }, [personalInfo]); // Remove updateData from dependencies to prevent loops

  // Copy business address if checkbox is checked
  useEffect(() => {
    if (sameAsBusinessAddress && data.businessInfo?.businessAddress) {
      setPersonalInfo(prev => ({
        ...prev,
        address: { ...data.businessInfo.businessAddress },
      }));
    }
  }, [sameAsBusinessAddress, data.businessInfo]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!personalInfo.firstName.trim()) {
      newErrors.firstName = "First name is required";
    }

    if (!personalInfo.lastName.trim()) {
      newErrors.lastName = "Last name is required";
    }

    // Validate date of birth
    const today = new Date();
    const birthDate = new Date(
      personalInfo.dateOfBirth.year,
      personalInfo.dateOfBirth.month - 1,
      personalInfo.dateOfBirth.day
    );
    const age = today.getFullYear() - birthDate.getFullYear();
    
    if (age < 18) {
      newErrors.dateOfBirth = "You must be at least 18 years old";
    } else if (age > 120) {
      newErrors.dateOfBirth = "Please enter a valid date of birth";
    }

    if (!personalInfo.address.line1.trim()) {
      newErrors.addressLine1 = "Address line 1 is required";
    }

    if (!personalInfo.address.city.trim()) {
      newErrors.city = "City is required";
    }

    if (!personalInfo.address.state) {
      newErrors.state = "State/Province is required";
    }

    if (!personalInfo.address.country) {
      newErrors.country = "Country is required";
    }

    if (!personalInfo.address.postalCode.trim()) {
      newErrors.postalCode = "Postal code is required";
    } else {
      // Validate postal code based on country
      const country = personalInfo.address.country;
      const postalCode = personalInfo.address.postalCode;
      
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

    if (!personalInfo.phone.trim()) {
      newErrors.phone = "Phone number is required";
    } else if (!/^\+?[\d\s\-\(\)]+$/.test(personalInfo.phone)) {
      newErrors.phone = "Invalid phone number format";
    }

    if (!personalInfo.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personalInfo.email)) {
      newErrors.email = "Invalid email format";
    }

    // Only require SSN for US accounts
    if (personalInfo.address.country === 'US') {
      if (!personalInfo.ssnLast4.trim()) {
        newErrors.ssnLast4 = "Last 4 digits of SSN are required for US accounts";
      } else if (!/^\d{4}$/.test(personalInfo.ssnLast4)) {
        newErrors.ssnLast4 = "Must be exactly 4 digits";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      toast.error("Please fix the validation errors");
      return;
    }

    if (!data.accountId) {
      toast.error("Account ID is missing. Please go back to the previous step.");
      return;
    }

    try {
      if (!session) {
        throw new Error("Not authenticated");
      }

      // Build personal info object - only include SSN for US accounts
      const personalInfoData: any = {
        first_name: personalInfo.firstName,
        last_name: personalInfo.lastName,
        email: personalInfo.email,
        phone: personalInfo.phone,
        dob: {
          day: personalInfo.dateOfBirth.day,
          month: personalInfo.dateOfBirth.month,
          year: personalInfo.dateOfBirth.year,
        },
        address: {
          line1: personalInfo.address.line1,
          line2: personalInfo.address.line2 || "",
          city: personalInfo.address.city,
          state: personalInfo.address.state,
          postal_code: personalInfo.address.postalCode,
          country: personalInfo.address.country,
        },
      };

      // Only include SSN for US accounts
      if (personalInfo.address.country === 'US' && personalInfo.ssnLast4) {
        personalInfoData.ssn_last_4 = personalInfo.ssnLast4;
      }

      // Update the personal information via API
      const response = await fetch(`/api/stripe/custom-account/${data.accountId}/update`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          step: "personal_info",
          personalInfo: personalInfoData,
          currentStep: 2,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update personal information");
      }

      toast.success("Personal information saved successfully!");
      onNext();
    } catch (error) {
      console.error("Error updating personal info:", error);
      toast.error("Failed to save personal information");
    }
  };

  const updateField = (field: string, value: string | number) => {
    if (field.startsWith("address.")) {
      const addressField = field.split(".")[1];
      setPersonalInfo(prev => ({
        ...prev,
        address: {
          ...prev.address,
          [addressField]: value,
        },
      }));
    } else if (field.startsWith("dateOfBirth.")) {
      const dobField = field.split(".")[1];
      setPersonalInfo(prev => ({
        ...prev,
        dateOfBirth: {
          ...prev.dateOfBirth,
          [dobField]: value,
        },
      }));
    } else {
      setPersonalInfo(prev => ({
        ...prev,
        [field]: value,
      }));
    }
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 100 }, (_, i) => currentYear - 18 - i);
  const days = Array.from({ length: 31 }, (_, i) => i + 1);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">Personal Information</h2>
        <p className="text-gray-600">
          We need your personal details for identity verification and compliance with financial regulations.
        </p>
      </div>

      <div className="space-y-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Basic Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  value={personalInfo.firstName}
                  onChange={(e) => updateField("firstName", e.target.value)}
                  placeholder="John"
                  className={errors.firstName ? "border-red-500" : ""}
                />
                {errors.firstName && (
                  <p className="text-red-500 text-sm mt-1">{errors.firstName}</p>
                )}
              </div>

              <div>
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  value={personalInfo.lastName}
                  onChange={(e) => updateField("lastName", e.target.value)}
                  placeholder="Doe"
                  className={errors.lastName ? "border-red-500" : ""}
                />
                {errors.lastName && (
                  <p className="text-red-500 text-sm mt-1">{errors.lastName}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="email">Email Address *</Label>
                <Input
                  id="email"
                  type="email"
                  value={personalInfo.email}
                  onChange={(e) => updateField("email", e.target.value)}
                  placeholder="john@example.com"
                  className={errors.email ? "border-red-500" : ""}
                />
                {errors.email && (
                  <p className="text-red-500 text-sm mt-1">{errors.email}</p>
                )}
              </div>

              <div>
                <Label htmlFor="phone">Phone Number *</Label>
                <Input
                  id="phone"
                  value={personalInfo.phone}
                  onChange={(e) => updateField("phone", e.target.value)}
                  placeholder="+1 (555) 123-4567"
                  className={errors.phone ? "border-red-500" : ""}
                />
                {errors.phone && (
                  <p className="text-red-500 text-sm mt-1">{errors.phone}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Date of Birth */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Date of Birth
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="month">Month *</Label>
                <Select
                  value={personalInfo.dateOfBirth.month.toString()}
                  onValueChange={(value) => updateField("dateOfBirth.month", parseInt(value))}
                >
                  <SelectTrigger className={errors.dateOfBirth ? "border-red-500" : ""}>
                    <SelectValue placeholder="Month" />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((month) => (
                      <SelectItem key={month.value} value={month.value.toString()}>
                        {month.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="day">Day *</Label>
                <Select
                  value={personalInfo.dateOfBirth.day.toString()}
                  onValueChange={(value) => updateField("dateOfBirth.day", parseInt(value))}
                >
                  <SelectTrigger className={errors.dateOfBirth ? "border-red-500" : ""}>
                    <SelectValue placeholder="Day" />
                  </SelectTrigger>
                  <SelectContent>
                    {days.map((day) => (
                      <SelectItem key={day} value={day.toString()}>
                        {day}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="year">Year *</Label>
                <Select
                  value={personalInfo.dateOfBirth.year.toString()}
                  onValueChange={(value) => updateField("dateOfBirth.year", parseInt(value))}
                >
                  <SelectTrigger className={errors.dateOfBirth ? "border-red-500" : ""}>
                    <SelectValue placeholder="Year" />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((year) => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {errors.dateOfBirth && (
              <p className="text-red-500 text-sm mt-1">{errors.dateOfBirth}</p>
            )}
          </CardContent>
        </Card>

        {/* Personal Address */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Personal Address
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="sameAddress"
                checked={sameAsBusinessAddress}
                onChange={(e) => setSameAsBusinessAddress(e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="sameAddress" className="text-sm">
                Same as business address
              </Label>
            </div>

            <div>
              <Label htmlFor="personalAddressLine1">Address Line 1 *</Label>
              <Input
                id="personalAddressLine1"
                value={personalInfo.address.line1}
                onChange={(e) => updateField("address.line1", e.target.value)}
                placeholder="123 Main Street"
                className={errors.addressLine1 ? "border-red-500" : ""}
                disabled={sameAsBusinessAddress}
              />
              {errors.addressLine1 && (
                <p className="text-red-500 text-sm mt-1">{errors.addressLine1}</p>
              )}
            </div>

            <div>
              <Label htmlFor="personalAddressLine2">Address Line 2 (Optional)</Label>
              <Input
                id="personalAddressLine2"
                value={personalInfo.address.line2 || ""}
                onChange={(e) => updateField("address.line2", e.target.value)}
                placeholder="Apt 4B"
                disabled={sameAsBusinessAddress}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="personalCity">City *</Label>
                <Input
                  id="personalCity"
                  value={personalInfo.address.city}
                  onChange={(e) => updateField("address.city", e.target.value)}
                  placeholder="New York"
                  className={errors.city ? "border-red-500" : ""}
                  disabled={sameAsBusinessAddress}
                />
                {errors.city && (
                  <p className="text-red-500 text-sm mt-1">{errors.city}</p>
                )}
              </div>

              <div>
                <Label htmlFor="personalState">State/Province *</Label>
                <Input
                  id="personalState"
                  value={personalInfo.address.state}
                  onChange={(e) => updateField("address.state", e.target.value)}
                  placeholder="State or Province"
                  className={errors.state ? "border-red-500" : ""}
                  disabled={sameAsBusinessAddress}
                />
                {errors.state && (
                  <p className="text-red-500 text-sm mt-1">{errors.state}</p>
                )}
              </div>

              <div>
                <Label htmlFor="personalPostalCode">Postal Code *</Label>
                <Input
                  id="personalPostalCode"
                  value={personalInfo.address.postalCode}
                  onChange={(e) => updateField("address.postalCode", e.target.value)}
                  placeholder="12345"
                  className={errors.postalCode ? "border-red-500" : ""}
                  disabled={sameAsBusinessAddress}
                />
                {errors.postalCode && (
                  <p className="text-red-500 text-sm mt-1">{errors.postalCode}</p>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="personalCountry">Country *</Label>
              <Select
                value={personalInfo.address.country}
                onValueChange={(value) => updateField("address.country", value)}
                disabled={sameAsBusinessAddress}
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

        {/* Identity Verification - Only for US accounts */}
        {personalInfo.address.country === 'US' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Identity Verification (US Only)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="ssnLast4">Last 4 digits of SSN *</Label>
                <Input
                  id="ssnLast4"
                  value={personalInfo.ssnLast4}
                  onChange={(e) => updateField("ssnLast4", e.target.value)}
                  placeholder="1234"
                  maxLength={4}
                  className={errors.ssnLast4 ? "border-red-500" : ""}
                />
                {errors.ssnLast4 && (
                  <p className="text-red-500 text-sm mt-1">{errors.ssnLast4}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  This information is encrypted and used only for identity verification.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onPrevious} className="flex items-center gap-2">
          <ArrowLeft className="h-4 w-4" />
          Previous
        </Button>
        <Button onClick={handleSubmit} disabled={isLoading} className="flex items-center gap-2">
          {isLoading ? "Saving..." : "Continue"}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
} 