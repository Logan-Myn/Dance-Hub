export interface PayButtonDisplay {
  label: string; // the submit button text
  caption: string | null; // small line under the button, or null when not needed
}

/**
 * Text for the checkout submit button. When a promo code has reduced the first
 * charge, the button shows the amount due today and a caption spells out the
 * recurring price (e.g. "Pay €160 today" + "then €200/year"). With no discount
 * it shows the plain recurring price and no caption.
 */
export function payButtonDisplay(args: {
  mode: 'payment' | 'setup';
  dueTodayCents: number | null;
  price: number;
  plan?: 'monthly' | 'yearly';
}): PayButtonDisplay {
  const cadence = args.plan === 'yearly' ? 'year' : 'month';
  if (args.mode === 'setup') return { label: 'Save card and join', caption: null };

  const fullLabel = `Pay €${args.price}/${cadence}`;
  if (args.dueTodayCents == null) return { label: fullLabel, caption: null };

  const today = args.dueTodayCents / 100;
  // No real reduction (e.g. a code with no effect): keep the plain label.
  if (today === args.price) return { label: fullLabel, caption: null };

  const amount = Number.isInteger(today) ? `€${today}` : `€${today.toFixed(2)}`;
  return { label: `Pay ${amount} today`, caption: `then €${args.price}/${cadence}` };
}
