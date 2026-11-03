import type { HelpArticle } from "../types";

export const aboutPage: HelpArticle = {
  slug: "about-page",
  category: "page",
  title: {
    en: "Edit your About page",
    es: "Editar tu página About",
  },
  summary: {
    en: "Your About page is what visitors see before they join. Add your story and a welcome video, arrange the blocks, and check it as a visitor.",
    es: "Tu página About es lo que ven los visitantes antes de unirse. Añade tu historia y un vídeo de bienvenida, ordena los bloques y revísala como visitante.",
  },
  sections: [
    {
      heading: { en: "Open the editor", es: "Abrir el editor" },
      steps: [
        {
          text: {
            en: "Go to your community's **About** page. On a phone, tap **More** at the bottom, then **About**.",
            es: "Ve a la página **About** de tu comunidad. En el móvil, toca **More** abajo y luego **About**.",
          },
        },
        {
          text: {
            en: "The **Page checklist** shows what's still missing, such as a welcome video or your teacher bio. Tap **Add** or **Set up** next to an item to do it now.",
            es: "La lista **Page checklist** muestra lo que falta, como un vídeo de bienvenida o tu biografía. Toca **Add** o **Set up** junto a cada punto para completarlo.",
          },
          shot: "about-owner",
        },
        {
          text: {
            en: "Tap **Edit page** to change the page itself.",
            es: "Toca **Edit page** para cambiar la página.",
          },
        },
      ],
    },
    {
      heading: { en: "Arrange the blocks", es: "Ordenar los bloques" },
      intro: {
        en: "The page is made of blocks. Each one has buttons to move it up, move it down or remove it, and most have a **Section title** to rename their heading. Everything saves on its own as you go.",
        es: "La página está hecha de bloques. Cada uno tiene botones para subirlo, bajarlo o quitarlo, y la mayoría tiene un campo **Section title** para cambiar su título. Todo se guarda solo mientras editas.",
      },
      shot: "about-edit",
      steps: [
        {
          text: {
            en: "Tap **Add block** between two blocks to add one there.",
            es: "Toca **Add block** entre dos bloques para añadir uno en ese sitio.",
          },
          shot: "add-block",
        },
        {
          text: {
            en: "Written blocks are yours to fill: **Text**, **Image**, **Video**, **Testimonial**, **Button** and **Teacher bio**.",
            es: "Los bloques escritos los rellenas tú: **Text** (texto), **Image** (imagen), **Video**, **Testimonial** (opinión de un alumno), **Button** (botón con enlace) y **Teacher bio** (tu biografía).",
          },
        },
        {
          text: {
            en: "Automatic blocks fill themselves from what you offer: **What you get**, **Upcoming live classes**, **Courses**, **Private lessons**, **Community activity** and **Questions**. The **Courses** block lists your courses in the order you set in the Classroom.",
            es: "Los bloques automáticos se rellenan solos con lo que ofreces: **What you get**, **Upcoming live classes**, **Courses**, **Private lessons**, **Community activity** y **Questions**. El bloque **Courses** muestra tus cursos en el orden que elijas en el Classroom.",
          },
        },
        {
          text: {
            en: "Tap **Template** to reorder the page around live classes, courses or private coaching. Blocks you wrote are kept, at the end.",
            es: "Toca **Template** para reorganizar la página en torno a clases en directo, cursos o clases particulares. Los bloques que escribiste se conservan, al final.",
          },
        },
      ],
    },
    {
      heading: { en: "Keep the description short", es: "Escribir una descripción corta" },
      intro: {
        en: "Your community's name, cover image and description appear at the top of the page. You change them in **Admin**, then **Community details**. Keep the description to one or two sentences, and tell your full story in a **Text** block, where you can use headings and lists.",
        es: "El nombre, la imagen de portada y la descripción de tu comunidad aparecen arriba de la página. Se cambian en **Admin** y luego **Community details**. Deja la descripción en una o dos frases y cuenta tu historia completa en un bloque **Text**, donde puedes usar títulos y listas.",
      },
    },
    {
      heading: { en: "Check it as a visitor", es: "Revisar la página como visitante" },
      steps: [
        {
          text: {
            en: "Tap **See it as a visitor**, under the **Page checklist**. The page shows exactly what a new visitor sees, with the Join button. Tap **Exit preview** to return.",
            es: "Toca **See it as a visitor**, debajo de la lista **Page checklist**. Verás la página tal como la ve un visitante nuevo, con el botón para unirse. Toca **Exit preview** para volver.",
          },
          shot: "about-visitor",
        },
      ],
    },
  ],
  related: ["courses", "who-can-join"],
};
