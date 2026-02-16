import React, { useState } from 'react';
import { ItemData } from '../types';
import { X, Search, Trash2, Scroll, Pencil } from 'lucide-react';
import { CATEGORY_COLORS, CLASS_COLORS } from '../constants';

interface RecipeBookModalProps {
  isOpen: boolean;
  onClose: () => void;
  characterName: string;
  recipes: ItemData[];
  onUnlearn: (recipeId: string) => void;
  onEdit: (recipe: ItemData) => void;
}

export const RecipeBookModal: React.FC<RecipeBookModalProps> = ({ isOpen, onClose, characterName, recipes, onUnlearn, onEdit }) => {
  const [search, setSearch] = useState('');

  if (!isOpen) return null;

  const filteredRecipes = recipes.filter(r => 
    r.category.toLowerCase().includes(search.toLowerCase()) ||
    r.enchantment1.toLowerCase().includes(search.toLowerCase()) ||
    r.enchantment2.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#1a1614] border-2 md:border-4 border-[#4a3e32] rounded-xl shadow-2xl w-[95vw] md:w-[600px] h-[88vh] md:h-[80vh] flex flex-col relative overflow-hidden">
        
        {/* Book Header */}
        <div className="bg-[#2c241f] p-4 border-b border-[#4a3e32] flex justify-between items-center shadow-md">
          <div className="flex items-center gap-3">
             <div className="bg-purple-900/50 p-2 rounded-full border border-purple-500/30">
                <Scroll className="text-purple-300" size={24} />
             </div>
             <div>
                <h2 className="text-xl font-serif font-bold text-[#d4b483] tracking-wide">Okunmuş Reçeteler</h2>
                <div className="text-xs text-[#8c7b6c]">{characterName} • {recipes.length} Reçete</div>
             </div>
          </div>
          <button onClick={onClose} className="text-[#8c7b6c] hover:text-[#d4b483] transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-3 bg-[#231e1a] border-b border-[#4a3e32]">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5e5044]" size={16}/>
                <input 
                    type="text" 
                    placeholder="Okunmuş reçetelerde ara..." 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full bg-[#120f0d] border border-[#3e3428] rounded-md py-2 pl-9 pr-3 text-[#d4b483] placeholder-[#5e5044] focus:outline-none focus:border-[#d4b483]/50"
                />
            </div>
        </div>

        {/* Recipe List */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-[url('https://www.transparenttextures.com/patterns/paper-fibers.png')]">
            {recipes.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-[#5e5044] gap-2">
                    <Scroll size={48} className="opacity-20" />
                    <p>Henüz okunmuş reçete yok.</p>
                </div>
            ) : filteredRecipes.length === 0 ? (
                 <div className="text-center py-10 text-[#5e5044]">Sonuç bulunamadı.</div>
            ) : (
                <div className="grid gap-3">
                    {filteredRecipes.map((recipe, idx) => (
                        <div key={recipe.id + idx} className="bg-[#231e1a]/80 border border-[#3e3428] p-3 rounded flex justify-between items-start hover:bg-[#2c241f] transition-colors group">
                            
                            {/* Left: Icon & Info */}
                            <div className="flex gap-3">
                                {/* Icon Box */}
                                <div className={`w-12 h-12 rounded border-2 flex items-center justify-center bg-black/40 ${CATEGORY_COLORS[recipe.category]}`}>
                                    <span className="text-xs font-bold text-white shadow-black drop-shadow-md">{recipe.category.substring(0,3)}</span>
                                </div>
                                
                                {/* Text Info */}
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-bold text-[#e0cda8]">{recipe.category}</h3>
                                        <span className={`text-[10px] px-1.5 rounded border border-white/10 ${CLASS_COLORS[recipe.heroClass]}`}>
                                            {recipe.heroClass}
                                        </span>
                                        <span className="text-[10px] text-[#8c7b6c] bg-black/20 px-1 rounded">Lv.{recipe.level}</span>
                                    </div>
                                    <div className="text-xs text-[#a89b8d] mt-1">
                                        {recipe.enchantment1 && <div className="flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-purple-500"></span>{recipe.enchantment1}</div>}
                                        {recipe.enchantment2 && <div className="flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-purple-500"></span>{recipe.enchantment2}</div>}
                                    </div>
                                </div>
                            </div>

                            {/* Right: Actions */}
                            <div className="flex flex-col items-end gap-1">
                                <span className="text-[10px] font-mono text-[#5e5044]">{recipe.gender}</span>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => onEdit(recipe)}
                                        className="p-1.5 text-blue-400/60 hover:text-blue-400 hover:bg-blue-900/20 rounded transition-colors"
                                        title="Düzenle"
                                    >
                                        <Pencil size={14} />
                                    </button>
                                    <button
                                        onClick={() => {
                                            if(window.confirm('Bu reçeteyi unutmak (silmek) istediğinize emin misiniz?')) {
                                                onUnlearn(recipe.id);
                                            }
                                        }}
                                        className="p-1.5 text-red-900/40 hover:text-red-500 hover:bg-red-900/20 rounded transition-colors"
                                        title="Unut (Sil)"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>

        {/* Footer */}
        <div className="p-2 bg-[#1a1614] border-t border-[#4a3e32] text-center text-[10px] text-[#5e5044]">
            Reçeteleri okuyarak kasanızda yer açabilirsiniz.
        </div>

      </div>
    </div>
  );
};