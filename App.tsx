import React, { useState, useEffect, useMemo } from 'react';
import { Account, Container, ItemData, UserRole, SetItemLocation, GlobalSetInfo, UserPermissions, CATEGORY_OPTIONS, UserBlockInfo, BlockContactTemplateId, HeroClass, DEFAULT_USER_CLASS, normalizeUserClass, isBindableCategory, shouldShowBoundMarker, createSetEnchantmentKey, UserAccessStatus, normalizeUserAccessStatus } from './types';
import { createAccount, createCharacter, CLASS_COLORS, SERVER_NAMES, SET_CATEGORIES, HERO_CLASSES, GENDER_OPTIONS } from './constants';
import { BAG_SLOT_COUNT, getContainerSlotIdFromPosition, getContainerSlotPosition, normalizeBagContainerLayout } from './containerLayout';
import { ContainerGrid } from './components/ContainerGrid';
import { ItemModal } from './components/ItemModal';
import { ItemDetailModal } from './components/ItemDetailModal';
import { GlobalSearchModal } from './components/GlobalSearchModal';
import { RecipeBookModal } from './components/RecipeBookModal';
import { InventorySummaryModal } from './components/InventorySummaryModal';
import { LoginScreen } from './components/LoginScreen';
import { User, Save, Plus, Trash2, ChevronDown, ChevronUp, FileSpreadsheet, Edit3, Shield, Search, Book, LogOut, CheckCircle, XCircle, Globe, AtSign, Check, AlertTriangle, Link2, Crown, Lock, MessageCircle, MoreVertical, Upload, Copy, Clipboard, X, Package } from 'lucide-react';
import { AdminPanel } from './components/AdminPanel';
import { MessagingModal } from './components/MessagingModal';

// --- XLSX ---
import * as XLSX from 'xlsx';

// --- FIREBASE IMPORTLARI ---
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc, runTransaction, collection, query, where, getDocs, updateDoc, onSnapshot, arrayUnion } from 'firebase/firestore';

// View sequence
const VIEW_ORDER = ['bank1', 'bank2', 'bag'] as const;
type ViewType = typeof VIEW_ORDER[number];

const normalizeContainerSlots = (rawSlots: unknown, minCount: number) => {
  const slots = Array.isArray(rawSlots) ? rawSlots : [];
  const count = Math.max(minCount, slots.length);
  return Array.from({ length: count }, (_, index) => {
    const slot = slots[index] as { item?: unknown } | undefined;
    return {
      id: index,
      item: (slot && typeof slot === 'object' && 'item' in slot) ? (slot.item as ItemData | null) ?? null : null,
    };
  });
};

const normalizeStandardContainer = (rawContainer: unknown, fallback: Container): Container => {
  const container = (rawContainer && typeof rawContainer === 'object') ? rawContainer as Partial<Container> : {};
  return {
    id: typeof container.id === 'string' ? container.id : fallback.id,
    name: typeof container.name === 'string' ? container.name : fallback.name,
    rows: (typeof container.rows === 'number' && Number.isFinite(container.rows) && container.rows > 0)
      ? Math.floor(container.rows)
      : fallback.rows,
    cols: (typeof container.cols === 'number' && Number.isFinite(container.cols) && container.cols > 0)
      ? Math.floor(container.cols)
      : fallback.cols,
    slots: normalizeContainerSlots(container.slots, fallback.slots.length),
  };
};

const normalizeBagContainer = (rawContainer: unknown, fallback: Container): Container => {
  const container = (rawContainer && typeof rawContainer === 'object') ? rawContainer as Partial<Container> : {};
  return normalizeBagContainerLayout({
    id: typeof container.id === 'string' ? container.id : fallback.id,
    name: typeof container.name === 'string' ? container.name : fallback.name,
    rows: fallback.rows,
    cols: fallback.cols,
    slots: normalizeContainerSlots(container.slots, BAG_SLOT_COUNT),
  });
};

const normalizeCharacterData = (rawChar: unknown, charIndex: number) => {
  const fallback = createCharacter(charIndex);
  const char = (rawChar && typeof rawChar === 'object') ? rawChar as Partial<ReturnType<typeof createCharacter>> : {};

  return {
    ...fallback,
    ...char,
    id: typeof char.id === 'number' ? char.id : fallback.id,
    name: typeof char.name === 'string' ? char.name : fallback.name,
    bank1: normalizeStandardContainer(char.bank1, fallback.bank1),
    bank2: normalizeStandardContainer(char.bank2, fallback.bank2),
    bag: normalizeBagContainer(char.bag, fallback.bag),
    learnedRecipes: Array.isArray(char.learnedRecipes) ? char.learnedRecipes : [],
  };
};

// Migration + normalization helper for old/new account formats.
const migrateAccount = (acc: any): Account => {
  const accountId = typeof acc?.id === 'string' ? acc.id : crypto.randomUUID();
  const accountName = typeof acc?.name === 'string' ? acc.name : 'Hesap';
  const normalizeChars = (chars: unknown[]) => chars.map((char, idx) => normalizeCharacterData(char, idx));

  if (Array.isArray(acc?.servers) && acc.servers.length > 0) {
    return {
      id: accountId,
      name: accountName,
      servers: acc.servers.map((server: any, idx: number) => {
        const fallbackCharacters = Array.from({ length: 4 }, (_, i) => createCharacter(i));
        const rawChars = Array.isArray(server?.characters) && server.characters.length > 0
          ? server.characters
          : fallbackCharacters;
        return {
          id: typeof server?.id === 'string' ? server.id : `${accountId}_server_${idx}`,
          name: typeof server?.name === 'string' ? server.name : (SERVER_NAMES[idx] || `Sunucu ${idx + 1}`),
          characters: normalizeChars(rawChars),
        };
      }),
    };
  }

  const oldChars = Array.isArray(acc?.characters) && acc.characters.length > 0
    ? acc.characters
    : Array.from({ length: 4 }, (_, i) => createCharacter(i));

  return {
    id: accountId,
    name: accountName,
    servers: SERVER_NAMES.map((serverName, idx) => ({
      id: `${accountId}_server_${idx}`,
      name: serverName,
      characters: idx === 0
        ? normalizeChars(oldChars)
        : Array.from({ length: 4 }, (_, i) => normalizeCharacterData(createCharacter(i), i)),
    })),
  };
};

const DEFAULT_USER_PERMISSIONS: UserPermissions = {
  canDataEntry: true,
  canGlobalSearch: true,
};

const DEFAULT_MESSAGE_SETTINGS = {
  dailySendLimit: 5,
};

const DEFAULT_USER_BLOCK_INFO: UserBlockInfo = {
  isBlocked: false,
};

type BlockedContactTemplate = {
  id: BlockContactTemplateId;
  label: string;
  message: string;
};

const BLOCKED_CONTACT_TEMPLATES: BlockedContactTemplate[] = [
  {
    id: 'appeal_review',
    label: 'Hesabimin tekrar incelenmesini talep ediyorum.',
    message: 'Merhaba, hesabimin engel durumunun tekrar incelenmesini talep ediyorum.',
  },
  {
    id: 'appeal_mistake',
    label: 'Yanlis anlasilma olabilecegini dusunuyorum.',
    message: 'Merhaba, hesabimin yanlis anlasilma nedeniyle engellenmis olabilecegini dusunuyorum. Kontrol eder misiniz?',
  },
  {
    id: 'request_contact',
    label: 'Yonetici ile iletisim kurmak istiyorum.',
    message: 'Merhaba, engel sebebini ogrenmek ve gerekli duzeltmeyi yapmak icin yonetici ile iletisim kurmak istiyorum.',
  },
];

const normalizeUserPermissions = (raw: unknown): UserPermissions => {
  const fromDoc = (raw && typeof raw === 'object') ? raw as Partial<UserPermissions> : {};
  return {
    canDataEntry: typeof fromDoc.canDataEntry === 'boolean' ? fromDoc.canDataEntry : true,
    canGlobalSearch: typeof fromDoc.canGlobalSearch === 'boolean' ? fromDoc.canGlobalSearch : true,
  };
};

const normalizeMessageSettings = (raw: unknown) => {
  const fromDoc = (raw && typeof raw === 'object') ? raw as { dailySendLimit?: unknown } : {};
  const limit = fromDoc.dailySendLimit;
  return {
    dailySendLimit: (typeof limit === 'number' && Number.isFinite(limit) && limit > 0)
      ? Math.floor(limit)
      : DEFAULT_MESSAGE_SETTINGS.dailySendLimit,
  };
};

const normalizeUserBlockInfo = (raw: unknown): UserBlockInfo => {
  const fromDoc = (raw && typeof raw === 'object') ? raw as Partial<UserBlockInfo> : {};
  return {
    isBlocked: fromDoc.isBlocked === true,
    reasonCode: typeof fromDoc.reasonCode === 'string' ? fromDoc.reasonCode : undefined,
    reasonLabel: typeof fromDoc.reasonLabel === 'string' ? fromDoc.reasonLabel : undefined,
    blockedAt: (typeof fromDoc.blockedAt === 'number' && Number.isFinite(fromDoc.blockedAt) && fromDoc.blockedAt > 0)
      ? fromDoc.blockedAt
      : undefined,
    blockedByUid: typeof fromDoc.blockedByUid === 'string' ? fromDoc.blockedByUid : undefined,
  };
};

const stripUndefinedDeep = <T,>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map(item => stripUndefinedDeep(item)) as T;
  }

  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, val]) => {
      if (val === undefined) return;
      out[key] = stripUndefinedDeep(val);
    });
    return out as T;
  }

  return value;
};

type AccessAlert = {
  kind: 'dataEntry' | 'globalSearch';
  title: string;
  message: string;
  hint?: string;
};

type SystemAlert = {
  tone: 'error' | 'warning' | 'info';
  title: string;
  message: string;
  hint?: string;
};

type NamedLevelSuggestion = {
  name: string;
  level: number;
};
type TalismanColorSuggestion = 'Mavi' | 'Kırmızı';
type TalismanTierSuggestion = '-' | 'I' | 'II' | 'III';
type TalismanHeroClassSuggestion = Exclude<HeroClass, 'Tüm Sınıflar'>;
type TalismanRuleSuggestion = {
  name: string;
  color: TalismanColorSuggestion;
  heroClass: TalismanHeroClassSuggestion;
};

const normalizeSuggestionName = (value: unknown) => String(value ?? '').trim();
const normalizeSuggestionLevel = (value: unknown, fallback = 1) => {
  const parsed = parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(59, Math.max(1, parsed));
};

const parseNamedLevelSuggestion = (rawName: unknown, rawLevel: unknown): NamedLevelSuggestion | null => {
  const normalizedName = normalizeSuggestionName(rawName);
  if (!normalizedName) return null;

  const embeddedLevelMatch = normalizedName.match(/^(.+?)\s*[:;]\s*(\d+)$/);
  if (embeddedLevelMatch) {
    const embeddedName = normalizeSuggestionName(embeddedLevelMatch[1]);
    if (embeddedName) {
      return {
        name: embeddedName,
        level: normalizeSuggestionLevel(embeddedLevelMatch[2], 1),
      };
    }
  }

  return {
    name: normalizedName,
    level: normalizeSuggestionLevel(rawLevel, 1),
  };
};

const toUniqueSortedNames = (raw: unknown): string[] => {
  const names = Array.isArray(raw) ? raw : [];
  const byKey = new Map<string, string>();
  names.forEach(value => {
    if (typeof value !== 'string') return;
    const normalized = normalizeSuggestionName(value);
    if (!normalized) return;
    byKey.set(normalized.toLocaleLowerCase('tr'), normalized);
  });
  return [...byKey.values()].sort((a, b) => a.toLocaleLowerCase('tr').localeCompare(b.toLocaleLowerCase('tr'), 'tr'));
};

const toUniqueSortedNamedLevels = (raw: unknown): NamedLevelSuggestion[] => {
  const values = Array.isArray(raw) ? raw : [];
  const byKey = new Map<string, NamedLevelSuggestion>();
  values.forEach(value => {
    if (!value || typeof value !== 'object') return;
    const item = value as { name?: unknown; level?: unknown };
    const parsed = parseNamedLevelSuggestion(item.name, item.level);
    if (!parsed) return;
    byKey.set(parsed.name.toLocaleLowerCase('tr'), parsed);
  });
  return [...byKey.values()].sort((a, b) => a.name.toLocaleLowerCase('tr').localeCompare(b.name.toLocaleLowerCase('tr'), 'tr'));
};

const toPotionNamedLevelSuggestions = (rawDocData: unknown): NamedLevelSuggestion[] => {
  if (!rawDocData || typeof rawDocData !== 'object') return [];
  const data = rawDocData as { entries?: unknown; names?: unknown };

  const entries = toUniqueSortedNamedLevels(data.entries);
  if (entries.length > 0) return entries;

  const names = Array.isArray(data.names)
    ? data.names.filter((value): value is string => typeof value === 'string')
    : [];
  return toUniqueSortedNamedLevels(names.map(name => ({ name, level: 1 })));
};

const TALISMAN_CLASS_ORDER: TalismanHeroClassSuggestion[] = ['Savaşçı', 'Büyücü', 'Şifacı'];

const normalizeLookupToken = (value: unknown) => (
  String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
);

const normalizeTalismanColorSuggestion = (value: unknown): TalismanColorSuggestion | null => {
  const token = normalizeLookupToken(value);
  if (token === 'mavi') return 'Mavi';
  if (token === 'kirmizi') return 'Kırmızı';
  return null;
};
const normalizeTalismanTierSuggestion = (value: unknown): TalismanTierSuggestion | null => {
  const raw = String(value ?? '').trim().toUpperCase();
  if (raw === '-') return '-';
  if (raw === 'I' || raw === 'II' || raw === 'III') return raw as TalismanTierSuggestion;
  if (raw === '1') return 'I';
  if (raw === '2') return 'II';
  if (raw === '3') return 'III';
  return null;
};
const resolveItemTalismanTier = (item: Pick<ItemData, 'talismanTier' | 'enchantment2'>): TalismanTierSuggestion => (
  normalizeTalismanTierSuggestion(item.talismanTier)
  || normalizeTalismanTierSuggestion(item.enchantment2)
  || '-'
);
const resolveItemTalismanColor = (item: Pick<ItemData, 'enchantment2'>): TalismanColorSuggestion => (
  normalizeTalismanColorSuggestion(item.enchantment2) || 'Mavi'
);

const normalizeTalismanHeroClassSuggestion = (value: unknown): TalismanHeroClassSuggestion | null => {
  const token = normalizeLookupToken(value);
  if (token === 'savasci') return 'Savaşçı';
  if (token === 'buyucu') return 'Büyücü';
  if (token === 'sifaci') return 'Şifacı';
  return null;
};

const toUniqueSortedTalismanRules = (raw: unknown): TalismanRuleSuggestion[] => {
  const values = Array.isArray(raw) ? raw : [];
  const byKey = new Map<string, TalismanRuleSuggestion>();
  values.forEach(value => {
    if (!value || typeof value !== 'object') return;
    const item = value as { name?: unknown; color?: unknown; heroClass?: unknown; class?: unknown };
    const name = normalizeSuggestionName(item.name);
    const color = normalizeTalismanColorSuggestion(item.color);
    const heroClass = normalizeTalismanHeroClassSuggestion(item.heroClass ?? item.class);
    if (!name || !color || !heroClass) return;
    const key = `${name.toLocaleLowerCase('tr')}|${color}|${heroClass}`;
    byKey.set(key, { name, color, heroClass });
  });

  return [...byKey.values()].sort((a, b) => {
    const nameCompare = a.name.toLocaleLowerCase('tr').localeCompare(b.name.toLocaleLowerCase('tr'), 'tr');
    if (nameCompare !== 0) return nameCompare;
    const classCompare = TALISMAN_CLASS_ORDER.indexOf(a.heroClass) - TALISMAN_CLASS_ORDER.indexOf(b.heroClass);
    if (classCompare !== 0) return classCompare;
    if (a.color === b.color) return 0;
    return a.color === 'Mavi' ? -1 : 1;
  });
};

const toTalismanAutocompleteData = (rawDocData: unknown): { names: string[]; rules: TalismanRuleSuggestion[] } => {
  if (!rawDocData || typeof rawDocData !== 'object') return { names: [], rules: [] };
  const data = rawDocData as { entries?: unknown; names?: unknown };
  const rules = toUniqueSortedTalismanRules(data.entries);
  if (rules.length > 0) {
    const names = toUniqueSortedNames(rules.map(rule => rule.name));
    return { names, rules };
  }
  return { names: toUniqueSortedNames(data.names), rules: [] };
};

export default function App() {
  // --- Auth & Loading State ---
  const [userRole, setUserRole] = useState<UserRole>(null);
  const [userAccessStatus, setUserAccessStatus] = useState<UserAccessStatus>('approved');
  const [userPermissions, setUserPermissions] = useState<UserPermissions>(DEFAULT_USER_PERMISSIONS);
  const [userBlockInfo, setUserBlockInfo] = useState<UserBlockInfo>(DEFAULT_USER_BLOCK_INFO);
  const [loading, setLoading] = useState(true);

  // Global State
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedServerIndex, setSelectedServerIndex] = useState(0);

  // Username State
  const [username, setUsername] = useState<string | null>(null);
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [usernameLoading, setUsernameLoading] = useState(false);

  // Social Link State
  const [socialLink, setSocialLink] = useState<string>('');
  const [showSocialLinkModal, setShowSocialLinkModal] = useState(false);
  const [socialLinkInput, setSocialLinkInput] = useState('');
  const [socialLinkSaving, setSocialLinkSaving] = useState(false);

  // App-wide limits (fetched from metadata/searchLimits)
  const [maxAccounts, setMaxAccounts] = useState(10);

  // Global Enchantment Suggestions
  const [globalEnchantments, setGlobalEnchantments] = useState<string[]>([]);
  const [globalPotions, setGlobalPotions] = useState<NamedLevelSuggestion[]>([]);
  const [globalMines, setGlobalMines] = useState<NamedLevelSuggestion[]>([]);
  const [globalOthers, setGlobalOthers] = useState<NamedLevelSuggestion[]>([]);
  const [globalGlasses, setGlobalGlasses] = useState<NamedLevelSuggestion[]>([]);
  const [globalTalismans, setGlobalTalismans] = useState<string[]>([]);
  const [globalTalismanRules, setGlobalTalismanRules] = useState<TalismanRuleSuggestion[]>([]);
  const [globalWeaponTypes, setGlobalWeaponTypes] = useState<string[]>([]);

  // UI State
  const [activeCharIndex, setActiveCharIndex] = useState(0);
  const [currentViewIndex, setCurrentViewIndex] = useState(0);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isRecipeBookOpen, setIsRecipeBookOpen] = useState(false);
  const [isInventorySummaryOpen, setIsInventorySummaryOpen] = useState(false);
  const [isMessagingOpen, setIsMessagingOpen] = useState(false);
  const [unreadMessageSenderCount, setUnreadMessageSenderCount] = useState(0);
  const [unreadAdminNotificationCount, setUnreadAdminNotificationCount] = useState(0);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [isContainerFullscreen, setIsContainerFullscreen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<'All' | string>('All');
  const [isMobileCategoryFilterOpen, setIsMobileCategoryFilterOpen] = useState(false);
  const [isMobileAccountMenuOpen, setIsMobileAccountMenuOpen] = useState(false);
  const [isMobileAccountActionsOpen, setIsMobileAccountActionsOpen] = useState(false);
  const [isMobileQuickMenuOpen, setIsMobileQuickMenuOpen] = useState(false);
  const [isImportingExcel, setIsImportingExcel] = useState(false);
  const mobileAccountMenuRef = React.useRef<HTMLDivElement | null>(null);
  const mobileAccountActionsRef = React.useRef<HTMLDivElement | null>(null);
  const mobileQuickMenuRef = React.useRef<HTMLDivElement | null>(null);
  const excelImportInputRef = React.useRef<HTMLInputElement | null>(null);

  // Input State (Temporary states for name editing)
  const [tempAccountName, setTempAccountName] = useState('');
  const [tempCharName, setTempCharName] = useState('');

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [activeSlot, setActiveSlot] = useState<{ containerId: string; slotId: number } | null>(null);
  // Tooltip State
  const [tooltip, setTooltip] = useState<{ item: ItemData; x: number; y: number } | null>(null);
  // Detail Modal State (tap on item → detail view)
  const [detailItem, setDetailItem] = useState<ItemData | null>(null);
  const [detailSlot, setDetailSlot] = useState<{ containerId: string; slotId: number } | null>(null);

  // Clipboard State
  const [clipboardItems, setClipboardItems] = useState<ItemData[]>([]);
  // Multi-select State
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedSlotIds, setSelectedSlotIds] = useState<Set<number>>(new Set());

  // Recipe Edit Modal State
  const [editingRecipe, setEditingRecipe] = useState<ItemData | null>(null);
  const [isRecipeEditModalOpen, setIsRecipeEditModalOpen] = useState(false);

  // Toast & Unsaved Changes State
  const [toast, setToast] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [accessAlert, setAccessAlert] = useState<AccessAlert | null>(null);
  const [systemAlert, setSystemAlert] = useState<SystemAlert | null>(null);
  const [blockedTemplateId, setBlockedTemplateId] = useState<BlockContactTemplateId>(BLOCKED_CONTACT_TEMPLATES[0].id);
  const [blockedMessageSending, setBlockedMessageSending] = useState(false);
  const [blockedMessageFeedback, setBlockedMessageFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const toastTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    setHasUnsavedChanges(true);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  };

  const isPendingApproval = userRole === 'user' && userAccessStatus === 'pending';
  const canEditData = (userRole === 'admin' || userPermissions.canDataEntry) && !isPendingApproval;
  const canUseGlobalSearch = (userRole === 'admin' || userPermissions.canGlobalSearch) && !isPendingApproval;
  const isBlockedUser = userRole === 'user' && userAccessStatus === 'approved' && userBlockInfo.isBlocked;

  const showAccessAlert = (kind: AccessAlert['kind']) => {
    if (kind === 'dataEntry') {
      setAccessAlert({
        kind,
        title: 'Veri Girisi Duraklatildi',
        message: 'Bu hesap icin veri girisi yetkiniz yonetici tarafindan gecici olarak kapatildi.',
        hint: 'Salt okunur modda inceleme yapabilirsiniz.',
      });
      return;
    }

    setAccessAlert({
      kind,
      title: 'Global Arama Kapali',
      message: 'Global arama yetkiniz yonetici tarafindan devre disi birakildi.',
      hint: 'Hesaplarim sekmesindeki yerel aramayi kullanmaya devam edebilirsiniz.',
    });
  };

  const showSystemAlert = (alert: SystemAlert) => {
    setSystemAlert(alert);
  };

  const ensureCanEditData = () => {
    if (canEditData) return true;
    showAccessAlert('dataEntry');
    return false;
  };

  const handleOpenSearch = () => {
    setIsSearchOpen(true);
  };

  const handleOpenInventorySummary = () => {
    setIsInventorySummaryOpen(true);
  };

  // --- BAŞLANGIÇ: VERİLERİ BULUTTAN ÇEKME ---
  useEffect(() => {
    const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, fallbackValue: T): Promise<T> => {
      try {
        return await Promise.race<T>([
          promise,
          new Promise<T>((resolve) => setTimeout(() => resolve(fallbackValue), timeoutMs)),
        ]);
      } catch {
        return fallbackValue;
      }
    };

    const resolveIsAdmin = async (email: string | null | undefined) => {
      const normalizedEmail = (email || '').trim().toLowerCase();
      if (!normalizedEmail) return false;
      if (normalizedEmail === 'yvzsltn61@gmail.com') return true;
      try {
        const adminsDoc = await getDoc(doc(db, "metadata", "admins"));
        if (!adminsDoc.exists()) return false;
        const emails = adminsDoc.data().emails;
        return Array.isArray(emails) && emails.includes(normalizedEmail);
      } catch {
        return false;
      }
    };

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const usesPasswordAuth = user.providerData.some(provider => provider?.providerId === 'password');
        if (usesPasswordAuth) {
          const isVerifiedNow = async () => {
            if (user.emailVerified) return true;
            await withTimeout(user.reload(), 3500, undefined);
            return auth.currentUser?.emailVerified === true || user.emailVerified === true;
          };

          const verified = await isVerifiedNow();
          if (!verified) {
              await signOut(auth);
              setLoading(false);
              return;
          }
          if (auth.currentUser) user = auth.currentUser;
        }

        setLoading(true);
        const userDocRef = doc(db, "users", user.uid);
        const emailLower = (user.email || '').trim().toLowerCase();
        let profileUsername = '';
        const isAdminPromise = withTimeout(resolveIsAdmin(user.email), 2500, false);
        const userDocPromise = withTimeout(getDoc(userDocRef), 15000, null);

        try {
          const [isAdmin, initialDocSnap] = await Promise.all([isAdminPromise, userDocPromise]);
          if (!initialDocSnap) throw new Error('Veri yükleme zaman aşımına uğradı');
          let docSnap = initialDocSnap;
          let resolvedBlockInfo = DEFAULT_USER_BLOCK_INFO;
          let resolvedAccessStatus: UserAccessStatus = 'approved';

          if (docSnap.exists()) {
            const data = docSnap.data();
            const rawAccounts = data.accounts || [];
            const loadedAccounts = rawAccounts.map(migrateAccount);
            const resolvedPermissions = normalizeUserPermissions(data.permissions);
            const resolvedMessageSettings = normalizeMessageSettings(data.messageSettings);
            const resolvedUserClass = normalizeUserClass(data.userClass);
            resolvedBlockInfo = normalizeUserBlockInfo(data.blockInfo);
            resolvedAccessStatus = normalizeUserAccessStatus(data.accessStatus);

            if (isAdmin && resolvedAccessStatus !== 'approved') {
              resolvedAccessStatus = 'approved';
              setDoc(userDocRef, {
                accessStatus: 'approved',
                approvedAt: Date.now(),
                approvedByUid: user.uid,
              }, { merge: true }).catch(() => {});
            }

            setUserAccessStatus(resolvedAccessStatus);
            if (!isAdmin && resolvedAccessStatus === 'pending') {
              setAccounts([]);
              setSelectedAccountId('');
              setUserPermissions(DEFAULT_USER_PERMISSIONS);
              setUserBlockInfo(DEFAULT_USER_BLOCK_INFO);
              setUserRole('user');
              return;
            }

            setUserPermissions(resolvedPermissions);
            setUserBlockInfo(resolvedBlockInfo);

            // Load username
            if (data.username) {
              setUsername(data.username);
              profileUsername = data.username;
            } else {
              setUsername(null);
              profileUsername = '';
            }

            // Load social link
            if (data.socialLink) {
              setSocialLink(data.socialLink);
            } else {
              setSocialLink('');
            }

            // Mevcut kullanıcılara email alanı yoksa ekle
            if (!data.email && user.email) {
              setDoc(userDocRef, { email: user.email }, { merge: true }).catch(() => {});
            }

            if (!data.accessStatus || data.accessStatus !== resolvedAccessStatus) {
              setDoc(userDocRef, { accessStatus: resolvedAccessStatus }, { merge: true }).catch(() => {});
            }

            if (
              !data.permissions ||
              typeof data.permissions.canDataEntry !== 'boolean' ||
              typeof data.permissions.canGlobalSearch !== 'boolean'
            ) {
              setDoc(userDocRef, { permissions: resolvedPermissions }, { merge: true }).catch(() => {});
            }

            if (
              !data.messageSettings ||
              typeof data.messageSettings.dailySendLimit !== 'number' ||
              !Number.isFinite(data.messageSettings.dailySendLimit) ||
              data.messageSettings.dailySendLimit <= 0
            ) {
              setDoc(userDocRef, { messageSettings: resolvedMessageSettings }, { merge: true }).catch(() => {});
            }

            if (data.userClass !== resolvedUserClass) {
              setDoc(userDocRef, { userClass: resolvedUserClass }, { merge: true }).catch(() => {});
            }

            if (
              !data.blockInfo ||
              typeof data.blockInfo !== 'object' ||
              typeof data.blockInfo.isBlocked !== 'boolean'
            ) {
              setDoc(userDocRef, { blockInfo: DEFAULT_USER_BLOCK_INFO }, { merge: true }).catch(() => {});
            }

            if (loadedAccounts.length > 0) {
              // Check if migration happened and auto-save
              const needsMigration = rawAccounts.some((acc: any) => !acc.servers || acc.servers.length === 0);

              setAccounts(loadedAccounts);
              setSelectedAccountId(loadedAccounts[0].id);

              if (needsMigration) {
                setDoc(userDocRef, { accounts: loadedAccounts }, { merge: true }).catch(() => {});
              }
            } else {
              const initResult = await initializeDefault(userDocRef, isAdmin);
              resolvedAccessStatus = initResult.accessStatus;
              setUserAccessStatus(resolvedAccessStatus);
              if (!isAdmin && resolvedAccessStatus === 'pending') {
                setAccounts([]);
                setSelectedAccountId('');
                setUserPermissions(DEFAULT_USER_PERMISSIONS);
                setUserBlockInfo(DEFAULT_USER_BLOCK_INFO);
                setUserRole('user');
                return;
              }
            }
          } else {
            const initResult = await initializeDefault(userDocRef, isAdmin);
            resolvedAccessStatus = initResult.accessStatus;
            setUserAccessStatus(resolvedAccessStatus);
            resolvedBlockInfo = DEFAULT_USER_BLOCK_INFO;
            setUserBlockInfo(DEFAULT_USER_BLOCK_INFO);
            if (!isAdmin && resolvedAccessStatus === 'pending') {
              setAccounts([]);
              setSelectedAccountId('');
              setUserPermissions(DEFAULT_USER_PERMISSIONS);
              setUserRole('user');
              return;
            }
          }

          // Admin kontrolü: hardcoded email + Firestore metadata/admins
          if (emailLower) {
            setDoc(doc(db, "publicProfiles", user.uid), {
              uid: user.uid,
              username: profileUsername,
              emailLower,
              updatedAt: Date.now(),
            }, { merge: true }).catch(() => {});
          }

          setUserRole(isAdmin ? 'admin' : 'user');
          if (isAdmin && resolvedBlockInfo.isBlocked) {
            setUserBlockInfo(DEFAULT_USER_BLOCK_INFO);
          }

          // Global metadata'yi loading ekranini bloklamadan arka planda yukle.
          const loadGlobalMetadata = async () => {
            try {
              const [enchDoc, potionsDoc, minesDoc, othersDoc, glassesDoc, talismansDoc, weaponsDoc] = await Promise.all([
                getDoc(doc(db, "metadata", "enchantments")),
                getDoc(doc(db, "metadata", "potions")),
                getDoc(doc(db, "metadata", "mines")),
                getDoc(doc(db, "metadata", "others")),
                getDoc(doc(db, "metadata", "glasses")),
                getDoc(doc(db, "metadata", "talismans")),
                getDoc(doc(db, "metadata", "weapons")),
              ]);

              setGlobalEnchantments(enchDoc.exists() ? toUniqueSortedNames(enchDoc.data().names) : []);
              setGlobalPotions(potionsDoc.exists() ? toPotionNamedLevelSuggestions(potionsDoc.data()) : []);
              setGlobalMines(minesDoc.exists() ? toUniqueSortedNamedLevels(minesDoc.data().entries) : []);
              setGlobalOthers(othersDoc.exists() ? toUniqueSortedNamedLevels(othersDoc.data().entries) : []);
              setGlobalGlasses(glassesDoc.exists() ? toUniqueSortedNamedLevels(glassesDoc.data().entries) : []);
              if (talismansDoc.exists()) {
                const talismanData = toTalismanAutocompleteData(talismansDoc.data());
                setGlobalTalismans(talismanData.names);
                setGlobalTalismanRules(talismanData.rules);
              } else {
                setGlobalTalismans([]);
                setGlobalTalismanRules([]);
              }
              setGlobalWeaponTypes(weaponsDoc.exists() ? toUniqueSortedNames(weaponsDoc.data().names) : []);
            } catch (e) {
              console.warn("Global autocomplete verileri yuklenemedi:", e);
            }
          };

          const loadAppLimits = async () => {
            try {
              const limitsDoc = await getDoc(doc(db, "metadata", "searchLimits"));
              if (!limitsDoc.exists()) return;
              const limitsData = limitsDoc.data();
              if (typeof limitsData.maxAccounts === 'number' && Number.isFinite(limitsData.maxAccounts) && limitsData.maxAccounts >= 1) {
                setMaxAccounts(Math.floor(limitsData.maxAccounts));
              }
            } catch {
              // Limit okunamazsa varsayilan 10 kalir
            }
          };

          void loadGlobalMetadata();
          void loadAppLimits();

        } catch (error) {
          showSystemAlert({
            tone: 'error',
            title: 'Veriler Yuklenemedi',
            message: 'Veriler yuklenirken bir hata olustu. Lutfen internet baglantinizi kontrol edin.',
            hint: 'Sorun devam ederse tekrar giris yapmayi deneyin.',
          });
        } finally {
          setLoading(false);
        }

      } else {
        setUserRole(null);
        setUserAccessStatus('approved');
        setAccounts([]);
        setSelectedAccountId('');
        setUsername(null);
        setSocialLink('');
        setGlobalEnchantments([]);
        setGlobalPotions([]);
        setGlobalMines([]);
        setGlobalOthers([]);
        setGlobalGlasses([]);
        setGlobalTalismans([]);
        setGlobalTalismanRules([]);
        setGlobalWeaponTypes([]);
        setUserPermissions(DEFAULT_USER_PERMISSIONS);
        setUserBlockInfo(DEFAULT_USER_BLOCK_INFO);
        setBlockedTemplateId(BLOCKED_CONTACT_TEMPLATES[0].id);
        setBlockedMessageFeedback(null);
        setUnreadMessageSenderCount(0);
        setUnreadAdminNotificationCount(0);
        setShowAdminPanel(false);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setUnreadMessageSenderCount(0);
      return;
    }

    const unreadQuery = query(collection(db, "messages"), where("receiverUid", "==", uid));
    const unsubscribe = onSnapshot(unreadQuery, (snapshot) => {
      const senderSet = new Set<string>();

      snapshot.forEach(docSnap => {
        const data = docSnap.data() as { senderUid?: string; readBy?: unknown; deletedFor?: unknown };
        if (!data.senderUid || data.senderUid === uid) return;

        const readBy = Array.isArray(data.readBy)
          ? data.readBy.filter((value): value is string => typeof value === 'string')
          : [];
        const deletedFor = Array.isArray(data.deletedFor)
          ? data.deletedFor.filter((value): value is string => typeof value === 'string')
          : [];

        if (deletedFor.includes(uid)) return;

        if (!readBy.includes(uid)) {
          senderSet.add(data.senderUid);
        }
      });

      setUnreadMessageSenderCount(senderSet.size);
    });

    return () => unsubscribe();
  }, [userRole]);

  useEffect(() => {
    const emailLower = (auth.currentUser?.email || '').trim().toLowerCase();
    if (!emailLower || userRole !== 'admin') {
      setUnreadAdminNotificationCount(0);
      return;
    }

    const notificationsQuery = query(collection(db, "adminNotifications"), where("recipientEmail", "==", emailLower));
    const unsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
      let unreadCount = 0;
      snapshot.forEach(docSnap => {
        const data = docSnap.data() as { read?: unknown };
        if (data.read !== true) unreadCount += 1;
      });
      setUnreadAdminNotificationCount(unreadCount);
    });

    return () => unsubscribe();
  }, [userRole]);

  const initializeDefault = async (docRef: any, isAdmin: boolean): Promise<{ accessStatus: UserAccessStatus }> => {
    const newId = crypto.randomUUID();
    const defaultAccount = createAccount(newId, 'Hesap 1');
    const initialAccounts = [defaultAccount];

    const user = auth.currentUser;
    const createdAt = Date.now();
    const basePayload = {
      accounts: initialAccounts,
      email: user?.email || '',
      createdAt,
      permissions: DEFAULT_USER_PERMISSIONS,
      userClass: DEFAULT_USER_CLASS,
      messageSettings: DEFAULT_MESSAGE_SETTINGS,
      blockInfo: DEFAULT_USER_BLOCK_INFO,
    };

    let accessStatus: UserAccessStatus = 'approved';
    if (isAdmin) {
      await setDoc(docRef, {
        ...basePayload,
        accessStatus: 'approved',
        approvalRequestedAt: createdAt,
        approvedAt: createdAt,
        approvedByUid: user?.uid || 'system_admin',
      });
    } else {
      try {
        await runTransaction(db, async (transaction) => {
          const searchLimitsRef = doc(db, "metadata", "searchLimits");
          const searchLimitsSnap = await transaction.get(searchLimitsRef);
          const rawSlots = searchLimitsSnap.exists() ? searchLimitsSnap.data().autoApproveSlots : 0;
          const availableSlots = (
            typeof rawSlots === 'number' &&
            Number.isFinite(rawSlots) &&
            rawSlots > 0
          )
            ? Math.floor(rawSlots)
            : 0;

          accessStatus = availableSlots > 0 ? 'approved' : 'pending';

          if (accessStatus === 'approved') {
            transaction.set(searchLimitsRef, {
              autoApproveSlots: availableSlots - 1,
              updatedAt: createdAt,
            }, { merge: true });
          }

          transaction.set(docRef, {
            ...basePayload,
            accessStatus,
            approvalRequestedAt: createdAt,
            ...(accessStatus === 'approved'
              ? { approvedAt: createdAt, approvedByUid: 'system_quota' }
              : {}),
          });
        });
      } catch (error) {
        console.error("Yeni kullanici onay durumu islenemedi, kullanici beklemeye aliniyor:", error);
        accessStatus = 'pending';
        await setDoc(docRef, {
          ...basePayload,
          accessStatus: 'pending',
          approvalRequestedAt: createdAt,
        });
      }
    }

    setAccounts(initialAccounts);
    setSelectedAccountId(newId);
    setUserPermissions(DEFAULT_USER_PERMISSIONS);
    setUserBlockInfo(DEFAULT_USER_BLOCK_INFO);
    return { accessStatus };
  };

  const openUsernameModal = () => {
    if (userRole !== 'admin' && username) return;
    setUsernameInput(userRole === 'admin' && username ? username : '');
    setUsernameError('');
    setShowUsernameModal(true);
  };

  // --- USERNAME SET ---
  const handleSetUsername = async () => {
    const user = auth.currentUser;
    if (!user || !usernameInput.trim()) return;

    const isAdminUser = userRole === 'admin';
    if (!isAdminUser && username) {
      setUsernameError('Kullanici adi sadece 1 kez belirlenebilir.');
      return;
    }

    const trimmed = usernameInput.trim();

    if (trimmed.length < 3 || trimmed.length > 20) {
      setUsernameError('Kullanıcı adı 3 ile 20 karakter arasında olmalıdır.');
      return;
    }

    setUsernameLoading(true);
    setUsernameError('');

    try {
      const usernameLower = trimmed.toLowerCase();
      const currentUsernameLower = username ? username.toLowerCase() : null;

      await runTransaction(db, async (transaction) => {
        if (isAdminUser && currentUsernameLower && currentUsernameLower === usernameLower) {
          transaction.set(doc(db, "users", user.uid), { username: trimmed }, { merge: true });
          return;
        }

        const usernameDocRef = doc(db, "usernames", usernameLower);
        const usernameSnap = await transaction.get(usernameDocRef);

        if (usernameSnap.exists()) {
          throw new Error("USERNAME_TAKEN");
        }

        if (isAdminUser && currentUsernameLower && currentUsernameLower !== usernameLower) {
          transaction.delete(doc(db, "usernames", currentUsernameLower));
        }

        transaction.set(usernameDocRef, { uid: user.uid, displayName: trimmed });
        transaction.set(doc(db, "users", user.uid), { username: trimmed }, { merge: true });
      });

      const emailLower = (user.email || '').trim().toLowerCase();
      if (emailLower) {
        await setDoc(doc(db, "publicProfiles", user.uid), {
          uid: user.uid,
          username: trimmed,
          emailLower,
          updatedAt: Date.now(),
        }, { merge: true });
      }

      setUsername(trimmed);
      setShowUsernameModal(false);
      setUsernameInput('');
    } catch (error: any) {
      console.error("Username set error:", error);
      if (error.message === 'USERNAME_TAKEN') {
        setUsernameError('Bu kullanıcı adı zaten alınmış. Lütfen başka bir isim deneyin.');
      } else {
        setUsernameError('Bir hata oluştu. Lütfen tekrar deneyin.');
      }
    } finally {
      setUsernameLoading(false);
    }
  };

  // --- SOCIAL LINK SET ---
  const handleSaveSocialLink = async () => {
    const user = auth.currentUser;
    if (!user) return;
    if (!ensureCanEditData()) return;

    const trimmed = socialLinkInput.trim();

    if (trimmed && !/^https?:\/\//i.test(trimmed)) {
      showToast('Link https:// veya http:// ile başlamalıdır.');
      return;
    }

    setSocialLinkSaving(true);
    try {
      // 1. Save to user doc
      const userDocRef = doc(db, "users", user.uid);
      await setDoc(userDocRef, { socialLink: trimmed }, { merge: true });

      // 2. Update all existing globalItems belonging to this user
      const q = query(collection(db, "globalItems"), where("uid", "==", user.uid));
      const snapshot = await getDocs(q);
      const updatePromises = snapshot.docs.map(d => updateDoc(d.ref, { socialLink: trimmed }));
      await Promise.all(updatePromises);

      setSocialLink(trimmed);
      setShowSocialLinkModal(false);
    } catch (error) {
      console.error("Social link save error:", error);
    } finally {
      setSocialLinkSaving(false);
    }
  };

  // --- VERİLERİ BULUTA KAYDETME ---
  const [isSaving, setIsSaving] = useState(false);
  const [saveNotification, setSaveNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const saveData = async () => {
    if (isSaving) return;
    const user = auth.currentUser;
    if (!user) {
        showSystemAlert({
          tone: 'warning',
          title: 'Oturum Suresi Doldu',
          message: 'Lutfen sayfayi yenileyip tekrar giris yapin.',
        });
        return;
    }

    if (!ensureCanEditData()) return;
    setIsSaving(true);
    try {
        const userDocRef = doc(db, "users", user.uid);
        const sanitizedAccounts = stripUndefinedDeep(accounts);
        await setDoc(userDocRef, { accounts: sanitizedAccounts }, { merge: true });
        setHasUnsavedChanges(false);
        setSaveNotification({ type: 'success', message: 'Tüm veriler başarıyla buluta kaydedildi!' });
        setTimeout(() => setSaveNotification(null), 3000);
    } catch (error: any) {
        console.error('saveData error:', error, {
          code: error?.code,
          message: error?.message,
        });
        setSaveNotification({ type: 'error', message: 'Kayıt sırasında bir hata oluştu. Lütfen tekrar deneyin.' });
        setTimeout(() => setSaveNotification(null), 4000);
    } finally {
        setTimeout(() => setIsSaving(false), 2000);
    }
  };

  const updateAccountsState = (newAccounts: Account[]) => {
    setAccounts(newAccounts);
  };

  // --- Sync Temp States when Active Data Changes ---
  const activeAccountIndex = accounts.findIndex(a => a.id === selectedAccountId);
  const canMoveAccountUp = activeAccountIndex > 0;
  const canMoveAccountDown = activeAccountIndex >= 0 && activeAccountIndex < accounts.length - 1;
  const activeAccount = accounts.find(a => a.id === selectedAccountId);
  const activeServer = activeAccount?.servers[selectedServerIndex];
  const activeChar = activeServer?.characters[activeCharIndex];

  // Tılsım duplikasyon tespiti: aynı karakter içinde 3+ aynı tılsım varsa glow efekti
  const TALISMAN_GLOW_COLORS = [
    '#06b6d4', '#ef4444', '#84cc16', '#8b5cf6', '#f59e0b',
    '#ec4899', '#0ea5e9', '#10b981', '#f43f5e', '#f97316',
  ];
  const getTalismanColor = (name: string): string => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = ((hash << 5) - hash) + name.charCodeAt(i);
      hash |= 0;
    }
    return TALISMAN_GLOW_COLORS[Math.abs(hash) % TALISMAN_GLOW_COLORS.length];
  };
  const talismanDuplicates = useMemo(() => {
    if (!activeChar) return new Map<string, { count: number; color: string }>();
    const countMap = new Map<string, number>();
    [activeChar.bank1, activeChar.bank2, activeChar.bag].forEach(container => {
      container.slots.forEach(slot => {
        if (slot.item && slot.item.category === 'Tılsım' && slot.item.enchantment1?.trim()) {
          const tier = resolveItemTalismanTier(slot.item);
          if (tier === 'III' || tier === '-') return; // 3. kademe ve kademesiz hariç
          const color = resolveItemTalismanColor(slot.item);
          const key = `${slot.item.enchantment1.toLocaleLowerCase('tr')}|${color.toLocaleLowerCase('tr')}|${tier.toLocaleLowerCase('tr')}|${slot.item.heroClass}`;
          countMap.set(key, (countMap.get(key) || 0) + 1);
        }
      });
    });
    const result = new Map<string, { count: number; color: string }>();
    countMap.forEach((count, key) => {
      if (count >= 3) {
        const name = key.split('|')[0];
        result.set(key, { count, color: getTalismanColor(name) });
      }
    });
    return result;
  }, [activeChar]);

  // Detay modalında gösterilecek tılsım duplikasyon konumları
  const talismanLocations = useMemo(() => {
    if (!detailItem || !activeChar || detailItem.category !== 'Tılsım' || !detailItem.enchantment1?.trim()) return null;
    const detailTier = resolveItemTalismanTier(detailItem);
    const detailColor = resolveItemTalismanColor(detailItem);
    const key = `${detailItem.enchantment1.toLocaleLowerCase('tr')}|${detailColor.toLocaleLowerCase('tr')}|${detailTier.toLocaleLowerCase('tr')}|${detailItem.heroClass}`;
    if (!talismanDuplicates.has(key)) return null;
    const locations: { containerId: string; containerName: string; row: number; col: number }[] = [];
    [
      { data: activeChar.bank1, name: 'Kasa 1' },
      { data: activeChar.bank2, name: 'Kasa 2' },
      { data: activeChar.bag, name: 'Çanta' },
    ].forEach(({ data, name }) => {
      data.slots.forEach(slot => {
        if (slot.item && slot.item.category === 'Tılsım' && slot.item.enchantment1?.trim()) {
          const slotTier = resolveItemTalismanTier(slot.item);
          const slotColor = resolveItemTalismanColor(slot.item);
          const slotKey = `${slot.item.enchantment1.toLocaleLowerCase('tr')}|${slotColor.toLocaleLowerCase('tr')}|${slotTier.toLocaleLowerCase('tr')}|${slot.item.heroClass}`;
          if (slotKey === key) {
            const position = getContainerSlotPosition(data, slot.id);
            if (position) {
              locations.push({ containerId: data.id, containerName: name, row: position.row, col: position.col });
            }
          }
        }
      });
    });
    return locations.length >= 3 ? locations : null;
  }, [detailItem, activeChar, talismanDuplicates]);

  const enchantmentSuggestions = useMemo(() => {
    const set = new Set<string>();
    globalEnchantments.forEach(e => {
      const normalized = (e || '').trim();
      if (normalized) set.add(normalized);
    });
    return [...set].sort((a, b) => a.toLocaleLowerCase('tr').localeCompare(b.toLocaleLowerCase('tr'), 'tr'));
  }, [globalEnchantments]);

  const potionSuggestions = useMemo(() => {
    const set = new Set<string>();
    globalPotions.forEach(entry => {
      const normalized = (entry.name || '').trim();
      if (normalized) set.add(normalized);
    });
    return [...set].sort((a, b) => a.toLocaleLowerCase('tr').localeCompare(b.toLocaleLowerCase('tr'), 'tr'));
  }, [globalPotions]);

  const potionLevelMap = useMemo(() => {
    const map = new Map<string, number>();
    globalPotions.forEach(entry => {
      const name = entry.name.trim();
      if (!name) return;
      map.set(name.toLocaleLowerCase('tr'), entry.level);
    });
    return map;
  }, [globalPotions]);

  const mineSuggestions = useMemo(() => (
    globalMines
      .map(entry => entry.name)
      .filter(name => name.trim() !== '')
      .sort((a, b) => a.toLocaleLowerCase('tr').localeCompare(b.toLocaleLowerCase('tr'), 'tr'))
  ), [globalMines]);

  const mineLevelMap = useMemo(() => {
    const map = new Map<string, number>();
    globalMines.forEach(entry => {
      const name = entry.name.trim();
      if (!name) return;
      map.set(name.toLocaleLowerCase('tr'), entry.level);
    });
    return map;
  }, [globalMines]);

  const otherSuggestions = useMemo(() => (
    globalOthers
      .map(entry => entry.name)
      .filter(name => name.trim() !== '')
      .sort((a, b) => a.toLocaleLowerCase('tr').localeCompare(b.toLocaleLowerCase('tr'), 'tr'))
  ), [globalOthers]);

  const otherLevelMap = useMemo(() => {
    const map = new Map<string, number>();
    globalOthers.forEach(entry => {
      const name = entry.name.trim();
      if (!name) return;
      map.set(name.toLocaleLowerCase('tr'), entry.level);
    });
    return map;
  }, [globalOthers]);

  const glassesSuggestions = useMemo(() => (
    globalGlasses
      .map(entry => entry.name)
      .filter(name => name.trim() !== '')
      .sort((a, b) => a.toLocaleLowerCase('tr').localeCompare(b.toLocaleLowerCase('tr'), 'tr'))
  ), [globalGlasses]);

  const glassesLevelMap = useMemo(() => {
    const map = new Map<string, number>();
    globalGlasses.forEach(entry => {
      const name = entry.name.trim();
      if (!name) return;
      map.set(name.toLocaleLowerCase('tr'), entry.level);
    });
    return map;
  }, [globalGlasses]);

  const talismanSuggestions = useMemo(() => {
    const set = new Set<string>();
    globalTalismans.forEach(name => {
      const normalized = (name || '').trim();
      if (normalized) set.add(normalized);
    });
    return [...set].sort((a, b) => a.toLocaleLowerCase('tr').localeCompare(b.toLocaleLowerCase('tr'), 'tr'));
  }, [globalTalismans]);

  const talismanOptionMap = useMemo(() => {
    const map = new Map<string, { color: TalismanColorSuggestion; heroClass: TalismanHeroClassSuggestion }[]>();
    globalTalismanRules.forEach(rule => {
      const name = rule.name.trim();
      if (!name) return;
      const key = name.toLocaleLowerCase('tr');
      const prev = map.get(key) || [];
      if (!prev.some(item => item.color === rule.color && item.heroClass === rule.heroClass)) {
        prev.push({ color: rule.color, heroClass: rule.heroClass });
      }
      map.set(key, prev);
    });
    return map;
  }, [globalTalismanRules]);

  const weaponTypeSuggestions = useMemo(() => {
    const set = new Set<string>();
    globalWeaponTypes.forEach(w => {
      const normalized = (w || '').trim();
      if (normalized) set.add(normalized);
    });
    return [...set].sort((a, b) => a.toLocaleLowerCase('tr').localeCompare(b.toLocaleLowerCase('tr'), 'tr'));
  }, [globalWeaponTypes]);

  // Global set lookup: tüm hesaplar/sunucular/karakterler genelinde efsun çiftine göre set durumu
  const { globalSetLookup, globalSetMap } = useMemo(() => {
    const lookup = new Map<string, GlobalSetInfo>();
    const setMap = new Map<string, SetItemLocation[]>();

    // Tüm itemleri topla (account/server/char bilgisiyle)
    const allSetItems: { item: ItemData; accountName: string; serverName: string; charName: string; containerName: string; row: number; col: number }[] = [];

    accounts.forEach(acc => {
      acc.servers.forEach(server => {
        server.characters.forEach(char => {
          const containers = [
            { data: char.bank1, name: 'Kasa 1' },
            { data: char.bank2, name: 'Kasa 2' },
            { data: char.bag, name: 'Çanta' },
          ];
          containers.forEach(({ data, name }) => {
            data.slots.forEach(slot => {
              if (slot.item && SET_CATEGORIES.includes(slot.item.category) && slot.item.enchantment1 && slot.item.enchantment1.trim() !== '') {
                const position = getContainerSlotPosition(data, slot.id);
                if (!position) return;
                allSetItems.push({
                  item: slot.item,
                  accountName: acc.name,
                  serverName: server.name,
                  charName: char.name,
                  containerName: name,
                  row: position.row,
                  col: position.col,
                });
              }
            });
          });
          // Okunmuş reçeteler
          (char.learnedRecipes || []).forEach((recipe, idx) => {
            if (SET_CATEGORIES.includes(recipe.category) && recipe.enchantment1 && recipe.enchantment1.trim() !== '') {
              allSetItems.push({
                item: recipe,
                accountName: acc.name,
                serverName: server.name,
                charName: char.name,
                containerName: 'Okunmuş Reçete',
                row: idx + 1,
                col: 1,
              });
            }
          });
        });
      });
    });

    // Efsun çiftine göre grupla
    const enchGroups = new Map<string, typeof allSetItems>();
    allSetItems.forEach(entry => {
      const enchKey = createSetEnchantmentKey(entry.item.enchantment1, entry.item.enchantment2);
      const group = enchGroups.get(enchKey) || [];
      group.push(entry);
      enchGroups.set(enchKey, group);
    });

    // Her grup için gender/class kombinasyonlarıyla set sayısı hesapla
    enchGroups.forEach((entries, enchKey) => {
      const genders = new Set<string>();
      const classes = new Set<string>();
      entries.forEach(e => {
        genders.add(e.item.gender);
        classes.add(e.item.heroClass);
      });

      genders.forEach(targetGender => {
        classes.forEach(targetClass => {
          const coveredCategories = new Set<string>();
          const locations: SetItemLocation[] = [];

          entries.forEach(e => {
            const genderMatch = e.item.gender === targetGender || e.item.gender === 'Tüm Cinsiyetler' || targetGender === 'Tüm Cinsiyetler';
            const classMatch = e.item.heroClass === targetClass || e.item.heroClass === 'Tüm Sınıflar' || targetClass === 'Tüm Sınıflar';
            if (genderMatch && classMatch) {
              coveredCategories.add(e.item.category);
              locations.push({
                accountName: e.accountName,
                serverName: e.serverName,
                charName: e.charName,
                containerName: e.containerName,
                row: e.row,
                col: e.col,
                category: e.item.category,
                item: e.item,
              });
            }
          });

          if (coveredCategories.size > 0) {
            const globalKey = `${enchKey}|${targetGender}|${targetClass}`;
            lookup.set(globalKey, { count: coveredCategories.size, categories: coveredCategories });
            setMap.set(globalKey, locations);
          }
        });
      });
    });

    console.log('[SET] Global set lookup hesaplandı:', lookup.size, 'kombinasyon,', allSetItems.length, 'set item');
    return { globalSetLookup: lookup, globalSetMap: setMap };
  }, [accounts]);

  useEffect(() => {
    if (activeAccount) {
        setTempAccountName(activeAccount.name);
    }
  }, [selectedAccountId, accounts]);

  useEffect(() => {
    if (activeChar) {
        setTempCharName(activeChar.name);
    }
  }, [activeCharIndex, selectedServerIndex, selectedAccountId, accounts]);


  // --- Account Management ---

  const handleAddAccount = () => {
    if (!ensureCanEditData()) return;
    if (accounts.length >= maxAccounts) {
      showSystemAlert({
        tone: 'warning',
        title: 'Hesap Limiti',
        message: `En fazla ${maxAccounts} hesap olusturabilirsiniz.`,
      });
      return;
    }
    const newId = crypto.randomUUID();
    const name = `Hesap ${accounts.length + 1}`;
    const newAccount = createAccount(newId, name);
    const newAccounts = [...accounts, newAccount];
    setAccounts(newAccounts);
    setSelectedAccountId(newId);
    setSelectedServerIndex(0);
    setActiveCharIndex(0);
    setHasUnsavedChanges(true);
  };

  const handleDeleteAccount = () => {
    if (!ensureCanEditData()) return;
    if (accounts.length <= 1) {
      showSystemAlert({
        tone: 'info',
        title: 'Islem Yapilamadi',
        message: 'En az bir hesap kalmalidir.',
      });
      return;
    }
    const confirmDelete = window.confirm("Bu hesabı silmek istediğinize emin misiniz?");
    if (confirmDelete) {
      const newAccounts = accounts.filter(a => a.id !== selectedAccountId);
      setAccounts(newAccounts);
      setSelectedAccountId(newAccounts[0].id);
      setSelectedServerIndex(0);
      setActiveCharIndex(0);
      setHasUnsavedChanges(true);
    }
  };

  const markAdminNotificationsRead = async () => {
    const emailLower = (auth.currentUser?.email || '').trim().toLowerCase();
    if (!emailLower || userRole !== 'admin') return;
    try {
      const notificationsQuery = query(collection(db, "adminNotifications"), where("recipientEmail", "==", emailLower));
      const snapshot = await getDocs(notificationsQuery);
      const updatePromises: Promise<void>[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data() as { read?: unknown };
        if (data.read !== true) {
          updatePromises.push(updateDoc(docSnap.ref, { read: true, readAt: Date.now() }));
        }
      });
      await Promise.all(updatePromises);
    } catch (error) {
      console.warn("Admin bildirimleri okunmus yapilamadi:", error);
    }
  };

  const handleOpenAdminPanel = () => {
    setShowAdminPanel(true);
    markAdminNotificationsRead().catch(() => {});
  };

  const handleCloseAdminPanel = async () => {
    setShowAdminPanel(false);
    try {
      const [enchDoc, potionsDoc, minesDoc, othersDoc, glassesDoc, talismansDoc, weaponsDoc] = await Promise.all([
        getDoc(doc(db, "metadata", "enchantments")),
        getDoc(doc(db, "metadata", "potions")),
        getDoc(doc(db, "metadata", "mines")),
        getDoc(doc(db, "metadata", "others")),
        getDoc(doc(db, "metadata", "glasses")),
        getDoc(doc(db, "metadata", "talismans")),
        getDoc(doc(db, "metadata", "weapons")),
      ]);
      setGlobalEnchantments(enchDoc.exists() ? toUniqueSortedNames(enchDoc.data().names) : []);
      setGlobalPotions(potionsDoc.exists() ? toPotionNamedLevelSuggestions(potionsDoc.data()) : []);
      setGlobalMines(minesDoc.exists() ? toUniqueSortedNamedLevels(minesDoc.data().entries) : []);
      setGlobalOthers(othersDoc.exists() ? toUniqueSortedNamedLevels(othersDoc.data().entries) : []);
      setGlobalGlasses(glassesDoc.exists() ? toUniqueSortedNamedLevels(glassesDoc.data().entries) : []);
      if (talismansDoc.exists()) {
        const talismanData = toTalismanAutocompleteData(talismansDoc.data());
        setGlobalTalismans(talismanData.names);
        setGlobalTalismanRules(talismanData.rules);
      } else {
        setGlobalTalismans([]);
        setGlobalTalismanRules([]);
      }
      setGlobalWeaponTypes(weaponsDoc.exists() ? toUniqueSortedNames(weaponsDoc.data().names) : []);
    } catch (error) {
      console.warn("Global autocomplete listeleri yenilenemedi:", error);
    }
  };

  const handleSendBlockedTemplateMessage = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser || blockedMessageSending) return;

    const selectedTemplate = BLOCKED_CONTACT_TEMPLATES.find(template => template.id === blockedTemplateId) || BLOCKED_CONTACT_TEMPLATES[0];
    setBlockedMessageSending(true);
    setBlockedMessageFeedback(null);

    try {
      const adminEmailSet = new Set<string>(['yvzsltn61@gmail.com']);
      try {
        const adminsDoc = await getDoc(doc(db, "metadata", "admins"));
        if (adminsDoc.exists()) {
          const emails = adminsDoc.data().emails;
          if (Array.isArray(emails)) {
            emails.forEach(value => {
              if (typeof value === 'string' && value.trim()) {
                adminEmailSet.add(value.trim().toLowerCase());
              }
            });
          }
        }
      } catch {
        // metadata/admins missing olsa da kalici admin adresi ile devam edilir.
      }

      if (adminEmailSet.size === 0) {
        throw new Error('NO_ADMIN_RECIPIENT');
      }

      const currentUserDoc = await getDoc(doc(db, "users", currentUser.uid));
      const currentUserData = currentUserDoc.exists()
        ? currentUserDoc.data() as { username?: unknown }
        : {};
      const senderDisplay = (typeof currentUserData.username === 'string' && currentUserData.username.trim())
        ? currentUserData.username.trim()
        : (currentUser.email || currentUser.uid);
      const senderEmail = (currentUser.email || '').trim().toLowerCase();
      const now = Date.now();

      await Promise.all(Array.from(adminEmailSet).map(recipientEmail => setDoc(doc(collection(db, "adminNotifications")), {
        type: 'blocked_contact',
        recipientEmail,
        senderUid: currentUser.uid,
        senderDisplay,
        senderEmail,
        templateId: selectedTemplate.id,
        templateLabel: selectedTemplate.label,
        templateMessage: selectedTemplate.message,
        createdAt: now,
        read: false,
      })));

      setBlockedMessageFeedback({
        type: 'success',
        message: 'Mesajiniz yoneticiye iletildi. Inceleme yapildiginda bilgilendirileceksiniz.',
      });
    } catch (error) {
      console.error("Engelli kullanici bildirim gonderme hatasi:", error);
      setBlockedMessageFeedback({
        type: 'error',
        message: 'Mesaj gonderilemedi. Lutfen daha sonra tekrar deneyin.',
      });
    } finally {
      setBlockedMessageSending(false);
    }
  };

  // --- Auth Handlers ---
  const handleLogin = (role: UserRole) => {
    setLoading(true);
    setUserRole(role);
  };

  const handleLogout = async () => {
    try {
        await signOut(auth);
        setUserRole(null);
        setUserAccessStatus('approved');
        setTooltip(null);
        setIsSearchOpen(false);
        setIsRecipeBookOpen(false);
        setIsMessagingOpen(false);
        setUnreadMessageSenderCount(0);
        setUnreadAdminNotificationCount(0);
        setModalOpen(false);
        setUserBlockInfo(DEFAULT_USER_BLOCK_INFO);
        setBlockedTemplateId(BLOCKED_CONTACT_TEMPLATES[0].id);
        setBlockedMessageFeedback(null);
    } catch (error) {
        console.error("Çıkış hatası:", error);
    }
  };

  // --- Name Update Handlers (Commit) ---

  const commitAccountName = () => {
    if (!canEditData) {
      if (activeAccount) setTempAccountName(activeAccount.name);
      return;
    }
    const newAccounts = accounts.map(acc =>
      acc.id === selectedAccountId ? { ...acc, name: tempAccountName } : acc
    );
    updateAccountsState(newAccounts);
    setHasUnsavedChanges(true);
  };

  const commitCharacterName = () => {
    if (!canEditData) {
      if (activeChar) setTempCharName(activeChar.name);
      return;
    }
    if (!activeAccount || !activeServer) return;
    const newChars = [...activeServer.characters];
    newChars[activeCharIndex] = { ...newChars[activeCharIndex], name: tempCharName };
    const newAccounts = accounts.map(acc => {
        if (acc.id !== selectedAccountId) return acc;
        const newServers = [...acc.servers];
        newServers[selectedServerIndex] = { ...newServers[selectedServerIndex], characters: newChars };
        return { ...acc, servers: newServers };
    });
    updateAccountsState(newAccounts);
    setHasUnsavedChanges(true);
  };

  const handleMoveAccount = (direction: 'up' | 'down') => {
    if (!ensureCanEditData()) return;
    const currentIndex = accounts.findIndex(acc => acc.id === selectedAccountId);
    if (currentIndex < 0) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= accounts.length) return;

    const newAccounts = [...accounts];
    [newAccounts[currentIndex], newAccounts[targetIndex]] = [newAccounts[targetIndex], newAccounts[currentIndex]];
    setAccounts(newAccounts);
    setHasUnsavedChanges(true);
  };

  type ImportContainerKey = 'bank1' | 'bank2' | 'bag' | 'learned';
  type ParsedImportRow = Record<string, string>;

  const normalizeImportText = (value: unknown) => (
    String(value ?? '')
      .trim()
      .toLocaleLowerCase('tr')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ı/g, 'i')
      .replace(/[^a-z0-9]+/g, '')
  );

  const detectDelimiter = (text: string) => {
    const firstLine = text.split(/\r?\n/).find(line => line.trim() !== '') || '';
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semicolonCount = (firstLine.match(/;/g) || []).length;
    return semicolonCount > commaCount ? ';' : ',';
  };

  const parseDelimitedRows = (text: string, delimiter: string): string[][] => {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            currentCell += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          currentCell += ch;
        }
        continue;
      }

      if (ch === '"') {
        inQuotes = true;
        continue;
      }

      if (ch === delimiter) {
        currentRow.push(currentCell.trim());
        currentCell = '';
        continue;
      }

      if (ch === '\r') {
        continue;
      }

      if (ch === '\n') {
        currentRow.push(currentCell.trim());
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
        continue;
      }

      currentCell += ch;
    }

    currentRow.push(currentCell.trim());
    rows.push(currentRow);
    return rows.filter(row => row.some(cell => cell.trim() !== ''));
  };

  const getImportField = (row: ParsedImportRow, aliases: string[]) => {
    for (const alias of aliases) {
      const normalizedAlias = normalizeImportText(alias);
      if (normalizedAlias in row) {
        return row[normalizedAlias];
      }
    }
    return '';
  };

  const parseImportBoolean = (value: string) => {
    const token = normalizeImportText(value);
    return ['evet', 'yes', 'true', '1', 'okundu', 'okunmus'].includes(token);
  };

  const parseImportPositiveInt = (value: string, fallback: number) => {
    const parsed = Number.parseInt(String(value).trim(), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
  };

  const resolveContainerKey = (value: string): ImportContainerKey | null => {
    const token = normalizeImportText(value);
    if (!token) return null;

    if (['kasa1', 'bank1', 'kasa01'].includes(token)) return 'bank1';
    if (['kasa2', 'bank2', 'kasa02'].includes(token)) return 'bank2';
    if (['canta', 'cantasi', 'bag'].includes(token)) return 'bag';
    if (['recetekitabi', 'recipebook', 'okunmusrecete', 'learnedrecipes'].includes(token)) return 'learned';
    return null;
  };

  const resolveListValue = (options: readonly string[], rawValue: string, fallback: string) => {
    const token = normalizeImportText(rawValue);
    if (!token) return fallback;
    const matched = options.find(option => normalizeImportText(option) === token);
    return matched || fallback;
  };

  const openExcelImportPicker = () => {
    if (!ensureCanEditData()) return;
    excelImportInputRef.current?.click();
  };

  const parseXlsxToRows = (buffer: ArrayBuffer): string[][] => {
    const wb = XLSX.read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) return [];
    const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    return raw.map(row => row.map(cell => String(cell ?? '').trim()));
  };

  const handleExcelImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!ensureCanEditData()) {
      event.target.value = '';
      return;
    }

    setIsImportingExcel(true);

    try {
      const fileNameLower = file.name.toLocaleLowerCase();
      const isExcelFile = fileNameLower.endsWith('.xlsx') || fileNameLower.endsWith('.xls');
      const isCsvFile = fileNameLower.endsWith('.csv') || fileNameLower.endsWith('.txt');

      if (!isExcelFile && !isCsvFile) {
        showSystemAlert({
          tone: 'warning',
          title: 'Desteklenmeyen Dosya',
          message: 'Desteklenen formatlar: .xlsx, .xls, .csv, .txt',
        });
        return;
      }

      let rows: string[][];

      if (isExcelFile) {
        const buffer = await file.arrayBuffer();
        rows = parseXlsxToRows(buffer);
      } else {
        const rawText = await file.text();
        if (!rawText.trim()) {
          showSystemAlert({
            tone: 'error',
            title: 'Import Hatasi',
            message: 'Dosya bos gorunuyor. Lutfen gecerli satirlari olan bir dosya secin.',
          });
          return;
        }
        const sanitizedText = rawText.replace(/^\uFEFF/, '');
        rows = parseDelimitedRows(sanitizedText, detectDelimiter(sanitizedText));
      }
      if (rows.length < 2) {
        showSystemAlert({
          tone: 'error',
          title: 'Import Hatasi',
          message: 'Baslik ve veri satirlari bulunamadi. Lutfen ornek formata gore dosya yukleyin.',
        });
        return;
      }

      const header = rows[0].map(cell => normalizeImportText(cell));
      const dataRows = rows.slice(1);
      const parsedRows: ParsedImportRow[] = dataRows.map(row => {
        const mapped: ParsedImportRow = {};
        header.forEach((key, idx) => {
          if (!key) return;
          if (!(key in mapped)) mapped[key] = (row[idx] || '').trim();
        });
        return mapped;
      });

      const nextAccounts = structuredClone(accounts) as Account[];
      const categoryMap = new Map(CATEGORY_OPTIONS.map(cat => [normalizeImportText(cat), cat]));
      const fallbackAccountName = activeAccount?.name || '';
      const fallbackServerName = activeServer?.name || '';
      const fallbackCharName = activeChar?.name || '';

      const defaultHeroClass = HERO_CLASSES[0] as ItemData['heroClass'];
      const allHeroClass = (HERO_CLASSES.find(c => normalizeImportText(c) === 'tumsiniflar') || defaultHeroClass) as ItemData['heroClass'];
      const defaultGender = GENDER_OPTIONS[0] as ItemData['gender'];
      const allGender = (GENDER_OPTIONS.find(g => normalizeImportText(g) === 'tumcinsiyetler') || defaultGender) as ItemData['gender'];

      const genderlessCategories = new Set(['silah', 'yuzuk', 'kolye', 'tilsim', 'iksir', 'maden', 'diger']);
      const classlessCategories = new Set(['gozluk', 'yuzuk', 'kolye', 'iksir', 'maden', 'diger']);

      const issues: string[] = [];
      let appliedCount = 0;
      let skippedCount = 0;
      let createdAccountCount = 0;
      let createdCharacterCount = 0;

      parsedRows.forEach((parsedRow, index) => {
        const rowNo = index + 2;
        const accountName = getImportField(parsedRow, ['hesap', 'account']) || fallbackAccountName || `Hesap ${nextAccounts.length + 1}`;
        const serverName = getImportField(parsedRow, ['sunucu', 'server']) || fallbackServerName;
        const characterName = getImportField(parsedRow, ['karakter', 'character', 'char']) || fallbackCharName;
        const containerName = getImportField(parsedRow, ['kasacanta', 'kasa', 'container']);

        const accountToken = normalizeImportText(accountName);
        const serverToken = normalizeImportText(serverName);
        const characterToken = normalizeImportText(characterName);

        let targetAccount = nextAccounts.find(acc => normalizeImportText(acc.name) === accountToken);
        if (!targetAccount) {
          targetAccount = createAccount(crypto.randomUUID(), accountName);
          nextAccounts.push(targetAccount);
          createdAccountCount++;
        }

        if (!serverToken) {
          skippedCount++;
          if (issues.length < 6) issues.push(`Satir ${rowNo}: Sunucu bilgisi bos.`);
          return;
        }

        const targetServer = targetAccount.servers.find(server => normalizeImportText(server.name) === serverToken);
        if (!targetServer) {
          skippedCount++;
          if (issues.length < 6) issues.push(`Satir ${rowNo}: Sunucu bulunamadi (${serverName}).`);
          return;
        }

        let targetChar = targetServer.characters.find(char => normalizeImportText(char.name) === characterToken);
        if (!targetChar && characterName.trim() !== '') {
          const nextCharId = targetServer.characters.reduce((maxId, char) => {
            const id = typeof char.id === 'number' ? char.id : -1;
            return Math.max(maxId, id);
          }, -1) + 1;
          const newChar = createCharacter(nextCharId);
          newChar.name = characterName;
          targetServer.characters.push(newChar);
          targetChar = newChar;
          createdCharacterCount++;
        }

        if (!targetChar) {
          skippedCount++;
          if (issues.length < 6) issues.push(`Satir ${rowNo}: Karakter bulunamadi (${characterName || '-'})`);
          return;
        }

        const containerKey = resolveContainerKey(containerName);
        if (!containerKey) {
          skippedCount++;
          if (issues.length < 6) issues.push(`Satir ${rowNo}: Kasa/Canta alani gecersiz (${containerName || '-'})`);
          return;
        }

        const categoryRaw = getImportField(parsedRow, ['kategori', 'category']);
        const category = categoryMap.get(normalizeImportText(categoryRaw));
        if (!category) {
          skippedCount++;
          if (issues.length < 6) issues.push(`Satir ${rowNo}: Kategori gecersiz (${categoryRaw || '-'})`);
          return;
        }

        const typeRaw = getImportField(parsedRow, ['tur', 'type']);
        const typeToken = normalizeImportText(typeRaw);
        const readRaw = getImportField(parsedRow, ['okunmus', 'okundu', 'read']);
        const isRead = parseImportBoolean(readRaw);
        const isRecipeType = typeToken === 'recipe' || typeToken === 'recete' || containerKey === 'learned' || isRead;

        const enchantment1 = getImportField(parsedRow, ['efsun1', 'enchantment1']).replace(/^-+$/, '').trim();
        const enchantment2 = getImportField(parsedRow, ['efsun2', 'enchantment2']).replace(/^-+$/, '').trim();
        const talismanTierRaw = getImportField(parsedRow, ['kademe', 'tier', 'talismantier', 'tilsimkademe']);

        const categoryToken = normalizeImportText(category);
        const importedTalismanTier = categoryToken === 'tilsim'
          ? (normalizeTalismanTierSuggestion(talismanTierRaw)
            || normalizeTalismanTierSuggestion(enchantment2)
            || 'I')
          : undefined;
        const importedEnchantment2 = categoryToken === 'tilsim'
          ? (normalizeTalismanColorSuggestion(enchantment2) || 'Mavi')
          : enchantment2;
        const heroClassRaw = getImportField(parsedRow, ['sinif', 'class', 'heroclass']);
        const genderRaw = getImportField(parsedRow, ['cinsiyet', 'gender']);

        const heroClass = (
          classlessCategories.has(categoryToken)
            ? allHeroClass
            : resolveListValue(HERO_CLASSES, heroClassRaw, defaultHeroClass)
        ) as ItemData['heroClass'];

        const gender = (
          genderlessCategories.has(categoryToken)
            ? allGender
            : resolveListValue(GENDER_OPTIONS, genderRaw, defaultGender)
        ) as ItemData['gender'];

        const level = Math.min(59, parseImportPositiveInt(getImportField(parsedRow, ['seviye', 'level']), 1));
        const count = parseImportPositiveInt(getImportField(parsedRow, ['adet', 'count']), 1);
        const weaponType = getImportField(parsedRow, ['silahcinsi', 'weapontype']).replace(/^-+$/, '').trim();
        const boundRaw = getImportField(parsedRow, ['bagli', 'bağlı', 'baglimi', 'bağlımı', 'bound', 'characterbound']);
        const isBound = !isRecipeType && isBindableCategory(category) ? parseImportBoolean(boundRaw) : false;

        const importedItem: ItemData = {
          id: crypto.randomUUID(),
          type: isRecipeType ? 'Recipe' : 'Item',
          category,
          enchantment1,
          enchantment2: importedEnchantment2,
          ...(importedTalismanTier ? { talismanTier: importedTalismanTier } : {}),
          heroClass,
          gender,
          level,
          count,
          weaponType,
          isRead: isRecipeType ? isRead || containerKey === 'learned' : false,
          isGlobal: false,
          isBound,
        };

        const shouldStoreInRecipeBook = importedItem.type === 'Recipe' && (importedItem.isRead || containerKey === 'learned');
        if (shouldStoreInRecipeBook) {
          const recipeSignature = `${normalizeImportText(importedItem.category)}|${normalizeImportText(importedItem.enchantment1)}|${normalizeImportText(importedItem.enchantment2)}|${normalizeImportText(importedItem.talismanTier || '')}|${normalizeImportText(importedItem.weaponType || '')}|${importedItem.level}|${normalizeImportText(importedItem.gender)}|${normalizeImportText(importedItem.heroClass)}|${importedItem.count || 1}`;
          const alreadyExists = targetChar.learnedRecipes.some(recipe => {
            const existingSignature = `${normalizeImportText(recipe.category)}|${normalizeImportText(recipe.enchantment1)}|${normalizeImportText(recipe.enchantment2)}|${normalizeImportText(recipe.talismanTier || '')}|${normalizeImportText(recipe.weaponType || '')}|${recipe.level}|${normalizeImportText(recipe.gender)}|${normalizeImportText(recipe.heroClass)}|${recipe.count || 1}`;
            return existingSignature === recipeSignature;
          });

          if (!alreadyExists) {
            targetChar.learnedRecipes.push({ ...importedItem, isRead: true });
            appliedCount++;
          } else {
            skippedCount++;
            if (issues.length < 6) issues.push(`Satir ${rowNo}: Reçete zaten tarif kitabinda mevcut.`);
          }
          return;
        }

        const rowValue = parseImportPositiveInt(getImportField(parsedRow, ['satir', 'row']), Number.NaN);
        const colValue = parseImportPositiveInt(getImportField(parsedRow, ['sutun', 'column', 'col']), Number.NaN);
        if (!Number.isFinite(rowValue) || !Number.isFinite(colValue)) {
          skippedCount++;
          if (issues.length < 6) issues.push(`Satir ${rowNo}: Satir/Sutun degeri gecersiz.`);
          return;
        }

        const targetContainer =
          containerKey === 'bank1' ? targetChar.bank1 :
          containerKey === 'bank2' ? targetChar.bank2 :
          targetChar.bag;

        const slotIndex = getContainerSlotIdFromPosition(targetContainer, rowValue, colValue);
        if (slotIndex === null || slotIndex < 0 || slotIndex >= targetContainer.slots.length) {
          skippedCount++;
          if (issues.length < 6) issues.push(`Satir ${rowNo}: Slot konumu kasa boyutunu asiyor.`);
          return;
        }

        targetContainer.slots[slotIndex] = { ...targetContainer.slots[slotIndex], item: importedItem };
        appliedCount++;
      });

      if (appliedCount === 0) {
        showSystemAlert({
          tone: 'error',
          title: 'Import Basarisiz',
          message: 'Uygulanabilir satir bulunamadi. Dosya formatini kontrol edin.',
          hint: issues[0] || 'Ornek dosyayi baz alin: ornek-import.csv / .xlsx',
        });
        return;
      }

      setAccounts(nextAccounts);
      setHasUnsavedChanges(true);

      const currentUser = auth.currentUser;
      if (!currentUser) {
        showSystemAlert({
          tone: 'warning',
          title: 'Import Tamamlandi',
          message: 'Veriler local olarak eklendi ancak buluta kayit icin tekrar giris yapmaniz gerekiyor.',
        });
        return;
      }

      try {
        await setDoc(doc(db, "users", currentUser.uid), { accounts: nextAccounts }, { merge: true });
        setHasUnsavedChanges(false);
        setSaveNotification({
          type: 'success',
          message: `Import tamamlandi: ${appliedCount} satir eklendi${skippedCount > 0 ? `, ${skippedCount} satir atlandi.` : '.'}`,
        });
        setTimeout(() => setSaveNotification(null), 3500);
      } catch {
        setHasUnsavedChanges(true);
        showSystemAlert({
          tone: 'warning',
          title: 'Import Edildi, Buluta Kaydedilemedi',
          message: 'Veriler eklenmis durumda. Lutfen Kaydet butonuna basarak tekrar deneyin.',
        });
      }

      if (skippedCount > 0 || createdAccountCount > 0 || createdCharacterCount > 0) {
        const summary: string[] = [];
        if (createdAccountCount > 0) summary.push(`${createdAccountCount} yeni hesap`);
        if (createdCharacterCount > 0) summary.push(`${createdCharacterCount} yeni karakter`);
        if (skippedCount > 0) summary.push(`${skippedCount} atlanan satir`);

        showSystemAlert({
          tone: 'info',
          title: 'Import Ozeti',
          message: summary.join(', ') || 'Import islemi tamamlandi.',
          hint: issues.length > 0 ? issues.join(' | ') : undefined,
        });
      }
    } finally {
      event.target.value = '';
      setIsImportingExcel(false);
    }
  };


  // --- Export Excel (XLSX) ---
  const handleExportExcel = () => {
    if (!activeAccount) return;

    const rows: (string | number)[][] = [
      ["Hesap", "Sunucu", "Karakter", "Kasa/Çanta", "Satır", "Sütun", "Efsun 1", "Efsun 2", "Kademe", "Kategori", "Tür", "Silah Cinsi", "Bağlı", "Seviye", "Cinsiyet", "Sınıf", "Okunmuş", "Adet"]
    ];

    activeAccount.servers.forEach(server => {
      server.characters.forEach(char => {
        [char.bank1, char.bank2, char.bag].forEach(container => {
          container.slots.forEach(slot => {
            if (slot.item) {
              const position = getContainerSlotPosition(container, slot.id);
              if (!position) return;
              rows.push([
                activeAccount.name, server.name, char.name, container.name, position.row, position.col,
                slot.item.enchantment1 || "-", slot.item.enchantment2 || "-",
                slot.item.category === 'Tılsım' ? resolveItemTalismanTier(slot.item) : "-",
                slot.item.category,
                slot.item.type || "Item",
                slot.item.weaponType || "-",
                shouldShowBoundMarker(slot.item) ? "Evet" : "Hayır",
                slot.item.level, slot.item.gender || "-", slot.item.heroClass, "Hayır",
                slot.item.count || 1
              ]);
            }
          });
        });

        char.learnedRecipes.forEach(item => {
          rows.push([
              activeAccount.name, server.name, char.name, "Reçete Kitabı", "-", "-",
              item.enchantment1 || "-", item.enchantment2 || "-",
              item.category === 'Tılsım' ? resolveItemTalismanTier(item) : "-",
              item.category,
              "Recipe",
              item.weaponType || "-",
              "Hayır",
              item.level, item.gender || "-", item.heroClass, "Evet",
              item.count || 1
          ]);
        });
      });
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Envanter");
    XLSX.writeFile(wb, `${activeAccount.name}_rpg_export.xlsx`);
  };

  // --- Search Navigation ---
  const handleSearchResultNavigate = (accountId: string, serverIndex: number, charIndex: number, viewIndex: number, openBook?: boolean) => {
    setSelectedAccountId(accountId);
    setSelectedServerIndex(serverIndex);
    setActiveCharIndex(charIndex);
    setCurrentViewIndex(viewIndex);
    if (openBook) {
        setIsRecipeBookOpen(true);
    } else {
        setIsRecipeBookOpen(false);
    }
  };

  // --- Item Management ---

  const handleMoveItem = (containerId: string, fromSlotId: number, toSlotId: number) => {
    if (!ensureCanEditData()) return;
    if (fromSlotId === toSlotId) return;
    if (!activeAccount) return;

    setAccounts(prevAccounts => prevAccounts.map(acc => {
      if (acc.id !== selectedAccountId) return acc;

      const newServers = [...acc.servers];
      const newServer = { ...newServers[selectedServerIndex] };
      const newChars = [...newServer.characters];
      const targetChar = { ...newChars[activeCharIndex] };

      let targetContainer: Container | null = null;
      let containerKey: 'bank1' | 'bank2' | 'bag' | null = null;

      if (targetChar.bank1.id === containerId) { targetContainer = targetChar.bank1; containerKey = 'bank1'; }
      else if (targetChar.bank2.id === containerId) { targetContainer = targetChar.bank2; containerKey = 'bank2'; }
      else if (targetChar.bag.id === containerId) { targetContainer = targetChar.bag; containerKey = 'bag'; }

      if (targetContainer && containerKey) {
        const newSlots = [...targetContainer.slots];
        const itemFrom = newSlots[fromSlotId].item;
        const itemTo = newSlots[toSlotId].item;

        newSlots[toSlotId] = { ...newSlots[toSlotId], item: itemFrom };
        newSlots[fromSlotId] = { ...newSlots[fromSlotId], item: itemTo };

        targetChar[containerKey] = { ...targetContainer, slots: newSlots };
        newChars[activeCharIndex] = targetChar;
      }

      newServer.characters = newChars;
      newServers[selectedServerIndex] = newServer;
      return { ...acc, servers: newServers };
    }));
    setHasUnsavedChanges(true);
  };

  const updateSlot = (containerId: string, slotId: number, item: ItemData | null) => {
    if (!canEditData) return;
    if (!activeAccount) return;

    setAccounts(prevAccounts => prevAccounts.map(acc => {
      if (acc.id !== selectedAccountId) return acc;

      const newServers = [...acc.servers];
      const newServer = { ...newServers[selectedServerIndex] };
      const newChars = [...newServer.characters];
      const targetChar = { ...newChars[activeCharIndex] };

      let targetContainer: Container | null = null;
      let containerKey: 'bank1' | 'bank2' | 'bag' | null = null;

      if (targetChar.bank1.id === containerId) { targetContainer = targetChar.bank1; containerKey = 'bank1'; }
      else if (targetChar.bank2.id === containerId) { targetContainer = targetChar.bank2; containerKey = 'bank2'; }
      else if (targetChar.bag.id === containerId) { targetContainer = targetChar.bag; containerKey = 'bag'; }

      if (targetContainer && containerKey) {
        const newSlots = [...targetContainer.slots];
        newSlots[slotId] = { ...newSlots[slotId], item };
        targetChar[containerKey] = { ...targetContainer, slots: newSlots };
        newChars[activeCharIndex] = targetChar;
      }

      newServer.characters = newChars;
      newServers[selectedServerIndex] = newServer;
      return { ...acc, servers: newServers };
    }));
  };

  const updateMultipleSlots = (containerId: string, updates: { slotId: number; item: ItemData }[]) => {
    if (!canEditData) return;
    if (!activeAccount) return;

    setAccounts(prevAccounts => prevAccounts.map(acc => {
      if (acc.id !== selectedAccountId) return acc;

      const newServers = [...acc.servers];
      const newServer = { ...newServers[selectedServerIndex] };
      const newChars = [...newServer.characters];
      const targetChar = { ...newChars[activeCharIndex] };

      let targetContainer: Container | null = null;
      let containerKey: 'bank1' | 'bank2' | 'bag' | null = null;

      if (targetChar.bank1.id === containerId) { targetContainer = targetChar.bank1; containerKey = 'bank1'; }
      else if (targetChar.bank2.id === containerId) { targetContainer = targetChar.bank2; containerKey = 'bank2'; }
      else if (targetChar.bag.id === containerId) { targetContainer = targetChar.bag; containerKey = 'bag'; }

      if (targetContainer && containerKey) {
        const newSlots = [...targetContainer.slots];
        for (const update of updates) {
          newSlots[update.slotId] = { ...newSlots[update.slotId], item: update.item };
        }
        targetChar[containerKey] = { ...targetContainer, slots: newSlots };
        newChars[activeCharIndex] = targetChar;
      }

      newServer.characters = newChars;
      newServers[selectedServerIndex] = newServer;
      return { ...acc, servers: newServers };
    }));
  };

  const handleReadRecipe = (item: ItemData) => {
      if (!ensureCanEditData()) return;
      if (!activeAccount || !activeSlot) return;

      setAccounts(prevAccounts => prevAccounts.map(acc => {
        if (acc.id !== selectedAccountId) return acc;

        const newServers = [...acc.servers];
        const newServer = { ...newServers[selectedServerIndex] };
        const newChars = [...newServer.characters];
        const targetChar = { ...newChars[activeCharIndex] };

        targetChar.learnedRecipes = [...targetChar.learnedRecipes, item];

        let targetContainer: Container | null = null;
        let containerKey: 'bank1' | 'bank2' | 'bag' | null = null;

        if (targetChar.bank1.id === activeSlot.containerId) { targetContainer = targetChar.bank1; containerKey = 'bank1'; }
        else if (targetChar.bank2.id === activeSlot.containerId) { targetContainer = targetChar.bank2; containerKey = 'bank2'; }
        else if (targetChar.bag.id === activeSlot.containerId) { targetContainer = targetChar.bag; containerKey = 'bag'; }

        if (targetContainer && containerKey) {
            const newSlots = [...targetContainer.slots];
            newSlots[activeSlot.slotId] = { ...newSlots[activeSlot.slotId], item: null };
            targetChar[containerKey] = { ...targetContainer, slots: newSlots };
        }

        newChars[activeCharIndex] = targetChar;
        newServer.characters = newChars;
        newServers[selectedServerIndex] = newServer;
        return { ...acc, servers: newServers };
      }));
      setHasUnsavedChanges(true);
  };

  const handleUnlearnRecipe = (recipeId: string) => {
    if (!ensureCanEditData()) return;
    setAccounts(prevAccounts => prevAccounts.map(acc => {
        if (acc.id !== selectedAccountId) return acc;
        const newServers = [...acc.servers];
        const newServer = { ...newServers[selectedServerIndex] };
        const newChars = [...newServer.characters];
        const targetChar = { ...newChars[activeCharIndex] };
        targetChar.learnedRecipes = targetChar.learnedRecipes.filter(r => r.id !== recipeId);
        newChars[activeCharIndex] = targetChar;
        newServer.characters = newChars;
        newServers[selectedServerIndex] = newServer;
        return { ...acc, servers: newServers };
    }));
    setHasUnsavedChanges(true);
  };

  const handleEditRecipe = (recipe: ItemData) => {
    if (!ensureCanEditData()) return;
    setEditingRecipe(recipe);
    setIsRecipeEditModalOpen(true);
  };

  const handleSaveEditedRecipe = (item: ItemData) => {
    if (!ensureCanEditData()) return;
    setAccounts(prevAccounts => prevAccounts.map(acc => {
        if (acc.id !== selectedAccountId) return acc;
        const newServers = [...acc.servers];
        const newServer = { ...newServers[selectedServerIndex] };
        const newChars = [...newServer.characters];
        const targetChar = { ...newChars[activeCharIndex] };
        targetChar.learnedRecipes = targetChar.learnedRecipes.map(r =>
            r.id === item.id ? item : r
        );
        newChars[activeCharIndex] = targetChar;
        newServer.characters = newChars;
        newServers[selectedServerIndex] = newServer;
        return { ...acc, servers: newServers };
    }));
    setIsRecipeEditModalOpen(false);
    setEditingRecipe(null);
    setHasUnsavedChanges(true);
  };

  const handleDeleteEditedRecipe = () => {
    if (!ensureCanEditData()) return;
    if (editingRecipe) {
        handleUnlearnRecipe(editingRecipe.id);
        setIsRecipeEditModalOpen(false);
        setEditingRecipe(null);
    }
  };

  const handleSlotClick = (containerId: string, slotId: number) => {
    setTooltip(null);

    if (!activeChar) return;

    // Find the container and check if slot has an item
    let container: Container | undefined;
    if (activeChar.bank1.id === containerId) container = activeChar.bank1;
    else if (activeChar.bank2.id === containerId) container = activeChar.bank2;
    else if (activeChar.bag.id === containerId) container = activeChar.bag;

    // Multi-select mode: toggle selection on item slots
    if (multiSelectMode) {
      const item = container?.slots[slotId]?.item;
      if (item) {
        setSelectedSlotIds(prev => {
          const next = new Set(prev);
          if (next.has(slotId)) next.delete(slotId);
          else next.add(slotId);
          return next;
        });
      }
      return;
    }

    const item = container?.slots[slotId]?.item;

    if (item) {
      // Show detail modal for existing items
      setDetailItem(item);
      setDetailSlot({ containerId, slotId });
    } else {
      // Empty slot: if clipboard has items, paste; otherwise open ItemModal
      if (clipboardItems.length > 0) {
        if (!ensureCanEditData()) return;
        if (clipboardItems.length === 1) {
          // Single item paste (repeatable)
          const pastedItem: ItemData = { ...clipboardItems[0], id: crypto.randomUUID(), isGlobal: false };
          updateSlot(containerId, slotId, pastedItem);
          setHasUnsavedChanges(true);
          showToast('Eşya yapıştırıldı!');
        } else {
          // Bulk paste: starting from clicked slot, fill empty slots in order
          if (!container) return;
          const sortedSlotIds = container.slots.map(s => s.id).filter(id => id >= slotId).sort((a, b) => a - b);
          const updates: { slotId: number; item: ItemData }[] = [];
          let itemIndex = 0;
          for (const sid of sortedSlotIds) {
            if (itemIndex >= clipboardItems.length) break;
            const existingItem = container.slots[sid]?.item;
            if (!existingItem) {
              updates.push({ slotId: sid, item: { ...clipboardItems[itemIndex], id: crypto.randomUUID(), isGlobal: false } });
              itemIndex++;
            }
          }
          if (updates.length > 0) {
            updateMultipleSlots(containerId, updates);
            setHasUnsavedChanges(true);
            showToast(`${updates.length} eşya yapıştırıldı!`);
          }
          setClipboardItems([]);
        }
        return;
      }
      if (!ensureCanEditData()) return;
      // Open ItemModal for creating new item in empty slot
      setActiveSlot({ containerId, slotId });
      setModalOpen(true);
    }
  };

  const handleEditFromDetail = () => {
    if (!ensureCanEditData()) return;
    if (detailSlot) {
      setActiveSlot(detailSlot);
      setModalOpen(true);
    }
    setDetailItem(null);
    setDetailSlot(null);
  };

  const handleCopyItem = () => {
    if (!detailItem) return;
    const copied: ItemData = { ...detailItem, isGlobal: false };
    setClipboardItems([copied]);
    setDetailItem(null);
    setDetailSlot(null);
    showToast('Eşya panoya kopyalandı!');
  };

  const handleCraftTalismanDuplicates = () => {
    if (!ensureCanEditData()) return;
    if (!activeAccount || !activeChar || !talismanLocations || talismanLocations.length < 3) return;

    const firstThreeTargets = talismanLocations
      .slice(0, 3)
      .map(loc => {
        const container =
          loc.containerId === activeChar.bank1.id ? activeChar.bank1 :
          loc.containerId === activeChar.bank2.id ? activeChar.bank2 :
          loc.containerId === activeChar.bag.id ? activeChar.bag :
          null;
        if (!container) return null;
        const slotId = getContainerSlotIdFromPosition(container, loc.row, loc.col);
        if (slotId === null) return null;
        return { containerId: container.id, slotId };
      })
      .filter((target): target is { containerId: string; slotId: number } => target !== null);

    if (firstThreeTargets.length < 3) return;

    const targetKeys = new Set(firstThreeTargets.map(target => `${target.containerId}:${target.slotId}`));

    setAccounts(prevAccounts => prevAccounts.map(acc => {
      if (acc.id !== selectedAccountId) return acc;

      const newServers = [...acc.servers];
      const newServer = { ...newServers[selectedServerIndex] };
      const newChars = [...newServer.characters];
      const targetChar = { ...newChars[activeCharIndex] };

      const clearContainerTargets = (container: Container): Container => {
        const slotIds = firstThreeTargets
          .filter(target => target.containerId === container.id)
          .map(target => target.slotId);

        if (slotIds.length === 0) return container;

        const slotIdSet = new Set(slotIds);
        const newSlots = container.slots.map((slot, index) => (
          slotIdSet.has(index) ? { ...slot, item: null } : slot
        ));
        return { ...container, slots: newSlots };
      };

      targetChar.bank1 = clearContainerTargets(targetChar.bank1);
      targetChar.bank2 = clearContainerTargets(targetChar.bank2);
      targetChar.bag = clearContainerTargets(targetChar.bag);

      newChars[activeCharIndex] = targetChar;
      newServer.characters = newChars;
      newServers[selectedServerIndex] = newServer;
      return { ...acc, servers: newServers };
    }));

    if (detailSlot && targetKeys.has(`${detailSlot.containerId}:${detailSlot.slotId}`)) {
      setDetailItem(null);
      setDetailSlot(null);
    }

    setHasUnsavedChanges(true);
    showToast('İlk 3 duplikasyon konumu üretim için silindi.');
  };

  const handleClearClipboard = () => {
    setClipboardItems([]);
  };

  // Multi-select handlers
  const handleToggleMultiSelect = () => {
    setMultiSelectMode(prev => !prev);
    setSelectedSlotIds(new Set());
  };

  const handleToggleSlotSelection = (slotId: number) => {
    setSelectedSlotIds(prev => {
      const next = new Set(prev);
      if (next.has(slotId)) next.delete(slotId);
      else next.add(slotId);
      return next;
    });
  };

  const handleBulkCopy = () => {
    if (!activeChar || selectedSlotIds.size === 0) return;
    const currentContainer = activeChar[VIEW_ORDER[currentViewIndex]];
    if (!currentContainer) return;
    const items: ItemData[] = [];
    [...selectedSlotIds].sort((a, b) => a - b).forEach(slotId => {
      const item = currentContainer.slots[slotId]?.item;
      if (item) items.push({ ...item, isGlobal: false });
    });
    setClipboardItems(items);
    setMultiSelectMode(false);
    setSelectedSlotIds(new Set());
    showToast(`${items.length} eşya panoya kopyalandı!`);
  };

  const handleCancelSelection = () => {
    setMultiSelectMode(false);
    setSelectedSlotIds(new Set());
  };

  const handleSlotHover = (item: ItemData | null, e: React.MouseEvent) => {
    if (item) {
      setTooltip({ item, x: e.clientX, y: e.clientY });
    } else {
      setTooltip(null);
    }
  };

  const syncGlobalItem = async (item: ItemData) => {
    const user = auth.currentUser;
    if (!user || !activeAccount || !activeServer || !activeChar) return;

    const globalDocRef = doc(db, "globalItems", item.id);

    try {
      if (item.isGlobal) {
        const containerName = VIEW_ORDER[currentViewIndex] === 'bank1' ? 'Kasa 1'
          : VIEW_ORDER[currentViewIndex] === 'bank2' ? 'Kasa 2' : 'Çanta';

        await setDoc(globalDocRef, {
          uid: user.uid,
          username: username || user.email || '',
          accountName: activeAccount.name,
          serverName: activeServer.name,
          charName: activeChar.name,
          containerName,
          item,
          socialLink: socialLink || '',
          updatedAt: Date.now(),
        });
      } else {
        // If not global, try to delete from globalItems (may not exist)
        await deleteDoc(globalDocRef).catch(() => {});
      }
    } catch (error) {
      console.error("Global item sync error:", error);
    }
  };

  const handleSaveItem = (item: ItemData) => {
    if (!ensureCanEditData()) return;
    if (!activeAccount || !activeSlot) return;

    if (item.type === 'Recipe' && item.isRead) {
        setAccounts(prevAccounts => prevAccounts.map(acc => {
            if (acc.id !== selectedAccountId) return acc;

            const newServers = [...acc.servers];
            const newServer = { ...newServers[selectedServerIndex] };
            const newChars = [...newServer.characters];
            const targetChar = { ...newChars[activeCharIndex] };

            const existingIdx = targetChar.learnedRecipes.findIndex(r => r.id === item.id);
            if (existingIdx !== -1) {
                targetChar.learnedRecipes[existingIdx] = item;
            } else {
                targetChar.learnedRecipes = [...targetChar.learnedRecipes, item];
            }

            let targetContainer: Container | null = null;
            let containerKey: 'bank1' | 'bank2' | 'bag' | null = null;

            if (targetChar.bank1.id === activeSlot.containerId) { targetContainer = targetChar.bank1; containerKey = 'bank1'; }
            else if (targetChar.bank2.id === activeSlot.containerId) { targetContainer = targetChar.bank2; containerKey = 'bank2'; }
            else if (targetChar.bag.id === activeSlot.containerId) { targetContainer = targetChar.bag; containerKey = 'bag'; }

            if (targetContainer && containerKey) {
                const newSlots = [...targetContainer.slots];
                newSlots[activeSlot.slotId] = { ...newSlots[activeSlot.slotId], item: null };
                targetChar[containerKey] = { ...targetContainer, slots: newSlots };
            }

            newChars[activeCharIndex] = targetChar;
            newServer.characters = newChars;
            newServers[selectedServerIndex] = newServer;
            return { ...acc, servers: newServers };
        }));
    } else {
        updateSlot(activeSlot.containerId, activeSlot.slotId, item);
    }

    // Sync global item
    syncGlobalItem(item);

    // Admin ise silah cinsi önerilerine ekle
    if (userRole === 'admin' && item.category === 'Silah' && item.weaponType?.trim()) {
      const weaponType = item.weaponType.trim();
      setDoc(doc(db, "metadata", "weapons"), { names: arrayUnion(weaponType) }, { merge: true }).catch(() => {});
    }

    showToast('Kaydetmek için disket butonuna basmayı unutmayın!');
  };

  const handleDeleteItem = () => {
    if (!ensureCanEditData()) return;
    if (activeSlot) {
      const currentItem = getCurrentItem();
      updateSlot(activeSlot.containerId, activeSlot.slotId, null);
      setModalOpen(false);
      setHasUnsavedChanges(true);

      // Delete from globalItems if it was global
      if (currentItem) {
        const globalDocRef = doc(db, "globalItems", currentItem.id);
        deleteDoc(globalDocRef).catch(() => {});
      }
    }
  };

  const getCurrentItem = (): ItemData | null => {
    if (!activeSlot || !activeChar) return null;

    let container: Container | undefined;
    if (activeChar.bank1.id === activeSlot.containerId) container = activeChar.bank1;
    else if (activeChar.bank2.id === activeSlot.containerId) container = activeChar.bank2;
    else if (activeChar.bag.id === activeSlot.containerId) container = activeChar.bag;

    return container?.slots[activeSlot.slotId].item || null;
  };

  const handleNextView = () => {
    setCurrentViewIndex((prev) => (prev + 1) % VIEW_ORDER.length);
  };

  const handlePrevView = () => {
    setCurrentViewIndex((prev) => (prev - 1 + VIEW_ORDER.length) % VIEW_ORDER.length);
  };

  const toggleContainerFullscreen = () => {
    setIsContainerFullscreen((prev) => !prev);
  };

  useEffect(() => {
    if (!isContainerFullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsContainerFullscreen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isContainerFullscreen]);

  // Ctrl+C to copy from detail modal, Escape to clear clipboard / cancel selection
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && detailItem) {
        const selection = window.getSelection();
        if (selection && selection.toString().length > 0) return;
        e.preventDefault();
        const copied: ItemData = { ...detailItem, isGlobal: false };
        setClipboardItems([copied]);
        setDetailItem(null);
        setDetailSlot(null);
        showToast('Eşya panoya kopyalandı!');
      }
      if (e.key === 'Escape' && !detailItem && !modalOpen) {
        if (multiSelectMode) {
          setMultiSelectMode(false);
          setSelectedSlotIds(new Set());
          return;
        }
        if (clipboardItems.length > 0) {
          setClipboardItems([]);
          showToast('Pano temizlendi');
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [detailItem, clipboardItems, modalOpen, multiSelectMode]);

  // Clear multi-select when view/character/server/account changes
  useEffect(() => {
    setMultiSelectMode(false);
    setSelectedSlotIds(new Set());
  }, [currentViewIndex, activeCharIndex, selectedServerIndex, selectedAccountId]);

  useEffect(() => {
    if (!isMobileAccountMenuOpen) return;

    const handleOutside = (event: MouseEvent | TouchEvent) => {
      if (!mobileAccountMenuRef.current) return;
      if (mobileAccountMenuRef.current.contains(event.target as Node)) return;
      setIsMobileAccountMenuOpen(false);
    };

    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [isMobileAccountMenuOpen]);

  useEffect(() => {
    if (!isMobileQuickMenuOpen) return;

    const handleOutside = (event: MouseEvent | TouchEvent) => {
      if (!mobileQuickMenuRef.current) return;
      if (mobileQuickMenuRef.current.contains(event.target as Node)) return;
      setIsMobileQuickMenuOpen(false);
    };

    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [isMobileQuickMenuOpen]);

  useEffect(() => {
    if (!isMobileAccountActionsOpen) return;

    const handleOutside = (event: MouseEvent | TouchEvent) => {
      if (!mobileAccountActionsRef.current) return;
      if (mobileAccountActionsRef.current.contains(event.target as Node)) return;
      setIsMobileAccountActionsOpen(false);
    };

    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [isMobileAccountActionsOpen]);



  // --- RENDER MANTIĞI ---

  if (loading) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center text-yellow-500 font-bold gap-4">
        <Shield size={64} className="animate-bounce" />
        <div className="text-2xl animate-pulse">SUNUCUYA BAĞLANILIYOR...</div>
        <div className="text-xs text-slate-500 mt-2">Bulut Veritabanı Senkronizasyonu</div>
      </div>
    );
  }

  if (!userRole) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (isPendingApproval) {
    return (
      <div className="min-h-[100dvh] w-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(8,145,178,0.2),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,rgba(202,138,4,0.15),transparent_60%)]" />
        <div className="relative z-10 w-full max-w-xl rounded-2xl border border-cyan-800/45 bg-gradient-to-b from-slate-900/95 via-slate-900/90 to-slate-950/95 shadow-[0_28px_80px_rgba(2,6,23,0.75)] overflow-hidden">
          <div className="px-6 py-5 border-b border-cyan-900/40 bg-gradient-to-r from-cyan-950/40 to-slate-900/40">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl border border-cyan-700/45 bg-cyan-900/25">
                <CheckCircle size={18} className="text-cyan-300" />
              </div>
              <div>
                <h2 className="text-white font-bold text-lg">Onay Bekleniyor</h2>
                <p className="text-cyan-200/80 text-xs mt-0.5">Mail dogrulamasi tamamlandi, yonetici onayi bekleniyor.</p>
              </div>
            </div>
          </div>

          <div className="px-6 py-5 space-y-4">
            <div className="rounded-xl border border-cyan-900/45 bg-cyan-950/20 p-3">
              <p className="text-[11px] uppercase tracking-wider text-cyan-300/80 font-semibold">Durum</p>
              <p className="text-sm text-cyan-100 mt-1">Mail dogrulamasi yapildi ancak admin onayi bekleniyor.</p>
              <p className="text-[10px] text-slate-400 mt-2">Hesabiniz onaylandiginda cikis yapip tekrar giris yaparak sistemi kullanabilirsiniz.</p>
            </div>

            <button
              onClick={handleLogout}
              className="w-full py-2.5 rounded-lg text-sm font-bold border border-cyan-800/50 bg-cyan-950/35 text-cyan-200 hover:bg-cyan-900/45 transition-colors flex items-center justify-center gap-2"
            >
              <LogOut size={15} />
              Cikis Yap
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isBlockedUser) {
    const selectedTemplate = BLOCKED_CONTACT_TEMPLATES.find(template => template.id === blockedTemplateId) || BLOCKED_CONTACT_TEMPLATES[0];
    return (
      <div className="min-h-[100dvh] w-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(220,38,38,0.2),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,rgba(14,116,144,0.16),transparent_60%)]" />
        <div className="relative z-10 w-full max-w-xl rounded-2xl border border-red-800/45 bg-gradient-to-b from-slate-900/95 via-slate-900/90 to-slate-950/95 shadow-[0_28px_80px_rgba(2,6,23,0.75)] overflow-hidden">
          <div className="px-6 py-5 border-b border-red-900/40 bg-gradient-to-r from-red-950/45 to-slate-900/40">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl border border-red-700/45 bg-red-900/25">
                <Lock size={18} className="text-red-300" />
              </div>
              <div>
                <h2 className="text-white font-bold text-lg">Hesabiniz Gecici Olarak Engellendi</h2>
                <p className="text-red-200/80 text-xs mt-0.5">Bu hesap icin erisim yonetici tarafindan kisitlandi.</p>
              </div>
            </div>
          </div>

          <div className="px-6 py-5 space-y-4">
            <div className="rounded-xl border border-red-900/40 bg-red-950/20 p-3">
              <p className="text-[11px] uppercase tracking-wider text-red-300/80 font-semibold">Engel Nedeni</p>
              <p className="text-sm text-red-100 mt-1">{userBlockInfo.reasonLabel || 'Yonetici incelemesi devam ediyor.'}</p>
              {userBlockInfo.blockedAt && (
                <p className="text-[10px] text-red-200/70 mt-1">Tarih: {new Date(userBlockInfo.blockedAt).toLocaleString('tr-TR')}</p>
              )}
            </div>

            <div className="rounded-xl border border-cyan-900/45 bg-cyan-950/20 p-3 space-y-2">
              <p className="text-cyan-200 text-xs font-semibold">Yoneticiyle Iletisim (Kalıp Mesaj)</p>
              <p className="text-[11px] text-slate-400">Serbest mesaj yazamazsiniz. Asagidaki hazir metinlerden birini gonderebilirsiniz.</p>
              <select
                value={blockedTemplateId}
                onChange={(e) => {
                  setBlockedTemplateId(e.target.value as BlockContactTemplateId);
                  setBlockedMessageFeedback(null);
                }}
                className="w-full bg-slate-950/85 border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500/50"
                disabled={blockedMessageSending}
              >
                {BLOCKED_CONTACT_TEMPLATES.map(template => (
                  <option key={template.id} value={template.id}>{template.label}</option>
                ))}
              </select>
              <div className="rounded-lg border border-slate-700/60 bg-slate-950/75 px-3 py-2 text-xs text-slate-300 leading-relaxed">
                {selectedTemplate.message}
              </div>
              <button
                onClick={handleSendBlockedTemplateMessage}
                disabled={blockedMessageSending}
                className="w-full py-2 rounded-lg text-xs font-bold border border-cyan-700/50 bg-cyan-900/30 text-cyan-100 hover:bg-cyan-800/40 transition-colors disabled:opacity-60"
              >
                {blockedMessageSending ? 'Gonderiliyor...' : 'Mesaji Yoneticiye Gonder'}
              </button>
              {blockedMessageFeedback && (
                <div className={`rounded-lg border px-3 py-2 text-xs ${
                  blockedMessageFeedback.type === 'success'
                    ? 'border-emerald-800/50 bg-emerald-950/25 text-emerald-200'
                    : 'border-red-900/50 bg-red-950/25 text-red-200'
                }`}>
                  {blockedMessageFeedback.message}
                </div>
              )}
            </div>

            <button
              onClick={handleLogout}
              className="w-full py-2.5 rounded-lg text-sm font-bold border border-red-800/50 bg-red-950/35 text-red-200 hover:bg-red-900/45 transition-colors flex items-center justify-center gap-2"
            >
              <LogOut size={15} />
              Cikis Yap
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showAdminPanel && userRole === 'admin') {
    return <AdminPanel onBack={() => { handleCloseAdminPanel().catch(() => {}); }} />;
  }

  if (!activeAccount || !activeServer || !activeChar) return <div className="text-white p-10">Hesap verisi yüklenemedi. Lütfen sayfayı yenileyin.</div>;

  const currentView = VIEW_ORDER[currentViewIndex];
  const activeContainer = activeChar[currentView];
  const activeSlotCount = activeContainer.slots.filter(slot => !!slot.item).length;
  const filteredSlotCount = categoryFilter === 'All'
    ? activeSlotCount
    : activeContainer.slots.filter(slot => slot.item?.category === categoryFilter).length;
  const capacityPercent = Math.min(100, Math.round((activeSlotCount / Math.max(1, activeContainer.slots.length)) * 100));

  return (
    <div className={`h-[100dvh] w-screen bg-slate-950 flex overflow-hidden ${isContainerFullscreen ? '' : 'md:bg-gradient-to-br md:from-slate-950 md:via-slate-900 md:to-slate-950 md:items-center md:justify-center'}`}>
      <input
        ref={excelImportInputRef}
        type="file"
        accept=".csv,.txt,.xlsx,.xls,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        className="hidden"
        onChange={handleExcelImport}
      />

<div className={`w-full h-full bg-slate-900/95 flex flex-col relative overflow-hidden ${isContainerFullscreen ? 'border-0 rounded-none shadow-none' : 'md:w-[98vw] md:h-[98vh] border-0 md:border-2 md:border-slate-700 rounded-none md:rounded-lg shadow-none md:shadow-[0_0_50px_rgba(0,0,0,0.9)]'}`}>

        {!isContainerFullscreen && (
        <>
        {/* === HEADER === */}
        <div className="flex flex-col border-b-2 border-slate-700 shrink-0">

          {/* MOBILE TOP BAR */}
          <div className="md:hidden bg-gradient-to-b from-slate-800 to-slate-800/95">
            <div className="px-2 pt-2 pb-1 flex items-center gap-2">
              <div className="bg-gradient-to-br from-yellow-500/15 to-yellow-700/10 p-1.5 rounded-lg border border-yellow-500/20 shadow-lg shadow-yellow-900/10 shrink-0">
                <Shield size={14} className="text-yellow-500" />
              </div>
              <div className="flex-1 min-w-0 flex items-center gap-1 group/acc">
                <input
                  value={tempAccountName}
                  onChange={(e) => setTempAccountName(e.target.value)}
                  onBlur={commitAccountName}
                  readOnly={!canEditData}
                  className="bg-transparent text-yellow-500 font-bold text-[14px] outline-none flex-1 min-w-0 placeholder-slate-600"
                  placeholder="Hesap İsmi"
                  maxLength={30}
                />
                <Edit3 size={10} className="text-yellow-400 shrink-0" />
              </div>
              {username ? (
                <span onClick={userRole === 'admin' ? openUsernameModal : undefined} className={`text-[9px] text-cyan-400 bg-cyan-900/30 border border-cyan-700/40 rounded-full px-2 py-0.5 shrink-0 truncate max-w-[80px] ${userRole === 'admin' ? 'cursor-pointer hover:bg-cyan-900/45 transition-colors' : ''}`} title={userRole === 'admin' ? 'Kullanici adini degistir' : undefined}>@{username}</span>
              ) : (
                <button onClick={openUsernameModal} className="text-[9px] text-amber-400 bg-amber-900/30 border border-amber-700/40 rounded-full px-2 py-0.5 shrink-0 animate-pulse">Ad Belirle</button>
              )}
              <button
                onClick={() => { setSocialLinkInput(socialLink); setShowSocialLinkModal(true); }}
                disabled={!canEditData}
                className={`p-1 rounded-lg shrink-0 transition-colors ${!canEditData ? 'text-slate-600 bg-slate-800/20 border border-slate-700/20 cursor-not-allowed opacity-60' : (socialLink ? 'text-blue-400 bg-blue-900/30 border border-blue-700/30' : 'text-slate-500 bg-slate-800/40 border border-slate-700/30')}`}
                title="Sosyal Medya Linki"
              >
                <Link2 size={12} />
              </button>
            </div>

            <div className="px-2 pb-1.5 flex items-stretch gap-2">
              <div ref={mobileAccountMenuRef} className="relative flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setIsMobileAccountActionsOpen(false);
                      setIsMobileQuickMenuOpen(false);
                      setIsMobileAccountMenuOpen((prev) => !prev);
                    }}
                    className="h-8 flex-1 min-w-0 bg-slate-900/55 text-slate-200 rounded-lg border border-slate-600/40 px-3 flex items-center justify-between gap-2 active:bg-slate-800/90 transition-colors"
                    title="Hesap Sec"
                  >
                    <div className="min-w-0 text-left">
                      <div className="text-[9px] text-slate-500 leading-none">HESAPLAR</div>
                      <div className="text-[11px] font-semibold truncate leading-tight mt-0.5">{activeAccount.name}</div>
                    </div>
                    <ChevronDown size={12} className={`shrink-0 text-slate-400 transition-transform ${isMobileAccountMenuOpen ? 'rotate-180' : ''}`} />
                  </button>
                  <div ref={mobileAccountActionsRef} className="relative shrink-0">
                    <button
                      onClick={() => {
                        setIsMobileAccountMenuOpen(false);
                        setIsMobileQuickMenuOpen(false);
                        setIsMobileAccountActionsOpen((prev) => !prev);
                      }}
                      className="h-8 w-8 rounded-lg border border-slate-600/40 bg-slate-900/55 text-slate-300 flex items-center justify-center active:bg-slate-800/90 transition-colors"
                      title="Hesap Islemleri"
                    >
                      <MoreVertical size={13} />
                    </button>
                    {isMobileAccountActionsOpen && (
                      <div className="absolute right-0 top-full mt-1.5 z-[90] min-w-[170px] rounded-xl border border-slate-600/40 bg-slate-900/95 backdrop-blur p-1.5 shadow-2xl space-y-1">
                        <button
                          onClick={() => { handleMoveAccount('up'); setIsMobileAccountActionsOpen(false); }}
                          disabled={!canEditData || !canMoveAccountUp}
                          className={`w-full rounded-lg border px-2.5 py-2 text-left text-[11px] flex items-center justify-between gap-2 transition-colors ${
                            canEditData && canMoveAccountUp
                              ? 'border-slate-700/40 bg-slate-800/70 text-slate-100 active:bg-slate-700/80'
                              : 'border-slate-700/25 bg-slate-800/35 text-slate-500 cursor-not-allowed opacity-70'
                          }`}
                        >
                          <span>Hesabi Yukari Tasi</span>
                          <ChevronUp size={12} className="text-amber-300" />
                        </button>
                        <button
                          onClick={() => { handleMoveAccount('down'); setIsMobileAccountActionsOpen(false); }}
                          disabled={!canEditData || !canMoveAccountDown}
                          className={`w-full rounded-lg border px-2.5 py-2 text-left text-[11px] flex items-center justify-between gap-2 transition-colors ${
                            canEditData && canMoveAccountDown
                              ? 'border-slate-700/40 bg-slate-800/70 text-slate-100 active:bg-slate-700/80'
                              : 'border-slate-700/25 bg-slate-800/35 text-slate-500 cursor-not-allowed opacity-70'
                          }`}
                        >
                          <span>Hesabi Asagi Tasi</span>
                          <ChevronDown size={12} className="text-amber-300" />
                        </button>
                        <button
                          onClick={() => { handleAddAccount(); setIsMobileAccountActionsOpen(false); }}
                          disabled={!canEditData}
                          className={`w-full rounded-lg border px-2.5 py-2 text-left text-[11px] flex items-center justify-between gap-2 transition-colors ${
                            canEditData
                              ? 'border-slate-700/40 bg-slate-800/70 text-slate-100 active:bg-slate-700/80'
                              : 'border-slate-700/25 bg-slate-800/35 text-slate-500 cursor-not-allowed opacity-70'
                          }`}
                        >
                          <span>Hesap Ekle</span>
                          <Plus size={12} className="text-emerald-300" />
                        </button>
                        {accounts.length > 1 && (
                          <button
                            onClick={() => { handleDeleteAccount(); setIsMobileAccountActionsOpen(false); }}
                            disabled={!canEditData}
                            className={`w-full rounded-lg border px-2.5 py-2 text-left text-[11px] flex items-center justify-between gap-2 transition-colors ${
                              canEditData
                                ? 'border-red-900/35 bg-red-950/20 text-red-200 active:bg-red-900/30'
                                : 'border-slate-700/25 bg-slate-800/35 text-slate-500 cursor-not-allowed opacity-70'
                            }`}
                          >
                            <span>Hesap Sil</span>
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {isMobileAccountMenuOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1.5 z-[85] bg-slate-900/95 backdrop-blur rounded-xl border border-slate-600/40 p-1.5 shadow-2xl">
                    <div className="max-h-56 overflow-y-auto space-y-1 no-scrollbar">
                      {accounts.map((acc) => {
                        const isActive = selectedAccountId === acc.id;
                        return (
                          <button
                            key={acc.id}
                            onClick={() => {
                              setSelectedAccountId(acc.id);
                              setSelectedServerIndex(0);
                              setActiveCharIndex(0);
                              setCurrentViewIndex(0);
                              setIsMobileAccountMenuOpen(false);
                            }}
                            className={`w-full rounded-lg border px-3 py-2 text-left transition-colors flex items-center justify-between gap-2 ${
                              isActive
                                ? 'bg-emerald-900/35 border-emerald-600/40'
                                : 'bg-slate-800/70 border-slate-700/40 active:bg-slate-700/80'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className={`text-[11px] font-semibold truncate ${isActive ? 'text-emerald-200' : 'text-slate-200'}`}>{acc.name}</div>
                              <div className="text-[9px] text-slate-500 mt-0.5">{acc.servers.length} sunucu</div>
                            </div>
                            {isActive && <Check size={13} className="text-emerald-300 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="h-9 flex items-center bg-slate-900/55 rounded-xl px-1 border border-slate-700/35 gap-1 shrink-0">
                <button onClick={handleOpenSearch} className="h-7 w-7 flex items-center justify-center text-yellow-400 active:bg-yellow-600/20 rounded-lg transition-colors"><Search size={14} /></button>
                <div className="relative">
                  <button onClick={saveData} disabled={!canEditData} className={`h-7 w-7 flex items-center justify-center rounded-lg transition-colors ${!canEditData ? 'text-slate-600 cursor-not-allowed opacity-60' : (hasUnsavedChanges ? 'text-yellow-400 bg-yellow-500/20 ring-1 ring-yellow-400' : 'text-blue-400 active:bg-blue-600/20')}`}><Save size={14} /></button>
                  {hasUnsavedChanges && (
                    <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 bg-yellow-500 text-black text-[8px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap shadow-lg animate-bounce">
                      Kaydet!
                    </div>
                  )}
                </div>
                <div ref={mobileQuickMenuRef} className="relative">
                  <button
                    onClick={() => {
                      setIsMobileAccountMenuOpen(false);
                      setIsMobileAccountActionsOpen(false);
                      setIsMobileQuickMenuOpen((prev) => !prev);
                    }}
                    className="relative h-7 w-7 flex items-center justify-center text-slate-300 active:bg-slate-700/40 rounded-lg transition-colors"
                    title="Hizli Menu"
                  >
                    <MoreVertical size={14} />
                    {unreadMessageSenderCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] leading-4 font-bold text-center border border-red-300/60 shadow">
                        {unreadMessageSenderCount > 99 ? '99+' : unreadMessageSenderCount}
                      </span>
                    )}
                  </button>
                  {isMobileQuickMenuOpen && (
                    <div className="absolute right-0 top-full mt-1.5 z-[90] min-w-[150px] rounded-xl border border-slate-600/40 bg-slate-900/95 backdrop-blur p-1.5 shadow-2xl space-y-1">
                      <button
                        onClick={() => { setIsMessagingOpen(true); setIsMobileQuickMenuOpen(false); }}
                        className="w-full rounded-lg border border-slate-700/40 bg-slate-800/70 px-2.5 py-2 text-left text-[11px] text-slate-100 active:bg-slate-700/80 flex items-center justify-between gap-2"
                      >
                        <span>Mesajlar</span>
                        <div className="relative">
                          <MessageCircle size={13} className="text-cyan-300" />
                          {unreadMessageSenderCount > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 min-w-[13px] h-3.5 px-1 rounded-full bg-red-500 text-white text-[8px] leading-3.5 font-bold text-center">
                              {unreadMessageSenderCount > 99 ? '99+' : unreadMessageSenderCount}
                            </span>
                          )}
                        </div>
                      </button>
                      {userRole === 'admin' && (
                        <button
                          onClick={() => { handleOpenAdminPanel(); setIsMobileQuickMenuOpen(false); }}
                          className="w-full rounded-lg border border-red-900/35 bg-red-950/20 px-2.5 py-2 text-left text-[11px] text-red-200 active:bg-red-900/30 flex items-center justify-between gap-2"
                        >
                          <span>Admin Paneli</span>
                          <div className="relative">
                            <Crown size={13} className="text-red-300" />
                            {unreadAdminNotificationCount > 0 && (
                              <span className="absolute -top-1.5 -right-1.5 min-w-[13px] h-3.5 px-1 rounded-full bg-amber-500 text-black text-[8px] leading-3.5 font-bold text-center border border-amber-200/80">
                                {unreadAdminNotificationCount > 99 ? '99+' : unreadAdminNotificationCount}
                              </span>
                            )}
                          </div>
                        </button>
                      )}
                      <button
                        onClick={() => { handleOpenInventorySummary(); setIsMobileQuickMenuOpen(false); }}
                        className="w-full rounded-lg border border-slate-700/40 bg-slate-800/70 px-2.5 py-2 text-left text-[11px] text-slate-100 active:bg-slate-700/80 flex items-center justify-between gap-2"
                      >
                        <span>Ozet Tablosu</span>
                        <FileSpreadsheet size={13} className="text-cyan-300" />
                      </button>
                      <button
                        onClick={() => { handleExportExcel(); setIsMobileQuickMenuOpen(false); }}
                        className="w-full rounded-lg border border-slate-700/40 bg-slate-800/70 px-2.5 py-2 text-left text-[11px] text-slate-100 active:bg-slate-700/80 flex items-center justify-between gap-2"
                      >
                        <span>Excel</span>
                        <FileSpreadsheet size={13} className="text-emerald-300" />
                      </button>
                      <button
                        onClick={() => { openExcelImportPicker(); setIsMobileQuickMenuOpen(false); }}
                        disabled={!canEditData || isImportingExcel}
                        className={`w-full rounded-lg border px-2.5 py-2 text-left text-[11px] flex items-center justify-between gap-2 transition-colors ${
                          !canEditData || isImportingExcel
                            ? 'border-slate-700/25 bg-slate-800/35 text-slate-500 cursor-not-allowed opacity-70'
                            : 'border-slate-700/40 bg-slate-800/70 text-slate-100 active:bg-slate-700/80'
                        }`}
                      >
                        <span>{isImportingExcel ? 'Import...' : 'Ice Aktar'}</span>
                        <Upload size={13} className={`${isImportingExcel ? 'text-amber-300 animate-pulse' : 'text-amber-300'}`} />
                      </button>
                      <button
                        onClick={() => { setIsMobileQuickMenuOpen(false); handleLogout(); }}
                        className="w-full rounded-lg border border-red-900/35 bg-red-950/20 px-2.5 py-2 text-left text-[11px] text-red-300 active:bg-red-900/30 flex items-center justify-between gap-2"
                      >
                        <span>Cikis Yap</span>
                        <LogOut size={13} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Mobile Server Selector */}
            <div className="px-2 pb-1.5 flex items-center gap-1 overflow-x-auto no-scrollbar">
              {activeAccount.servers.map((server, idx) => (
                <button
                  key={server.id}
                  onClick={() => { setSelectedServerIndex(idx); setActiveCharIndex(0); setCurrentViewIndex(0); }}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap transition-all flex items-center gap-1 ${
                    selectedServerIndex === idx
                      ? 'bg-emerald-800/60 text-emerald-300 border border-emerald-500/40 shadow-sm'
                      : 'bg-slate-900/40 text-slate-500 border border-slate-700/30 active:bg-slate-800'
                  }`}
                >
                  <Globe size={10} />
                  {server.name}
                </button>
              ))}
            </div>
          </div>

          {/* DESKTOP TOP BAR */}
          <div className="hidden md:flex bg-gradient-to-r from-slate-800 via-slate-800/95 to-slate-800 px-3 lg:px-4 py-2 justify-between items-start xl:items-center gap-3 lg:gap-4 border-b border-slate-700/50 flex-wrap xl:flex-nowrap">
            {/* Left: Logo + Account */}
            <div className="flex items-center gap-2 lg:gap-3 min-w-0 flex-1">
               <div className="bg-gradient-to-br from-yellow-500/20 to-yellow-700/10 p-2 rounded-lg border border-yellow-500/30 shadow-lg shadow-yellow-900/20">
                 <Shield size={20} className="text-yellow-500" />
               </div>

               <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="flex items-center gap-2 group/acc flex-nowrap whitespace-nowrap overflow-x-auto no-scrollbar pr-1">
                    <div className="flex items-center gap-1.5">
                      <input
                        value={tempAccountName}
                        onChange={(e) => setTempAccountName(e.target.value)}
                        onBlur={commitAccountName}
                        readOnly={!canEditData}
                        className="bg-transparent text-yellow-400 font-bold text-sm lg:text-base outline-none w-auto min-w-[10ch] placeholder-slate-600 border-b border-dashed border-yellow-700/30 focus:border-yellow-600/50 focus:border-solid transition-all"
                        style={{ width: `${Math.max(12, tempAccountName.length)}ch` }}
                        placeholder="Hesap Adı"
                        maxLength={30}
                      />
                      <Edit3 size={11} className="text-yellow-400 shrink-0" />
                    </div>
                    {username ? (
                      <span onClick={userRole === 'admin' ? openUsernameModal : undefined} className={`text-[9px] text-cyan-400 bg-cyan-900/25 border border-cyan-700/30 rounded-full px-2 py-0.5 tracking-wider ${userRole === 'admin' ? 'cursor-pointer hover:bg-cyan-900/40 transition-colors' : ''}`} title={userRole === 'admin' ? 'Kullanici adini degistir' : undefined}>@{username}</span>
                    ) : (
                      <button onClick={openUsernameModal} className="text-[9px] text-amber-400 bg-amber-900/20 border border-amber-700/30 rounded-full px-2 py-0.5 tracking-wider hover:bg-amber-900/40 transition-colors animate-pulse">Kullanıcı Adı Belirle</button>
                    )}
                    <button
                      onClick={() => { setSocialLinkInput(socialLink); setShowSocialLinkModal(true); }}
                      disabled={!canEditData}
                      className={`p-1 rounded-md transition-colors ${!canEditData ? 'text-slate-600 bg-slate-800/20 border border-slate-700/20 cursor-not-allowed opacity-60' : (socialLink ? 'text-blue-400 bg-blue-900/20 border border-blue-700/25 hover:bg-blue-900/40' : 'text-slate-500 bg-slate-800/30 border border-slate-700/25 hover:text-blue-400 hover:bg-blue-900/20')}`}
                      title="Sosyal Medya Linki"
                    >
                      <Link2 size={12} />
                    </button>
                    {userRole === 'user' && <span className="text-[9px] text-amber-400/70 bg-amber-900/20 border border-amber-700/30 rounded-full px-2 py-0.5 tracking-wider uppercase">Kullanıcı</span>}
                  </div>

                  <div className="flex items-center gap-1 min-w-0">
                    <div className="relative">
                      <select
                        value={selectedAccountId}
                        onChange={(e) => {
                          setSelectedAccountId(e.target.value);
                          setSelectedServerIndex(0);
                          setActiveCharIndex(0);
                          setCurrentViewIndex(0);
                        }}
                        className="appearance-none bg-slate-900/60 hover:bg-slate-700 text-slate-300 text-[11px] py-1 pl-2.5 pr-6 rounded-md border border-slate-600/50 focus:outline-none focus:border-yellow-600/50 cursor-pointer transition-colors max-w-[120px] lg:max-w-[170px] truncate"
                      >
                        {accounts.map(acc => (
                          <option key={acc.id} value={acc.id}>{acc.name}</option>
                        ))}
                      </select>
                      <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500" />
                    </div>
                    <button
                      onClick={() => handleMoveAccount('up')}
                      disabled={!canEditData || !canMoveAccountUp}
                      className={`p-1 rounded transition-colors ${
                        canEditData && canMoveAccountUp
                          ? 'text-amber-400/80 hover:text-amber-300 hover:bg-amber-900/20'
                          : 'text-slate-600 cursor-not-allowed opacity-60'
                      }`}
                      title="Hesabi Yukari Tasi"
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      onClick={() => handleMoveAccount('down')}
                      disabled={!canEditData || !canMoveAccountDown}
                      className={`p-1 rounded transition-colors ${
                        canEditData && canMoveAccountDown
                          ? 'text-amber-400/80 hover:text-amber-300 hover:bg-amber-900/20'
                          : 'text-slate-600 cursor-not-allowed opacity-60'
                      }`}
                      title="Hesabi Asagi Tasi"
                    >
                      <ChevronDown size={14} />
                    </button>
                    <button onClick={handleAddAccount} disabled={!canEditData} className={`p-1 rounded transition-colors ${canEditData ? 'text-green-500/70 hover:text-green-400 hover:bg-green-900/20' : 'text-slate-600 cursor-not-allowed opacity-60'}`} title="Hesap Ekle"><Plus size={14} /></button>
                    {accounts.length > 1 && (
                      <button onClick={handleDeleteAccount} disabled={!canEditData} className={`p-1 rounded transition-colors ${canEditData ? 'text-red-800/70 hover:text-red-400 hover:bg-red-900/20' : 'text-slate-600 cursor-not-allowed opacity-60'}`} title="Hesap Sil"><Trash2 size={14} /></button>
                    )}
                  </div>
               </div>
            </div>

            {/* Right: Action Buttons */}
            <div className="flex items-center gap-1.5 flex-wrap justify-end max-w-full">
              <button onClick={handleOpenSearch} className="flex items-center gap-1.5 px-2 xl:px-3 py-1.5 bg-slate-700/50 hover:bg-yellow-600 hover:text-black text-yellow-500 text-[11px] font-bold rounded-md border border-slate-600/40 hover:border-yellow-500 transition-all" title="Ara"><Search size={13} /><span className="hidden xl:inline">Ara</span></button>
              <button onClick={handleOpenInventorySummary} className="flex items-center gap-1.5 px-2 xl:px-3 py-1.5 bg-slate-700/50 hover:bg-cyan-700 text-cyan-300 hover:text-white text-[11px] font-bold rounded-md border border-slate-600/40 hover:border-cyan-500 transition-all" title="Ozet Tablosu"><FileSpreadsheet size={13} /><span className="hidden xl:inline">Ozet</span></button>
              <button onClick={() => setIsMessagingOpen(true)} className="relative flex items-center gap-1.5 px-2 xl:px-3 py-1.5 bg-slate-700/50 hover:bg-cyan-700 text-cyan-300 hover:text-white text-[11px] font-bold rounded-md border border-slate-600/40 hover:border-cyan-500 transition-all" title="Mesaj">
                <MessageCircle size={13} />
                <span className="hidden xl:inline">Mesaj</span>
                {unreadMessageSenderCount > 0 && (
                  <span className="ml-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] leading-4 font-bold text-center border border-red-300/60 shadow">
                    {unreadMessageSenderCount > 99 ? '99+' : unreadMessageSenderCount}
                  </span>
                )}
              </button>
              <button onClick={handleExportExcel} className="flex items-center gap-1.5 px-2 xl:px-3 py-1.5 bg-slate-700/50 hover:bg-emerald-700 text-emerald-300 hover:text-white text-[11px] font-bold rounded-md border border-slate-600/40 hover:border-emerald-500 transition-all" title="Excel"><FileSpreadsheet size={13} /><span className="hidden xl:inline">Excel</span></button>
              <button
                onClick={openExcelImportPicker}
                disabled={!canEditData || isImportingExcel}
                className={`flex items-center gap-1.5 px-2 xl:px-3 py-1.5 text-[11px] font-bold rounded-md border transition-all ${
                  !canEditData || isImportingExcel
                    ? 'bg-slate-800/40 text-slate-600 border-slate-700/35 cursor-not-allowed opacity-70'
                    : 'bg-slate-700/50 hover:bg-amber-700 text-amber-300 hover:text-white border-slate-600/40 hover:border-amber-500'
                }`}
                title={isImportingExcel ? 'Import...' : 'Ice Aktar'}
              >
                <Upload size={13} className={isImportingExcel ? 'animate-pulse' : ''} />
                <span className="hidden xl:inline">{isImportingExcel ? 'Import...' : 'Ice Aktar'}</span>
              </button>
              <button onClick={saveData} disabled={!canEditData} className={`flex items-center gap-1.5 px-2 xl:px-3 py-1.5 text-[11px] font-bold rounded-md border transition-all ${!canEditData ? 'bg-slate-800/40 text-slate-600 border-slate-700/40 cursor-not-allowed opacity-70' : (hasUnsavedChanges ? 'bg-yellow-500/20 text-yellow-300 border-yellow-400/60 animate-pulse ring-2 ring-yellow-400/50 shadow-lg shadow-yellow-500/20' : 'bg-slate-700/50 hover:bg-blue-700 text-blue-300 hover:text-white border-slate-600/40 hover:border-blue-500')}`} title="Kaydet"><Save size={13} /><span className="hidden xl:inline">Kaydet</span></button>
              {userRole === 'admin' && (
                <button onClick={handleOpenAdminPanel} className="relative flex items-center gap-1.5 px-2 xl:px-3 py-1.5 bg-red-950/50 hover:bg-red-800 text-red-400 hover:text-white text-[11px] font-bold rounded-md border border-red-900/40 hover:border-red-600 transition-all" title="Admin"><Crown size={13} /><span className="hidden xl:inline">Admin</span>{unreadAdminNotificationCount > 0 && <span className="absolute -top-1.5 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-black text-[9px] leading-4 font-bold text-center border border-amber-200/80">{unreadAdminNotificationCount > 99 ? '99+' : unreadAdminNotificationCount}</span>}</button>
              )}
              <button onClick={handleLogout} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-900/20 rounded-md border border-transparent hover:border-red-800/30 transition-all" title="Çıkış"><LogOut size={14} /></button>
            </div>
          </div>

          {/* Desktop Server Selector */}
          <div className="hidden md:flex bg-gradient-to-r from-slate-800/60 to-slate-800/40 px-4 py-1 items-center gap-1.5 border-b border-slate-700/30">
            <Globe size={13} className="text-emerald-500 shrink-0" />
            <span className="text-[10px] text-slate-500 font-bold mr-1">SUNUCU:</span>
            {activeAccount.servers.map((server, idx) => (
              <button
                key={server.id}
                onClick={() => { setSelectedServerIndex(idx); setActiveCharIndex(0); setCurrentViewIndex(0); }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold whitespace-nowrap transition-all ${
                  selectedServerIndex === idx
                    ? 'bg-emerald-800/50 text-emerald-300 border border-emerald-500/40 shadow-sm'
                    : 'bg-slate-900/30 text-slate-500 border border-transparent hover:bg-slate-800 hover:text-slate-300'
                }`}
              >
                {server.name}
              </button>
            ))}
          </div>

          {/* Bottom Bar: Characters */}
          <div className="bg-gradient-to-b from-slate-800/80 to-slate-800/40 px-2 flex justify-between items-end gap-2">
             <div className="flex gap-1 overflow-x-auto w-full no-scrollbar py-0.5">
                {activeServer.characters.map((char, idx) => (
                  <button
                    key={char.id}
                    onClick={() => { setActiveCharIndex(idx); setCurrentViewIndex(0); }}
                    className={`
                      px-3 md:px-4 py-2 md:py-1.5 rounded-t-lg font-bold text-[11px] md:text-xs tracking-wide transition-all whitespace-nowrap flex items-center gap-1.5 flex-1 justify-center
                      ${activeCharIndex === idx
                        ? 'bg-slate-900/80 text-white shadow-inner border-t-2 border-x border-yellow-500/40 border-x-slate-600/50'
                        : 'bg-slate-900/20 text-slate-500 hover:bg-slate-800/60 hover:text-slate-300 border-t-2 border-x border-transparent'
                      }
                    `}
                  >
                    <User size={11} className={activeCharIndex === idx ? 'text-yellow-500' : 'opacity-40'} />
                    {char.name}
                  </button>
                ))}
             </div>

             <div className="hidden md:flex items-center gap-2 bg-slate-900/40 px-3 py-1.5 rounded-t-lg border-t border-x border-slate-700/30 shrink-0">
                <button
                  onClick={() => setIsRecipeBookOpen(true)}
                  className="p-1 text-purple-400 hover:text-purple-300 hover:bg-purple-900/30 rounded-md transition-colors relative"
                  title="Reçete Kitabı"
                >
                    <Book size={14} />
                    {activeChar.learnedRecipes?.length > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 bg-purple-500 text-white text-[7px] rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold shadow-sm">
                            {activeChar.learnedRecipes.length}
                        </span>
                    )}
                </button>

                <div className="w-px h-4 bg-slate-700/50"></div>

                <div className="flex items-center gap-1 group/char">
                  <input
                     value={tempCharName}
                     onChange={(e) => setTempCharName(e.target.value)}
                     onBlur={commitCharacterName}
                     readOnly={!canEditData}
                     className="bg-transparent text-blue-300 font-bold text-xs outline-none w-24 border-b border-dashed border-blue-500/25 focus:border-blue-500/50 focus:border-solid placeholder-slate-600 transition-colors"
                     placeholder="Karakter Adı"
                     maxLength={20}
                  />
                  <Edit3 size={10} className="text-blue-400 shrink-0" />
                </div>
             </div>
          </div>

          <div className="md:hidden bg-gradient-to-r from-slate-800/80 via-slate-800/90 to-slate-900/80 px-3 py-2 border-t border-slate-700/20">
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setIsRecipeBookOpen(true)}
                className="bg-purple-900/25 p-2 rounded-xl border border-purple-500/20 text-purple-400 active:text-purple-200 active:bg-purple-900/40 transition-colors relative shadow-sm"
              >
                <Book size={16} />
                {activeChar.learnedRecipes?.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-purple-500 text-white text-[8px] rounded-full w-4 h-4 flex items-center justify-center font-bold shadow-md">
                    {activeChar.learnedRecipes.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setIsMobileCategoryFilterOpen((prev) => !prev)}
                className={`relative p-2 rounded-xl border transition-colors shadow-sm ${
                  isMobileCategoryFilterOpen
                    ? 'bg-indigo-900/35 border-indigo-500/35 text-indigo-200'
                    : 'bg-slate-900/30 border-slate-700/35 text-slate-300 active:bg-slate-800/60'
                }`}
                title={isMobileCategoryFilterOpen ? 'Kategori filtresini kapat' : 'Kategori filtresini ac'}
              >
                {isMobileCategoryFilterOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                {categoryFilter !== 'All' && (
                  <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-amber-400 border border-slate-900" />
                )}
              </button>
              <div className="h-6 w-px bg-gradient-to-b from-transparent via-slate-600/60 to-transparent"></div>
              <div className="flex items-center gap-1.5 flex-1 min-w-0 bg-slate-900/30 rounded-xl px-3 py-1.5 border border-slate-700/25">
                <Edit3 size={12} className="text-slate-500 shrink-0" />
                <input
                  value={tempCharName}
                  onChange={(e) => setTempCharName(e.target.value)}
                  onBlur={commitCharacterName}
                  readOnly={!canEditData}
                  className="bg-transparent text-blue-300 font-bold text-[13px] outline-none flex-1 min-w-0 placeholder-slate-600"
                  placeholder="Karakter İsmi"
                  maxLength={20}
                />
              </div>
            </div>
          </div>
        </div>

        {(!canEditData || !canUseGlobalSearch) && (
          <div className="px-3 py-1.5 bg-red-950/30 border-b border-red-900/40 text-[10px] text-red-200 flex flex-wrap gap-2">
            {!canEditData && <span className="bg-red-900/40 border border-red-800/40 rounded px-2 py-0.5">Veri girisi yetkisi kapali (salt okunur mod)</span>}
            {!canUseGlobalSearch && <span className="bg-amber-900/30 border border-amber-800/40 rounded px-2 py-0.5 text-amber-200">Global arama yetkisi kapali</span>}
          </div>
        )}
        </>
        )}

        {/* Content Area */}
        <div className={`bg-slate-800/50 flex-1 min-h-0 ${isContainerFullscreen ? 'p-0' : 'p-1'}`}>
          <div className="flex h-full min-h-0 gap-1.5 md:gap-2">
            <aside className="hidden md:flex md:w-[210px] shrink-0 rounded-md border border-slate-700/60 bg-gradient-to-b from-slate-900/90 via-slate-900/80 to-slate-950/85 overflow-hidden">
              <div className="flex h-full min-h-0 flex-col p-3">
                <div className="mb-3 rounded-lg border border-slate-700/60 bg-slate-900/70 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="rounded-md border border-indigo-500/40 bg-indigo-700/30 p-1.5">
                      <Package size={14} className="text-indigo-300" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold tracking-[0.22em] text-slate-300">KASA</p>
                      <p className="text-[10px] text-slate-500 truncate">{activeContainer.name}</p>
                    </div>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-400">
                    <span className="font-semibold text-slate-200">{filteredSlotCount}</span>
                    <span className="text-slate-500"> / {activeSlotCount} esya</span>
                  </div>
                </div>

                <div className="mb-2 text-[10px] uppercase tracking-[0.24em] text-slate-500">Kategori Filtresi</div>
                <div className="flex-1 min-h-0 overflow-y-auto pr-1 no-scrollbar space-y-1.5">
                  <button
                    onClick={() => setCategoryFilter('All')}
                    className={`w-full text-left px-2.5 py-2 rounded-md border text-[11px] font-semibold transition-colors ${
                      categoryFilter === 'All'
                        ? 'bg-red-900/60 border-red-500/50 text-red-100'
                        : 'bg-slate-800/70 border-slate-700/70 text-slate-300 hover:bg-slate-700/80 hover:text-white'
                    }`}
                  >
                    Tumu
                  </button>
                  {CATEGORY_OPTIONS.map((category) => (
                    <button
                      key={category}
                      onClick={() => setCategoryFilter((prev) => (prev === category ? 'All' : category))}
                      className={`w-full text-left px-2.5 py-2 rounded-md border text-[11px] font-semibold transition-colors ${
                        categoryFilter === category
                          ? 'bg-slate-100 border-slate-300 text-slate-900'
                          : 'bg-slate-800/70 border-slate-700/70 text-slate-300 hover:bg-slate-700/80 hover:text-white'
                      }`}
                    >
                      {category}
                    </button>
                  ))}
                </div>

                <div className="mt-3 rounded-lg border border-slate-700/70 bg-slate-900/70 p-2.5">
                  <div className="mb-1.5 flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Kapasite</span>
                    <span className="font-mono font-bold text-slate-200">{capacityPercent}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
                    <div
                      className="h-full bg-indigo-500 transition-all duration-500"
                      style={{ width: `${capacityPercent}%` }}
                    />
                  </div>
                </div>
              </div>
            </aside>

            <div className="flex-1 min-h-0 w-full h-full flex flex-col">
              {isMobileCategoryFilterOpen && (
                <div className="md:hidden mb-1.5 rounded-md border border-slate-700/50 bg-slate-900/80 p-2 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="mb-1.5 flex items-center gap-2">
                    <Package size={12} className="text-indigo-300" />
                    <span className="text-[10px] font-bold tracking-[0.2em] text-slate-300">KATEGORI FILTRESI</span>
                  </div>
                  <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                    <button
                      onClick={() => setCategoryFilter('All')}
                      className={`shrink-0 px-2 py-1 rounded-md border text-[10px] font-semibold ${
                        categoryFilter === 'All'
                          ? 'bg-red-900/60 border-red-500/50 text-red-100'
                          : 'bg-slate-800/70 border-slate-700/70 text-slate-300'
                      }`}
                    >
                      Tumu
                    </button>
                    {CATEGORY_OPTIONS.map((category) => (
                      <button
                        key={`mobile-${category}`}
                        onClick={() => setCategoryFilter((prev) => (prev === category ? 'All' : category))}
                        className={`shrink-0 px-2 py-1 rounded-md border text-[10px] font-semibold ${
                          categoryFilter === category
                            ? 'bg-slate-100 border-slate-300 text-slate-900'
                            : 'bg-slate-800/70 border-slate-700/70 text-slate-300'
                        }`}
                      >
                        {category}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className={`w-full flex-1 min-h-0 animate-in fade-in duration-300 ${currentView === 'bag' ? 'zoom-in' : 'slide-in-from-bottom-4'}`}>
                <ContainerGrid
                  container={activeContainer}
                  onSlotClick={handleSlotClick}
                  onSlotHover={handleSlotHover}
                  onMoveItem={handleMoveItem}
                  searchQuery={""}
                  categoryFilter={categoryFilter}
                  onNext={handleNextView}
                  onPrev={handlePrevView}
                  talismanDuplicates={talismanDuplicates}
                  isFullscreen={isContainerFullscreen}
                  onToggleFullscreen={toggleContainerFullscreen}
                  hasClipboard={clipboardItems.length > 0}
                  multiSelectMode={multiSelectMode}
                  selectedSlotIds={selectedSlotIds}
                  onToggleMultiSelect={handleToggleMultiSelect}
                  onToggleSlotSelection={handleToggleSlotSelection}
                  onBulkCopy={handleBulkCopy}
                  onCancelSelection={handleCancelSelection}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Clipboard Indicator */}
        {clipboardItems.length > 0 && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="bg-blue-900/95 border border-blue-500/60 text-blue-100 text-xs md:text-sm font-bold px-3 py-2 rounded-lg shadow-lg flex items-center gap-2 whitespace-nowrap backdrop-blur-sm">
              <Clipboard size={14} className="text-blue-400 shrink-0" />
              {clipboardItems.length === 1 ? (
                <>
                  <span className="text-blue-300">{clipboardItems[0].category}</span>
                  {clipboardItems[0].enchantment1 && (
                    <span className="text-blue-200/70 text-[11px] max-w-[120px] truncate">{clipboardItems[0].enchantment1}</span>
                  )}
                </>
              ) : (
                <span className="text-blue-300">{clipboardItems.length} eşya panoda</span>
              )}
              <div className="w-px h-4 bg-blue-500/30 mx-0.5" />
              <button
                onClick={handleClearClipboard}
                className="flex items-center gap-1 text-red-300 hover:text-red-100 hover:bg-red-800/50 transition-colors px-2 py-0.5 rounded text-[11px] font-bold"
                title="Panoyu Temizle (Esc)"
              >
                <X size={12} />
                <span>İptal</span>
              </button>
            </div>
          </div>
        )}

        {/* Save Reminder Toast */}
        {toast && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="bg-yellow-600 text-black text-xs md:text-sm font-bold px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 whitespace-nowrap">
              <Save size={14} />
              {toast}
            </div>
          </div>
        )}

        {/* Save Notification */}
        {saveNotification && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setSaveNotification(null)}>
            <div
              className="relative mx-4 px-8 py-6 rounded-2xl shadow-2xl flex flex-col items-center gap-3 animate-in zoom-in-95 fade-in duration-300"
              style={{
                background: saveNotification.type === 'success'
                  ? 'linear-gradient(135deg, #064e3b 0%, #065f46 50%, #047857 100%)'
                  : 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 50%, #b91c1c 100%)',
                border: `1px solid ${saveNotification.type === 'success' ? 'rgba(52,211,153,0.3)' : 'rgba(252,165,165,0.3)'}`,
                boxShadow: saveNotification.type === 'success'
                  ? '0 0 40px rgba(16,185,129,0.3), 0 20px 60px rgba(0,0,0,0.4)'
                  : '0 0 40px rgba(239,68,68,0.3), 0 20px 60px rgba(0,0,0,0.4)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={`p-3 rounded-full ${saveNotification.type === 'success' ? 'bg-emerald-500/20 ring-2 ring-emerald-400/40' : 'bg-red-500/20 ring-2 ring-red-400/40'}`}>
                {saveNotification.type === 'success'
                  ? <CheckCircle size={36} className="text-emerald-400 drop-shadow-lg" />
                  : <XCircle size={36} className="text-red-400 drop-shadow-lg" />
                }
              </div>
              <p className="text-white font-bold text-sm md:text-base text-center leading-relaxed">{saveNotification.message}</p>
              <button
                onClick={() => setSaveNotification(null)}
                className={`mt-1 px-5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  saveNotification.type === 'success'
                    ? 'bg-emerald-500/25 hover:bg-emerald-500/40 text-emerald-200 border border-emerald-400/30'
                    : 'bg-red-500/25 hover:bg-red-500/40 text-red-200 border border-red-400/30'
                }`}
              >
                Tamam
              </button>
            </div>
          </div>
        )}

        {/* System Alert Modal */}
        {systemAlert && (
          <div className="fixed inset-0 z-[119] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSystemAlert(null)}>
            <div
              className="relative mx-4 w-full max-w-md overflow-hidden rounded-2xl border shadow-2xl animate-in zoom-in-95 fade-in duration-200"
              style={{
                background: systemAlert.tone === 'error'
                  ? 'linear-gradient(145deg, rgba(69,10,10,0.95) 0%, rgba(30,41,59,0.95) 100%)'
                  : systemAlert.tone === 'warning'
                    ? 'linear-gradient(145deg, rgba(69,26,3,0.95) 0%, rgba(30,41,59,0.95) 100%)'
                    : 'linear-gradient(145deg, rgba(8,47,73,0.95) 0%, rgba(30,41,59,0.95) 100%)',
                borderColor: systemAlert.tone === 'error'
                  ? 'rgba(248,113,113,0.35)'
                  : systemAlert.tone === 'warning'
                    ? 'rgba(251,191,36,0.35)'
                    : 'rgba(56,189,248,0.35)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={`px-5 py-4 border-b ${
                systemAlert.tone === 'error'
                  ? 'bg-red-950/35 border-red-800/40'
                  : systemAlert.tone === 'warning'
                    ? 'bg-amber-950/30 border-amber-800/40'
                    : 'bg-sky-950/30 border-sky-800/40'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl border ${
                    systemAlert.tone === 'error'
                      ? 'bg-red-900/30 border-red-700/50'
                      : systemAlert.tone === 'warning'
                        ? 'bg-amber-900/30 border-amber-700/50'
                        : 'bg-sky-900/30 border-sky-700/50'
                  }`}>
                    <AlertTriangle size={18} className={
                      systemAlert.tone === 'error'
                        ? 'text-red-300'
                        : systemAlert.tone === 'warning'
                          ? 'text-amber-300'
                          : 'text-sky-300'
                    } />
                  </div>
                  <div>
                    <h3 className="text-white text-sm font-bold tracking-wide">{systemAlert.title}</h3>
                    <p className={`text-[10px] mt-0.5 ${
                      systemAlert.tone === 'error'
                        ? 'text-red-200/80'
                        : systemAlert.tone === 'warning'
                          ? 'text-amber-200/80'
                          : 'text-sky-200/80'
                    }`}>
                      Sistem bilgilendirmesi
                    </p>
                  </div>
                </div>
              </div>

              <div className="px-5 py-4">
                <p className="text-slate-100 text-sm leading-relaxed">{systemAlert.message}</p>
                {systemAlert.hint && (
                  <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                    systemAlert.tone === 'error'
                      ? 'bg-red-950/25 border-red-900/50 text-red-100/90'
                      : systemAlert.tone === 'warning'
                        ? 'bg-amber-950/25 border-amber-900/50 text-amber-100/90'
                        : 'bg-sky-950/25 border-sky-900/50 text-sky-100/90'
                  }`}>
                    {systemAlert.hint}
                  </div>
                )}
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => setSystemAlert(null)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors border ${
                      systemAlert.tone === 'error'
                        ? 'bg-red-700/70 hover:bg-red-600 text-white border-red-500/40'
                        : systemAlert.tone === 'warning'
                          ? 'bg-amber-700/70 hover:bg-amber-600 text-black border-amber-500/40'
                          : 'bg-sky-700/70 hover:bg-sky-600 text-white border-sky-500/40'
                    }`}
                  >
                    Tamam
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Access Alert Modal */}
        {accessAlert && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setAccessAlert(null)}>
            <div
              className="relative mx-4 w-full max-w-md overflow-hidden rounded-2xl border shadow-2xl animate-in zoom-in-95 fade-in duration-200"
              style={{
                background: accessAlert.kind === 'dataEntry'
                  ? 'linear-gradient(145deg, rgba(69,10,10,0.95) 0%, rgba(30,41,59,0.95) 100%)'
                  : 'linear-gradient(145deg, rgba(69,26,3,0.95) 0%, rgba(30,41,59,0.95) 100%)',
                borderColor: accessAlert.kind === 'dataEntry' ? 'rgba(248,113,113,0.35)' : 'rgba(251,191,36,0.35)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={`px-5 py-4 border-b ${accessAlert.kind === 'dataEntry' ? 'bg-red-950/35 border-red-800/40' : 'bg-amber-950/30 border-amber-800/40'}`}>
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl border ${accessAlert.kind === 'dataEntry' ? 'bg-red-900/30 border-red-700/50' : 'bg-amber-900/30 border-amber-700/50'}`}>
                    {accessAlert.kind === 'dataEntry'
                      ? <Lock size={18} className="text-red-300" />
                      : <Globe size={18} className="text-amber-300" />
                    }
                  </div>
                  <div>
                    <h3 className="text-white text-sm font-bold tracking-wide">{accessAlert.title}</h3>
                    <p className={`text-[10px] mt-0.5 ${accessAlert.kind === 'dataEntry' ? 'text-red-200/80' : 'text-amber-200/80'}`}>
                      Yetki bilgilendirmesi
                    </p>
                  </div>
                </div>
              </div>

              <div className="px-5 py-4">
                <p className="text-slate-100 text-sm leading-relaxed">{accessAlert.message}</p>
                {accessAlert.hint && (
                  <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${accessAlert.kind === 'dataEntry' ? 'bg-red-950/25 border-red-900/50 text-red-100/90' : 'bg-amber-950/25 border-amber-900/50 text-amber-100/90'}`}>
                    {accessAlert.hint}
                  </div>
                )}
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => setAccessAlert(null)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors border ${accessAlert.kind === 'dataEntry' ? 'bg-red-700/70 hover:bg-red-600 text-white border-red-500/40' : 'bg-amber-700/70 hover:bg-amber-600 text-black border-amber-500/40'}`}
                  >
                    Tamam
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {!isContainerFullscreen && (
          <>
        {/* Footer */}
        <div className="bg-slate-900 p-0.5 flex justify-between items-center text-[8px] md:text-[9px] text-slate-600 border-t border-slate-700 shrink-0">
           <span className="w-full text-center">IKV KASA YÖNETİM SİSTEMİ v4.0 • {activeServer.name} • {activeChar.name} • {username ? `@${username}` : auth.currentUser?.email} • {userRole === 'admin' ? 'Yönetici' : 'Kullanıcı'}</span>
        </div>
          </>
        )}
      </div>

      {/* Username Modal */}
      {showUsernameModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowUsernameModal(false)}>
          <div
            className="relative mx-4 w-full max-w-sm bg-gradient-to-b from-slate-800 to-slate-900 border border-slate-600/50 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-cyan-900/40 to-blue-900/40 px-6 py-4 border-b border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="bg-cyan-500/15 p-2 rounded-xl border border-cyan-500/25">
                  <AtSign size={20} className="text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-sm">{userRole === 'admin' && username ? 'Kullanıcı Adı Güncelle' : 'Kullanıcı Adı Belirle'}</h3>
                  <p className="text-slate-400 text-[10px] mt-0.5">{userRole === 'admin' ? 'Admin hesaplari kullanıcı adını değiştirebilir.' : 'Bu işlem sadece 1 kez yapılabilir'}</p>
                </div>
              </div>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-[10px] font-semibold text-slate-400 mb-1.5 block tracking-wider">KULLANICI ADI</label>
                <input
                  type="text"
                  value={usernameInput}
                  onChange={(e) => { setUsernameInput(e.target.value); setUsernameError(''); }}
                  className="w-full bg-slate-950/80 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all placeholder-slate-600"
                  placeholder="kullanici_adi"
                  maxLength={20}
                  minLength={3}
                />
                <p className="text-[10px] text-slate-500 mt-1">En az 3, en çok 20 karakter.</p>
              </div>

              {usernameError && (
                <div className="bg-red-950/40 border border-red-900/50 rounded-lg p-2 flex items-start gap-2 text-red-300/90 text-xs">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>{usernameError}</span>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => setShowUsernameModal(false)}
                  className="flex-1 py-2 px-4 bg-slate-800 text-slate-400 text-xs font-bold rounded-lg border border-slate-700 hover:bg-slate-700 transition-colors"
                >
                  Daha Sonra
                </button>
                <button
                  onClick={handleSetUsername}
                  disabled={usernameLoading || usernameInput.trim().length < 3}
                  className="flex-1 py-2 px-4 bg-gradient-to-r from-cyan-700 to-blue-600 text-white text-xs font-bold rounded-lg hover:from-cyan-600 hover:to-blue-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  {usernameLoading ? (
                    <span className="animate-pulse">Kontrol ediliyor...</span>
                  ) : (
                    <>
                      <Check size={14} />
                      {userRole === 'admin' && username ? 'Guncelle' : 'Kaydet'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Social Link Modal */}
      {showSocialLinkModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowSocialLinkModal(false)}>
          <div
            className="relative mx-4 w-full max-w-sm bg-gradient-to-b from-slate-800 to-slate-900 border border-slate-600/50 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-blue-900/40 to-indigo-900/40 px-6 py-4 border-b border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="bg-blue-500/15 p-2 rounded-xl border border-blue-500/25">
                  <Link2 size={20} className="text-blue-400" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-sm">Sosyal Medya Linki</h3>
                  <p className="text-slate-400 text-[10px] mt-0.5">Global aramada profilinizde gosterilir</p>
                </div>
              </div>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-[10px] font-semibold text-slate-400 mb-1.5 block tracking-wider">PROFIL LINKI</label>
                <input
                  type="url"
                  value={socialLinkInput}
                  onChange={(e) => setSocialLinkInput(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all placeholder-slate-600"
                  placeholder="https://instagram.com/kullanici"
                  maxLength={200}
                />
                <p className="text-[10px] text-slate-500 mt-1">Facebook, Instagram, Twitter vb. profil linkinizi girin.</p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowSocialLinkModal(false)}
                  className="flex-1 py-2 px-4 bg-slate-800 text-slate-400 text-xs font-bold rounded-lg border border-slate-700 hover:bg-slate-700 transition-colors"
                >
                  Vazgec
                </button>
                <button
                  onClick={handleSaveSocialLink}
                  disabled={socialLinkSaving}
                  className="flex-1 py-2 px-4 bg-gradient-to-r from-blue-700 to-indigo-600 text-white text-xs font-bold rounded-lg hover:from-blue-600 hover:to-indigo-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  {socialLinkSaving ? (
                    <span className="animate-pulse">Kaydediliyor...</span>
                  ) : (
                    <>
                      <Check size={14} />
                      Kaydet
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ItemDetailModal
        item={detailItem}
        onClose={() => { setDetailItem(null); setDetailSlot(null); }}
        onEdit={handleEditFromDetail}
        onCopy={handleCopyItem}
        onCraftTalismanDuplicates={handleCraftTalismanDuplicates}
        talismanLocations={talismanLocations}
        globalSetLookup={globalSetLookup}
        globalSetMap={globalSetMap}
      />

      <ItemModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSaveItem}
        onDelete={handleDeleteItem}
        onRead={handleReadRecipe}
        existingItem={getCurrentItem()}
        enchantmentSuggestions={enchantmentSuggestions}
        potionSuggestions={potionSuggestions}
        potionLevelMap={potionLevelMap}
        mineSuggestions={mineSuggestions}
        mineLevelMap={mineLevelMap}
        otherSuggestions={otherSuggestions}
        otherLevelMap={otherLevelMap}
        glassesSuggestions={glassesSuggestions}
        glassesLevelMap={glassesLevelMap}
        talismanSuggestions={talismanSuggestions}
        talismanOptionMap={talismanOptionMap}
        weaponTypeSuggestions={weaponTypeSuggestions}
        globalSetLookup={globalSetLookup}
        globalSetMap={globalSetMap}
      />

      <GlobalSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        accounts={accounts}
        onNavigate={handleSearchResultNavigate}
        globalSetLookup={globalSetLookup}
        globalSetMap={globalSetMap}
        currentUserUid={auth.currentUser?.uid || ''}
        currentUserRole={userRole}
        canUseGlobalSearch={canUseGlobalSearch}
      />

      <InventorySummaryModal
        isOpen={isInventorySummaryOpen}
        onClose={() => setIsInventorySummaryOpen(false)}
        accounts={accounts}
        selectedAccountId={selectedAccountId}
        selectedServerIndex={selectedServerIndex}
        activeCharIndex={activeCharIndex}
      />

      <MessagingModal
        isOpen={isMessagingOpen}
        onClose={() => setIsMessagingOpen(false)}
        currentUserUid={auth.currentUser?.uid || ''}
        currentUserRole={userRole}
        currentUsername={username}
        currentUserEmail={auth.currentUser?.email || ''}
      />

      <RecipeBookModal
        isOpen={isRecipeBookOpen}
        onClose={() => setIsRecipeBookOpen(false)}
        characterName={activeChar.name}
        recipes={activeChar.learnedRecipes || []}
        onUnlearn={handleUnlearnRecipe}
        onEdit={handleEditRecipe}
      />

      <ItemModal
        isOpen={isRecipeEditModalOpen}
        onClose={() => { setIsRecipeEditModalOpen(false); setEditingRecipe(null); }}
        onSave={handleSaveEditedRecipe}
        onDelete={handleDeleteEditedRecipe}
        existingItem={editingRecipe}
        enchantmentSuggestions={enchantmentSuggestions}
        potionSuggestions={potionSuggestions}
        potionLevelMap={potionLevelMap}
        mineSuggestions={mineSuggestions}
        mineLevelMap={mineLevelMap}
        otherSuggestions={otherSuggestions}
        otherLevelMap={otherLevelMap}
        glassesSuggestions={glassesSuggestions}
        glassesLevelMap={glassesLevelMap}
        talismanSuggestions={talismanSuggestions}
        talismanOptionMap={talismanOptionMap}
        weaponTypeSuggestions={weaponTypeSuggestions}
        globalSetLookup={globalSetLookup}
        globalSetMap={globalSetMap}
      />

      {/* Desktop Tooltip (mouse hover) */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none hidden md:block"
          style={{
            top: tooltip.y + 15,
            left: Math.min(tooltip.x + 15, window.innerWidth - 220)
          }}
        >
          <div className="bg-slate-900 border-2 border-slate-500 rounded p-2 text-xs shadow-[0_0_15px_rgba(0,0,0,0.8)] text-left w-52">
            <div className={`font-bold border-b border-slate-700 pb-1 mb-1 ${tooltip.item.type === 'Recipe' ? 'text-yellow-300' : (shouldShowBoundMarker(tooltip.item) ? 'text-amber-300 drop-shadow-[0_0_6px_rgba(251,191,36,0.8)]' : 'text-white')}`}>
              {tooltip.item.category} {tooltip.item.type === 'Recipe' ? '(Reçete)' : (shouldShowBoundMarker(tooltip.item) ? '(^)' : '')}
              {tooltip.item.count && tooltip.item.count > 1 && (
                  <span className="float-right text-emerald-400">x{tooltip.item.count}</span>
              )}
            </div>

            <div className={`${CLASS_COLORS[tooltip.item.heroClass]} font-bold mb-1`}>
              Sınıf: {tooltip.item.heroClass}
            </div>

            {tooltip.item.weaponType && (
               <div className="text-red-400 font-bold mb-1 border-b border-slate-700/50 pb-0.5">
                  {tooltip.item.weaponType}
               </div>
            )}

            <div className="text-gray-300 mb-1">
              Cinsiyet: <span className="text-white font-bold">{tooltip.item.gender || 'Belirtilmedi'}</span>
            </div>

            <div className="text-green-400 mb-1">Seviye: {tooltip.item.level}</div>

            {(tooltip.item.enchantment1 || tooltip.item.enchantment2) && (
              <div className="bg-slate-800 p-1.5 rounded mt-1 border border-slate-700 space-y-1">
                  {tooltip.item.category === 'Tılsım' ? (
                    <>
                      {tooltip.item.enchantment1 && <div className="text-purple-200 break-words">• {tooltip.item.enchantment1}</div>}
                      <div className="text-purple-300 break-words">• Renk: {resolveItemTalismanColor(tooltip.item)}</div>
                      <div className="text-purple-300 break-words">• Kademe: {resolveItemTalismanTier(tooltip.item)}</div>
                    </>
                  ) : (
                    <>
                      {tooltip.item.enchantment1 && <div className="text-yellow-200 break-words">• {tooltip.item.enchantment1}</div>}
                      {tooltip.item.enchantment2 && <div className="text-yellow-200 break-words">• {tooltip.item.enchantment2}</div>}
                    </>
                  )}
              </div>
            )}
          </div>
        </div>
      )}


    </div>
  );
}
