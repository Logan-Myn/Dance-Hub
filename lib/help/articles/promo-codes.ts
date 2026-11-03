import type { HelpArticle } from "../types";

export const promoCodes: HelpArticle = {
  slug: "promo-codes",
  category: "money",
  title: {
    en: "Give a discount with a promo code",
    es: "Hacer un descuento con un código promocional",
  },
  summary: {
    en: "Create a code that takes a percentage or an amount off your membership, for the first payment or the first few months.",
    es: "Crea un código que rebaje el precio de tu membresía en un porcentaje o una cantidad fija, en el primer pago o en los primeros meses.",
  },
  sections: [
    {
      heading: { en: "Create a code", es: "Crear un código" },
      intro: {
        en: "Promo codes work on paid memberships, so [set your price](getting-paid) first.",
        es: "Los códigos funcionan con membresías de pago, así que primero [pon tu precio](getting-paid).",
      },
      steps: [
        {
          text: {
            en: "Go to **Admin**, then **Promo codes**.",
            es: "Ve a **Admin** y luego a **Promo codes**.",
          },
        },
        {
          text: {
            en: "Under **Create a code**, write the **Code** people will type, for example SHOWCASE15.",
            es: "En **Create a code**, escribe en **Code** el código que tendrá que escribir la gente, por ejemplo SHOWCASE15.",
          },
          shot: "promo-codes",
        },
        {
          text: {
            en: "Choose the **Discount**: **Percent off** or **Amount off, in €**, and enter how much. Under **Applies to**, choose **The first payment**, or **The first few months** and how many **Months**.",
            es: "Elige el descuento en **Discount**: **Percent off** (porcentaje) o **Amount off, in €** (cantidad en €), e indica cuánto. En **Applies to**, elige **The first payment** (el primer pago), o **The first few months** (los primeros meses) y cuántos en **Months**.",
          },
        },
        {
          text: {
            en: "If you offer a yearly plan, choose **Which plan can use it?**. Optionally set **Max uses** and an **Expires** date, then tap **Create code**.",
            es: "Si ofreces un plan anual, elige en **Which plan can use it?** qué plan puede usarlo. Si quieres, indica un máximo de usos en **Max uses** y una fecha de caducidad en **Expires**, y toca **Create code**.",
          },
        },
      ],
    },
    {
      heading: { en: "How members use it", es: "Cómo lo usan tus miembros" },
      intro: {
        en: "Share the code with the dancers you want to invite. They type it when they join, and the discount applies to their membership. Your codes are listed under **Your codes**.",
        es: "Comparte el código con las personas que quieras invitar. Lo escriben al unirse y el descuento se aplica a su membresía. Tus códigos aparecen en **Your codes**.",
      },
    },
  ],
  related: ["getting-paid", "members-emails"],
};
