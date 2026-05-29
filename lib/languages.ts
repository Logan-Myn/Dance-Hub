export interface LanguageOption {
  code: string; // BCP-47
  label: string;
}

export const AUDIO_LANGUAGES: LanguageOption[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'ru', label: 'Русский' },
];

export function languageLabel(code: string): string {
  return AUDIO_LANGUAGES.find((l) => l.code === code)?.label ?? code;
}
