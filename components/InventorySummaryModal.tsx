import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Account, ItemData } from '../types';
import { X, Search, Layers, User, Package, Book, MapPin, Filter, Globe, Check, ChevronDown } from 'lucide-react';
import { getContainerSlotPosition } from '../containerLayout';

type SummaryScope = 'all' | 'account' | 'character';
type SummaryTypeFilter = 'all' | 'item' | 'recipe';

interface InventorySummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: Account[];
  selectedAccountId: string;
  selectedServerIndex: number;
  activeCharIndex: number;
}

interface FlattenedInventoryEntry {
  item: ItemData;
  quantity: number;
  accountId: string;
  accountName: string;
  serverIndex: number;
  serverName: string;
  charIndex: number;
  charName: string;
  containerId: string;
  containerName: string;
  row: number | null;
  col: number | null;
}

interface GroupedInventoryRow {
  key: string;
  item: ItemData;
  totalCount: number;
  uniqueLocationCount: number;
  accountCount: number;
  characterCount: number;
  entries: FlattenedInventoryEntry[];
}

const normalizeToken = (value: unknown) => (
  String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
);

const resolveTalismanTier = (item: Pick<ItemData, 'talismanTier' | 'enchantment2'>): '-' | 'I' | 'II' | 'III' => {
  const direct = String(item.talismanTier || '').trim().toUpperCase();
  if (direct === '-') return '-';
  if (direct === 'I' || direct === 'II' || direct === 'III') return direct;
  const fallback = String(item.enchantment2 || '').trim().toUpperCase();
  if (fallback === '-') return '-';
  if (fallback === 'I' || fallback === 'II' || fallback === 'III') return fallback;
  return '-';
};

const resolveTalismanColor = (item: Pick<ItemData, 'enchantment2'>): 'Mavi' | 'Kirmizi' => {
  const token = normalizeToken(item.enchantment2);
  if (token === 'kirmizi') return 'Kirmizi';
  return 'Mavi';
};

const getContainerAbbr = (containerId: string, containerName: string): string => {
  const idToken = normalizeToken(containerId);
  const nameToken = normalizeToken(containerName);
  if (idToken.includes('bank1') || nameToken.includes('kasa 1')) return 'K1';
  if (idToken.includes('bank2') || nameToken.includes('kasa 2')) return 'K2';
  if (idToken.includes('bag') || nameToken.includes('canta')) return 'C';
  if (idToken.includes('learned') || nameToken.includes('recete')) return 'RK';
  return containerName.slice(0, 2).toUpperCase();
};

const getTinyLocationLabel = (entry: FlattenedInventoryEntry): string => {
  const abbr = getContainerAbbr(entry.containerId, entry.containerName);
  if (entry.row !== null && entry.col !== null) {
    return `${abbr} ${entry.row}.satir ${entry.col}.sutun`;
  }
  return abbr;
};

const getItemPrimaryLabel = (item: ItemData): string => {
  const main = String(item.enchantment1 || '').trim();
  if (main) return main;
  return item.category;
};

const buildGroupKey = (item: ItemData): string => {
  const isTalisman = normalizeToken(item.category) === 'tilsim';
  const tier = isTalisman ? resolveTalismanTier(item) : '';
  const color = isTalisman ? resolveTalismanColor(item) : '';
  return [
    normalizeToken(item.type),
    normalizeToken(item.category),
    normalizeToken(item.enchantment1),
    normalizeToken(item.enchantment2),
    normalizeToken(item.weaponType || ''),
    normalizeToken(item.heroClass),
    normalizeToken(item.gender),
    String(item.level || 1),
    String(item.isBound === true ? 1 : 0),
    String(item.isRead === true ? 1 : 0),
    normalizeToken(tier),
    normalizeToken(color),
  ].join('|');
};

const toQuantity = (item: ItemData): number => {
  const val = Number(item.count);
  if (!Number.isFinite(val) || val < 1) return 1;
  return Math.floor(val);
};

const sortEntries = (entries: FlattenedInventoryEntry[]) => {
  return [...entries].sort((a, b) => {
    const byAccount = a.accountName.localeCompare(b.accountName, 'tr');
    if (byAccount !== 0) return byAccount;
    const byServer = a.serverName.localeCompare(b.serverName, 'tr');
    if (byServer !== 0) return byServer;
    const byChar = a.charName.localeCompare(b.charName, 'tr');
    if (byChar !== 0) return byChar;
    const byContainer = a.containerName.localeCompare(b.containerName, 'tr');
    if (byContainer !== 0) return byContainer;
    const aRow = a.row ?? 9999;
    const bRow = b.row ?? 9999;
    if (aRow !== bRow) return aRow - bRow;
    const aCol = a.col ?? 9999;
    const bCol = b.col ?? 9999;
    return aCol - bCol;
  });
};

export const InventorySummaryModal: React.FC<InventorySummaryModalProps> = ({
  isOpen,
  onClose,
  accounts,
  selectedAccountId,
  selectedServerIndex,
  activeCharIndex,
}) => {
  const [scope, setScope] = useState<SummaryScope>('all');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<SummaryTypeFilter>('all');
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const categoryMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const activeAccount = useMemo(
    () => accounts.find(account => account.id === selectedAccountId) || null,
    [accounts, selectedAccountId],
  );

  const allEntries = useMemo(() => {
    const entries: FlattenedInventoryEntry[] = [];
    accounts.forEach(account => {
      account.servers.forEach((server, serverIndex) => {
        server.characters.forEach((character, charIndex) => {
          [
            { container: character.bank1, containerId: 'bank1' },
            { container: character.bank2, containerId: 'bank2' },
            { container: character.bag, containerId: 'bag' },
          ].forEach(({ container, containerId }) => {
            container.slots.forEach(slot => {
              if (!slot.item) return;
              const position = getContainerSlotPosition(container, slot.id);
              if (!position) return;
              entries.push({
                item: slot.item,
                quantity: toQuantity(slot.item),
                accountId: account.id,
                accountName: account.name,
                serverIndex,
                serverName: server.name,
                charIndex,
                charName: character.name,
                containerId,
                containerName: container.name,
                row: position.row,
                col: position.col,
              });
            });
          });

          (character.learnedRecipes || []).forEach(recipe => {
            entries.push({
              item: recipe,
              quantity: toQuantity(recipe),
              accountId: account.id,
              accountName: account.name,
              serverIndex,
              serverName: server.name,
              charIndex,
              charName: character.name,
              containerId: 'learned',
              containerName: 'Recete Kitabi',
              row: null,
              col: null,
            });
          });
        });
      });
    });
    return entries;
  }, [accounts]);

  const scopedEntries = useMemo(() => {
    if (scope === 'all') return allEntries;
    if (scope === 'account') {
      return allEntries.filter(entry => entry.accountId === selectedAccountId);
    }
    return allEntries.filter(entry => (
      entry.accountId === selectedAccountId
      && entry.serverIndex === selectedServerIndex
      && entry.charIndex === activeCharIndex
    ));
  }, [allEntries, scope, selectedAccountId, selectedServerIndex, activeCharIndex]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    scopedEntries.forEach(entry => set.add(entry.item.category));
    return [...set].sort((a, b) => a.localeCompare(b, 'tr'));
  }, [scopedEntries]);

  useEffect(() => {
    setCategoryFilters((prev) => prev.filter((category) => categoryOptions.includes(category)));
  }, [categoryOptions]);

  useEffect(() => {
    if (!isCategoryMenuOpen) return;
    const closeMenuOnOutside = (event: MouseEvent | TouchEvent) => {
      if (!categoryMenuRef.current) return;
      if (categoryMenuRef.current.contains(event.target as Node)) return;
      setIsCategoryMenuOpen(false);
    };
    document.addEventListener('mousedown', closeMenuOnOutside);
    document.addEventListener('touchstart', closeMenuOnOutside);
    return () => {
      document.removeEventListener('mousedown', closeMenuOnOutside);
      document.removeEventListener('touchstart', closeMenuOnOutside);
    };
  }, [isCategoryMenuOpen]);

  const groupedRows = useMemo(() => {
    const grouped = new Map<string, {
      key: string;
      item: ItemData;
      totalCount: number;
      entries: FlattenedInventoryEntry[];
      accountSet: Set<string>;
      characterSet: Set<string>;
    }>();

    scopedEntries.forEach(entry => {
      const key = buildGroupKey(entry.item);
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, {
          key,
          item: entry.item,
          totalCount: entry.quantity,
          entries: [entry],
          accountSet: new Set([entry.accountId]),
          characterSet: new Set([`${entry.accountId}|${entry.serverIndex}|${entry.charIndex}`]),
        });
        return;
      }
      existing.totalCount += entry.quantity;
      existing.entries.push(entry);
      existing.accountSet.add(entry.accountId);
      existing.characterSet.add(`${entry.accountId}|${entry.serverIndex}|${entry.charIndex}`);
    });

    const query = normalizeToken(search);
    return [...grouped.values()]
      .map(row => ({
        key: row.key,
        item: row.item,
        totalCount: row.totalCount,
        uniqueLocationCount: row.entries.length,
        accountCount: row.accountSet.size,
        characterCount: row.characterSet.size,
        entries: sortEntries(row.entries),
      }))
      .filter(row => {
        if (typeFilter === 'item' && row.item.type !== 'Item') return false;
        if (typeFilter === 'recipe' && row.item.type !== 'Recipe') return false;
        if (categoryFilters.length > 0 && !categoryFilters.includes(row.item.category)) return false;
        if (!query) return true;

        const searchText = normalizeToken([
          row.item.category,
          row.item.enchantment1,
          row.item.enchantment2,
          row.item.weaponType || '',
          row.item.heroClass,
          row.item.gender,
          row.entries.map(entry => `${entry.accountName} ${entry.serverName} ${entry.charName} ${entry.containerName} ${getTinyLocationLabel(entry)}`).join(' '),
        ].join(' '));

        return searchText.includes(query);
      })
      .sort((a, b) => {
        if (b.totalCount !== a.totalCount) return b.totalCount - a.totalCount;
        return getItemPrimaryLabel(a.item).localeCompare(getItemPrimaryLabel(b.item), 'tr');
      });
  }, [scopedEntries, search, typeFilter, categoryFilters]);

  useEffect(() => {
    if (!isOpen) return;
    if (groupedRows.length === 0) {
      setSelectedGroupKey(null);
      return;
    }
    if (!selectedGroupKey || !groupedRows.some(row => row.key === selectedGroupKey)) {
      setSelectedGroupKey(groupedRows[0].key);
    }
  }, [groupedRows, isOpen, selectedGroupKey]);

  const selectedGroup = useMemo(
    () => groupedRows.find(row => row.key === selectedGroupKey) || null,
    [groupedRows, selectedGroupKey],
  );

  const totalQuantity = useMemo(
    () => groupedRows.reduce((sum, row) => sum + row.totalCount, 0),
    [groupedRows],
  );

  const scopeSubtitle = useMemo(() => {
    if (scope === 'all') return 'Tum hesaplar';
    if (scope === 'account') return `Hesap: ${activeAccount?.name || '-'}`;
    const activeCharName = activeAccount?.servers[selectedServerIndex]?.characters[activeCharIndex]?.name || '-';
    return `Karakter: ${activeCharName}`;
  }, [scope, activeAccount, selectedServerIndex, activeCharIndex]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 md:p-4" onClick={onClose}>
      <div
        className="w-full h-full md:h-[92vh] max-w-[1500px] rounded-2xl border border-slate-700/70 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 shadow-[0_24px_80px_rgba(2,6,23,0.85)] flex flex-col overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-3 md:px-5 py-2.5 md:py-3 border-b border-slate-700/60 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800/70">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-amber-300">
                <Layers size={16} />
                <h2 className="text-xs md:text-base font-bold tracking-wide">Envanter Ozeti</h2>
              </div>
              <div className="mt-1 text-[10px] md:text-[11px] text-slate-400 flex flex-wrap items-center gap-x-2 md:gap-x-3 gap-y-1">
                <span>{scopeSubtitle}</span>
                <span className="inline-flex items-center gap-1 text-slate-300"><Package size={12} /> {groupedRows.length} farkli esya</span>
                <span className="inline-flex items-center gap-1 text-emerald-300"><MapPin size={12} /> {totalQuantity} toplam adet</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="h-7 w-7 md:h-8 md:w-8 rounded-lg border border-slate-700/70 bg-slate-900/70 text-slate-300 hover:text-white hover:border-slate-500 transition-colors flex items-center justify-center"
              title="Kapat"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="px-2.5 md:px-5 py-2 md:py-3 border-b border-slate-800/80 bg-slate-900/70 space-y-2">
          <div className="flex flex-wrap gap-1.5 md:gap-2">
            <button
              onClick={() => setScope('all')}
              className={`px-2.5 md:px-3 py-1.5 rounded-lg text-[10px] md:text-xs font-bold border transition-colors ${scope === 'all' ? 'bg-cyan-800/50 border-cyan-500/50 text-cyan-100' : 'bg-slate-800/70 border-slate-700/70 text-slate-300 hover:border-slate-500'}`}
            >
              <span className="inline-flex items-center gap-1"><Globe size={12} /> Tum Hesaplar</span>
            </button>
            <button
              onClick={() => setScope('account')}
              className={`px-2.5 md:px-3 py-1.5 rounded-lg text-[10px] md:text-xs font-bold border transition-colors ${scope === 'account' ? 'bg-amber-800/45 border-amber-500/50 text-amber-100' : 'bg-slate-800/70 border-slate-700/70 text-slate-300 hover:border-slate-500'}`}
            >
              <span className="inline-flex items-center gap-1"><User size={12} /> Aktif Hesap</span>
            </button>
            <button
              onClick={() => setScope('character')}
              className={`px-2.5 md:px-3 py-1.5 rounded-lg text-[10px] md:text-xs font-bold border transition-colors ${scope === 'character' ? 'bg-violet-800/45 border-violet-500/50 text-violet-100' : 'bg-slate-800/70 border-slate-700/70 text-slate-300 hover:border-slate-500'}`}
            >
              <span className="inline-flex items-center gap-1"><Book size={12} /> Aktif Karakter</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr,180px,280px] gap-1.5 md:gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Esya, efsun, hesap, karakter veya konum ara..."
                className="w-full rounded-lg border border-slate-700/70 bg-slate-950/80 py-1.5 md:py-2 pl-9 pr-3 text-[11px] md:text-xs text-slate-100 placeholder:text-slate-500 outline-none focus:border-cyan-500/50"
              />
            </div>
            <div className="relative">
              <Filter size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as SummaryTypeFilter)}
                className="w-full appearance-none rounded-lg border border-slate-700/70 bg-slate-950/80 py-1.5 md:py-2 pl-9 pr-3 text-[11px] md:text-xs text-slate-200 outline-none focus:border-cyan-500/50"
              >
                <option value="all">Tum Turler</option>
                <option value="item">Sadece Item</option>
                <option value="recipe">Sadece Recete</option>
              </select>
            </div>
            <div ref={categoryMenuRef} className="relative">
              <button
                onClick={() => setIsCategoryMenuOpen((prev) => !prev)}
                className="w-full inline-flex items-center justify-between rounded-lg border border-slate-700/70 bg-slate-950/80 py-1.5 md:py-2 px-3 text-[11px] md:text-xs text-slate-200 outline-none hover:border-slate-500/70"
              >
                <span className="truncate text-left">
                  {categoryFilters.length === 0
                    ? 'Tum Kategoriler'
                    : `${categoryFilters.length} kategori secili`}
                </span>
                <ChevronDown
                  size={13}
                  className={`shrink-0 text-slate-400 transition-transform ${isCategoryMenuOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {isCategoryMenuOpen && (
                <div className="absolute z-30 mt-1 w-full rounded-lg border border-slate-700/80 bg-slate-950 shadow-xl max-h-56 overflow-auto">
                  <button
                    onClick={() => setCategoryFilters([])}
                    className={`w-full flex items-center justify-between px-3 py-2 text-[11px] border-b border-slate-800/70 transition-colors ${
                      categoryFilters.length === 0
                        ? 'bg-cyan-900/35 text-cyan-100'
                        : 'text-slate-300 hover:bg-slate-900/80'
                    }`}
                  >
                    <span>Tum Kategoriler</span>
                    {categoryFilters.length === 0 && <Check size={12} className="text-cyan-300" />}
                  </button>
                  {categoryOptions.map((category) => {
                    const selected = categoryFilters.includes(category);
                    return (
                      <button
                        key={category}
                        onClick={() => setCategoryFilters((prev) => (
                          prev.includes(category)
                            ? prev.filter((value) => value !== category)
                            : [...prev, category]
                        ))}
                        className={`w-full flex items-center justify-between px-3 py-2 text-[11px] transition-colors ${
                          selected
                            ? 'bg-emerald-900/30 text-emerald-100'
                            : 'text-slate-300 hover:bg-slate-900/80'
                        }`}
                      >
                        <span>{category}</span>
                        {selected && <Check size={12} className="text-emerald-300" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 grid-rows-[minmax(0,1.65fr)_minmax(0,1fr)] xl:grid-cols-[1.3fr,1fr] xl:grid-rows-1">
          <div className="min-h-0 border-b xl:border-b-0 xl:border-r border-slate-800/80 bg-slate-950/35">
            <div className="h-full overflow-y-auto overflow-x-hidden">
              <table className="w-full text-left table-fixed">
                <thead className="sticky top-0 z-10 bg-slate-900/95 border-b border-slate-700/80">
                  <tr className="text-[10px] md:text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="w-[72%] md:w-auto px-2 md:px-3 py-1.5 md:py-2 font-semibold">Esya</th>
                    <th className="hidden md:table-cell px-3 py-2 font-semibold">Sinif</th>
                    <th className="w-[88px] md:w-[110px] px-2 md:px-3 py-1.5 md:py-2 font-semibold text-right">Adet</th>
                    <th className="hidden md:table-cell px-3 py-2 font-semibold">Kapsam</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedRows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-slate-500 text-sm">
                        Secilen kapsamda kayit bulunamadi.
                      </td>
                    </tr>
                  )}
                  {groupedRows.map(row => {
                    const isSelected = row.key === selectedGroupKey;
                    const isRecipe = row.item.type === 'Recipe';
                    const isTalisman = normalizeToken(row.item.category) === 'tilsim';
                    const talismanTier = isTalisman ? resolveTalismanTier(row.item) : '-';
                    const combinedPrimaryText = isTalisman
                      ? `${getItemPrimaryLabel(row.item)}${talismanTier !== '-' ? ` ( ${talismanTier} )` : ''}`
                      : (row.item.enchantment2 ? `${getItemPrimaryLabel(row.item)} ${row.item.enchantment2}` : getItemPrimaryLabel(row.item));
                    return (
                      <tr
                        key={row.key}
                        onClick={() => setSelectedGroupKey(row.key)}
                        className={`border-b border-slate-800/70 cursor-pointer transition-colors ${isSelected ? 'bg-cyan-950/35' : 'hover:bg-slate-900/45'}`}
                      >
                        <td className="px-2 md:px-3 py-2 md:py-2.5 align-top">
                          <div className="flex items-start gap-1.5 md:gap-2 min-w-0">
                            <span className={`mt-0.5 inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] md:text-[10px] font-bold shrink-0 ${isRecipe ? 'border-purple-500/45 bg-purple-900/35 text-purple-100' : 'border-emerald-500/45 bg-emerald-900/30 text-emerald-100'}`}>
                              {isRecipe ? 'RECETE' : 'ITEM'}
                            </span>
                            <div className="min-w-0">
                              <div className="text-[10px] md:text-[13px] leading-tight text-slate-100 font-semibold whitespace-normal break-words">{combinedPrimaryText}</div>
                              <div className="text-[10px] md:text-[11px] text-slate-400 truncate">
                                {row.item.category}
                                {row.item.weaponType ? ` • ${row.item.weaponType}` : ''}
                                {normalizeToken(row.item.category) === 'tilsim' ? ` • ${resolveTalismanColor(row.item)}` : ''}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="hidden md:table-cell px-3 py-2.5 align-top text-[11px] text-slate-300">{row.item.heroClass}</td>
                        <td className="px-2 md:px-3 py-2 md:py-2.5 align-top text-right">
                          <span className="inline-flex min-w-[44px] md:min-w-[52px] items-center justify-center rounded-md border border-emerald-700/60 bg-emerald-950/35 px-1.5 md:px-2 py-0.5 md:py-1 text-[11px] md:text-xs font-bold text-emerald-200">
                            x{row.totalCount}
                          </span>
                        </td>
                        <td className="hidden md:table-cell px-3 py-2.5 align-top">
                          <div className="text-[11px] text-slate-300">{row.accountCount} hesap</div>
                          <div className="text-[10px] text-slate-500">{row.characterCount} karakter</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="min-h-0 flex flex-col bg-slate-950/55">
            {!selectedGroup ? (
              <div className="h-full flex items-center justify-center text-sm text-slate-500 p-6 text-center">
                Detay gormek icin soldan bir satir secin.
              </div>
            ) : (
              <>
                <div className="px-2.5 md:px-4 py-1.5 md:py-3 border-b border-slate-800/70 bg-slate-900/60">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] md:text-sm font-bold text-slate-100 truncate">
                        {`${getItemPrimaryLabel(selectedGroup.item)}${
                          normalizeToken(selectedGroup.item.category) === 'tilsim' && resolveTalismanTier(selectedGroup.item) !== '-'
                            ? ` ( ${resolveTalismanTier(selectedGroup.item)} )`
                            : ''
                        }`}
                      </div>
                      <div className="text-[10px] md:text-[11px] text-slate-400 mt-0.5 truncate">
                        {selectedGroup.item.category} • {selectedGroup.item.type === 'Recipe' ? 'Recete' : 'Item'} • Lv.{selectedGroup.item.level}
                      </div>
                    </div>
                    <span className="inline-flex items-center rounded-md border border-emerald-700/60 bg-emerald-950/35 px-1.5 md:px-2 py-0.5 md:py-1 text-[10px] md:text-xs font-bold text-emerald-200">
                      x{selectedGroup.totalCount}
                    </span>
                  </div>
                </div>

                <div className="hidden md:block px-2.5 md:px-4 py-1 md:py-1.5 border-b border-slate-800/70 bg-slate-900/40 text-[10px] md:text-[11px] text-slate-400">
                  {selectedGroup.uniqueLocationCount} lokasyon
                </div>

                <div className="flex-1 min-h-0 overflow-auto p-2 md:p-3 space-y-1.5 md:space-y-2">
                  {selectedGroup.entries.map((entry, index) => (
                    <div key={`${selectedGroup.key}_${index}`} className="rounded-lg border border-slate-800/75 bg-slate-900/40 px-2 md:px-3 py-1.5 md:py-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[11px] md:text-xs text-slate-100 font-semibold truncate">{entry.accountName}</div>
                          <div className="text-[10px] md:text-[11px] text-slate-400 truncate">{entry.serverName} • {entry.charName}</div>
                          <div className="hidden md:block text-[11px] text-slate-500 truncate">{entry.containerName}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] text-cyan-300 font-semibold whitespace-nowrap">{getTinyLocationLabel(entry)}</div>
                          {entry.quantity > 1 && (
                            <div className="text-[10px] text-emerald-300 mt-1">x{entry.quantity}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
