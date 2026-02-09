import { HeroClass, Account, Server } from './types';
import { BAG_GRID_COLS, BAG_GRID_ROWS, BAG_SLOT_COUNT } from './containerLayout';

export const HERO_CLASSES: HeroClass[] = ['Savaşçı', 'Büyücü', 'Şifacı', 'Tüm Sınıflar'];

export const GENDER_OPTIONS = ['Erkek', 'Kadın', 'Tüm Cinsiyetler'];

export const CLASS_COLORS: Record<HeroClass, string> = {
  'Savaşçı': 'text-red-500',
  'Şifacı': 'text-green-500',
  'Büyücü': 'text-blue-500',
  'Tüm Sınıflar': 'text-gray-200'
};

export const CLASS_STRIP_COLORS: Record<HeroClass, string> = {
  'Savaşçı': 'bg-red-500',
  'Şifacı': 'bg-green-500',
  'Büyücü': 'bg-blue-500',
  'Tüm Sınıflar': 'bg-gray-400'
};

export const CATEGORY_COLORS: Record<string, string> = {
  'Silah': 'bg-red-900 border-red-700',
  'Ceket': 'bg-blue-900 border-blue-700',
  'Pantolon': 'bg-blue-800 border-blue-600',
  'Eldiven': 'bg-green-900 border-green-700',
  'Ayakkabı': 'bg-yellow-900 border-yellow-700',
  'Gözlük': 'bg-slate-700 border-slate-500',
  'Zırh': 'bg-indigo-900 border-indigo-700',
  'Yüzük': 'bg-purple-900 border-purple-700',
  'Kolye': 'bg-pink-900 border-pink-700',
  'Maden': 'bg-stone-700 border-stone-500',
  'İksir': 'bg-emerald-600 border-emerald-400',
  'Tılsım': 'bg-orange-800 border-orange-600',
  'Diğer': 'bg-gray-700 border-gray-500',
};

// Initial state generators
export const createEmptySlots = (count: number) => {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    item: null,
  }));
};

export const createCharacter = (id: number): any => ({
  id,
  name: `Karakter ${id + 1}`,
  // 8 rows x 8 cols = 64 slots (Square grid structure, but visual slots will be rectangular)
  bank1: { id: `char_${id}_bank1`, name: 'Kasa 1', rows: 8, cols: 8, slots: createEmptySlots(64) },
  bank2: { id: `char_${id}_bank2`, name: 'Kasa 2', rows: 8, cols: 8, slots: createEmptySlots(64) },
  // 33 slots: base 24 (4x6) + top extension 9 (3/4/2)
  bag: { id: `char_${id}_bag`, name: 'Çanta', rows: BAG_GRID_ROWS, cols: BAG_GRID_COLS, slots: createEmptySlots(BAG_SLOT_COUNT) },
  learnedRecipes: [], // Start with empty recipe book
});

export const SERVER_NAMES = ['Eminönü', 'Galata', 'Bab-ı Ali', 'Beyaz Köşk', 'Meran', 'Karaköy'];

export const SET_CATEGORIES = ['Silah', 'Ceket', 'Pantolon', 'Eldiven', 'Ayakkabı', 'Zırh', 'Yüzük', 'Kolye'];

export const createServer = (id: string, name: string): Server => ({
  id,
  name,
  characters: Array.from({ length: 4 }, (_, i) => createCharacter(i)),
});

export const createAccount = (id: string, name: string): Account => ({
  id,
  name,
  servers: SERVER_NAMES.map((serverName, idx) => createServer(`${id}_server_${idx}`, serverName)),
});
