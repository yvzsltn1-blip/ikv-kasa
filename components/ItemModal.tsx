import React, { useState, useEffect } from 'react';
import { CATEGORY_OPTIONS, ItemData } from '../types';
import { HERO_CLASSES, GENDER_OPTIONS } from '../constants';
import { X, BookOpen, CheckCircle, Circle, Layers, Sword } from 'lucide-react';

interface ItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: ItemData) => void;
  onDelete: () => void;
  onRead?: (item: ItemData) => void;
  existingItem: ItemData | null;
}

export const ItemModal: React.FC<ItemModalProps> = ({ isOpen, onClose, onSave, onDelete, onRead, existingItem }) => {
  const [step, setStep] = useState(1);
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
  });

  useEffect(() => {
    if (isOpen) {
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
        id: existingItem?.id || Math.random().toString(36).substr(2, 9),
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-800 border-4 border-slate-600 rounded-lg shadow-2xl w-96 max-w-full text-slate-200 relative overflow-hidden">
        
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
                  <span className="font-bold">Normal İtem</span>
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
                    onClick={() => { setFormData({ ...formData, category: cat }); handleNext(); }}
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

              {/* Gender */}
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
                      onChange={(e) => setFormData({...formData, level: parseInt(e.target.value) || 1})}
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
                          onChange={(e) => setFormData({...formData, count: parseInt(e.target.value) || 1})}
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
                        placeholder="Örn: Kılıç, Yay, Çift El, Hançer..."
                        value={formData.weaponType || ''}
                        onChange={(e) => setFormData({...formData, weaponType: e.target.value})}
                        className="w-full bg-slate-900 border border-red-900/60 rounded px-2 py-1 text-sm focus:border-red-500 focus:outline-none placeholder-slate-600 text-red-100"
                      />
                  </div>
              )}

              {/* Enchantments */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-400">Efsunlar (Max 2)</label>
                <input 
                  type="text" 
                  placeholder="1. Efsun (Örn: Alman Modeli)"
                  value={formData.enchantment1}
                  onChange={(e) => setFormData({...formData, enchantment1: e.target.value})}
                  className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm focus:border-yellow-500 focus:outline-none placeholder-slate-600"
                />
                <input 
                  type="text" 
                  placeholder="2. Efsun (Örn: Dış Şehir Modeli)"
                  value={formData.enchantment2}
                  onChange={(e) => setFormData({...formData, enchantment2: e.target.value})}
                  className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm focus:border-yellow-500 focus:outline-none placeholder-slate-600"
                />
              </div>

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