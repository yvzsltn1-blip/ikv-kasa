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

  // Helper to get the specific icon component for a category
  const getCategoryIcon = () => {
    switch (item.category) {
      case 'Silah': return Sword;       // Kılıç ikonu
      case 'Ceket': return Shirt;       // Gömlek ikonu
      case 'Pantolon': return Columns;  // İki sütun (Bacak gibi durduğu için)
      case 'Eldiven': return Hand;      // El ikonu
      case 'Ayakkabı': return Footprints; // Ayak izi
      case 'Gözlük': return Glasses;    // Gözlük
      case 'Zırh': return Shield;       // Kalkan
      case 'Yüzük': return CircleDot;   // Halka/Yüzük şekli
      case 'Kolye': return Lasso;       // İp/Kolye şekli
      case 'Maden': return Pickaxe;     // Kazma (Maden için)
      case 'İksir': return Beaker;      // Deney tüpü
      case 'Tılsım': return Sparkles;   // Parıltı/Büyü
      default: return Component;
    }
  };

  const CategoryIcon = getCategoryIcon();

  // Render logic combining Recipe status and Category
  const renderContent = () => {
    if (item.type === 'Recipe') {
      return (
        <div className="relative flex items-center justify-center">
          {/* Main Recipe Icon */}
          <Scroll size={18} className="text-yellow-200" />

          {/* Mini Category Overlay */}
          <div className="absolute -bottom-2 -right-2 bg-slate-800/90 rounded-full p-[2px] border border-slate-500 shadow-sm z-10">
            <CategoryIcon size={10} className="text-white" />
          </div>
        </div>
      );
    }

    // Normal Item
    return <CategoryIcon size={18} />;
  };

  // Short gender code
  const getGenderCode = () => {
    if (item.gender === 'Erkek') return 'E';
    if (item.gender === 'Kadın') return 'K';
    return 'T';
  };

  // Gender badge colors
  const getGenderBadgeStyle = () => {
    if (item.gender === 'Erkek') return 'bg-blue-600 text-blue-100';
    if (item.gender === 'Kadın') return 'bg-pink-600 text-pink-100';
    return 'bg-gray-600 text-gray-200';
  };

  // Short class code
  const getClassCode = () => {
    if (item.heroClass === 'Savaşçı') return 'SV';
    if (item.heroClass === 'Şifacı') return 'ŞF';
    if (item.heroClass === 'Büyücü') return 'BY';
    return 'TS';
  };

  // Class badge text color
  const getClassTextColor = () => {
    if (item.heroClass === 'Savaşçı') return 'text-red-400';
    if (item.heroClass === 'Şifacı') return 'text-green-400';
    if (item.heroClass === 'Büyücü') return 'text-blue-400';
    return 'text-gray-300';
  };

  return (
    <div
      className={`
        w-full h-full rounded-sm border-2 flex flex-col items-center justify-center relative shadow-sm overflow-hidden
        ${colorClass}
        ${highlight ? 'ring-2 ring-yellow-400 brightness-125' : ''}
        transition-all duration-200
      `}
    >
      {/* Hero Class Strip - left colored border */}
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${classStripColor} z-20`} />

      {/* Level Badge (Top Right) */}
      <div className="absolute top-0 right-0 bg-black/70 text-[7px] px-0.5 rounded-bl-sm text-white font-mono z-10">
        {item.level}
      </div>

      {/* Gender Badge (Top Left) - more prominent */}
      <div className={`absolute top-0 left-[3px] ${getGenderBadgeStyle()} text-[7px] px-1 rounded-br-sm font-bold z-10`}>
        {getGenderCode()}
      </div>

      {/* Stack Count Badge */}
      {item.count && item.count > 1 && (
        <div className="absolute bottom-3 right-0.5 bg-black/80 text-[9px] px-1 rounded border border-gray-600 text-white font-mono font-bold z-20 shadow-lg">
            {item.count}
        </div>
      )}

      {/* Icon/Content */}
      <div className="text-white/90 drop-shadow-md z-10">
        {renderContent()}
      </div>

      {/* Bottom bar: Category + Class */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center z-10">
        <div className="flex-1 text-center text-[7px] bg-black/50 text-white truncate px-0.5">
          {item.category.substring(0, 3)}
        </div>
        <div className={`text-[7px] bg-black/70 px-0.5 font-bold ${getClassTextColor()}`}>
          {getClassCode()}
        </div>
      </div>
    </div>
  );
};
