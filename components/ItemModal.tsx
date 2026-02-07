import React, { useState, useEffect, useMemo } from 'react';
import { CATEGORY_OPTIONS, ItemData, SetItemLocation, GlobalSetInfo } from '../types';
import { HERO_CLASSES, GENDER_OPTIONS, SET_CATEGORIES } from '../constants';
import { X, BookOpen, CheckCircle, Circle, Layers, Sword, Globe, Lock } from 'lucide-react';
import { SetDetailModal } from './SetDetailModal';

interface ItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: ItemData) => void;
  onDelete: () => void;
  onRead?: (item: ItemData) => void;
  existingItem: ItemData | null;
  enchantmentSuggestions?: string[];
  globalSetLookup?: Map<string, GlobalSetInfo>;
  globalSetMap?: Map<string, SetItemLocation[]>;
}

export const ItemModal: React.FC<ItemModalProps> = ({ isOpen, onClose, onSave, onDelete, onRead, existingItem, enchantmentSuggestions = [], globalSetLookup, globalSetMap }) => {
  const [step, setStep] = useState(1);
  const [activeField, setActiveField] = useState<'enchantment1' | 'enchantment2' | null>(null);
  const [formData, setFormData] = useState<Partial<ItemData>>({
    type: 'Item',
    category: '',
    enchantment1: '',
    enchantment2: '',
    heroClass: 'Savaşçı',
    gender: 'Tüm Cinsiyetler',
    level: 1,
    isRead: false,
    count: 1,
    weaponType: '',
    isGlobal: false,
  });

  useEffect(() => {
    if (isOpen) {
      setActiveField(null);
      if (existingItem) {
        setFormData(existingItem);
        setStep(3); // Jump to details if editing
      } else {
        setFormData({
            type: 'Item',
            category: CATEGORY_OPTIONS[0],
            enchantment1: '',
            enchantment2: '',
            heroClass: 'Savaşçı',
            gender: 'Tüm Cinsiyetler',
            level: 1,
            isRead: false,
            count: 1,
            weaponType: '',
            isGlobal: false,
        });
        setStep(1);
      }
    }
  }, [isOpen, existingItem]);

  const filteredSuggestions = useMemo(() => {
    if (!activeField) return [];
    const text = (formData[activeField] || '').trim().toLocaleLowerCase('tr');
    if (!text) return [];
    return enchantmentSuggestions
      .filter(s => {
        const lower = s.toLocaleLowerCase('tr');
        return lower !== text && lower.includes(text);
      })
      .slice(0, 5);
  }, [activeField, formData.enchantment1, formData.enchantment2, enchantmentSuggestions]);

  const blurTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Set detail modal state
  const [showSetDetail, setShowSetDetail] = useState(false);
  const [setDetailKey, setSetDetailKey] = useState<string | null>(null);

  // Current set info based on formData
  const currentSetInfo = useMemo(() => {
    if (!globalSetLookup || !formData.category || !SET_CATEGORIES.includes(formData.category)) return null;
    if (!formData.enchantment1 || formData.enchantment1.trim() === '') return null;

    const enchKey = `${(formData.enchantment1 || '').toLocaleLowerCase('tr')}|${(formData.enchantment2 || '').toLocaleLowerCase('tr')}`;
    const globalKey = `${enchKey}|${formData.gender || 'Tüm Cinsiyetler'}|${formData.heroClass || 'Savaşçı'}`;
    const info = globalSetLookup.get(globalKey);
    return info ? { info, globalKey } : null;
  }, [globalSetLookup, formData.category, formData.enchantment1, formData.enchantment2, formData.gender, formData.heroClass]);

  if (!isOpen) return null;

  const handleNext = () => setStep((prev) => prev + 1);
  const handleBack = () => setStep((prev) => prev - 1);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.category && formData.type) {
      onSave({
        ...formData as ItemData,
        id: existingItem?.id || crypto.randomUUID(),
      });
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
  // Categories that don't have gender selection
  const isGenderless = ['Yüzük', 'Kolye', 'Tılsım', 'İksir', 'Maden', 'Diğer'].includes(formData.category || '');
  // Categories that don't have class selection
  const isClassless = ['Yüzük', 'Kolye', 'İksir', 'Maden', 'Diğer'].includes(formData.category || '');

  const handleFieldBlur = () => {
    blurTimeout.current = setTimeout(() => setActiveField(null), 150);
  };
  const handleSuggestionClick = (field: 'enchantment1' | 'enchantment2', value: string) => {
    if (blurTimeout.current) clearTimeout(blurTimeout.current);
    setFormData({ ...formData, [field]: value });
    setActiveField(null);
  };

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm sm:p-4">
      <div className="bg-gradient-to-b from-slate-800 to-slate-900 border border-slate-600/80 sm:border-2 md:border-4 rounded-none sm:rounded-xl shadow-[0_30px_80px_rgba(0,0,0,0.7)] w-screen sm:w-[93vw] md:w-[560px] h-[100dvh] sm:h-auto sm:max-h-[92vh] text-slate-200 relative overflow-hidden">

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
        <div className="h-[calc(100dvh-53px)] sm:h-auto sm:max-h-[calc(92vh-56px)] p-2.5 sm:p-3 md:p-5 flex flex-col overflow-hidden">
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
                  onClick={() => { setFormData({ ...formData, type: 'Item', isRead: false }); handleNext(); }}
                  className="p-3 sm:p-4 bg-slate-800/80 hover:bg-slate-700 border border-slate-500 rounded-lg sm:rounded-xl flex flex-col items-center gap-2 transition-all hover:scale-[1.02] hover:border-yellow-500/70"
                >
                  <span className="text-2xl">⚔️</span>
                  <span className="font-bold">İtem</span>
                </button>
                <button
                  onClick={() => { setFormData({ ...formData, type: 'Recipe', isRead: false }); handleNext(); }}
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
                 {CATEGORY_OPTIONS.map((cat) => (
                   <button
                    key={cat}
                    onClick={() => {
                      const genderless = ['Yüzük', 'Kolye', 'Tılsım', 'İksir', 'Maden', 'Diğer'].includes(cat);
                      const classless = ['Yüzük', 'Kolye', 'İksir', 'Maden', 'Diğer'].includes(cat);
                      setFormData({
                        ...formData,
                        category: cat,
                        gender: genderless ? 'Tüm Cinsiyetler' : (formData.gender === 'Tüm Cinsiyetler' ? 'Erkek' : formData.gender),
                        heroClass: classless ? 'Tüm Sınıflar' : (formData.heroClass === 'Tüm Sınıflar' ? 'Savaşçı' : formData.heroClass),
                        // Reset enchantments when switching category
                        enchantment1: '',
                        enchantment2: '',
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
            <form onSubmit={handleSubmit} className="flex flex-1 min-h-0 flex-col gap-2 md:gap-3">
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
                    ) : (
                      HERO_CLASSES.filter(cls => cls !== 'Tüm Sınıflar').map(cls => {
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

              {/* Level & Count Row */}
              <div className="flex gap-1.5 sm:gap-2 md:gap-3">
                  <div className="flex-1">
                    <label className="block text-[10px] md:text-xs font-bold mb-0.5 md:mb-1 text-slate-400">Seviye</label>
                    <input
                      type="number"
                      min="1"
                      max="999"
                      value={formData.level}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setFormData({...formData, level: Math.min(999, Math.max(1, parseInt(e.target.value) || 1))})}
                      className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs sm:text-sm focus:border-yellow-500 focus:outline-none"
                    />
                  </div>

                  {/* Count Input - Only for Maden & İksir */}
                  {isStackable && (
                      <div className="flex-1 animate-in fade-in slide-in-from-right-4">
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

              {/* Weapon Type - ONLY IF WEAPON */}
              {isWeapon && (
                  <div className="animate-in fade-in slide-in-from-left-4">
                     <label className="block text-xs font-bold mb-1 text-red-400 flex items-center gap-1">
                        <Sword size={12} /> Silah Cinsi
                     </label>
                     <input 
                        type="text" 
                        placeholder="Örn: Balta, Çifte, Hızar, Kafa Koparan..."
                        value={formData.weaponType || ''}
                        maxLength={50}
                        onChange={(e) => setFormData({...formData, weaponType: e.target.value})}
                        className="w-full bg-slate-900 border border-red-900/60 rounded px-2 py-1 text-xs sm:text-sm focus:border-red-500 focus:outline-none placeholder-slate-600 text-red-100"
                      />
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
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Örn: Demir, Bakır, Gümüş..."
                      value={formData.enchantment1}
                      maxLength={100}
                      onChange={(e) => setFormData({...formData, enchantment1: e.target.value, enchantment2: ''})}
                      onFocus={() => { if (blurTimeout.current) clearTimeout(blurTimeout.current); setActiveField('enchantment1'); }}
                      onBlur={handleFieldBlur}
                      className="w-full bg-slate-900 border border-orange-900/60 rounded px-2 py-1 text-xs sm:text-sm focus:border-orange-500 focus:outline-none placeholder-slate-600 text-orange-100"
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
                </div>
              ) : formData.category === 'Tılsım' ? (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-purple-400">Tılsım İsmi</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Örn: Meteorit, Direnç Kırma Alanı (Mavi)"
                      value={formData.enchantment1}
                      maxLength={100}
                      onChange={(e) => setFormData({...formData, enchantment1: e.target.value})}
                      onFocus={() => { if (blurTimeout.current) clearTimeout(blurTimeout.current); setActiveField('enchantment1'); }}
                      onBlur={handleFieldBlur}
                      className="w-full bg-slate-900 border border-purple-900/60 rounded px-2 py-1 text-xs sm:text-sm focus:border-purple-500 focus:outline-none placeholder-slate-600 text-purple-100"
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
                  <label className="block text-[10px] md:text-xs font-bold text-purple-400 mt-1 md:mt-2">Kademe</label>
                  <div className="flex bg-slate-900 rounded p-0.5 md:p-1 gap-0.5 md:gap-1">
                    {['I', 'II', 'III'].map(tier => (
                      <button
                        key={tier}
                        type="button"
                        onClick={() => setFormData({...formData, enchantment2: tier})}
                        className={`flex-1 text-xs sm:text-sm py-1.5 rounded font-bold transition-colors ${formData.enchantment2 === tier ? 'bg-purple-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                      >
                        {tier}
                      </button>
                    ))}
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

              <div className="flex items-center gap-2 mt-auto pt-2 md:pt-3 border-t border-slate-700 flex-wrap">
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
