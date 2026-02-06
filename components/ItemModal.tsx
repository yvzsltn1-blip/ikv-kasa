import React, { useState, useEffect, useMemo } from 'react';
import { CATEGORY_OPTIONS, ItemData, SetItemLocation } from '../types';
import { HERO_CLASSES, GENDER_OPTIONS, SET_CATEGORIES } from '../constants';
import { X, BookOpen, CheckCircle, Circle, Layers, Sword, Globe, Lock } from 'lucide-react';

interface ItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: ItemData) => void;
  onDelete: () => void;
  onRead?: (item: ItemData) => void;
  existingItem: ItemData | null;
  enchantmentSuggestions?: string[];
  setMap?: Map<string, SetItemLocation[]>;
  onSetClick?: (enchantment1: string, enchantment2: string) => void;
}

export const ItemModal: React.FC<ItemModalProps> = ({ isOpen, onClose, onSave, onDelete, onRead, existingItem, enchantmentSuggestions = [], setMap, onSetClick }) => {
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
  const isStackable = formData.category === 'Maden' || formData.category === 'İksir';
  // Determine if item is a Weapon
  const isWeapon = formData.category === 'Silah';
  // Categories that don't have gender selection
  const isGenderless = ['Yüzük', 'Kolye', 'Tılsım', 'İksir', 'Maden'].includes(formData.category || '');

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
  const handleFieldBlur = () => {
    blurTimeout.current = setTimeout(() => setActiveField(null), 150);
  };
  const handleSuggestionClick = (field: 'enchantment1' | 'enchantment2', value: string) => {
    if (blurTimeout.current) clearTimeout(blurTimeout.current);
    setFormData({ ...formData, [field]: value });
    setActiveField(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-800 border-2 md:border-4 border-slate-600 rounded-xl shadow-2xl w-[93vw] md:w-96 max-h-[92vh] text-slate-200 relative overflow-y-auto">
        
        {/* Header */}
        <div className="bg-slate-900 p-3 border-b border-slate-700 flex justify-between items-center">
          <h2 className="text-lg font-bold text-yellow-500 uppercase tracking-wider">
            {existingItem ? 'Eşya Düzenle' : 'Yeni Eşya Ekle'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          
          {/* STEP 1: Type Selection */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-center mb-4 font-semibold text-slate-300">Tür Seçiniz</h3>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => { setFormData({ ...formData, type: 'Item', isRead: false }); handleNext(); }}
                  className="p-4 bg-slate-700 hover:bg-slate-600 border-2 border-slate-500 rounded-lg flex flex-col items-center gap-2 transition-all hover:scale-105"
                >
                  <span className="text-2xl">⚔️</span>
                  <span className="font-bold">İtem</span>
                </button>
                <button
                  onClick={() => { setFormData({ ...formData, type: 'Recipe', isRead: false }); handleNext(); }}
                  className="p-4 bg-slate-700 hover:bg-slate-600 border-2 border-slate-500 rounded-lg flex flex-col items-center gap-2 transition-all hover:scale-105"
                >
                  <span className="text-2xl">📜</span>
                  <span className="font-bold">Reçete</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Category Selection */}
          {step === 2 && (
            <div className="space-y-4">
               
               {/* Recipe Status Selection (Only if Type is Recipe) */}
               {formData.type === 'Recipe' && (
                  <div className="bg-slate-900/60 p-2 rounded border border-slate-700 mb-4">
                      <h4 className="text-[10px] text-slate-400 font-bold mb-2 uppercase text-center">Reçete Durumu</h4>
                      <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => setFormData({...formData, isRead: false})}
                            className={`flex items-center justify-center gap-2 py-2 rounded text-xs font-bold border transition-colors ${!formData.isRead ? 'bg-yellow-600 text-black border-yellow-500' : 'bg-slate-800 text-slate-400 border-slate-600 hover:bg-slate-700'}`}
                          >
                             {/* Icon for Unread */}
                             {!formData.isRead ? <CheckCircle size={14}/> : <Circle size={14}/>}
                             Okunmamış (Kasa)
                          </button>
                          <button
                            onClick={() => setFormData({...formData, isRead: true})}
                            className={`flex items-center justify-center gap-2 py-2 rounded text-xs font-bold border transition-colors ${formData.isRead ? 'bg-purple-600 text-white border-purple-400' : 'bg-slate-800 text-slate-400 border-slate-600 hover:bg-slate-700'}`}
                          >
                             {formData.isRead ? <CheckCircle size={14}/> : <Circle size={14}/>}
                             Okunmuş (Kitap)
                          </button>
                      </div>
                  </div>
               )}

               <h3 className="text-center mb-2 font-semibold text-slate-300">Sınıf Seçiniz</h3>
               <div className="grid grid-cols-3 gap-2">
                 {CATEGORY_OPTIONS.map((cat) => (
                   <button
                    key={cat}
                    onClick={() => {
                      const genderless = ['Yüzük', 'Kolye', 'Tılsım', 'İksir', 'Maden'].includes(cat);
                      setFormData({
                        ...formData,
                        category: cat,
                        gender: genderless ? 'Tüm Cinsiyetler' : formData.gender,
                        // Reset enchantments when switching category
                        enchantment1: '',
                        enchantment2: '',
                      });
                      handleNext();
                    }}
                    className="p-2 text-xs font-bold bg-slate-700 hover:bg-yellow-600 hover:text-black border border-slate-600 rounded transition-colors"
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
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="bg-slate-900/50 p-3 rounded border border-slate-700 mb-2">
                 <div className="flex items-center gap-2 mb-1">
                   <span className="text-xs text-slate-400">Tür:</span>
                   <span className="text-xs font-bold text-yellow-400">{formData.type}</span>
                   {formData.type === 'Recipe' && (
                       <span className={`text-[10px] px-1.5 py-0.5 rounded border ml-1 ${formData.isRead ? 'bg-purple-900 border-purple-600 text-purple-200' : 'bg-slate-800 border-slate-600 text-slate-400'}`}>
                           {formData.isRead ? 'Okunmuş' : 'Okunmamış'}
                       </span>
                   )}
                 </div>
                 <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Sınıf:</span>
                    <span className="text-xs font-bold text-yellow-400">{formData.category}</span>
                 </div>
              </div>

              {/* Gender - hidden for Yüzük, Kolye, Tılsım, İksir, Maden */}
              {!isGenderless && (
              <div>
                <label className="block text-xs font-bold mb-1 text-slate-400">Cinsiyet</label>
                <div className="flex bg-slate-900 rounded p-1 gap-1">
                  {GENDER_OPTIONS.map(g => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setFormData({...formData, gender: g as any})}
                      className={`flex-1 text-xs py-1 rounded transition-colors ${formData.gender === g ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
              )}

              {/* Hero Class */}
              <div>
                <label className="block text-xs font-bold mb-1 text-slate-400">Karakter Sınıfı</label>
                <div className="flex flex-wrap gap-1 bg-slate-900 rounded p-1">
                  {HERO_CLASSES.map(cls => (
                    <button
                      key={cls}
                      type="button"
                      onClick={() => setFormData({...formData, heroClass: cls})}
                      className={`px-2 py-1 text-xs rounded transition-colors flex-grow ${formData.heroClass === cls ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      {cls}
                    </button>
                  ))}
                </div>
              </div>

              {/* Level & Count Row */}
              <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-bold mb-1 text-slate-400">Seviye (Level)</label>
                    <input 
                      type="number" 
                      min="1" 
                      max="999"
                      value={formData.level}
                      onChange={(e) => setFormData({...formData, level: Math.min(999, Math.max(1, parseInt(e.target.value) || 1))})}
                      className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm focus:border-yellow-500 focus:outline-none"
                    />
                  </div>

                  {/* Count Input - Only for Maden & İksir */}
                  {isStackable && (
                      <div className="flex-1 animate-in fade-in slide-in-from-right-4">
                        <label className="block text-xs font-bold mb-1 text-emerald-400 flex items-center gap-1">
                           <Layers size={12} /> Adet
                        </label>
                        <input 
                          type="number" 
                          min="1" 
                          max="9999"
                          value={formData.count || 1}
                          onChange={(e) => setFormData({...formData, count: Math.min(9999, Math.max(1, parseInt(e.target.value) || 1))})}
                          className="w-full bg-slate-900 border border-emerald-700/50 rounded px-2 py-1 text-sm text-emerald-300 focus:border-emerald-500 focus:outline-none"
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
                        className="w-full bg-slate-900 border border-red-900/60 rounded px-2 py-1 text-sm focus:border-red-500 focus:outline-none placeholder-slate-600 text-red-100"
                      />
                  </div>
              )}

              {/* Global Visibility Toggle */}
              <div>
                <label className="block text-xs font-bold mb-1 text-slate-400">Görünürlük</label>
                <div className="flex bg-slate-900 rounded p-1 gap-1">
                  <button
                    type="button"
                    onClick={() => setFormData({...formData, isGlobal: false})}
                    className={`flex-1 text-xs py-1.5 rounded transition-colors flex items-center justify-center gap-1.5 ${!formData.isGlobal ? 'bg-slate-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    <Lock size={12} />
                    Sadece Kendim
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({...formData, isGlobal: true})}
                    className={`flex-1 text-xs py-1.5 rounded transition-colors flex items-center justify-center gap-1.5 ${formData.isGlobal ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    <Globe size={12} />
                    Globalde Göster
                  </button>
                </div>
              </div>

              {/* Enchantments / Name - varies by category */}
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
                      onFocus={() => setActiveField('enchantment1')}
                      onBlur={handleFieldBlur}
                      className="w-full bg-slate-900 border border-orange-900/60 rounded px-2 py-1 text-sm focus:border-orange-500 focus:outline-none placeholder-slate-600 text-orange-100"
                    />
                    {activeField === 'enchantment1' && filteredSuggestions.length > 0 && (
                      <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-600 rounded shadow-lg max-h-32 overflow-y-auto">
                        {filteredSuggestions.map(s => (
                          <button
                            key={s}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleSuggestionClick('enchantment1', s)}
                            className="w-full text-left px-2 py-1.5 text-sm text-slate-200 hover:bg-yellow-600 hover:text-black"
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
                      onFocus={() => setActiveField('enchantment1')}
                      onBlur={handleFieldBlur}
                      className="w-full bg-slate-900 border border-purple-900/60 rounded px-2 py-1 text-sm focus:border-purple-500 focus:outline-none placeholder-slate-600 text-purple-100"
                    />
                    {activeField === 'enchantment1' && filteredSuggestions.length > 0 && (
                      <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-600 rounded shadow-lg max-h-32 overflow-y-auto">
                        {filteredSuggestions.map(s => (
                          <button
                            key={s}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleSuggestionClick('enchantment1', s)}
                            className="w-full text-left px-2 py-1.5 text-sm text-slate-200 hover:bg-yellow-600 hover:text-black"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <label className="block text-xs font-bold text-purple-400 mt-2">Kademe</label>
                  <div className="flex bg-slate-900 rounded p-1 gap-1">
                    {['I', 'II', 'III'].map(tier => (
                      <button
                        key={tier}
                        type="button"
                        onClick={() => setFormData({...formData, enchantment2: tier})}
                        className={`flex-1 text-sm py-1.5 rounded font-bold transition-colors ${formData.enchantment2 === tier ? 'bg-purple-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
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
                      onFocus={() => setActiveField('enchantment1')}
                      onBlur={handleFieldBlur}
                      className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm focus:border-yellow-500 focus:outline-none placeholder-slate-600"
                    />
                    {activeField === 'enchantment1' && filteredSuggestions.length > 0 && (
                      <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-600 rounded shadow-lg max-h-32 overflow-y-auto">
                        {filteredSuggestions.map(s => (
                          <button
                            key={s}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleSuggestionClick('enchantment1', s)}
                            className="w-full text-left px-2 py-1.5 text-sm text-slate-200 hover:bg-yellow-600 hover:text-black"
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
                      onFocus={() => setActiveField('enchantment2')}
                      onBlur={handleFieldBlur}
                      className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm focus:border-yellow-500 focus:outline-none placeholder-slate-600"
                    />
                    {activeField === 'enchantment2' && filteredSuggestions.length > 0 && (
                      <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-600 rounded shadow-lg max-h-32 overflow-y-auto">
                        {filteredSuggestions.map(s => (
                          <button
                            key={s}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleSuggestionClick('enchantment2', s)}
                            className="w-full text-left px-2 py-1.5 text-sm text-slate-200 hover:bg-yellow-600 hover:text-black"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Set Completion Info */}
              {setMap && formData.enchantment1?.trim() && SET_CATEGORIES.includes(formData.category || '') && (() => {
                const key = `${formData.enchantment1!.trim()}|||${(formData.enchantment2 || '').trim()}`;
                const locations = setMap.get(key);
                const setCount = locations ? new Set(locations.map(l => l.category)).size : 0;
                if (setCount === 0) return null;
                return (
                  <div
                    onClick={() => onSetClick?.(formData.enchantment1!, formData.enchantment2 || '')}
                    className="cursor-pointer bg-slate-900/50 p-2 rounded border border-slate-700 flex items-center justify-between hover:bg-slate-800 transition-colors"
                  >
                    <span className="text-xs text-slate-300">Set Tamamlama</span>
                    <span className={`text-sm font-bold ${setCount >= 8 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {setCount} / 8
                    </span>
                  </div>
                );
              })()}

              <div className="flex gap-2 mt-6 pt-4 border-t border-slate-700 flex-wrap">
                {existingItem && (
                  <button 
                    type="button" 
                    onClick={onDelete}
                    className="px-4 py-2 bg-red-900 hover:bg-red-700 text-red-100 rounded text-sm font-bold border border-red-800"
                  >
                    Sil
                  </button>
                )}
                
                {existingItem && existingItem.type === 'Recipe' && onRead && (
                    <button
                        type="button"
                        onClick={handleRead}
                        className="px-4 py-2 bg-purple-700 hover:bg-purple-600 text-white rounded text-sm font-bold border border-purple-500 flex items-center gap-2"
                        title="Reçeteyi oku ve kasadan kaldır"
                    >
                        <BookOpen size={16} />
                        <span className="hidden sm:inline">Reçeteyi Oku</span>
                        <span className="sm:hidden">Oku</span>
                    </button>
                )}

                <div className="flex-1"></div>
                {!existingItem && (
                   <button type="button" onClick={() => setStep(2)} className="px-3 py-2 text-slate-400 hover:text-white text-sm">Geri</button>
                )}
                <button 
                  type="submit" 
                  className="px-6 py-2 bg-yellow-600 hover:bg-yellow-500 text-black rounded text-sm font-bold shadow-[0_0_10px_rgba(234,179,8,0.3)] border border-yellow-400"
                >
                  {existingItem ? 'Güncelle' : 'Oluştur'}
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
};