import type { HelpArticle } from "../types";

export const gettingPaid: HelpArticle = {
  slug: "getting-paid",
  category: "money",
  title: {
    en: "Set your price and get paid",
    es: "Poner precio y cobrar",
  },
  summary: {
    en: "Set up payouts, choose a monthly price and an optional yearly plan, and see what the platform fee is.",
    es: "Configura los cobros, elige un precio mensual y un plan anual opcional, y consulta la comisión de la plataforma.",
  },
  sections: [
    {
      heading: { en: "Set up payouts first", es: "Configurar primero los cobros" },
      intro: {
        en: "Before members can pay you, connect the bank account where you want to receive the money.",
        es: "Antes de que tus miembros puedan pagarte, conecta la cuenta bancaria donde quieres recibir el dinero.",
      },
      steps: [
        {
          text: {
            en: "Go to **Admin**, then **Pricing and payouts**.",
            es: "Ve a **Admin** y luego a **Pricing and payouts**.",
          },
        },
        {
          text: {
            en: "Tap **Set up payouts**. You'll need your legal name and date of birth, your bank account number (IBAN), and sometimes a photo of your ID.",
            es: "Toca **Set up payouts**. Necesitarás tu nombre completo y tu fecha de nacimiento, tu número de cuenta bancaria (IBAN) y, a veces, una foto de tu documento de identidad.",
          },
          shot: "payouts",
        },
        {
          text: {
            en: "Checking your details can take a little while. When it's done, the page shows **Payouts are on**. If it shows **Payouts need a few more details**, follow what it asks for.",
            es: "La verificación de tus datos puede tardar un poco. Cuando termine, la página mostrará **Payouts are on**. Si muestra **Payouts need a few more details**, completa lo que te pida.",
          },
        },
      ],
    },
    {
      heading: { en: "Choose your price", es: "Elegir tu precio" },
      steps: [
        {
          text: {
            en: "Under **Membership price**, choose **Paid membership** and enter a monthly price. It stays greyed out until payouts are set up.",
            es: "En **Membership price**, elige **Paid membership** (membresía de pago) e indica un precio mensual. Aparece en gris hasta que configures los cobros.",
          },
          shot: "pricing",
        },
        {
          text: {
            en: "Optionally, turn on **Offer a yearly plan** and enter a yearly price. About 10 times the monthly price gives members roughly two months free.",
            es: "Si quieres, activa **Offer a yearly plan** (plan anual) e indica un precio anual. Unas 10 veces el precio mensual equivale a regalar unos dos meses.",
          },
        },
        {
          text: {
            en: "Tap **Save prices**. The box **What visitors see** shows the price as it will appear on your About page.",
            es: "Toca **Save prices**. El recuadro **What visitors see** muestra el precio tal como aparecerá en tu página About.",
          },
        },
      ],
      note: {
        en: "Prefer free? Keep **Free membership**. You can still sell private lessons.",
        es: "¿Prefieres que sea gratis? Deja **Free membership**. Puedes seguir vendiendo clases particulares.",
      },
    },
    {
      heading: { en: "The platform fee", es: "La comisión de la plataforma" },
      points: [
        {
          en: "No fee during your community's first 15 days.",
          es: "Sin comisión durante los primeros 15 días de tu comunidad.",
        },
        {
          en: "After that, 8% of each payment, for memberships and private lessons alike, while you have fewer than 50 members.",
          es: "Después, un 8% de cada pago, tanto de membresías como de clases particulares, mientras tengas menos de 50 miembros.",
        },
        {
          en: "6% from 50 to 100 members, and 4% above 100.",
          es: "Un 6% de 50 a 100 miembros, y un 4% con más de 100.",
        },
      ],
    },
    {
      heading: { en: "When the money arrives", es: "Cuándo llega el dinero" },
      intro: {
        en: "The money goes to your bank account automatically. Choose how often: **As soon as possible**, **Weekly** or **Monthly**, then tap **Save schedule**. **Recent payouts**, on the same page, shows each transfer to your bank and whether it's on the way or already paid.",
        es: "El dinero llega a tu cuenta bancaria automáticamente. Elige cada cuánto: **As soon as possible** (lo antes posible), **Weekly** (semanal) o **Monthly** (mensual), y toca **Save schedule**. En **Recent payouts**, en la misma página, ves cada transferencia a tu banco y si está en camino o ya hecha.",
      },
    },
  ],
  related: ["who-can-join", "about-page"],
};
