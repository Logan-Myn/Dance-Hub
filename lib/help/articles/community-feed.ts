import type { HelpArticle } from "../types";

export const communityFeed: HelpArticle = {
  slug: "community-feed",
  category: "community",
  title: {
    en: "Post in your community and organize topics",
    es: "Publicar en tu comunidad y organizar los temas",
  },
  summary: {
    en: "Write posts and announcements, pin the important ones, and group posts by topic.",
    es: "Escribe publicaciones y anuncios, fija los importantes y agrupa las publicaciones por temas.",
  },
  sections: [
    {
      heading: { en: "Write a post", es: "Escribir una publicación" },
      steps: [
        {
          text: {
            en: "On **Community**, tap **Share a question or a win…**.",
            es: "En **Community**, toca **Share a question or a win…**.",
          },
        },
        {
          text: {
            en: "If your community has topics, pick a **Topic**. Add a **Title** and your text, then tap **Post**. Tick **Pin to the top** to keep an important post first.",
            es: "Si tu comunidad tiene temas, elige uno en **Topic**. Añade un título en **Title** y tu texto, y toca **Post**. Marca **Pin to the top** para fijar arriba una publicación importante.",
          },
          shot: "feed-composer",
        },
      ],
      note: {
        en: "Start with a welcome post: when your classes happen, where the recordings are and how to ask for feedback. While your feed is empty, **Write a welcome post** fills in a draft for you. Pin it so new members see it first.",
        es: "Empieza con una publicación de bienvenida: cuándo son tus clases, dónde están las grabaciones y cómo pedir correcciones. Mientras tu muro esté vacío, **Write a welcome post** te deja un borrador listo. Fíjala para que los nuevos miembros la vean primero.",
      },
    },
    {
      heading: { en: "Group posts by topic", es: "Agrupar las publicaciones por temas" },
      steps: [
        {
          text: {
            en: "Go to **Admin**, then **Post topics**, and tap **Add topic**.",
            es: "Ve a **Admin**, luego a **Post topics**, y toca **Add topic**.",
          },
          shot: "post-topics",
        },
        {
          text: {
            en: "Write a **Topic name**, for example Technique or Announcements, and pick its color. Turn on **Only you can post** for news that only you share.",
            es: "Escribe el nombre del tema en **Topic name**, por ejemplo Técnica o Anuncios, y elige su color. Activa **Only you can post** para las noticias que solo compartes tú.",
          },
        },
        {
          text: {
            en: "Tap **Save topics**. Members then choose a topic when they post.",
            es: "Toca **Save topics**. Tus miembros eligen un tema al publicar.",
          },
        },
      ],
    },
  ],
  related: ["members-emails", "live-classes"],
};
