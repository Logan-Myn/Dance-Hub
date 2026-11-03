import type { HelpArticle } from "../types";

export const privateLessons: HelpArticle = {
  slug: "private-lessons",
  category: "teaching",
  title: {
    en: "Offer private lessons",
    es: "Ofrecer clases particulares",
  },
  summary: {
    en: "Create a lesson type with its price and cancellation policy, add the times students can book, and teach booked lessons by video.",
    es: "Crea un tipo de clase con su precio y su política de cancelación, añade las horas que se pueden reservar y da las clases reservadas por vídeo.",
  },
  sections: [
    {
      heading: { en: "Before you start", es: "Antes de empezar" },
      intro: {
        en: "Students pay for each lesson when they book it, so [set up payouts](getting-paid) first.",
        es: "Los alumnos pagan cada clase al reservarla, así que primero [configura los cobros](getting-paid).",
      },
    },
    {
      heading: { en: "Create a lesson type", es: "Crear un tipo de clase" },
      steps: [
        {
          text: {
            en: "Go to **Lessons** (**Private lessons** on a wide screen) and tap **Add lesson type**.",
            es: "Ve a **Lessons** (**Private lessons** en una pantalla ancha) y toca **Add lesson type**.",
          },
          shot: "lessons-owner",
        },
        {
          text: {
            en: "Give it a **Title** and a **Description**, and choose its **Length**. You can limit how many lessons of this type can be booked each month, across all students.",
            es: "Ponle un título en **Title**, una descripción en **Description** y elige la duración en **Length**. Puedes limitar cuántas clases de este tipo se reservan cada mes, entre todos los alumnos.",
          },
          shot: "lesson-type",
        },
        {
          text: {
            en: "Set the **Price (€)**, and optionally a lower **Member price (€)** for members of your community.",
            es: "Indica el precio en **Price (€)** y, si quieres, un precio más bajo para los miembros de tu comunidad en **Member price (€)**.",
          },
        },
        {
          text: {
            en: "Choose the **Cancellation cutoff**: until how long before the lesson a student who cancels gets a full refund. Under **Late cancellations**, choose what a later cancellation gets: **Full refund** or **No refund**. Then tap **Create Private Lesson**.",
            es: "Elige el plazo en **Cancellation cutoff**: hasta cuánto antes de la clase un alumno que cancela recupera todo el dinero. En **Late cancellations**, elige qué pasa si cancela más tarde: **Full refund** (reembolso completo) o **No refund** (sin reembolso). Luego toca **Create Private Lesson**.",
          },
        },
      ],
    },
    {
      heading: { en: "Add the times students can book", es: "Añadir las horas que se pueden reservar" },
      steps: [
        {
          text: {
            en: "Tap **Open times** and pick a day in the calendar.",
            es: "Toca **Open times** y elige un día en el calendario.",
          },
          shot: "open-times",
        },
        {
          text: {
            en: "Set **From** and **To**, then tap **Add slot**. Each slot is one lesson, booked at its **From** time, so for three lessons in an evening, add three slots.",
            es: "Indica **From** (desde) y **To** (hasta) y toca **Add slot**. Cada franja es una sola clase, que empieza a la hora de **From**: para tres clases en una tarde, añade tres franjas.",
          },
        },
      ],
      note: {
        en: "Open times use the time zone in your **Settings**. Students see them in their own time zone.",
        es: "Las horas usan la zona horaria de tus ajustes (**Settings**). Los alumnos las ven en su propia zona horaria.",
      },
    },
    {
      heading: { en: "Teach a booked lesson", es: "Dar una clase reservada" },
      intro: {
        en: "Booked lessons appear under **Bookings** and in your Calendar. From 15 minutes before the start, tap the booking, then **Join lesson**. On the next screen, tap **Join Lesson** to enter the video room. Your student joins the same way.",
        es: "Las clases reservadas aparecen en **Bookings** y en tu Calendar. Desde 15 minutos antes, toca la reserva y luego **Join lesson**. En la siguiente pantalla, toca **Join Lesson** para entrar en la sala de vídeo. Tu alumno entra de la misma forma.",
      },
    },
  ],
  related: ["live-classes", "getting-paid"],
};
