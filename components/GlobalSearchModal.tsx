import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Account, ItemData, CATEGORY_OPTIONS, SetItemLocation, GlobalSetInfo, UserRole, normalizeUserClass, resolveUserClassQuotas, shouldShowBoundMarker, createSetEnchantmentKey } from '../types';
import { Search, MapPin, X, ArrowRight, Package, Filter, ChevronDown, ChevronUp, RotateCcw, Book, FileSpreadsheet, Globe, User, Loader2, ExternalLink, Sword, Layers, AlertTriangle } from 'lucide-react';
import { CATEGORY_COLORS, CLASS_COLORS, HERO_CLASSES, GENDER_OPTIONS, SET_CATEGORIES } from '../constants';
import { getContainerSlotPosition } from '../containerLayout';
import { SetDetailModal } from './SetDetailModal';
import { db } from '../firebase';
import { collection, getDocs, query as fsQuery, where, limit, QueryConstraint, doc, getDoc, runTransaction } from 'firebase/firestore';

interface SearchResult {
  accountId: string;
  accountName: string;
  serverIndex: number;
  serverName: string;
  charId: number;
  charName: string;
  containerId: string;
  containerName: string;
  containerKey: 'bank1' | 'bank2' | 'bag' | 'learned';
  slotId: number;
  row: number;
  col: number;
  item: ItemData;
}

interface GlobalItemDoc {
  docId?: string;
  uid: string;
  username: string;
  accountName: string;
  serverName: string;
  charName: string;
  containerName: string;
  item: ItemData;
  updatedAt: number;
  socialLink?: string;
}

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: Account[];
  onNavigate: (accountId: string, serverIndex: number, charIndex: number, viewIndex: number, openBook?: boolean) => void;
  globalSetLookup: Map<string, GlobalSetInfo>;
  globalSetMap: Map<string, SetItemLocation[]>;
  currentUserUid?: string;
  currentUserRole?: UserRole;
  canUseGlobalSearch?: boolean;
}

type GlobalModalAlert = {
  title: string;
  message: string;
};

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({ isOpen, onClose, accounts, onNavigate, globalSetLookup, globalSetMap, currentUserUid, currentUserRole, canUseGlobalSearch = true }) => {
  const MIN_GLOBAL_SEARCH_CHARS = 4;
  const SAME_RESULTS_FREE_WINDOW_MS = 300000;
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'local' | 'global'>('local');

  // Global search states
  const [globalItems, setGlobalItems] = useState<GlobalItemDoc[]>([]);
  const [globalLoading, setGlobalLoading] = useState(false);

  // Filter States
  const [showFilters, setShowFilters] = useState(false);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [filterGender, setFilterGender] = useState('');
  const [filterMinLevel, setFilterMinLevel] = useState<string>('');
  const [filterMaxLevel, setFilterMaxLevel] = useState<string>('');
  const [filterType, setFilterType] = useState<'All' | 'Item' | 'Recipe'>('All');
  const [filterRecipeStatus, setFilterRecipeStatus] = useState<'All' | 'Read' | 'Unread'>('All');

  // Search limit states
  const [searchLimitReached, setSearchLimitReached] = useState(false);
  const [searchLimitMessage, setSearchLimitMessage] = useState('');
  const [searchLimitTotal, setSearchLimitTotal] = useState<number | null>(null);
  const [searchLimitUsed, setSearchLimitUsed] = useState(0);
  const [searchResetAt, setSearchResetAt] = useState<number | null>(null);
  const [searchResetCountdown, setSearchResetCountdown] = useState('');
  const globalSearchChargeCacheRef = useRef<Map<string, { signature: string; expiresAt: number }>>(new Map());
  const globalSearchEnabled = canUseGlobalSearch;
  const [modalAlert, setModalAlert] = useState<GlobalModalAlert | null>(null);

  const getLocalDayKey = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const getNextLocalMidnight = () => {
    const next = new Date();
    next.setHours(24, 0, 0, 0);
    return next.getTime();
  };

  const formatDuration = (ms: number) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours}s ${minutes}d ${seconds}sn`;
  };

  const updateQuotaState = (limitValue: number, usedValue: number) => {
    const normalizedLimit = Math.max(1, Math.floor(limitValue || 50));
    const normalizedUsed = Math.max(0, usedValue);
    const remaining = Math.max(0, normalizedLimit - normalizedUsed);
    const nextReset = getNextLocalMidnight();

    setSearchLimitTotal(normalizedLimit);
    setSearchLimitUsed(normalizedUsed);
    setSearchResetAt(nextReset);
    setSearchLimitReached(remaining <= 0);
    setSearchLimitMessage(
      remaining <= 0
        ? `Bugun global arama hakkiniz bitti. Yenilenmesine ${formatDuration(nextReset - Date.now())} kaldi.`
      : `${remaining} adet hakkiniz kaldi.`
    );
  };

  const refreshQuota = async (consumeOne: boolean) => {
    if (!globalSearchEnabled) {
      setSearchLimitReached(true);
      setSearchLimitMessage('Global arama yetkiniz admin tarafindan devre disi birakildi.');
      setSearchLimitTotal(null);
      setSearchLimitUsed(0);
      setSearchResetAt(null);
      setSearchResetCountdown('');
      return { allowed: false };
    }

    if (currentUserRole === 'admin') {
      setSearchLimitReached(false);
      setSearchLimitMessage('');
      setSearchLimitTotal(null);
      setSearchLimitUsed(0);
      setSearchResetAt(null);
      setSearchResetCountdown('');
      return { allowed: true };
    }

    if (!currentUserUid) return { allowed: true };

    let defaultLimit = 50;
    let overrideLimit: number | null = null;
    let classLimits = resolveUserClassQuotas(null);
    try {
      const limitsDoc = await getDoc(doc(db, "metadata", "searchLimits"));
      if (limitsDoc.exists()) {
        const limitsData = limitsDoc.data();
        if (typeof limitsData.defaultLimit === 'number' && Number.isFinite(limitsData.defaultLimit) && limitsData.defaultLimit > 0) {
          defaultLimit = Math.floor(limitsData.defaultLimit);
        }
        const userOverrides = (limitsData.userOverrides && typeof limitsData.userOverrides === 'object')
          ? limitsData.userOverrides as Record<string, number>
          : {};
        if (typeof userOverrides[currentUserUid] === 'number' && Number.isFinite(userOverrides[currentUserUid]) && userOverrides[currentUserUid] > 0) {
          overrideLimit = Math.floor(userOverrides[currentUserUid]);
        }
        classLimits = resolveUserClassQuotas(limitsData.classLimits);
      }
    } catch {
      // If limits cannot be read, continue with default limit.
    }

    const userRef = doc(db, "users", currentUserUid);
    const todayKey = getLocalDayKey();
    const resolveLimitFromUserData = (userData: { userClass?: unknown }) => {
      if (overrideLimit !== null) return overrideLimit;
      const resolvedClass = normalizeUserClass(userData.userClass);
      const classLimit = classLimits[resolvedClass].dailyGlobalSearchLimit;
      return (typeof classLimit === 'number' && Number.isFinite(classLimit) && classLimit > 0)
        ? classLimit
        : defaultLimit;
    };

    if (consumeOne) {
      try {
        const txnResult = await runTransaction(db, async (transaction) => {
          const snap = await transaction.get(userRef);
          const data = snap.exists()
            ? snap.data() as { userClass?: unknown; searchQuota?: { global?: { day?: string; used?: number } } }
            : {};
          const resolvedLimit = resolveLimitFromUserData(data);
          const quota = (data?.searchQuota?.global || {}) as { day?: string; used?: number };

          const currentUsed = quota.day === todayKey ? Math.max(0, quota.used || 0) : 0;
          if (currentUsed >= resolvedLimit) {
            return { allowed: false, used: currentUsed, resolvedLimit };
          }

          const nextUsed = currentUsed + 1;
          transaction.set(userRef, {
            searchQuota: {
              global: {
                day: todayKey,
                used: nextUsed,
                updatedAt: Date.now(),
              },
            },
          }, { merge: true });

          return { allowed: true, used: nextUsed, resolvedLimit };
        });

        updateQuotaState(txnResult.resolvedLimit, txnResult.used);
        return { allowed: txnResult.allowed };
      } catch {
        // Fallback: if quota write fails, do not block search.
        const fallbackLimit = overrideLimit ?? defaultLimit;
        updateQuotaState(fallbackLimit, 0);
        return { allowed: true };
      }
    }

    try {
      const userSnap = await getDoc(userRef);
      const data = userSnap.exists()
        ? userSnap.data() as { userClass?: unknown; searchQuota?: { global?: { day?: string; used?: number } } }
        : {};
      const resolvedLimit = resolveLimitFromUserData(data);
      const quota = (data?.searchQuota?.global || {}) as { day?: string; used?: number };
      const currentUsed = quota.day === todayKey ? Math.max(0, quota.used || 0) : 0;
      updateQuotaState(resolvedLimit, currentUsed);
      return { allowed: currentUsed < resolvedLimit };
    } catch {
      const fallbackLimit = overrideLimit ?? defaultLimit;
      updateQuotaState(fallbackLimit, 0);
      return { allowed: true };
    }
  };

  useEffect(() => {
    if (!globalSearchEnabled && searchMode === 'global') {
      setSearchMode('local');
      setGlobalItems([]);
    }
  }, [globalSearchEnabled, searchMode]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const resetFilters = () => {
    setFilterCategory('');
    setFilterClass('');
    setFilterGender('');
    setFilterMinLevel('');
    setFilterMaxLevel('');
    setFilterType('All');
    setFilterRecipeStatus('All');
  };

  const hasActiveFilters = useMemo(() => {
    return (
      filterCategory !== '' ||
      filterClass !== '' ||
      filterGender !== '' ||
      filterMinLevel !== '' ||
      filterMaxLevel !== '' ||
      filterType !== 'All'
    );
  }, [filterCategory, filterClass, filterGender, filterMinLevel, filterMaxLevel, filterType]);

  // Reset when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setDebouncedQuery('');
      setShowFilters(false);
      setSearchMode('local');
      setGlobalItems([]);
      setModalAlert(null);
      setShowSetDetail(false);
      setSetDetailKey(null);
      setSearchLimitReached(false);
      setSearchLimitMessage('');
      setSearchLimitTotal(null);
      setSearchLimitUsed(0);
      setSearchResetAt(null);
      setSearchResetCountdown('');
      resetFilters();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || searchMode !== 'global') return;
    refreshQuota(false);
  }, [isOpen, searchMode, currentUserUid, currentUserRole, globalSearchEnabled]);

  useEffect(() => {
    if (!isOpen || searchMode !== 'global' || !searchResetAt) return;

    const updateCountdown = () => {
      const remainingMs = searchResetAt - Date.now();
      setSearchResetCountdown(formatDuration(remainingMs));
      if (remainingMs <= 0) {
        refreshQuota(false);
      }
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [isOpen, searchMode, searchResetAt, currentUserUid, currentUserRole]);

  // Fetch global items and consume quota only when needed.
  useEffect(() => {
    if (searchMode !== 'global') return;
    if (!globalSearchEnabled) return;
    if (globalLoading) return;

    const hasSearchCriteria = (debouncedQuery && debouncedQuery.length >= MIN_GLOBAL_SEARCH_CHARS) || hasActiveFilters;
    if (!hasSearchCriteria) {
      setGlobalItems([]);
      return;
    }

    const doFetch = async () => {
      setGlobalLoading(true);
      try {
        const constraints: QueryConstraint[] = [];

        if (filterCategory) {
          constraints.push(where("item.category", "==", filterCategory));
        }

        constraints.push(limit(20));

        const q = fsQuery(collection(db, "globalItems"), ...constraints);
        const snapshot = await getDocs(q);
        const items: GlobalItemDoc[] = [];
        snapshot.forEach(d => items.push({ ...(d.data() as GlobalItemDoc), docId: d.id }));

        const lowerQuery = debouncedQuery.toLocaleLowerCase('tr');
        const matchedItems = items.filter(gItem => {
          const item = gItem.item;
          let match = true;

          if (debouncedQuery.length >= MIN_GLOBAL_SEARCH_CHARS) {
            const textToSearch = `
              ${item.category}
              ${item.enchantment1}
              ${item.enchantment2}
              ${item.heroClass}
              ${item.weaponType || ''}
              ${shouldShowBoundMarker(item) ? 'bağlı bagli bound ^' : ''}
              ${item.type === 'Recipe' ? 'reÃ§ete recipe' : ''}
              lv${item.level}
            `.toLocaleLowerCase('tr');
            const searchWords = lowerQuery.split(/\s+/).filter(w => w.length > 0);
            if (!searchWords.every(word => textToSearch.includes(word))) match = false;
          }

          if (match && hasActiveFilters) {
            if (filterCategory && item.category !== filterCategory) match = false;
            if (filterClass && filterClass !== 'TÃ¼m SÄ±nÄ±flar' && item.heroClass !== filterClass) match = false;
            if (filterGender && filterGender !== 'TÃ¼m Cinsiyetler' && item.gender !== filterGender) match = false;
            if (filterMinLevel && item.level < parseInt(filterMinLevel)) match = false;
            if (filterMaxLevel && item.level > parseInt(filterMaxLevel)) match = false;
            if (filterType === 'Recipe' && item.type !== 'Recipe') match = false;
            if (filterType === 'Item' && item.type !== 'Item') match = false;
          }

          return match;
        });

        const searchKey = JSON.stringify({
          q: debouncedQuery.trim().toLocaleLowerCase('tr'),
          category: filterCategory || '',
          heroClass: filterClass || '',
          gender: filterGender || '',
          minLevel: filterMinLevel || '',
          maxLevel: filterMaxLevel || '',
          type: filterType || 'All',
        });

        const resultSignature = matchedItems
          .map(gItem => `${gItem.docId || ''}:${gItem.updatedAt || 0}:${gItem.item?.id || ''}`)
          .sort()
          .join('|');

        let shouldConsumeQuota = matchedItems.length > 0;
        if (shouldConsumeQuota) {
          const now = Date.now();
          const cached = globalSearchChargeCacheRef.current.get(searchKey);
          if (cached && cached.expiresAt > now && cached.signature === resultSignature) {
            shouldConsumeQuota = false;
          } else {
            const quota = await refreshQuota(true);
            if (!quota.allowed) {
              setGlobalItems([]);
              return;
            }
            globalSearchChargeCacheRef.current.set(searchKey, {
              signature: resultSignature,
              expiresAt: now + SAME_RESULTS_FREE_WINDOW_MS,
            });
          }
        }

        setGlobalItems(items);
      } catch (error) {
        console.error("Global items fetch error:", error);
      } finally {
        setGlobalLoading(false);
      }
    };
    doFetch();
  }, [searchMode, debouncedQuery, hasActiveFilters, filterCategory, filterClass, filterGender, filterMinLevel, filterMaxLevel, filterType, globalSearchEnabled]);

  const results = useMemo(() => {
    // If no text query AND no filters active, show nothing
    if ((!debouncedQuery || debouncedQuery.length < 2) && !hasActiveFilters) return [];

    const lowerQuery = debouncedQuery.toLocaleLowerCase('tr');
    const found: SearchResult[] = [];

    accounts.forEach(acc => {
      acc.servers.forEach((server, serverIdx) => {
        server.characters.forEach((char) => {
          // 1. Search in Containers (Slots) -> These are technically "Unread" if they are recipes
          const containers = [
              { key: 'bank1' as const, data: char.bank1 },
              { key: 'bank2' as const, data: char.bank2 },
              { key: 'bag' as const, data: char.bag }
          ];

          containers.forEach(({ key, data }) => {
            data.slots.forEach(slot => {
              if (!slot.item) return;

              const item = slot.item;

              // Skip logic based on Recipe Status filter (If looking for Read, skip slots)
              if (filterType === 'Recipe' && filterRecipeStatus === 'Read') return;

              // ... proceed with matching
              let match = true;

              // 1. Text Search (word-based AND: her kelime ayrı ayrı aranır)
              if (debouncedQuery.length >= 2) {
                  const textToSearch = `
                    ${item.category}
                    ${item.enchantment1}
                    ${item.enchantment2}
                    ${item.heroClass}
                    ${item.weaponType || ''}
                    ${shouldShowBoundMarker(item) ? 'bağlı bagli bound ^' : ''}
                    ${item.type === 'Recipe' ? 'reçete recipe' : ''}
                    lv${item.level}
                  `.toLocaleLowerCase('tr');
                  const searchWords = lowerQuery.split(/\s+/).filter(w => w.length > 0);
                  if (!searchWords.every(word => textToSearch.includes(word))) match = false;
              }

              // 2. Filters
              if (match && hasActiveFilters) {
                  if (filterCategory && item.category !== filterCategory) match = false;
                  if (filterClass && filterClass !== 'Tüm Sınıflar' && item.heroClass !== filterClass) match = false;
                  if (filterGender && filterGender !== 'Tüm Cinsiyetler' && item.gender !== filterGender) match = false;
                  if (filterMinLevel && item.level < parseInt(filterMinLevel)) match = false;
                  if (filterMaxLevel && item.level > parseInt(filterMaxLevel)) match = false;
                  if (filterType === 'Recipe' && item.type !== 'Recipe') match = false;
                  if (filterType === 'Item' && item.type !== 'Item') match = false;
              }

              if (match) {
                const position = getContainerSlotPosition(data, slot.id);
                if (!position) return;
                found.push({
                  accountId: acc.id,
                  accountName: acc.name,
                  serverIndex: serverIdx,
                  serverName: server.name,
                  charId: char.id,
                  charName: char.name,
                  containerId: data.id,
                  containerName: data.name,
                  containerKey: key,
                  slotId: slot.id,
                  row: position.row,
                  col: position.col,
                  item
                });
              }
            });
          });

          // 2. Search in Learned Recipes (Read Recipes)
          if (filterType !== 'Item' && filterRecipeStatus !== 'Unread') {
               (char.learnedRecipes || []).forEach((item, idx) => {
                   let match = true;

                   // 1. Text Search (word-based AND: her kelime ayrı ayrı aranır)
                   if (debouncedQuery.length >= 2) {
                      const textToSearch = `
                        ${item.category}
                        ${item.enchantment1}
                        ${item.enchantment2}
                        ${item.heroClass}
                        ${item.weaponType || ''}
                        ${shouldShowBoundMarker(item) ? 'bağlı bagli bound ^' : ''}
                        reçete recipe okunmuş read
                        lv${item.level}
                      `.toLocaleLowerCase('tr');
                      const searchWords = lowerQuery.split(/\s+/).filter(w => w.length > 0);
                      if (!searchWords.every(word => textToSearch.includes(word))) match = false;
                  }

                  // 2. Filters
                  if (match && hasActiveFilters) {
                      if (filterCategory && item.category !== filterCategory) match = false;
                      if (filterClass && filterClass !== 'Tüm Sınıflar' && item.heroClass !== filterClass) match = false;
                      if (filterGender && filterGender !== 'Tüm Cinsiyetler' && item.gender !== filterGender) match = false;
                      if (filterMinLevel && item.level < parseInt(filterMinLevel)) match = false;
                      if (filterMaxLevel && item.level > parseInt(filterMaxLevel)) match = false;
                      // Type is implicitly Recipe for learned items, but we double check logic
                      if (filterType === 'Item') match = false;
                  }

                  if (match) {
                      found.push({
                          accountId: acc.id,
                          accountName: acc.name,
                          serverIndex: serverIdx,
                          serverName: server.name,
                          charId: char.id,
                          charName: char.name,
                          containerId: 'learned',
                          containerName: 'Okunmuş Reçete',
                          containerKey: 'learned',
                          slotId: -1,
                          row: idx + 1, // Visual index
                          col: 1,
                          item: { ...item, type: 'Recipe' } // Ensure type is set
                      });
                  }
               });
          }
        });
      });
    });

    return found;
  }, [debouncedQuery, accounts, hasActiveFilters, filterCategory, filterClass, filterGender, filterMinLevel, filterMaxLevel, filterType, filterRecipeStatus]);

  // Set detail modal states
  const [showSetDetail, setShowSetDetail] = useState(false);
  const [setDetailKey, setSetDetailKey] = useState<string | null>(null);

  // Bir SearchResult için en iyi set bilgisini bul (global lookup kullanır)
  const getSetInfoForResult = (res: SearchResult): { info: GlobalSetInfo; globalKey: string } | null => {
    const item = res.item;
    if (!SET_CATEGORIES.includes(item.category)) return null;
    if (!item.enchantment1 || item.enchantment1.trim() === '') return null;

    const enchKey = createSetEnchantmentKey(item.enchantment1, item.enchantment2);
    const globalKey = `${enchKey}|${item.gender}|${item.heroClass}`;
    const info = globalSetLookup.get(globalKey);
    return info ? { info, globalKey } : null;
  };

  // Global search results
  const globalResults = useMemo(() => {
    if (searchMode !== 'global') return [];
    if ((!debouncedQuery || debouncedQuery.length < MIN_GLOBAL_SEARCH_CHARS) && !hasActiveFilters) return [];

    const lowerQuery = debouncedQuery.toLocaleLowerCase('tr');

    return globalItems.filter(gItem => {
      const item = gItem.item;
      let match = true;

      // Text search (word-based AND: her kelime ayrı ayrı aranır)
      if (debouncedQuery.length >= MIN_GLOBAL_SEARCH_CHARS) {
        const textToSearch = `
          ${item.category}
          ${item.enchantment1}
          ${item.enchantment2}
          ${item.heroClass}
          ${item.weaponType || ''}
          ${shouldShowBoundMarker(item) ? 'bağlı bagli bound ^' : ''}
          ${item.type === 'Recipe' ? 'reçete recipe' : ''}
          lv${item.level}
        `.toLocaleLowerCase('tr');
        const searchWords = lowerQuery.split(/\s+/).filter(w => w.length > 0);
        if (!searchWords.every(word => textToSearch.includes(word))) match = false;
      }

      // Filters
      if (match && hasActiveFilters) {
        if (filterCategory && item.category !== filterCategory) match = false;
        if (filterClass && filterClass !== 'Tüm Sınıflar' && item.heroClass !== filterClass) match = false;
        if (filterGender && filterGender !== 'Tüm Cinsiyetler' && item.gender !== filterGender) match = false;
        if (filterMinLevel && item.level < parseInt(filterMinLevel)) match = false;
        if (filterMaxLevel && item.level > parseInt(filterMaxLevel)) match = false;
        if (filterType === 'Recipe' && item.type !== 'Recipe') match = false;
        if (filterType === 'Item' && item.type !== 'Item') match = false;
      }

      return match;
    });
  }, [searchMode, debouncedQuery, globalItems, hasActiveFilters, filterCategory, filterClass, filterGender, filterMinLevel, filterMaxLevel, filterType]);

// --- EXCEL ÇIKTISI ALMA FONKSİYONU (GÜNCELLENMİŞ) ---
  const handleExportSearchResults = () => {
    if (results.length === 0) {
        setModalAlert({
          title: 'Indirilecek Sonuc Yok',
          message: 'Lutfen once bir arama yapip sonuc listesi olusturun.',
        });
        return;
    }

    const rows = [
      ["Hesap", "Sunucu", "Karakter", "Kasa/Çanta", "Satır", "Sütun", "Efsun 1", "Efsun 2", "Kategori", "Silah Cinsi", "Bağlı", "Seviye", "Cinsiyet", "Sınıf", "Okunmuş", "Adet"]
    ];

    results.forEach(res => {
      const isRead = res.containerKey === 'learned' || (res.item.type === 'Recipe' && res.item.isRead) ? "Evet" : "Hayır";

      rows.push([
        res.accountName,
        res.serverName,
        res.charName,
        res.containerName,
        res.row.toString(),
        res.col.toString(),
        res.item.enchantment1 || "-",
        res.item.enchantment2 || "-",
        res.item.category,
        res.item.weaponType || "-",
        shouldShowBoundMarker(res.item) ? "Evet" : "Hayır",
        res.item.level.toString(),
        res.item.gender || "-",
        res.item.heroClass,
        isRead,
        res.item.count ? res.item.count.toString() : "1"
      ]);
    });

    const sanitizeCell = (val: string) => {
      let s = val.replace(/"/g, '""');
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return `"${s}"`;
    };
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF"
      + rows.map(e => e.map(c => sanitizeCell(c)).join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "detayli_arama_sonuclari.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  // ---------------------------------------

  if (!isOpen) return null;

  const handleResultClick = (res: SearchResult) => {
    const viewIndex = res.containerKey === 'bank1' ? 0 : res.containerKey === 'bank2' ? 1 : 2; // Default to 2 for bag or learned
    const account = accounts.find(a => a.id === res.accountId);
    if (account) {
        const server = account.servers[res.serverIndex];
        if (server) {
            const charIndex = server.characters.findIndex(c => c.id === res.charId);
            if (charIndex !== -1) {
                // Pass 'true' for openBook if it is a learned recipe
                onNavigate(res.accountId, res.serverIndex, charIndex, viewIndex, res.containerKey === 'learned');
                onClose();
            }
        }
    }
  };

  const searchLimitRemaining = searchLimitTotal !== null ? Math.max(0, searchLimitTotal - searchLimitUsed) : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-2 md:pt-20 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-[97vw] md:w-full max-w-2xl bg-slate-900 border-2 border-slate-600 rounded-xl shadow-2xl flex flex-col max-h-[96vh] md:max-h-[85vh]">

        {/* Header / Input */}
        <div className="bg-slate-800 rounded-t-lg flex flex-col border-b border-slate-700">
            <div className="p-4 flex items-center gap-3">
                <Search className="text-yellow-500 shrink-0" size={20} />
                <input
                    autoFocus
                    type="text"
                    placeholder="İsim veya Efsun ile ara..."
                    className="flex-1 bg-transparent text-base md:text-xl text-white placeholder-slate-500 outline-none min-w-0"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />

                <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded text-sm font-bold border transition-colors ${showFilters ? 'bg-yellow-600 text-black border-yellow-500' : 'bg-slate-700 text-slate-300 border-slate-600 hover:border-slate-400'}`}
                >
                    <Filter size={14} />
                    <span className="hidden sm:inline">Detaylı Ara</span>
                    {showFilters ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                </button>

                <button onClick={onClose} className="text-slate-400 hover:text-white ml-2">
                    <X size={24} />
                </button>
            </div>

            {/* Search Mode Tabs */}
            <div className="px-4 pb-2 flex gap-2">
              <button
                onClick={() => setSearchMode('local')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 border ${
                  searchMode === 'local'
                    ? 'bg-yellow-600 text-black border-yellow-500 shadow-sm'
                    : 'bg-slate-900/50 text-slate-400 border-slate-700 hover:bg-slate-800 hover:text-slate-300'
                }`}
              >
                <Search size={13} />
                Hesaplarım
              </button>
              <button
                onClick={() => setSearchMode('global')}
                disabled={!globalSearchEnabled}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 border ${
                  searchMode === 'global'
                    ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                    : globalSearchEnabled
                      ? 'bg-slate-900/50 text-slate-400 border-slate-700 hover:bg-slate-800 hover:text-slate-300'
                      : 'bg-slate-900/30 text-slate-600 border-slate-800 cursor-not-allowed opacity-70'
                }`}
                title={globalSearchEnabled ? undefined : 'Global arama yetkiniz admin tarafindan kapatildi'}
              >
                <Globe size={13} />
                Globalde Ara
              </button>
            </div>

            {/* Advanced Filters Panel */}
            {showFilters && (
                <div className="p-4 bg-slate-900/50 border-t border-slate-700 animate-in slide-in-from-top-2">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                        {/* Category */}
                        <div>
                            <label className="text-[10px] text-slate-400 font-bold block mb-1">KATEGORİ</label>
                            <select
                                value={filterCategory}
                                onChange={(e) => setFilterCategory(e.target.value)}
                                className="w-full bg-slate-800 border border-slate-600 rounded text-xs p-1.5 text-slate-200 focus:border-yellow-500 outline-none"
                            >
                                <option value="">Tümü</option>
                                {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>

                        {/* Class */}
                        <div>
                            <label className="text-[10px] text-slate-400 font-bold block mb-1">SINIF</label>
                            <select
                                value={filterClass}
                                onChange={(e) => setFilterClass(e.target.value)}
                                className="w-full bg-slate-800 border border-slate-600 rounded text-xs p-1.5 text-slate-200 focus:border-yellow-500 outline-none"
                            >
                                <option value="">Tümü</option>
                                {HERO_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>

                         {/* Gender */}
                         <div>
                            <label className="text-[10px] text-slate-400 font-bold block mb-1">CİNSİYET</label>
                            <select
                                value={filterGender}
                                onChange={(e) => setFilterGender(e.target.value)}
                                className="w-full bg-slate-800 border border-slate-600 rounded text-xs p-1.5 text-slate-200 focus:border-yellow-500 outline-none"
                            >
                                <option value="">Tümü</option>
                                {GENDER_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>

                        {/* Type */}
                        <div>
                            <label className="text-[10px] text-slate-400 font-bold block mb-1">TÜR</label>
                            <select
                                value={filterType}
                                onChange={(e) => {
                                    setFilterType(e.target.value as any);
                                    if(e.target.value !== 'Recipe') setFilterRecipeStatus('All');
                                }}
                                className="w-full bg-slate-800 border border-slate-600 rounded text-xs p-1.5 text-slate-200 focus:border-yellow-500 outline-none"
                            >
                                <option value="All">Hepsi</option>
                                <option value="Item">Eşya</option>
                                <option value="Recipe">Reçete</option>
                            </select>
                        </div>
                    </div>

                    {/* New Row for Recipe Status (Visible only if Type is Recipe) */}
                    {filterType === 'Recipe' && (
                        <div className="mb-3">
                             <label className="text-[10px] text-slate-400 font-bold block mb-1">DURUM</label>
                             <div className="flex gap-2">
                                {['All', 'Read', 'Unread'].map((status) => (
                                    <button
                                        key={status}
                                        onClick={() => setFilterRecipeStatus(status as any)}
                                        className={`px-3 py-1 rounded text-xs font-bold border transition-colors ${filterRecipeStatus === status ? 'bg-purple-600 text-white border-purple-500' : 'bg-slate-800 text-slate-400 border-slate-600 hover:bg-slate-700'}`}
                                    >
                                        {status === 'All' ? 'Tümü' : status === 'Read' ? 'Okunmuş' : 'Okunmamış'}
                                    </button>
                                ))}
                             </div>
                        </div>
                    )}

                    <div className="flex items-end gap-3">
                        {/* Level Range */}
                        <div className="flex-1">
                            <label className="text-[10px] text-slate-400 font-bold block mb-1">SEVİYE ARALIĞI</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    placeholder="Min"
                                    value={filterMinLevel}
                                    onChange={(e) => setFilterMinLevel(e.target.value)}
                                    className="w-full bg-slate-800 border border-slate-600 rounded text-xs p-1.5 text-slate-200 focus:border-yellow-500 outline-none"
                                />
                                <span className="text-slate-500">-</span>
                                <input
                                    type="number"
                                    placeholder="Max"
                                    value={filterMaxLevel}
                                    onChange={(e) => setFilterMaxLevel(e.target.value)}
                                    className="w-full bg-slate-800 border border-slate-600 rounded text-xs p-1.5 text-slate-200 focus:border-yellow-500 outline-none"
                                />
                            </div>
                        </div>
                        {/* Excel Export Button */}
                        <button
                            onClick={handleExportSearchResults}
                            className="px-3 py-1.5 bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-200 border border-emerald-800/50 rounded text-xs font-bold transition-colors flex items-center gap-1 h-[30px] mr-2"
                            title="Sonuçları İndir"
                        >
                            <FileSpreadsheet size={12} /> Excel
                        </button>
                        {/* Reset Button */}
                        <button
                            onClick={resetFilters}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-red-900/50 text-slate-400 hover:text-red-300 border border-slate-700 rounded text-xs font-bold transition-colors flex items-center gap-1 h-[30px]"
                        >
                            <RotateCcw size={12} /> Sıfırla
                        </button>
                    </div>
                </div>
            )}
        </div>

        {/* Results List */}
        <div className="overflow-y-auto p-2 space-y-2 flex-1 custom-scrollbar">

          {/* LOCAL MODE */}
          {searchMode === 'local' && (
            <>
              {(!debouncedQuery || debouncedQuery.length < 2) && !hasActiveFilters && (
                <div className="text-center p-10 text-slate-500">
                  <Package size={48} className="mx-auto mb-4 opacity-20" />
                  <p>Arama yapmak için metin giriniz veya filtre seçiniz.</p>
                </div>
              )}

              {results.length === 0 && ((debouncedQuery.length >= 2) || hasActiveFilters) && (
                <div className="text-center p-10 text-slate-500">
                  <p>Kriterlere uygun sonuç bulunamadı.</p>
                </div>
              )}

              {results.map((res, idx) => (
                <button
                  key={`${res.containerId}-${res.slotId}-${idx}`}
                  onClick={() => handleResultClick(res)}
                  className="w-full text-left bg-slate-800/50 hover:bg-slate-700 border border-slate-700 hover:border-yellow-500/50 p-3 rounded flex items-center gap-4 transition-all group"
                >
                  <div className={`w-12 h-12 shrink-0 rounded flex items-center justify-center border relative ${CATEGORY_COLORS[res.item.category] || 'bg-gray-700 border-gray-600'}`}>
                     <span className="text-[10px] font-bold text-white z-10">{res.item.category.substring(0,3)}</span>
                     {res.containerKey === 'learned' && (
                         <div className="absolute -bottom-1 -right-1 bg-purple-600 rounded-full p-0.5 border border-purple-400 z-20">
                             <Book size={8} className="text-white"/>
                         </div>
                     )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-1">
                        <h4 className={`font-bold text-sm truncate ${res.item.type === 'Recipe' ? 'text-yellow-300' : (shouldShowBoundMarker(res.item) ? 'text-amber-300 drop-shadow-[0_0_6px_rgba(251,191,36,0.8)]' : 'text-white')}`}>
                            {res.item.category} {res.item.type === 'Recipe' ? '(Reçete)' : (shouldShowBoundMarker(res.item) ? '(^)' : '')}
                            <span className="text-xs font-normal text-slate-400 ml-2">Lv.{res.item.level}</span>
                        </h4>
                        <div className="flex items-center gap-1 shrink-0">
                          {(() => {
                            const result = getSetInfoForResult(res);
                            if (!result) return null;
                            const { info: setInfo, globalKey } = result;
                            const full = setInfo.count === 8;
                            const mid = setInfo.count >= 4;
                            const colorClass = full
                              ? 'bg-emerald-900/80 text-emerald-300 border-emerald-600'
                              : mid
                                ? 'bg-amber-900/80 text-amber-300 border-amber-600'
                                : 'bg-slate-800 text-slate-400 border-slate-600';
                            const missingCats = SET_CATEGORIES.filter(c => !setInfo.categories.has(c));
                            const tooltip = full
                              ? 'Tam set! Tüm parçalar mevcut. (Tıkla: detay)'
                              : `Mevcut: ${[...setInfo.categories].join(', ')}\nEksik: ${missingCats.join(', ')}\n(Tıkla: detay)`;
                            return (
                              <span
                                title={tooltip}
                                className={`text-[9px] px-1.5 py-0.5 rounded border font-bold cursor-pointer hover:brightness-125 transition-all ${colorClass}`}
                                onClick={(e) => { e.stopPropagation(); setSetDetailKey(globalKey); setShowSetDetail(true); }}
                              >
                                {setInfo.count}/8
                              </span>
                            );
                          })()}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 ${CLASS_COLORS[res.item.heroClass]}`}>
                              {res.item.heroClass}
                          </span>
                        </div>
                    </div>

                    <div className="text-xs text-slate-300 truncate mt-0.5">
                        {res.item.enchantment1 && <span className="text-yellow-100/80 mr-2">• {res.item.enchantment1}</span>}
                        {res.item.enchantment2 && <span className="text-yellow-100/80">• {res.item.enchantment2}</span>}
                    </div>

                    {/* Weapon Type & Count */}
                    {(res.item.weaponType || ((res.item.category === 'Maden' || res.item.category === 'İksir') && res.item.count && res.item.count > 1)) && (
                      <div className="flex items-center gap-2 mt-0.5">
                        {res.item.weaponType && (
                          <span className="text-[10px] text-red-400 font-bold flex items-center gap-0.5"><Sword size={10} />{res.item.weaponType}</span>
                        )}
                        {(res.item.category === 'Maden' || res.item.category === 'İksir') && res.item.count && res.item.count > 1 && (
                          <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-0.5"><Layers size={10} />x{res.item.count}</span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-1 mt-2 text-[9px] md:text-[10px] text-slate-400 font-mono bg-black/20 p-1 rounded w-fit flex-wrap">
                        <MapPin size={10} className="text-blue-400 shrink-0" />
                        <span className="text-blue-200">{res.accountName}</span>
                        <ArrowRight size={8} className="shrink-0" />
                        <Globe size={8} className="text-emerald-400 shrink-0" />
                        <span className="text-emerald-200">{res.serverName}</span>
                        <ArrowRight size={8} className="shrink-0" />
                        <span className="text-green-200">{res.charName}</span>
                        <ArrowRight size={8} className="shrink-0" />
                        <span className={`${res.containerKey === 'learned' ? 'text-purple-300' : 'text-yellow-200'} uppercase`}>{res.containerName}</span>
                        {res.slotId !== -1 && <span className="ml-1 text-slate-500">| S:{res.row} Sü:{res.col}</span>}
                    </div>
                  </div>
                </button>
              ))}
            </>
          )}

          {/* GLOBAL MODE */}
          {searchMode === 'global' && (
            <>
              {!globalSearchEnabled && (
                <div className="text-center p-8 text-red-300 bg-red-950/20 border border-red-900/40 rounded-lg">
                  <AlertTriangle size={42} className="mx-auto mb-3 opacity-70" />
                  <p className="font-bold text-sm">Global arama yetkiniz kapatildi.</p>
                  <p className="text-xs text-red-300/80 mt-1">Bu yetkiyi yalnizca yonetici tekrar acabilir.</p>
                </div>
              )}

              {searchLimitTotal !== null && (
                <div className={`border rounded-lg p-3 ${searchLimitReached ? 'bg-red-950/30 border-red-800/40' : 'bg-emerald-950/20 border-emerald-800/40'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className={`text-xs font-bold ${searchLimitReached ? 'text-red-300' : 'text-emerald-300'}`}>
                        {searchLimitReached ? 'Bugun arama kotan doldu' : `Global Arama Hakkin: ${searchLimitRemaining}/${searchLimitTotal}`}
                      </p>
                      {!searchLimitReached && (
                        <p className="text-[11px] text-emerald-200/80 mt-0.5">
                          {searchLimitMessage}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-slate-400">Yenilenme</p>
                      <p className={`text-xs font-bold ${searchLimitReached ? 'text-red-300' : 'text-slate-200'}`}>
                        {searchResetCountdown || '-'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {globalSearchEnabled && searchLimitReached && (
                <div className="text-center p-6 text-red-400">
                  <AlertTriangle size={48} className="mx-auto mb-4 opacity-60" />
                  <p className="font-bold text-sm mb-1">Bugun hakkiniz bitmistir</p>
                  <p className="text-xs text-red-300/80">{searchLimitMessage}</p>
                </div>
              )}

              {globalSearchEnabled && !searchLimitReached && globalLoading && (
                <div className="text-center p-10 text-slate-500">
                  <Loader2 size={48} className="mx-auto mb-4 opacity-40 animate-spin" />
                  <p>Global eşyalar yükleniyor...</p>
                </div>
              )}

              {globalSearchEnabled && !searchLimitReached && !globalLoading && (!debouncedQuery || debouncedQuery.length < MIN_GLOBAL_SEARCH_CHARS) && !hasActiveFilters && (
                <div className="text-center p-10 text-slate-500">
                  <Globe size={48} className="mx-auto mb-4 opacity-20" />
                  <p>Global arama için en az 4 karakter giriniz veya filtre seçiniz.</p>
                </div>
              )}

              {globalSearchEnabled && !searchLimitReached && !globalLoading && globalResults.length === 0 && ((debouncedQuery.length >= MIN_GLOBAL_SEARCH_CHARS) || hasActiveFilters) && (
                <div className="text-center p-10 text-slate-500">
                  <p>Kriterlere uygun global sonuç bulunamadı.</p>
                </div>
              )}

              {globalSearchEnabled && !searchLimitReached && !globalLoading && globalResults.map((gItem, idx) => (
                <div
                  key={`global-${gItem.item.id}-${idx}`}
                  className="w-full text-left bg-slate-800/50 border border-emerald-900/40 p-3 rounded flex items-center gap-4"
                >
                  <div className={`w-12 h-12 shrink-0 rounded flex items-center justify-center border relative ${CATEGORY_COLORS[gItem.item.category] || 'bg-gray-700 border-gray-600'}`}>
                     <span className="text-[10px] font-bold text-white z-10">{gItem.item.category.substring(0,3)}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                        <h4 className={`font-bold text-sm truncate ${gItem.item.type === 'Recipe' ? 'text-yellow-300' : (shouldShowBoundMarker(gItem.item) ? 'text-amber-300 drop-shadow-[0_0_6px_rgba(251,191,36,0.8)]' : 'text-white')}`}>
                            {gItem.item.category} {gItem.item.type === 'Recipe' ? '(Reçete)' : (shouldShowBoundMarker(gItem.item) ? '(^)' : '')}
                            <span className="text-xs font-normal text-slate-400 ml-2">Lv.{gItem.item.level}</span>
                        </h4>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 ${CLASS_COLORS[gItem.item.heroClass]}`}>
                            {gItem.item.heroClass}
                        </span>
                    </div>

                    <div className="text-xs text-slate-300 truncate mt-0.5">
                        {gItem.item.enchantment1 && <span className="text-yellow-100/80 mr-2">• {gItem.item.enchantment1}</span>}
                        {gItem.item.enchantment2 && <span className="text-yellow-100/80">• {gItem.item.enchantment2}</span>}
                    </div>

                    {/* Weapon Type & Count */}
                    {(gItem.item.weaponType || ((gItem.item.category === 'Maden' || gItem.item.category === 'İksir') && gItem.item.count && gItem.item.count > 1)) && (
                      <div className="flex items-center gap-2 mt-0.5">
                        {gItem.item.weaponType && (
                          <span className="text-[10px] text-red-400 font-bold flex items-center gap-0.5"><Sword size={10} />{gItem.item.weaponType}</span>
                        )}
                        {(gItem.item.category === 'Maden' || gItem.item.category === 'İksir') && gItem.item.count && gItem.item.count > 1 && (
                          <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-0.5"><Layers size={10} />x{gItem.item.count}</span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-1 mt-2 text-[9px] md:text-[10px] text-slate-400 font-mono bg-black/20 p-1 rounded w-fit flex-wrap">
                        <User size={10} className="text-cyan-400 shrink-0" />
                        <span className="text-cyan-200">{gItem.username}</span>
                        <ArrowRight size={8} className="shrink-0" />
                        <Globe size={8} className="text-emerald-400 shrink-0" />
                        <span className="text-emerald-200">{gItem.serverName}</span>
                        <ArrowRight size={8} className="shrink-0" />
                        <span className="text-green-200">{gItem.charName}</span>
                        <ArrowRight size={8} className="shrink-0" />
                        <span className="text-yellow-200 uppercase">{gItem.containerName}</span>
                    </div>

                    {/* Social Link */}
                    {gItem.socialLink && gItem.socialLink.trim() !== '' && /^https?:\/\//i.test(gItem.socialLink.trim()) && (
                      <a
                        href={gItem.socialLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1.5 mt-2 text-[11px] text-blue-300 hover:text-blue-100 transition-all bg-blue-950/40 hover:bg-blue-900/50 border border-blue-700/40 hover:border-blue-500/50 rounded-lg px-2.5 py-1.5 w-fit shadow-sm"
                      >
                        <ExternalLink size={12} className="shrink-0" />
                        <span className="font-semibold truncate max-w-[250px]">{gItem.socialLink.replace(/^https?:\/\/(www\.)?/, '')}</span>
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}

        </div>

        {/* Footer info */}
        <div className="p-2 bg-slate-900 border-t border-slate-700 text-center text-[10px] text-slate-500 flex justify-between px-4">
           <span>{searchMode === 'local' ? results.length : globalResults.length} sonuç</span>
           {hasActiveFilters && <span className="text-yellow-600">Filtreler Aktif</span>}
           {searchMode === 'global' && <span className="text-emerald-500">Maks. 20 sonuç | Kategori filtresi önerilir</span>}
        </div>
      </div>

      {modalAlert && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setModalAlert(null)}>
          <div
            className="mx-4 w-full max-w-sm overflow-hidden rounded-2xl border border-amber-700/40 bg-gradient-to-b from-amber-950/80 to-slate-900 shadow-2xl animate-in zoom-in-95 fade-in duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-amber-800/40 bg-amber-950/35 flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg border border-amber-700/50 bg-amber-900/35">
                <AlertTriangle size={16} className="text-amber-300" />
              </div>
              <h3 className="text-[13px] font-bold text-amber-100">{modalAlert.title}</h3>
            </div>
            <div className="px-4 py-4">
              <p className="text-sm text-slate-200 leading-relaxed">{modalAlert.message}</p>
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => setModalAlert(null)}
                  className="px-4 py-1.5 rounded-lg text-xs font-bold text-black bg-amber-500 hover:bg-amber-400 transition-colors"
                >
                  Tamam
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <SetDetailModal
        isOpen={showSetDetail}
        onClose={() => { setShowSetDetail(false); setSetDetailKey(null); }}
        setKey={setDetailKey}
        setMap={globalSetMap}
      />
    </div>
  );
};




