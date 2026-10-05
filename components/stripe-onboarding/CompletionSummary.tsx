import React from 'react';
import { CheckCircle, CreditCard, DollarSign, Users, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface CompletionSummaryProps {
  accountId: string;
  onClose: () => void;
  onSetupPricing?: () => void;
}

export function CompletionSummary({ accountId, onClose, onSetupPricing }: CompletionSummaryProps) {
  const accomplishments = [
    {
      icon: CheckCircle,
      title: "Account Verified",
      description: "Your payout account is set up and verified"
    },
    {
      icon: CreditCard,
      title: "Payment Processing Ready",
      description: "You can now accept credit card payments from your community members"
    },
    {
      icon: DollarSign,
      title: "Automatic Payouts",
      description: "Payments will be automatically transferred to your bank account"
    },
    {
      icon: Users,
      title: "Community Monetization",
      description: "Start charging for premium content and exclusive access"
    }
  ];

  const nextSteps = [
    "Set your community membership pricing",
    "Create premium content for paying members",
    "Promote your paid community to attract subscribers",
    "Monitor your earnings in the community dashboard"
  ];

  return (
    <div className="space-y-6 text-center">
      {/* Success Header */}
      <div className="space-y-4">
        <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            🎉 Payment Setup Complete!
          </h2>
          <p className="text-gray-600 mt-2">
            Your dance community is now ready to accept payments
          </p>
        </div>
      </div>

      {/* Accomplishments Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {accomplishments.map((item, index) => (
          <Card key={index} className="p-4 text-left">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                <item.icon className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900">{item.title}</h3>
                <p className="text-sm text-gray-600 mt-1">{item.description}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Next Steps */}
      <Card className="p-6 text-left">
        <h3 className="font-semibold text-gray-900 mb-4">What's Next?</h3>
        <ul className="space-y-3">
          {nextSteps.map((step, index) => (
            <li key={index} className="flex items-start space-x-3">
              <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium">
                {index + 1}
              </span>
              <span className="text-gray-700">{step}</span>
            </li>
          ))}
        </ul>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        {onSetupPricing && (
          <Button onClick={onSetupPricing} className="flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            Set Up Pricing
            <ArrowRight className="w-4 h-4" />
          </Button>
        )}
        <Button variant="outline" onClick={onClose}>
          Continue to Dashboard
        </Button>
      </div>

      {/* Account Info */}
      <div className="text-sm text-gray-500 pt-4 border-t">
        <p>Payout account: <code className="rounded bg-surface-2 px-2 py-1 text-xs">{accountId}</code></p>
        <p className="mt-1">
          You can manage your account settings and view detailed analytics in your{' '}
          <a 
            href="https://dashboard.stripe.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            Stripe Dashboard
          </a>
        </p>
      </div>
    </div>
  );
} 