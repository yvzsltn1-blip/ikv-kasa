import React, { useState, useEffect } from 'react';
import { Account, Character, ItemData, Container, SlotData, UserRole } from './types';
import { createAccount, CLASS_COLORS } from './constants';
import { ContainerGrid } from './components/ContainerGrid';
import { ItemModal } from './components/ItemModal';
import { GlobalSearchModal } from './components/GlobalSearchModal';
import { RecipeBookModal } from './components/RecipeBookModal';
import { LoginScreen } from './components/LoginScreen';
import { User, Save, Plus, Trash2, ChevronDown, FileSpreadsheet, Edit3, Settings, Shield, Search, Book, LogOut } from 'lucide-react';

const STORAGE_KEY = 'rpg_inventory_data_v1';

// View sequence
const VIEW_ORDER = ['bank1', 'bank2', 'bag'] as const;
type ViewType = typeof VIEW_ORDER[number];

export default function App() {
  // --- Auth State ---
  const [userRole, setUserRole] = useState<UserRole>(null);

  // Global State
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  
  // UI State
  const [activeCharIndex, setActiveCharIndex] = useState(0);
  const [currentViewIndex, setCurrentViewIndex] = useState(0);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isRecipeBookOpen, setIsRecipeBookOpen] = useState(false);
  
  // Input State (Temporary states for name editing)
  const [tempAccountName, setTempAccountName] = useState('');
  const [tempCharName, setTempCharName] = useState('');

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [activeSlot, setActiveSlot] = useState<{ containerId: string; slotId: number } | null>(null);

  // Tooltip State
  const [tooltip, setTooltip] = useState<{ item: ItemData; x: number; y: number } | null>(null);

  // Initialize & Migration Logic
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        
        // Migration Check
        if (!Array.isArray(parsed)) {
          const migratedAccount: Account = {
             ...parsed,
             id: 'default_migrated',
          };
          setAccounts([migratedAccount]);
          setSelectedAccountId(migratedAccount.id);
        } else {
          // Check for missing data fields (Migration for v2 features)
          const updatedAccounts = parsed.map((acc: Account) => ({
            ...acc,
            characters: acc.characters.map((char: Character) => ({
              ...char,
              bag: char.bag.rows === 6 ? char.bag : { ...char.bag, rows: 6, cols: 4 }, // Fix bag size
              learnedRecipes: char.learnedRecipes || [] // Initialize recipe array if missing
            }))
          }));
          
          if (updatedAccounts.length > 0) {
            setAccounts(updatedAccounts);
            setSelectedAccountId(updatedAccounts[0].id);
          } else {
            initializeDefault();
          }
        }
      } catch (e) {
        console.error("Failed to load data", e);
        initializeDefault();
      }
    } else {
      initializeDefault();
    }
  }, []);

  const initializeDefault = () => {
    const newId = Math.random().toString(36).substr(2, 9);
    const defaultAccount = createAccount(newId, 'Oyuncu 1');
    setAccounts([defaultAccount]);
    setSelectedAccountId(newId);
  };

  const saveData = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
  };

  // Helper to force save specific accounts state (used by name buttons)
  const persistAccounts = (newAccounts: Account[]) => {
    setAccounts(newAccounts);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newAccounts));
  };

  // --- Sync Temp States when Active Data Changes ---
  const activeAccount = accounts.find(a => a.id === selectedAccountId);
  const activeChar = activeAccount?.characters[activeCharIndex];

  useEffect(() => {
    if (activeAccount) {
        setTempAccountName(activeAccount.name);
    }
  }, [selectedAccountId, accounts]); // Update when account changes or data loads

  useEffect(() => {
    if (activeChar) {
        setTempCharName(activeChar.name);
    }
  }, [activeCharIndex, selectedAccountId, accounts]);


  // --- Account Management ---

  const handleAddAccount = () => {
    if (userRole !== 'admin') return; // Restriction
    const newId = Math.random().toString(36).substr(2, 9);
    const name = `Oyuncu ${accounts.length + 1}`;
    const newAccount = createAccount(newId, name);
    const newAccounts = [...accounts, newAccount];
    setAccounts(newAccounts);
    setSelectedAccountId(newId);
    setActiveCharIndex(0);
  };

  const handleDeleteAccount = () => {
    if (userRole !== 'admin') return; // Restriction
    if (accounts.length <= 1) {
      alert("En az bir hesap kalmalıdır.");
      return;
    }
    const confirmDelete = window.confirm("Bu hesabı ve içindeki tüm eşyaları silmek istediğinize emin misiniz?");
    if (confirmDelete) {
      const newAccounts = accounts.filter(a => a.id !== selectedAccountId);
      setAccounts(newAccounts);
      setSelectedAccountId(newAccounts[0].id);
      setActiveCharIndex(0);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newAccounts));
    }
  };

  // --- Auth Handlers ---
  const handleLogin = (role: UserRole) => {
    setUserRole(role);
  };

  const handleLogout = () => {
    setUserRole(null);
    setTooltip(null);
    setIsSearchOpen(false);
    setIsRecipeBookOpen(false);
    setModalOpen(false);
  };

  // --- Name Update Handlers (Commit) ---

  const commitAccountName = () => {
    const newAccounts = accounts.map(acc => 
      acc.id === selectedAccountId ? { ...acc, name: tempAccountName } : acc
    );
    persistAccounts(newAccounts);
  };

  const commitCharacterName = () => {
    if (!activeAccount) return;
    const newChars = [...activeAccount.characters];
    newChars[activeCharIndex] = { ...newChars[activeCharIndex], name: tempCharName };
    const newAccounts = accounts.map(acc => 
        acc.id === selectedAccountId ? { ...acc, characters: newChars } : acc
    );
    persistAccounts(newAccounts);
  };


  // --- Export Excel (CSV) ---
  const handleExportExcel = () => {
    if (!activeAccount) return;

    // Headers
    const rows = [
      ["Hesap", "Karakter", "Kasa/Çanta", "Satır", "Sütun", "Efsun 1", "Efsun 2", "Kategori", "Silah Cinsi", "Seviye", "Cinsiyet", "Sınıf", "Okunmuş", "Adet"]
    ];

    activeAccount.characters.forEach(char => {
      // 1. Inventory Items
      [char.bank1, char.bank2, char.bag].forEach(container => {
        container.slots.forEach(slot => {
          if (slot.item) {
            const row = Math.floor(slot.id / container.cols) + 1;
            const col = (slot.id % container.cols) + 1;
            rows.push([
              activeAccount.name, char.name, container.name, row.toString(), col.toString(),
              slot.item.enchantment1 || "-", slot.item.enchantment2 || "-",
              slot.item.category,
              slot.item.weaponType || "-",
              slot.item.level.toString(), slot.item.gender || "-", slot.item.heroClass, "Hayır",
              slot.item.count ? slot.item.count.toString() : "1"
            ]);
          }
        });
      });

      // 2. Learned Recipes
      char.learnedRecipes.forEach(item => {
        rows.push([
            activeAccount.name, char.name, "Reçete Kitabı", "-", "-",
            item.enchantment1 || "-", item.enchantment2 || "-",
            item.category, 
            item.weaponType || "-",
            item.level.toString(), item.gender || "-", item.heroClass, "Evet",
            item.count ? item.count.toString() : "1"
        ]);
      });
    });

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + rows.map(e => e.map(c => `"${c}"`).join(",")).join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${activeAccount.name}_rpg_export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Search Navigation ---
  const handleSearchResultNavigate = (accountId: string, charIndex: number, viewIndex: number, openBook?: boolean) => {
    setSelectedAccountId(accountId);
    setActiveCharIndex(charIndex);
    setCurrentViewIndex(viewIndex);
    if (openBook) {
        setIsRecipeBookOpen(true);
    } else {
        setIsRecipeBookOpen(false);
    }
  };

  // --- Item Management ---

  // Handle Drag and Drop Item Swap/Move
  const handleMoveItem = (containerId: string, fromSlotId: number, toSlotId: number) => {
    if (fromSlotId === toSlotId) return;
    if (!activeAccount) return;

    setAccounts(prevAccounts => prevAccounts.map(acc => {
      if (acc.id !== selectedAccountId) return acc;

      const newChars = [...acc.characters];
      const targetChar = { ...newChars[activeCharIndex] };
      
      let targetContainer: Container | null = null;
      let containerKey: 'bank1' | 'bank2' | 'bag' | null = null;

      // Identify the container
      if (targetChar.bank1.id === containerId) { targetContainer = targetChar.bank1; containerKey = 'bank1'; }
      else if (targetChar.bank2.id === containerId) { targetContainer = targetChar.bank2; containerKey = 'bank2'; }
      else if (targetChar.bag.id === containerId) { targetContainer = targetChar.bag; containerKey = 'bag'; }

      if (targetContainer && containerKey) {
        const newSlots = [...targetContainer.slots];
        
        // Get items
        const itemFrom = newSlots[fromSlotId].item;
        const itemTo = newSlots[toSlotId].item;

        // Swap Logic
        newSlots[toSlotId] = { ...newSlots[toSlotId], item: itemFrom };
        newSlots[fromSlotId] = { ...newSlots[fromSlotId], item: itemTo }; // If itemTo is null, it moves into empty. If not null, it swaps.
        
        targetChar[containerKey] = {
          ...targetContainer,
          slots: newSlots
        };
        newChars[activeCharIndex] = targetChar;
      }

      return { ...acc, characters: newChars };
    }));
  };

  // Helper to update a specific slot
  const updateSlot = (containerId: string, slotId: number, item: ItemData | null) => {
    if (!activeAccount) return;

    setAccounts(prevAccounts => prevAccounts.map(acc => {
      if (acc.id !== selectedAccountId) return acc;

      const newChars = [...acc.characters];
      const targetChar = { ...newChars[activeCharIndex] };
      
      let targetContainer: Container | null = null;
      let containerKey: 'bank1' | 'bank2' | 'bag' | null = null;

      if (targetChar.bank1.id === containerId) { targetContainer = targetChar.bank1; containerKey = 'bank1'; }
      else if (targetChar.bank2.id === containerId) { targetContainer = targetChar.bank2; containerKey = 'bank2'; }
      else if (targetChar.bag.id === containerId) { targetContainer = targetChar.bag; containerKey = 'bag'; }

      if (targetContainer && containerKey) {
        const newSlots = [...targetContainer.slots];
        newSlots[slotId] = { ...newSlots[slotId], item };
        
        targetChar[containerKey] = {
          ...targetContainer,
          slots: newSlots
        };
        newChars[activeCharIndex] = targetChar;
      }

      return { ...acc, characters: newChars };
    }));
  };

  // Move item from slot to Learned Recipes list
  const handleReadRecipe = (item: ItemData) => {
      if (!activeAccount || !activeSlot) return;

      setAccounts(prevAccounts => prevAccounts.map(acc => {
        if (acc.id !== selectedAccountId) return acc;
  
        const newChars = [...acc.characters];
        const targetChar = { ...newChars[activeCharIndex] };
        
        // 1. Add to learned recipes
        targetChar.learnedRecipes = [...targetChar.learnedRecipes, item];

        // 2. Remove from container slot
        let targetContainer: Container | null = null;
        let containerKey: 'bank1' | 'bank2' | 'bag' | null = null;

        if (targetChar.bank1.id === activeSlot.containerId) { targetContainer = targetChar.bank1; containerKey = 'bank1'; }
        else if (targetChar.bank2.id === activeSlot.containerId) { targetContainer = targetChar.bank2; containerKey = 'bank2'; }
        else if (targetChar.bag.id === activeSlot.containerId) { targetContainer = targetChar.bag; containerKey = 'bag'; }

        if (targetContainer && containerKey) {
            const newSlots = [...targetContainer.slots];
            newSlots[activeSlot.slotId] = { ...newSlots[activeSlot.slotId], item: null };
            targetChar[containerKey] = { ...targetContainer, slots: newSlots };
        }

        newChars[activeCharIndex] = targetChar;
        return { ...acc, characters: newChars };
      }));
  };

  const handleUnlearnRecipe = (recipeId: string) => {
    setAccounts(prevAccounts => prevAccounts.map(acc => {
        if (acc.id !== selectedAccountId) return acc;
        const newChars = [...acc.characters];
        const targetChar = { ...newChars[activeCharIndex] };
        targetChar.learnedRecipes = targetChar.learnedRecipes.filter(r => r.id !== recipeId);
        newChars[activeCharIndex] = targetChar;
        return { ...acc, characters: newChars };
    }));
  };

  const handleSlotClick = (containerId: string, slotId: number) => {
    setActiveSlot({ containerId, slotId });
    setModalOpen(true);
    setTooltip(null); // Close tooltip on click
  };

  const handleSlotHover = (item: ItemData | null, e: React.MouseEvent) => {
    if (item) {
      setTooltip({
        item,
        x: e.clientX,
        y: e.clientY
      });
    } else {
      setTooltip(null);
    }
  };

  const handleSaveItem = (item: ItemData) => {
    if (!activeAccount || !activeSlot) return;

    // Special Case: If it's a "Read" recipe being created/saved
    if (item.type === 'Recipe' && item.isRead) {
        setAccounts(prevAccounts => prevAccounts.map(acc => {
            if (acc.id !== selectedAccountId) return acc;
      
            const newChars = [...acc.characters];
            const targetChar = { ...newChars[activeCharIndex] };
            
            // Add to learned recipes (Prevent duplicate IDs if editing?)
            const existingIdx = targetChar.learnedRecipes.findIndex(r => r.id === item.id);
            if (existingIdx !== -1) {
                // Update existing
                targetChar.learnedRecipes[existingIdx] = item;
            } else {
                // Add new
                targetChar.learnedRecipes = [...targetChar.learnedRecipes, item];
            }
    
            // Ensure the slot is empty (because it's now in the book)
            let targetContainer: Container | null = null;
            let containerKey: 'bank1' | 'bank2' | 'bag' | null = null;
    
            if (targetChar.bank1.id === activeSlot.containerId) { targetContainer = targetChar.bank1; containerKey = 'bank1'; }
            else if (targetChar.bank2.id === activeSlot.containerId) { targetContainer = targetChar.bank2; containerKey = 'bank2'; }
            else if (targetChar.bag.id === activeSlot.containerId) { targetContainer = targetChar.bag; containerKey = 'bag'; }
    
            if (targetContainer && containerKey) {
                const newSlots = [...targetContainer.slots];
                // Only clear the slot if we were Editing an existing unread item and turned it into Read,
                // OR if we are creating a New item (which shouldn't occupy the slot if read).
                // Essentially, saving a "Read" recipe ALWAYS clears the slot.
                newSlots[activeSlot.slotId] = { ...newSlots[activeSlot.slotId], item: null };
                targetChar[containerKey] = { ...targetContainer, slots: newSlots };
            }
    
            newChars[activeCharIndex] = targetChar;
            return { ...acc, characters: newChars };
        }));
    } else {
        // Normal Save (Unread Recipe or Normal Item) -> Save to Slot
        updateSlot(activeSlot.containerId, activeSlot.slotId, item);
    }
  };

  const handleDeleteItem = () => {
    if (activeSlot) {
      updateSlot(activeSlot.containerId, activeSlot.slotId, null);
      setModalOpen(false);
    }
  };

  // Get current Item for modal
  const getCurrentItem = (): ItemData | null => {
    if (!activeSlot || !activeChar) return null;
    
    let container: Container | undefined;
    if (activeChar.bank1.id === activeSlot.containerId) container = activeChar.bank1;
    else if (activeChar.bank2.id === activeSlot.containerId) container = activeChar.bank2;
    else if (activeChar.bag.id === activeSlot.containerId) container = activeChar.bag;

    return container?.slots[activeSlot.slotId].item || null;
  };

  const handleNextView = () => {
    setCurrentViewIndex((prev) => (prev + 1) % VIEW_ORDER.length);
  };

  // --- Auth Guard ---
  if (!userRole) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (!activeAccount || !activeChar) return <div className="text-white p-10">Yükleniyor...</div>;

  const currentView = VIEW_ORDER[currentViewIndex];
  const activeContainer = activeChar[currentView];

  return (
    // Outer container: fills screen, centers content
    <div className="h-screen w-screen bg-[url('https://picsum.photos/1920/1080?grayscale&blur=2')] bg-cover bg-center flex items-center justify-center overflow-hidden">
      
      {/* 
        Main UI Frame: 
        - w-[98vw] h-[98vh]: Takes up 98% of viewport width and height.
        - No max-width restriction.
        - Flex column to stack Header + Grid + Footer
      */}
      <div className="w-[98vw] h-[98vh] bg-slate-900/95 border-2 border-slate-700 rounded-lg shadow-[0_0_50px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col relative">
        
        {/* === HEADER === */}
        <div className="flex flex-col border-b-2 border-slate-700 shrink-0">
          
          {/* Top Bar */}
          <div className="bg-slate-800 p-1 flex justify-between items-center gap-2">
            
            {/* Left */}
            <div className="flex items-center gap-2">
               <div className="bg-slate-700 p-1 rounded border border-slate-600 shadow-inner hidden md:block">
                 <Shield size={16} className="text-yellow-600" />
               </div>
               
               <div className="flex flex-col">
                  {/* Account Name with Save Button */}
                  <div className="relative group flex items-center gap-1 mb-1">
                    <input 
                      value={tempAccountName}
                      onChange={(e) => setTempAccountName(e.target.value)}
                      className="bg-transparent text-yellow-500 font-bold text-sm md:text-lg outline-none w-28 md:w-40 placeholder-slate-600 focus:border-b focus:border-yellow-600 transition-all"
                      placeholder="Hesap İsmi"
                    />
                    <button 
                      onClick={commitAccountName}
                      className="p-1 bg-slate-700 hover:bg-green-600 text-slate-300 hover:text-white rounded border border-slate-600 transition-colors"
                      title="Hesap Adını Kaydet"
                    >
                      <Save size={12} />
                    </button>
                    {userRole === 'user' && <span className="text-[10px] text-slate-500 ml-2 border border-slate-600 rounded px-1">Gözlemci Modu</span>}
                  </div>
                  
                  {/* Switcher */}
                  <div className="flex items-center gap-1 md:gap-2">
                     <span className="hidden md:inline text-[9px] text-slate-400 uppercase font-bold tracking-wider">HESAP:</span>
                     <div className="relative">
                        <select 
                          value={selectedAccountId} 
                          onChange={(e) => {
                            setSelectedAccountId(e.target.value);
                            setActiveCharIndex(0);
                            setCurrentViewIndex(0);
                          }}
                          className="appearance-none bg-slate-900/50 hover:bg-slate-700 text-slate-300 text-[9px] md:text-[10px] py-0.5 pl-1 pr-3 rounded border border-slate-600 focus:outline-none cursor-pointer"
                        >
                          {accounts.map(acc => (
                            <option key={acc.id} value={acc.id}>{acc.name}</option>
                          ))}
                        </select>
                        <ChevronDown size={8} className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500"/>
                     </div>

                     {/* Admin Only Controls */}
                     {userRole === 'admin' && (
                        <>
                           <button onClick={handleAddAccount} className="text-green-500 hover:text-green-400" title="Hesap Ekle"><Plus size={12} /></button>
                           {accounts.length > 1 && (
                            <button onClick={handleDeleteAccount} className="text-red-800 hover:text-red-500" title="Hesap Sil"><Trash2 size={12} /></button>
                           )}
                        </>
                     )}
                  </div>
               </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setIsSearchOpen(true)}
                className="flex items-center gap-1 px-3 py-1 bg-slate-700 hover:bg-yellow-600 hover:text-black text-yellow-500 text-[10px] font-bold rounded border border-yellow-500/30 transition-colors"
              >
                <Search size={12} />
                <span className="hidden md:inline">Ara</span>
              </button>

              <button 
                onClick={handleExportExcel}
                className="flex items-center gap-1 px-2 py-1 bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-200 text-[10px] font-bold rounded border border-emerald-800/50"
              >
                <FileSpreadsheet size={12} />
                <span className="hidden md:inline">Excel</span>
              </button>
              
              <button 
                onClick={saveData}
                className="flex items-center gap-1 px-3 py-1 bg-blue-900/40 hover:bg-blue-800/60 text-blue-200 text-[10px] font-bold rounded border border-blue-800/50"
              >
                <Save size={12} />
                <span className="hidden md:inline">Kaydet</span>
              </button>

              {/* Logout Button */}
              <button
                onClick={handleLogout}
                className="flex items-center gap-1 px-2 py-1 bg-red-900/20 hover:bg-red-900/60 text-red-300 text-[10px] font-bold rounded border border-red-900/50 ml-2"
                title="Çıkış Yap"
              >
                <LogOut size={12} />
              </button>
            </div>
          </div>

          {/* Bottom Bar: Characters */}
          <div className="bg-slate-800 px-1 flex justify-between items-end gap-1">
             <div className="flex gap-0.5 overflow-x-auto w-full no-scrollbar">
                {activeAccount.characters.map((char, idx) => (
                  <button
                    key={char.id}
                    onClick={() => { setActiveCharIndex(idx); setCurrentViewIndex(0); }}
                    className={`
                      px-2 md:px-3 py-1 rounded-t-lg font-bold text-[10px] md:text-xs tracking-wide transition-all border-t border-x whitespace-nowrap flex items-center gap-1 flex-1 justify-center
                      ${activeCharIndex === idx 
                        ? 'bg-slate-900/50 border-slate-600 text-white translate-y-[1px] border-b-0' 
                        : 'bg-slate-900/20 border-transparent text-slate-500 hover:bg-slate-700 hover:text-slate-300'
                      }
                    `}
                  >
                    <User size={10} className={activeCharIndex === idx ? 'text-yellow-500' : 'opacity-50'} />
                    {char.name}
                  </button>
                ))}
             </div>

             <div className="hidden md:flex items-center gap-2 bg-black/20 px-2 py-1 rounded-t-md border-t border-x border-slate-700/50">
                {/* Book Button */}
                <button 
                  onClick={() => setIsRecipeBookOpen(true)}
                  className="p-1 mr-1 text-purple-400 hover:text-purple-200 hover:bg-purple-900/30 rounded transition-colors relative group"
                  title="Reçete Kitabı"
                >
                    <Book size={14} />
                    {activeChar.learnedRecipes?.length > 0 && (
                        <span className="absolute -top-1 -right-1 bg-purple-600 text-white text-[8px] rounded-full w-3 h-3 flex items-center justify-center">
                            {activeChar.learnedRecipes.length}
                        </span>
                    )}
                </button>

                <div className="w-[1px] h-4 bg-slate-700 mx-1"></div>

                <span className="text-[9px] text-slate-500 uppercase font-bold">AKTİF:</span>
                <input 
                   value={tempCharName}
                   onChange={(e) => setTempCharName(e.target.value)}
                   className="bg-transparent text-blue-300 font-bold text-xs outline-none w-20 border-b border-transparent focus:border-blue-500 placeholder-slate-600"
                   placeholder="Karakter İsmi"
                />
                 <button 
                  onClick={commitCharacterName}
                  className="p-0.5 bg-slate-700 hover:bg-green-600 text-slate-300 hover:text-white rounded border border-slate-600 transition-colors"
                  title="Karakter Adını Kaydet"
                >
                  <Save size={10} />
                </button>
             </div>
          </div>
        </div>

        {/* Content Area - Fills remaining height */}
        <div className="p-1 bg-slate-800/50 flex-1 overflow-hidden flex flex-col">
           <div className="flex-1 w-full h-full">
              {currentView === 'bag' ? (
                 <div className="w-full h-full flex items-center justify-center animate-in fade-in zoom-in duration-300">
                    {/* Bag view is smaller by nature, but we let it scale up a bit more */}
                    <div className="w-full h-full max-w-[90%] max-h-[80%] bg-[#1a1510] p-1 rounded-xl border-4 border-[#3e3428] shadow-2xl relative flex flex-col">
                        <ContainerGrid 
                            container={activeContainer} 
                            onSlotClick={handleSlotClick} 
                            onSlotHover={handleSlotHover}
                            onMoveItem={handleMoveItem}
                            searchQuery={""}
                            onNext={handleNextView}
                        />
                    </div>
                 </div>
              ) : (
                  <div className="w-full h-full animate-in fade-in slide-in-from-bottom-4 duration-300">
                     <ContainerGrid 
                        container={activeContainer} 
                        onSlotClick={handleSlotClick} 
                        onSlotHover={handleSlotHover}
                        onMoveItem={handleMoveItem}
                        searchQuery={""}
                        onNext={handleNextView}
                    />
                  </div>
              )}
           </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-900 p-0.5 flex justify-between items-center text-[8px] md:text-[9px] text-slate-600 border-t border-slate-700 shrink-0">
           <span className="w-full text-center">RPG Inventory System v2.1 • {activeChar.name} • {userRole?.toUpperCase()} MODU</span>
        </div>
      </div>

      <ItemModal 
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSaveItem}
        onDelete={handleDeleteItem}
        onRead={handleReadRecipe}
        existingItem={getCurrentItem()}
      />

      <GlobalSearchModal 
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        accounts={accounts}
        onNavigate={handleSearchResultNavigate}
      />
      
      <RecipeBookModal 
        isOpen={isRecipeBookOpen}
        onClose={() => setIsRecipeBookOpen(false)}
        characterName={activeChar.name}
        recipes={activeChar.learnedRecipes || []}
        onUnlearn={handleUnlearnRecipe}
      />

      {tooltip && (
        <div 
          className="fixed z-50 pointer-events-none"
          style={{ 
            top: tooltip.y + 15, 
            left: Math.min(tooltip.x + 15, window.innerWidth - 220) 
          }}
        >
          <div className="bg-slate-900 border-2 border-slate-500 rounded p-2 text-xs shadow-[0_0_15px_rgba(0,0,0,0.8)] text-left w-52">
            <div className={`font-bold border-b border-slate-700 pb-1 mb-1 ${tooltip.item.type === 'Recipe' ? 'text-yellow-300' : 'text-white'}`}>
              {tooltip.item.category} {tooltip.item.type === 'Recipe' ? '(Reçete)' : ''}
              {tooltip.item.count && tooltip.item.count > 1 && (
                  <span className="float-right text-emerald-400">x{tooltip.item.count}</span>
              )}
            </div>
            
            <div className={`${CLASS_COLORS[tooltip.item.heroClass]} font-bold mb-1`}>
              Sınıf: {tooltip.item.heroClass}
            </div>
            
            {tooltip.item.weaponType && (
               <div className="text-red-400 font-bold mb-1 border-b border-slate-700/50 pb-0.5">
                  {tooltip.item.weaponType}
               </div>
            )}

            <div className="text-gray-300 mb-1">
              Cinsiyet: <span className="text-white font-bold">{tooltip.item.gender || 'Belirtilmedi'}</span>
            </div>

            <div className="text-green-400 mb-1">Seviye: {tooltip.item.level}</div>
            
            {(tooltip.item.enchantment1 || tooltip.item.enchantment2) && (
              <div className="bg-slate-800 p-1.5 rounded mt-1 border border-slate-700 space-y-1">
                  {tooltip.item.enchantment1 && <div className="text-yellow-200 break-words">• {tooltip.item.enchantment1}</div>}
                  {tooltip.item.enchantment2 && <div className="text-yellow-200 break-words">• {tooltip.item.enchantment2}</div>}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}