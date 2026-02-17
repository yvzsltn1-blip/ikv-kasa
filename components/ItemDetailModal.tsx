import React from 'react';
import { ItemData, GlobalSetInfo, SetItemLocation, shouldShowBoundMarker, createSetEnchantmentKey } from '../types';
import { CLASS_COLORS, SET_CATEGORIES } from '../constants';
import {
  X,
  Pencil,
  Scroll,
  Shield,
  Sword,
  Component,
  Hand,
  Footprints,
  Shirt,
  Glasses,
  Beaker,
  CircleDot,
  Lasso,
  Sparkles,
  Columns,
  Pickaxe,
  Globe,
  AlertTriangle,
  Copy,
} from 'lucide-react';
import { SetDetailModal } from './SetDetailModal';

interface TalismanLocation {
  containerId?: string;
  containerName: string;
  row: number;
  col: number;
}

interface ItemDetailModalProps {
  item: ItemData | null;
  onClose: () => void;
  onEdit: () => void;
  onCopy?: () => void;
  onCraftTalismanDuplicates?: () => void;
  talismanLocations?: TalismanLocation[] | null;
  globalSetLookup?: Map<string, GlobalSetInfo>;
  globalSetMap?: Map<string, SetItemLocation[]>;
}

const getCategoryIcon = (category: string) => {
  switch (category) {
    case 'Silah':
      return Sword;
    case 'Ceket':
      return Shirt;
    case 'Pantolon':
      return Columns;
    case 'Eldiven':
      return Hand;
    case 'Ayakkab\u0131':
      return Footprints;
    case 'G\u00f6zl\u00fck':
      return Glasses;
    case 'Z\u0131rh':
      return Shield;
    case 'Y\u00fcz\u00fck':
      return CircleDot;
    case 'Kolye':
      return Lasso;
    case 'Maden':
      return Pickaxe;
    case '\u0130ksir':
      return Beaker;
    case 'T\u0131ls\u0131m':
      return Sparkles;
    default:
      return Component;
  }
};

const resolveTalismanTier = (item: Pick<ItemData, 'talismanTier' | 'enchantment2'>): '-' | 'I' | 'II' | 'III' => {
  const direct = String(item.talismanTier || '').trim().toUpperCase();
  if (direct === '-') return '-';
  if (direct === 'I' || direct === 'II' || direct === 'III') return direct;

  const legacy = String(item.enchantment2 || '').trim().toUpperCase();
  if (legacy === '-') return '-';
  if (legacy === 'I' || legacy === 'II' || legacy === 'III') return legacy;

  return '-';
};

const resolveTalismanColor = (item: Pick<ItemData, 'enchantment2'>): 'Mavi' | 'K\u0131rm\u0131z\u0131' => {
  const token = String(item.enchantment2 || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('tr')
    .replace(/\u0131/g, 'i');

  if (token === 'kirmizi') return 'K\u0131rm\u0131z\u0131';
  return 'Mavi';
};

export const ItemDetailModal: React.FC<ItemDetailModalProps> = ({
  item,
  onClose,
  onEdit,
  onCopy,
  onCraftTalismanDuplicates,
  talismanLocations,
  globalSetLookup,
  globalSetMap,
}) => {
  const [showSetDetail, setShowSetDetail] = React.useState(false);
  const [setDetailKey, setSetDetailKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    setShowSetDetail(false);
    setSetDetailKey(null);
  }, [item?.id]);

  const currentSetInfo = React.useMemo(() => {
    if (!item) return null;
    if (!globalSetLookup || !SET_CATEGORIES.includes(item.category)) return null;
    if (!item.enchantment1 || item.enchantment1.trim() === '') return null;

    const enchKey = createSetEnchantmentKey(item.enchantment1, item.enchantment2);
    const globalKey = `${enchKey}|${item.gender}|${item.heroClass}`;
    const info = globalSetLookup.get(globalKey);
    return info ? { info, globalKey } : null;
  }, [globalSetLookup, item]);

  if (!item) return null;

  const CategoryIcon = getCategoryIcon(item.category);
  const isBound = shouldShowBoundMarker(item);

  const getGenderLabel = () => {
    if (item.gender === 'Erkek') return { text: 'Erkek', color: 'text-blue-300' };
    if (item.gender === 'Kad\u0131n') return { text: 'Kad\u0131n', color: 'text-pink-300' };
    return { text: 'T\u00fcm Cinsiyetler', color: 'text-amber-100' };
  };

  const gender = getGenderLabel();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-[2px] p-3 sm:p-4" onClick={onClose}>
      <div className="rpg-detail-shell relative w-[min(430px,92vw)] max-h-[92dvh] overflow-y-auto animate-in fade-in zoom-in duration-200" onClick={(e) => e.stopPropagation()}>
        <span aria-hidden="true" className="rpg-detail-corner rpg-detail-corner-tl" />
        <span aria-hidden="true" className="rpg-detail-corner rpg-detail-corner-tr" />
        <span aria-hidden="true" className="rpg-detail-corner rpg-detail-corner-bl" />
        <span aria-hidden="true" className="rpg-detail-corner rpg-detail-corner-br" />

        <div className="rpg-detail-header">
          <div className="rpg-detail-icon-wrap">
            {item.type === 'Recipe' ? (
              <div className="relative">
                <Scroll size={20} className="text-yellow-100" />
                <div className="absolute -bottom-1 -right-1 rounded-full p-[2px] border border-amber-300/40 bg-black/70">
                  <CategoryIcon size={10} className="text-white" />
                </div>
              </div>
            ) : (
              <CategoryIcon size={20} className="text-white" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className={`rpg-detail-title ${item.type === 'Recipe' ? '' : isBound ? 'text-amber-300 drop-shadow-[0_0_6px_rgba(251,191,36,0.8)]' : ''}`}>
              {item.category}
              {item.type === 'Recipe' && <span className="ml-1.5 text-[11px] text-yellow-300">{'(Re\u00e7ete)'}</span>}
              {isBound && <span className="ml-1.5 text-[11px] text-amber-200">(^)</span>}
            </div>
            {item.weaponType && <div className="rpg-detail-subtitle">{item.weaponType}</div>}
          </div>

          {item.count && item.count > 1 && <div className="rpg-detail-count">x{item.count}</div>}

          <button onClick={onClose} className="rpg-detail-close ml-1" aria-label="Kapat">
            <X size={16} />
          </button>
        </div>

        <div className="rpg-detail-body space-y-3">
          <div className="rpg-detail-meta-row">
            <div className={`${CLASS_COLORS[item.heroClass]} rpg-detail-class`}>{item.heroClass}</div>
            <div className="rpg-detail-level">Lv. {item.level}</div>
          </div>

          <div className="rpg-detail-gender">
            <span className="rpg-detail-label">Cinsiyet:</span>
            <span className={`text-sm font-bold ${gender.color}`}>{gender.text}</span>
          </div>

          {currentSetInfo && globalSetMap && (
            <button
              type="button"
              className={`rpg-detail-set-btn ${
                currentSetInfo.info.count >= 8
                  ? 'rpg-detail-set-btn-complete'
                  : currentSetInfo.info.count >= 4
                    ? 'rpg-detail-set-btn-mid'
                    : ''
              }`}
              onClick={() => {
                setSetDetailKey(currentSetInfo.globalKey);
                setShowSetDetail(true);
              }}
            >
              <span className="rpg-detail-set-label">SET</span>
              <div className="rpg-detail-progress-track">
                <div
                  className={`rpg-detail-progress-fill ${currentSetInfo.info.count >= 8 ? 'rpg-detail-progress-fill-complete' : ''}`}
                  style={{ width: `${(currentSetInfo.info.count / 8) * 100}%` }}
                />
              </div>
              <span
                className={`rpg-detail-set-ratio ${
                  currentSetInfo.info.count >= 8
                    ? 'text-emerald-300'
                    : currentSetInfo.info.count >= 4
                      ? 'text-amber-300'
                      : 'text-slate-300'
                }`}
              >
                {currentSetInfo.info.count}/8
              </span>
            </button>
          )}

          {item.type === 'Recipe' && (
            <div className={`inline-block rounded-md border px-2 py-1 text-xs font-bold ${item.isRead ? 'border-purple-400/50 bg-purple-900/35 text-purple-200' : 'border-slate-600 bg-slate-800/50 text-slate-400'}`}>
              {item.isRead ? 'Okunmu\u015f' : 'Okunmam\u0131\u015f'}
            </div>
          )}

          {(item.enchantment1 || item.enchantment2 || item.talismanTier) && (
            <div className="rpg-detail-enchant space-y-1.5">
              {item.category === 'Maden' ? (
                <div className="text-sm font-semibold text-orange-300">{item.enchantment1}</div>
              ) : item.category === 'T\u0131ls\u0131m' ? (
                <>
                  <div className="text-sm font-semibold text-purple-300">{item.enchantment1}</div>
                  <div className="text-xs text-purple-400">Renk: {resolveTalismanColor(item)}</div>
                  <div className="text-xs text-purple-400">Kademe: {resolveTalismanTier(item)}</div>
                </>
              ) : (
                <>
                  {item.enchantment1 && <div className="text-sm text-amber-100">- {item.enchantment1}</div>}
                  {item.enchantment2 && <div className="text-sm text-amber-100">- {item.enchantment2}</div>}
                </>
              )}
            </div>
          )}

          {item.isGlobal && (
            <div className="flex items-center gap-1 text-xs text-emerald-400">
              <Globe size={12} className="inline" />
              {'Globalde G\u00f6r\u00fcn\u00fcr'}
            </div>
          )}

          {talismanLocations && talismanLocations.length > 0 && (
            <div className="rounded-lg border border-amber-700/45 bg-amber-950/35 px-2.5 py-2 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                  <AlertTriangle size={10} />
                  {talismanLocations.length}x Duplikasyon
                </div>
                {onCraftTalismanDuplicates && talismanLocations.length >= 3 && (
                  <button
                    type="button"
                    onClick={onCraftTalismanDuplicates}
                    className="rounded border border-emerald-500/50 bg-emerald-900/35 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-200 transition-colors hover:bg-emerald-800/45"
                  >
                    Üret
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                {talismanLocations.map((loc, i) => {
                  const abbr = loc.containerName === 'Kasa 1' ? 'K1' : loc.containerName === 'Kasa 2' ? 'K2' : '\u00c7';
                  return (
                    <span key={i} className="text-[10px] text-amber-100/75">
                      {abbr} {loc.row}X{loc.col}
                      {i < talismanLocations.length - 1 ? ' -' : ''}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="rpg-detail-actions">
          {onCopy && (
            <button onClick={onCopy} className="rpg-detail-btn rpg-detail-btn-copy">
              <Copy size={15} />
              Kopyala
              <span className="hidden text-[10px] font-normal text-slate-300/80 md:inline">(Ctrl+C)</span>
            </button>
          )}
          <button onClick={onEdit} className="rpg-detail-btn rpg-detail-btn-edit">
            <Pencil size={16} />
            {'D\u00fczenle'}
          </button>
        </div>

        {globalSetMap && (
          <SetDetailModal
            isOpen={showSetDetail}
            onClose={() => {
              setShowSetDetail(false);
              setSetDetailKey(null);
            }}
            setKey={setDetailKey}
            setMap={globalSetMap}
          />
        )}
      </div>
    </div>
  );
};
