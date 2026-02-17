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

export const RecipeBookModal: React.FC<RecipeBookModalProps> = ({
  isOpen,
  onClose,
  characterName,
  recipes,
  onUnlearn,
  onEdit,
}) => {
  const [search, setSearch] = useState('');

  if (!isOpen) return null;

  const filteredRecipes = recipes.filter((r) =>
    r.category.toLowerCase().includes(search.toLowerCase()) ||
    r.enchantment1.toLowerCase().includes(search.toLowerCase()) ||
    r.enchantment2.toLowerCase().includes(search.toLowerCase())
  );
  const hasSearch = search.trim().length > 0;

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
              <h2 className="text-xl font-serif font-bold text-[#d4b483] tracking-wide">Okunmus Receteler</h2>
              <div className="text-xs text-[#8c7b6c]">{characterName} • {recipes.length} Recete</div>
            </div>
          </div>
          <button onClick={onClose} className="text-[#8c7b6c] hover:text-[#d4b483] transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="px-4 py-3.5 bg-[#231e1a] border-b border-[#4a3e32]">
          <div className="rounded-2xl border border-[#5f4d3c] bg-[linear-gradient(140deg,#17120f_0%,#221b16_50%,#17120f_100%)] p-2.5 shadow-[0_14px_30px_rgba(0,0,0,0.35)]">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#ad957d]">Hizli Arama</span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                  hasSearch
                    ? 'border-[#c49a61]/60 bg-[#3a2a1b] text-[#e9c58f]'
                    : 'border-[#514132] bg-[#221b16] text-[#9b866f]'
                }`}
              >
                {filteredRecipes.length} sonuc
              </span>
            </div>

            <div className="relative">
              <div className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg border border-[#5c4c3d] bg-[#1d1713] flex items-center justify-center">
                <Search className="text-[#c6ab8a]" size={15} />
              </div>
              <input
                type="text"
                placeholder="Kategori, efsun veya sinif ara..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-11 w-full rounded-xl border-2 border-[#4e3f33] bg-[#120f0d]/90 pl-12 pr-24 text-[#edd9ba] placeholder-[#7a6653] text-sm outline-none transition-all focus:border-[#c9a870]/70 focus:shadow-[0_0_0_3px_rgba(201,168,112,0.2)]"
              />
              <button
                type="button"
                onClick={() => setSearch('')}
                className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition-all ${
                  hasSearch
                    ? 'border border-[#8d6f4f] bg-[#3b2c20] text-[#f0d2a7] hover:bg-[#4a3727]'
                    : 'border border-[#45372b] bg-[#221a14] text-[#746352] hover:text-[#9f8a71]'
                }`}
              >
                Temizle
              </button>
            </div>

            <div className="mt-2.5 flex items-center justify-between text-[10px] text-[#8f7c68]">
              <span className="rounded-full border border-[#4e4033] bg-[#1a1512]/80 px-2 py-0.5">
                {filteredRecipes.length} / {recipes.length} recete
              </span>
              <span className="tracking-wide">Kategori veya efsun ara</span>
            </div>
          </div>
        </div>

        {/* Recipe List */}
        <div className="flex-1 overflow-auto p-4 custom-scrollbar bg-[url('https://www.transparenttextures.com/patterns/paper-fibers.png')]">
          {recipes.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-[#5e5044] gap-2">
              <Scroll size={48} className="opacity-20" />
              <p>Henuz okunmus recete yok.</p>
            </div>
          ) : filteredRecipes.length === 0 ? (
            <div className="text-center py-10 text-[#5e5044]">Sonuc bulunamadi.</div>
          ) : (
            <div className="grid gap-1.5 min-w-[560px]">
              <div className="grid grid-cols-[42px_minmax(110px,1fr)_minmax(160px,1.8fr)_78px_70px] items-center gap-2 px-2 py-1 rounded-md border border-[#4a3e32]/70 bg-[#17120f]/75 text-[10px] uppercase tracking-[0.1em] text-[#8f7c68]">
                <span className="text-center">Tip</span>
                <span>Kategori</span>
                <span>Efsunlar</span>
                <span className="text-right">Cinsiyet</span>
                <span className="text-right">Islem</span>
              </div>
              {filteredRecipes.map((recipe, idx) => (
                <div
                  key={recipe.id + idx}
                  className="grid grid-cols-[42px_minmax(110px,1fr)_minmax(160px,1.8fr)_78px_70px] items-center gap-2 rounded-md border border-[#3e3428] bg-[#231e1a]/85 px-2 py-1.5 hover:bg-[#2c241f] transition-colors group"
                >
                  <div className={`w-10 h-10 rounded border-2 flex items-center justify-center bg-black/40 ${CATEGORY_COLORS[recipe.category]}`}>
                    <span className="text-[11px] font-bold text-white shadow-black drop-shadow-md">
                      {recipe.category.substring(0, 3)}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-bold leading-tight text-[#e0cda8]">{recipe.category}</div>
                    <div className="mt-0.5 flex items-center gap-1 text-[10px]">
                      <span className={`px-1.5 py-0.5 rounded border border-white/10 ${CLASS_COLORS[recipe.heroClass]}`}>
                        {recipe.heroClass}
                      </span>
                      <span className="text-[#8c7b6c] bg-black/20 px-1 py-0.5 rounded">Lv.{recipe.level}</span>
                    </div>
                  </div>

                  <div className="min-w-0 flex items-center gap-1.5">
                    <span className="inline-flex min-w-0 max-w-[48%] items-center gap-1 rounded-md border border-[#4a3d31] bg-black/20 px-2 py-1 text-[12px] text-[#ccb89c]">
                      <span className="h-1.5 w-1.5 rounded-full bg-purple-500 shrink-0"></span>
                      <span className="truncate">{recipe.enchantment1 || '-'}</span>
                    </span>
                    <span className="inline-flex min-w-0 max-w-[48%] items-center gap-1 rounded-md border border-[#4a3d31] bg-black/20 px-2 py-1 text-[12px] text-[#ccb89c]">
                      <span className="h-1.5 w-1.5 rounded-full bg-purple-500 shrink-0"></span>
                      <span className="truncate">{recipe.enchantment2 || '-'}</span>
                    </span>
                  </div>

                  <div className="text-right text-[11px] font-mono text-[#7f6f62] truncate">{recipe.gender}</div>

                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => onEdit(recipe)}
                      className="p-1 text-blue-400/70 hover:text-blue-300 hover:bg-blue-900/20 rounded transition-colors"
                      title="Duzenle"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm('Bu receteyi unutmak (silmek) istediginize emin misiniz?')) {
                          onUnlearn(recipe.id);
                        }
                      }}
                      className="p-1 text-red-900/40 hover:text-red-500 hover:bg-red-900/20 rounded transition-colors"
                      title="Unut (Sil)"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-2 bg-[#1a1614] border-t border-[#4a3e32] text-center text-[10px] text-[#5e5044]">
          Receteleri okuyarak kasanizda yer acabilirsiniz.
        </div>
      </div>
    </div>
  );
};
