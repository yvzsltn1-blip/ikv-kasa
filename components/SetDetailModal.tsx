import React from 'react';
import { SetItemLocation } from '../types';
import { SET_CATEGORIES } from '../constants';
import { X } from 'lucide-react';

interface SetDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  setKey: string | null; // "enchantment1|||enchantment2"
  setMap: Map<string, SetItemLocation[]>;
}

export const SetDetailModal: React.FC<SetDetailModalProps> = ({ isOpen, onClose, setKey, setMap }) => {
  if (!isOpen || !setKey) return null;

  const locations = setMap.get(setKey) || [];
  const [enchantment1, enchantment2] = setKey.split('|||');

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
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-slate-800 border-2 md:border-4 border-slate-600 rounded-xl shadow-2xl w-[93vw] md:w-[420px] max-h-[90vh] text-slate-200 relative overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-slate-900 p-3 border-b border-slate-700 shrink-0">
          <div className="flex justify-between items-start">
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-bold text-yellow-500 uppercase tracking-wider">Set Detay</h2>
              <div className="mt-1 space-y-0.5">
                {enchantment1 && <div className="text-xs text-yellow-200 truncate">{enchantment1}</div>}
                {enchantment2 && <div className="text-xs text-yellow-200/70 truncate">+ {enchantment2}</div>}
              </div>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors shrink-0 ml-2">
              <X size={20} />
            </button>
          </div>

          {/* Progress Bar */}
          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1 bg-slate-950 rounded-full h-3 overflow-hidden border border-slate-700">
              <div
                className={`h-full rounded-full transition-all duration-500 ${count >= 8 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className={`text-sm font-bold shrink-0 ${count >= 8 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {count}/8
            </span>
          </div>
        </div>

        {/* Category List */}
        <div className="overflow-y-auto flex-1 p-3 space-y-1.5">
          {SET_CATEGORIES.map(cat => {
            const items = categoryMap.get(cat);
            const hasItem = items && items.length > 0;

            return (
              <div
                key={cat}
                className={`rounded-lg border p-2 ${
                  hasItem
                    ? 'bg-slate-900/60 border-slate-700'
                    : 'bg-slate-950/40 border-slate-800/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${hasItem ? 'text-emerald-400' : 'text-red-400/60'}`}>
                    {hasItem ? '\u2705' : '\u274C'}
                  </span>
                  <span className={`text-xs font-bold ${hasItem ? 'text-slate-200' : 'text-slate-500'}`}>
                    {cat}
                  </span>
                  {!hasItem && <span className="text-[10px] text-slate-600 ml-auto">Eksik</span>}
                </div>

                {hasItem && items.map((loc, i) => (
                  <div key={i} className="ml-6 mt-1.5 text-[10px] text-slate-400 bg-slate-950/50 rounded p-1.5 border border-slate-800/50">
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-slate-300">{loc.accountName}</span>
                      <span className="text-slate-600">&rarr;</span>
                      <span className="text-emerald-400/80">{loc.serverName}</span>
                      <span className="text-slate-600">&rarr;</span>
                      <span className="text-blue-300/80">{loc.charName}</span>
                      <span className="text-slate-600">&rarr;</span>
                      <span className="text-yellow-400/80">{loc.containerName}</span>
                    </div>
                    {loc.row > 0 && (
                      <div className="text-slate-500 mt-0.5">
                        Sat\u0131r: {loc.row}, S\u00fctun: {loc.col}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="bg-slate-900 p-2 border-t border-slate-700 shrink-0">
          <button
            onClick={onClose}
            className="w-full py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-bold rounded-lg border border-slate-600 transition-colors"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
