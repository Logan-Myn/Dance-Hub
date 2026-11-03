import type { HelpArticle } from "../types";

export const courses: HelpArticle = {
  slug: "courses",
  category: "teaching",
  title: {
    en: "Create courses and free preview lessons",
    es: "Crear cursos y lecciones de prueba gratis",
  },
  summary: {
    en: "Build a course with chapters and lessons, publish it, let visitors try a lesson for free, and choose the order of your courses.",
    es: "Crea un curso con capítulos y lecciones, publícalo, deja que los visitantes prueben una lección gratis y elige el orden de tus cursos.",
  },
  sections: [
    {
      heading: { en: "Create the course", es: "Crear el curso" },
      steps: [
        {
          text: {
            en: "Go to **Classroom** and tap **Create course**.",
            es: "Ve a **Classroom** y toca **Create course**.",
          },
          shot: "classroom-owner",
        },
        {
          text: {
            en: "Give it a **Name**, say **What members will learn**, and create it. A new course starts as a private draft: only you can see it until you publish it.",
            es: "Ponle un nombre en **Name**, explica en **What members will learn** lo que aprenderán, y créalo. Un curso nuevo empieza como borrador privado: solo tú lo ves hasta que lo publiques.",
          },
          shot: "create-course",
        },
      ],
    },
    {
      heading: { en: "Add chapters and lessons", es: "Añadir capítulos y lecciones" },
      steps: [
        {
          text: {
            en: "Open the course and tap **Edit content**.",
            es: "Abre el curso y toca **Edit content**.",
          },
        },
        {
          text: {
            en: "Open the list of lessons: tap the **Lessons** button under the course title (on a wide screen the list is always on the left). Use **Add chapter** and **Add lesson** to build the course.",
            es: "Abre la lista de lecciones: toca el botón **Lessons** debajo del título del curso (en una pantalla ancha la lista está siempre a la izquierda). Usa **Add chapter** (añadir capítulo) y **Add lesson** (añadir lección) para construir el curso.",
          },
          shot: "lessons-edit",
        },
        {
          text: {
            en: "In each lesson, add a video under **Add a video** (tap **browse** to pick one from your phone or computer). For text, tap **Add notes** (**Edit notes** once the lesson has some), write, and tap **Save notes**. A video takes a few minutes to process after it uploads.",
            es: "En cada lección, añade un vídeo en **Add a video** (toca **browse** para elegirlo de tu móvil u ordenador). Para el texto, toca **Add notes** (**Edit notes** si la lección ya tiene), escribe y toca **Save notes**. El vídeo tarda unos minutos en procesarse después de subirlo.",
          },
          shot: "lesson-edit",
        },
        {
          text: {
            en: "Tap **Done editing** when you're finished.",
            es: "Toca **Done editing** cuando termines.",
          },
        },
      ],
    },
    {
      heading: { en: "Publish the course", es: "Publicar el curso" },
      steps: [
        {
          text: {
            en: "In the course, tap **Course settings**. Under **Who can see it**, choose **Published**, then tap **Save changes**. Every member now finds it in the Classroom.",
            es: "En el curso, toca **Course settings**. En **Who can see it**, elige **Published** y toca **Save changes**. Ahora todos tus miembros lo ven en el Classroom.",
          },
          shot: "course-settings",
        },
        {
          text: {
            en: "You can add a **Cover** image in the same place. A 3:2 image works best.",
            es: "Ahí mismo puedes añadir una imagen de portada en **Cover**. Lo mejor es una imagen en formato 3:2.",
          },
        },
      ],
    },
    {
      heading: { en: "Let visitors try a lesson for free", es: "Ofrecer una lección gratis a los visitantes" },
      intro: {
        en: "A free preview lesson can be watched by anyone, even before they join. It's the best way to show how you teach.",
        es: "Una lección de prueba gratis la puede ver cualquiera, incluso antes de unirse. Es la mejor forma de mostrar cómo enseñas.",
      },
      steps: [
        {
          text: {
            en: "In **Edit content**, open the lesson and tick **Free preview**.",
            es: "En **Edit content**, abre la lección y marca **Free preview**.",
          },
        },
        {
          text: {
            en: "Your About page now shows a **Watch free** button for that course. Use **Copy preview link** to share the lesson on Instagram or WhatsApp.",
            es: "Tu página About muestra ahora un botón **Watch free** en ese curso. Usa **Copy preview link** para compartir la lección en Instagram o WhatsApp.",
          },
        },
      ],
    },
    {
      heading: { en: "Choose the order of your courses", es: "Elegir el orden de tus cursos" },
      steps: [
        {
          text: {
            en: "In **Classroom**, use **Earlier** and **Later** on each course to move it. Members see your courses in this order in the Classroom, and visitors see the same order on your About page.",
            es: "En **Classroom**, usa **Earlier** (antes) y **Later** (después) en cada curso para moverlo. Tus miembros ven los cursos en este orden en el Classroom, y los visitantes ven el mismo orden en tu página About.",
          },
          shot: "course-order",
        },
      ],
      note: {
        en: "Until you move a course, the newest one comes first. Once you've set an order, new courses are added at the end.",
        es: "Mientras no muevas ningún curso, el más reciente aparece primero. Cuando eliges un orden, los cursos nuevos se añaden al final.",
      },
    },
  ],
  related: ["about-page", "getting-paid"],
};
