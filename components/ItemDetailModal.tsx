import React from 'react';
import { ItemData, GlobalSetInfo, SetItemLocation, shouldShowBoundMarker, createSetEnchantmentKey } from '../types';
import { CATEGORY_COLORS, CLASS_COLORS, SET_CATEGORIES } from '../constants';
import { X, Pencil, Scroll, Shield, Sword, Gem, Component, Hand, Footprints, Shirt, Glasses, Beaker, CircleDot, Lasso, Sparkles, Columns, Pickaxe, Globe, AlertTriangle, Copy } from 'lucide-react';
import { SetDetailModal } from './SetDetailModal';

interface TalismanLocation {
  containerName: string;
  row: number;
  col: number;
}

interface ItemDetailModalProps {
  item: ItemData | null;
  onClose: () => void;
  onEdit: () => void;
  onCopy?: () => void;
  talismanLocations?: TalismanLocation[] | null;
  globalSetLookup?: Map<string, GlobalSetInfo>;
  globalSetMap?: Map<string, SetItemLocation[]>;
}

const getCategoryIcon = (category: string) => {
  switch (category) {
    case 'Silah': return Sword;
    case 'Ceket': return Shirt;
    case 'Pantolon': return Columns;
    case 'Eldiven': return Hand;
    case 'Ayakkabı': return Footprints;
    case 'Gözlük': return Glasses;
    case 'Zırh': return Shield;
    case 'Yüzük': return CircleDot;
    case 'Kolye': return Lasso;
    case 'Maden': return Pickaxe;
    case 'İksir': return Beaker;
    case 'Tılsım': return Sparkles;
    default: return Component;
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
const resolveTalismanColor = (item: Pick<ItemData, 'enchantment2'>): 'Mavi' | 'Kırmızı' => {
  const token = String(item.enchantment2 || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i');
  if (token === 'kirmizi') return 'Kırmızı';
  return 'Mavi';
};

export const ItemDetailModal: React.FC<ItemDetailModalProps> = ({ item, onClose, onEdit, onCopy, talismanLocations, globalSetLookup, globalSetMap }) => {
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

  const colorClass = CATEGORY_COLORS[item.category] || 'bg-gray-700 border-gray-500';
  const CategoryIcon = getCategoryIcon(item.category);
  const isBound = shouldShowBoundMarker(item);

  const getGenderLabel = () => {
    if (item.gender === 'Erkek') return { text: 'Erkek', color: 'text-blue-400' };
    if (item.gender === 'Kadın') return { text: 'Kadın', color: 'text-pink-400' };
    return { text: 'Tüm Cinsiyetler', color: 'text-gray-300' };
  };
  const gender = getGenderLabel();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative bg-slate-900 border-2 border-yellow-500/50 rounded-xl shadow-[0_0_30px_rgba(0,0,0,0.9)] w-80 mx-4 animate-in fade-in zoom-in duration-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with category color */}
        <div className={`${colorClass} p-3 flex items-center gap-3 border-b-2`}>
          <div className="bg-black/30 rounded-lg p-2">
            {item.type === 'Recipe' ? (
              <div className="relative">
                <Scroll size={24} className="text-yellow-200" />
                <div className="absolute -bottom-1 -right-1 bg-slate-800/90 rounded-full p-[2px] border border-slate-500">
                  <CategoryIcon size={10} className="text-white" />
                </div>
              </div>
            ) : (
              <CategoryIcon size={24} className="text-white" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className={`font-bold text-base ${item.type === 'Recipe' ? 'text-white' : isBound ? 'text-amber-300 drop-shadow-[0_0_6px_rgba(251,191,36,0.8)]' : 'text-white'}`}>
              {item.category}
              {item.type === 'Recipe' && <span className="text-yellow-300 ml-1.5 text-sm">(Reçete)</span>}
              {isBound && <span className="text-amber-200 ml-1.5 text-sm">(^)</span>}
            </div>
            {item.weaponType && (
              <div className="text-red-300 text-xs font-semibold">{item.weaponType}</div>
            )}
          </div>
          {item.count && item.count > 1 && (
            <div className="bg-emerald-600 text-white text-sm font-bold px-2 py-0.5 rounded">
              x{item.count}
            </div>
          )}
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors ml-1"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          {/* Class + Level row */}
          <div className="flex items-center justify-between">
            <div className={`${CLASS_COLORS[item.heroClass]} font-bold text-sm`}>
              {item.heroClass}
            </div>
            <div className="bg-slate-800 text-green-400 text-sm font-bold px-3 py-1 rounded-full border border-slate-700">
              Lv. {item.level}
            </div>
          </div>

          {/* Gender */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-400">Cinsiyet:</span>
            <span className={`font-bold ${gender.color}`}>{gender.text}</span>
          </div>

          {/* Set progress */}
          {currentSetInfo && globalSetMap && (
            <button
              type="button"
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg border cursor-pointer hover:brightness-125 transition-all ${
                currentSetInfo.info.count >= 8
                  ? 'bg-emerald-950/60 border-emerald-700'
                  : currentSetInfo.info.count >= 4
                    ? 'bg-amber-950/60 border-amber-700'
                    : 'bg-slate-900/60 border-slate-700'
              }`}
              onClick={() => { setSetDetailKey(currentSetInfo.globalKey); setShowSetDetail(true); }}
            >
              <span className="text-[10px] font-bold text-slate-400 shrink-0">SET</span>
              <div className="flex-1 bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-800">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${currentSetInfo.info.count >= 8 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                  style={{ width: `${(currentSetInfo.info.count / 8) * 100}%` }}
                />
              </div>
              <span className={`text-[11px] font-bold shrink-0 ${currentSetInfo.info.count >= 8 ? 'text-emerald-400' : currentSetInfo.info.count >= 4 ? 'text-amber-400' : 'text-slate-400'}`}>
                {currentSetInfo.info.count}/8
              </span>
            </button>
          )}

          {/* Recipe status */}
          {item.type === 'Recipe' && (
            <div className={`text-xs font-bold px-2 py-1 rounded inline-block ${item.isRead ? 'bg-purple-900 border border-purple-600 text-purple-200' : 'bg-slate-800 border border-slate-600 text-slate-400'}`}>
              {item.isRead ? 'Okunmuş' : 'Okunmamış'}
            </div>
          )}

          {/* Enchantments */}
          {(item.enchantment1 || item.enchantment2 || item.talismanTier) && (
            <div className="bg-slate-800 p-3 rounded-lg border border-slate-700 space-y-1.5">
              {item.category === 'Maden' ? (
                <div className="text-orange-300 font-semibold text-sm">{item.enchantment1}</div>
              ) : item.category === 'Tılsım' ? (
                <>
                  <div className="text-purple-300 font-semibold text-sm">{item.enchantment1}</div>
                  <div className="text-purple-400 text-xs">Renk: {resolveTalismanColor(item)}</div>
                  <div className="text-purple-400 text-xs">Kademe: {resolveTalismanTier(item)}</div>
                </>
              ) : (
                <>
                  {item.enchantment1 && <div className="text-yellow-200 text-sm">• {item.enchantment1}</div>}
                  {item.enchantment2 && <div className="text-yellow-200 text-sm">• {item.enchantment2}</div>}
                </>
              )}
            </div>
          )}

          {/* Global visibility */}
          {item.isGlobal && (
            <div className="text-emerald-400 text-xs flex items-center gap-1">
              <Globe size={12} className="inline" />
              Globalde Görünür
            </div>
          )}

          {/* Talisman duplicate locations */}
          {talismanLocations && talismanLocations.length > 0 && (
            <div className="bg-amber-950/40 border border-amber-700/40 rounded-lg px-2.5 py-2 space-y-1">
              <div className="text-amber-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                <AlertTriangle size={10} />
                {talismanLocations.length}x Duplikasyon
              </div>
              <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                {talismanLocations.map((loc, i) => {
                  const abbr = loc.containerName === 'Kasa 1' ? 'K1' : loc.containerName === 'Kasa 2' ? 'K2' : 'Ç';
                  return (
                    <span key={i} className="text-amber-200/70 text-[10px]">
                      {abbr} {loc.row}X{loc.col}{i < talismanLocations.length - 1 ? ' -' : ''}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="p-4 pt-0 space-y-2">
          {onCopy && (
            <button
              onClick={onCopy}
              className="w-full py-2 bg-blue-700 hover:bg-blue-600 text-white font-bold rounded-lg text-sm flex items-center justify-center gap-2 transition-colors border border-blue-500"
            >
              <Copy size={15} />
              Kopyala
              <span className="text-blue-300/70 text-[10px] font-normal hidden md:inline">(Ctrl+C)</span>
            </button>
          )}
          <button
            onClick={onEdit}
            className="w-full py-2.5 bg-yellow-600 hover:bg-yellow-500 text-black font-bold rounded-lg text-sm flex items-center justify-center gap-2 transition-colors shadow-[0_0_10px_rgba(234,179,8,0.3)] border border-yellow-400"
          >
            <Pencil size={16} />
            Düzenle
          </button>
        </div>

        {globalSetMap && (
          <SetDetailModal
            isOpen={showSetDetail}
            onClose={() => { setShowSetDetail(false); setSetDetailKey(null); }}
            setKey={setDetailKey}
            setMap={globalSetMap}
          />
        )}
      </div>
    </div>
  );
};
