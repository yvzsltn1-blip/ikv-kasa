import React, { useEffect, useMemo, useState } from 'react';
import { ItemData, shouldShowBoundMarker } from '../types';
import { CATEGORY_COLORS, CLASS_STRIP_COLORS } from '../constants';
import { Scroll } from 'lucide-react';

// Custom RPG-style SVG Icons
const SwordIcon = () => (
  <svg viewBox="0 0 64 64" className="w-full h-full">
    <defs>
      <linearGradient id="swordGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fbbf24" />
        <stop offset="50%" stopColor="#f59e0b" />
        <stop offset="100%" stopColor="#d97706" />
      </linearGradient>
    </defs>
    {/* Blade */}
    <path d="M32 8 L38 28 L34 50 L30 50 L26 28 Z" fill="url(#swordGrad)" stroke="#92400e" strokeWidth="1.5"/>
    {/* Guard */}
    <rect x="22" y="50" width="20" height="4" rx="1" fill="#78716c" stroke="#44403c" strokeWidth="1"/>
    {/* Handle */}
    <rect x="30" y="54" width="4" height="8" rx="1" fill="#57534e" stroke="#292524" strokeWidth="1"/>
    {/* Pommel */}
    <circle cx="32" cy="62" r="2.5" fill="#78716c" stroke="#44403c" strokeWidth="1"/>
  </svg>
);

const ShieldIcon = () => (
  <svg viewBox="0 0 64 64" className="w-full h-full">
    <defs>
      <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#60a5fa" />
        <stop offset="50%" stopColor="#3b82f6" />
        <stop offset="100%" stopColor="#1d4ed8" />
      </linearGradient>
    </defs>
    {/* Shield body */}
    <path d="M32 8 L48 16 L48 32 Q48 48 32 58 Q16 48 16 32 L16 16 Z" fill="url(#shieldGrad)" stroke="#1e3a8a" strokeWidth="2"/>
    {/* Center emblem */}
    <circle cx="32" cy="30" r="8" fill="#dbeafe" opacity="0.3"/>
    <path d="M32 24 L36 30 L32 36 L28 30 Z" fill="#eff6ff" opacity="0.5"/>
  </svg>
);

const JacketIcon = () => (
  <svg viewBox="0 0 64 64" className="w-full h-full">
    <defs>
      <linearGradient id="jacketGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#bfdbfe" />
        <stop offset="100%" stopColor="#60a5fa" />
      </linearGradient>
    </defs>
    {/* Jacket body */}
    <path d="M20 16 L20 50 L28 50 L28 28 L36 28 L36 50 L44 50 L44 16 L38 12 L32 16 L26 12 Z" fill="url(#jacketGrad)" stroke="#1e40af" strokeWidth="1.5"/>
    {/* Collar */}
    <path d="M26 12 L28 18 L32 16 L36 18 L38 12" fill="#93c5fd" stroke="#1e40af" strokeWidth="1"/>
  </svg>
);

const PantsIcon = () => (
  <svg viewBox="0 0 64 64" className="w-full h-full">
    <defs>
      <linearGradient id="pantsGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#60a5fa" />
        <stop offset="100%" stopColor="#2563eb" />
      </linearGradient>
    </defs>
    {/* Left leg */}
    <path d="M24 16 L22 56 L28 56 L30 16 Z" fill="url(#pantsGrad)" stroke="#1e40af" strokeWidth="1.5"/>
    {/* Right leg */}
    <path d="M34 16 L36 56 L42 56 L40 16 Z" fill="url(#pantsGrad)" stroke="#1e40af" strokeWidth="1.5"/>
    {/* Waist */}
    <rect x="22" y="14" width="20" height="4" rx="1" fill="#1e40af" stroke="#1e3a8a" strokeWidth="1"/>
  </svg>
);

const GloveIcon = () => (
  <svg viewBox="0 0 64 64" className="w-full h-full">
    <defs>
      <linearGradient id="gloveGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#86efac" />
        <stop offset="100%" stopColor="#22c55e" />
      </linearGradient>
    </defs>
    {/* Palm */}
    <ellipse cx="32" cy="40" rx="12" ry="14" fill="url(#gloveGrad)" stroke="#15803d" strokeWidth="1.5"/>
    {/* Fingers */}
    <rect x="24" y="18" width="3" height="14" rx="1.5" fill="url(#gloveGrad)" stroke="#15803d" strokeWidth="1"/>
    <rect x="28.5" y="14" width="3" height="16" rx="1.5" fill="url(#gloveGrad)" stroke="#15803d" strokeWidth="1"/>
    <rect x="33" y="16" width="3" height="15" rx="1.5" fill="url(#gloveGrad)" stroke="#15803d" strokeWidth="1"/>
    <rect x="37.5" y="20" width="3" height="12" rx="1.5" fill="url(#gloveGrad)" stroke="#15803d" strokeWidth="1"/>
    {/* Wrist */}
    <rect x="24" y="52" width="16" height="6" rx="2" fill="#16a34a" stroke="#15803d" strokeWidth="1"/>
  </svg>
);

const BootIcon = () => (
  <svg viewBox="0 0 64 64" className="w-full h-full">
    <defs>
      <linearGradient id="bootGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fde047" />
        <stop offset="50%" stopColor="#facc15" />
        <stop offset="100%" stopColor="#eab308" />
      </linearGradient>
    </defs>
    {/* Boot shaft */}
    <rect x="26" y="16" width="12" height="26" rx="2" fill="url(#bootGrad)" stroke="#a16207" strokeWidth="1.5"/>
    {/* Boot sole */}
    <ellipse cx="32" cy="50" rx="14" ry="8" fill="#ca8a04" stroke="#a16207" strokeWidth="1.5"/>
    {/* Toe cap */}
    <path d="M26 44 Q32 48 38 44" fill="#fef08a" opacity="0.4"/>
  </svg>
);

const GlassesIcon = () => (
  <svg viewBox="0 0 64 64" className="w-full h-full">
    <defs>
      <linearGradient id="glassGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#cbd5e1" />
        <stop offset="100%" stopColor="#64748b" />
      </linearGradient>
    </defs>
    {/* Left lens */}
    <ellipse cx="22" cy="32" rx="10" ry="8" fill="url(#glassGrad)" stroke="#475569" strokeWidth="2" opacity="0.7"/>
    {/* Right lens */}
    <ellipse cx="42" cy="32" rx="10" ry="8" fill="url(#glassGrad)" stroke="#475569" strokeWidth="2" opacity="0.7"/>
    {/* Bridge */}
    <line x1="32" y1="32" x2="32" y2="32" stroke="#475569" strokeWidth="2"/>
    {/* Frame */}
    <path d="M12 32 L6 28 M52 32 L58 28" stroke="#475569" strokeWidth="2" fill="none"/>
  </svg>
);

const RingIcon = () => (
  <svg viewBox="0 0 64 64" className="w-full h-full">
    <defs>
      <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#c084fc" />
        <stop offset="100%" stopColor="#a855f7" />
      </linearGradient>
      <radialGradient id="gemGrad">
        <stop offset="0%" stopColor="#fdf4ff" />
        <stop offset="100%" stopColor="#e879f9" />
      </radialGradient>
    </defs>
    {/* Ring band */}
    <ellipse cx="32" cy="38" rx="16" ry="12" fill="none" stroke="url(#ringGrad)" strokeWidth="4"/>
    <ellipse cx="32" cy="38" rx="12" ry="8" fill="none" stroke="url(#ringGrad)" strokeWidth="2"/>
    {/* Gem */}
    <path d="M32 16 L38 24 L32 32 L26 24 Z" fill="url(#gemGrad)" stroke="#c026d3" strokeWidth="1.5"/>
    <circle cx="32" cy="24" r="2" fill="#fdf4ff" opacity="0.8"/>
  </svg>
);

const NecklaceIcon = () => (
  <svg viewBox="0 0 64 64" className="w-full h-full">
    <defs>
      <linearGradient id="necklaceGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#f0abfc" />
        <stop offset="100%" stopColor="#c026d3" />
      </linearGradient>
    </defs>
    {/* Chain */}
    <path d="M16 20 Q32 32 48 20" fill="none" stroke="url(#necklaceGrad)" strokeWidth="3" strokeLinecap="round"/>
    <path d="M20 22 Q32 30 44 22" fill="none" stroke="#d946ef" strokeWidth="2" opacity="0.6"/>
    {/* Pendant */}
    <circle cx="32" cy="42" r="10" fill="url(#necklaceGrad)" stroke="#a21caf" strokeWidth="2"/>
    <circle cx="32" cy="42" r="6" fill="#fdf4ff" opacity="0.3"/>
    <circle cx="32" cy="40" r="2" fill="#fdf4ff" opacity="0.8"/>
  </svg>
);

const PotionIcon = () => (
  <svg viewBox="0 0 64 64" className="w-full h-full">
    <defs>
      <linearGradient id="potionGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#c084fc" />
        <stop offset="50%" stopColor="#a855f7" />
        <stop offset="100%" stopColor="#7e22ce" />
      </linearGradient>
    </defs>
    {/* Bottle */}
    <path d="M28 16 L28 22 L24 26 L24 52 Q24 56 28 56 L36 56 Q40 56 40 52 L40 26 L36 22 L36 16 Z" fill="url(#potionGrad)" stroke="#581c87" strokeWidth="2" opacity="0.9"/>
    {/* Cork */}
    <rect x="28" y="12" width="8" height="6" rx="1" fill="#92400e" stroke="#78350f" strokeWidth="1"/>
    {/* Liquid shine */}
    <ellipse cx="32" cy="40" rx="8" ry="6" fill="#fdf4ff" opacity="0.2"/>
    <circle cx="30" cy="35" r="2" fill="#fdf4ff" opacity="0.5"/>
  </svg>
);

const TalismanIcon = ({ isRed = false }: { isRed?: boolean }) => (
  <svg viewBox="0 0 64 64" className="w-full h-full">
    <defs>
      <radialGradient id={isRed ? "talismanGradRed" : "talismanGradBlue"}>
        <stop offset="0%" stopColor={isRed ? "#fef3c7" : "#dbeafe"} />
        <stop offset="50%" stopColor={isRed ? "#f87171" : "#60a5fa"} />
        <stop offset="100%" stopColor={isRed ? "#dc2626" : "#1d4ed8"} />
      </radialGradient>
    </defs>
    {/* Outer glow */}
    <circle cx="32" cy="32" r="24" fill={`url(#${isRed ? "talismanGradRed" : "talismanGradBlue"})`} opacity="0.3"/>
    {/* Main symbol */}
    <circle cx="32" cy="32" r="18" fill={`url(#${isRed ? "talismanGradRed" : "talismanGradBlue"})`} stroke={isRed ? "#991b1b" : "#1e3a8a"} strokeWidth="2"/>
    {/* Inner rune pattern */}
    <path d="M32 20 L36 28 L44 28 L38 34 L40 42 L32 37 L24 42 L26 34 L20 28 L28 28 Z" fill={isRed ? "#fee2e2" : "#eff6ff"} opacity="0.7"/>
    {/* Center dot */}
    <circle cx="32" cy="32" r="4" fill={isRed ? "#fef2f2" : "#f0f9ff"} opacity="0.9"/>
  </svg>
);

const PickaxeIcon = () => (
  <svg viewBox="0 0 64 64" className="w-full h-full">
    <defs>
      <linearGradient id="pickGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#a8a29e" />
        <stop offset="100%" stopColor="#57534e" />
      </linearGradient>
    </defs>
    {/* Pick head */}
    <path d="M20 24 L28 20 L44 36 L40 40 Z" fill="url(#pickGrad)" stroke="#292524" strokeWidth="1.5"/>
    <path d="M44 20 L48 24 L32 40 L28 36 Z" fill="url(#pickGrad)" stroke="#292524" strokeWidth="1.5"/>
    {/* Handle */}
    <rect x="24" y="34" width="6" height="28" rx="2" fill="#78350f" stroke="#451a03" strokeWidth="1" transform="rotate(-45 28 48)"/>
  </svg>
);

const ComponentIcon = () => (
  <svg viewBox="0 0 64 64" className="w-full h-full">
    <defs>
      <linearGradient id="compGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#cbd5e1" />
        <stop offset="100%" stopColor="#64748b" />
      </linearGradient>
    </defs>
    {/* Box */}
    <rect x="18" y="18" width="28" height="28" rx="4" fill="url(#compGrad)" stroke="#475569" strokeWidth="2"/>
    {/* Question mark */}
    <text x="32" y="42" fontSize="24" fill="#f1f5f9" textAnchor="middle" fontWeight="bold">?</text>
  </svg>
);

const CATEGORY_ICON_FILES: Record<string, string> = {
  'Silah': 'silah.png',
  'Ceket': 'ceket.png',
  'Pantolon': 'pantolon.png',
  'Eldiven': 'eldiven.png',
  'Ayakkabı': 'ayakkabi.png',
  'Gözlük': 'gozluk.png',
  'Zırh': 'zirh.png',
  'Yüzük': 'yuzuk.png',
  'Kolye': 'kolye.png',
  'Maden': 'maden.png',
  'İksir': 'iksir.png',
  'Tılsım': 'tilsim.png',
  'Diğer': 'diger.png',
};

const getCategoryIconSources = (item: Pick<ItemData, 'category' | 'enchantment2'>): string[] => {
  if (item.category === 'Tılsım') {
    const text = String(item.enchantment2 || '').trim().toLocaleLowerCase('tr');
    if (text.includes('kırmızı') || text.includes('kirmizi')) {
      return ['/icons/tilsim-kirmizi.png', '/icons/tilsim.png'];
    }
    return ['/icons/tilsim-mavi.png', '/icons/tilsim.png'];
  }

  const file = CATEGORY_ICON_FILES[item.category] || 'diger.png';
  return [`/icons/${file}`];
};

interface SlotItemProps {
  item: ItemData;
  highlight?: boolean;
  talismanGlowColor?: string;
}

export const SlotItem: React.FC<SlotItemProps> = ({ item, highlight, talismanGlowColor }) => {
  // Tılsımlar için renk bilgisine göre arka plan ayarla
  const getTalismanColorClass = () => {
    if (item.category !== 'Tılsım') return null;
    const text = String(item.enchantment2 || '').trim().toLocaleLowerCase('tr');
    if (text.includes('kırmızı') || text.includes('kirmizi')) {
      return 'bg-red-900 border-red-700';
    }
    return 'bg-blue-900 border-blue-700';
  };

  const colorClass = getTalismanColorClass() || CATEGORY_COLORS[item.category] || 'bg-gray-700 border-gray-500';
  const classStripColor = CLASS_STRIP_COLORS[item.heroClass] || 'bg-gray-400';
  const isBound = shouldShowBoundMarker(item);
  const iconSources = useMemo(() => getCategoryIconSources(item), [item.category, item.enchantment2]);
  const [iconSourceIndex, setIconSourceIndex] = useState(0);
  const [useFallbackIcon, setUseFallbackIcon] = useState(false);

  useEffect(() => {
    setIconSourceIndex(0);
    setUseFallbackIcon(false);
  }, [item.category, item.enchantment2]);

  const getCategoryIconFallback = () => {
    const isRedTalisman = item.category === 'Tılsım' && getTalismanColorClass()?.includes('red');

    switch (item.category) {
      case 'Silah': return <SwordIcon />;
      case 'Ceket': return <JacketIcon />;
      case 'Pantolon': return <PantsIcon />;
      case 'Eldiven': return <GloveIcon />;
      case 'Ayakkabı': return <BootIcon />;
      case 'Gözlük': return <GlassesIcon />;
      case 'Zırh': return <ShieldIcon />;
      case 'Yüzük': return <RingIcon />;
      case 'Kolye': return <NecklaceIcon />;
      case 'Maden': return <PickaxeIcon />;
      case 'İksir': return <PotionIcon />;
      case 'Tılsım': return <TalismanIcon isRed={isRedTalisman} />;
      default: return <ComponentIcon />;
    }
  };

  const renderCategoryIcon = (sizeClass: string) => {
    if (useFallbackIcon) {
      return <div className={sizeClass}>{getCategoryIconFallback()}</div>;
    }

    const src = iconSources[Math.min(iconSourceIndex, iconSources.length - 1)];
    return (
      <img
        src={src}
        alt={item.category}
        className={`${sizeClass} object-contain`}
        draggable={false}
        onError={() => {
          if (iconSourceIndex < iconSources.length - 1) {
            setIconSourceIndex((prev) => prev + 1);
            return;
          }
          setUseFallbackIcon(true);
        }}
      />
    );
  };

  const renderContent = () => {
    if (item.type === 'Recipe') {
      return (
        <div className="relative flex items-center justify-center w-[70%] h-[70%] md:w-12 md:h-12">
          <Scroll className="text-yellow-200 w-[80%] h-[80%] md:w-10 md:h-10" />
          <div className="absolute bottom-0.5 right-0.5 md:-bottom-2 md:-right-2 bg-slate-800/90 rounded-full p-[2px] border border-slate-500 shadow-sm z-10 w-3 h-3 md:w-4 md:h-4">
            <div className="w-full h-full">
              {renderCategoryIcon('w-full h-full')}
            </div>
          </div>
        </div>
      );
    }
    return renderCategoryIcon('w-[70%] h-[70%] md:w-12 md:h-12');
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

  // Level formatı (sağ üst) - BY 59, TS 55 formatında
  const getLevelFormat = () => {
    const classCode = getClassCode();
    return `${classCode} ${item.level}`;
  };

  return (
    <div
      className={`
        w-full h-full rounded-lg md:rounded-xl flex flex-col items-center justify-center relative overflow-hidden md:overflow-visible
        premium-slot-border slot-corner-bolts
        ${highlight ? 'ring-2 ring-yellow-400/80 brightness-110' : ''}
        ${talismanGlowColor ? 'talisman-glow' : ''}
        transition-all duration-200
        shadow-[0_4px_12px_rgba(0,0,0,0.5)]
      `}
      style={talismanGlowColor ? { '--glow-color': talismanGlowColor } as React.CSSProperties : undefined}
    >
      {/* Corner bolts */}
      <span className="bolt-br" />
      <span className="bolt-bl" />

      {/* Darker metallic background */}
      <div className="absolute inset-0 rounded-lg md:rounded-xl overflow-hidden z-0" style={{
        background: item.type === 'Recipe'
          ? 'linear-gradient(135deg, #422006 0%, #713f12 50%, #422006 100%)'
          : item.category === 'Tılsım' && getTalismanColorClass()
            ? getTalismanColorClass()?.includes('red')
              ? 'linear-gradient(135deg, #450a0a 0%, #7f1d1d 50%, #450a0a 100%)'
              : 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 50%, #1e3a8a 100%)'
            : 'linear-gradient(135deg, #1e293b 0%, #334155 50%, #1e293b 100%)'
      }} />

      {/* Subtle shine */}
      <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/[0.08] to-transparent pointer-events-none z-0" />

      {/* Left class strip with gradient + enchantment abbreviations */}
      <div className={`absolute left-0 top-0 bottom-0 w-[6px] md:w-[14px] z-20 flex items-center justify-center overflow-hidden rounded-l-lg md:rounded-l-xl ${classStripColor}`}>
        <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-black/30" />
        {(item.enchantment1 || item.enchantment2) && (
          <span className="relative text-[4px] md:text-[9px] text-white font-bold leading-none whitespace-nowrap [writing-mode:vertical-rl] rotate-180 drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
            {getEnchantAbbr()}
          </span>
        )}
      </div>

      {/* === New Format: Gender Code (top-left) & Level Format (top-right) === */}
      {/* Top-left: Gender code (E / K / T) */}
      <div className="absolute top-0 left-[6px] md:left-[14px] w-3 h-3 md:w-4 md:h-4 bg-black/75 backdrop-blur-sm rounded-br-md z-30 border-r border-b border-white/10 flex items-center justify-center">
        <span className="text-[6px] md:text-[9px] text-amber-400 font-bold leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
          {getGenderCode()}
        </span>
      </div>

      {/* Top-right: Level format (BY 59, TS 55, etc.) */}
      <div className="absolute top-0 right-0 bg-black/70 backdrop-blur-sm px-0.5 md:px-1.5 py-[1px] md:py-0.5 rounded-bl-md z-30 border-l border-b border-white/10 flex items-center gap-0.5">
        <span className={`text-[5px] md:text-[9px] font-bold ${getClassTextColor()} drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]`}>
          {getClassCode()}
        </span>
        <span className="text-[6px] md:text-[10px] text-white font-mono font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
          {item.level}
        </span>
      </div>

      {/* Stack Count Badge */}
      {item.count && item.count > 1 && (
        <div className="absolute bottom-2.5 md:bottom-4 right-0.5 md:right-1 bg-black/80 text-[7px] md:text-[10px] px-0.5 md:px-1.5 rounded-sm border border-white/10 text-white font-mono font-bold z-20 shadow-lg">
          {item.count >= 1_000_000 ? `${Math.floor(item.count / 1_000_000)}M` : item.count >= 1_000 ? `${Math.floor(item.count / 1_000)}K` : item.count}
        </div>
      )}

      {/* Icon/Content */}
      <div className="text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] filter brightness-110 z-10">
        {renderContent()}
      </div>

      {/* Bottom bar: Full Category name - centered */}
      <div className="absolute bottom-0 left-0 right-0 z-10 rounded-b-lg md:rounded-b-xl overflow-hidden">
        <div className={`text-center text-[4px] md:text-[10px] bg-gradient-to-t from-black/90 via-black/60 to-transparent truncate px-0.5 md:px-1.5 pt-0.5 md:pt-2 pb-0 md:pb-1 font-bold tracking-normal md:tracking-wide ${isBound ? 'text-amber-300 drop-shadow-[0_0_6px_rgba(251,191,36,0.8)]' : 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]'}`}>
          {item.category}{isBound ? ' (^)' : ''}
        </div>
      </div>
    </div>
  );
};
