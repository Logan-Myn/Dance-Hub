import type { HelpArticle } from "../types";

export const phone: HelpArticle = {
  slug: "phone",
  category: "setup",
  title: {
    en: "Run your community from your phone",
    es: "Llevar tu comunidad desde el móvil",
  },
  summary: {
    en: "Find your way around on a phone, add Dance-Hub to your home screen, and see what each button does.",
    es: "Muévete por Dance-Hub en el móvil, añádelo a tu pantalla de inicio y descubre qué hace cada botón.",
  },
  sections: [
    {
      heading: { en: "Find your way around", es: "Moverte por la app" },
      intro: {
        en: "On a phone, the bar at the bottom of the screen takes you to **Community**, **Classroom**, **Lessons** (your private lessons) and **Calendar**. Tap **More** for your **About** page, **Admin**, **Switch community**, **My dashboard** and **Settings**.",
        es: "En el móvil, la barra de abajo te lleva a **Community** (la comunidad), **Classroom** (los cursos), **Lessons** (tus clases particulares) y **Calendar** (el calendario). Toca **More** para tu página **About**, **Admin**, **Switch community** (cambiar de comunidad), **My dashboard** y **Settings** (ajustes).",
      },
      shot: "open-admin",
    },
    {
      heading: { en: "Add Dance-Hub to your home screen", es: "Añadir Dance-Hub a tu pantalla de inicio" },
      points: [
        {
          en: "On an iPhone, open your community in Safari, tap the share button (on recent iPhones it can be under ••• first), then **Add to Home Screen**.",
          es: "En un iPhone, abre tu comunidad en Safari, toca el botón de compartir (en los iPhone recientes puede estar dentro de •••) y luego **Añadir a pantalla de inicio**.",
        },
        {
          en: "On Android, open it in Chrome, tap the menu (three dots), then **Add to Home screen**.",
          es: "En Android, ábrela en Chrome, toca el menú (los tres puntos) y luego **Añadir a pantalla de inicio**.",
        },
      ],
      note: {
        en: "Then one tap on the icon opens your community.",
        es: "Así, con un toque en el icono, se abre tu comunidad.",
      },
    },
    {
      heading: { en: "See what a button does", es: "Ver qué hace un botón" },
      intro: {
        en: "In posts, lesson notes and About page text, the editor's buttons are small icons. Tap one and its name shows for a moment, such as **Bold** or **Heading 1**. The tap also applies it.",
        es: "En las publicaciones, las notas de las lecciones y los textos de la página About, los botones del editor son iconos pequeños. Toca uno y su nombre aparece un momento, por ejemplo **Bold** (negrita) o **Heading 1** (título 1). El toque también aplica el formato.",
      },
      shot: "toolbar-names",
    },
    {
      heading: { en: "Upload videos from your phone", es: "Subir vídeos desde el móvil" },
      intro: {
        en: "When you add a video to a lesson or to your About page, **browse** opens your phone's photos and videos. Stay on the page until the upload finishes. Read more in [Create courses and free preview lessons](courses).",
        es: "Cuando añades un vídeo a una lección o a tu página About, **browse** abre las fotos y vídeos de tu móvil. Quédate en la página hasta que termine la subida. Más detalles en [Crear cursos y lecciones de prueba gratis](courses).",
      },
    },
  ],
  related: ["getting-started", "about-page", "courses"],
};
