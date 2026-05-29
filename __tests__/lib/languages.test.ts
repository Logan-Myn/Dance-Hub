import { AUDIO_LANGUAGES, languageLabel } from '@/lib/languages';

describe('languageLabel', () => {
  it('returns the display label for a known code', () => {
    expect(languageLabel('es')).toBe('Español');
    expect(languageLabel('en')).toBe('English');
  });

  it('falls back to the code when unknown', () => {
    expect(languageLabel('zz')).toBe('zz');
  });

  it('has unique language codes', () => {
    const codes = AUDIO_LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
