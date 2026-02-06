import React from 'react';
import { SetItemLocation } from '../types';
import { SET_CATEGORIES, CATEGORY_COLORS } from '../constants';
import { X, CheckCircle, Circle, MapPin } from 'lucide-react';

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
    <div className="fixed inset-0 z-[120] flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-slate-800 border-2 border-slate-600 rounded-t-2xl md:rounded-xl shadow-2xl w-full md:w-[500px] text-slate-200 relative overflow-hidden flex flex-col max-h-[85vh] md:max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-slate-900 px-4 py-3 border-b border-slate-700 shrink-0">
          {/* Mobile drag handle */}
          <div className="w-10 h-1 bg-slate-600 rounded-full mx-auto mb-2 md:hidden" />

          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <span className={`text-base font-bold shrink-0 ${count >= 8 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {count}/8
              </span>
              <div className="flex-1 bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-700">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${count >= 8 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors shrink-0 ml-3 p-1 -mr-1">
              <X size={20} />
            </button>
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-xs">
            {enchantment1 && <span className="text-yellow-300 font-semibold">{enchantment1}</span>}
            {enchantment2 && <><span className="text-slate-600">+</span><span className="text-yellow-200/70">{enchantment2}</span></>}
          </div>
        </div>

        {/* Category list */}
        <div className="flex flex-col gap-1.5 p-3 overflow-y-auto flex-1 custom-scrollbar">
          {SET_CATEGORIES.map(cat => {
            const items = categoryMap.get(cat);
            const hasItem = items && items.length > 0;
            const catColor = CATEGORY_COLORS[cat] || 'bg-slate-700 border-slate-600';

            return (
              <div
                key={cat}
                className={`rounded-lg border transition-all ${
                  hasItem
                    ? `${catColor} bg-opacity-60`
                    : 'bg-slate-950/40 border-slate-800/50'
                }`}
              >
                {/* Category header */}
                <div className={`flex items-center gap-2 px-3 py-2 ${hasItem && items.length > 0 ? 'border-b border-white/5' : ''}`}>
                  {hasItem
                    ? <CheckCircle size={14} className="text-emerald-400 shrink-0" />
                    : <Circle size={14} className="text-slate-600 shrink-0" />
                  }
                  <span className={`text-xs font-bold ${hasItem ? 'text-white' : 'text-slate-500'}`}>
                    {cat}
                  </span>
                  {hasItem && items.length > 1 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-slate-300 font-medium">{items.length}x</span>
                  )}
                  {!hasItem && (
                    <span className="ml-auto text-[10px] text-slate-600 italic">Eksik</span>
                  )}
                </div>

                {/* Location rows */}
                {hasItem && (
                  <div className="px-2 py-1 space-y-1">
                    {items.map((loc, i) => (
                      <div key={i} className="flex items-center gap-1.5 bg-black/20 rounded-md px-2 py-1.5">
                        <MapPin size={10} className="text-slate-500 shrink-0" />
                        <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[10px]">
                          <span className="text-slate-100 font-semibold">{loc.accountName}</span>
                          <span className="text-slate-600">&rsaquo;</span>
                          <span className="text-emerald-300/90">{loc.serverName}</span>
                          <span className="text-slate-600">&rsaquo;</span>
                          <span className="text-blue-300/90">{loc.charName}</span>
                          <span className="text-slate-600">&rsaquo;</span>
                          <span className="text-yellow-300/90">{loc.containerName}</span>
                        </div>
                        {loc.item && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-900/80 border border-slate-700/50 text-cyan-300 font-bold shrink-0">
                            Lv.{loc.item.level}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
