import React, { useState, useEffect } from 'react';
import { Account, Container, ItemData, UserRole } from './types';
import { createAccount, CLASS_COLORS } from './constants';
import { ContainerGrid } from './components/ContainerGrid';
import { ItemModal } from './components/ItemModal';
import { GlobalSearchModal } from './components/GlobalSearchModal';
import { RecipeBookModal } from './components/RecipeBookModal';
import { LoginScreen } from './components/LoginScreen';
import { User, Save, Plus, Trash2, ChevronDown, FileSpreadsheet, Edit3, Shield, Search, Book, LogOut } from 'lucide-react';

// --- FIREBASE IMPORTLARI ---
import { auth, db } from './firebase'; 
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

// View sequence
const VIEW_ORDER = ['bank1', 'bank2', 'bag'] as const;
type ViewType = typeof VIEW_ORDER[number];

export default function App() {
  // --- Auth & Loading State ---
  const [userRole, setUserRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true); // Yükleniyor ekranı için

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

  // --- BAŞLANGIÇ: VERİLERİ BULUTTAN ÇEKME ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // --- YENİ EKLENEN KISIM: E-POSTA DOĞRULAMA KONTROLÜ ---
        if (!user.emailVerified) {
            alert("Giriş yapabilmek için lütfen e-posta adresinizi doğrulayın. (Spam kutusunu kontrol etmeyi unutmayın)");
            await signOut(auth); // Kullanıcıyı sistemden at
            setLoading(false); // Yükleniyor ekranını kapat
            return; // İşlemi durdur, veri çekmeye çalışma
        }
        // -------------------------------------------------------

        // Kullanıcı giriş yapmış ve onaylı, verileri çekelim
        setLoading(true);
        const userDocRef = doc(db, "users", user.uid);
        
        try {
          const docSnap = await getDoc(userDocRef);

          if (docSnap.exists()) {
            // Kayıtlı veri var
            const data = docSnap.data();
            const loadedAccounts = data.accounts || [];
            
            // Eğer hesap dizisi boş gelirse (örn: hata ile kaydedilmişse) varsayılan oluştur
            if (loadedAccounts.length > 0) {
              setAccounts(loadedAccounts);
              setSelectedAccountId(loadedAccounts[0].id);
            } else {
              initializeDefault(userDocRef);
            }
          } else {
            // Hiç veri yok (Yeni Kullanıcı), varsayılan oluştur
            await initializeDefault(userDocRef);
          }
          
          // Rol Belirleme (Admin misin?)
          // BURAYA KENDİ E-POSTA ADRESİNİ YAZMAYI UNUTMA
          if (user.email === 'seninmailin@gmail.com') { 
             setUserRole('admin');
          } else {
             setUserRole('user');
          }

        } catch (error) {
          console.error("Veri çekme hatası:", error);
          alert("Veriler yüklenirken bir hata oluştu. İnternet bağlantınızı kontrol edin.");
        } finally {
          setLoading(false);
        }

      } else {
        // Çıkış yapılmış
        setUserRole(null);
        setAccounts([]);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Varsayılan hesap oluşturucu (Yardımcı Fonksiyon)
  const initializeDefault = async (docRef: any) => {
    const newId = Math.random().toString(36).substr(2, 9);
    const defaultAccount = createAccount(newId, 'Oyuncu 1');
    const initialAccounts = [defaultAccount];
    
    // Veritabanına kaydet
    await setDoc(docRef, { accounts: initialAccounts });
    
    setAccounts(initialAccounts);
    setSelectedAccountId(newId);
  };

  // --- VERİLERİ BULUTA KAYDETME ---
  const saveData = async () => {
    const user = auth.currentUser;
    if (!user) {
        alert("Oturum süresi dolmuş, lütfen sayfayı yenileyip tekrar giriş yapın.");
        return;
    }

    try {
        const userDocRef = doc(db, "users", user.uid);
        await setDoc(userDocRef, { accounts: accounts }, { merge: true });
        alert("✅ Tüm veriler başarıyla buluta kaydedildi!");
    } catch (error) {
        console.error("Kayıt hatası:", error);
        alert("❌ Kayıt sırasında bir hata oluştu!");
    }
  };

  // Helper to force save specific accounts state locally (for seamless UX)
  // Note: This only updates REACT STATE. Real save happens when user clicks "Save" button.
  const updateAccountsState = (newAccounts: Account[]) => {
    setAccounts(newAccounts);
  };

  // --- Sync Temp States when Active Data Changes ---
  const activeAccount = accounts.find(a => a.id === selectedAccountId);
  const activeChar = activeAccount?.characters[activeCharIndex];

  useEffect(() => {
    if (activeAccount) {
        setTempAccountName(activeAccount.name);
    }
  }, [selectedAccountId, accounts]);

  useEffect(() => {
    if (activeChar) {
        setTempCharName(activeChar.name);
    }
  }, [activeCharIndex, selectedAccountId, accounts]);


  // --- Account Management ---

  const handleAddAccount = () => {
    if (userRole !== 'admin') return;
    const newId = Math.random().toString(36).substr(2, 9);
    const name = `Oyuncu ${accounts.length + 1}`;
    const newAccount = createAccount(newId, name);
    const newAccounts = [...accounts, newAccount];
    setAccounts(newAccounts);
    setSelectedAccountId(newId);
    setActiveCharIndex(0);
  };

  const handleDeleteAccount = () => {
    if (userRole !== 'admin') return;
    if (accounts.length <= 1) {
      alert("En az bir hesap kalmalıdır.");
      return;
    }
    const confirmDelete = window.confirm("Bu hesabı silmek istediğinize emin misiniz?");
    if (confirmDelete) {
      const newAccounts = accounts.filter(a => a.id !== selectedAccountId);
      setAccounts(newAccounts);
      setSelectedAccountId(newAccounts[0].id);
      setActiveCharIndex(0);
      // Not: Otomatik save yapmıyoruz, kullanıcı kaydet butonuna basmalı veya buraya saveData() eklenebilir.
    }
  };

  // --- Auth Handlers ---
  // LoginScreen zaten Firebase ile giriş yapıyor, bu sadece state'i anlık günceller
  const handleLogin = (role: UserRole) => {
    setUserRole(role);
  };

  const handleLogout = async () => {
    try {
        await signOut(auth); // Firebase'den çıkış
        setUserRole(null);
        setTooltip(null);
        setIsSearchOpen(false);
        setIsRecipeBookOpen(false);
        setModalOpen(false);
    } catch (error) {
        console.error("Çıkış hatası:", error);
    }
  };

  // --- Name Update Handlers (Commit) ---

  const commitAccountName = () => {
    const newAccounts = accounts.map(acc => 
      acc.id === selectedAccountId ? { ...acc, name: tempAccountName } : acc
    );
    updateAccountsState(newAccounts);
  };

  const commitCharacterName = () => {
    if (!activeAccount) return;
    const newChars = [...activeAccount.characters];
    newChars[activeCharIndex] = { ...newChars[activeCharIndex], name: tempCharName };
    const newAccounts = accounts.map(acc => 
        acc.id === selectedAccountId ? { ...acc, characters: newChars } : acc
    );
    updateAccountsState(newAccounts);
  };


  // --- Export Excel (CSV) ---
  const handleExportExcel = () => {
    if (!activeAccount) return;

    const rows = [
      ["Hesap", "Karakter", "Kasa/Çanta", "Satır", "Sütun", "Efsun 1", "Efsun 2", "Kategori", "Silah Cinsi", "Seviye", "Cinsiyet", "Sınıf", "Okunmuş", "Adet"]
    ];

    activeAccount.characters.forEach(char => {
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

  const handleMoveItem = (containerId: string, fromSlotId: number, toSlotId: number) => {
    if (fromSlotId === toSlotId) return;
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
        const itemFrom = newSlots[fromSlotId].item;
        const itemTo = newSlots[toSlotId].item;

        newSlots[toSlotId] = { ...newSlots[toSlotId], item: itemFrom };
        newSlots[fromSlotId] = { ...newSlots[fromSlotId], item: itemTo }; 
        
        targetChar[containerKey] = { ...targetContainer, slots: newSlots };
        newChars[activeCharIndex] = targetChar;
      }

      return { ...acc, characters: newChars };
    }));
  };

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
        targetChar[containerKey] = { ...targetContainer, slots: newSlots };
        newChars[activeCharIndex] = targetChar;
      }

      return { ...acc, characters: newChars };
    }));
  };

  const handleReadRecipe = (item: ItemData) => {
      if (!activeAccount || !activeSlot) return;

      setAccounts(prevAccounts => prevAccounts.map(acc => {
        if (acc.id !== selectedAccountId) return acc;
  
        const newChars = [...acc.characters];
        const targetChar = { ...newChars[activeCharIndex] };
        
        targetChar.learnedRecipes = [...targetChar.learnedRecipes, item];

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
    setTooltip(null);
  };

  const handleSlotHover = (item: ItemData | null, e: React.MouseEvent) => {
    if (item) {
      setTooltip({ item, x: e.clientX, y: e.clientY });
    } else {
      setTooltip(null);
    }
  };

  const handleSaveItem = (item: ItemData) => {
    if (!activeAccount || !activeSlot) return;

    if (item.type === 'Recipe' && item.isRead) {
        setAccounts(prevAccounts => prevAccounts.map(acc => {
            if (acc.id !== selectedAccountId) return acc;
      
            const newChars = [...acc.characters];
            const targetChar = { ...newChars[activeCharIndex] };
            
            const existingIdx = targetChar.learnedRecipes.findIndex(r => r.id === item.id);
            if (existingIdx !== -1) {
                targetChar.learnedRecipes[existingIdx] = item;
            } else {
                targetChar.learnedRecipes = [...targetChar.learnedRecipes, item];
            }
    
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
    } else {
        updateSlot(activeSlot.containerId, activeSlot.slotId, item);
    }
  };

  const handleDeleteItem = () => {
    if (activeSlot) {
      updateSlot(activeSlot.containerId, activeSlot.slotId, null);
      setModalOpen(false);
    }
  };

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

  // --- RENDER MANTIĞI ---

  // 1. Veri Yükleniyorsa
  if (loading) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center text-yellow-500 font-bold gap-4">
        <Shield size={64} className="animate-bounce" />
        <div className="text-2xl animate-pulse">SUNUCUYA BAĞLANILIYOR...</div>
        <div className="text-xs text-slate-500 mt-2">Bulut Veritabanı Senkronizasyonu</div>
      </div>
    );
  }

  // 2. Giriş Yapılmamışsa
  if (!userRole) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  // 3. Veri Gelmemişse (Koruma)
  if (!activeAccount || !activeChar) return <div className="text-white p-10">Hesap verisi yüklenemedi. Lütfen sayfayı yenileyin.</div>;

  const currentView = VIEW_ORDER[currentViewIndex];
  const activeContainer = activeChar[currentView];

  return (
    <div className="h-screen w-screen bg-[url('https://picsum.photos/1920/1080?grayscale&blur=2')] bg-cover bg-center flex items-center justify-center overflow-hidden">
      
      {/* Değişiklik: h-[97vh] yerine h-[95dvh] ve max-h-[100dvh] ekledik */}
<div className="w-[97vw] h-[97vh] md:w-[98vw] md:h-[98vh] bg-slate-900/95 border border-slate-700/60 md:border-2 md:border-slate-700 rounded-2xl md:rounded-lg shadow-[0_0_50px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col relative">
        
        {/* === HEADER === */}
        <div className="flex flex-col border-b-2 border-slate-700 shrink-0">
          
          {/* MOBILE TOP BAR */}
          <div className="md:hidden bg-gradient-to-b from-slate-800 to-slate-800/95">
            <div className="px-3 pt-2.5 pb-1.5 flex items-center gap-2.5">
              <div className="bg-gradient-to-br from-yellow-500/15 to-yellow-700/10 p-2 rounded-xl border border-yellow-500/20 shadow-lg shadow-yellow-900/10">
                <Shield size={16} className="text-yellow-500" />
              </div>
              <div className="flex-1 min-w-0">
                <input
                  value={tempAccountName}
                  onChange={(e) => setTempAccountName(e.target.value)}
                  onBlur={commitAccountName}
                  className="bg-transparent text-yellow-500 font-bold text-[15px] outline-none w-full placeholder-slate-600"
                  placeholder="Hesap İsmi"
                />
              </div>
              {userRole === 'user' && <span className="text-[9px] text-slate-400 bg-slate-700/50 border border-slate-600/50 rounded-full px-2.5 py-0.5 shrink-0 tracking-wide">Gözlemci</span>}
            </div>

            <div className="px-3 pb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <div className="relative">
                  <select
                    value={selectedAccountId}
                    onChange={(e) => {
                      setSelectedAccountId(e.target.value);
                      setActiveCharIndex(0);
                      setCurrentViewIndex(0);
                    }}
                    className="appearance-none bg-slate-900/50 text-slate-300 text-[11px] py-1.5 pl-2.5 pr-6 rounded-lg border border-slate-600/40 focus:outline-none cursor-pointer"
                  >
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500"/>
                </div>
                {userRole === 'admin' && (
                  <>
                    <button onClick={handleAddAccount} className="p-1.5 text-green-500 active:text-green-400 rounded-lg active:bg-green-900/30" title="Hesap Ekle"><Plus size={16} /></button>
                    {accounts.length > 1 && (
                      <button onClick={handleDeleteAccount} className="p-1.5 text-red-800 active:text-red-500 rounded-lg active:bg-red-900/30" title="Hesap Sil"><Trash2 size={16} /></button>
                    )}
                  </>
                )}
              </div>

              <div className="flex items-center bg-slate-900/40 rounded-xl p-1 border border-slate-700/30 gap-0.5">
                <button onClick={() => setIsSearchOpen(true)} className="p-2 text-yellow-500 active:bg-yellow-600/20 rounded-lg transition-colors"><Search size={16} /></button>
                <button onClick={handleExportExcel} className="p-2 text-emerald-400 active:bg-emerald-600/20 rounded-lg transition-colors"><FileSpreadsheet size={16} /></button>
                <button onClick={saveData} className="p-2 text-blue-400 active:bg-blue-600/20 rounded-lg transition-colors"><Save size={16} /></button>
                <div className="w-px h-5 bg-slate-600/40 mx-0.5"></div>
                <button onClick={handleLogout} className="p-2 text-red-400 active:bg-red-600/20 rounded-lg transition-colors"><LogOut size={16} /></button>
              </div>
            </div>
          </div>

          {/* DESKTOP TOP BAR */}
          <div className="hidden md:flex bg-slate-800 p-1 justify-between items-center gap-2">
            <div className="flex items-center gap-2">
               <div className="bg-slate-700 p-1 rounded border border-slate-600 shadow-inner">
                 <Shield size={16} className="text-yellow-600" />
               </div>

               <div className="flex flex-col">
                  <div className="relative group flex items-center gap-1 mb-1">
                    <input
                      value={tempAccountName}
                      onChange={(e) => setTempAccountName(e.target.value)}
                      className="bg-transparent text-yellow-500 font-bold text-lg outline-none w-40 placeholder-slate-600 focus:border-b focus:border-yellow-600 transition-all"
                      placeholder="Hesap İsmi"
                    />
                    <button onClick={commitAccountName} className="p-1 bg-slate-700 hover:bg-green-600 text-slate-300 hover:text-white rounded border border-slate-600 transition-colors"><Save size={12} /></button>
                    {userRole === 'user' && <span className="text-[10px] text-slate-500 ml-2 border border-slate-600 rounded px-1">Gözlemci Modu</span>}
                  </div>

                  <div className="flex items-center gap-2">
                     <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">HESAP:</span>
                     <div className="relative">
                        <select
                          value={selectedAccountId}
                          onChange={(e) => {
                            setSelectedAccountId(e.target.value);
                            setActiveCharIndex(0);
                            setCurrentViewIndex(0);
                          }}
                          className="appearance-none bg-slate-900/50 hover:bg-slate-700 text-slate-300 text-[10px] py-0.5 pl-1 pr-3 rounded border border-slate-600 focus:outline-none cursor-pointer"
                        >
                          {accounts.map(acc => (
                            <option key={acc.id} value={acc.id}>{acc.name}</option>
                          ))}
                        </select>
                        <ChevronDown size={8} className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500"/>
                     </div>

                     {userRole === 'admin' && (
                        <>
                           <button onClick={handleAddAccount} className="text-green-500 hover:text-green-400"><Plus size={12} /></button>
                           {accounts.length > 1 && (
                            <button onClick={handleDeleteAccount} className="text-red-800 hover:text-red-500"><Trash2 size={12} /></button>
                           )}
                        </>
                     )}
                  </div>
               </div>
            </div>

            <div className="flex items-center gap-1">
              <button onClick={() => setIsSearchOpen(true)} className="flex items-center gap-1 px-3 py-1 bg-slate-700 hover:bg-yellow-600 hover:text-black text-yellow-500 text-[10px] font-bold rounded border border-yellow-500/30 transition-colors"><Search size={12} /><span>Ara</span></button>
              <button onClick={handleExportExcel} className="flex items-center gap-1 px-2 py-1 bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-200 text-[10px] font-bold rounded border border-emerald-800/50"><FileSpreadsheet size={12} /><span>Excel</span></button>
              <button onClick={saveData} className="flex items-center gap-1 px-3 py-1 bg-blue-900/40 hover:bg-blue-800/60 text-blue-200 text-[10px] font-bold rounded border border-blue-800/50"><Save size={12} /><span>Kaydet</span></button>
              <button onClick={handleLogout} className="flex items-center gap-1 px-2 py-1 bg-red-900/20 hover:bg-red-900/60 text-red-300 text-[10px] font-bold rounded border border-red-900/50 ml-2"><LogOut size={12} /></button>
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
                      px-3 md:px-3 py-2 md:py-1 rounded-t-lg font-bold text-[11px] md:text-xs tracking-wide transition-all border-t border-x whitespace-nowrap flex items-center gap-1 flex-1 justify-center
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
                 <button onClick={commitCharacterName} className="p-0.5 bg-slate-700 hover:bg-green-600 text-slate-300 hover:text-white rounded border border-slate-600 transition-colors"><Save size={10} /></button>
             </div>
          </div>

          <div className="md:hidden bg-gradient-to-r from-slate-800/80 via-slate-800/90 to-slate-900/80 px-3 py-2 border-t border-slate-700/20">
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setIsRecipeBookOpen(true)}
                className="bg-purple-900/25 p-2 rounded-xl border border-purple-500/20 text-purple-400 active:text-purple-200 active:bg-purple-900/40 transition-colors relative shadow-sm"
              >
                <Book size={16} />
                {activeChar.learnedRecipes?.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-purple-500 text-white text-[8px] rounded-full w-4 h-4 flex items-center justify-center font-bold shadow-md">
                    {activeChar.learnedRecipes.length}
                  </span>
                )}
              </button>
              <div className="h-6 w-px bg-gradient-to-b from-transparent via-slate-600/60 to-transparent"></div>
              <div className="flex items-center gap-1.5 flex-1 min-w-0 bg-slate-900/30 rounded-xl px-3 py-1.5 border border-slate-700/25">
                <Edit3 size={12} className="text-slate-500 shrink-0" />
                <input
                  value={tempCharName}
                  onChange={(e) => setTempCharName(e.target.value)}
                  onBlur={commitCharacterName}
                  className="bg-transparent text-blue-300 font-bold text-[13px] outline-none flex-1 min-w-0 placeholder-slate-600"
                  placeholder="Karakter İsmi"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-1 bg-slate-800/50 flex-1 overflow-visible flex flex-col h-auto">
           <div className="flex-1 w-full h-full">
              {currentView === 'bag' ? (
                 <div className="w-full h-full flex items-center justify-center animate-in fade-in zoom-in duration-300">
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
           <span className="w-full text-center">IKV KASA YÖNETİM SİSTEMİ v3.0 • {activeChar.name} • {userRole?.toUpperCase()} MODU • {userRole === 'admin' ? 'Yönetici' : 'İzleyici'}</span>
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