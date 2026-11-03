import type { HelpArticle } from "../types";

export const gettingStarted: HelpArticle = {
  slug: "getting-started",
  category: "setup",
  title: {
    en: "Get started: create your community",
    es: "Primeros pasos: crear tu comunidad",
  },
  summary: {
    en: "Create your community, choose what you offer, follow the setup list and invite your first members.",
    es: "Crea tu comunidad, elige lo que ofreces, sigue la lista de configuración e invita a tus primeros miembros.",
  },
  sections: [
    {
      heading: { en: "Create your community", es: "Crear tu comunidad" },
      steps: [
        {
          text: {
            en: "On dance-hub.io, tap **Start your community** and sign up with Google or your email.",
            es: "En dance-hub.io, toca **Start your community** y regístrate con Google o con tu correo.",
          },
        },
        {
          text: {
            en: "Give it a **Community name** and a short **Description**, then tap **Create community**. You can change both later.",
            es: "Ponle un nombre en **Community name** y una descripción corta en **Description**, y toca **Create community**. Puedes cambiar ambos más tarde.",
          },
          shot: "onboarding",
        },
      ],
    },
    {
      heading: { en: "Choose what you offer", es: "Elegir lo que ofreces" },
      steps: [
        {
          text: {
            en: "Go to **Admin**, then **Offerings**. **Live classes**, **Courses** and **Private lessons** all start switched on: switch off what you don't teach. The tabs, cards and About page blocks follow these switches. The community feed is always on.",
            es: "Ve a **Admin** y luego a **Offerings**. Las tres opciones, **Live classes** (clases en directo), **Courses** (cursos) y **Private lessons** (clases particulares), vienen activadas: desactiva lo que no enseñes. Las pestañas, las tarjetas y los bloques de tu página About dependen de estos interruptores. El muro de la comunidad siempre está activo.",
          },
          shot: "offerings",
        },
      ],
    },
    {
      heading: { en: "Follow the setup list", es: "Seguir la lista de configuración" },
      steps: [
        {
          text: {
            en: "**Overview**, the first page of Admin, shows what's left to set up under **Community setup**. Tap **Set up** next to an item to do it.",
            es: "**Overview**, la primera página de Admin, muestra lo que te falta por configurar en **Community setup**. Toca **Set up** junto a cada punto para hacerlo.",
          },
          shot: "admin-overview",
        },
      ],
    },
    {
      heading: { en: "Invite your first members", es: "Invitar a tus primeros miembros" },
      intro: {
        en: "Tap **Invite** on your community page, or **Copy invite link** in Admin, to copy your link, then paste it in WhatsApp, Instagram or an email. Before you share it, check [who can join](who-can-join).",
        es: "Toca **Invite** en la página de tu comunidad, o **Copy invite link** en Admin, para copiar tu enlace, y pégalo en WhatsApp, Instagram o un correo. Antes de compartirlo, revisa [quién puede unirse](who-can-join).",
      },
    },
  ],
  related: ["who-can-join", "about-page", "getting-paid"],
};
