import { searchCommunities } from '@/lib/discovery';

const list = [
  { name: 'Bachata Online by Marcela', description: 'Improve your Bachata from home' },
  { name: 'The Salsa CLUB', description: 'Escuela de danza' },
  { name: 'Escuela online la yilla dance', description: null },
];

describe('searchCommunities', () => {
  it('keeps every community for an empty or blank search', () => {
    expect(searchCommunities(list, '')).toEqual(list);
    expect(searchCommunities(list, '   ')).toEqual(list);
  });

  it('matches the name or the description, ignoring case', () => {
    expect(searchCommunities(list, 'salsa').map((c) => c.name)).toEqual(['The Salsa CLUB']);
    expect(searchCommunities(list, 'ESCUELA').map((c) => c.name)).toEqual(['The Salsa CLUB', 'Escuela online la yilla dance']);
  });

  it('ignores accents on either side', () => {
    expect(searchCommunities(list, 'Escuéla de dánza').map((c) => c.name)).toEqual(['The Salsa CLUB']);
    expect(searchCommunities([{ name: 'Yillá', description: null }], 'yilla')).toHaveLength(1);
  });

  it('needs every word, in any order', () => {
    expect(searchCommunities(list, 'home bachata').map((c) => c.name)).toEqual(['Bachata Online by Marcela']);
    expect(searchCommunities(list, 'bachata salsa')).toEqual([]);
  });
});
