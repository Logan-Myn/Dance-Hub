import type { HelpArticle } from "../types";

export const whoCanJoin: HelpArticle = {
  slug: "who-can-join",
  category: "setup",
  title: {
    en: "Open or close your community to new members",
    es: "Abrir o cerrar tu comunidad a nuevos miembros",
  },
  summary: {
    en: "Choose whether people can join now, sign up before you open, or not join at all.",
    es: "Elige si la gente puede unirse ya, apuntarse antes de que abras, o si cierras la comunidad a nuevos miembros.",
  },
  sections: [
    {
      heading: { en: "Change who can join", es: "Cambiar quién puede unirse" },
      steps: [
        {
          text: {
            en: "Open your community and tap **Manage community**, at the top of the community page. On a phone you can also tap **More** at the bottom of the screen, then **Admin**.",
            es: "Abre tu comunidad y toca **Manage community**, arriba en la página de la comunidad. En el móvil también puedes tocar **More** abajo en la pantalla y luego **Admin**.",
          },
          shot: "open-admin",
        },
        {
          text: {
            en: "Choose **Community details** in the admin menu, then scroll down to **Who can join**.",
            es: "Elige **Community details** en el menú de administración y baja hasta **Who can join**.",
          },
          shot: "who-can-join",
        },
        {
          text: {
            en: "Pick a **Status**, then tap **Save changes** in the bar that appears at the bottom.",
            es: "Elige un **Status** y toca **Save changes** en la barra que aparece abajo.",
          },
        },
      ],
    },
    {
      heading: { en: "The three options", es: "Las tres opciones" },
      points: [
        {
          en: "**Open: members can join**. Anyone can join right away, for free or by paying your price.",
          es: "**Open: members can join** (abierta). Cualquiera puede unirse al momento, gratis o pagando tu precio.",
        },
        {
          en: "**Pre-registration: members sign up now, pay on opening day**. Use it before you launch: set the **Opening date and time**, and people who sign up are charged on that date.",
          es: "**Pre-registration: members sign up now, pay on opening day** (prerregistro). Úsala antes de abrir: indica la fecha en **Opening date and time**, y quienes se apunten pagarán ese día.",
        },
        {
          en: "**Closed to new members**. Nobody new can join. Members who already joined keep their access.",
          es: "**Closed to new members** (cerrada). Nadie nuevo puede unirse. Los miembros que ya están conservan su acceso.",
        },
      ],
      note: {
        en: "Once someone has pre-registered, the status and the opening date are locked, so nobody is charged on a date they didn't agree to.",
        es: "En cuanto alguien se prerregistra, el estado y la fecha de apertura quedan bloqueados, para que nadie pague en una fecha que no aceptó.",
      },
    },
    {
      heading: { en: "What visitors see when it's closed", es: "Qué ven los visitantes si está cerrada" },
      intro: {
        en: "Your About page shows **Not taking new members** instead of the Join button. If someone tells you they can't join, check this setting first.",
        es: "Tu página About muestra **Not taking new members** en lugar del botón para unirse. Si alguien te dice que no puede unirse, revisa primero este ajuste.",
      },
      shot: "about-closed",
    },
  ],
  related: ["getting-paid", "about-page"],
};
