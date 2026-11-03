import type { HelpCategoryId, HelpLang, Localized } from "./types";

/** The words around the articles: titles, buttons and labels of the help pages. */
export const HELP_UI: Record<HelpLang, {
  helpCenter: string;
  heroTitle: string;
  heroText: string;
  searchLabel: string;
  searchPlaceholder: string;
  noResults: string;
  phone: string;
  desktop: string;
  screenshotsLabel: string;
  related: string;
  stuckTitle: string;
  stuckText: string;
  allArticles: string;
  language: string;
  appInEnglish: string;
  breadcrumb: string;
  found: (n: number) => string;
}> = {
  en: {
    helpCenter: "Help center",
    heroTitle: "How can we help?",
    heroText: "Guides for teachers running a community on Dance-Hub, step by step.",
    searchLabel: "Search the help center",
    searchPlaceholder: "Search, for example: free lesson",
    noResults: "No article matches that. Try another word, or write to us.",
    phone: "Phone",
    desktop: "Computer",
    screenshotsLabel: "Show screenshots for",
    related: "Related guides",
    stuckTitle: "Still stuck?",
    stuckText: "Write to us and we'll help you.",
    allArticles: "All guides",
    language: "Language",
    appInEnglish: "",
    breadcrumb: "Breadcrumb",
    found: (n) => (n === 1 ? "1 guide found" : `${n} guides found`),
  },
  es: {
    helpCenter: "Centro de ayuda",
    heroTitle: "¿En qué te ayudamos?",
    heroText: "Guías paso a paso para profesores que llevan una comunidad en Dance-Hub.",
    searchLabel: "Buscar en el centro de ayuda",
    searchPlaceholder: "Busca, por ejemplo: lección gratis",
    noResults: "Ninguna guía coincide. Prueba con otra palabra o escríbenos.",
    phone: "Móvil",
    desktop: "Ordenador",
    screenshotsLabel: "Mostrar capturas de",
    related: "Guías relacionadas",
    stuckTitle: "¿Sigues con dudas?",
    stuckText: "Escríbenos y te ayudamos.",
    allArticles: "Todas las guías",
    language: "Idioma",
    appInEnglish: "Dance-Hub está en inglés, así que los nombres de los botones aparecen en inglés, tal como los verás en la pantalla.",
    breadcrumb: "Ruta de navegación",
    found: (n) => (n === 1 ? "1 guía encontrada" : `${n} guías encontradas`),
  },
};

export const HELP_CATEGORIES: Array<{ id: HelpCategoryId; title: Localized; text: Localized }> = [
  {
    id: "setup",
    title: { en: "Set up your community", es: "Configura tu comunidad" },
    text: { en: "Who can join, and the basics of your community.", es: "Quién puede unirse y lo básico de tu comunidad." },
  },
  {
    id: "page",
    title: { en: "Your About page", es: "Tu página About" },
    text: { en: "The page visitors see before they join.", es: "La página que ven los visitantes antes de unirse." },
  },
  {
    id: "teaching",
    title: { en: "Courses and classes", es: "Cursos y clases" },
    text: { en: "Courses, lessons and what members learn.", es: "Cursos, lecciones y lo que aprenden tus miembros." },
  },
  {
    id: "community",
    title: { en: "Members and posts", es: "Miembros y publicaciones" },
    text: { en: "Your community feed, your members and emails to them.", es: "El muro de tu comunidad, tus miembros y los correos que les envías." },
  },
  {
    id: "money",
    title: { en: "Pricing and payouts", es: "Precios y cobros" },
    text: { en: "What members pay, and how you get paid.", es: "Lo que pagan tus miembros y cómo cobras." },
  },
];

export const HELP_CONTACT_EMAIL = "hello@dance-hub.io";
