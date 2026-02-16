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

export type UserClass = 'user' | 'premium' | 'pro';
export const USER_CLASS_KEYS: UserClass[] = ['user', 'premium', 'pro'];

export interface UserClassQuota {
  label: string;
  dailyMessageLimit: number;
  dailyGlobalSearchLimit: number;
}

export const DEFAULT_USER_CLASS: UserClass = 'user';

export const USER_CLASS_QUOTAS: Record<UserClass, UserClassQuota> = {
  user: {
    label: 'Kullanici',
    dailyMessageLimit: 5,
    dailyGlobalSearchLimit: 5,
  },
  premium: {
    label: 'Premium',
    dailyMessageLimit: 20,
    dailyGlobalSearchLimit: 20,
  },
  pro: {
    label: 'Pro',
    dailyMessageLimit: 50,
    dailyGlobalSearchLimit: 50,
  },
};

const toPositiveLimit = (value: unknown, fallback: number) => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return fallback;
};

export const resolveUserClassQuotas = (raw: unknown): Record<UserClass, UserClassQuota> => {
  const source = (raw && typeof raw === 'object')
    ? raw as Partial<Record<UserClass, Partial<UserClassQuota>>>
    : {};

  return {
    user: {
      label: USER_CLASS_QUOTAS.user.label,
      dailyMessageLimit: toPositiveLimit(source.user?.dailyMessageLimit, USER_CLASS_QUOTAS.user.dailyMessageLimit),
      dailyGlobalSearchLimit: toPositiveLimit(source.user?.dailyGlobalSearchLimit, USER_CLASS_QUOTAS.user.dailyGlobalSearchLimit),
    },
    premium: {
      label: USER_CLASS_QUOTAS.premium.label,
      dailyMessageLimit: toPositiveLimit(source.premium?.dailyMessageLimit, USER_CLASS_QUOTAS.premium.dailyMessageLimit),
      dailyGlobalSearchLimit: toPositiveLimit(source.premium?.dailyGlobalSearchLimit, USER_CLASS_QUOTAS.premium.dailyGlobalSearchLimit),
    },
    pro: {
      label: USER_CLASS_QUOTAS.pro.label,
      dailyMessageLimit: toPositiveLimit(source.pro?.dailyMessageLimit, USER_CLASS_QUOTAS.pro.dailyMessageLimit),
      dailyGlobalSearchLimit: toPositiveLimit(source.pro?.dailyGlobalSearchLimit, USER_CLASS_QUOTAS.pro.dailyGlobalSearchLimit),
    },
  };
};

export const normalizeUserClass = (raw: unknown): UserClass => {
  if (raw === 'user' || raw === 'premium' || raw === 'pro') return raw;
  return DEFAULT_USER_CLASS;
};

export interface ItemData {
  id: string;
  type: ItemType;
  category: string;
  enchantment1: string;
  enchantment2: string;
  talismanTier?: '-' | 'I' | 'II' | 'III';
  heroClass: HeroClass;
  gender: Gender;
  level: number;
  isRead?: boolean; // New property to track read status during creation
  count?: number; // New property for item quantity (stack size)
  weaponType?: string; // New property specifically for Weapon category
  isGlobal?: boolean; // Whether this item is visible in global search
  isBound?: boolean; // Whether item is character-bound
}

export const BINDABLE_CATEGORIES = [
  'Silah',
  'Ceket',
  'Pantolon',
  'Eldiven',
  'Ayakkabı',
  'Zırh',
  'Yüzük',
  'Kolye',
] as const;

export const isBindableCategory = (category: string): boolean => {
  return BINDABLE_CATEGORIES.includes(category as (typeof BINDABLE_CATEGORIES)[number]);
};

export const shouldShowBoundMarker = (
  item: Pick<ItemData, 'type' | 'category' | 'isBound'> | null | undefined
): boolean => {
  if (!item) return false;
  return item.type === 'Item' && isBindableCategory(item.category) && item.isBound === true;
};

const normalizeSetEnchantmentToken = (value: unknown): string => (
  String(value ?? '').trim().toLocaleLowerCase('tr')
);

export const createSetEnchantmentKey = (enchantment1: unknown, enchantment2: unknown): string => {
  const normalized = [
    normalizeSetEnchantmentToken(enchantment1),
    normalizeSetEnchantmentToken(enchantment2),
  ];

  normalized.sort((a, b) => a.localeCompare(b, 'tr'));
  return `${normalized[0]}|${normalized[1]}`;
};

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

export interface UserPermissions {
  canDataEntry: boolean;
  canGlobalSearch: boolean;
}

export interface UserMessageSettings {
  dailySendLimit: number;
}

export type BlockContactTemplateId =
  | 'appeal_review'
  | 'appeal_mistake'
  | 'request_contact';

export interface UserBlockInfo {
  isBlocked: boolean;
  reasonCode?: string;
  reasonLabel?: string;
  blockedAt?: number;
  blockedByUid?: string;
}

export type UserAccessStatus = 'approved' | 'pending';

export const normalizeUserAccessStatus = (raw: unknown): UserAccessStatus => {
  if (raw === 'pending') return 'pending';
  return 'approved';
};

export interface MessageQuotaEntry {
  day: string;
  used: number;
  updatedAt?: number;
}

export interface UserMessageQuota {
  direct?: MessageQuotaEntry;
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
  permissions: UserPermissions;
  userClass: UserClass;
  blockInfo: UserBlockInfo;
  accessStatus: UserAccessStatus;
  approvalRequestedAt?: number;
  approvedAt?: number;
  approvedByUid?: string;
}

export interface SearchLimitsConfig {
  defaultLimit: number;
  userOverrides: Record<string, number>;
  classLimits: Record<UserClass, UserClassQuota>;
}
