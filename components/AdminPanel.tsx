import React, { useState, useEffect, useMemo } from 'react';
import { AdminUserInfo, SearchLimitsConfig, Account, UserPermissions, UserBlockInfo, UserClass, DEFAULT_USER_CLASS, normalizeUserClass, resolveUserClassQuotas, USER_CLASS_KEYS } from '../types';
import { Shield, ArrowLeft, Users, Settings, BarChart3, Search, Trash2, Crown, Plus, X, Loader2, ChevronDown, ChevronUp, AlertTriangle, RotateCcw, Lock, Unlock, MessageCircle, UserX, UserCheck, AtSign, Upload, Pencil, Save } from 'lucide-react';
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
  const [managedPotions, setManagedPotions] = useState<string[]>([]);
  const [potionTextInput, setPotionTextInput] = useState('');
  const [potionListSearch, setPotionListSearch] = useState('');
  const [editingPotion, setEditingPotion] = useState<string | null>(null);
  const [editingPotionInput, setEditingPotionInput] = useState('');
  const [potionSaving, setPotionSaving] = useState(false);
  const [potionImporting, setPotionImporting] = useState(false);
  const potionImportInputRef = React.useRef<HTMLInputElement | null>(null);

  // Users tab
  const [userSearch, setUserSearch] = useState('');
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

  // Fetch all data on mount
  useEffect(() => {
    fetchAllData();
  }, []);

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

  const extractEnchantmentNamesFromText = (rawText: string): string[] => {
    const sanitized = rawText.replace(/^\uFEFF/, '');
    const values: string[] = [];

    sanitized.split(/\r?\n/).forEach(line => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return;

      const cells = trimmedLine
        .split(/[;,\t]/)
        .map(cell => cell.trim().replace(/^"|"$/g, ''));
      const candidate = (cells.find(cell => cell !== '') || '').trim();
      if (!candidate) return;

      const token = candidate.toLocaleLowerCase('tr');
      if (token === 'efsun' || token === 'enchantment' || token === 'name' || token === 'iksir' || token === 'potion') return;
      values.push(candidate);
    });

    return toUniqueSortedEnchantments(values);
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

  const saveManagedPotions = async (nextNames: string[]): Promise<boolean> => {
    const normalizedNames = toUniqueSortedEnchantments(nextNames);
    setPotionSaving(true);
    try {
      await setDoc(doc(db, "metadata", "potions"), {
        names: normalizedNames,
        updatedAt: Date.now(),
      }, { merge: true });
      setManagedPotions(normalizedNames);
      return true;
    } catch (error) {
      console.error("Iksir onerileri kaydetme hatasi:", error);
      alert("Iksir onerileri kaydedilirken hata olustu.");
      return false;
    } finally {
      setPotionSaving(false);
    }
  };

  const fetchAllData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // Fetch all users
      const usersSnap = await getDocs(collection(db, "users"));
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

      // Fetch global items stats
      const globalSnap = await getDocs(collection(db, "globalItems"));
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

      // Fetch admin list
      try {
        const adminsDoc = await getDoc(doc(db, "metadata", "admins"));
        if (adminsDoc.exists()) {
          setAdminEmails(adminsDoc.data().emails || []);
        }
      } catch { /* no admins doc yet */ }

      // Fetch managed enchantment suggestions
      try {
        const enchantmentsDoc = await getDoc(doc(db, "metadata", "enchantments"));
        if (enchantmentsDoc.exists()) {
          const rawNames = enchantmentsDoc.data().names;
          const names = Array.isArray(rawNames)
            ? rawNames.filter((value): value is string => typeof value === 'string')
            : [];
          setManagedEnchantments(toUniqueSortedEnchantments(names));
        } else {
          setManagedEnchantments([]);
        }
      } catch {
        setManagedEnchantments([]);
      }

      // Fetch managed potion suggestions
      try {
        const potionsDoc = await getDoc(doc(db, "metadata", "potions"));
        if (potionsDoc.exists()) {
          const rawNames = potionsDoc.data().names;
          const names = Array.isArray(rawNames)
            ? rawNames.filter((value): value is string => typeof value === 'string')
            : [];
          setManagedPotions(toUniqueSortedEnchantments(names));
        } else {
          setManagedPotions([]);
        }
      } catch {
        setManagedPotions([]);
      }

      // Fetch search limits
      try {
        const limitsDoc = await getDoc(doc(db, "metadata", "searchLimits"));
        if (limitsDoc.exists()) {
          const data = limitsDoc.data();
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
          setUserSearchOverrideInputs(users.reduce<Record<string, string>>((acc, userInfo) => {
            const overrideValue = resolvedOverrides[userInfo.uid];
            acc[userInfo.uid] = overrideValue !== undefined ? String(overrideValue) : '';
            return acc;
          }, {}));
        } else {
          setSearchLimits({ defaultLimit: 50, userOverrides: {}, classLimits: defaultClassLimits });
          setClassLimitInputs(toClassLimitInputs(defaultClassLimits));
          setUserSearchOverrideInputs(users.reduce<Record<string, string>>((acc, userInfo) => {
            acc[userInfo.uid] = '';
            return acc;
          }, {}));
        }
      } catch {
        setSearchLimits({ defaultLimit: 50, userOverrides: {}, classLimits: defaultClassLimits });
        setClassLimitInputs(toClassLimitInputs(defaultClassLimits));
        setUserSearchOverrideInputs(users.reduce<Record<string, string>>((acc, userInfo) => {
          acc[userInfo.uid] = '';
          return acc;
        }, {}));
      }

      // Fetch global messaging setting
      try {
        const messageSettingsDoc = await getDoc(doc(db, "metadata", "messageSettings"));
        if (messageSettingsDoc.exists()) {
          const data = messageSettingsDoc.data() as { directMessagesEnabled?: unknown };
          setDirectMessagingEnabled(data.directMessagesEnabled !== false);
        } else {
          setDirectMessagingEnabled(true);
        }
      } catch {
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

  // User search filter
  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return allUsers;
    const q = userSearch.toLocaleLowerCase('tr');
    return allUsers.filter(u =>
      (u.username || '').toLocaleLowerCase('tr').includes(q) ||
      u.email.toLocaleLowerCase('tr').includes(q) ||
      u.uid.toLocaleLowerCase('tr').includes(q)
    );
  }, [allUsers, userSearch]);

  const filteredManagedEnchantments = useMemo(() => {
    const queryText = enchantmentListSearch.trim().toLocaleLowerCase('tr');
    if (!queryText) return managedEnchantments;
    return managedEnchantments.filter(name => name.toLocaleLowerCase('tr').includes(queryText));
  }, [managedEnchantments, enchantmentListSearch]);

  const filteredManagedPotions = useMemo(() => {
    const queryText = potionListSearch.trim().toLocaleLowerCase('tr');
    if (!queryText) return managedPotions;
    return managedPotions.filter(name => name.toLocaleLowerCase('tr').includes(queryText));
  }, [managedPotions, potionListSearch]);

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

  const handleOpenPotionImportPicker = () => {
    potionImportInputRef.current?.click();
  };

  const handleAddPotionsFromText = async () => {
    const parsedNames = extractEnchantmentNamesFromText(potionTextInput);
    if (parsedNames.length === 0) {
      alert("Eklenebilir iksir adi bulunamadi. Her satira bir isim yazin.");
      return;
    }

    const merged = toUniqueSortedEnchantments([...managedPotions, ...parsedNames]);
    if (merged.length === managedPotions.length) {
      alert("Listede zaten mevcut olan isimler girildi.");
      return;
    }

    const saved = await saveManagedPotions(merged);
    if (saved) {
      setPotionTextInput('');
    }
  };

  const handleImportPotionsFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setPotionImporting(true);
    try {
      const fileNameLower = file.name.toLocaleLowerCase();
      if (!fileNameLower.endsWith('.csv') && !fileNameLower.endsWith('.txt')) {
        alert("Su an sadece CSV/TXT import destekleniyor. Excel dosyanizi CSV olarak kaydedip tekrar yukleyin.");
        return;
      }

      const rawText = await file.text();
      const parsedNames = extractEnchantmentNamesFromText(rawText);
      if (parsedNames.length === 0) {
        alert("Dosyada eklenebilir iksir adi bulunamadi.");
        return;
      }

      const merged = toUniqueSortedEnchantments([...managedPotions, ...parsedNames]);
      if (merged.length === managedPotions.length) {
        alert("Dosyadaki tum isimler zaten listede mevcut.");
        return;
      }

      await saveManagedPotions(merged);
    } finally {
      event.target.value = '';
      setPotionImporting(false);
    }
  };

  const handleStartEditPotion = (name: string) => {
    setEditingPotion(name);
    setEditingPotionInput(name);
  };

  const handleCancelEditPotion = () => {
    setEditingPotion(null);
    setEditingPotionInput('');
  };

  const handleSaveEditedPotion = async () => {
    if (!editingPotion) return;
    const nextValue = normalizeEnchantmentName(editingPotionInput);
    if (!nextValue) {
      alert("Iksir adi bos birakilamaz.");
      return;
    }

    const nextList = managedPotions.map(name => (
      name === editingPotion ? nextValue : name
    ));
    const saved = await saveManagedPotions(nextList);
    if (saved) {
      handleCancelEditPotion();
    }
  };

  const handleDeletePotion = async (name: string) => {
    const nextList = managedPotions.filter(itemName => itemName !== name);
    await saveManagedPotions(nextList);
    if (editingPotion === name) {
      handleCancelEditPotion();
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

  return (
    <div className="min-h-screen w-screen bg-slate-950 md:bg-gradient-to-br md:from-slate-950 md:via-slate-900 md:to-slate-950 flex md:items-center md:justify-center md:h-screen md:overflow-hidden">
      <div className="w-full md:w-[98vw] min-h-screen md:min-h-0 md:h-[98vh] bg-slate-900/95 border-0 md:border-2 md:border-red-900/50 rounded-none md:rounded-lg shadow-none md:shadow-[0_0_50px_rgba(220,38,38,0.15)] md:overflow-hidden flex flex-col">

        {/* Header */}
        <div className="bg-gradient-to-r from-red-950/80 via-slate-800 to-red-950/80 px-4 py-3 flex items-center gap-3 border-b-2 border-red-900/50 shrink-0">
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
          <button onClick={fetchAllData} className="text-[10px] text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-700 transition-colors">
            Yenile
          </button>
        </div>

        {/* Tabs */}
        <div className="bg-slate-800/60 px-4 py-1.5 flex gap-1.5 border-b border-slate-700/50 shrink-0">
          {([
            { key: 'dashboard' as TabType, label: 'Panel', icon: BarChart3 },
            { key: 'users' as TabType, label: 'Kullanıcılar', icon: Users },
            { key: 'settings' as TabType, label: 'Ayarlar', icon: Settings },
            { key: 'autocomplete' as TabType, label: 'Oto Tamamlama', icon: Search },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
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
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">

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
            <div className="space-y-4 max-w-2xl mx-auto">

              {/* Admin Management */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                <h3 className="text-red-400 text-xs font-bold mb-3 tracking-wider flex items-center gap-2">
                  <Crown size={14} />
                  ADMiN YÖNETiMi
                </h3>

                {/* Permanent admin */}
                <div className="mb-3 space-y-1.5">
                  <div className="flex items-center gap-2 bg-slate-900/50 rounded-lg px-3 py-2 border border-slate-700/30">
                    <Shield size={14} className="text-yellow-500 shrink-0" />
                    <span className="text-sm text-slate-200 flex-1">yvzsltn61@gmail.com</span>
                    <span className="text-[9px] text-yellow-500 bg-yellow-900/30 px-2 py-0.5 rounded-full border border-yellow-700/30">Kalıcı Yönetici</span>
                  </div>

                  {adminEmails.filter(e => e !== 'yvzsltn61@gmail.com').map(email => (
                    <div key={email} className="flex items-center gap-2 bg-slate-900/50 rounded-lg px-3 py-2 border border-slate-700/30">
                      <Crown size={14} className="text-red-400 shrink-0" />
                      <span className="text-sm text-slate-200 flex-1">{email}</span>
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
                    className="flex-1 bg-slate-950/80 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-red-500/50 placeholder-slate-600"
                  />
                  <button
                    onClick={handleAddAdmin}
                    disabled={adminLoading || !newAdminEmail.trim()}
                    className="px-4 py-2 bg-red-800 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Plus size={14} />
                    Ekle
                  </button>
                </div>
              </div>

              {/* Messaging System */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                <h3 className="text-cyan-400 text-xs font-bold mb-3 tracking-wider flex items-center gap-2">
                  <MessageCircle size={14} />
                  MESAJLASMA SiSTEMi
                </h3>

                <div className="flex items-center justify-between gap-3 bg-slate-900/50 rounded-lg border border-slate-700/40 px-3 py-2.5">
                  <div className="text-[11px]">
                    <p className="text-slate-200 font-semibold">Kullanici Mesajlasmasi</p>
                    <p className="text-[10px] text-slate-500">Kapaliyken sadece yoneticiler mesaj gonderebilir.</p>
                  </div>
                  <button
                    onClick={handleToggleMessagingSystem}
                    disabled={messageSystemSaving}
                    className={`px-2.5 py-1.5 rounded-md text-[10px] font-bold border transition-colors flex items-center gap-1 ${directMessagingEnabled ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/50 hover:bg-emerald-900/40' : 'bg-red-950/40 text-red-300 border-red-900/50 hover:bg-red-900/40'} disabled:opacity-50`}
                  >
                    {directMessagingEnabled ? <Unlock size={11} /> : <Lock size={11} />}
                    {messageSystemSaving ? 'Kaydediliyor...' : (directMessagingEnabled ? 'Acik' : 'Kapali')}
                  </button>
                </div>
              </div>

              {/* Limit Settings */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                <h3 className="text-emerald-400 text-xs font-bold mb-3 tracking-wider flex items-center gap-2">
                  <Search size={14} />
                  LiMiT AYARLARI
                </h3>

                <div className="space-y-2.5">
                  {USER_CLASS_KEYS.map(classKey => {
                    const classInfo = searchLimits.classLimits[classKey];
                    return (
                      <div key={classKey} className="rounded-lg border border-slate-700/40 bg-slate-900/50 px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <p className="text-[11px] font-semibold text-slate-200">{classInfo.label}</p>
                          <p className="text-[10px] text-slate-500 uppercase tracking-wide">Gunluk limitler</p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-slate-500 font-bold block mb-1">GLOBAL ARAMA</label>
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
                              className="w-full bg-slate-950/80 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500/50"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-500 font-bold block mb-1">MESAJ</label>
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
                              className="w-full bg-slate-950/80 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500/50"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="text-[10px] text-slate-500">
                    Kullanici bazli global arama override ayarlari <span className="text-slate-200 font-semibold">Kullanicilar</span> sekmesinde kalmaya devam eder.
                  </div>
                  <button
                    onClick={handleSaveClassLimits}
                    disabled={limitSaving}
                    className="px-4 py-2 bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
                  >
                    {limitSaving ? 'Kaydediliyor...' : 'Limitleri Kaydet'}
                  </button>
                </div>

              </div>
            </div>
          )}

          {/* AUTOCOMPLETE TAB */}
          {activeTab === 'autocomplete' && (
            <div className="space-y-4 max-w-2xl mx-auto">
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
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
                  <div className="flex flex-wrap gap-2">
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
                  </div>
                </div>

                <div className="mt-3 rounded-lg border border-slate-700/40 bg-slate-900/50 p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <input
                      type="text"
                      value={enchantmentListSearch}
                      onChange={e => setEnchantmentListSearch(e.target.value)}
                      placeholder="Listede ara..."
                      className="flex-1 min-w-[160px] bg-slate-950/80 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-amber-500/50 placeholder-slate-600"
                    />
                    <span className="text-[10px] text-slate-500">{managedEnchantments.length} kayit</span>
                  </div>

                  <div className="max-h-56 overflow-y-auto space-y-1">
                    {filteredManagedEnchantments.length === 0 ? (
                      <div className="text-[11px] text-slate-500 px-2 py-1">Goruntulenecek efsun yok.</div>
                    ) : (
                      filteredManagedEnchantments.map(name => (
                        <div key={name} className="flex items-center gap-2 bg-slate-950/55 border border-slate-700/40 rounded-md px-2 py-1.5">
                          {editingEnchantment === name ? (
                            <>
                              <input
                                type="text"
                                value={editingEnchantmentInput}
                                onChange={e => setEditingEnchantmentInput(e.target.value)}
                                className="flex-1 bg-slate-900/80 border border-slate-600 rounded px-2 py-1 text-xs text-slate-100 outline-none focus:border-amber-500/50"
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
                            <>
                              <span className="flex-1 text-xs text-slate-200 break-all">{name}</span>
                              <button
                                onClick={() => handleStartEditEnchantment(name)}
                                disabled={enchantmentSaving || enchantmentImporting}
                                className="px-2 py-1 bg-blue-900/45 hover:bg-blue-800/55 text-blue-200 text-[10px] font-bold rounded border border-blue-800/40 transition-colors disabled:opacity-50 flex items-center gap-1"
                              >
                                <Pencil size={10} />
                                Duzenle
                              </button>
                              <button
                                onClick={() => handleDeleteEnchantment(name)}
                                disabled={enchantmentSaving || enchantmentImporting}
                                className="px-2 py-1 bg-red-950/45 hover:bg-red-900/55 text-red-300 text-[10px] font-bold rounded border border-red-900/40 transition-colors disabled:opacity-50"
                              >
                                Sil
                              </button>
                            </>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                <input
                  ref={potionImportInputRef}
                  type="file"
                  accept=".csv,.txt,text/csv,text/plain"
                  className="hidden"
                  onChange={handleImportPotionsFile}
                />

                <h3 className="text-emerald-300 text-xs font-bold mb-3 tracking-wider flex items-center gap-2">
                  <Search size={14} />
                  IKSIR OTO TAMAMLAMA
                </h3>

                <p className="text-[10px] text-slate-500 mb-2.5">
                  Bu listedeki isimler iksir ekleme ekranindaki Iksir Ismi alaninda otomatik onerilerde gorunur.
                </p>

                <div className="space-y-2">
                  <textarea
                    value={potionTextInput}
                    onChange={e => setPotionTextInput(e.target.value)}
                    rows={4}
                    placeholder="Her satira bir iksir yazin. Ornek:&#10;Yasam Iksiri&#10;Mana Iksiri"
                    className="w-full bg-slate-950/80 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-emerald-500/50 placeholder-slate-600 resize-y"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleAddPotionsFromText}
                      disabled={potionSaving || potionImporting || !potionTextInput.trim()}
                      className="px-3 py-1.5 bg-emerald-800 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Plus size={12} />
                      Metinden Ekle
                    </button>
                    <button
                      onClick={handleOpenPotionImportPicker}
                      disabled={potionSaving || potionImporting}
                      className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-100 text-[11px] font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Upload size={12} />
                      {potionImporting ? 'Import...' : 'CSV/TXT Import'}
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
                      className="flex-1 min-w-[160px] bg-slate-950/80 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-emerald-500/50 placeholder-slate-600"
                    />
                    <span className="text-[10px] text-slate-500">{managedPotions.length} kayit</span>
                  </div>

                  <div className="max-h-56 overflow-y-auto space-y-1">
                    {filteredManagedPotions.length === 0 ? (
                      <div className="text-[11px] text-slate-500 px-2 py-1">Goruntulenecek iksir yok.</div>
                    ) : (
                      filteredManagedPotions.map(name => (
                        <div key={name} className="flex items-center gap-2 bg-slate-950/55 border border-slate-700/40 rounded-md px-2 py-1.5">
                          {editingPotion === name ? (
                            <>
                              <input
                                type="text"
                                value={editingPotionInput}
                                onChange={e => setEditingPotionInput(e.target.value)}
                                className="flex-1 bg-slate-900/80 border border-slate-600 rounded px-2 py-1 text-xs text-slate-100 outline-none focus:border-emerald-500/50"
                              />
                              <button
                                onClick={handleSaveEditedPotion}
                                disabled={potionSaving || potionImporting}
                                className="px-2 py-1 bg-emerald-800 hover:bg-emerald-700 text-white text-[10px] font-bold rounded transition-colors disabled:opacity-50 flex items-center gap-1"
                              >
                                <Save size={10} />
                                Kaydet
                              </button>
                              <button
                                onClick={handleCancelEditPotion}
                                disabled={potionSaving || potionImporting}
                                className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 text-[10px] font-bold rounded transition-colors disabled:opacity-50"
                              >
                                Vazgec
                              </button>
                            </>
                          ) : (
                            <>
                              <span className="flex-1 text-xs text-slate-200 break-all">{name}</span>
                              <button
                                onClick={() => handleStartEditPotion(name)}
                                disabled={potionSaving || potionImporting}
                                className="px-2 py-1 bg-blue-900/45 hover:bg-blue-800/55 text-blue-200 text-[10px] font-bold rounded border border-blue-800/40 transition-colors disabled:opacity-50 flex items-center gap-1"
                              >
                                <Pencil size={10} />
                                Duzenle
                              </button>
                              <button
                                onClick={() => handleDeletePotion(name)}
                                disabled={potionSaving || potionImporting}
                                className="px-2 py-1 bg-red-950/45 hover:bg-red-900/55 text-red-300 text-[10px] font-bold rounded border border-red-900/40 transition-colors disabled:opacity-50"
                              >
                                Sil
                              </button>
                            </>
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
