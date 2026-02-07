import React from 'react';
import { ItemData } from '../types';
import { CATEGORY_COLORS, CLASS_STRIP_COLORS } from '../constants';
import { Shield, Sword, Gem, Component, Scroll, Hand, Footprints, Shirt, Glasses, Beaker, CircleDot, Lasso, Sparkles, Columns, Pickaxe } from 'lucide-react';

interface SlotItemProps {
  item: ItemData;
  highlight?: boolean;
}

export const SlotItem: React.FC<SlotItemProps> = ({ item, highlight }) => {
  const colorClass = CATEGORY_COLORS[item.category] || 'bg-gray-700 border-gray-500';
  const classStripColor = CLASS_STRIP_COLORS[item.heroClass] || 'bg-gray-400';

  const getCategoryIcon = () => {
    switch (item.category) {
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

  const CategoryIcon = getCategoryIcon();

  const renderContent = () => {
    if (item.type === 'Recipe') {
      return (
        <div className="relative flex items-center justify-center">
          <Scroll className="text-yellow-200 w-4 h-4 md:w-6 md:h-6" />
          <div className="absolute -bottom-1.5 -right-1.5 md:-bottom-2 md:-right-2 bg-slate-800/90 rounded-full p-[2px] border border-slate-500 shadow-sm z-10">
            <CategoryIcon className="text-white w-2 h-2 md:w-3 md:h-3" />
          </div>
        </div>
      );
    }
    return <CategoryIcon className="w-4 h-4 md:w-6 md:h-6" />;
  };

  const getGenderCode = () => {
    if (item.gender === 'Erkek') return 'E';
    if (item.gender === 'Kadın') return 'K';
    return 'T';
  };

  const getGenderBadgeStyle = () => {
    if (item.gender === 'Erkek') return 'bg-gradient-to-b from-blue-500 to-blue-700 text-white';
    if (item.gender === 'Kadın') return 'bg-gradient-to-b from-pink-500 to-pink-700 text-white';
    return 'bg-gradient-to-b from-gray-500 to-gray-700 text-gray-100';
  };

  // Mobile-only: gender as colored text
  const getGenderTextColor = () => {
    if (item.gender === 'Erkek') return 'text-blue-400';
    if (item.gender === 'Kadın') return 'text-pink-400';
    return 'text-gray-400';
  };

  const getClassCode = () => {
    if (item.heroClass === 'Savaşçı') return 'SV';
    if (item.heroClass === 'Şifacı') return 'ŞF';
    if (item.heroClass === 'Büyücü') return 'BY';
    return 'TS';
  };

  const getClassTextColor = () => {
    if (item.heroClass === 'Savaşçı') return 'text-red-400';
    if (item.heroClass === 'Şifacı') return 'text-green-400';
    if (item.heroClass === 'Büyücü') return 'text-blue-400';
    return 'text-gray-300';
  };

  const getEnchantAbbr = () => {
    const parts: string[] = [];
    if (item.enchantment1) parts.push(item.enchantment1.substring(0, 3));
    if (item.enchantment2) parts.push(item.enchantment2.substring(0, 3));
    return parts.join(' ');
  };

  return (
    <div
      className={`
        w-full h-full rounded-md md:rounded-lg border-2 flex flex-col items-center justify-center relative overflow-hidden
        ${colorClass}
        ${highlight ? 'ring-2 ring-yellow-400/80 brightness-110' : ''}
        transition-all duration-200
        shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]
      `}
    >
      {/* Premium top shine */}
      <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/[0.1] to-transparent pointer-events-none z-0" />

      {/* Left class strip with gradient + enchantment abbreviations */}
      <div className={`absolute left-0 top-0 bottom-0 w-[7px] md:w-[13px] z-20 flex items-center justify-center overflow-hidden ${classStripColor}`}>
        <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-black/30" />
        {(item.enchantment1 || item.enchantment2) && (
          <span className="relative text-[5.5px] md:text-[9px] text-white font-bold leading-none whitespace-nowrap [writing-mode:vertical-rl] rotate-180 drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
            {getEnchantAbbr()}
          </span>
        )}
      </div>

      {/* === MOBILE: Single unified top bar === */}
      <div className="absolute top-0 left-[7px] right-0 flex items-center justify-between z-10 md:hidden">
        <div className="bg-black/60 rounded-br px-[2px] py-px flex items-center">
          <span className={`text-[6px] font-bold ${getGenderTextColor()}`}>{getGenderCode()}</span>
        </div>
        <div className="bg-black/60 rounded-bl px-[2px] py-px flex items-center gap-px">
          <span className={`text-[5px] font-bold ${getClassTextColor()}`}>{getClassCode()}</span>
          <span className="text-[6px] text-white font-mono font-bold">{item.level}</span>
        </div>
      </div>

      {/* === DESKTOP: Separate badges === */}
      <div className={`absolute top-0 left-[13px] ${getGenderBadgeStyle()} hidden md:block text-[9px] px-1.5 py-px rounded-br font-bold z-10 shadow-sm`}>
        {getGenderCode()}
      </div>
      <div className="absolute top-0 right-0 hidden md:flex items-center bg-black/70 rounded-bl z-10 overflow-hidden shadow-sm">
        <span className={`text-[8px] font-extrabold px-1 py-px ${getClassTextColor()}`}>{getClassCode()}</span>
        <span className="text-[10px] text-white font-mono font-bold px-1.5 py-px border-l border-white/15">{item.level}</span>
      </div>

      {/* Stack Count Badge */}
      {item.count && item.count > 1 && (
        <div className="absolute bottom-2.5 md:bottom-4 right-0.5 md:right-1 bg-black/80 text-[7px] md:text-[10px] px-0.5 md:px-1.5 rounded-sm border border-white/10 text-white font-mono font-bold z-20 shadow-lg">
          {item.count >= 1_000_000 ? `${Math.floor(item.count / 1_000_000)}M` : item.count >= 1_000 ? `${Math.floor(item.count / 1_000)}K` : item.count}
        </div>
      )}

      {/* Icon/Content */}
      <div className="text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] z-10">
        {renderContent()}
      </div>

      {/* Bottom bar: Full Category name - right aligned */}
      <div className="absolute bottom-0 left-0 right-0 z-10">
        <div className="text-right md:text-center text-[5.5px] md:text-[10px] bg-gradient-to-t from-black/80 via-black/40 to-transparent text-white truncate px-1 md:px-1.5 pt-0.5 md:pt-2 pb-px md:pb-0.5 font-semibold tracking-wide">
          {item.category}
        </div>
      </div>
    </div>
  );
};
