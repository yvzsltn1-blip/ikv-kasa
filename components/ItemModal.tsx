import React, { useState, useEffect, useMemo } from 'react';
import { CATEGORY_OPTIONS, HeroClass, ItemData, SetItemLocation, GlobalSetInfo, isBindableCategory, createSetEnchantmentKey } from '../types';
import { HERO_CLASSES, GENDER_OPTIONS, SET_CATEGORIES } from '../constants';
import { X, BookOpen, CheckCircle, Circle, Layers, Sword, Globe, Lock } from 'lucide-react';
import { SetDetailModal } from './SetDetailModal';

type TalismanColor = 'Mavi' | 'Kırmızı';
type TalismanHeroClass = Exclude<HeroClass, 'Tüm Sınıflar'>;
type TalismanTier = '-' | 'I' | 'II' | 'III';
const TALISMAN_COLOR_OPTIONS: TalismanColor[] = ['Mavi', 'Kırmızı'];
const TALISMAN_TIER_OPTIONS: TalismanTier[] = ['-', 'I', 'II', 'III'];
const normalizeTalismanLookupToken = (value: unknown) => (
  String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
);
const normalizeTalismanColorValue = (value: unknown): TalismanColor | null => {
  const token = normalizeTalismanLookupToken(value);
  if (token === 'mavi') return 'Mavi';
  if (token === 'kirmizi') return 'Kırmızı';
  return null;
};
const normalizeTalismanTierValue = (value: unknown): TalismanTier | null => {
  const raw = String(value ?? '').trim().toUpperCase();
  if (raw === '-') return '-';
  if (raw === 'I' || raw === 'II' || raw === 'III') return raw as TalismanTier;
  if (raw === '1') return 'I';
  if (raw === '2') return 'II';
  if (raw === '3') return 'III';
  return null;
};

interface ItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: ItemData) => void;
  onDelete: () => void;
  onRead?: (item: ItemData) => void;
  existingItem: ItemData | null;
  enchantmentSuggestions?: string[];
  potionSuggestions?: string[];
  potionLevelMap?: Map<string, number>;
  mineSuggestions?: string[];
  mineLevelMap?: Map<string, number>;
  otherSuggestions?: string[];
  otherLevelMap?: Map<string, number>;
  glassesSuggestions?: string[];
  glassesLevelMap?: Map<string, number>;
  talismanSuggestions?: string[];
  talismanOptionMap?: Map<string, { color: TalismanColor; heroClass: TalismanHeroClass }[]>;
  weaponTypeSuggestions?: string[];
  globalSetLookup?: Map<string, GlobalSetInfo>;
  globalSetMap?: Map<string, SetItemLocation[]>;
}

export const ItemModal: React.FC<ItemModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  onRead,
  existingItem,
  enchantmentSuggestions = [],
  potionSuggestions = [],
  potionLevelMap = new Map<string, number>(),
  mineSuggestions = [],
  mineLevelMap = new Map<string, number>(),
  otherSuggestions = [],
  otherLevelMap = new Map<string, number>(),
  glassesSuggestions = [],
  glassesLevelMap = new Map<string, number>(),
  talismanSuggestions = [],
  talismanOptionMap = new Map<string, { color: TalismanColor; heroClass: TalismanHeroClass }[]>(),
  weaponTypeSuggestions = [],
  globalSetLookup,
  globalSetMap,
}) => {
  const [step, setStep] = useState(1);
  const [activeField, setActiveField] = useState<'enchantment1' | 'enchantment2' | 'weaponType' | null>(null);
  const [formData, setFormData] = useState<Partial<ItemData>>({
    type: 'Item',
    category: '',
    enchantment1: '',
    enchantment2: '',
    talismanTier: 'I',
    heroClass: 'Savaşçı',
    gender: 'Tüm Cinsiyetler',
    level: 1,
    isRead: false,
    count: 1,
    weaponType: '',
    isGlobal: false,
    isBound: false,
  });

  useEffect(() => {
    if (isOpen) {
      setActiveField(null);
      if (existingItem) {
        if (existingItem.category === 'Tılsım') {
          const resolvedColor = normalizeTalismanColorValue(existingItem.enchantment2) || 'Mavi';
          const resolvedTier = normalizeTalismanTierValue(existingItem.talismanTier)
            || normalizeTalismanTierValue(existingItem.enchantment2)
            || '-';
          setFormData({
            ...existingItem,
            enchantment2: resolvedColor,
            talismanTier: resolvedTier,
            level: 1,
            isBound: existingItem.isBound ?? false,
          });
        } else {
          setFormData({ ...existingItem, isBound: existingItem.isBound ?? false });
        }
        setStep(3); // Jump to details if editing
      } else {
        setFormData({
            type: 'Item',
            category: CATEGORY_OPTIONS[0],
            enchantment1: '',
            enchantment2: '',
            talismanTier: 'I',
            heroClass: 'Savaşçı',
            gender: 'Tüm Cinsiyetler',
            level: 1,
            isRead: false,
            count: 1,
            weaponType: '',
            isGlobal: false,
            isBound: false,
        });
        setStep(1);
      }
    }
  }, [isOpen, existingItem]);

  const filteredSuggestions = useMemo(() => {
    if (!activeField) return [];
    const text = (formData[activeField] || '').trim().toLocaleLowerCase('tr');
    if (!text) return [];
    let pool: string[] = [];
    if (activeField === 'weaponType') {
      pool = weaponTypeSuggestions;
    } else if (activeField === 'enchantment1') {
      if (formData.category === 'İksir') pool = potionSuggestions;
      else if (formData.category === 'Maden') pool = mineSuggestions;
      else if (formData.category === 'Diğer') pool = otherSuggestions;
      else if (formData.category === 'Gözlük') pool = glassesSuggestions;
      else if (formData.category === 'Tılsım') pool = talismanSuggestions;
      else pool = enchantmentSuggestions;
    } else {
      pool = enchantmentSuggestions;
    }
    return pool
      .filter(s => {
        const lower = s.toLocaleLowerCase('tr');
        return lower !== text && lower.includes(text);
      })
      .slice(0, 5);
  }, [activeField, formData.category, formData.enchantment1, formData.enchantment2, formData.weaponType, enchantmentSuggestions, potionSuggestions, mineSuggestions, otherSuggestions, glassesSuggestions, talismanSuggestions, weaponTypeSuggestions]);

  const blurTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Set detail modal state
  const [showSetDetail, setShowSetDetail] = useState(false);
  const [setDetailKey, setSetDetailKey] = useState<string | null>(null);

  // Current set info based on formData
  const currentSetInfo = useMemo(() => {
    if (!globalSetLookup || !formData.category || !SET_CATEGORIES.includes(formData.category)) return null;
    if (!formData.enchantment1 || formData.enchantment1.trim() === '') return null;

    const enchKey = createSetEnchantmentKey(formData.enchantment1 || '', formData.enchantment2 || '');
    const globalKey = `${enchKey}|${formData.gender || 'Tüm Cinsiyetler'}|${formData.heroClass || 'Savaşçı'}`;
    const info = globalSetLookup.get(globalKey);
    return info ? { info, globalKey } : null;
  }, [globalSetLookup, formData.category, formData.enchantment1, formData.enchantment2, formData.gender, formData.heroClass]);

  const handleNext = () => setStep((prev) => prev + 1);
  const handleBack = () => setStep((prev) => prev - 1);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.category && formData.type) {
      const normalizedGender = isGenderless ? 'Tüm Cinsiyetler' : (formData.gender || 'Erkek');
      const normalizedHeroClass = isClassless ? 'Tüm Sınıflar' : (formData.heroClass || 'Savaşçı');
      const fallbackLevel = Math.min(59, Math.max(1, Number(formData.level) || 1));
      const normalizedLevel = isAutoLevelCategory
        ? resolveAutoLevel(formData.category, formData.enchantment1 || '', fallbackLevel)
        : fallbackLevel;
      const normalizedBound = isBindableItemCategory ? Boolean(formData.isBound) : false;
      const normalizedTalismanColor = formData.category === 'Tılsım'
        ? (normalizeTalismanColorValue(formData.enchantment2) || 'Mavi')
        : null;
      const normalizedTalismanTier = formData.category === 'Tılsım'
        ? (normalizeTalismanTierValue(formData.talismanTier) || '-')
        : undefined;
      const normalizedEnchantment2 = (formData.category === 'İksir' || formData.category === 'Maden' || formData.category === 'Diğer' || formData.category === 'Gözlük')
        ? ''
        : (formData.category === 'Tılsım' ? normalizedTalismanColor! : (formData.enchantment2 || ''));
      const itemToSave: ItemData = {
        ...formData as ItemData,
        gender: normalizedGender,
        heroClass: normalizedHeroClass,
        level: normalizedLevel,
        enchantment2: normalizedEnchantment2,
        isBound: normalizedBound,
        id: existingItem?.id || crypto.randomUUID(),
      };
      if (normalizedTalismanTier) itemToSave.talismanTier = normalizedTalismanTier;
      else delete itemToSave.talismanTier;
      onSave(itemToSave);
      onClose();
    }
  };

  const handleRead = () => {
    if (existingItem && onRead) {
        onRead(existingItem);
        onClose();
    }
  };

  // Determine if the item supports stacking (Count)
  const isStackable = formData.category === 'Maden' || formData.category === 'İksir' || formData.category === 'Diğer';
  // Determine if item is a Weapon
  const isWeapon = formData.category === 'Silah';
  const isAutoLevelCategory = formData.category === 'Maden' || formData.category === 'Diğer' || formData.category === 'Gözlük' || formData.category === 'Tılsım' || formData.category === 'İksir';
  const genderlessCategories = ['Silah', 'Yüzük', 'Kolye', 'Tılsım', 'İksir', 'Maden', 'Diğer'];
  const classlessCategories = ['Gözlük', 'Yüzük', 'Kolye', 'İksir', 'Maden', 'Diğer'];
  const recipeBlockedCategories = ['Gözlük', 'Yüzük', 'Kolye'];
  const selectableCategories = formData.type === 'Recipe'
    ? CATEGORY_OPTIONS.filter(cat => !recipeBlockedCategories.includes(cat))
    : CATEGORY_OPTIONS;
  const isBindableItemCategory = formData.type === 'Item' && isBindableCategory(formData.category || '');
  // Categories that don't have gender selection
  const isGenderless = genderlessCategories.includes(formData.category || '');
  // Categories that don't have class selection
  const isClassless = classlessCategories.includes(formData.category || '');
  const talismanClassBaseOptions = useMemo(() => (
    HERO_CLASSES.filter(cls => cls !== 'Tüm Sınıflar') as TalismanHeroClass[]
  ), []);
  const talismanColorBaseOptions = useMemo(() => TALISMAN_COLOR_OPTIONS, []);
  const shouldShowLevelInput = !isAutoLevelCategory;
  const shouldRenderMetaRow = shouldShowLevelInput || isBindableItemCategory || isStackable;
  const metaRowGridClass = shouldShowLevelInput
    ? (isStackable && isBindableItemCategory ? 'grid-cols-2 sm:grid-cols-[110px_1fr_1fr]' : isStackable || isBindableItemCategory ? 'grid-cols-2 sm:grid-cols-[110px_1fr]' : 'grid-cols-1 sm:grid-cols-[110px]')
    : (isStackable && isBindableItemCategory ? 'grid-cols-2 sm:grid-cols-[1fr_1fr]' : 'grid-cols-1');

  const resolveAutoLevel = (category: string, nameValue: string, fallbackLevel: number) => {
    if (category === 'Tılsım') return 1;
    const key = nameValue.trim().toLocaleLowerCase('tr');
    if (!key) return fallbackLevel;
    if (category === 'İksir') return potionLevelMap.get(key) ?? fallbackLevel;
    if (category === 'Maden') return mineLevelMap.get(key) ?? fallbackLevel;
    if (category === 'Diğer') return otherLevelMap.get(key) ?? fallbackLevel;
    if (category === 'Gözlük') return glassesLevelMap.get(key) ?? fallbackLevel;
    return fallbackLevel;
  };

  const getPresetLevel = (category: string, nameValue: string): number | undefined => {
    const key = nameValue.trim().toLocaleLowerCase('tr');
    if (!key) return undefined;
    if (category === 'İksir') return potionLevelMap.get(key);
    if (category === 'Maden') return mineLevelMap.get(key);
    if (category === 'Diğer') return otherLevelMap.get(key);
    if (category === 'Gözlük') return glassesLevelMap.get(key);
    return undefined;
  };

  const potionPresetLevel = getPresetLevel('İksir', formData.enchantment1 || '');
  const minePresetLevel = getPresetLevel('Maden', formData.enchantment1 || '');
  const otherPresetLevel = getPresetLevel('Diğer', formData.enchantment1 || '');
  const glassesPresetLevel = getPresetLevel('Gözlük', formData.enchantment1 || '');

  const talismanMatchedOptions = useMemo(() => {
    if (formData.category !== 'Tılsım') return [];
    const key = (formData.enchantment1 || '').trim().toLocaleLowerCase('tr');
    if (!key) return [];
    return talismanOptionMap.get(key) || [];
  }, [formData.category, formData.enchantment1, talismanOptionMap]);

  const talismanClassOptions = useMemo(() => {
    if (talismanMatchedOptions.length === 0) return talismanClassBaseOptions;
    return talismanClassBaseOptions.filter(cls => talismanMatchedOptions.some(option => option.heroClass === cls));
  }, [talismanClassBaseOptions, talismanMatchedOptions]);

  const talismanResolvedClass = useMemo(() => {
    if (formData.category !== 'Tılsım') return formData.heroClass as TalismanHeroClass;
    const current = formData.heroClass as TalismanHeroClass | undefined;
    if (current && talismanClassOptions.includes(current)) return current;
    return talismanClassOptions[0] || 'Savaşçı';
  }, [formData.category, formData.heroClass, talismanClassOptions]);

  const talismanColorOptions = useMemo(() => {
    if (talismanMatchedOptions.length === 0) return talismanColorBaseOptions;
    const colors = talismanColorBaseOptions.filter(color => talismanMatchedOptions.some(option => (
      option.heroClass === talismanResolvedClass && option.color === color
    )));
    return colors.length > 0 ? colors : talismanColorBaseOptions;
  }, [talismanColorBaseOptions, talismanMatchedOptions, talismanResolvedClass]);

  const talismanResolvedColor = useMemo(() => {
    const current = normalizeTalismanColorValue(formData.enchantment2);
    if (current && talismanColorOptions.includes(current)) return current;
    return talismanColorOptions[0] || 'Mavi';
  }, [formData.enchantment2, talismanColorOptions]);

  const talismanResolvedTier = useMemo(() => {
    const current = normalizeTalismanTierValue(formData.talismanTier);
    if (current && TALISMAN_TIER_OPTIONS.includes(current)) return current;
    return '-';
  }, [formData.talismanTier]);

  const isTalismanClassLocked = formData.category === 'Tılsım' && talismanMatchedOptions.length > 0 && talismanClassOptions.length === 1;
  const isTalismanColorLocked = formData.category === 'Tılsım' && talismanMatchedOptions.length > 0 && talismanColorOptions.length === 1;
  const canSelectMaviForTalisman = talismanColorOptions.includes('Mavi');
  const canSelectKirmiziForTalisman = talismanColorOptions.includes('Kırmızı');

  useEffect(() => {
    if (formData.category !== 'Tılsım') return;
    const nextHeroClass = talismanResolvedClass;
    const nextColor = talismanResolvedColor;
    const nextTier = talismanResolvedTier;
    const nextLevel = 1;

    if (
      formData.heroClass !== nextHeroClass ||
      formData.enchantment2 !== nextColor ||
      formData.talismanTier !== nextTier ||
      formData.level !== nextLevel
    ) {
      setFormData(prev => ({
        ...prev,
        heroClass: nextHeroClass,
        enchantment2: nextColor,
        talismanTier: nextTier,
        level: nextLevel,
      }));
    }
  }, [formData.category, formData.heroClass, formData.enchantment2, formData.talismanTier, formData.level, talismanResolvedClass, talismanResolvedColor, talismanResolvedTier]);

  const handleFieldBlur = () => {
    blurTimeout.current = setTimeout(() => setActiveField(null), 150);
  };
  const handleSuggestionClick = (field: 'enchantment1' | 'enchantment2' | 'weaponType', value: string) => {
    if (blurTimeout.current) clearTimeout(blurTimeout.current);
    if (field === 'enchantment1' && isAutoLevelCategory) {
      const nextLevel = resolveAutoLevel(formData.category || '', value, Math.min(59, Math.max(1, Number(formData.level) || 1)));
      setFormData({
        ...formData,
        enchantment1: value,
        enchantment2: (formData.category === 'İksir' || formData.category === 'Maden' || formData.category === 'Diğer' || formData.category === 'Gözlük')
          ? ''
          : formData.enchantment2,
        level: nextLevel,
      });
    } else {
      setFormData({ ...formData, [field]: value });
    }
    setActiveField(null);
  };

  if (!isOpen) return null;

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-2 sm:p-4">
      <div className="bg-gradient-to-b from-slate-800 to-slate-900 border border-slate-600/80 sm:border-2 md:border-4 rounded-xl shadow-[0_30px_80px_rgba(0,0,0,0.7)] w-[96vw] sm:w-[93vw] md:w-[560px] h-auto max-h-[92dvh] sm:max-h-[92vh] text-slate-200 relative overflow-hidden">

        {/* Header */}
        <div className="bg-slate-900/95 px-3 py-2 md:p-3 border-b border-slate-700 flex justify-between items-center">
          <h2 className="text-[13px] md:text-lg font-bold text-yellow-500 uppercase tracking-wider">
            {existingItem ? 'Eşya Düzenle' : 'Yeni Eşya Ekle'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[calc(92dvh-56px)] sm:max-h-[calc(92vh-56px)] p-2.5 sm:p-3 md:p-5 flex flex-col overflow-y-auto">
          <div className="-mt-0.5 mb-1.5 flex items-center gap-1.5 px-1">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-colors ${step >= s ? 'bg-yellow-500' : 'bg-slate-700'}`}
              />
            ))}
          </div>

          {/* STEP 1: Type Selection */}
          {step === 1 && (
            <div className="flex-1 flex flex-col justify-center gap-3 sm:gap-4">
              <h3 className="text-center mb-4 font-semibold text-slate-300">Tür Seçiniz</h3>
              <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
                <button
                  onClick={() => { setFormData({ ...formData, type: 'Item', isRead: false, isBound: false }); handleNext(); }}
                  className="p-3 sm:p-4 bg-slate-800/80 hover:bg-slate-700 border border-slate-500 rounded-lg sm:rounded-xl flex flex-col items-center gap-2 transition-all hover:scale-[1.02] hover:border-yellow-500/70"
                >
                  <span className="text-2xl">⚔️</span>
                  <span className="font-bold">İtem</span>
                </button>
                <button
                  onClick={() => { setFormData({ ...formData, type: 'Recipe', isRead: false, isBound: false }); handleNext(); }}
                  className="p-3 sm:p-4 bg-slate-800/80 hover:bg-slate-700 border border-slate-500 rounded-lg sm:rounded-xl flex flex-col items-center gap-2 transition-all hover:scale-[1.02] hover:border-yellow-500/70"
                >
                  <span className="text-2xl">📜</span>
                  <span className="font-bold">Reçete</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Category Selection */}
          {step === 2 && (
            <div className="flex-1 flex flex-col gap-3 overflow-hidden">
               
               {/* Recipe Status Selection (Only if Type is Recipe) */}
               {formData.type === 'Recipe' && (
                  <div className="bg-slate-900/70 p-2 rounded-lg border border-slate-700">
                      <h4 className="text-[10px] text-slate-400 font-bold mb-2 uppercase text-center">Reçete Durumu</h4>
                      <div className="grid grid-cols-2 gap-1.5">
                          <button
                            onClick={() => setFormData({...formData, isRead: false})}
                            className={`flex items-center justify-center gap-1 py-1.5 rounded text-[11px] font-bold border transition-colors ${!formData.isRead ? 'bg-yellow-600 text-black border-yellow-500' : 'bg-slate-800 text-slate-400 border-slate-600 hover:bg-slate-700'}`}
                          >
                             {/* Icon for Unread */}
                             {!formData.isRead ? <CheckCircle size={12}/> : <Circle size={11}/>}
                             Okunmamış
                          </button>
                          <button
                            onClick={() => setFormData({...formData, isRead: true})}
                            className={`flex items-center justify-center gap-1 py-1.5 rounded text-[11px] font-bold border transition-colors ${formData.isRead ? 'bg-purple-600 text-white border-purple-400' : 'bg-slate-800 text-slate-400 border-slate-600 hover:bg-slate-700'}`}
                          >
                             {formData.isRead ? <CheckCircle size={10}/> : <Circle size={11}/>}
                             Okunmuş (Üretim)
                          </button>
                      </div>
                  </div>
               )}

               <h3 className="text-center mb-2 font-semibold text-slate-300">Sınıf Seçiniz</h3>
               <div className="grid grid-cols-4 sm:grid-cols-3 gap-1.5 sm:gap-2">
                 {selectableCategories.map((cat) => (
                    <button
                     key={cat}
                      onClick={() => {
                       const genderless = genderlessCategories.includes(cat);
                       const classless = classlessCategories.includes(cat);
                        const nextLevel = (cat === 'Tılsım' || cat === 'Maden' || cat === 'Diğer' || cat === 'Gözlük' || cat === 'İksir')
                          ? 1
                          : Math.min(59, Math.max(1, Number(formData.level) || 1));
                        setFormData({
                          ...formData,
                          category: cat,
                          gender: genderless ? 'Tüm Cinsiyetler' : (formData.gender === 'Tüm Cinsiyetler' ? 'Erkek' : formData.gender),
                          heroClass: classless ? 'Tüm Sınıflar' : (formData.heroClass === 'Tüm Sınıflar' ? 'Savaşçı' : formData.heroClass),
                          level: nextLevel,
                          isBound: formData.type === 'Item' && isBindableCategory(cat) ? Boolean(formData.isBound) : false,
                          // Reset enchantments when switching category
                          enchantment1: '',
                          enchantment2: cat === 'Tılsım' ? 'Mavi' : '',
                          talismanTier: cat === 'Tılsım' ? 'I' : undefined,
                        });
                      handleNext();
                    }}
                    className="p-1.5 sm:p-2 text-[11px] sm:text-xs font-bold bg-slate-800 hover:bg-yellow-600 hover:text-black border border-slate-600 rounded transition-colors"
                   >
                     {cat}
                   </button>
                 ))}
               </div>
               <button onClick={handleBack} className="text-xs text-slate-400 hover:text-white mt-4 underline">Geri Dön</button>
            </div>
          )}

          {/* STEP 3: Details Form */}
          {step === 3 && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-2 md:gap-3">
              <div className="space-y-2">
              <div className="bg-slate-900/60 px-2 py-1.5 rounded-lg border border-slate-700 flex items-center justify-center gap-2">
                 <div className="flex items-center gap-1">
                   <span className="text-[10px] text-slate-500">Tür:</span>
                   <span className="text-[10px] font-bold text-yellow-400">{formData.type === 'Recipe' ? 'Reçete' : 'İtem'}</span>
                   {formData.type === 'Recipe' && (
                       <span className={`text-[8px] px-1 py-px rounded border ${formData.isRead ? 'bg-purple-900 border-purple-600 text-purple-200' : 'bg-slate-800 border-slate-600 text-slate-400'}`}>
                           {formData.isRead ? 'Okunmuş' : 'Okunmamış'}
                       </span>
                   )}
                 </div>
                 <div className="w-px h-3 bg-slate-700" />
                 <div className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-500">Sınıf:</span>
                    <span className="text-[10px] font-bold text-yellow-400">{formData.category}</span>
                 </div>
              </div>

              {/* Set Durumu Barı */}
              {currentSetInfo && (
                <div
                  className={`hidden sm:flex items-center gap-2 px-2.5 py-1.5 rounded-lg border cursor-pointer hover:brightness-125 transition-all ${
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
                </div>
              )}

              {/* Gender & Hero Class - side by side on mobile */}
              <div className="flex gap-1.5 sm:gap-2">
                <div className="flex-1">
                  <label className="block text-[10px] md:text-xs font-bold mb-1 text-slate-400">Cinsiyet</label>
                  <div className="flex bg-slate-900 rounded p-0.5 md:p-1 gap-0.5 md:gap-1 border border-slate-700/70">
                    {isGenderless ? (
                      <div className="flex-1 text-[10px] md:text-xs py-1 rounded bg-indigo-600 text-white text-center">Tüm Cins.</div>
                    ) : (
                      GENDER_OPTIONS.filter(g => isWeapon || g !== 'Tüm Cinsiyetler').map(g => {
                        const activeColor = g === 'Erkek' ? 'bg-blue-600 text-white' : g === 'Kadın' ? 'bg-pink-600 text-white' : 'bg-indigo-600 text-white';
                        return (
                          <button
                            key={g}
                            type="button"
                            onClick={() => setFormData({...formData, gender: g as any})}
                            className={`flex-1 text-[10px] md:text-xs py-1 rounded transition-colors ${formData.gender === g ? activeColor : 'text-slate-500 hover:text-slate-300'}`}
                          >
                            {g === 'Tüm Cinsiyetler' ? 'Tümü' : g}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="flex-1">
                  <label className="block text-[10px] md:text-xs font-bold mb-1 text-slate-400">Sınıf</label>
                  <div className="flex gap-0.5 md:gap-1 bg-slate-900 rounded p-0.5 md:p-1 border border-slate-700/70">
                    {isClassless ? (
                      <div className="px-2 py-1 text-[10px] md:text-xs rounded bg-blue-600 text-white flex-grow text-center">Tüm Sınıflar</div>
                    ) : (formData.category === 'Tılsım' && isTalismanClassLocked) ? (
                      <div className="px-2 py-1 text-[10px] md:text-xs rounded bg-violet-600 text-white flex-grow text-center">{talismanResolvedClass}</div>
                    ) : (
                      (formData.category === 'Tılsım' ? talismanClassOptions : HERO_CLASSES.filter(cls => cls !== 'Tüm Sınıflar')).map(cls => {
                        const activeColor = cls === 'Savaşçı' ? 'bg-blue-600 text-white' : cls === 'Büyücü' ? 'bg-red-600 text-white' : 'bg-green-600 text-white';
                        return (
                        <button
                          key={cls}
                          type="button"
                          onClick={() => setFormData({...formData, heroClass: cls})}
                          className={`px-1 md:px-2 py-1 text-[10px] md:text-xs rounded transition-colors flex-grow ${formData.heroClass === cls ? activeColor : 'text-slate-500 hover:text-slate-300'}`}
                        >
                          {cls}
                        </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* Level / Bound / Count Row */}
              {shouldRenderMetaRow && (
                <div className={`grid gap-2 rounded-lg border border-slate-700/70 bg-slate-900/45 p-2 ${metaRowGridClass}`}>
                  {shouldShowLevelInput && (
                    <div className="rounded-md border border-slate-700/80 bg-slate-950/45 p-1.5">
                      <label className="block text-[10px] md:text-xs font-bold mb-0.5 md:mb-1 text-slate-400">Seviye</label>
                      <input
                        type="number"
                        min="1"
                        max="59"
                        value={formData.level}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setFormData({...formData, level: Math.min(59, Math.max(1, parseInt(e.target.value) || 1))})}
                        className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs sm:text-sm focus:border-yellow-500 focus:outline-none"
                      />
                    </div>
                  )}

                  {isBindableItemCategory && (
                    <div className="rounded-md border border-amber-800/40 bg-amber-950/15 p-1.5 min-w-0">
                      <label className="block text-[10px] md:text-xs font-bold mb-0.5 md:mb-1 text-amber-300/90">Bağlı mı (^)</label>
                      <div className="flex bg-slate-900/80 rounded p-0.5 md:p-1 gap-0.5 md:gap-1 border border-slate-700/70">
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, isBound: false })}
                          className={`flex-1 text-[10px] md:text-xs py-1 md:py-1.5 rounded transition-colors ${!formData.isBound ? 'bg-red-600 text-white ring-1 ring-red-300/60' : 'bg-red-900/40 text-red-300 hover:bg-red-800/50'}`}
                          title="Bağlı değil"
                          aria-label="Bağlı değil"
                        >
                          <X size={11} className="mx-auto" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, isBound: true })}
                          className={`flex-1 text-[10px] md:text-xs py-1 md:py-1.5 rounded transition-colors ${formData.isBound ? 'bg-emerald-500 text-black font-bold shadow-[0_0_12px_rgba(16,185,129,0.45)] ring-1 ring-emerald-200/70' : 'bg-emerald-900/40 text-emerald-300 hover:bg-emerald-800/50'}`}
                          title="Bağlı"
                          aria-label="Bağlı"
                        >
                          <CheckCircle size={11} className="mx-auto" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Count Input - stackable categories */}
                  {isStackable && (
                    <div className={`rounded-md border border-emerald-800/40 bg-emerald-950/15 p-1.5 animate-in fade-in slide-in-from-right-4 ${isBindableItemCategory ? 'col-span-2 sm:col-span-1' : ''}`}>
                      <label className="block text-[10px] md:text-xs font-bold mb-0.5 md:mb-1 text-emerald-400 flex items-center gap-1">
                         <Layers size={12} /> Adet
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="100000000"
                        value={formData.count || 1}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setFormData({...formData, count: Math.min(100000000, Math.max(1, parseInt(e.target.value) || 1))})}
                        className="w-full bg-slate-900 border border-emerald-700/50 rounded px-2 py-1 text-xs sm:text-sm text-emerald-300 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Weapon Type - ONLY IF WEAPON */}
              {isWeapon && (
                  <div className="animate-in fade-in slide-in-from-left-4">
                     <label className="block text-xs font-bold mb-1 text-red-400 flex items-center gap-1">
                        <Sword size={12} /> Silah Cinsi
                     </label>
                     <div className="relative">
                       <input
                         type="text"
                         placeholder="Örn: Balta, Çifte, Hızar, Kafa Koparan..."
                         value={formData.weaponType || ''}
                         maxLength={50}
                         onChange={(e) => setFormData({...formData, weaponType: e.target.value})}
                         onFocus={() => { if (blurTimeout.current) clearTimeout(blurTimeout.current); setActiveField('weaponType'); }}
                         onBlur={handleFieldBlur}
                         className="w-full bg-slate-900 border border-red-900/60 rounded px-2 py-1 text-xs sm:text-sm focus:border-red-500 focus:outline-none placeholder-slate-600 text-red-100"
                       />
                       {activeField === 'weaponType' && filteredSuggestions.length > 0 && (
                         <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-600 rounded shadow-lg max-h-28 overflow-y-auto">
                           {filteredSuggestions.map(s => (
                             <button
                               key={s}
                               type="button"
                               onMouseDown={(e) => e.preventDefault()}
                               onClick={() => handleSuggestionClick('weaponType', s)}
                               className="w-full text-left px-2 py-1.5 text-xs sm:text-sm text-slate-200 hover:bg-yellow-600 hover:text-black"
                             >
                               {s}
                             </button>
                           ))}
                         </div>
                       )}
                     </div>
                  </div>
              )}

              {/* Global Visibility Toggle */}
              <div>
                <label className="block text-[10px] md:text-xs font-bold mb-0.5 md:mb-1 text-slate-400">Görünürlük</label>
                <div className="flex bg-slate-900 rounded p-0.5 md:p-1 gap-0.5 md:gap-1 border border-slate-700/70">
                  <button
                    type="button"
                    onClick={() => setFormData({...formData, isGlobal: false})}
                    className={`flex-1 text-[10px] md:text-xs py-1 md:py-1.5 rounded transition-colors flex items-center justify-center gap-1 ${!formData.isGlobal ? 'bg-slate-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    <Lock size={11} />
                    Sadece Kendim
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({...formData, isGlobal: true})}
                    className={`flex-1 text-[10px] md:text-xs py-1 md:py-1.5 rounded transition-colors flex items-center justify-center gap-1 ${formData.isGlobal ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    <Globe size={11} />
                    Globalde Göster
                  </button>
                </div>
              </div>

              </div>

              {/* Enchantments / Name - varies by category */}
              <div className="space-y-2">
              {formData.category === 'Maden' ? (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-orange-400">Maden İsmi</label>
                  <div className="flex items-stretch rounded border border-orange-900/60 bg-slate-900 overflow-visible focus-within:border-orange-500">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        placeholder="Örn: Demir, Bakır, Gümüş..."
                        value={formData.enchantment1}
                        maxLength={100}
                        onChange={(e) => {
                          const nextName = e.target.value;
                          const fallbackLevel = Math.min(59, Math.max(1, Number(formData.level) || 1));
                          setFormData({
                            ...formData,
                            enchantment1: nextName,
                            enchantment2: '',
                            level: resolveAutoLevel('Maden', nextName, fallbackLevel),
                          });
                        }}
                        onFocus={() => { if (blurTimeout.current) clearTimeout(blurTimeout.current); setActiveField('enchantment1'); }}
                        onBlur={handleFieldBlur}
                        className="w-full bg-transparent border-0 px-2 py-1 text-xs sm:text-sm focus:outline-none placeholder-slate-600 text-orange-100"
                      />
                      {activeField === 'enchantment1' && filteredSuggestions.length > 0 && (
                        <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-600 rounded shadow-lg max-h-28 overflow-y-auto">
                          {filteredSuggestions.map(s => (
                            <button
                              key={s}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleSuggestionClick('enchantment1', s)}
                              className="w-full text-left px-2 py-1.5 text-xs sm:text-sm text-slate-200 hover:bg-yellow-600 hover:text-black"
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <input
                      type="number"
                      min="1"
                      max="59"
                      placeholder="Lv"
                      aria-label="Maden seviyesi"
                      value={minePresetLevel ?? Math.min(59, Math.max(1, Number(formData.level) || 1))}
                      onChange={(e) => setFormData({ ...formData, level: Math.min(59, Math.max(1, parseInt(e.target.value, 10) || 1)) })}
                      disabled={minePresetLevel !== undefined}
                      className={`w-[72px] shrink-0 border-0 border-l px-2 py-1 text-center text-xs sm:text-sm focus:outline-none ${
                        minePresetLevel !== undefined
                          ? 'bg-slate-800 border-orange-700/40 text-orange-300 cursor-not-allowed'
                          : 'bg-transparent border-orange-700/60 text-orange-100'
                      }`}
                      title={minePresetLevel !== undefined ? 'Bu madenin seviyesi admin panelinden otomatik gelir.' : 'Bu maden veritabaninda yok, seviyeyi elle girebilirsiniz.'}
                    />
                  </div>
                </div>
              ) : formData.category === 'Diğer' ? (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-300">Diğer İsmi</label>
                  <div className="flex items-stretch rounded border border-slate-700/70 bg-slate-900 overflow-visible focus-within:border-slate-400">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        placeholder="Örn: Denim, Kurt Kürkü..."
                        value={formData.enchantment1}
                        maxLength={100}
                        onChange={(e) => {
                          const nextName = e.target.value;
                          const fallbackLevel = Math.min(59, Math.max(1, Number(formData.level) || 1));
                          setFormData({
                            ...formData,
                            enchantment1: nextName,
                            enchantment2: '',
                            level: resolveAutoLevel('Diğer', nextName, fallbackLevel),
                          });
                        }}
                        onFocus={() => { if (blurTimeout.current) clearTimeout(blurTimeout.current); setActiveField('enchantment1'); }}
                        onBlur={handleFieldBlur}
                        className="w-full bg-transparent border-0 px-2 py-1 text-xs sm:text-sm focus:outline-none placeholder-slate-600 text-slate-100"
                      />
                      {activeField === 'enchantment1' && filteredSuggestions.length > 0 && (
                        <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-600 rounded shadow-lg max-h-28 overflow-y-auto">
                          {filteredSuggestions.map(s => (
                            <button
                              key={s}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleSuggestionClick('enchantment1', s)}
                              className="w-full text-left px-2 py-1.5 text-xs sm:text-sm text-slate-200 hover:bg-yellow-600 hover:text-black"
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <input
                      type="number"
                      min="1"
                      max="59"
                      placeholder="Lv"
                      aria-label="Diğer seviyesi"
                      value={otherPresetLevel ?? Math.min(59, Math.max(1, Number(formData.level) || 1))}
                      onChange={(e) => setFormData({ ...formData, level: Math.min(59, Math.max(1, parseInt(e.target.value, 10) || 1)) })}
                      disabled={otherPresetLevel !== undefined}
                      className={`w-[72px] shrink-0 border-0 border-l px-2 py-1 text-center text-xs sm:text-sm focus:outline-none ${
                        otherPresetLevel !== undefined
                          ? 'bg-slate-800 border-slate-600 text-slate-300 cursor-not-allowed'
                          : 'bg-transparent border-slate-600 text-slate-100'
                      }`}
                      title={otherPresetLevel !== undefined ? 'Bu kaydin seviyesi admin panelinden otomatik gelir.' : 'Bu kayit veritabaninda yok, seviyeyi elle girebilirsiniz.'}
                    />
                  </div>
                </div>
              ) : formData.category === 'İksir' ? (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-emerald-400">İksir İsmi</label>
                  <div className="flex items-stretch rounded border border-emerald-900/60 bg-slate-900 overflow-visible focus-within:border-emerald-500">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        placeholder="Örn: Alman Modeli İksir, Yaşam İksiri..."
                        value={formData.enchantment1}
                        maxLength={100}
                        onChange={(e) => {
                          const nextName = e.target.value;
                          const fallbackLevel = Math.min(59, Math.max(1, Number(formData.level) || 1));
                          setFormData({
                            ...formData,
                            enchantment1: nextName,
                            enchantment2: '',
                            level: resolveAutoLevel('İksir', nextName, fallbackLevel),
                          });
                        }}
                        onFocus={() => { if (blurTimeout.current) clearTimeout(blurTimeout.current); setActiveField('enchantment1'); }}
                        onBlur={handleFieldBlur}
                        className="w-full bg-transparent border-0 px-2 py-1 text-xs sm:text-sm focus:outline-none placeholder-slate-600 text-emerald-100"
                      />
                      {activeField === 'enchantment1' && filteredSuggestions.length > 0 && (
                        <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-600 rounded shadow-lg max-h-28 overflow-y-auto">
                          {filteredSuggestions.map(s => (
                            <button
                              key={s}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleSuggestionClick('enchantment1', s)}
                              className="w-full text-left px-2 py-1.5 text-xs sm:text-sm text-slate-200 hover:bg-yellow-600 hover:text-black"
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <input
                      type="number"
                      min="1"
                      max="59"
                      placeholder="Lv"
                      aria-label="İksir seviyesi"
                      value={potionPresetLevel ?? Math.min(59, Math.max(1, Number(formData.level) || 1))}
                      onChange={(e) => setFormData({ ...formData, level: Math.min(59, Math.max(1, parseInt(e.target.value, 10) || 1)) })}
                      disabled={potionPresetLevel !== undefined}
                      className={`w-[72px] shrink-0 border-0 border-l px-2 py-1 text-center text-xs sm:text-sm focus:outline-none ${
                        potionPresetLevel !== undefined
                          ? 'bg-slate-800 border-emerald-700/40 text-emerald-300 cursor-not-allowed'
                          : 'bg-transparent border-emerald-700/60 text-emerald-100'
                      }`}
                      title={potionPresetLevel !== undefined ? 'Bu iksirin seviyesi admin panelinden otomatik gelir.' : 'Bu iksir veritabaninda yok, seviyeyi elle girebilirsiniz.'}
                    />
                  </div>
                </div>
              ) : formData.category === 'Gözlük' ? (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-cyan-400">Gözlük İsmi</label>
                  <div className="flex items-stretch rounded border border-cyan-900/60 bg-slate-900 overflow-visible focus-within:border-cyan-500">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        placeholder="Örn: Kumlu Gözlük, Canavar Gözlüğü..."
                        value={formData.enchantment1}
                        maxLength={100}
                        onChange={(e) => {
                          const nextName = e.target.value;
                          const fallbackLevel = Math.min(59, Math.max(1, Number(formData.level) || 1));
                          setFormData({
                            ...formData,
                            enchantment1: nextName,
                            enchantment2: '',
                            level: resolveAutoLevel('Gözlük', nextName, fallbackLevel),
                          });
                        }}
                        onFocus={() => { if (blurTimeout.current) clearTimeout(blurTimeout.current); setActiveField('enchantment1'); }}
                        onBlur={handleFieldBlur}
                        className="w-full bg-transparent border-0 px-2 py-1 text-xs sm:text-sm focus:outline-none placeholder-slate-600 text-cyan-100"
                      />
                      {activeField === 'enchantment1' && filteredSuggestions.length > 0 && (
                        <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-600 rounded shadow-lg max-h-28 overflow-y-auto">
                          {filteredSuggestions.map(s => (
                            <button
                              key={s}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleSuggestionClick('enchantment1', s)}
                              className="w-full text-left px-2 py-1.5 text-xs sm:text-sm text-slate-200 hover:bg-yellow-600 hover:text-black"
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <input
                      type="number"
                      min="1"
                      max="59"
                      placeholder="Lv"
                      aria-label="Gözlük seviyesi"
                      value={glassesPresetLevel ?? Math.min(59, Math.max(1, Number(formData.level) || 1))}
                      onChange={(e) => setFormData({ ...formData, level: Math.min(59, Math.max(1, parseInt(e.target.value, 10) || 1)) })}
                      disabled={glassesPresetLevel !== undefined}
                      className={`w-[72px] shrink-0 border-0 border-l px-2 py-1 text-center text-xs sm:text-sm focus:outline-none ${
                        glassesPresetLevel !== undefined
                          ? 'bg-slate-800 border-cyan-700/40 text-cyan-300 cursor-not-allowed'
                          : 'bg-transparent border-cyan-700/60 text-cyan-100'
                      }`}
                      title={glassesPresetLevel !== undefined ? 'Bu gözlüğün seviyesi admin panelinden otomatik gelir.' : 'Bu gözlük veritabaninda yok, seviyeyi elle girebilirsiniz.'}
                    />
                  </div>
                </div>
              ) : formData.category === 'Tılsım' ? (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-purple-400">Tılsım İsmi</label>
                  <div className="flex items-stretch h-8 sm:h-9 rounded border border-purple-900/60 bg-slate-900 overflow-visible focus-within:border-purple-500">
                    <div className="relative min-w-0 flex-1">
                      <input
                        type="text"
                        placeholder="Örn: Meteorit, Direnç Kırma Alanı"
                        value={formData.enchantment1}
                        maxLength={100}
                        onChange={(e) => setFormData({...formData, enchantment1: e.target.value, level: 1})}
                        onFocus={() => { if (blurTimeout.current) clearTimeout(blurTimeout.current); setActiveField('enchantment1'); }}
                        onBlur={handleFieldBlur}
                        className="w-full h-full bg-transparent border-0 px-2 text-xs sm:text-sm focus:outline-none placeholder-slate-600 text-purple-100"
                      />
                      {activeField === 'enchantment1' && filteredSuggestions.length > 0 && (
                        <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-600 rounded shadow-lg max-h-28 overflow-y-auto">
                          {filteredSuggestions.map(s => (
                            <button
                              key={s}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleSuggestionClick('enchantment1', s)}
                              className="w-full text-left px-2 py-1.5 text-xs sm:text-sm text-slate-200 hover:bg-yellow-600 hover:text-black"
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="w-[96px] shrink-0 border-l border-purple-800/45 bg-slate-900/80">
                      <div className="grid h-full grid-cols-2">
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, enchantment2: 'Mavi' })}
                          disabled={!canSelectMaviForTalisman || isTalismanColorLocked}
                          className={`h-full text-[11px] sm:text-xs font-bold transition-all ${
                            talismanResolvedColor === 'Mavi'
                              ? 'bg-blue-800 text-white ring-1 ring-blue-300/60'
                              : (!canSelectMaviForTalisman ? 'bg-slate-800/70 text-slate-500 cursor-not-allowed' : 'bg-blue-950/45 text-blue-300 hover:bg-blue-900/60')
                          }`}
                          title="Mavi"
                          aria-label="Mavi"
                        >
                          M
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, enchantment2: 'Kırmızı' })}
                          disabled={!canSelectKirmiziForTalisman || isTalismanColorLocked}
                          className={`h-full text-[11px] sm:text-xs font-bold border-l border-purple-800/45 transition-all ${
                            talismanResolvedColor === 'Kırmızı'
                              ? 'bg-red-700 text-white ring-1 ring-red-300/60'
                              : (!canSelectKirmiziForTalisman ? 'bg-slate-800/70 text-slate-500 cursor-not-allowed' : 'bg-red-950/45 text-red-300 hover:bg-red-900/60')
                          }`}
                          title="Kırmızı"
                          aria-label="Kırmızı"
                        >
                          K
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="rounded border border-purple-900/60 bg-slate-900/70 p-1.5">
                    <div className="text-[10px] text-purple-300/90 mb-1">Kademe</div>
                    <div className="grid grid-cols-4 gap-1">
                      {TALISMAN_TIER_OPTIONS.map(tier => (
                        <button
                          key={tier}
                          type="button"
                          onClick={() => setFormData({ ...formData, talismanTier: tier })}
                          className={`text-[11px] sm:text-xs py-1 rounded font-semibold transition-all ${
                            talismanResolvedTier === tier
                              ? 'bg-purple-700 text-white ring-1 ring-purple-300/70'
                              : 'bg-slate-800 text-purple-200 hover:bg-purple-900/70'
                          }`}
                          title={tier === '-' ? 'Kademesiz' : `${tier}. Kademe`}
                          aria-label={tier === '-' ? 'Kademesiz' : `${tier}. Kademe`}
                        >
                          {tier}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-400">Efsunlar (Max 2)</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="1. Efsun (Örn: Alman Modeli)"
                      value={formData.enchantment1}
                      maxLength={100}
                      onChange={(e) => setFormData({...formData, enchantment1: e.target.value})}
                      onFocus={() => { if (blurTimeout.current) clearTimeout(blurTimeout.current); setActiveField('enchantment1'); }}
                      onBlur={handleFieldBlur}
                      className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs sm:text-sm focus:border-yellow-500 focus:outline-none placeholder-slate-600"
                    />
                    {activeField === 'enchantment1' && filteredSuggestions.length > 0 && (
                      <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-600 rounded shadow-lg max-h-28 overflow-y-auto">
                        {filteredSuggestions.map(s => (
                          <button
                            key={s}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleSuggestionClick('enchantment1', s)}
                            className="w-full text-left px-2 py-1.5 text-xs sm:text-sm text-slate-200 hover:bg-yellow-600 hover:text-black"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="2. Efsun (Örn: Dış Şehir Modeli)"
                      value={formData.enchantment2}
                      maxLength={100}
                      onChange={(e) => setFormData({...formData, enchantment2: e.target.value})}
                      onFocus={() => { if (blurTimeout.current) clearTimeout(blurTimeout.current); setActiveField('enchantment2'); }}
                      onBlur={handleFieldBlur}
                      className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs sm:text-sm focus:border-yellow-500 focus:outline-none placeholder-slate-600"
                    />
                    {activeField === 'enchantment2' && filteredSuggestions.length > 0 && (
                      <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-600 rounded shadow-lg max-h-28 overflow-y-auto">
                        {filteredSuggestions.map(s => (
                          <button
                            key={s}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleSuggestionClick('enchantment2', s)}
                            className="w-full text-left px-2 py-1.5 text-xs sm:text-sm text-slate-200 hover:bg-yellow-600 hover:text-black"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              </div>

              <div className="flex items-center gap-2 pt-2 md:pt-3 border-t border-slate-700 flex-wrap">
                {existingItem && (
                  <button 
                    type="button" 
                    onClick={onDelete}
                    className="px-3 sm:px-4 py-1.5 sm:py-2 bg-red-900 hover:bg-red-700 text-red-100 rounded text-xs sm:text-sm font-bold border border-red-800"
                  >
                    Sil
                  </button>
                )}
                
                {existingItem && existingItem.type === 'Recipe' && onRead && (
                    <button
                        type="button"
                        onClick={handleRead}
                        className="px-3 sm:px-4 py-1.5 sm:py-2 bg-purple-700 hover:bg-purple-600 text-white rounded text-xs sm:text-sm font-bold border border-purple-500 flex items-center gap-1.5"
                        title="Reçeteyi oku ve kasadan kaldır"
                    >
                        <BookOpen size={16} />
                        <span className="hidden sm:inline">Reçeteyi Oku</span>
                        <span className="sm:hidden">Oku</span>
                    </button>
                )}

                <div className="flex-1"></div>
                {!existingItem && (
                   <button type="button" onClick={() => setStep(2)} className="px-2.5 sm:px-3 py-1.5 sm:py-2 text-slate-400 hover:text-white text-xs sm:text-sm">Geri</button>
                )}
                <button 
                  type="submit" 
                  className="px-4 sm:px-6 py-1.5 sm:py-2 bg-yellow-600 hover:bg-yellow-500 text-black rounded text-xs sm:text-sm font-bold shadow-[0_0_10px_rgba(234,179,8,0.3)] border border-yellow-400"
                >
                  {existingItem ? 'Güncelle' : 'Oluştur'}
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
    {globalSetMap && (
      <SetDetailModal
        isOpen={showSetDetail}
        onClose={() => { setShowSetDetail(false); setSetDetailKey(null); }}
        setKey={setDetailKey}
        setMap={globalSetMap}
      />
    )}
    </>
  );
};

