import type { HelpArticle } from "../types";

export const membersEmails: HelpArticle = {
  slug: "members-emails",
  category: "community",
  title: {
    en: "See your members and email them",
    es: "Ver a tus miembros y escribirles por correo",
  },
  summary: {
    en: "Find who joined and how active they are, invite new members, and send an email to all or some of them.",
    es: "Mira quién se ha unido y cuánto participa, invita a nuevos miembros y envía un correo a todos o a algunos.",
  },
  sections: [
    {
      heading: { en: "See your members", es: "Ver a tus miembros" },
      steps: [
        {
          text: {
            en: "Go to **Admin**, then **Members**. Search by name or email, or filter, for example to see only paying members.",
            es: "Ve a **Admin** y luego a **Members**. Busca por nombre o correo, o filtra, por ejemplo para ver solo a los que pagan.",
          },
          shot: "members",
        },
        {
          text: {
            en: "Tap a member to see when they joined, their plan and how active they are.",
            es: "Toca el nombre de un miembro para ver cuándo se unió, su plan y cuánto participa.",
          },
        },
      ],
    },
    {
      heading: { en: "Invite new members", es: "Invitar a nuevos miembros" },
      intro: {
        en: "Tap **Copy invite link** and paste it in WhatsApp, Instagram or an email. The link opens your About page, where people join.",
        es: "Toca **Copy invite link** y pega el enlace en WhatsApp, Instagram o un correo. El enlace abre tu página About, donde la gente se une.",
      },
    },
    {
      heading: { en: "Email your members", es: "Escribir un correo a tus miembros" },
      steps: [
        {
          text: {
            en: "Go to **Admin**, then **Emails to members**, and tap **New email**.",
            es: "Ve a **Admin**, luego a **Emails to members**, y toca **New email**.",
          },
        },
        {
          text: {
            en: "Choose who gets it under **Send to**, write a **Subject** and your message.",
            es: "Elige quién lo recibe en **Send to**, escribe el asunto en **Subject** y tu mensaje.",
          },
          shot: "new-email",
        },
        {
          text: {
            en: "Tap **Send me a test** to see it in your own inbox first. Then tap **Send to 12 members** (with your own number) and confirm with **Send now**.",
            es: "Toca **Send me a test** para verlo antes en tu propio correo. Luego toca **Send to 12 members** (con tu número de miembros) y confirma con **Send now**.",
          },
        },
      ],
    },
  ],
  related: ["community-feed", "promo-codes"],
};
