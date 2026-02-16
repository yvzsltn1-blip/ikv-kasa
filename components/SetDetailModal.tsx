import React from 'react';
import { SetItemLocation } from '../types';
import { SET_CATEGORIES, CATEGORY_COLORS } from '../constants';
import { X, CheckCircle, Circle, MapPin, Sparkles, Shield, Scroll, BookOpen, BookX } from 'lucide-react';

interface SetDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  setKey: string | null; // "ench1_lower|ench2_lower|gender|heroClass"
  setMap: Map<string, SetItemLocation[]>;
}

export const SetDetailModal: React.FC<SetDetailModalProps> = ({ isOpen, onClose, setKey, setMap }) => {
  if (!isOpen || !setKey) return null;

  const locations = setMap.get(setKey) || [];

  // Orijinal büyük harfli efsun isimlerini ilk item'dan al (key lowercase tutuyor)
  const firstItem = locations.length > 0 ? locations[0].item : null;
  const enchantment1 = firstItem?.enchantment1 || '';
  const enchantment2 = firstItem?.enchantment2 || '';

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
        <div className={`shrink-0 relative overflow-hidden ${count >= 8 ? 'bg-gradient-to-br from-emerald-950 via-slate-900 to-emerald-950' : 'bg-gradient-to-br from-amber-950/80 via-slate-900 to-slate-900'}`}>
          {/* Decorative glow */}
          <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-32 h-16 rounded-full blur-2xl opacity-20 ${count >= 8 ? 'bg-emerald-400' : 'bg-amber-400'}`} />

          <div className="relative px-4 py-3 border-b border-white/10">
            {/* Mobile drag handle */}
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3 md:hidden" />

            {/* Top row: icon + title + close */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${count >= 8 ? 'bg-emerald-500/20 border border-emerald-500/30' : 'bg-amber-500/20 border border-amber-500/30'}`}>
                  {count >= 8
                    ? <Sparkles size={16} className="text-emerald-400" />
                    : <Shield size={16} className="text-amber-400" />
                  }
                </div>
                <div>
                  <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Set Durumu</h3>
                  <span className={`text-lg font-black leading-tight ${count >= 8 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {count}<span className="text-slate-500 font-medium">/8</span>
                  </span>
                </div>
              </div>
              <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors p-1 -mr-1">
                <X size={20} />
              </button>
            </div>

            {/* Progress bar */}
            <div className="bg-slate-950/60 rounded-full h-2 overflow-hidden border border-white/5 mb-3">
              <div
                className={`h-full rounded-full transition-all duration-700 ${count >= 8 ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : 'bg-gradient-to-r from-amber-600 to-amber-400'}`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Enchantment names */}
            <div className={`rounded-lg px-3 py-2 border ${count >= 8 ? 'bg-emerald-950/30 border-emerald-800/30' : 'bg-amber-950/20 border-amber-800/20'}`}>
              {enchantment1 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-500 shrink-0">1.</span>
                  <span className="text-[13px] font-bold text-yellow-200">{enchantment1}</span>
                </div>
              )}
              {enchantment2 && (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] text-slate-500 shrink-0">2.</span>
                  <span className="text-[13px] font-semibold text-yellow-300/70">{enchantment2}</span>
                </div>
              )}
            </div>
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
                    {items.map((loc, i) => {
                      const isRecipe = loc.item?.type === 'Recipe';
                      const isRead = loc.item?.isRead;
                      return (
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
                          <div className="flex items-center gap-1 shrink-0">
                            {isRecipe && (
                              <span className="flex items-center gap-0.5 text-[8px] px-1 py-0.5 rounded bg-amber-900/60 border border-amber-700/50 text-amber-300 font-bold">
                                <Scroll size={8} />
                                Reçete
                              </span>
                            )}
                            {isRecipe && (
                              isRead ? (
                                <span className="flex items-center gap-0.5 text-[8px] px-1 py-0.5 rounded bg-emerald-900/50 border border-emerald-700/40 text-emerald-300 font-medium">
                                  <BookOpen size={8} />
                                  Okunmuş
                                </span>
                              ) : (
                                <span className="flex items-center gap-0.5 text-[8px] px-1 py-0.5 rounded bg-red-900/50 border border-red-700/40 text-red-300 font-medium">
                                  <BookX size={8} />
                                  Okunmamış
                                </span>
                              )
                            )}
                            {loc.item && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-900/80 border border-slate-700/50 text-cyan-300 font-bold">
                                Lv.{loc.item.level}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
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
