import React from 'react';
import { SetItemLocation } from '../types';
import { SET_CATEGORIES, CATEGORY_COLORS } from '../constants';
import { X, CheckCircle, Circle } from 'lucide-react';

interface SetDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  setKey: string | null; // "ench1_lower|ench2_lower|gender|heroClass"
  setMap: Map<string, SetItemLocation[]>;
}

export const SetDetailModal: React.FC<SetDetailModalProps> = ({ isOpen, onClose, setKey, setMap }) => {
  if (!isOpen || !setKey) return null;

  const locations = setMap.get(setKey) || [];
  const parts = setKey.split('|');
  const enchantment1 = parts[0] || '';
  const enchantment2 = parts[1] || '';

  // Group locations by category
  const categoryMap = new Map<string, SetItemLocation[]>();
  locations.forEach(loc => {
    if (!categoryMap.has(loc.category)) categoryMap.set(loc.category, []);
    categoryMap.get(loc.category)!.push(loc);
  });

  const uniqueCategories = new Set(locations.map(l => l.category));
  const count = uniqueCategories.size;
  const progressPercent = (count / 8) * 100;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm p-3" onClick={onClose}>
      <div
        className="bg-slate-800 border-2 border-slate-600 rounded-xl shadow-2xl w-[95vw] md:w-[440px] text-slate-200 relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - compact */}
        <div className="bg-slate-900 px-3 py-2.5 border-b border-slate-700">
          <div className="flex justify-between items-center">
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <span className={`text-sm font-bold shrink-0 ${count >= 8 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {count}/8
              </span>
              <div className="flex-1 bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-700">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${count >= 8 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors shrink-0 ml-3 p-0.5">
              <X size={18} />
            </button>
          </div>
          <div className="flex items-center gap-1.5 mt-1.5 text-[11px] truncate">
            {enchantment1 && <span className="text-yellow-300 font-semibold truncate">{enchantment1}</span>}
            {enchantment2 && <><span className="text-slate-600">+</span><span className="text-yellow-200/70 truncate">{enchantment2}</span></>}
          </div>
        </div>

        {/* 2-column grid - 4 rows x 2 cols = 8 categories, no scroll needed */}
        <div className="grid grid-cols-2 gap-1.5 p-2.5">
          {SET_CATEGORIES.map(cat => {
            const items = categoryMap.get(cat);
            const hasItem = items && items.length > 0;
            const firstLoc = hasItem ? items[0] : null;
            const catColor = CATEGORY_COLORS[cat] || 'bg-slate-700 border-slate-600';

            return (
              <div
                key={cat}
                className={`rounded-lg border p-1.5 transition-all ${
                  hasItem
                    ? `${catColor} bg-opacity-60`
                    : 'bg-slate-950/50 border-slate-800/60'
                }`}
              >
                {/* Category header */}
                <div className="flex items-center gap-1.5">
                  {hasItem
                    ? <CheckCircle size={13} className="text-emerald-400 shrink-0" />
                    : <Circle size={13} className="text-slate-600 shrink-0" />
                  }
                  <span className={`text-[11px] font-bold truncate ${hasItem ? 'text-white' : 'text-slate-500'}`}>
                    {cat}
                  </span>
                  {hasItem && firstLoc?.item && (
                    <span className="ml-auto text-[9px] px-1 py-px rounded bg-black/30 text-cyan-300 font-bold shrink-0">
                      Lv.{firstLoc.item.level}
                    </span>
                  )}
                </div>

                {/* Location info - compact single line */}
                {hasItem && firstLoc && (
                  <div className="mt-1 text-[9px] text-slate-300/70 truncate pl-5">
                    {firstLoc.accountName} &middot; {firstLoc.charName} &middot; {firstLoc.containerName}
                    {items.length > 1 && (
                      <span className="text-yellow-400/70 ml-1">+{items.length - 1}</span>
                    )}
                  </div>
                )}
                {!hasItem && (
                  <div className="mt-0.5 text-[9px] text-slate-600 pl-5">Eksik</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
