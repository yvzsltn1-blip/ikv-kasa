export type ItemType = 'Item' | 'Recipe';

export enum ItemCategory {
  Weapon = 'Silah',
  Jacket = 'Ceket',
  Pants = 'Pantolon',
  Gloves = 'Eldiven',
  Shoes = 'Ayakkabı',
  Armor = 'Zırh',
  Ring = 'Yüzük',
  Necklace = 'Kolye',
  Mine = 'Maden',
  Potion = 'İksir',
  Talisman = 'Tılsım',
  Glasses = 'Gözlük',
  Other = 'Diğer'
}

export const CATEGORY_OPTIONS = [
  'Silah', 'Ceket', 'Pantolon', 'Eldiven', 'Ayakkabı',
  'Gözlük', 'Zırh', 'Yüzük', 'Kolye', 'Maden', 'İksir', 'Tılsım', 'Diğer'
];

export type HeroClass = 'Savaşçı' | 'Şifacı' | 'Büyücü' | 'Tüm Sınıflar';

export type Gender = 'Erkek' | 'Kadın' | 'Tüm Cinsiyetler';

export type UserRole = 'admin' | 'user' | null;

export interface ItemData {
  id: string;
  type: ItemType;
  category: string;
  enchantment1: string;
  enchantment2: string;
  heroClass: HeroClass;
  gender: Gender;
  level: number;
  isRead?: boolean; // New property to track read status during creation
  count?: number; // New property for item quantity (stack size)
  weaponType?: string; // New property specifically for Weapon category
  isGlobal?: boolean; // Whether this item is visible in global search
}

export interface SlotData {
  id: number; // 0 to 63 or 0 to 23
  item: ItemData | null;
}

export interface Container {
  id: string;
  name: string;
  rows: number;
  cols: number;
  slots: SlotData[];
}

export interface Character {
  id: number;
  name: string;
  bank1: Container;
  bank2: Container;
  bag: Container;
  learnedRecipes: ItemData[]; // New field for read recipes
}

export interface Server {
  id: string;
  name: string;
  characters: Character[];
}

export interface Account {
  id: string;
  name: string;
  servers: Server[];
}

export interface SetItemLocation {
  accountName: string;
  serverName: string;
  charName: string;
  containerName: string;
  row: number;
  col: number;
  category: string;
  item: ItemData;
}

export interface GlobalSetInfo {
  count: number;
  categories: Set<string>;
}

export interface AdminUserInfo {
  uid: string;
  email: string;
  username: string | null;
  socialLink: string;
  accountCount: number;
  totalItemCount: number;
  totalRecipeCount: number;
  createdAt?: number;
  accounts: Account[];
}

export interface SearchLimitsConfig {
  defaultLimit: number;
  userOverrides: Record<string, number>;
}