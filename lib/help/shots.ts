import type { Localized } from "./types";
import manifest from "./shots.json";

// Screenshots for the articles, one per id, each taken on a phone and on a
// computer by scripts/help-screenshots/capture.mjs, which also writes
// shots.json (the size of every image it saved).

export type HelpDevice = "phone" | "desktop";

/** Remembers a visitor's Phone / Computer choice (components/help/help-device.tsx). */
export const HELP_DEVICE_COOKIE = "help-device";

/** The screenshots to render: the saved choice, else a guess from the browser. */
export function initialHelpDevice(saved: string | undefined, userAgent: string | null): HelpDevice {
  if (saved === "phone" || saved === "desktop") return saved;
  return /Mobi|iPhone|Android.+Mobile/i.test(userAgent ?? "") ? "phone" : "desktop";
}

export const HELP_SHOT_ALT: Record<string, Localized> = {
  "open-admin": { en: "Where to open Admin", es: "Dónde abrir Admin" },
  "who-can-join": { en: "The Who can join setting in Community details", es: "El ajuste Who can join en Community details" },
  "about-closed": { en: "An About page closed to new members", es: "Una página About cerrada a nuevos miembros" },
  "about-owner": { en: "The About page with the Page checklist", es: "La página About con la lista Page checklist" },
  "about-edit": { en: "The About page in edit mode", es: "La página About en modo edición" },
  "add-block": { en: "The Add block window", es: "La ventana Add block" },
  "about-visitor": { en: "The About page as a visitor sees it", es: "La página About tal como la ve un visitante" },
  "classroom-owner": { en: "The Classroom with the Create course button", es: "El Classroom con el botón Create course" },
  "create-course": { en: "The Create course window", es: "La ventana Create course" },
  "lessons-edit": { en: "The list of chapters and lessons while editing", es: "La lista de capítulos y lecciones al editar" },
  "lesson-edit": { en: "A lesson while editing, with Free preview", es: "Una lección al editar, con Free preview" },
  "course-settings": { en: "Course settings with Private draft and Published", es: "Course settings con Private draft y Published" },
  "course-order": { en: "The Earlier and Later buttons on a course", es: "Los botones Earlier y Later de un curso" },
  "payouts": { en: "The Payouts section with Set up payouts", es: "La sección Payouts con Set up payouts" },
  "pricing": { en: "The Membership price section", es: "La sección Membership price" },
  "onboarding": { en: "The Create your community form", es: "El formulario Create your community" },
  "offerings": { en: "The Offerings page with its switches", es: "La página Offerings con sus interruptores" },
  "admin-overview": { en: "The Admin overview with Community setup", es: "El resumen de Admin con Community setup" },
  "calendar-owner": { en: "The Calendar with the Schedule class button", es: "El Calendar con el botón Schedule class" },
  "schedule-class": { en: "The Schedule a class window", es: "La ventana Schedule a class" },
  "class-details": { en: "A class's details, with Edit and Cancel class", es: "Los detalles de una clase, con Edit y Cancel class" },
  "lessons-owner": { en: "The private lessons page with Add lesson type", es: "La página de clases particulares con Add lesson type" },
  "lesson-type": { en: "The Add a lesson type window", es: "La ventana Add a lesson type" },
  "open-times": { en: "The Open times calendar", es: "El calendario Open times" },
  "feed-composer": { en: "Writing a post in the community", es: "Escribiendo una publicación en la comunidad" },
  "post-topics": { en: "The Post topics page", es: "La página Post topics" },
  "members": { en: "The list of members", es: "La lista de miembros" },
  "new-email": { en: "Writing an email to members", es: "Escribiendo un correo a los miembros" },
  "promo-codes": { en: "The Create a code form", es: "El formulario Create a code" },
  "toolbar-names": { en: "A toolbar button showing its name", es: "Un botón de la barra que muestra su nombre" },
};

type Size = [number, number];
// JSON types [w, h] as number[]; the capture script always writes pairs.
const { scale: SCALE, shots: SIZES } = manifest as unknown as {
  /** Pixels per CSS pixel of each device's captures, to show every image at its real size at most. */
  scale: Record<HelpDevice, number>;
  shots: Record<string, Partial<Record<HelpDevice, Size>>>;
};

/** The image to show for a device, or the other device's when only one was taken. */
export function helpShot(
  id: string,
  device: HelpDevice
): { src: string; width: number; height: number; device: HelpDevice; cssWidth: number } | null {
  const sizes = SIZES[id];
  if (!sizes) return null;
  const use: HelpDevice | null = sizes[device] ? device : sizes.phone ? "phone" : sizes.desktop ? "desktop" : null;
  if (!use) return null;
  const [width, height] = sizes[use]!;
  return { src: `/help/shots/${use}/${id}.webp`, width, height, device: use, cssWidth: Math.round(width / SCALE[use]) };
}
