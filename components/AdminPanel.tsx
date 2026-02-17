import React, { useState, useEffect, useMemo } from 'react';
import { AdminUserInfo, SearchLimitsConfig, Account, UserPermissions, UserBlockInfo, UserClass, HeroClass, DEFAULT_USER_CLASS, normalizeUserClass, resolveUserClassQuotas, USER_CLASS_KEYS, normalizeUserAccessStatus } from '../types';
import { Shield, ArrowLeft, Users, Settings, BarChart3, Search, Trash2, Crown, Plus, X, Loader2, ChevronDown, ChevronUp, AlertTriangle, RotateCcw, Lock, Unlock, MessageCircle, UserX, UserCheck, AtSign, Upload, Pencil, Save, Download } from 'lucide-react';
import { auth, db } from '../firebase';
import { collection, getDocs, doc, getDoc, setDoc, query, where, writeBatch, arrayUnion, arrayRemove, runTransaction } from 'firebase/firestore';

interface AdminPanelProps {
  onBack: () => void;
}

type TabType = 'dashboard' | 'users' | 'settings' | 'autocomplete';

const DEFAULT_USER_PERMISSIONS: UserPermissions = {
  canDataEntry: true,
  canGlobalSearch: true,
};

const DEFAULT_BLOCK_INFO: UserBlockInfo = {
  isBlocked: false,
};

const BLOCK_REASON_OPTIONS = [
  { value: 'policy_violation', label: 'Kural ihlali' },
  { value: 'suspicious_activity', label: 'Supheli aktivite' },
  { value: 'security_review', label: 'Guvenlik incelemesi' },
];

type ClassLimitInputs = Record<UserClass, { dailyMessageLimit: string; dailyGlobalSearchLimit: string }>;
type NamedLevelEntry = { name: string; level: number };
type TalismanColor = 'Mavi' | 'Kırmızı';
type TalismanHeroClass = Exclude<HeroClass, 'Tüm Sınıflar'>;
type TalismanEntry = { name: string; color: TalismanColor; heroClass: TalismanHeroClass };
type AutocompleteSectionKey = 'enchantments' | 'potions' | 'mines' | 'others' | 'glasses' | 'talismans';

export const AdminPanel: React.FC<AdminPanelProps> = ({ onBack }) => {
  const defaultClassLimits = resolveUserClassQuotas(null);
  const toClassLimitInputs = (classLimits: SearchLimitsConfig['classLimits']): ClassLimitInputs => ({
    user: {
      dailyMessageLimit: String(classLimits.user.dailyMessageLimit),
      dailyGlobalSearchLimit: String(classLimits.user.dailyGlobalSearchLimit),
    },
    premium: {
      dailyMessageLimit: String(classLimits.premium.dailyMessageLimit),
      dailyGlobalSearchLimit: String(classLimits.premium.dailyGlobalSearchLimit),
    },
    pro: {
      dailyMessageLimit: String(classLimits.pro.dailyMessageLimit),
      dailyGlobalSearchLimit: String(classLimits.pro.dailyGlobalSearchLimit),
    },
  });

  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Data
  const [allUsers, setAllUsers] = useState<AdminUserInfo[]>([]);
  const [globalItemCount, setGlobalItemCount] = useState(0);
  const [globalItemCategories, setGlobalItemCategories] = useState<Record<string, number>>({});
  const [globalItemClasses, setGlobalItemClasses] = useState<Record<string, number>>({});
  const [globalItemGenders, setGlobalItemGenders] = useState<Record<string, number>>({});

  // Settings
  const [adminEmails, setAdminEmails] = useState<string[]>([]);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);
  const [searchLimits, setSearchLimits] = useState<SearchLimitsConfig>({
    defaultLimit: 50,
    userOverrides: {},
    classLimits: defaultClassLimits,
  });
  const [classLimitInputs, setClassLimitInputs] = useState<ClassLimitInputs>(() => toClassLimitInputs(defaultClassLimits));
  const [limitSaving, setLimitSaving] = useState(false);
  const [maxAccounts, setMaxAccounts] = useState(10);
  const [maxAccountsInput, setMaxAccountsInput] = useState('10');
  const [maxAccountsSaving, setMaxAccountsSaving] = useState(false);
  const [autoApproveSlots, setAutoApproveSlots] = useState(0);
  const [autoApproveSlotsInput, setAutoApproveSlotsInput] = useState('0');
  const [autoApproveSlotsSaving, setAutoApproveSlotsSaving] = useState(false);
  const [directMessagingEnabled, setDirectMessagingEnabled] = useState(true);
  const [messageSystemSaving, setMessageSystemSaving] = useState(false);
  const [managedEnchantments, setManagedEnchantments] = useState<string[]>([]);
  const [enchantmentTextInput, setEnchantmentTextInput] = useState('');
  const [enchantmentListSearch, setEnchantmentListSearch] = useState('');
  const [editingEnchantment, setEditingEnchantment] = useState<string | null>(null);
  const [editingEnchantmentInput, setEditingEnchantmentInput] = useState('');
  const [enchantmentSaving, setEnchantmentSaving] = useState(false);
  const [enchantmentImporting, setEnchantmentImporting] = useState(false);
  const enchantmentImportInputRef = React.useRef<HTMLInputElement | null>(null);
  const autocompleteBulkImportInputRef = React.useRef<HTMLInputElement | null>(null);
  const [autocompleteBulkImporting, setAutocompleteBulkImporting] = useState(false);
  const [managedPotions, setManagedPotions] = useState<NamedLevelEntry[]>([]);
  const [potionTextInput, setPotionTextInput] = useState('');
  const [potionListSearch, setPotionListSearch] = useState('');
  const [editingPotion, setEditingPotion] = useState<string | null>(null);
  const [editingPotionNameInput, setEditingPotionNameInput] = useState('');
  const [editingPotionLevelInput, setEditingPotionLevelInput] = useState('1');
  const [potionSaving, setPotionSaving] = useState(false);
  const [managedMines, setManagedMines] = useState<NamedLevelEntry[]>([]);
  const [mineTextInput, setMineTextInput] = useState('');
  const [mineListSearch, setMineListSearch] = useState('');
  const [editingMine, setEditingMine] = useState<string | null>(null);
  const [editingMineNameInput, setEditingMineNameInput] = useState('');
  const [editingMineLevelInput, setEditingMineLevelInput] = useState('1');
  const [mineSaving, setMineSaving] = useState(false);
  const [managedOthers, setManagedOthers] = useState<NamedLevelEntry[]>([]);
  const [otherTextInput, setOtherTextInput] = useState('');
  const [otherListSearch, setOtherListSearch] = useState('');
  const [editingOther, setEditingOther] = useState<string | null>(null);
  const [editingOtherNameInput, setEditingOtherNameInput] = useState('');
  const [editingOtherLevelInput, setEditingOtherLevelInput] = useState('1');
  const [otherSaving, setOtherSaving] = useState(false);
  const [managedGlasses, setManagedGlasses] = useState<NamedLevelEntry[]>([]);
  const [glassesTextInput, setGlassesTextInput] = useState('');
  const [glassesListSearch, setGlassesListSearch] = useState('');
  const [editingGlasses, setEditingGlasses] = useState<string | null>(null);
  const [editingGlassesNameInput, setEditingGlassesNameInput] = useState('');
  const [editingGlassesLevelInput, setEditingGlassesLevelInput] = useState('1');
  const [glassesSaving, setGlassesSaving] = useState(false);
  const [managedTalismans, setManagedTalismans] = useState<TalismanEntry[]>([]);
  const [talismanTextInput, setTalismanTextInput] = useState('');
  const [talismanListSearch, setTalismanListSearch] = useState('');
  const [editingTalisman, setEditingTalisman] = useState<string | null>(null);
  const [editingTalismanNameInput, setEditingTalismanNameInput] = useState('');
  const [editingTalismanColorInput, setEditingTalismanColorInput] = useState<TalismanColor>('Mavi');
  const [editingTalismanClassInput, setEditingTalismanClassInput] = useState<TalismanHeroClass>('Savaşçı');
  const [talismanSaving, setTalismanSaving] = useState(false);
  const [isAutocompleteCompact, setIsAutocompleteCompact] = useState(true);

  // Users tab
  const [userSearch, setUserSearch] = useState('');
  const [userAccessFilter, setUserAccessFilter] = useState<'all' | 'pending'>('all');
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [permissionSaving, setPermissionSaving] = useState<Record<string, boolean>>({});
  const [userClassSaving, setUserClassSaving] = useState<Record<string, boolean>>({});
  const [userSearchOverrideInputs, setUserSearchOverrideInputs] = useState<Record<string, string>>({});
  const [userSearchOverrideSaving, setUserSearchOverrideSaving] = useState<Record<string, boolean>>({});
  const [usernameInputs, setUsernameInputs] = useState<Record<string, string>>({});
  const [usernameSaving, setUsernameSaving] = useState<Record<string, boolean>>({});
  const [blockReasonInputs, setBlockReasonInputs] = useState<Record<string, string>>({});
  const [blockSaving, setBlockSaving] = useState<Record<string, boolean>>({});
  const [approvalSaving, setApprovalSaving] = useState<Record<string, boolean>>({});
  const [bulkApprovalSaving, setBulkApprovalSaving] = useState(false);

  // Fetch all data on mount
  useEffect(() => {
    fetchAllData();
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('admin_autocomplete_compact');
      if (stored === '0') setIsAutocompleteCompact(false);
      if (stored === '1') setIsAutocompleteCompact(true);
    } catch {
      // ignore local storage read failures
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('admin_autocomplete_compact', isAutocompleteCompact ? '1' : '0');
    } catch {
      // ignore local storage write failures
    }
  }, [isAutocompleteCompact]);

  const normalizeAccounts = (raw: unknown): Account[] => {
    if (Array.isArray(raw)) return raw as Account[];
    if (raw && typeof raw === 'object') {
      return Object.values(raw).filter((value): value is Account => !!value && typeof value === 'object');
    }
    return [];
  };

  const toMillis = (value: unknown): number | undefined => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (value instanceof Date) return value.getTime();
    if (value && typeof value === 'object' && 'toMillis' in value) {
      const fn = (value as { toMillis?: unknown }).toMillis;
      if (typeof fn === 'function') {
        try {
          return (fn as () => number)();
        } catch {
          return undefined;
        }
      }
    }
    return undefined;
  };

  const normalizeEnchantmentName = (value: unknown) => String(value ?? '').replace(/^\uFEFF/, '').trim();

  const toUniqueSortedEnchantments = (names: string[]): string[] => {
    const seen = new Set<string>();
    const unique: string[] = [];
    names.forEach(rawName => {
      const normalized = normalizeEnchantmentName(rawName);
      if (!normalized) return;
      const key = normalized.toLocaleLowerCase('tr');
      if (seen.has(key)) return;
      seen.add(key);
      unique.push(normalized);
    });
    return unique.sort((a, b) => a.toLocaleLowerCase('tr').localeCompare(b.toLocaleLowerCase('tr'), 'tr'));
  };

  const normalizeLevelValue = (value: unknown, fallback = 1) => {
    const parsed = parseInt(String(value ?? '').trim(), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(59, Math.max(1, parsed));
  };

  const normalizeHeaderToken = (value: string) => (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('tr')
      .trim()
  );

  const isAutocompleteHeaderToken = (value: string) => {
    const token = normalizeHeaderToken(value);
    return (
      token === 'efsun' ||
      token === 'enchantment' ||
      token === 'name' ||
      token === 'isim' ||
      token === 'ad' ||
      token === 'iksir' ||
      token === 'potion' ||
      token === 'maden' ||
      token === 'diger' ||
      token === 'other' ||
      token === 'gozluk' ||
      token === 'tilsim' ||
      token === 'talisman' ||
      token === 'renk' ||
      token === 'color' ||
      token === 'sinif' ||
      token === 'class' ||
      token === 'seviye' ||
      token === 'level' ||
      token === 'lv'
    );
  };

  const parseNamedLevelEntry = (rawName: unknown, rawLevel: unknown, fallbackLevel = 1): NamedLevelEntry | null => {
    const normalizedName = normalizeEnchantmentName(rawName);
    if (!normalizedName) return null;

    const embeddedLevelMatch = normalizedName.match(/^(.+?)\s*[:;]\s*(\d+)$/);
    if (embeddedLevelMatch) {
      const embeddedName = normalizeEnchantmentName(embeddedLevelMatch[1]);
      if (embeddedName) {
        return {
          name: embeddedName,
          level: normalizeLevelValue(embeddedLevelMatch[2], fallbackLevel),
        };
      }
    }

    return {
      name: normalizedName,
      level: normalizeLevelValue(rawLevel, fallbackLevel),
    };
  };

  const toUniqueSortedNamedLevels = (entries: NamedLevelEntry[]): NamedLevelEntry[] => {
    const byKey = new Map<string, NamedLevelEntry>();
    entries.forEach(entry => {
      const name = normalizeEnchantmentName(entry.name);
      if (!name) return;
      const key = name.toLocaleLowerCase('tr');
      byKey.set(key, {
        name,
        level: normalizeLevelValue(entry.level),
      });
    });
    return [...byKey.values()].sort((a, b) => a.name.toLocaleLowerCase('tr').localeCompare(b.name.toLocaleLowerCase('tr'), 'tr'));
  };

  const toNamedLevelsFromUnknown = (raw: unknown): NamedLevelEntry[] => {
    if (!Array.isArray(raw)) return [];
    const parsed: NamedLevelEntry[] = [];
    raw.forEach(value => {
      if (!value || typeof value !== 'object') return;
      const data = value as { name?: unknown; level?: unknown };
      const entry = parseNamedLevelEntry(data.name, data.level, 1);
      if (!entry) return;
      parsed.push(entry);
    });
    return toUniqueSortedNamedLevels(parsed);
  };

  const extractNamedLevelsFromText = (rawText: string, fallbackLevel = 1): NamedLevelEntry[] => {
    const sanitized = rawText.replace(/^\uFEFF/, '');
    const values: NamedLevelEntry[] = [];

    sanitized.split(/\r?\n/).forEach(line => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return;

      const normalizedLine = trimmedLine.replace(/^"|"$/g, '');
      const firstToken = normalizeEnchantmentName((normalizedLine.split(/[:;,\t]/)[0] || ''));
      if (!firstToken || isAutocompleteHeaderToken(firstToken)) {
        return;
      }

      // Allow multiple pairs in a single line (e.g. "Denim:25, Kurt Kurku:37").
      const pairRegex = /([^,;\t]+?)\s*[:;]\s*(\d+)/g;
      const parsedInlineEntries: NamedLevelEntry[] = [];
      let pairMatch: RegExpExecArray | null = pairRegex.exec(normalizedLine);
      while (pairMatch) {
        const parsedInline = parseNamedLevelEntry(pairMatch[1], pairMatch[2], fallbackLevel);
        if (parsedInline) parsedInlineEntries.push(parsedInline);
        pairMatch = pairRegex.exec(normalizedLine);
      }
      if (parsedInlineEntries.length > 0) {
        values.push(...parsedInlineEntries);
        return;
      }

      const cells = normalizedLine
        .split(/[;,\t]/)
        .map(cell => cell.trim().replace(/^"|"$/g, ''));
      const parsed = parseNamedLevelEntry(cells[0], cells[1], fallbackLevel);
      if (!parsed) return;
      values.push(parsed);
    });

    return toUniqueSortedNamedLevels(values);
  };

  const TALISMAN_CLASS_ORDER: TalismanHeroClass[] = ['Savaşçı', 'Büyücü', 'Şifacı'];

  const normalizeLookupToken = (value: unknown) => (
    normalizeEnchantmentName(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('tr')
      .replace(/ı/g, 'i')
  );

  const normalizeTalismanColor = (value: unknown): TalismanColor | null => {
    const token = normalizeLookupToken(value);
    if (token === 'mavi') return 'Mavi';
    if (token === 'kirmizi') return 'Kırmızı';
    return null;
  };

  const normalizeTalismanHeroClass = (value: unknown): TalismanHeroClass | null => {
    const token = normalizeLookupToken(value);
    if (token === 'savasci') return 'Savaşçı';
    if (token === 'buyucu') return 'Büyücü';
    if (token === 'sifaci') return 'Şifacı';
    return null;
  };

  const toUniqueSortedTalismans = (entries: TalismanEntry[]): TalismanEntry[] => {
    const byKey = new Map<string, TalismanEntry>();
    entries.forEach(entry => {
      const name = normalizeEnchantmentName(entry.name);
      const color = normalizeTalismanColor(entry.color);
      const heroClass = normalizeTalismanHeroClass(entry.heroClass);
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

  const parseTalismanEntry = (rawName: unknown, rawColor: unknown, rawHeroClass: unknown): TalismanEntry | null => {
    const name = normalizeEnchantmentName(rawName);
    const color = normalizeTalismanColor(rawColor);
    const heroClass = normalizeTalismanHeroClass(rawHeroClass);
    if (!name || !color || !heroClass) return null;
    return { name, color, heroClass };
  };

  const toTalismansFromUnknown = (raw: unknown): TalismanEntry[] => {
    if (!Array.isArray(raw)) return [];
    const values: TalismanEntry[] = [];
    raw.forEach(item => {
      if (!item || typeof item !== 'object') return;
      const data = item as { name?: unknown; color?: unknown; heroClass?: unknown; class?: unknown };
      const parsed = parseTalismanEntry(data.name, data.color, data.heroClass ?? data.class);
      if (!parsed) return;
      values.push(parsed);
    });
    return toUniqueSortedTalismans(values);
  };

  const extractTalismansFromText = (rawText: string): TalismanEntry[] => {
    const sanitized = rawText.replace(/^\uFEFF/, '');
    const values: TalismanEntry[] = [];

    sanitized.split(/\r?\n/).forEach(line => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return;

      const normalizedLine = trimmedLine.replace(/^"|"$/g, '');
      const cells = normalizedLine
        .split(/[:;,\t]/)
        .map(cell => cell.trim().replace(/^"|"$/g, ''))
        .filter(cell => cell !== '');

      if (cells.length < 3) return;
      if (isAutocompleteHeaderToken(cells[0]) || isAutocompleteHeaderToken(cells[1]) || isAutocompleteHeaderToken(cells[2])) {
        return;
      }

      const parsed = parseTalismanEntry(cells[0], cells[1], cells[2]);
      if (!parsed) return;
      values.push(parsed);
    });

    return toUniqueSortedTalismans(values);
  };

  const extractEnchantmentNamesFromText = (rawText: string): string[] => {
    const sanitized = rawText.replace(/^\uFEFF/, '');
    const values: string[] = [];

    sanitized.split(/\r?\n/).forEach(line => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return;

      const normalizedLine = trimmedLine.replace(/^"|"$/g, '');
      const firstToken = normalizeEnchantmentName((normalizedLine.split(/[:;,\t]/)[0] || ''));
      if (!firstToken || isAutocompleteHeaderToken(firstToken)) return;

      const cells = normalizedLine
        .split(/[;,\t]/)
        .map(cell => cell.trim().replace(/^"|"$/g, ''));
      const candidate = (cells.find(cell => cell !== '') || '').trim();
      if (!candidate) return;

      if (isAutocompleteHeaderToken(candidate)) {
        return;
      }
      values.push(candidate);
    });

    return toUniqueSortedEnchantments(values);
  };

  const resolveAutocompleteSectionKey = (rawSection: string): AutocompleteSectionKey | null => {
    const token = normalizeHeaderToken(rawSection).replace(/[\s_-]+/g, '');
    if (token === 'efsun' || token === 'enchantment' || token === 'enchantments') return 'enchantments';
    if (token === 'iksir' || token === 'potion' || token === 'potions') return 'potions';
    if (token === 'maden' || token === 'mine' || token === 'mines') return 'mines';
    if (token === 'diger' || token === 'other' || token === 'others') return 'others';
    if (token === 'gozluk' || token === 'glasses') return 'glasses';
    if (token === 'tilsim' || token === 'talisman' || token === 'talismans') return 'talismans';
    return null;
  };

  const parseAutocompleteBulkSections = (rawText: string) => {
    const sectionLines: Record<AutocompleteSectionKey, string[]> = {
      enchantments: [],
      potions: [],
      mines: [],
      others: [],
      glasses: [],
      talismans: [],
    };
    const seenSections: Record<AutocompleteSectionKey, boolean> = {
      enchantments: false,
      potions: false,
      mines: false,
      others: false,
      glasses: false,
      talismans: false,
    };

    const sanitized = rawText.replace(/^\uFEFF/, '');
    let currentSection: AutocompleteSectionKey | null = null;

    sanitized.split(/\r?\n/).forEach(rawLine => {
      const line = rawLine.trim();
      if (!line || line.startsWith('#') || line.startsWith('//')) return;

      const headerMatch = line.match(/^\[(.+)\]$/);
      if (headerMatch) {
        const sectionKey = resolveAutocompleteSectionKey(headerMatch[1]);
        currentSection = sectionKey;
        if (sectionKey) {
          seenSections[sectionKey] = true;
        }
        return;
      }

      if (!currentSection) return;
      sectionLines[currentSection].push(line);
    });

    return {
      seenSections,
      parsed: {
        enchantments: extractEnchantmentNamesFromText(sectionLines.enchantments.join('\n')),
        potions: extractNamedLevelsFromText(sectionLines.potions.join('\n'), 1),
        mines: extractNamedLevelsFromText(sectionLines.mines.join('\n'), 1),
        others: extractNamedLevelsFromText(sectionLines.others.join('\n'), 1),
        glasses: extractNamedLevelsFromText(sectionLines.glasses.join('\n'), 1),
        talismans: extractTalismansFromText(sectionLines.talismans.join('\n')),
      },
    };
  };

  const saveManagedEnchantments = async (nextNames: string[]): Promise<boolean> => {
    const normalizedNames = toUniqueSortedEnchantments(nextNames);
    setEnchantmentSaving(true);
    try {
      await setDoc(doc(db, "metadata", "enchantments"), {
        names: normalizedNames,
        updatedAt: Date.now(),
      }, { merge: true });
      setManagedEnchantments(normalizedNames);
      return true;
    } catch (error) {
      console.error("Efsun onerileri kaydetme hatasi:", error);
      alert("Efsun onerileri kaydedilirken hata olustu.");
      return false;
    } finally {
      setEnchantmentSaving(false);
    }
  };

  const saveManagedPotions = async (nextEntries: NamedLevelEntry[]): Promise<boolean> => {
    const normalizedEntries = toUniqueSortedNamedLevels(nextEntries);
    setPotionSaving(true);
    try {
      await setDoc(doc(db, "metadata", "potions"), {
        entries: normalizedEntries,
        names: normalizedEntries.map(entry => entry.name),
        updatedAt: Date.now(),
      }, { merge: true });
      setManagedPotions(normalizedEntries);
      return true;
    } catch (error) {
      console.error("Iksir onerileri kaydetme hatasi:", error);
      alert("Iksir onerileri kaydedilirken hata olustu.");
      return false;
    } finally {
      setPotionSaving(false);
    }
  };

  const saveManagedMines = async (nextEntries: NamedLevelEntry[]): Promise<boolean> => {
    const normalizedEntries = toUniqueSortedNamedLevels(nextEntries);
    setMineSaving(true);
    try {
      await setDoc(doc(db, "metadata", "mines"), {
        entries: normalizedEntries,
        updatedAt: Date.now(),
      }, { merge: true });
      setManagedMines(normalizedEntries);
      return true;
    } catch (error) {
      console.error("Maden onerileri kaydetme hatasi:", error);
      alert("Maden onerileri kaydedilirken hata olustu.");
      return false;
    } finally {
      setMineSaving(false);
    }
  };

  const saveManagedOthers = async (nextEntries: NamedLevelEntry[]): Promise<boolean> => {
    const normalizedEntries = toUniqueSortedNamedLevels(nextEntries);
    setOtherSaving(true);
    try {
      await setDoc(doc(db, "metadata", "others"), {
        entries: normalizedEntries,
        updatedAt: Date.now(),
      }, { merge: true });
      setManagedOthers(normalizedEntries);
      return true;
    } catch (error) {
      console.error("Diger onerileri kaydetme hatasi:", error);
      const detail = error instanceof Error ? error.message : String(error);
      alert(`Diger onerileri kaydedilirken hata olustu: ${detail}`);
      return false;
    } finally {
      setOtherSaving(false);
    }
  };

  const saveManagedGlasses = async (nextEntries: NamedLevelEntry[]): Promise<boolean> => {
    const normalizedEntries = toUniqueSortedNamedLevels(nextEntries);
    setGlassesSaving(true);
    try {
      await setDoc(doc(db, "metadata", "glasses"), {
        entries: normalizedEntries,
        updatedAt: Date.now(),
      }, { merge: true });
      setManagedGlasses(normalizedEntries);
      return true;
    } catch (error) {
      console.error("Gozluk onerileri kaydetme hatasi:", error);
      alert("Gozluk onerileri kaydedilirken hata olustu.");
      return false;
    } finally {
      setGlassesSaving(false);
    }
  };

  const saveManagedTalismans = async (nextEntries: TalismanEntry[]): Promise<boolean> => {
    const normalizedEntries = toUniqueSortedTalismans(nextEntries);
    setTalismanSaving(true);
    try {
      await setDoc(doc(db, "metadata", "talismans"), {
        entries: normalizedEntries,
        names: toUniqueSortedEnchantments(normalizedEntries.map(entry => entry.name)),
        updatedAt: Date.now(),
      }, { merge: true });
      setManagedTalismans(normalizedEntries);
      return true;
    } catch (error) {
      console.error("Tilsim onerileri kaydetme hatasi:", error);
      alert("Tilsim onerileri kaydedilirken hata olustu.");
      return false;
    } finally {
      setTalismanSaving(false);
    }
  };

  const fetchAllData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // Fire ALL Firestore queries in parallel
      const [
        usersSnap,
        globalSnap,
        adminsDocResult,
        enchantmentsDocResult,
        potionsDocResult,
        minesDocResult,
        othersDocResult,
        glassesDocResult,
        talismansDocResult,
        limitsDocResult,
        messageSettingsDocResult,
      ] = await Promise.all([
        getDocs(collection(db, "users")),
        getDocs(collection(db, "globalItems")),
        getDoc(doc(db, "metadata", "admins")).catch(() => null),
        getDoc(doc(db, "metadata", "enchantments")).catch(() => null),
        getDoc(doc(db, "metadata", "potions")).catch(() => null),
        getDoc(doc(db, "metadata", "mines")).catch(() => null),
        getDoc(doc(db, "metadata", "others")).catch(() => null),
        getDoc(doc(db, "metadata", "glasses")).catch(() => null),
        getDoc(doc(db, "metadata", "talismans")).catch(() => null),
        getDoc(doc(db, "metadata", "searchLimits")).catch(() => null),
        getDoc(doc(db, "metadata", "messageSettings")).catch(() => null),
      ]);

      // Process users
      const users: AdminUserInfo[] = [];
      usersSnap.forEach(docSnap => {
        try {
          const data = docSnap.data();
          const accounts = normalizeAccounts(data.accounts);
          const createdAt = toMillis(data.createdAt);
          const rawPermissions = (data.permissions && typeof data.permissions === 'object') ? data.permissions as Partial<UserPermissions> : {};
          const permissions: UserPermissions = {
            canDataEntry: typeof rawPermissions.canDataEntry === 'boolean' ? rawPermissions.canDataEntry : DEFAULT_USER_PERMISSIONS.canDataEntry,
            canGlobalSearch: typeof rawPermissions.canGlobalSearch === 'boolean' ? rawPermissions.canGlobalSearch : DEFAULT_USER_PERMISSIONS.canGlobalSearch,
          };
          const userClass = normalizeUserClass(data.userClass);
          const rawBlockInfo = (data.blockInfo && typeof data.blockInfo === 'object')
            ? data.blockInfo as Partial<UserBlockInfo>
            : {};
          const blockInfo: UserBlockInfo = {
            isBlocked: rawBlockInfo.isBlocked === true,
            reasonCode: typeof rawBlockInfo.reasonCode === 'string' ? rawBlockInfo.reasonCode : undefined,
            reasonLabel: typeof rawBlockInfo.reasonLabel === 'string' ? rawBlockInfo.reasonLabel : undefined,
            blockedAt: (typeof rawBlockInfo.blockedAt === 'number' && Number.isFinite(rawBlockInfo.blockedAt) && rawBlockInfo.blockedAt > 0)
              ? rawBlockInfo.blockedAt
              : undefined,
            blockedByUid: typeof rawBlockInfo.blockedByUid === 'string' ? rawBlockInfo.blockedByUid : undefined,
          };
          const accessStatus = normalizeUserAccessStatus(data.accessStatus);
          const approvalRequestedAt = toMillis(data.approvalRequestedAt);
          const approvedAt = toMillis(data.approvedAt);
          const approvedByUid = typeof data.approvedByUid === 'string' ? data.approvedByUid : undefined;

          let totalItems = 0;
          let totalRecipes = 0;

          accounts.forEach(acc => {
            const servers = Array.isArray(acc?.servers) ? acc.servers : [];
            servers.forEach(server => {
              const characters = Array.isArray(server?.characters) ? server.characters : [];
              characters.forEach(char => {
                [char?.bank1, char?.bank2, char?.bag].forEach(container => {
                  if (Array.isArray(container?.slots)) {
                    container.slots.forEach(slot => {
                      if (slot?.item) totalItems++;
                    });
                  }
                });
                totalRecipes += Array.isArray(char?.learnedRecipes) ? char.learnedRecipes.length : 0;
              });
            });
          });

          users.push({
            uid: docSnap.id,
            email: data.email || '',
            username: data.username || null,
            socialLink: data.socialLink || '',
            accountCount: accounts.length,
            totalItemCount: totalItems,
            totalRecipeCount: totalRecipes,
            createdAt,
            accounts,
            permissions,
            userClass,
            blockInfo,
            accessStatus,
            approvalRequestedAt,
            approvedAt,
            approvedByUid,
          });
        } catch (userError) {
          console.warn("Kullanici parse atlaniyor:", docSnap.id, userError);
        }
      });

      setAllUsers(users);
      setUsernameInputs(users.reduce<Record<string, string>>((acc, userInfo) => {
        acc[userInfo.uid] = userInfo.username || '';
        return acc;
      }, {}));
      setBlockReasonInputs(users.reduce<Record<string, string>>((acc, userInfo) => {
        acc[userInfo.uid] = userInfo.blockInfo.reasonCode || BLOCK_REASON_OPTIONS[0].value;
        return acc;
      }, {}));

      // Process global items stats
      setGlobalItemCount(globalSnap.size);

      const catCount: Record<string, number> = {};
      const classCount: Record<string, number> = {};
      const genderCount: Record<string, number> = {};

      globalSnap.forEach(d => {
        const item = d.data().item;
        if (item) {
          const category = typeof item.category === 'string' && item.category ? item.category : 'Bilinmiyor';
          const heroClass = typeof item.heroClass === 'string' && item.heroClass ? item.heroClass : 'Bilinmiyor';
          const gender = typeof item.gender === 'string' && item.gender ? item.gender : 'Bilinmiyor';
          catCount[category] = (catCount[category] || 0) + 1;
          classCount[heroClass] = (classCount[heroClass] || 0) + 1;
          genderCount[gender] = (genderCount[gender] || 0) + 1;
        }
      });

      setGlobalItemCategories(catCount);
      setGlobalItemClasses(classCount);
      setGlobalItemGenders(genderCount);

      // Process admin list
      if (adminsDocResult?.exists()) {
        setAdminEmails(adminsDocResult.data().emails || []);
      }

      // Process managed enchantment suggestions
      if (enchantmentsDocResult?.exists()) {
        const rawNames = enchantmentsDocResult.data().names;
        const names = Array.isArray(rawNames)
          ? rawNames.filter((value): value is string => typeof value === 'string')
          : [];
        setManagedEnchantments(toUniqueSortedEnchantments(names));
      } else {
        setManagedEnchantments([]);
      }

      // Process managed potion suggestions
      if (potionsDocResult?.exists()) {
        const rawData = potionsDocResult.data();
        const entryList = toNamedLevelsFromUnknown(rawData.entries);
        if (entryList.length > 0) {
          setManagedPotions(entryList);
        } else {
          const rawNames = Array.isArray(rawData.names)
            ? rawData.names.filter((value): value is string => typeof value === 'string')
            : [];
          setManagedPotions(toNamedLevelsFromUnknown(rawNames.map(name => ({ name, level: 1 }))));
        }
      } else {
        setManagedPotions([]);
      }

      // Process managed mine suggestions
      if (minesDocResult?.exists()) {
        setManagedMines(toNamedLevelsFromUnknown(minesDocResult.data().entries));
      } else {
        setManagedMines([]);
      }

      // Process managed other suggestions
      if (othersDocResult?.exists()) {
        setManagedOthers(toNamedLevelsFromUnknown(othersDocResult.data().entries));
      } else {
        setManagedOthers([]);
      }

      // Process managed glasses suggestions
      if (glassesDocResult?.exists()) {
        setManagedGlasses(toNamedLevelsFromUnknown(glassesDocResult.data().entries));
      } else {
        setManagedGlasses([]);
      }

      // Process managed talisman suggestions
      if (talismansDocResult?.exists()) {
        const rawData = talismansDocResult.data();
        const entries = toTalismansFromUnknown(rawData.entries);
        if (entries.length > 0) {
          setManagedTalismans(entries);
        } else {
          const rawNames = Array.isArray(rawData.names)
            ? rawData.names.filter((value): value is string => typeof value === 'string')
            : [];
          setManagedTalismans(toUniqueSortedTalismans(rawNames.map(name => ({
            name,
            color: 'Mavi',
            heroClass: 'Savaşçı',
          }))));
        }
      } else {
        setManagedTalismans([]);
      }

      // Process search limits
      if (limitsDocResult?.exists()) {
        const data = limitsDocResult.data();
        const resolvedDefaultLimit = (typeof data.defaultLimit === 'number' && Number.isFinite(data.defaultLimit) && data.defaultLimit > 0)
          ? Math.floor(data.defaultLimit)
          : 50;
        const resolvedOverrides = (data.userOverrides && typeof data.userOverrides === 'object')
          ? data.userOverrides as Record<string, number>
          : {};
        const resolvedClassLimits = resolveUserClassQuotas(data.classLimits);
        setSearchLimits({
          defaultLimit: resolvedDefaultLimit,
          userOverrides: resolvedOverrides,
          classLimits: resolvedClassLimits,
        });
        setClassLimitInputs(toClassLimitInputs(resolvedClassLimits));
        const resolvedMaxAccounts = (typeof data.maxAccounts === 'number' && Number.isFinite(data.maxAccounts) && data.maxAccounts >= 1)
          ? Math.floor(data.maxAccounts)
          : 10;
        const resolvedAutoApproveSlots = (typeof data.autoApproveSlots === 'number' && Number.isFinite(data.autoApproveSlots) && data.autoApproveSlots >= 0)
          ? Math.floor(data.autoApproveSlots)
          : 0;
        setMaxAccounts(resolvedMaxAccounts);
        setMaxAccountsInput(String(resolvedMaxAccounts));
        setAutoApproveSlots(resolvedAutoApproveSlots);
        setAutoApproveSlotsInput(String(resolvedAutoApproveSlots));
        setUserSearchOverrideInputs(users.reduce<Record<string, string>>((acc, userInfo) => {
          const overrideValue = resolvedOverrides[userInfo.uid];
          acc[userInfo.uid] = overrideValue !== undefined ? String(overrideValue) : '';
          return acc;
        }, {}));
      } else {
        setSearchLimits({ defaultLimit: 50, userOverrides: {}, classLimits: defaultClassLimits });
        setClassLimitInputs(toClassLimitInputs(defaultClassLimits));
        setMaxAccounts(10);
        setMaxAccountsInput('10');
        setAutoApproveSlots(0);
        setAutoApproveSlotsInput('0');
        setUserSearchOverrideInputs(users.reduce<Record<string, string>>((acc, userInfo) => {
          acc[userInfo.uid] = '';
          return acc;
        }, {}));
      }

      // Process global messaging setting
      if (messageSettingsDocResult?.exists()) {
        const data = messageSettingsDocResult.data() as { directMessagesEnabled?: unknown };
        setDirectMessagingEnabled(data.directMessagesEnabled !== false);
      } else {
        setDirectMessagingEnabled(true);
      }

    } catch (error) {
      setLoadError("Veriler yuklenirken hata olustu. Firestore izinlerini ve kullanici kayit verilerini kontrol edin.");
      console.error("Admin veri yükleme hatası:", error);
    } finally {
      setLoading(false);
    }
  };

  // Stats
  const totalItems = useMemo(() => allUsers.reduce((sum, u) => sum + u.totalItemCount, 0), [allUsers]);
  const totalRecipes = useMemo(() => allUsers.reduce((sum, u) => sum + u.totalRecipeCount, 0), [allUsers]);
  const recentUsers = useMemo(() => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return allUsers.filter(u => u.createdAt && u.createdAt > sevenDaysAgo).length;
  }, [allUsers]);

  // Category distribution from ALL users' items
  const allItemCategoryDist = useMemo(() => {
    const dist: Record<string, number> = {};
    allUsers.forEach(u => {
      const accounts = Array.isArray(u.accounts) ? u.accounts : [];
      accounts.forEach(acc => {
        const servers = Array.isArray(acc?.servers) ? acc.servers : [];
        servers.forEach(server => {
          const characters = Array.isArray(server?.characters) ? server.characters : [];
          characters.forEach(char => {
            [char?.bank1, char?.bank2, char?.bag].forEach(container => {
              if (Array.isArray(container?.slots)) {
                container.slots.forEach(slot => {
                  if (slot?.item?.category) {
                    dist[slot.item.category] = (dist[slot.item.category] || 0) + 1;
                  }
                });
              }
            });
          });
        });
      });
    });
    return dist;
  }, [allUsers]);

  const allItemClassDist = useMemo(() => {
    const dist: Record<string, number> = {};
    allUsers.forEach(u => {
      const accounts = Array.isArray(u.accounts) ? u.accounts : [];
      accounts.forEach(acc => {
        const servers = Array.isArray(acc?.servers) ? acc.servers : [];
        servers.forEach(server => {
          const characters = Array.isArray(server?.characters) ? server.characters : [];
          characters.forEach(char => {
            [char?.bank1, char?.bank2, char?.bag].forEach(container => {
              if (Array.isArray(container?.slots)) {
                container.slots.forEach(slot => {
                  if (slot?.item?.heroClass) {
                    dist[slot.item.heroClass] = (dist[slot.item.heroClass] || 0) + 1;
                  }
                });
              }
            });
          });
        });
      });
    });
    return dist;
  }, [allUsers]);

  const allItemGenderDist = useMemo(() => {
    const dist: Record<string, number> = {};
    allUsers.forEach(u => {
      const accounts = Array.isArray(u.accounts) ? u.accounts : [];
      accounts.forEach(acc => {
        const servers = Array.isArray(acc?.servers) ? acc.servers : [];
        servers.forEach(server => {
          const characters = Array.isArray(server?.characters) ? server.characters : [];
          characters.forEach(char => {
            [char?.bank1, char?.bank2, char?.bag].forEach(container => {
              if (Array.isArray(container?.slots)) {
                container.slots.forEach(slot => {
                  if (slot?.item?.gender) {
                    dist[slot.item.gender] = (dist[slot.item.gender] || 0) + 1;
                  }
                });
              }
            });
          });
        });
      });
    });
    return dist;
  }, [allUsers]);

  const pendingUsers = useMemo(
    () => allUsers.filter(user => user.accessStatus === 'pending'),
    [allUsers]
  );
  const approvedUsers = useMemo(
    () => allUsers.filter(user => user.accessStatus === 'approved'),
    [allUsers]
  );

  // User search filter
  const filteredUsers = useMemo(() => {
    const sourceUsers = userAccessFilter === 'pending'
      ? allUsers.filter(user => user.accessStatus === 'pending')
      : allUsers;
    if (!userSearch.trim()) return sourceUsers;
    const q = userSearch.toLocaleLowerCase('tr');
    return sourceUsers.filter(u =>
      (u.username || '').toLocaleLowerCase('tr').includes(q) ||
      u.email.toLocaleLowerCase('tr').includes(q) ||
      u.uid.toLocaleLowerCase('tr').includes(q)
    );
  }, [allUsers, userSearch, userAccessFilter]);

  const filteredManagedEnchantments = useMemo(() => {
    const queryText = enchantmentListSearch.trim().toLocaleLowerCase('tr');
    if (!queryText) return managedEnchantments;
    return managedEnchantments.filter(name => name.toLocaleLowerCase('tr').includes(queryText));
  }, [managedEnchantments, enchantmentListSearch]);

  const filteredManagedPotions = useMemo(() => {
    const queryText = potionListSearch.trim().toLocaleLowerCase('tr');
    if (!queryText) return managedPotions;
    return managedPotions.filter(entry => entry.name.toLocaleLowerCase('tr').includes(queryText));
  }, [managedPotions, potionListSearch]);

  const filteredManagedMines = useMemo(() => {
    const queryText = mineListSearch.trim().toLocaleLowerCase('tr');
    if (!queryText) return managedMines;
    return managedMines.filter(entry => entry.name.toLocaleLowerCase('tr').includes(queryText));
  }, [managedMines, mineListSearch]);

  const filteredManagedOthers = useMemo(() => {
    const queryText = otherListSearch.trim().toLocaleLowerCase('tr');
    if (!queryText) return managedOthers;
    return managedOthers.filter(entry => entry.name.toLocaleLowerCase('tr').includes(queryText));
  }, [managedOthers, otherListSearch]);

  const filteredManagedGlasses = useMemo(() => {
    const queryText = glassesListSearch.trim().toLocaleLowerCase('tr');
    if (!queryText) return managedGlasses;
    return managedGlasses.filter(entry => entry.name.toLocaleLowerCase('tr').includes(queryText));
  }, [managedGlasses, glassesListSearch]);

  const filteredManagedTalismans = useMemo(() => {
    const queryText = talismanListSearch.trim().toLocaleLowerCase('tr');
    if (!queryText) return managedTalismans;
    return managedTalismans.filter(entry => (
      entry.name.toLocaleLowerCase('tr').includes(queryText) ||
      entry.color.toLocaleLowerCase('tr').includes(queryText) ||
      entry.heroClass.toLocaleLowerCase('tr').includes(queryText)
    ));
  }, [managedTalismans, talismanListSearch]);

  const isAnyAutocompleteBusy = (
    enchantmentSaving ||
    enchantmentImporting ||
    potionSaving ||
    mineSaving ||
    otherSaving ||
    glassesSaving ||
    talismanSaving ||
    autocompleteBulkImporting
  );

  // Delete user
  const handleDeleteUser = async (user: AdminUserInfo) => {
    if (user.uid === auth.currentUser?.uid) {
      alert("Guvenlik kilidi: Kendi admin hesabinizi silemezsiniz.");
      return;
    }

    setDeleting(true);
    try {
      const batch = writeBatch(db);

      // 1. Delete username doc
      if (user.username) {
        batch.delete(doc(db, "usernames", user.username.toLowerCase()));
      }

      // 2. Delete all globalItems belonging to this user
      const globalQ = query(collection(db, "globalItems"), where("uid", "==", user.uid));
      const globalSnap = await getDocs(globalQ);
      globalSnap.forEach(d => batch.delete(d.ref));

      // 3. Delete user doc
      batch.delete(doc(db, "users", user.uid));

      // 4. Delete message preference doc
      batch.delete(doc(db, "messagePrefs", user.uid));

      await batch.commit();

      // Update local state
      setAllUsers(prev => prev.filter(u => u.uid !== user.uid));
      setDeleteConfirm(null);
      setResetConfirm(null);
    } catch (error) {
      console.error("Kullanıcı silme hatası:", error);
      alert("Kullanıcı silinirken hata oluştu.");
    } finally {
      setDeleting(false);
    }
  };

  const handleResetUserData = async (user: AdminUserInfo) => {
    if (user.uid === auth.currentUser?.uid) {
      alert("Guvenlik kilidi: Kendi admin hesabinizin verisini bu ekrandan sifirlayamazsiniz.");
      return;
    }

    setResetting(true);
    try {
      const batch = writeBatch(db);

      // Delete all globalItems belonging to this user
      const globalQ = query(collection(db, "globalItems"), where("uid", "==", user.uid));
      const globalSnap = await getDocs(globalQ);
      globalSnap.forEach(d => batch.delete(d.ref));

      // Clear all accounts to reset all items/recipes
      batch.set(doc(db, "users", user.uid), { accounts: [] }, { merge: true });

      await batch.commit();

      setAllUsers(prev => prev.map(u => (
        u.uid === user.uid
          ? { ...u, accounts: [], accountCount: 0, totalItemCount: 0, totalRecipeCount: 0 }
          : u
      )));
      setResetConfirm(null);
      setDeleteConfirm(null);
    } catch (error) {
      console.error("KullanÄ±cÄ± veri sÄ±fÄ±rlama hatasÄ±:", error);
      alert("KullanÄ±cÄ±nÄ±n item/reÃ§ete verileri sÄ±fÄ±rlanÄ±rken hata oluÅŸtu.");
    } finally {
      setResetting(false);
    }
  };

  const handleToggleUserPermission = async (user: AdminUserInfo, key: keyof UserPermissions, value: boolean) => {
    setPermissionSaving(prev => ({ ...prev, [user.uid]: true }));
    try {
      const nextPermissions: UserPermissions = {
        ...DEFAULT_USER_PERMISSIONS,
        ...(user.permissions || DEFAULT_USER_PERMISSIONS),
        [key]: value,
      };

      await setDoc(doc(db, "users", user.uid), { permissions: nextPermissions }, { merge: true });

      setAllUsers(prev => prev.map(u => (
        u.uid === user.uid
          ? { ...u, permissions: nextPermissions }
          : u
      )));
    } catch (error) {
      console.error("Kullanici izin guncelleme hatasi:", error);
      alert("Kullanici yetkisi guncellenirken hata olustu.");
    } finally {
      setPermissionSaving(prev => ({ ...prev, [user.uid]: false }));
    }
  };

  const getUserClassLimits = (userClassValue: UserClass) => {
    return searchLimits.classLimits[userClassValue] || searchLimits.classLimits[DEFAULT_USER_CLASS];
  };

  const getEffectiveGlobalSearchLimit = (user: AdminUserInfo) => {
    const override = searchLimits.userOverrides[user.uid];
    if (override !== undefined) return Math.max(1, Math.floor(override));
    return getUserClassLimits(user.userClass).dailyGlobalSearchLimit;
  };

  const handleSaveUserClass = async (user: AdminUserInfo, nextClass: UserClass) => {
    setUserClassSaving(prev => ({ ...prev, [user.uid]: true }));
    try {
      await setDoc(doc(db, "users", user.uid), { userClass: nextClass }, { merge: true });
      setAllUsers(prev => prev.map(u => (
        u.uid === user.uid
          ? { ...u, userClass: nextClass }
          : u
      )));
    } catch (error) {
      console.error("Kullanici sinifi guncelleme hatasi:", error);
      alert("Kullanici sinifi guncellenirken hata olustu.");
    } finally {
      setUserClassSaving(prev => ({ ...prev, [user.uid]: false }));
    }
  };

  const handleSaveUserSearchOverride = async (user: AdminUserInfo) => {
    const rawInput = (userSearchOverrideInputs[user.uid] || '').trim();
    const shouldRemove = rawInput.length === 0;
    const parsedLimit = shouldRemove ? null : parseInt(rawInput, 10);

    if (!shouldRemove && (parsedLimit === null || Number.isNaN(parsedLimit) || parsedLimit < 1)) {
      alert("Override limiti en az 1 olmalidir.");
      return;
    }

    setUserSearchOverrideSaving(prev => ({ ...prev, [user.uid]: true }));
    try {
      const nextOverrides = { ...searchLimits.userOverrides };
      if (shouldRemove) {
        delete nextOverrides[user.uid];
      } else {
        nextOverrides[user.uid] = Math.floor(parsedLimit as number);
      }

      await setDoc(doc(db, "metadata", "searchLimits"), {
        defaultLimit: searchLimits.defaultLimit,
        userOverrides: nextOverrides,
      }, { merge: true });

      setSearchLimits(prev => ({ ...prev, userOverrides: nextOverrides }));
      setUserSearchOverrideInputs(prev => ({
        ...prev,
        [user.uid]: shouldRemove ? '' : String(nextOverrides[user.uid]),
      }));
    } catch (error) {
      console.error("Kullanici override guncelleme hatasi:", error);
      alert("Kullanici override kaydedilirken hata olustu.");
    } finally {
      setUserSearchOverrideSaving(prev => ({ ...prev, [user.uid]: false }));
    }
  };

  const handleClearUserSearchOverride = async (user: AdminUserInfo) => {
    setUserSearchOverrideSaving(prev => ({ ...prev, [user.uid]: true }));
    try {
      const nextOverrides = { ...searchLimits.userOverrides };
      delete nextOverrides[user.uid];

      await setDoc(doc(db, "metadata", "searchLimits"), {
        defaultLimit: searchLimits.defaultLimit,
        userOverrides: nextOverrides,
      }, { merge: true });

      setSearchLimits(prev => ({ ...prev, userOverrides: nextOverrides }));
      setUserSearchOverrideInputs(prev => ({ ...prev, [user.uid]: '' }));
    } catch (error) {
      console.error("Kullanici override kaldirma hatasi:", error);
      alert("Kullanici override kaldirilirken hata olustu.");
    } finally {
      setUserSearchOverrideSaving(prev => ({ ...prev, [user.uid]: false }));
    }
  };

  const getBlockReasonLabel = (reasonCode: string) => {
    const found = BLOCK_REASON_OPTIONS.find(option => option.value === reasonCode);
    return found?.label || 'Engel nedeni';
  };

  const handleSaveUsername = async (user: AdminUserInfo) => {
    const rawValue = (usernameInputs[user.uid] ?? user.username ?? '').trim();
    if (rawValue.length < 3 || rawValue.length > 20) {
      alert("Kullanici adi 3 ile 20 karakter arasinda olmalidir.");
      return;
    }

    setUsernameSaving(prev => ({ ...prev, [user.uid]: true }));
    try {
      const nextUsername = rawValue;
      const nextUsernameLower = nextUsername.toLowerCase();
      const currentUsernameLower = user.username ? user.username.toLowerCase() : null;

      await runTransaction(db, async (transaction) => {
        const nextUsernameDocRef = doc(db, "usernames", nextUsernameLower);
        const nextUsernameSnap = await transaction.get(nextUsernameDocRef);

        if (nextUsernameSnap.exists()) {
          const existingData = nextUsernameSnap.data() as { uid?: string };
          if (existingData.uid !== user.uid) {
            throw new Error("USERNAME_TAKEN");
          }
        }

        if (currentUsernameLower && currentUsernameLower !== nextUsernameLower) {
          transaction.delete(doc(db, "usernames", currentUsernameLower));
        }

        transaction.set(nextUsernameDocRef, { uid: user.uid, displayName: nextUsername });
        transaction.set(doc(db, "users", user.uid), { username: nextUsername }, { merge: true });
      });

      const emailLower = (user.email || '').trim().toLowerCase();
      if (emailLower) {
        await setDoc(doc(db, "publicProfiles", user.uid), {
          uid: user.uid,
          username: nextUsername,
          emailLower,
          updatedAt: Date.now(),
        }, { merge: true });
      }

      setAllUsers(prev => prev.map(u => (
        u.uid === user.uid
          ? { ...u, username: nextUsername }
          : u
      )));
      setUsernameInputs(prev => ({ ...prev, [user.uid]: nextUsername }));
    } catch (error: any) {
      console.error("Admin username guncelleme hatasi:", error);
      if (error?.message === 'USERNAME_TAKEN') {
        alert("Bu kullanici adi baska bir hesap tarafindan kullaniliyor.");
      } else {
        alert("Kullanici adi guncellenirken hata olustu.");
      }
    } finally {
      setUsernameSaving(prev => ({ ...prev, [user.uid]: false }));
    }
  };

  const handleToggleUserBlocked = async (user: AdminUserInfo) => {
    if (user.uid === auth.currentUser?.uid) {
      alert("Guvenlik kilidi: Kendi admin hesabinizi engelleyemezsiniz.");
      return;
    }

    const currentlyBlocked = user.blockInfo?.isBlocked === true;
    const selectedReasonCode = blockReasonInputs[user.uid] || BLOCK_REASON_OPTIONS[0].value;
    const nextBlockInfo: UserBlockInfo = currentlyBlocked
      ? {
          ...DEFAULT_BLOCK_INFO,
          isBlocked: false,
        }
      : {
          isBlocked: true,
          reasonCode: selectedReasonCode,
          reasonLabel: getBlockReasonLabel(selectedReasonCode),
          blockedAt: Date.now(),
          blockedByUid: auth.currentUser?.uid || 'admin',
        };

    setBlockSaving(prev => ({ ...prev, [user.uid]: true }));
    try {
      await setDoc(doc(db, "users", user.uid), { blockInfo: nextBlockInfo }, { merge: true });
      setAllUsers(prev => prev.map(u => (
        u.uid === user.uid
          ? { ...u, blockInfo: nextBlockInfo }
          : u
      )));
    } catch (error) {
      console.error("Kullanici engel durumu guncelleme hatasi:", error);
      alert("Kullanici engel durumu guncellenirken hata olustu.");
    } finally {
      setBlockSaving(prev => ({ ...prev, [user.uid]: false }));
    }
  };

  const handleApproveUser = async (user: AdminUserInfo) => {
    if (user.accessStatus !== 'pending') return;
    setApprovalSaving(prev => ({ ...prev, [user.uid]: true }));
    try {
      const now = Date.now();
      await setDoc(doc(db, "users", user.uid), {
        accessStatus: 'approved',
        approvedAt: now,
        approvedByUid: auth.currentUser?.uid || 'admin',
      }, { merge: true });

      setAllUsers(prev => prev.map(item => (
        item.uid === user.uid
          ? { ...item, accessStatus: 'approved', approvedAt: now, approvedByUid: auth.currentUser?.uid || 'admin' }
          : item
      )));
    } catch (error) {
      console.error("Kullanici onaylama hatasi:", error);
      alert("Kullanici onaylanirken hata olustu.");
    } finally {
      setApprovalSaving(prev => ({ ...prev, [user.uid]: false }));
    }
  };

  const handleApproveAllPendingUsers = async () => {
    if (pendingUsers.length === 0) return;
    setBulkApprovalSaving(true);
    try {
      const now = Date.now();
      const approvedByUid = auth.currentUser?.uid || 'admin';
      const batch = writeBatch(db);
      pendingUsers.forEach(user => {
        batch.set(doc(db, "users", user.uid), {
          accessStatus: 'approved',
          approvedAt: now,
          approvedByUid,
        }, { merge: true });
      });
      await batch.commit();
      const pendingUidSet = new Set(pendingUsers.map(user => user.uid));
      setAllUsers(prev => prev.map(user => (
        pendingUidSet.has(user.uid)
          ? { ...user, accessStatus: 'approved', approvedAt: now, approvedByUid }
          : user
      )));
    } catch (error) {
      console.error("Toplu kullanici onaylama hatasi:", error);
      alert("Toplu onay islemi sirasinda hata olustu.");
    } finally {
      setBulkApprovalSaving(false);
    }
  };

  // Admin management
  const handleAddAdmin = async () => {
    const email = newAdminEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) return;

    setAdminLoading(true);
    try {
      await setDoc(doc(db, "metadata", "admins"), { emails: arrayUnion(email) }, { merge: true });
      setAdminEmails(prev => [...prev, email]);
      setNewAdminEmail('');
    } catch (error) {
      console.error("Admin ekleme hatası:", error);
    } finally {
      setAdminLoading(false);
    }
  };

  const handleRemoveAdmin = async (email: string) => {
    if (email === 'yvzsltn61@gmail.com') return;
    const currentAdminEmail = auth.currentUser?.email?.trim().toLowerCase();
    if (currentAdminEmail && email.toLowerCase() === currentAdminEmail) {
      alert("Guvenlik kilidi: Kendi admin yetkinizi bu listeden kaldiramazsiniz.");
      return;
    }

    setAdminLoading(true);
    try {
      await setDoc(doc(db, "metadata", "admins"), { emails: arrayRemove(email) }, { merge: true });
      setAdminEmails(prev => prev.filter(e => e !== email));
    } catch (error) {
      console.error("Admin kaldırma hatası:", error);
    } finally {
      setAdminLoading(false);
    }
  };

  const handleOpenEnchantmentImportPicker = () => {
    enchantmentImportInputRef.current?.click();
  };

  const handleOpenAutocompleteBulkImportPicker = () => {
    autocompleteBulkImportInputRef.current?.click();
  };

  const handleImportAllAutocompleteFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setAutocompleteBulkImporting(true);
    try {
      const fileNameLower = file.name.toLocaleLowerCase();
      if (!fileNameLower.endsWith('.csv') && !fileNameLower.endsWith('.txt')) {
        alert("Su an sadece CSV/TXT import destekleniyor. Dosyayi CSV/TXT olarak kaydedip tekrar yukleyin.");
        return;
      }

      const rawText = await file.text();
      const { seenSections, parsed } = parseAutocompleteBulkSections(rawText);
      const hasAnySection = Object.values(seenSections).some(Boolean);
      if (!hasAnySection) {
        alert("Dosyada [EFSUN], [IKSIR], [MADEN], [DIGER], [GOZLUK], [TILSIM] basliklari bulunamadi.");
        return;
      }

      if (seenSections.enchantments) {
        const saved = await saveManagedEnchantments(parsed.enchantments);
        if (!saved) return;
        setEnchantmentTextInput('');
        setEnchantmentListSearch('');
        handleCancelEditEnchantment();
      }
      if (seenSections.potions) {
        const saved = await saveManagedPotions(parsed.potions);
        if (!saved) return;
        setPotionTextInput('');
        setPotionListSearch('');
        handleCancelEditPotion();
      }
      if (seenSections.mines) {
        const saved = await saveManagedMines(parsed.mines);
        if (!saved) return;
        setMineTextInput('');
        setMineListSearch('');
        handleCancelEditMine();
      }
      if (seenSections.others) {
        const saved = await saveManagedOthers(parsed.others);
        if (!saved) return;
        setOtherTextInput('');
        setOtherListSearch('');
        handleCancelEditOther();
      }
      if (seenSections.glasses) {
        const saved = await saveManagedGlasses(parsed.glasses);
        if (!saved) return;
        setGlassesTextInput('');
        setGlassesListSearch('');
        handleCancelEditGlasses();
      }
      if (seenSections.talismans) {
        const saved = await saveManagedTalismans(parsed.talismans);
        if (!saved) return;
        setTalismanTextInput('');
        setTalismanListSearch('');
        handleCancelEditTalisman();
      }

      alert("Toplu oto tamamlama import tamamlandi.");
    } finally {
      event.target.value = '';
      setAutocompleteBulkImporting(false);
    }
  };

  const handleAddEnchantmentsFromText = async () => {
    const parsedNames = extractEnchantmentNamesFromText(enchantmentTextInput);
    if (parsedNames.length === 0) {
      alert("Eklenebilir efsun adi bulunamadi. Her satira bir isim yazin.");
      return;
    }

    const merged = toUniqueSortedEnchantments([...managedEnchantments, ...parsedNames]);
    if (merged.length === managedEnchantments.length) {
      alert("Listede zaten mevcut olan isimler girildi.");
      return;
    }

    const saved = await saveManagedEnchantments(merged);
    if (saved) {
      setEnchantmentTextInput('');
    }
  };

  const handleImportEnchantmentsFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setEnchantmentImporting(true);
    try {
      const fileNameLower = file.name.toLocaleLowerCase();
      if (!fileNameLower.endsWith('.csv') && !fileNameLower.endsWith('.txt')) {
        alert("Su an sadece CSV/TXT import destekleniyor. Excel dosyanizi CSV olarak kaydedip tekrar yukleyin.");
        return;
      }

      const rawText = await file.text();
      const parsedNames = extractEnchantmentNamesFromText(rawText);
      if (parsedNames.length === 0) {
        alert("Dosyada eklenebilir efsun adi bulunamadi.");
        return;
      }

      const merged = toUniqueSortedEnchantments([...managedEnchantments, ...parsedNames]);
      if (merged.length === managedEnchantments.length) {
        alert("Dosyadaki tum isimler zaten listede mevcut.");
        return;
      }

      await saveManagedEnchantments(merged);
    } finally {
      event.target.value = '';
      setEnchantmentImporting(false);
    }
  };

  const handleStartEditEnchantment = (name: string) => {
    setEditingEnchantment(name);
    setEditingEnchantmentInput(name);
  };

  const handleCancelEditEnchantment = () => {
    setEditingEnchantment(null);
    setEditingEnchantmentInput('');
  };

  const handleSaveEditedEnchantment = async () => {
    if (!editingEnchantment) return;
    const nextValue = normalizeEnchantmentName(editingEnchantmentInput);
    if (!nextValue) {
      alert("Efsun adi bos birakilamaz.");
      return;
    }

    const nextList = managedEnchantments.map(name => (
      name === editingEnchantment ? nextValue : name
    ));
    const saved = await saveManagedEnchantments(nextList);
    if (saved) {
      handleCancelEditEnchantment();
    }
  };

  const handleDeleteEnchantment = async (name: string) => {
    const nextList = managedEnchantments.filter(itemName => itemName !== name);
    await saveManagedEnchantments(nextList);
    if (editingEnchantment === name) {
      handleCancelEditEnchantment();
    }
  };

  const handleAddPotionsFromText = async () => {
    const parsedEntries = extractNamedLevelsFromText(potionTextInput, 1);
    if (parsedEntries.length === 0) {
      alert("Eklenebilir iksir adi bulunamadi. Her satira Isim:Seviye yazin.");
      return;
    }

    const merged = toUniqueSortedNamedLevels([...managedPotions, ...parsedEntries]);
    if (merged.length === managedPotions.length) {
      alert("Listede zaten mevcut olan iksir isimleri girildi.");
      return;
    }

    const saved = await saveManagedPotions(merged);
    if (saved) {
      setPotionTextInput('');
    }
  };

  const handleStartEditPotion = (entry: NamedLevelEntry) => {
    setEditingPotion(entry.name);
    setEditingPotionNameInput(entry.name);
    setEditingPotionLevelInput(String(entry.level));
  };

  const handleCancelEditPotion = () => {
    setEditingPotion(null);
    setEditingPotionNameInput('');
    setEditingPotionLevelInput('1');
  };

  const handleSaveEditedPotion = async () => {
    if (!editingPotion) return;
    const nextName = normalizeEnchantmentName(editingPotionNameInput);
    if (!nextName) {
      alert("Iksir adi bos birakilamaz.");
      return;
    }
    const nextLevel = normalizeLevelValue(editingPotionLevelInput);

    const nextList = managedPotions.map(entry => (
      entry.name === editingPotion ? { name: nextName, level: nextLevel } : entry
    ));
    const saved = await saveManagedPotions(nextList);
    if (saved) {
      handleCancelEditPotion();
    }
  };

  const handleDeletePotion = async (name: string) => {
    const nextList = managedPotions.filter(entry => entry.name !== name);
    await saveManagedPotions(nextList);
    if (editingPotion === name) {
      handleCancelEditPotion();
    }
  };

  const handleAddMinesFromText = async () => {
    const parsedEntries = extractNamedLevelsFromText(mineTextInput, 1);
    if (parsedEntries.length === 0) {
      alert("Eklenebilir maden adi bulunamadi. Her satira Isim:Seviye yazin.");
      return;
    }

    const merged = toUniqueSortedNamedLevels([...managedMines, ...parsedEntries]);
    if (merged.length === managedMines.length) {
      alert("Listede zaten mevcut olan maden isimleri girildi.");
      return;
    }

    const saved = await saveManagedMines(merged);
    if (saved) {
      setMineTextInput('');
    }
  };

  const handleStartEditMine = (entry: NamedLevelEntry) => {
    setEditingMine(entry.name);
    setEditingMineNameInput(entry.name);
    setEditingMineLevelInput(String(entry.level));
  };

  const handleCancelEditMine = () => {
    setEditingMine(null);
    setEditingMineNameInput('');
    setEditingMineLevelInput('1');
  };

  const handleSaveEditedMine = async () => {
    if (!editingMine) return;
    const nextName = normalizeEnchantmentName(editingMineNameInput);
    if (!nextName) {
      alert("Maden adi bos birakilamaz.");
      return;
    }
    const nextLevel = normalizeLevelValue(editingMineLevelInput);
    const nextList = managedMines.map(entry => (
      entry.name === editingMine ? { name: nextName, level: nextLevel } : entry
    ));
    const saved = await saveManagedMines(nextList);
    if (saved) {
      handleCancelEditMine();
    }
  };

  const handleDeleteMine = async (name: string) => {
    const nextList = managedMines.filter(entry => entry.name !== name);
    await saveManagedMines(nextList);
    if (editingMine === name) {
      handleCancelEditMine();
    }
  };

  const handleAddOthersFromText = async () => {
    const parsedEntries = extractNamedLevelsFromText(otherTextInput, 1);
    if (parsedEntries.length === 0) {
      alert("Eklenebilir diger kaydi bulunamadi. Her satira Isim:Seviye yazin.");
      return;
    }

    const merged = toUniqueSortedNamedLevels([...managedOthers, ...parsedEntries]);
    if (merged.length === managedOthers.length) {
      alert("Listede zaten mevcut olan diger isimleri girildi.");
      return;
    }

    const saved = await saveManagedOthers(merged);
    if (saved) {
      setOtherTextInput('');
    }
  };

  const handleStartEditOther = (entry: NamedLevelEntry) => {
    setEditingOther(entry.name);
    setEditingOtherNameInput(entry.name);
    setEditingOtherLevelInput(String(entry.level));
  };

  const handleCancelEditOther = () => {
    setEditingOther(null);
    setEditingOtherNameInput('');
    setEditingOtherLevelInput('1');
  };

  const handleSaveEditedOther = async () => {
    if (!editingOther) return;
    const nextName = normalizeEnchantmentName(editingOtherNameInput);
    if (!nextName) {
      alert("Diger adi bos birakilamaz.");
      return;
    }
    const nextLevel = normalizeLevelValue(editingOtherLevelInput);
    const nextList = managedOthers.map(entry => (
      entry.name === editingOther ? { name: nextName, level: nextLevel } : entry
    ));
    const saved = await saveManagedOthers(nextList);
    if (saved) {
      handleCancelEditOther();
    }
  };

  const handleDeleteOther = async (name: string) => {
    const nextList = managedOthers.filter(entry => entry.name !== name);
    await saveManagedOthers(nextList);
    if (editingOther === name) {
      handleCancelEditOther();
    }
  };

  const handleAddGlassesFromText = async () => {
    const parsedEntries = extractNamedLevelsFromText(glassesTextInput, 1);
    if (parsedEntries.length === 0) {
      alert("Eklenebilir gozluk adi bulunamadi. Her satira Isim:Seviye yazin.");
      return;
    }

    const merged = toUniqueSortedNamedLevels([...managedGlasses, ...parsedEntries]);
    if (merged.length === managedGlasses.length) {
      alert("Listede zaten mevcut olan gozluk isimleri girildi.");
      return;
    }

    const saved = await saveManagedGlasses(merged);
    if (saved) {
      setGlassesTextInput('');
    }
  };

  const handleStartEditGlasses = (entry: NamedLevelEntry) => {
    setEditingGlasses(entry.name);
    setEditingGlassesNameInput(entry.name);
    setEditingGlassesLevelInput(String(entry.level));
  };

  const handleCancelEditGlasses = () => {
    setEditingGlasses(null);
    setEditingGlassesNameInput('');
    setEditingGlassesLevelInput('1');
  };

  const handleSaveEditedGlasses = async () => {
    if (!editingGlasses) return;
    const nextName = normalizeEnchantmentName(editingGlassesNameInput);
    if (!nextName) {
      alert("Gozluk adi bos birakilamaz.");
      return;
    }
    const nextLevel = normalizeLevelValue(editingGlassesLevelInput);
    const nextList = managedGlasses.map(entry => (
      entry.name === editingGlasses ? { name: nextName, level: nextLevel } : entry
    ));
    const saved = await saveManagedGlasses(nextList);
    if (saved) {
      handleCancelEditGlasses();
    }
  };

  const handleDeleteGlasses = async (name: string) => {
    const nextList = managedGlasses.filter(entry => entry.name !== name);
    await saveManagedGlasses(nextList);
    if (editingGlasses === name) {
      handleCancelEditGlasses();
    }
  };

  const handleAddTalismansFromText = async () => {
    const parsedEntries = extractTalismansFromText(talismanTextInput);
    if (parsedEntries.length === 0) {
      alert("Eklenebilir tilsim kaydi bulunamadi. Her satira Isim:Renk:Sinif yazin.");
      return;
    }

    const merged = toUniqueSortedTalismans([...managedTalismans, ...parsedEntries]);
    if (merged.length === managedTalismans.length) {
      alert("Listede zaten mevcut olan tilsim kayitlari girildi.");
      return;
    }

    const saved = await saveManagedTalismans(merged);
    if (saved) {
      setTalismanTextInput('');
    }
  };

  const handleStartEditTalisman = (entry: TalismanEntry) => {
    setEditingTalisman(`${entry.name}|${entry.color}|${entry.heroClass}`);
    setEditingTalismanNameInput(entry.name);
    setEditingTalismanColorInput(entry.color);
    setEditingTalismanClassInput(entry.heroClass);
  };

  const handleCancelEditTalisman = () => {
    setEditingTalisman(null);
    setEditingTalismanNameInput('');
    setEditingTalismanColorInput('Mavi');
    setEditingTalismanClassInput('Savaşçı');
  };

  const handleSaveEditedTalisman = async () => {
    if (!editingTalisman) return;
    const nextName = normalizeEnchantmentName(editingTalismanNameInput);
    if (!nextName) {
      alert("Tilsim adi bos birakilamaz.");
      return;
    }

    const nextList = managedTalismans.map(entry => (
      `${entry.name}|${entry.color}|${entry.heroClass}` === editingTalisman
        ? { name: nextName, color: editingTalismanColorInput, heroClass: editingTalismanClassInput }
        : entry
    ));
    const saved = await saveManagedTalismans(nextList);
    if (saved) {
      handleCancelEditTalisman();
    }
  };

  const handleDeleteTalisman = async (entryToDelete: TalismanEntry) => {
    const nextList = managedTalismans.filter(entry => !(
      entry.name === entryToDelete.name &&
      entry.color === entryToDelete.color &&
      entry.heroClass === entryToDelete.heroClass
    ));
    await saveManagedTalismans(nextList);
    if (editingTalisman === `${entryToDelete.name}|${entryToDelete.color}|${entryToDelete.heroClass}`) {
      handleCancelEditTalisman();
    }
  };

  const buildAutocompleteExportFileName = (prefix: string) => {
    const dateStamp = new Date().toISOString().slice(0, 10);
    return `${prefix}-${dateStamp}.txt`;
  };

  const downloadAutocompleteLines = (fileName: string, lines: string[]) => {
    const normalizedLines = lines.map(line => line.trim()).filter(line => line !== '');
    if (normalizedLines.length === 0) {
      alert("Disa aktarilacak kayit bulunamadi.");
      return;
    }

    const blob = new Blob([`\uFEFF${normalizedLines.join('\n')}`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportEnchantments = () => {
    downloadAutocompleteLines(
      buildAutocompleteExportFileName('efsun-oto-tamamlama'),
      managedEnchantments
    );
  };

  const handleExportPotions = () => {
    downloadAutocompleteLines(
      buildAutocompleteExportFileName('iksir-oto-tamamlama'),
      managedPotions.map(entry => `${entry.name}:${entry.level}`)
    );
  };

  const handleExportMines = () => {
    downloadAutocompleteLines(
      buildAutocompleteExportFileName('maden-oto-tamamlama'),
      managedMines.map(entry => `${entry.name}:${entry.level}`)
    );
  };

  const handleExportOthers = () => {
    downloadAutocompleteLines(
      buildAutocompleteExportFileName('diger-oto-tamamlama'),
      managedOthers.map(entry => `${entry.name}:${entry.level}`)
    );
  };

  const handleExportGlasses = () => {
    downloadAutocompleteLines(
      buildAutocompleteExportFileName('gozluk-oto-tamamlama'),
      managedGlasses.map(entry => `${entry.name}:${entry.level}`)
    );
  };

  const handleExportTalismans = () => {
    downloadAutocompleteLines(
      buildAutocompleteExportFileName('tilsim-oto-tamamlama'),
      managedTalismans.map(entry => `${entry.name}:${entry.color}:${entry.heroClass}`)
    );
  };

  const handleExportAllAutocomplete = () => {
    downloadAutocompleteLines(
      buildAutocompleteExportFileName('oto-tamamlama-tumu'),
      [
        '# IKV Oto Tamamlama Toplu Export',
        '# Import icin ayni dosyayi "Toplu Ice Aktar" ile yukleyebilirsiniz.',
        '[EFSUN]',
        ...managedEnchantments,
        '[IKSIR]',
        ...managedPotions.map(entry => `${entry.name}:${entry.level}`),
        '[MADEN]',
        ...managedMines.map(entry => `${entry.name}:${entry.level}`),
        '[DIGER]',
        ...managedOthers.map(entry => `${entry.name}:${entry.level}`),
        '[GOZLUK]',
        ...managedGlasses.map(entry => `${entry.name}:${entry.level}`),
        '[TILSIM]',
        ...managedTalismans.map(entry => `${entry.name}:${entry.color}:${entry.heroClass}`),
      ]
    );
  };

  const handleBulkDeleteEnchantments = async () => {
    if (managedEnchantments.length === 0) return;
    if (!globalThis.confirm(`${managedEnchantments.length} efsun kaydi silinecek. Devam etmek istiyor musunuz?`)) return;

    const saved = await saveManagedEnchantments([]);
    if (saved) {
      setEnchantmentTextInput('');
      setEnchantmentListSearch('');
      handleCancelEditEnchantment();
    }
  };

  const handleBulkDeletePotions = async () => {
    if (managedPotions.length === 0) return;
    if (!globalThis.confirm(`${managedPotions.length} iksir kaydi silinecek. Devam etmek istiyor musunuz?`)) return;

    const saved = await saveManagedPotions([]);
    if (saved) {
      setPotionTextInput('');
      setPotionListSearch('');
      handleCancelEditPotion();
    }
  };

  const handleBulkDeleteMines = async () => {
    if (managedMines.length === 0) return;
    if (!globalThis.confirm(`${managedMines.length} maden kaydi silinecek. Devam etmek istiyor musunuz?`)) return;

    const saved = await saveManagedMines([]);
    if (saved) {
      setMineTextInput('');
      setMineListSearch('');
      handleCancelEditMine();
    }
  };

  const handleBulkDeleteOthers = async () => {
    if (managedOthers.length === 0) return;
    if (!globalThis.confirm(`${managedOthers.length} diger kaydi silinecek. Devam etmek istiyor musunuz?`)) return;

    const saved = await saveManagedOthers([]);
    if (saved) {
      setOtherTextInput('');
      setOtherListSearch('');
      handleCancelEditOther();
    }
  };

  const handleBulkDeleteGlasses = async () => {
    if (managedGlasses.length === 0) return;
    if (!globalThis.confirm(`${managedGlasses.length} gozluk kaydi silinecek. Devam etmek istiyor musunuz?`)) return;

    const saved = await saveManagedGlasses([]);
    if (saved) {
      setGlassesTextInput('');
      setGlassesListSearch('');
      handleCancelEditGlasses();
    }
  };

  const handleBulkDeleteTalismans = async () => {
    if (managedTalismans.length === 0) return;
    if (!globalThis.confirm(`${managedTalismans.length} tilsim kaydi silinecek. Devam etmek istiyor musunuz?`)) return;

    const saved = await saveManagedTalismans([]);
    if (saved) {
      setTalismanTextInput('');
      setTalismanListSearch('');
      handleCancelEditTalisman();
    }
  };

  // Limit settings
  const handleSaveClassLimits = async () => {
    const rawLimits = {
      user: {
        dailyMessageLimit: parseInt(classLimitInputs.user.dailyMessageLimit, 10),
        dailyGlobalSearchLimit: parseInt(classLimitInputs.user.dailyGlobalSearchLimit, 10),
      },
      premium: {
        dailyMessageLimit: parseInt(classLimitInputs.premium.dailyMessageLimit, 10),
        dailyGlobalSearchLimit: parseInt(classLimitInputs.premium.dailyGlobalSearchLimit, 10),
      },
      pro: {
        dailyMessageLimit: parseInt(classLimitInputs.pro.dailyMessageLimit, 10),
        dailyGlobalSearchLimit: parseInt(classLimitInputs.pro.dailyGlobalSearchLimit, 10),
      },
    };

    const hasInvalidLimit = USER_CLASS_KEYS.some(classKey => (
      Number.isNaN(rawLimits[classKey].dailyMessageLimit) ||
      rawLimits[classKey].dailyMessageLimit < 1 ||
      Number.isNaN(rawLimits[classKey].dailyGlobalSearchLimit) ||
      rawLimits[classKey].dailyGlobalSearchLimit < 1
    ));

    if (hasInvalidLimit) {
      alert("Tum limitler en az 1 olmalidir.");
      return;
    }

    const nextClassLimits = resolveUserClassQuotas(rawLimits);

    setLimitSaving(true);
    try {
      await setDoc(doc(db, "metadata", "searchLimits"), {
        defaultLimit: searchLimits.defaultLimit,
        userOverrides: searchLimits.userOverrides,
        classLimits: nextClassLimits,
      }, { merge: true });
      setSearchLimits(prev => ({ ...prev, classLimits: nextClassLimits }));
      setClassLimitInputs(toClassLimitInputs(nextClassLimits));
    } catch (error) {
      console.error("Limit kaydetme hatasi:", error);
      alert("Limit ayarlari kaydedilirken hata olustu.");
    } finally {
      setLimitSaving(false);
    }
  };

  const handleSaveMaxAccounts = async () => {
    const parsed = parseInt(maxAccountsInput, 10);
    if (Number.isNaN(parsed) || parsed < 1 || parsed > 100) {
      alert("Hesap limiti 1 ile 100 arasinda olmalidir.");
      return;
    }

    setMaxAccountsSaving(true);
    try {
      await setDoc(doc(db, "metadata", "searchLimits"), {
        maxAccounts: parsed,
      }, { merge: true });
      setMaxAccounts(parsed);
    } catch (error) {
      console.error("Max accounts kaydetme hatasi:", error);
      alert("Hesap limiti kaydedilirken hata olustu.");
    } finally {
      setMaxAccountsSaving(false);
    }
  };

  const handleSaveAutoApproveSlots = async () => {
    const parsed = parseInt(autoApproveSlotsInput, 10);
    if (Number.isNaN(parsed) || parsed < 0 || parsed > 10000) {
      alert("Otomatik giris kotasi 0 ile 10000 arasinda olmalidir.");
      return;
    }

    setAutoApproveSlotsSaving(true);
    try {
      await setDoc(doc(db, "metadata", "searchLimits"), {
        autoApproveSlots: parsed,
        updatedAt: Date.now(),
      }, { merge: true });
      setAutoApproveSlots(parsed);
      setAutoApproveSlotsInput(String(parsed));
    } catch (error) {
      console.error("Otomatik giris kotasi kaydetme hatasi:", error);
      alert("Otomatik giris kotasi kaydedilirken hata olustu.");
    } finally {
      setAutoApproveSlotsSaving(false);
    }
  };

  const handleToggleMessagingSystem = async () => {
    if (messageSystemSaving) return;

    const nextValue = !directMessagingEnabled;
    setMessageSystemSaving(true);
    try {
      await setDoc(doc(db, "metadata", "messageSettings"), {
        directMessagesEnabled: nextValue,
        updatedAt: Date.now(),
      }, { merge: true });
      setDirectMessagingEnabled(nextValue);
    } catch (error) {
      console.error("Mesajlasma sistemi ayar hatasi:", error);
      alert("Mesajlasma ayari guncellenirken hata olustu.");
    } finally {
      setMessageSystemSaving(false);
    }
  };

  // Bar chart helper
  const BarChart: React.FC<{ data: Record<string, number>; color: string }> = ({ data, color }) => {
    const entries = Object.entries(data) as Array<[string, number]>;
    entries.sort((a, b) => b[1] - a[1]);
    const max = Math.max(...entries.map(e => e[1]), 1);
    return (
      <div className="space-y-1">
        {entries.map(([label, count]) => (
          <div key={label} className="flex items-center gap-2 text-[11px]">
            <span className="w-24 text-slate-400 text-right truncate shrink-0">{label}</span>
            <div className="flex-1 bg-slate-800 rounded-full h-4 overflow-hidden">
              <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${(count / max) * 100}%` }} />
            </div>
            <span className="w-8 text-slate-300 text-right shrink-0">{count}</span>
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen w-screen bg-slate-950 flex flex-col items-center justify-center text-red-400 font-bold gap-4">
        <Loader2 size={48} className="animate-spin" />
        <div className="text-lg animate-pulse">Admin Paneli Yükleniyor...</div>
      </div>
    );
  }

  const autocompleteCompactClass = isAutocompleteCompact ? 'admin-ac-compact space-y-2.5' : '';

  return (
    <div className="min-h-screen w-screen overflow-x-hidden bg-slate-950 md:bg-gradient-to-br md:from-slate-950 md:via-slate-900 md:to-slate-950 flex md:items-center md:justify-center md:h-screen md:overflow-hidden">
      <div className="w-full md:w-[98vw] min-h-screen md:min-h-0 md:h-[98vh] overflow-x-hidden bg-slate-900/95 border-0 md:border-2 md:border-red-900/50 rounded-none md:rounded-lg shadow-none md:shadow-[0_0_50px_rgba(220,38,38,0.15)] md:overflow-hidden flex flex-col">

        {/* Header */}
        <div className="bg-gradient-to-r from-red-950/80 via-slate-800 to-red-950/80 px-3 md:px-4 py-2.5 md:py-3 flex items-center gap-2.5 md:gap-3 border-b-2 border-red-900/50 shrink-0">
          <button onClick={onBack} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div className="bg-red-900/30 p-2 rounded-lg border border-red-700/30">
            <Crown size={20} className="text-red-400" />
          </div>
          <div>
            <h1 className="text-red-400 font-bold text-sm tracking-wider">ADMiN PANELi</h1>
            <p className="text-slate-500 text-[9px]">Sistem Yönetimi</p>
          </div>
          <div className="flex-1" />
          <button onClick={fetchAllData} className="admin-refresh-btn text-[9px] md:text-[10px] text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-2 md:px-3 py-1 md:py-1.5 rounded-md md:rounded-lg border border-slate-700 transition-colors">
            Yenile
          </button>
        </div>

        {/* Tabs */}
        <div className="bg-slate-800/60 px-2.5 md:px-4 py-1.5 flex gap-1.5 border-b border-slate-700/50 shrink-0 overflow-x-auto no-scrollbar">
          {([
            { key: 'dashboard' as TabType, label: 'Panel', icon: BarChart3 },
            { key: 'users' as TabType, label: 'Kullanıcılar', icon: Users },
            { key: 'settings' as TabType, label: 'Ayarlar', icon: Settings },
            { key: 'autocomplete' as TabType, label: 'Oto Tamamlama', icon: Search },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
                className={`admin-mobile-tab-btn shrink-0 flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 rounded-lg text-[11px] md:text-xs font-bold transition-all ${
                activeTab === tab.key
                  ? 'bg-red-900/40 text-red-300 border border-red-700/40'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800 border border-transparent'
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-2.5 md:p-4 custom-scrollbar">

          {/* DASHBOARD TAB */}
          {activeTab === 'dashboard' && (
            <div className="space-y-4 max-w-4xl mx-auto">
              {loadError && (
                <div className="bg-red-950/30 border border-red-800/40 text-red-300 text-xs rounded-xl px-3 py-2">
                  {loadError}
                </div>
              )}
              {/* Stat Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Toplam Kullanıcı" value={allUsers.length} color="text-cyan-400" bg="from-cyan-950/40 to-cyan-900/20" />
                <StatCard label="Toplam Eşya" value={totalItems} color="text-yellow-400" bg="from-yellow-950/40 to-yellow-900/20" />
                <StatCard label="Global Eşya" value={globalItemCount} color="text-emerald-400" bg="from-emerald-950/40 to-emerald-900/20" />
                <StatCard label="Son 7 Gün Kayıt" value={recentUsers} color="text-purple-400" bg="from-purple-950/40 to-purple-900/20" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <StatCard label="Toplam Reçete" value={totalRecipes} color="text-orange-400" bg="from-orange-950/40 to-orange-900/20" />
                <StatCard label="Ort. Eşya/Kullanıcı" value={allUsers.length > 0 ? Math.round(totalItems / allUsers.length) : 0} color="text-pink-400" bg="from-pink-950/40 to-pink-900/20" />
              </div>

              {/* Category Distribution */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                <h3 className="text-slate-300 text-xs font-bold mb-3 tracking-wider">KATEGORi DAGILIMI (Tüm Kullanıcılar)</h3>
                <BarChart data={allItemCategoryDist} color="bg-yellow-500" />
              </div>

              {/* Class Distribution */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                <h3 className="text-slate-300 text-xs font-bold mb-3 tracking-wider">SINIF DAGILIMI</h3>
                <BarChart data={allItemClassDist} color="bg-blue-500" />
              </div>

              {/* Gender Distribution */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                <h3 className="text-slate-300 text-xs font-bold mb-3 tracking-wider">CiNSiYET DAGILIMI</h3>
                <BarChart data={allItemGenderDist} color="bg-pink-500" />
              </div>
            </div>
          )}

          {/* USERS TAB */}
          {activeTab === 'users' && (
            <div className="space-y-3 max-w-4xl mx-auto">
              {loadError && (
                <div className="bg-red-950/30 border border-red-800/40 text-red-300 text-xs rounded-xl px-3 py-2">
                  {loadError}
                </div>
              )}
              {/* Search */}
              <div className="flex items-center gap-2 bg-slate-800/50 border border-slate-700/50 rounded-xl px-3 py-2">
                <Search size={16} className="text-slate-500" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  placeholder="Kullanıcı adı, email veya UID ile ara..."
                  className="flex-1 bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600"
                />
                <span className="text-[10px] text-slate-500">{filteredUsers.length} kullanıcı</span>
                {userAccessFilter === 'pending' && (
                  <button
                    onClick={() => setUserAccessFilter('all')}
                    className="px-2 py-1 rounded-md text-[10px] font-bold border border-amber-700/50 bg-amber-900/30 text-amber-200 hover:bg-amber-800/40 transition-colors"
                  >
                    Bekleyen Filtresi
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  onClick={() => setUserAccessFilter('all')}
                  className={`text-left rounded-xl px-3 py-2 border transition-colors ${
                    userAccessFilter === 'all'
                      ? 'bg-emerald-950/30 border-emerald-800/50'
                      : 'bg-slate-800/50 border-slate-700/50 hover:bg-slate-800/70'
                  }`}
                >
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider">Onayli</p>
                  <p className="text-sm text-emerald-300 font-bold mt-0.5">{approvedUsers.length} kullanici</p>
                </button>
                <button
                  onClick={() => setUserAccessFilter(prev => prev === 'pending' ? 'all' : 'pending')}
                  className={`text-left rounded-xl px-3 py-2 border transition-colors ${
                    userAccessFilter === 'pending'
                      ? 'bg-amber-950/30 border-amber-800/50'
                      : 'bg-slate-800/50 border-slate-700/50 hover:bg-slate-800/70'
                  }`}
                >
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider">Bekleyen</p>
                  <p className="text-sm text-amber-300 font-bold mt-0.5">{pendingUsers.length} kullanici</p>
                </button>
                <button
                  onClick={handleApproveAllPendingUsers}
                  disabled={bulkApprovalSaving || pendingUsers.length === 0}
                  className="bg-emerald-900/30 hover:bg-emerald-800/35 border border-emerald-800/40 rounded-xl px-3 py-2 text-left disabled:opacity-50 transition-colors"
                >
                  <p className="text-[10px] text-emerald-200 uppercase tracking-wider">Toplu Onay</p>
                  <p className="text-[11px] text-emerald-100 font-semibold mt-0.5">
                    {bulkApprovalSaving ? 'Onaylaniyor...' : 'Bekleyenleri Onayla'}
                  </p>
                </button>
              </div>

              {/* User List */}
              {filteredUsers.map(user => {
                const isCurrentAdmin = user.uid === auth.currentUser?.uid;
                return (
                <div key={user.uid} className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedUser(expandedUser === user.uid ? null : user.uid)}
                    className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-700/30 transition-colors"
                  >
                    <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center shrink-0">
                      <Users size={14} className="text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-white font-bold truncate">{user.username || '(İsimsiz)'}</span>
                        <span className="text-[9px] text-cyan-200 bg-cyan-900/30 border border-cyan-700/40 rounded-full px-1.5 py-0.5 uppercase tracking-wider">
                          {getUserClassLimits(user.userClass).label}
                        </span>
                        {user.accessStatus === 'pending' ? (
                          <span className="text-[9px] text-amber-200 bg-amber-900/30 border border-amber-700/40 rounded-full px-1.5 py-0.5 uppercase tracking-wider">Onay Bekliyor</span>
                        ) : (
                          <span className="text-[9px] text-emerald-200 bg-emerald-900/30 border border-emerald-700/40 rounded-full px-1.5 py-0.5 uppercase tracking-wider">Onayli</span>
                        )}
                        {user.blockInfo?.isBlocked && (
                          <span className="text-[9px] text-red-300 bg-red-950/40 border border-red-800/50 rounded-full px-1.5 py-0.5 uppercase tracking-wider">Engelli</span>
                        )}
                        {isCurrentAdmin && (
                          <span className="text-[9px] text-amber-200 bg-amber-900/30 border border-amber-700/50 rounded-full px-1.5 py-0.5 uppercase tracking-wider">Aktif Admin</span>
                        )}
                        <span className="text-[9px] text-slate-500 truncate hidden md:inline">{user.email}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-slate-500 mt-0.5">
                        <span>{user.accountCount} hesap</span>
                        <span>{user.totalItemCount} eşya</span>
                        <span>{user.totalRecipeCount} reçete</span>
                        {user.createdAt && (
                          <span className="hidden md:inline">{new Date(user.createdAt).toLocaleDateString('tr-TR')}</span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0">
                      {expandedUser === user.uid ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                    </div>
                  </button>

                  {/* Expanded Detail */}
                  {expandedUser === user.uid && (
                    <div className="border-t border-slate-700/50 px-4 py-3 space-y-2 bg-slate-900/30 animate-in slide-in-from-top-2 duration-200">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-[11px]">
                        <div><span className="text-slate-500">UID:</span> <span className="text-slate-300 font-mono text-[9px] break-all">{user.uid}</span></div>
                        <div><span className="text-slate-500">Email:</span> <span className="text-slate-300">{user.email || '-'}</span></div>
                        <div><span className="text-slate-500">Sosyal:</span> <span className="text-blue-300 truncate">{user.socialLink || '-'}</span></div>
                        {user.createdAt && (
                          <div><span className="text-slate-500">Kayıt:</span> <span className="text-slate-300">{new Date(user.createdAt).toLocaleString('tr-TR')}</span></div>
                        )}
                      </div>

                      <div className={`mt-2 rounded-xl border px-2.5 py-2 ${user.accessStatus === 'pending' ? 'border-amber-800/40 bg-amber-950/20' : 'border-emerald-800/40 bg-emerald-950/20'}`}>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="text-[11px]">
                            <p className="text-slate-200 font-semibold">Giris Onayi</p>
                            <p className={`text-[10px] ${user.accessStatus === 'pending' ? 'text-amber-300' : 'text-emerald-300'}`}>
                              {user.accessStatus === 'pending'
                                ? 'Mail dogrulandi, admin onayi bekleniyor.'
                                : `Kullanici onayli${user.approvedAt ? ` (${new Date(user.approvedAt).toLocaleString('tr-TR')})` : '.'}`}
                            </p>
                          </div>
                          {user.accessStatus === 'pending' && (
                            <button
                              onClick={() => handleApproveUser(user)}
                              disabled={deleting || resetting || !!approvalSaving[user.uid] || bulkApprovalSaving}
                              className="px-2.5 py-1.5 rounded-md text-[10px] font-bold border border-emerald-700/50 bg-emerald-900/35 text-emerald-100 hover:bg-emerald-800/45 disabled:opacity-50"
                            >
                              {approvalSaving[user.uid] ? 'Onaylaniyor...' : 'Onayla'}
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="mt-2 rounded-xl border border-cyan-900/35 bg-gradient-to-r from-slate-900/70 via-slate-800/45 to-cyan-950/20 px-2.5 py-2.5">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0 text-[11px]">
                            <p className="text-slate-200 font-semibold flex items-center gap-1.5"><AtSign size={12} /> Kullanici Adi</p>
                            <p className="text-[10px] text-slate-500">Admin olarak kullanici adini degistirebilirsiniz.</p>
                          </div>
                          <div className="flex w-full flex-col gap-1.5 sm:w-auto sm:flex-row sm:items-center">
                            <input
                              type="text"
                              value={usernameInputs[user.uid] ?? (user.username || '')}
                              onChange={e => setUsernameInputs(prev => ({ ...prev, [user.uid]: e.target.value }))}
                              className="w-full sm:w-44 bg-slate-950/85 border border-slate-700 rounded-md px-2 py-1.5 text-[11px] text-slate-200 outline-none focus:border-cyan-500/50"
                              maxLength={20}
                            />
                            <button
                              onClick={() => handleSaveUsername(user)}
                              disabled={deleting || resetting || !!usernameSaving[user.uid]}
                              className="w-full sm:w-auto px-2.5 py-1.5 rounded-md text-[10px] font-bold border border-cyan-700/50 bg-cyan-900/35 text-cyan-100 hover:bg-cyan-800/45 disabled:opacity-50 shadow-sm shadow-cyan-950/40"
                            >
                              {usernameSaving[user.uid] ? 'Kayit...' : 'Kaydet'}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="mt-2 bg-slate-800/40 border border-slate-700/40 rounded-lg px-2.5 py-2 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[11px]">
                            <p className="text-slate-200 font-semibold">Kullanici Engeli</p>
                            <p className="text-[10px] text-slate-500">
                              {isCurrentAdmin
                                ? 'Aktif admin hesabi guvenlik nedeniyle engellenemez.'
                                : user.blockInfo?.isBlocked
                                ? `Kullanici engelli. ${user.blockInfo.reasonLabel ? `Neden: ${user.blockInfo.reasonLabel}` : ''}`
                                : 'Kullanici aktif. Gerekirse engelleme uygulayabilirsiniz.'}
                            </p>
                          </div>
                          <button
                            onClick={() => handleToggleUserBlocked(user)}
                            disabled={deleting || resetting || !!blockSaving[user.uid] || isCurrentAdmin}
                            className={`px-2.5 py-1.5 rounded-md text-[10px] font-bold border transition-colors flex items-center gap-1 ${
                              user.blockInfo?.isBlocked
                                ? 'bg-emerald-950/35 text-emerald-300 border-emerald-800/50 hover:bg-emerald-900/40'
                                : 'bg-red-950/35 text-red-300 border-red-900/50 hover:bg-red-900/40'
                            } disabled:opacity-50`}
                          >
                            {isCurrentAdmin ? <Shield size={12} /> : (user.blockInfo?.isBlocked ? <UserCheck size={12} /> : <UserX size={12} />)}
                            {isCurrentAdmin ? 'Kilitli' : (blockSaving[user.uid] ? 'Kayit...' : (user.blockInfo?.isBlocked ? 'Engeli Kaldir' : 'Engelle'))}
                          </button>
                        </div>
                        {!isCurrentAdmin && !user.blockInfo?.isBlocked && (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-500">Neden:</span>
                            <select
                              value={blockReasonInputs[user.uid] ?? BLOCK_REASON_OPTIONS[0].value}
                              onChange={e => setBlockReasonInputs(prev => ({ ...prev, [user.uid]: e.target.value }))}
                              className="bg-slate-950/80 border border-slate-700 rounded-md px-2 py-1.5 text-[11px] text-slate-200 outline-none focus:border-red-500/50"
                            >
                              {BLOCK_REASON_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>

                      {/* Account/Server/Char breakdown */}
                      <div className="mt-2 space-y-1">
                        <span className="text-[10px] text-slate-500 font-bold tracking-wider">HESAP DETAYLARI</span>
                        {(Array.isArray(user.accounts) ? user.accounts : []).map((acc, aIdx) => (
                          <div key={aIdx} className="bg-slate-800/50 rounded-lg p-2 text-[10px]">
                            <span className="text-yellow-400 font-bold">{acc.name}</span>
                            <div className="ml-2 mt-1 space-y-0.5">
                              {(acc.servers || []).map((srv, sIdx) => {
                                const charItems = (Array.isArray(srv.characters) ? srv.characters : []).map(c => {
                                  let cnt = 0;
                                  [c?.bank1, c?.bank2, c?.bag].forEach(cont => {
                                    if (Array.isArray(cont?.slots)) cont.slots.forEach(s => { if (s?.item) cnt++; });
                                  });
                                  const recipes = Array.isArray(c?.learnedRecipes) ? c.learnedRecipes.length : 0;
                                  return { name: c?.name || 'Isimsiz', items: cnt, recipes };
                                });
                                const totalSrvItems = charItems.reduce((s, c) => s + c.items, 0);
                                if (totalSrvItems === 0 && charItems.every(c => c.recipes === 0)) return null;
                                return (
                                  <div key={sIdx} className="flex flex-wrap gap-x-3 gap-y-0.5">
                                    <span className="text-emerald-400">{srv.name}:</span>
                                    {charItems.map((c, cIdx) => (
                                      (c.items > 0 || c.recipes > 0) && (
                                        <span key={cIdx} className="text-slate-400">
                                          {c.name} <span className="text-slate-300">({c.items}e {c.recipes}r)</span>
                                        </span>
                                      )
                                    ))}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* USER LIMITS */}
                      <div className="mt-2 bg-slate-800/40 border border-slate-700/40 rounded-lg px-2.5 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[11px]">
                            <p className="text-slate-200 font-semibold">Kullanici Sinifi</p>
                            <p className="text-[10px] text-slate-500">Mesaj ve global arama limitleri sinifa gore otomatik atanir. Degerleri Limit Ayarlari sekmesinden degistirebilirsiniz.</p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <select
                              value={user.userClass}
                              onChange={e => handleSaveUserClass(user, e.target.value as UserClass)}
                              disabled={deleting || resetting || !!userClassSaving[user.uid]}
                              className="bg-slate-950/80 border border-slate-700 rounded-md px-2 py-1.5 text-[11px] text-slate-200 outline-none focus:border-cyan-500/50 disabled:opacity-50"
                            >
                              <option value="user">Kullanici</option>
                              <option value="premium">Premium</option>
                              <option value="pro">Pro</option>
                            </select>
                          </div>
                        </div>
                        <div className="mt-1 text-[10px] text-slate-400">
                          Mesaj: <span className="text-cyan-300 font-semibold">{getUserClassLimits(user.userClass).dailyMessageLimit}/gun</span>
                          {' • '}
                          Global: <span className="text-emerald-300 font-semibold">{getUserClassLimits(user.userClass).dailyGlobalSearchLimit}/gun</span>
                        </div>
                      </div>

                      <div className="mt-2 bg-slate-800/40 border border-slate-700/40 rounded-lg px-2.5 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[11px]">
                            <p className="text-slate-200 font-semibold">Kullanici Bazli Global Arama Override</p>
                            <p className="text-[10px] text-slate-500">Bos birakirsan sinif limiti kullanilir.</p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min="1"
                              value={userSearchOverrideInputs[user.uid] ?? ''}
                              onChange={e => setUserSearchOverrideInputs(prev => ({ ...prev, [user.uid]: e.target.value }))}
                              placeholder="Limit"
                              className="w-20 bg-slate-950/80 border border-slate-700 rounded-md px-2 py-1.5 text-[11px] text-slate-200 outline-none focus:border-emerald-500/50"
                            />
                            <button
                              onClick={() => handleSaveUserSearchOverride(user)}
                              disabled={deleting || resetting || !!userSearchOverrideSaving[user.uid]}
                              className="px-2.5 py-1.5 rounded-md text-[10px] font-bold border border-emerald-700/50 bg-emerald-900/30 text-emerald-200 hover:bg-emerald-800/40 disabled:opacity-50"
                            >
                              {userSearchOverrideSaving[user.uid] ? 'Kayit...' : 'Kaydet'}
                            </button>
                            <button
                              onClick={() => handleClearUserSearchOverride(user)}
                              disabled={deleting || resetting || !!userSearchOverrideSaving[user.uid] || searchLimits.userOverrides[user.uid] === undefined}
                              className="px-2.5 py-1.5 rounded-md text-[10px] font-bold border border-slate-700/50 bg-slate-900/50 text-slate-300 hover:bg-slate-800/60 disabled:opacity-50"
                            >
                              Kaldir
                            </button>
                          </div>
                        </div>
                        <div className="mt-1 text-[10px] text-slate-400">
                          Aktif limit: <span className="text-emerald-300 font-semibold">{getEffectiveGlobalSearchLimit(user)}/gun</span>
                          {' • '}
                          {searchLimits.userOverrides[user.uid] !== undefined
                            ? <span className="text-amber-300">Override aktif</span>
                            : <span>Sinif limiti aktif</span>}
                        </div>
                      </div>

                      <div className="mt-2 space-y-1.5">
                        <span className="text-[10px] text-slate-500 font-bold tracking-wider">KULLANICI YETKILERI</span>

                        <div className="flex items-center justify-between gap-2 bg-slate-800/40 border border-slate-700/40 rounded-lg px-2.5 py-2">
                          <div className="text-[11px]">
                            <p className="text-slate-200 font-semibold">Veri Girisi</p>
                            <p className="text-[10px] text-slate-500">Hesap, esya ve recete islemleri</p>
                          </div>
                          <button
                            onClick={() => handleToggleUserPermission(user, 'canDataEntry', !(user.permissions?.canDataEntry ?? true))}
                            disabled={deleting || resetting || !!permissionSaving[user.uid]}
                            className={`px-2.5 py-1 rounded-md text-[10px] font-bold border transition-colors flex items-center gap-1 ${(user.permissions?.canDataEntry ?? true) ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/50 hover:bg-emerald-900/40' : 'bg-red-950/40 text-red-300 border-red-900/50 hover:bg-red-900/40'} disabled:opacity-50`}
                          >
                            {(user.permissions?.canDataEntry ?? true) ? <Unlock size={11} /> : <Lock size={11} />}
                            {(user.permissions?.canDataEntry ?? true) ? 'Acik' : 'Kapali'}
                          </button>
                        </div>

                        <div className="flex items-center justify-between gap-2 bg-slate-800/40 border border-slate-700/40 rounded-lg px-2.5 py-2">
                          <div className="text-[11px]">
                            <p className="text-slate-200 font-semibold">Global Arama</p>
                            <p className="text-[10px] text-slate-500">Global arama sekmesine erisim</p>
                          </div>
                          <button
                            onClick={() => handleToggleUserPermission(user, 'canGlobalSearch', !(user.permissions?.canGlobalSearch ?? true))}
                            disabled={deleting || resetting || !!permissionSaving[user.uid]}
                            className={`px-2.5 py-1 rounded-md text-[10px] font-bold border transition-colors flex items-center gap-1 ${(user.permissions?.canGlobalSearch ?? true) ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/50 hover:bg-emerald-900/40' : 'bg-red-950/40 text-red-300 border-red-900/50 hover:bg-red-900/40'} disabled:opacity-50`}
                          >
                            {(user.permissions?.canGlobalSearch ?? true) ? <Unlock size={11} /> : <Lock size={11} />}
                            {(user.permissions?.canGlobalSearch ?? true) ? 'Acik' : 'Kapali'}
                          </button>
                        </div>
                      </div>

                      {/* Reset user data */}
                      {resetConfirm === user.uid ? (
                        <div className="flex items-center gap-2 mt-2 bg-amber-950/30 border border-amber-900/50 rounded-lg p-2">
                          <AlertTriangle size={14} className="text-amber-400 shrink-0" />
                          <span className="text-[11px] text-amber-300 flex-1">Bu kullanıcının tüm verilerini sıfırlamak istiyor musunuz?</span>
                          <button
                            onClick={() => handleResetUserData(user)}
                            disabled={resetting || deleting || isCurrentAdmin}
                            className="px-3 py-1 bg-amber-700 hover:bg-amber-600 text-white text-[10px] font-bold rounded transition-colors disabled:opacity-50"
                          >
                            {isCurrentAdmin ? 'Kilitli' : (resetting ? 'Sıfırlanıyor...' : 'Evet, Sıfırla')}
                          </button>
                          <button
                            onClick={() => setResetConfirm(null)}
                            className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-[10px] font-bold rounded transition-colors"
                          >
                            Vazgeç
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setDeleteConfirm(null); setResetConfirm(user.uid); }}
                          disabled={deleting || resetting || isCurrentAdmin}
                          className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-amber-950/30 hover:bg-amber-900/40 text-amber-400 hover:text-amber-300 text-[10px] font-bold rounded-lg border border-amber-900/30 hover:border-amber-700/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <RotateCcw size={12} />
                          {isCurrentAdmin ? 'Kilitli' : 'Veri Sıfırla'}
                        </button>
                      )}

                      {/* Delete */}
                      {deleteConfirm === user.uid ? (
                        <div className="flex items-center gap-2 mt-2 bg-red-950/30 border border-red-900/50 rounded-lg p-2">
                          <AlertTriangle size={14} className="text-red-400 shrink-0" />
                          <span className="text-[11px] text-red-300 flex-1">Bu kullanıcının tüm verileri silinecek. Emin misiniz?</span>
                          <button
                            onClick={() => handleDeleteUser(user)}
                            disabled={deleting || resetting || isCurrentAdmin}
                            className="px-3 py-1 bg-red-700 hover:bg-red-600 text-white text-[10px] font-bold rounded transition-colors disabled:opacity-50"
                          >
                            {isCurrentAdmin ? 'Kilitli' : (deleting ? 'Siliniyor...' : 'Evet, Sil')}
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-[10px] font-bold rounded transition-colors"
                          >
                            Vazgeç
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setResetConfirm(null); setDeleteConfirm(user.uid); }}
                          disabled={deleting || resetting || isCurrentAdmin}
                          className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-red-950/30 hover:bg-red-900/40 text-red-400 hover:text-red-300 text-[10px] font-bold rounded-lg border border-red-900/30 hover:border-red-700/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Trash2 size={12} />
                          {isCurrentAdmin ? 'Kilitli' : 'Kullanıcıyı Sil'}
                        </button>
                      )}
                      {isCurrentAdmin && (
                        <div className="mt-2 rounded-lg border border-amber-800/45 bg-amber-950/25 px-2.5 py-2 text-[10px] text-amber-200">
                          Guvenlik kilidi: Aktif admin hesabi engellenemez, sifirlanamaz veya silinemez.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
              })}
            </div>
          )}

          {/* SETTINGS TAB */}
          {activeTab === 'settings' && (
            <div className="admin-settings-root space-y-3 md:space-y-4 max-w-2xl mx-auto w-full">

              {/* Admin Management */}
              <div className="admin-settings-card bg-slate-800/55 border border-slate-700/55 rounded-xl p-3.5 md:p-4">
                <h3 className="text-red-400 text-[11px] md:text-xs font-bold mb-3 tracking-wider flex items-center gap-2">
                  <Crown size={14} />
                  ADMiN YÖNETiMi
                </h3>

                {/* Permanent admin */}
                <div className="mb-3 space-y-1.5">
                  <div className="flex items-center gap-2 bg-slate-900/50 rounded-lg px-3 py-2 border border-slate-700/30">
                    <Shield size={14} className="text-yellow-500 shrink-0" />
                    <span className="text-xs text-slate-200 flex-1">yvzsltn61@gmail.com</span>
                    <span className="text-[9px] text-yellow-500 bg-yellow-900/30 px-2 py-0.5 rounded-full border border-yellow-700/30">Kalıcı Yönetici</span>
                  </div>

                  {adminEmails.filter(e => e !== 'yvzsltn61@gmail.com').map(email => (
                    <div key={email} className="flex items-center gap-2 bg-slate-900/50 rounded-lg px-3 py-2 border border-slate-700/30">
                      <Crown size={14} className="text-red-400 shrink-0" />
                      <span className="text-xs text-slate-200 flex-1">{email}</span>
                      <button
                        onClick={() => handleRemoveAdmin(email)}
                        disabled={adminLoading || email.toLowerCase() === (auth.currentUser?.email || '').toLowerCase()}
                        className="text-red-500 hover:text-red-400 p-1 hover:bg-red-900/20 rounded transition-colors disabled:opacity-50"
                        title={email.toLowerCase() === (auth.currentUser?.email || '').toLowerCase() ? 'Kendi admin yetkinizi kaldiramazsiniz' : 'Admini kaldir'}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add admin */}
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={newAdminEmail}
                    onChange={e => setNewAdminEmail(e.target.value)}
                    placeholder="yeni-admin@email.com"
                    className="flex-1 bg-slate-950/80 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-red-500/50 placeholder-slate-600"
                  />
                  <button
                    onClick={handleAddAdmin}
                    disabled={adminLoading || !newAdminEmail.trim()}
                    className="px-4 py-2 bg-red-800 hover:bg-red-700 text-white text-[11px] font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Plus size={14} />
                    Ekle
                  </button>
                </div>
              </div>

              {/* Messaging System */}
              <div className="admin-settings-card bg-slate-800/55 border border-slate-700/55 rounded-xl p-3.5 md:p-4">
                <h3 className="text-cyan-400 text-[11px] md:text-xs font-bold mb-3 tracking-wider flex items-center gap-2">
                  <MessageCircle size={14} />
                  MESAJLASMA SiSTEMi
                </h3>

                <div className="flex items-center justify-between gap-3 bg-slate-900/50 rounded-lg border border-slate-700/40 px-3 py-2.5">
                  <div className="text-[10px]">
                    <p className="text-slate-200 font-semibold">Kullanici Mesajlasmasi</p>
                    <p className="text-[9px] text-slate-500">Kapaliyken sadece yoneticiler mesaj gonderebilir.</p>
                  </div>
                  <button
                    onClick={handleToggleMessagingSystem}
                    disabled={messageSystemSaving}
                    className={`px-2.5 py-1.5 rounded-md text-[9px] font-bold border transition-colors flex items-center gap-1 ${directMessagingEnabled ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/50 hover:bg-emerald-900/40' : 'bg-red-950/40 text-red-300 border-red-900/50 hover:bg-red-900/40'} disabled:opacity-50`}
                  >
                    {directMessagingEnabled ? <Unlock size={10} /> : <Lock size={10} />}
                    {messageSystemSaving ? 'Kaydediliyor...' : (directMessagingEnabled ? 'Acik' : 'Kapali')}
                  </button>
                </div>
              </div>

              {/* Max Accounts */}
              <div className="admin-settings-card bg-slate-800/55 border border-slate-700/55 rounded-xl p-3.5 md:p-4">
                <h3 className="text-amber-400 text-[11px] md:text-xs font-bold mb-3 tracking-wider flex items-center gap-2">
                  <Shield size={14} />
                  HESAP LiMiTi
                </h3>

                <div className="flex items-center justify-between gap-3 bg-slate-900/50 rounded-lg border border-slate-700/40 px-3 py-2.5">
                  <div className="text-[10px]">
                    <p className="text-slate-200 font-semibold">Maksimum Hesap Sayisi</p>
                    <p className="text-[9px] text-slate-500">Her kullanicinin olusturabilecegi en fazla hesap adedi.</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={maxAccountsInput}
                      onChange={e => setMaxAccountsInput(e.target.value)}
                      className="w-16 bg-slate-950/80 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-amber-500/50 text-center"
                    />
                    <button
                      onClick={handleSaveMaxAccounts}
                      disabled={maxAccountsSaving || String(maxAccounts) === maxAccountsInput}
                      className="px-2.5 py-1.5 rounded-md text-[9px] font-bold border transition-colors bg-amber-950/40 text-amber-300 border-amber-800/50 hover:bg-amber-900/40 disabled:opacity-50"
                    >
                      {maxAccountsSaving ? 'Kaydediliyor...' : 'Kaydet'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="admin-settings-card bg-slate-800/55 border border-slate-700/55 rounded-xl p-3.5 md:p-4">
                <h3 className="text-cyan-400 text-[11px] md:text-xs font-bold mb-3 tracking-wider flex items-center gap-2">
                  <Users size={14} />
                  GIRIS ONAY KOTASI
                </h3>

                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-3 bg-slate-900/50 rounded-lg border border-slate-700/40 px-3 py-2.5">
                    <div className="text-[10px]">
                      <p className="text-slate-200 font-semibold">Otomatik Onay Kalan Hak</p>
                      <p className="text-[9px] text-slate-500">Bu deger {'>'} 0 iken yeni kayit olan kullanicilar otomatik giris yapabilir.</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <input
                        type="number"
                        min="0"
                        max="10000"
                        value={autoApproveSlotsInput}
                        onChange={e => setAutoApproveSlotsInput(e.target.value)}
                        className="w-20 bg-slate-950/80 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-cyan-500/50 text-center"
                      />
                      <button
                        onClick={handleSaveAutoApproveSlots}
                        disabled={autoApproveSlotsSaving || String(autoApproveSlots) === autoApproveSlotsInput}
                        className="px-2.5 py-1.5 rounded-md text-[9px] font-bold border transition-colors bg-cyan-950/40 text-cyan-300 border-cyan-800/50 hover:bg-cyan-900/40 disabled:opacity-50"
                      >
                        {autoApproveSlotsSaving ? 'Kaydediliyor...' : 'Kaydet'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-emerald-800/40 bg-emerald-950/20 px-3 py-2">
                      <p className="text-[9px] text-emerald-300 uppercase tracking-wider">Onayli</p>
                      <p className="text-sm text-emerald-100 font-bold mt-0.5">{approvedUsers.length}</p>
                    </div>
                    <div className="rounded-lg border border-amber-800/40 bg-amber-950/20 px-3 py-2">
                      <p className="text-[9px] text-amber-300 uppercase tracking-wider">Bekleyen</p>
                      <p className="text-sm text-amber-100 font-bold mt-0.5">{pendingUsers.length}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Limit Settings */}
              <div className="admin-settings-card bg-slate-800/55 border border-slate-700/55 rounded-xl p-3.5 md:p-4">
                <h3 className="text-emerald-400 text-[11px] md:text-xs font-bold mb-3 tracking-wider flex items-center gap-2">
                  <Search size={14} />
                  LiMiT AYARLARI
                </h3>

                <div className="space-y-2.5">
                  {USER_CLASS_KEYS.map(classKey => {
                    const classInfo = searchLimits.classLimits[classKey];
                    return (
                      <div key={classKey} className="rounded-lg border border-slate-700/40 bg-slate-900/50 px-2.5 py-2">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <p className="text-[10px] font-semibold text-slate-200">{classInfo.label}</p>
                          <p className="text-[9px] text-slate-500 uppercase tracking-wide">Gunluk limitler</p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="text-[9px] text-slate-500 font-bold block mb-1">GLOBAL ARAMA</label>
                            <input
                              type="number"
                              min="1"
                              value={classLimitInputs[classKey].dailyGlobalSearchLimit}
                              onChange={e => setClassLimitInputs(prev => ({
                                ...prev,
                                [classKey]: {
                                  ...prev[classKey],
                                  dailyGlobalSearchLimit: e.target.value,
                                },
                              }))}
                              className="w-full bg-slate-950/80 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-emerald-500/50"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] text-slate-500 font-bold block mb-1">MESAJ</label>
                            <input
                              type="number"
                              min="1"
                              value={classLimitInputs[classKey].dailyMessageLimit}
                              onChange={e => setClassLimitInputs(prev => ({
                                ...prev,
                                [classKey]: {
                                  ...prev[classKey],
                                  dailyMessageLimit: e.target.value,
                                },
                              }))}
                              className="w-full bg-slate-950/80 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-cyan-500/50"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="text-[9px] text-slate-500">
                    Kullanici bazli global arama override ayarlari <span className="text-slate-200 font-semibold">Kullanicilar</span> sekmesinde kalmaya devam eder.
                  </div>
                  <button
                    onClick={handleSaveClassLimits}
                    disabled={limitSaving}
                    className="px-4 py-2 bg-emerald-800 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg transition-colors disabled:opacity-50"
                  >
                    {limitSaving ? 'Kaydediliyor...' : 'Limitleri Kaydet'}
                  </button>
                </div>

              </div>
            </div>
          )}

          {/* AUTOCOMPLETE TAB */}
          {activeTab === 'autocomplete' && (
            <div className={`admin-ac-root space-y-4 max-w-2xl mx-auto w-full ${autocompleteCompactClass}`}>
              <div className="md:hidden bg-slate-800/45 border border-slate-700/50 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                <span className="text-[10px] text-slate-400">Mobil Kompakt Mod</span>
                <button
                  onClick={() => setIsAutocompleteCompact(prev => !prev)}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-bold border transition-colors ${
                    isAutocompleteCompact
                      ? 'bg-emerald-900/35 border-emerald-700/45 text-emerald-200'
                      : 'bg-slate-800/80 border-slate-600/50 text-slate-300'
                  }`}
                >
                  {isAutocompleteCompact ? 'Acik' : 'Kapali'}
                </button>
              </div>

              <div className="ac-card bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                <input
                  ref={autocompleteBulkImportInputRef}
                  type="file"
                  accept=".csv,.txt,text/csv,text/plain"
                  className="hidden"
                  onChange={handleImportAllAutocompleteFile}
                />
                <h3 className="text-slate-200 text-xs font-bold mb-2 tracking-wider flex items-center gap-2">
                  <Upload size={14} />
                  TOPLU ISLEM
                </h3>
                <p className="text-[10px] text-slate-500 mb-2.5">
                  Tum oto tamamlama listelerini tek dosyada disa aktarabilir ve ayni formatla toplu ice aktarabilirsiniz.
                </p>
                <div className="ac-action-row ac-bulk-action-row flex flex-wrap gap-2">
                  <button
                    onClick={handleExportAllAutocomplete}
                    disabled={isAnyAutocompleteBusy}
                    className="ac-bulk-action-btn ac-bulk-action-btn--export px-3 py-1.5 bg-indigo-800 hover:bg-indigo-700 text-white text-[11px] font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Download size={12} />
                    Tumunu Disa Aktar
                  </button>
                  <button
                    onClick={handleOpenAutocompleteBulkImportPicker}
                    disabled={isAnyAutocompleteBusy}
                    className="ac-bulk-action-btn ac-bulk-action-btn--import px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-100 text-[11px] font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Upload size={12} />
                    {autocompleteBulkImporting ? 'Import...' : 'Toplu Ice Aktar'}
                  </button>
                </div>
              </div>

              <div className="ac-card bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                <input
                  ref={enchantmentImportInputRef}
                  type="file"
                  accept=".csv,.txt,text/csv,text/plain"
                  className="hidden"
                  onChange={handleImportEnchantmentsFile}
                />

                <h3 className="text-amber-300 text-xs font-bold mb-3 tracking-wider flex items-center gap-2">
                  <Search size={14} />
                  EFSUN OTO TAMAMLAMA
                </h3>

                <p className="text-[10px] text-slate-500 mb-2.5">
                  Bu listedeki isimler item ekleme ekraninda otomatik onerilerde gorunur. Listeden silinen isimler kasadaki itemlardan silinmez, sadece oneriden kalkar.
                </p>

                <div className="space-y-2">
                  <textarea
                    value={enchantmentTextInput}
                    onChange={e => setEnchantmentTextInput(e.target.value)}
                    rows={4}
                    placeholder="Her satira bir efsun yazin. Ornek:&#10;Alman Modeli&#10;Dis Sehir Modeli"
                    className="w-full bg-slate-950/80 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-amber-500/50 placeholder-slate-600 resize-y"
                  />
                  <div className="ac-action-row flex flex-wrap gap-2">
                    <button
                      onClick={handleAddEnchantmentsFromText}
                      disabled={enchantmentSaving || enchantmentImporting || !enchantmentTextInput.trim()}
                      className="px-3 py-1.5 bg-amber-800 hover:bg-amber-700 text-white text-[11px] font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Plus size={12} />
                      Metinden Ekle
                    </button>
                    <button
                      onClick={handleOpenEnchantmentImportPicker}
                      disabled={enchantmentSaving || enchantmentImporting}
                      className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-100 text-[11px] font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Upload size={12} />
                      {enchantmentImporting ? 'Import...' : 'CSV/TXT Import'}
                    </button>
                    <button
                      onClick={handleExportEnchantments}
                      disabled={enchantmentSaving || enchantmentImporting || managedEnchantments.length === 0}
                      className="px-3 py-1.5 bg-blue-800 hover:bg-blue-700 text-white text-[11px] font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Download size={12} />
                      Disa Aktar
                    </button>
                    <button
                      onClick={handleBulkDeleteEnchantments}
                      disabled={enchantmentSaving || enchantmentImporting || managedEnchantments.length === 0}
                      className="px-3 py-1.5 bg-red-900 hover:bg-red-800 text-white text-[11px] font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Trash2 size={12} />
                      Toplu Sil
                    </button>
                  </div>
                </div>

                <div className="mt-3 rounded-lg border border-slate-700/40 bg-slate-900/50 p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <input
                      type="text"
                      value={enchantmentListSearch}
                      onChange={e => setEnchantmentListSearch(e.target.value)}
                      placeholder="Listede ara..."
                      className="flex-1 min-w-0 sm:min-w-[160px] bg-slate-950/80 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-amber-500/50 placeholder-slate-600"
                    />
                    <span className="text-[10px] text-slate-500">{managedEnchantments.length} kayit</span>
                  </div>

                  <div className="max-h-56 overflow-y-auto space-y-1">
                    {filteredManagedEnchantments.length === 0 ? (
                      <div className="text-[11px] text-slate-500 px-2 py-1">Goruntulenecek efsun yok.</div>
                    ) : (
                      filteredManagedEnchantments.map(name => (
                        <div key={name} className="ac-item-row flex flex-wrap sm:flex-nowrap items-start sm:items-center gap-2 bg-slate-950/55 border border-slate-700/40 rounded-md px-2 py-1.5">
                          {editingEnchantment === name ? (
                            <>
                              <input
                                type="text"
                                value={editingEnchantmentInput}
                                onChange={e => setEditingEnchantmentInput(e.target.value)}
                                className="flex-1 min-w-0 basis-full sm:basis-auto bg-slate-900/80 border border-slate-600 rounded px-2 py-1 text-xs text-slate-100 outline-none focus:border-amber-500/50"
                              />
                              <button
                                onClick={handleSaveEditedEnchantment}
                                disabled={enchantmentSaving || enchantmentImporting}
                                className="px-2 py-1 bg-emerald-800 hover:bg-emerald-700 text-white text-[10px] font-bold rounded transition-colors disabled:opacity-50 flex items-center gap-1"
                              >
                                <Save size={10} />
                                Kaydet
                              </button>
                              <button
                                onClick={handleCancelEditEnchantment}
                                disabled={enchantmentSaving || enchantmentImporting}
                                className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 text-[10px] font-bold rounded transition-colors disabled:opacity-50"
                              >
                                Vazgec
                              </button>
                            </>
                          ) : (
                            <div className="ac-item-view">
                              <span className="ac-item-name flex-1 min-w-0 text-xs text-slate-200 break-all">{name}</span>
                              <div className="ac-item-actions">
                                <button
                                  onClick={() => handleStartEditEnchantment(name)}
                                  disabled={enchantmentSaving || enchantmentImporting}
                                  title="Duzenle"
                                  aria-label="Duzenle"
                                  className="px-2 py-1 bg-blue-900/45 hover:bg-blue-800/55 text-blue-200 text-[10px] font-bold rounded border border-blue-800/40 transition-colors disabled:opacity-50 flex items-center gap-1"
                                >
                                  <Pencil size={10} />
                                </button>
                                <button
                                  onClick={() => handleDeleteEnchantment(name)}
                                  disabled={enchantmentSaving || enchantmentImporting}
                                  title="Sil"
                                  aria-label="Sil"
                                  className="px-2 py-1 bg-red-950/45 hover:bg-red-900/55 text-red-300 text-[10px] font-bold rounded border border-red-900/40 transition-colors disabled:opacity-50 flex items-center gap-1"
                                >
                                  <Trash2 size={10} />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="ac-card bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                <h3 className="text-emerald-300 text-xs font-bold mb-3 tracking-wider flex items-center gap-2">
                  <Search size={14} />
                  IKSIR OTO TAMAMLAMA
                </h3>

                <p className="text-[10px] text-slate-500 mb-2.5">
                  Her satira <span className="text-slate-300 font-semibold">Isim:Seviye</span> yazin. Ornek: <span className="text-slate-300">Alman Modeli Iksir:35</span>
                </p>

                <div className="space-y-2">
                  <textarea
                    value={potionTextInput}
                    onChange={e => setPotionTextInput(e.target.value)}
                    rows={4}
                    placeholder="Alman Modeli Iksir:35&#10;Yasam Iksiri:25"
                    className="w-full bg-slate-950/80 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-emerald-500/50 placeholder-slate-600 resize-y"
                  />
                  <div className="ac-action-row flex flex-wrap gap-2">
                    <button
                      onClick={handleAddPotionsFromText}
                      disabled={potionSaving || !potionTextInput.trim()}
                      className="px-3 py-1.5 bg-emerald-800 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Plus size={12} />
                      Metinden Ekle
                    </button>
                    <button
                      onClick={handleExportPotions}
                      disabled={potionSaving || managedPotions.length === 0}
                      className="px-3 py-1.5 bg-blue-800 hover:bg-blue-700 text-white text-[11px] font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Download size={12} />
                      Disa Aktar
                    </button>
                    <button
                      onClick={handleBulkDeletePotions}
                      disabled={potionSaving || managedPotions.length === 0}
                      className="px-3 py-1.5 bg-red-900 hover:bg-red-800 text-white text-[11px] font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Trash2 size={12} />
                      Toplu Sil
                    </button>
                  </div>
                </div>

                <div className="mt-3 rounded-lg border border-slate-700/40 bg-slate-900/50 p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <input
                      type="text"
                      value={potionListSearch}
                      onChange={e => setPotionListSearch(e.target.value)}
                      placeholder="Listede ara..."
                      className="flex-1 min-w-0 sm:min-w-[160px] bg-slate-950/80 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-emerald-500/50 placeholder-slate-600"
                    />
                    <span className="text-[10px] text-slate-500">{managedPotions.length} kayit</span>
                  </div>

                  <div className="max-h-56 overflow-y-auto space-y-1">
                    {filteredManagedPotions.length === 0 ? (
                      <div className="text-[11px] text-slate-500 px-2 py-1">Goruntulenecek iksir yok.</div>
                    ) : (
                      filteredManagedPotions.map(entry => (
                        <div key={entry.name} className="ac-item-row flex flex-wrap sm:flex-nowrap items-start sm:items-center gap-2 bg-slate-950/55 border border-slate-700/40 rounded-md px-2 py-1.5">
                          {editingPotion === entry.name ? (
                            <>
                              <input
                                type="text"
                                value={editingPotionNameInput}
                                onChange={e => setEditingPotionNameInput(e.target.value)}
                                className="flex-1 min-w-0 basis-full sm:basis-auto bg-slate-900/80 border border-slate-600 rounded px-2 py-1 text-xs text-slate-100 outline-none focus:border-emerald-500/50"
                              />
                              <input
                                type="number"
                                min="1"
                                max="59"
                                value={editingPotionLevelInput}
                                onChange={e => setEditingPotionLevelInput(e.target.value)}
                                className="w-16 bg-slate-900/80 border border-slate-600 rounded px-2 py-1 text-xs text-slate-100 outline-none focus:border-emerald-500/50"
                              />
                              <button
                                onClick={handleSaveEditedPotion}
                                disabled={potionSaving}
                                className="px-2 py-1 bg-emerald-800 hover:bg-emerald-700 text-white text-[10px] font-bold rounded transition-colors disabled:opacity-50 flex items-center gap-1"
                              >
                                <Save size={10} />
                                Kaydet
                              </button>
                              <button
                                onClick={handleCancelEditPotion}
                                disabled={potionSaving}
                                className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 text-[10px] font-bold rounded transition-colors disabled:opacity-50"
                              >
                                Vazgec
                              </button>
                            </>
                          ) : (
                            <div className="ac-item-view">
                              <span className="ac-item-name flex-1 min-w-0 text-xs text-slate-200 break-all">{entry.name}</span>
                              <div className="ac-item-actions">
                                <span className="ac-item-lvl px-2 py-0.5 rounded bg-emerald-900/35 border border-emerald-800/40 text-[10px] text-emerald-200 font-bold">Lv.{entry.level}</span>
                                <button
                                  onClick={() => handleStartEditPotion(entry)}
                                  disabled={potionSaving}
                                  title="Duzenle"
                                  aria-label="Duzenle"
                                  className="px-2 py-1 bg-blue-900/45 hover:bg-blue-800/55 text-blue-200 text-[10px] font-bold rounded border border-blue-800/40 transition-colors disabled:opacity-50 flex items-center gap-1"
                                >
                                  <Pencil size={10} />
                                </button>
                                <button
                                  onClick={() => handleDeletePotion(entry.name)}
                                  disabled={potionSaving}
                                  title="Sil"
                                  aria-label="Sil"
                                  className="px-2 py-1 bg-red-950/45 hover:bg-red-900/55 text-red-300 text-[10px] font-bold rounded border border-red-900/40 transition-colors disabled:opacity-50 flex items-center gap-1"
                                >
                                  <Trash2 size={10} />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="ac-card bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                <h3 className="text-orange-300 text-xs font-bold mb-3 tracking-wider flex items-center gap-2">
                  <Search size={14} />
                  MADEN OTO TAMAMLAMA
                </h3>

                <p className="text-[10px] text-slate-500 mb-2.5">
                  Her satira <span className="text-slate-300 font-semibold">Isim:Seviye</span> yazin. Ornek: <span className="text-slate-300">Osmiridyum:45</span>
                </p>

                <div className="space-y-2">
                  <textarea
                    value={mineTextInput}
                    onChange={e => setMineTextInput(e.target.value)}
                    rows={4}
                    placeholder="Osmiridyum:45&#10;Mithril:30"
                    className="w-full bg-slate-950/80 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-orange-500/50 placeholder-slate-600 resize-y"
                  />
                  <div className="ac-action-row flex flex-wrap gap-2">
                    <button
                      onClick={handleAddMinesFromText}
                      disabled={mineSaving || !mineTextInput.trim()}
                      className="px-3 py-1.5 bg-orange-800 hover:bg-orange-700 text-white text-[11px] font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Plus size={12} />
                      Metinden Ekle
                    </button>
                    <button
                      onClick={handleExportMines}
                      disabled={mineSaving || managedMines.length === 0}
                      className="px-3 py-1.5 bg-blue-800 hover:bg-blue-700 text-white text-[11px] font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Download size={12} />
                      Disa Aktar
                    </button>
                    <button
                      onClick={handleBulkDeleteMines}
                      disabled={mineSaving || managedMines.length === 0}
                      className="px-3 py-1.5 bg-red-900 hover:bg-red-800 text-white text-[11px] font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Trash2 size={12} />
                      Toplu Sil
                    </button>
                  </div>
                </div>

                <div className="mt-3 rounded-lg border border-slate-700/40 bg-slate-900/50 p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <input
                      type="text"
                      value={mineListSearch}
                      onChange={e => setMineListSearch(e.target.value)}
                      placeholder="Listede ara..."
                      className="flex-1 min-w-0 sm:min-w-[160px] bg-slate-950/80 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-orange-500/50 placeholder-slate-600"
                    />
                    <span className="text-[10px] text-slate-500">{managedMines.length} kayit</span>
                  </div>

                  <div className="max-h-56 overflow-y-auto space-y-1">
                    {filteredManagedMines.length === 0 ? (
                      <div className="text-[11px] text-slate-500 px-2 py-1">Goruntulenecek maden yok.</div>
                    ) : (
                      filteredManagedMines.map(entry => (
                        <div key={entry.name} className="ac-item-row flex flex-wrap sm:flex-nowrap items-start sm:items-center gap-2 bg-slate-950/55 border border-slate-700/40 rounded-md px-2 py-1.5">
                          {editingMine === entry.name ? (
                            <>
                              <input
                                type="text"
                                value={editingMineNameInput}
                                onChange={e => setEditingMineNameInput(e.target.value)}
                                className="flex-1 min-w-0 basis-full sm:basis-auto bg-slate-900/80 border border-slate-600 rounded px-2 py-1 text-xs text-slate-100 outline-none focus:border-orange-500/50"
                              />
                              <input
                                type="number"
                                min="1"
                                max="59"
                                value={editingMineLevelInput}
                                onChange={e => setEditingMineLevelInput(e.target.value)}
                                className="w-16 bg-slate-900/80 border border-slate-600 rounded px-2 py-1 text-xs text-slate-100 outline-none focus:border-orange-500/50"
                              />
                              <button
                                onClick={handleSaveEditedMine}
                                disabled={mineSaving}
                                className="px-2 py-1 bg-emerald-800 hover:bg-emerald-700 text-white text-[10px] font-bold rounded transition-colors disabled:opacity-50 flex items-center gap-1"
                              >
                                <Save size={10} />
                                Kaydet
                              </button>
                              <button
                                onClick={handleCancelEditMine}
                                disabled={mineSaving}
                                className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 text-[10px] font-bold rounded transition-colors disabled:opacity-50"
                              >
                                Vazgec
                              </button>
                            </>
                          ) : (
                            <div className="ac-item-view">
                              <span className="ac-item-name flex-1 min-w-0 text-xs text-slate-200 break-all">{entry.name}</span>
                              <div className="ac-item-actions">
                                <span className="ac-item-lvl px-2 py-0.5 rounded bg-orange-900/35 border border-orange-800/40 text-[10px] text-orange-200 font-bold">Lv.{entry.level}</span>
                                <button
                                  onClick={() => handleStartEditMine(entry)}
                                  disabled={mineSaving}
                                  title="Duzenle"
                                  aria-label="Duzenle"
                                  className="px-2 py-1 bg-blue-900/45 hover:bg-blue-800/55 text-blue-200 text-[10px] font-bold rounded border border-blue-800/40 transition-colors disabled:opacity-50 flex items-center gap-1"
                                >
                                  <Pencil size={10} />
                                </button>
                                <button
                                  onClick={() => handleDeleteMine(entry.name)}
                                  disabled={mineSaving}
                                  title="Sil"
                                  aria-label="Sil"
                                  className="px-2 py-1 bg-red-950/45 hover:bg-red-900/55 text-red-300 text-[10px] font-bold rounded border border-red-900/40 transition-colors disabled:opacity-50 flex items-center gap-1"
                                >
                                  <Trash2 size={10} />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="ac-card bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                <h3 className="text-slate-300 text-xs font-bold mb-3 tracking-wider flex items-center gap-2">
                  <Search size={14} />
                  DIGER OTO TAMAMLAMA
                </h3>

                <p className="text-[10px] text-slate-500 mb-2.5">
                  Her satira <span className="text-slate-300 font-semibold">Isim:Seviye</span> yazin. Ornek: <span className="text-slate-300">Denim:25, Kurt Kurku:37</span>
                </p>

                <div className="space-y-2">
                  <textarea
                    value={otherTextInput}
                    onChange={e => setOtherTextInput(e.target.value)}
                    rows={4}
                    placeholder="Denim:25&#10;Kurt Kurku:37"
                    className="w-full bg-slate-950/80 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-slate-500/60 placeholder-slate-600 resize-y"
                  />
                  <div className="ac-action-row flex flex-wrap gap-2">
                    <button
                      onClick={handleAddOthersFromText}
                      disabled={otherSaving || !otherTextInput.trim()}
                      className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-[11px] font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Plus size={12} />
                      Metinden Ekle
                    </button>
                    <button
                      onClick={handleExportOthers}
                      disabled={otherSaving || managedOthers.length === 0}
                      className="px-3 py-1.5 bg-blue-800 hover:bg-blue-700 text-white text-[11px] font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Download size={12} />
                      Disa Aktar
                    </button>
                    <button
                      onClick={handleBulkDeleteOthers}
                      disabled={otherSaving || managedOthers.length === 0}
                      className="px-3 py-1.5 bg-red-900 hover:bg-red-800 text-white text-[11px] font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Trash2 size={12} />
                      Toplu Sil
                    </button>
                  </div>
                </div>

                <div className="mt-3 rounded-lg border border-slate-700/40 bg-slate-900/50 p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <input
                      type="text"
                      value={otherListSearch}
                      onChange={e => setOtherListSearch(e.target.value)}
                      placeholder="Listede ara..."
                      className="flex-1 min-w-0 sm:min-w-[160px] bg-slate-950/80 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-slate-500/60 placeholder-slate-600"
                    />
                    <span className="text-[10px] text-slate-500">{managedOthers.length} kayit</span>
                  </div>

                  <div className="max-h-56 overflow-y-auto space-y-1">
                    {filteredManagedOthers.length === 0 ? (
                      <div className="text-[11px] text-slate-500 px-2 py-1">Goruntulenecek diger kaydi yok.</div>
                    ) : (
                      filteredManagedOthers.map(entry => (
                        <div key={entry.name} className="ac-item-row flex flex-wrap sm:flex-nowrap items-start sm:items-center gap-2 bg-slate-950/55 border border-slate-700/40 rounded-md px-2 py-1.5">
                          {editingOther === entry.name ? (
                            <>
                              <input
                                type="text"
                                value={editingOtherNameInput}
                                onChange={e => setEditingOtherNameInput(e.target.value)}
                                className="flex-1 min-w-0 basis-full sm:basis-auto bg-slate-900/80 border border-slate-600 rounded px-2 py-1 text-xs text-slate-100 outline-none focus:border-slate-500/60"
                              />
                              <input
                                type="number"
                                min="1"
                                max="59"
                                value={editingOtherLevelInput}
                                onChange={e => setEditingOtherLevelInput(e.target.value)}
                                className="w-16 bg-slate-900/80 border border-slate-600 rounded px-2 py-1 text-xs text-slate-100 outline-none focus:border-slate-500/60"
                              />
                              <button
                                onClick={handleSaveEditedOther}
                                disabled={otherSaving}
                                className="px-2 py-1 bg-emerald-800 hover:bg-emerald-700 text-white text-[10px] font-bold rounded transition-colors disabled:opacity-50 flex items-center gap-1"
                              >
                                <Save size={10} />
                                Kaydet
                              </button>
                              <button
                                onClick={handleCancelEditOther}
                                disabled={otherSaving}
                                className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 text-[10px] font-bold rounded transition-colors disabled:opacity-50"
                              >
                                Vazgec
                              </button>
                            </>
                          ) : (
                            <div className="ac-item-view">
                              <span className="ac-item-name flex-1 min-w-0 text-xs text-slate-200 break-all">{entry.name}</span>
                              <div className="ac-item-actions">
                                <span className="ac-item-lvl px-2 py-0.5 rounded bg-slate-700/40 border border-slate-600/50 text-[10px] text-slate-100 font-bold">Lv.{entry.level}</span>
                                <button
                                  onClick={() => handleStartEditOther(entry)}
                                  disabled={otherSaving}
                                  title="Duzenle"
                                  aria-label="Duzenle"
                                  className="px-2 py-1 bg-blue-900/45 hover:bg-blue-800/55 text-blue-200 text-[10px] font-bold rounded border border-blue-800/40 transition-colors disabled:opacity-50 flex items-center gap-1"
                                >
                                  <Pencil size={10} />
                                </button>
                                <button
                                  onClick={() => handleDeleteOther(entry.name)}
                                  disabled={otherSaving}
                                  title="Sil"
                                  aria-label="Sil"
                                  className="px-2 py-1 bg-red-950/45 hover:bg-red-900/55 text-red-300 text-[10px] font-bold rounded border border-red-900/40 transition-colors disabled:opacity-50 flex items-center gap-1"
                                >
                                  <Trash2 size={10} />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="ac-card bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                <h3 className="text-cyan-300 text-xs font-bold mb-3 tracking-wider flex items-center gap-2">
                  <Search size={14} />
                  GOZLUK OTO TAMAMLAMA
                </h3>

                <p className="text-[10px] text-slate-500 mb-2.5">
                  Her satira <span className="text-slate-300 font-semibold">Isim:Seviye</span> yazin. Ornek: <span className="text-slate-300">Kumlu Gozluk:52</span>
                </p>

                <div className="space-y-2">
                  <textarea
                    value={glassesTextInput}
                    onChange={e => setGlassesTextInput(e.target.value)}
                    rows={4}
                    placeholder="Kumlu Gozluk:52&#10;Canavar Gozlugu:40"
                    className="w-full bg-slate-950/80 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyan-500/50 placeholder-slate-600 resize-y"
                  />
                  <div className="ac-action-row flex flex-wrap gap-2">
                    <button
                      onClick={handleAddGlassesFromText}
                      disabled={glassesSaving || !glassesTextInput.trim()}
                      className="px-3 py-1.5 bg-cyan-800 hover:bg-cyan-700 text-white text-[11px] font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Plus size={12} />
                      Metinden Ekle
                    </button>
                    <button
                      onClick={handleExportGlasses}
                      disabled={glassesSaving || managedGlasses.length === 0}
                      className="px-3 py-1.5 bg-blue-800 hover:bg-blue-700 text-white text-[11px] font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Download size={12} />
                      Disa Aktar
                    </button>
                    <button
                      onClick={handleBulkDeleteGlasses}
                      disabled={glassesSaving || managedGlasses.length === 0}
                      className="px-3 py-1.5 bg-red-900 hover:bg-red-800 text-white text-[11px] font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Trash2 size={12} />
                      Toplu Sil
                    </button>
                  </div>
                </div>

                <div className="mt-3 rounded-lg border border-slate-700/40 bg-slate-900/50 p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <input
                      type="text"
                      value={glassesListSearch}
                      onChange={e => setGlassesListSearch(e.target.value)}
                      placeholder="Listede ara..."
                      className="flex-1 min-w-0 sm:min-w-[160px] bg-slate-950/80 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-cyan-500/50 placeholder-slate-600"
                    />
                    <span className="text-[10px] text-slate-500">{managedGlasses.length} kayit</span>
                  </div>

                  <div className="max-h-56 overflow-y-auto space-y-1">
                    {filteredManagedGlasses.length === 0 ? (
                      <div className="text-[11px] text-slate-500 px-2 py-1">Goruntulenecek gozluk yok.</div>
                    ) : (
                      filteredManagedGlasses.map(entry => (
                        <div key={entry.name} className="ac-item-row flex flex-wrap sm:flex-nowrap items-start sm:items-center gap-2 bg-slate-950/55 border border-slate-700/40 rounded-md px-2 py-1.5">
                          {editingGlasses === entry.name ? (
                            <>
                              <input
                                type="text"
                                value={editingGlassesNameInput}
                                onChange={e => setEditingGlassesNameInput(e.target.value)}
                                className="flex-1 min-w-0 basis-full sm:basis-auto bg-slate-900/80 border border-slate-600 rounded px-2 py-1 text-xs text-slate-100 outline-none focus:border-cyan-500/50"
                              />
                              <input
                                type="number"
                                min="1"
                                max="59"
                                value={editingGlassesLevelInput}
                                onChange={e => setEditingGlassesLevelInput(e.target.value)}
                                className="w-16 bg-slate-900/80 border border-slate-600 rounded px-2 py-1 text-xs text-slate-100 outline-none focus:border-cyan-500/50"
                              />
                              <button
                                onClick={handleSaveEditedGlasses}
                                disabled={glassesSaving}
                                className="px-2 py-1 bg-emerald-800 hover:bg-emerald-700 text-white text-[10px] font-bold rounded transition-colors disabled:opacity-50 flex items-center gap-1"
                              >
                                <Save size={10} />
                                Kaydet
                              </button>
                              <button
                                onClick={handleCancelEditGlasses}
                                disabled={glassesSaving}
                                className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 text-[10px] font-bold rounded transition-colors disabled:opacity-50"
                              >
                                Vazgec
                              </button>
                            </>
                          ) : (
                            <div className="ac-item-view">
                              <span className="ac-item-name flex-1 min-w-0 text-xs text-slate-200 break-all">{entry.name}</span>
                              <div className="ac-item-actions">
                                <span className="ac-item-lvl px-2 py-0.5 rounded bg-cyan-900/35 border border-cyan-800/40 text-[10px] text-cyan-200 font-bold">Lv.{entry.level}</span>
                                <button
                                  onClick={() => handleStartEditGlasses(entry)}
                                  disabled={glassesSaving}
                                  title="Duzenle"
                                  aria-label="Duzenle"
                                  className="px-2 py-1 bg-blue-900/45 hover:bg-blue-800/55 text-blue-200 text-[10px] font-bold rounded border border-blue-800/40 transition-colors disabled:opacity-50 flex items-center gap-1"
                                >
                                  <Pencil size={10} />
                                </button>
                                <button
                                  onClick={() => handleDeleteGlasses(entry.name)}
                                  disabled={glassesSaving}
                                  title="Sil"
                                  aria-label="Sil"
                                  className="px-2 py-1 bg-red-950/45 hover:bg-red-900/55 text-red-300 text-[10px] font-bold rounded border border-red-900/40 transition-colors disabled:opacity-50 flex items-center gap-1"
                                >
                                  <Trash2 size={10} />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="ac-card bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                <h3 className="text-violet-300 text-xs font-bold mb-3 tracking-wider flex items-center gap-2">
                  <Search size={14} />
                  TILSIM OTO TAMAMLAMA
                </h3>

                <p className="text-[10px] text-slate-500 mb-2.5">
                  Her satira <span className="text-slate-300 font-semibold">Isim:Renk:Sinif</span> yazin. Ornek: <span className="text-slate-300">Asit Saldirisi 1:Kirmizi:Sifaci</span>
                </p>

                <div className="space-y-2">
                  <textarea
                    value={talismanTextInput}
                    onChange={e => setTalismanTextInput(e.target.value)}
                    rows={4}
                    placeholder="Asit Saldirisi 1:Kirmizi:Sifaci&#10;Asit Saldirisi 2:Mavi:Sifaci&#10;Direnc Kirma Alani 1:Mavi:Buyucu"
                    className="w-full bg-slate-950/80 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-violet-500/50 placeholder-slate-600 resize-y"
                  />
                  <div className="ac-action-row flex flex-wrap gap-2">
                    <button
                      onClick={handleAddTalismansFromText}
                      disabled={talismanSaving || !talismanTextInput.trim()}
                      className="px-3 py-1.5 bg-violet-800 hover:bg-violet-700 text-white text-[11px] font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Plus size={12} />
                      Metinden Ekle
                    </button>
                    <button
                      onClick={handleExportTalismans}
                      disabled={talismanSaving || managedTalismans.length === 0}
                      className="px-3 py-1.5 bg-blue-800 hover:bg-blue-700 text-white text-[11px] font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Download size={12} />
                      Disa Aktar
                    </button>
                    <button
                      onClick={handleBulkDeleteTalismans}
                      disabled={talismanSaving || managedTalismans.length === 0}
                      className="px-3 py-1.5 bg-red-900 hover:bg-red-800 text-white text-[11px] font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Trash2 size={12} />
                      Toplu Sil
                    </button>
                  </div>
                </div>

                <div className="mt-3 rounded-lg border border-slate-700/40 bg-slate-900/50 p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <input
                      type="text"
                      value={talismanListSearch}
                      onChange={e => setTalismanListSearch(e.target.value)}
                      placeholder="Listede ara..."
                      className="flex-1 min-w-0 sm:min-w-[160px] bg-slate-950/80 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-violet-500/50 placeholder-slate-600"
                    />
                    <span className="text-[10px] text-slate-500">{managedTalismans.length} kayit</span>
                  </div>

                  <div className="max-h-56 overflow-y-auto space-y-1">
                    {filteredManagedTalismans.length === 0 ? (
                      <div className="text-[11px] text-slate-500 px-2 py-1">Goruntulenecek tilsim yok.</div>
                    ) : (
                      filteredManagedTalismans.map(entry => (
                        <div key={`${entry.name}|${entry.color}|${entry.heroClass}`} className="ac-item-row flex flex-wrap sm:flex-nowrap items-start sm:items-center gap-2 bg-slate-950/55 border border-slate-700/40 rounded-md px-2 py-1.5">
                          {editingTalisman === `${entry.name}|${entry.color}|${entry.heroClass}` ? (
                            <>
                              <input
                                type="text"
                                value={editingTalismanNameInput}
                                onChange={e => setEditingTalismanNameInput(e.target.value)}
                                className="flex-1 min-w-0 basis-full sm:basis-auto bg-slate-900/80 border border-slate-600 rounded px-2 py-1 text-xs text-slate-100 outline-none focus:border-violet-500/50"
                              />
                              <select
                                value={editingTalismanColorInput}
                                onChange={e => setEditingTalismanColorInput(e.target.value as TalismanColor)}
                                className="w-[86px] bg-slate-900/80 border border-slate-600 rounded px-1.5 py-1 text-xs text-slate-100 outline-none focus:border-violet-500/50"
                              >
                                <option value="Mavi">Mavi</option>
                                <option value="Kırmızı">Kırmızı</option>
                              </select>
                              <select
                                value={editingTalismanClassInput}
                                onChange={e => setEditingTalismanClassInput(e.target.value as TalismanHeroClass)}
                                className="w-[92px] bg-slate-900/80 border border-slate-600 rounded px-1.5 py-1 text-xs text-slate-100 outline-none focus:border-violet-500/50"
                              >
                                <option value="Savaşçı">Savaşçı</option>
                                <option value="Büyücü">Büyücü</option>
                                <option value="Şifacı">Şifacı</option>
                              </select>
                              <button
                                onClick={handleSaveEditedTalisman}
                                disabled={talismanSaving}
                                className="px-2 py-1 bg-emerald-800 hover:bg-emerald-700 text-white text-[10px] font-bold rounded transition-colors disabled:opacity-50 flex items-center gap-1"
                              >
                                <Save size={10} />
                                Kaydet
                              </button>
                              <button
                                onClick={handleCancelEditTalisman}
                                disabled={talismanSaving}
                                className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 text-[10px] font-bold rounded transition-colors disabled:opacity-50"
                              >
                                Vazgec
                              </button>
                            </>
                          ) : (
                            <div className="ac-item-view">
                              <span className="ac-item-name flex-1 min-w-0 text-xs text-slate-200 break-all">{entry.name}</span>
                              <div className="ac-item-actions">
                              <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${entry.color === 'Kırmızı' ? 'bg-red-900/35 border-red-800/45 text-red-200' : 'bg-blue-900/35 border-blue-800/45 text-blue-200'}`}>{entry.color}</span>
                              <span className="ac-item-meta px-2 py-0.5 rounded bg-violet-900/35 border border-violet-800/45 text-[10px] text-violet-200 font-bold">{entry.heroClass}</span>
                              <button
                                onClick={() => handleStartEditTalisman(entry)}
                                disabled={talismanSaving}
                                title="Duzenle"
                                aria-label="Duzenle"
                                className="px-2 py-1 bg-blue-900/45 hover:bg-blue-800/55 text-blue-200 text-[10px] font-bold rounded border border-blue-800/40 transition-colors disabled:opacity-50 flex items-center gap-1"
                              >
                                <Pencil size={10} />
                              </button>
                              <button
                                onClick={() => handleDeleteTalisman(entry)}
                                disabled={talismanSaving}
                                title="Sil"
                                aria-label="Sil"
                                className="px-2 py-1 bg-red-950/45 hover:bg-red-900/55 text-red-300 text-[10px] font-bold rounded border border-red-900/40 transition-colors disabled:opacity-50 flex items-center gap-1"
                              >
                                <Trash2 size={10} />
                              </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="bg-slate-900 p-0.5 flex justify-center text-[8px] md:text-[9px] text-slate-600 border-t border-red-900/30 shrink-0">
          <span>ADMiN PANELi • {allUsers.length} Kullanıcı • {totalItems} Eşya • {globalItemCount} Global</span>
        </div>
      </div>
    </div>
  );
};

// Stat card sub-component
const StatCard: React.FC<{ label: string; value: number; color: string; bg: string }> = ({ label, value, color, bg }) => (
  <div className={`bg-gradient-to-br ${bg} border border-slate-700/50 rounded-xl p-4 text-center`}>
    <div className={`text-2xl md:text-3xl font-bold ${color}`}>{value.toLocaleString('tr-TR')}</div>
    <div className="text-[10px] text-slate-500 mt-1 font-bold tracking-wider">{label}</div>
  </div>
);

