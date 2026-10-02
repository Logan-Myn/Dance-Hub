"use client";

import React, { useState, useEffect } from "react";
import { Calendar, Clock, CreditCard, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface PreRegistrationComingSoonProps {
  communityName: string;
  communitySlug: string;
  /** Null once the community has opened but this member's first charge is still to come. */
  openingDate: string | null;
  membershipPrice: number;
  onCancel: () => void;
}

export function PreRegistrationComingSoon({
  communityName,
  communitySlug,
  openingDate,
  membershipPrice,
  onCancel,
}: PreRegistrationComingSoonProps) {
  const [timeRemaining, setTimeRemaining] = useState('');

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const calculateTimeRemaining = () => {
    if (!openingDate) return '';
    const now = new Date();
    const opening = new Date(openingDate);
    const diff = opening.getTime() - now.getTime();

    if (diff <= 0) {
      return 'Opening now...';
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) {
      return `${days} day${days !== 1 ? 's' : ''}, ${hours} hour${hours !== 1 ? 's' : ''}`;
    } else if (hours > 0) {
      return `${hours} hour${hours !== 1 ? 's' : ''}, ${minutes} minute${minutes !== 1 ? 's' : ''}`;
    } else {
      return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }
  };

  useEffect(() => {
    // Update countdown every minute
    const updateTime = () => {
      setTimeRemaining(calculateTimeRemaining());
    };

    updateTime();
    const interval = setInterval(updateTime, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [openingDate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full p-8 space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
            <Calendar className="h-8 w-8 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Coming Soon!
          </h1>
          <p className="text-lg text-gray-600">
            You're pre-registered for <strong>{communityName}</strong>
          </p>
        </div>

        {/* Opening Date */}
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg p-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide mb-2">Opens On</p>
          <p className="text-2xl font-bold mb-4">
            {openingDate ? formatDate(openingDate) : 'Very soon'}
          </p>
          {timeRemaining && (
            <div className="flex items-center justify-center space-x-2 text-blue-100">
              <Clock className="h-4 w-4" />
              <p className="text-sm">In {timeRemaining}</p>
            </div>
          )}
        </div>

        {/* What Happens Next */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-900">What happens next?</h2>

          <div className="space-y-3">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                <span className="text-green-600 font-semibold text-sm">1</span>
              </div>
              <div>
                <p className="font-medium text-gray-900">Payment Method Saved</p>
                <p className="text-sm text-gray-600">
                  Your payment method has been securely saved. No charges yet!
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-blue-600 font-semibold text-sm">2</span>
              </div>
              <div>
                <p className="font-medium text-gray-900">Automatic Charge on Opening</p>
                <p className="text-sm text-gray-600">
                  {openingDate ? `On ${new Date(openingDate).toLocaleDateString()}, you` : 'When your membership starts, you'}'ll be automatically charged €{(Number(membershipPrice) || 0).toFixed(2)}/month
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                <span className="text-purple-600 font-semibold text-sm">3</span>
              </div>
              <div>
                <p className="font-medium text-gray-900">Instant Access</p>
                <p className="text-sm text-gray-600">
                  You'll receive full access to all community features immediately after payment
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Payment Info */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex items-start space-x-3">
          <CreditCard className="h-5 w-5 text-gray-600 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">Payment Details</p>
            <p className="text-sm text-gray-600">
              Monthly subscription: €{(Number(membershipPrice) || 0).toFixed(2)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Recurring monthly charge after opening
            </p>
          </div>
        </div>

        {/* Founding Member Badge */}
        <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-300 rounded-lg p-4 text-center">
          <p className="text-sm font-semibold text-yellow-800 mb-1">🌟 Founding Member</p>
          <p className="text-xs text-yellow-700">
            As a pre-registered member, you'll always have a special place in this community!
          </p>
        </div>

        {/* Cancel Option */}
        <div className="pt-4 border-t border-gray-200">
          <Button
            variant="outline"
            onClick={onCancel}
            className="w-full"
          >
            <X className="h-4 w-4 mr-2" />
            Cancel Pre-Registration
          </Button>
          <p className="text-xs text-gray-500 text-center mt-2">
            You can cancel anytime before {openingDate ? new Date(openingDate).toLocaleDateString() : 'your first payment'} without being charged
          </p>
        </div>
      </Card>
    </div>
  );
}
