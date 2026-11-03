import type { HelpArticle } from "../types";

export const liveClasses: HelpArticle = {
  slug: "live-classes",
  category: "teaching",
  title: {
    en: "Schedule and teach live classes",
    es: "Programar y dar clases en directo",
  },
  summary: {
    en: "Schedule a class once or every week, start it from your phone or computer, and keep the recording for your members.",
    es: "Programa una clase única o semanal, empiézala desde el móvil o el ordenador y deja la grabación en el Classroom para volver a verla.",
  },
  sections: [
    {
      heading: { en: "Schedule a class", es: "Programar una clase" },
      steps: [
        {
          text: {
            en: "Go to **Calendar** and tap **Schedule class**.",
            es: "Ve a **Calendar** y toca **Schedule class**.",
          },
          shot: "calendar-owner",
        },
        {
          text: {
            en: "Fill in the **Class name**, **What you'll cover**, the **Date**, the **Start time** and the **Length**.",
            es: "Rellena **Class name** (nombre), **What you'll cover** (el contenido de la clase), **Date** (fecha), **Start time** (hora de inicio) y **Length** (duración).",
          },
          shot: "schedule-class",
        },
        {
          text: {
            en: "To teach every week, pick a **Repeat** option, for example every Tuesday for 4, 6 or 12 weeks.",
            es: "Para dar la clase cada semana, elige una opción en **Repeat**, por ejemplo cada martes durante 4, 6 o 12 semanas.",
          },
        },
        {
          text: {
            en: "**Record it** is on by default, so the recording goes to the Classroom. Turn it off if you don't want one, then tap **Schedule**. Your members get an email reminder about 30 minutes before the class.",
            es: "**Record it** viene activado, así que la grabación va al Classroom. Desactívalo si no quieres grabar la clase y toca **Schedule**. Tus miembros reciben un recordatorio por correo unos 30 minutos antes.",
          },
        },
      ],
    },
    {
      heading: { en: "Start the class", es: "Empezar la clase" },
      intro: {
        en: "From 15 minutes before the start, **Start class** appears on the class in the Calendar. (On your community page, the **Next live class** card shows **Join class**, which opens the same class.) Tap it, then **Join Live Class**, and allow the camera and microphone when your browser asks. Members join with **Join class**.",
        es: "Desde 15 minutos antes, aparece **Start class** en la clase, en el Calendar. (En la página de tu comunidad, la tarjeta **Next live class** muestra **Join class**, que abre la misma clase.) Tócalo, luego toca **Join Live Class** y permite el acceso a la cámara y al micrófono cuando el navegador lo pida. Tus miembros entran con **Join class**.",
      },
    },
    {
      heading: { en: "Change or cancel a class", es: "Cambiar o cancelar una clase" },
      intro: {
        en: "Tap a class in the Calendar to **Edit** it, **Repeat next week** or **Cancel class**.",
        es: "Toca una clase en el Calendar para editarla con **Edit**, repetirla con **Repeat next week** o cancelarla con **Cancel class**.",
      },
      shot: "class-details",
    },
    {
      heading: { en: "Share the recordings", es: "Compartir las grabaciones" },
      intro: {
        en: "A few minutes after a recorded class ends, the recording is added to **Live class replays** in the Classroom. At first only you can see it:",
        es: "Unos minutos después de que termine una clase grabada, la grabación aparece en **Live class replays**, en el Classroom. Al principio solo la ves tú:",
      },
      steps: [
        {
          text: {
            en: "In the Classroom, tap **See all** next to **Live class replays**.",
            es: "En el Classroom, toca **See all** junto a **Live class replays**.",
          },
        },
        {
          text: {
            en: "Tap **Course settings**, choose **Published** under **Who can see it**, and tap **Save changes**. From then on, members find every new recording there.",
            es: "Toca **Course settings**, elige **Published** en **Who can see it** y toca **Save changes**. Desde entonces, tus miembros encuentran ahí cada nueva grabación.",
          },
        },
      ],
    },
  ],
  related: ["courses", "private-lessons"],
};
