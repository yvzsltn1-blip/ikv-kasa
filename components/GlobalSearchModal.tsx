import React, { useState, useEffect, useMemo } from 'react';
import { Account, ItemData, CATEGORY_OPTIONS } from '../types';
import { Search, MapPin, X, ArrowRight, Package, Filter, ChevronDown, ChevronUp, RotateCcw, Book, FileSpreadsheet, Globe, User, Loader2, ExternalLink, Sword, Layers } from 'lucide-react';
import { CATEGORY_COLORS, CLASS_COLORS, HERO_CLASSES, GENDER_OPTIONS, SET_CATEGORIES } from '../constants';
import { db } from '../firebase';
import { collection, getDocs, query as fsQuery, where, limit, QueryConstraint } from 'firebase/firestore';

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
}

interface SetInfo {
  count: number;
  categories: Set<string>;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({ isOpen, onClose, accounts, onNavigate }) => {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'local' | 'global'>('local');

  // Global search states
  const [globalItems, setGlobalItems] = useState<GlobalItemDoc[]>([]);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [globalCacheKey, setGlobalCacheKey] = useState('');
  const [globalCacheTime, setGlobalCacheTime] = useState(0);

  // Filter States
  const [showFilters, setShowFilters] = useState(false);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [filterGender, setFilterGender] = useState('');
  const [filterMinLevel, setFilterMinLevel] = useState<string>('');
  const [filterMaxLevel, setFilterMaxLevel] = useState<string>('');
  const [filterType, setFilterType] = useState<'All' | 'Item' | 'Recipe'>('All');
  const [filterRecipeStatus, setFilterRecipeStatus] = useState<'All' | 'Read' | 'Unread'>('All');

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
      setGlobalCacheKey('');
      setGlobalCacheTime(0);
      setGlobalItems([]);
      resetFilters();
    }
  }, [isOpen]);

  // Fetch global items with targeted query (max 50 docs per search, 5 min cache)
  useEffect(() => {
    if (searchMode !== 'global') return;
    if (globalLoading) return;

    const hasSearchCriteria = (debouncedQuery && debouncedQuery.length >= 2) || hasActiveFilters;
    if (!hasSearchCriteria) {
      setGlobalItems([]);
      setGlobalCacheKey('');
      setGlobalCacheTime(0);
      return;
    }

    // Server-side filter key: only category goes to Firestore (most selective, single-field index)
    const serverKey = filterCategory || '__all__';

    // Use cache if same server filter and younger than 5 min
    if (serverKey === globalCacheKey && (Date.now() - globalCacheTime) < 300000) return;

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
        snapshot.forEach(d => items.push(d.data() as GlobalItemDoc));

        setGlobalItems(items);
        setGlobalCacheKey(serverKey);
        setGlobalCacheTime(Date.now());
      } catch (error) {
        console.error("Global items fetch error:", error);
      } finally {
        setGlobalLoading(false);
      }
    };
    doFetch();
  }, [searchMode, debouncedQuery, hasActiveFilters, filterCategory]);

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
                const row = Math.floor(slot.id / data.cols) + 1;
                const col = (slot.id % data.cols) + 1;
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
                  row,
                  col,
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

  // Set lookup: karakter başına efsun çifti → hangi kategoriler mevcut
  const setLookup = useMemo(() => {
    const lookup = new Map<string, SetInfo>();

    accounts.forEach(acc => {
      acc.servers.forEach((server, serverIdx) => {
        server.characters.forEach(char => {
          // Tüm itemleri topla (bank1, bank2, bag, learnedRecipes)
          const allItems: ItemData[] = [];
          [char.bank1, char.bank2, char.bag].forEach(container => {
            container.slots.forEach(slot => {
              if (slot.item) allItems.push(slot.item);
            });
          });
          (char.learnedRecipes || []).forEach(recipe => allItems.push(recipe));

          // Sadece set kategorilerinde ve enchantment1'i olan itemleri filtrele
          const setItems = allItems.filter(
            item => SET_CATEGORIES.includes(item.category) && item.enchantment1 && item.enchantment1.trim() !== ''
          );

          // Efsun çiftine göre grupla
          const enchGroups = new Map<string, ItemData[]>();
          setItems.forEach(item => {
            const enchKey = `${item.enchantment1.toLocaleLowerCase('tr')}|${item.enchantment2.toLocaleLowerCase('tr')}`;
            const group = enchGroups.get(enchKey) || [];
            group.push(item);
            enchGroups.set(enchKey, group);
          });

          // Her grup için mevcut cinsiyet ve sınıf kombinasyonlarını bul
          enchGroups.forEach((items, enchKey) => {
            // Mevcut spesifik cinsiyet ve sınıf değerlerini topla
            const genders = new Set<string>();
            const classes = new Set<string>();
            items.forEach(item => {
              genders.add(item.gender);
              classes.add(item.heroClass);
            });

            // Her (gender, class) kombinasyonu için set sayısını hesapla
            genders.forEach(targetGender => {
              classes.forEach(targetClass => {
                const coveredCategories = new Set<string>();
                items.forEach(item => {
                  const genderMatch = item.gender === targetGender || item.gender === 'Tüm Cinsiyetler' || targetGender === 'Tüm Cinsiyetler';
                  const classMatch = item.heroClass === targetClass || item.heroClass === 'Tüm Sınıflar' || targetClass === 'Tüm Sınıflar';
                  if (genderMatch && classMatch) {
                    coveredCategories.add(item.category);
                  }
                });

                if (coveredCategories.size > 0) {
                  const key = `${acc.id}|${serverIdx}|${char.id}|${enchKey}|${targetGender}|${targetClass}`;
                  lookup.set(key, { count: coveredCategories.size, categories: coveredCategories });
                }
              });
            });
          });
        });
      });
    });

    return lookup;
  }, [accounts]);

  // Bir SearchResult için en iyi set bilgisini bul
  const getSetInfoForResult = (res: SearchResult): SetInfo | null => {
    const item = res.item;
    if (!SET_CATEGORIES.includes(item.category)) return null;
    if (!item.enchantment1 || item.enchantment1.trim() === '') return null;

    const enchKey = `${item.enchantment1.toLocaleLowerCase('tr')}|${item.enchantment2.toLocaleLowerCase('tr')}`;
    const key = `${res.accountId}|${res.serverIndex}|${res.charId}|${enchKey}|${item.gender}|${item.heroClass}`;
    return setLookup.get(key) || null;
  };

  // Global search results
  const globalResults = useMemo(() => {
    if (searchMode !== 'global') return [];
    if ((!debouncedQuery || debouncedQuery.length < 2) && !hasActiveFilters) return [];

    const lowerQuery = debouncedQuery.toLocaleLowerCase('tr');

    return globalItems.filter(gItem => {
      const item = gItem.item;
      let match = true;

      // Text search (word-based AND: her kelime ayrı ayrı aranır)
      if (debouncedQuery.length >= 2) {
        const textToSearch = `
          ${item.category}
          ${item.enchantment1}
          ${item.enchantment2}
          ${item.heroClass}
          ${item.weaponType || ''}
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
        alert("İndirilecek sonuç bulunamadı!");
        return;
    }

    const rows = [
      ["Hesap", "Sunucu", "Karakter", "Kasa/Çanta", "Satır", "Sütun", "Efsun 1", "Efsun 2", "Kategori", "Silah Cinsi", "Seviye", "Cinsiyet", "Sınıf", "Okunmuş", "Adet"]
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
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 border ${
                  searchMode === 'global'
                    ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                    : 'bg-slate-900/50 text-slate-400 border-slate-700 hover:bg-slate-800 hover:text-slate-300'
                }`}
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
                        <h4 className={`font-bold text-sm truncate ${res.item.type === 'Recipe' ? 'text-yellow-300' : 'text-white'}`}>
                            {res.item.category} {res.item.type === 'Recipe' ? '(Reçete)' : ''}
                            <span className="text-xs font-normal text-slate-400 ml-2">Lv.{res.item.level}</span>
                        </h4>
                        <div className="flex items-center gap-1 shrink-0">
                          {(() => {
                            const setInfo = getSetInfoForResult(res);
                            if (!setInfo) return null;
                            const full = setInfo.count === 8;
                            const mid = setInfo.count >= 4;
                            const colorClass = full
                              ? 'bg-emerald-900/80 text-emerald-300 border-emerald-600'
                              : mid
                                ? 'bg-amber-900/80 text-amber-300 border-amber-600'
                                : 'bg-slate-800 text-slate-400 border-slate-600';
                            const missingCats = SET_CATEGORIES.filter(c => !setInfo.categories.has(c));
                            const tooltip = full
                              ? 'Tam set! Tüm parçalar mevcut.'
                              : `Mevcut: ${[...setInfo.categories].join(', ')}\nEksik: ${missingCats.join(', ')}`;
                            return (
                              <span title={tooltip} className={`text-[9px] px-1.5 py-0.5 rounded border font-bold cursor-help ${colorClass}`}>
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
              {globalLoading && (
                <div className="text-center p-10 text-slate-500">
                  <Loader2 size={48} className="mx-auto mb-4 opacity-40 animate-spin" />
                  <p>Global eşyalar yükleniyor...</p>
                </div>
              )}

              {!globalLoading && (!debouncedQuery || debouncedQuery.length < 2) && !hasActiveFilters && (
                <div className="text-center p-10 text-slate-500">
                  <Globe size={48} className="mx-auto mb-4 opacity-20" />
                  <p>Global arama yapmak için metin giriniz veya filtre seçiniz.</p>
                </div>
              )}

              {!globalLoading && globalResults.length === 0 && ((debouncedQuery.length >= 2) || hasActiveFilters) && (
                <div className="text-center p-10 text-slate-500">
                  <p>Kriterlere uygun global sonuç bulunamadı.</p>
                </div>
              )}

              {!globalLoading && globalResults.map((gItem, idx) => (
                <div
                  key={`global-${gItem.item.id}-${idx}`}
                  className="w-full text-left bg-slate-800/50 border border-emerald-900/40 p-3 rounded flex items-center gap-4"
                >
                  <div className={`w-12 h-12 shrink-0 rounded flex items-center justify-center border relative ${CATEGORY_COLORS[gItem.item.category] || 'bg-gray-700 border-gray-600'}`}>
                     <span className="text-[10px] font-bold text-white z-10">{gItem.item.category.substring(0,3)}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                        <h4 className={`font-bold text-sm truncate ${gItem.item.type === 'Recipe' ? 'text-yellow-300' : 'text-white'}`}>
                            {gItem.item.category} {gItem.item.type === 'Recipe' ? '(Reçete)' : ''}
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
                    {gItem.socialLink && gItem.socialLink.trim() !== '' && (
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
    </div>
  );
};
