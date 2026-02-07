import React, { useState, useEffect, useMemo } from 'react';
import { Account, Container, ItemData, UserRole, SetItemLocation, GlobalSetInfo } from './types';
import { createAccount, createCharacter, CLASS_COLORS, SERVER_NAMES, SET_CATEGORIES } from './constants';
import { ContainerGrid } from './components/ContainerGrid';
import { ItemModal } from './components/ItemModal';
import { ItemDetailModal } from './components/ItemDetailModal';
import { GlobalSearchModal } from './components/GlobalSearchModal';
import { RecipeBookModal } from './components/RecipeBookModal';
import { LoginScreen } from './components/LoginScreen';
import { User, Save, Plus, Trash2, ChevronDown, FileSpreadsheet, Edit3, Shield, Search, Book, LogOut, CheckCircle, XCircle, Globe, AtSign, Check, AlertTriangle, Link2, Crown } from 'lucide-react';
import { AdminPanel } from './components/AdminPanel';

// --- FIREBASE IMPORTLARI ---
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc, runTransaction, collection, query, where, getDocs, updateDoc, arrayUnion } from 'firebase/firestore';

// View sequence
const VIEW_ORDER = ['bank1', 'bank2', 'bag'] as const;
type ViewType = typeof VIEW_ORDER[number];

// Migration helper for old account format (characters → servers)
const migrateAccount = (acc: any): Account => {
  if (acc.servers && acc.servers.length > 0) return acc as Account;
  const oldChars = acc.characters || Array.from({ length: 4 }, (_, i) => createCharacter(i));
  return {
    id: acc.id,
    name: acc.name,
    servers: SERVER_NAMES.map((serverName, idx) => ({
      id: `${acc.id}_server_${idx}`,
      name: serverName,
      characters: idx === 0 ? oldChars : Array.from({ length: 4 }, (_, i) => createCharacter(i)),
    })),
  };
};

export default function App() {
  // --- Auth & Loading State ---
  const [userRole, setUserRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);

  // Global State
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedServerIndex, setSelectedServerIndex] = useState(0);

  // Username State
  const [username, setUsername] = useState<string | null>(null);
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [usernameLoading, setUsernameLoading] = useState(false);

  // Social Link State
  const [socialLink, setSocialLink] = useState<string>('');
  const [showSocialLinkModal, setShowSocialLinkModal] = useState(false);
  const [socialLinkInput, setSocialLinkInput] = useState('');
  const [socialLinkSaving, setSocialLinkSaving] = useState(false);

  // Global Enchantment Suggestions
  const [globalEnchantments, setGlobalEnchantments] = useState<string[]>([]);

  // UI State
  const [activeCharIndex, setActiveCharIndex] = useState(0);
  const [currentViewIndex, setCurrentViewIndex] = useState(0);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isRecipeBookOpen, setIsRecipeBookOpen] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  // Input State (Temporary states for name editing)
  const [tempAccountName, setTempAccountName] = useState('');
  const [tempCharName, setTempCharName] = useState('');

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [activeSlot, setActiveSlot] = useState<{ containerId: string; slotId: number } | null>(null);
  // Tooltip State
  const [tooltip, setTooltip] = useState<{ item: ItemData; x: number; y: number } | null>(null);
  // Detail Modal State (tap on item → detail view)
  const [detailItem, setDetailItem] = useState<ItemData | null>(null);
  const [detailSlot, setDetailSlot] = useState<{ containerId: string; slotId: number } | null>(null);

  // Recipe Edit Modal State
  const [editingRecipe, setEditingRecipe] = useState<ItemData | null>(null);
  const [isRecipeEditModalOpen, setIsRecipeEditModalOpen] = useState(false);

  // Toast & Unsaved Changes State
  const [toast, setToast] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const toastTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    setHasUnsavedChanges(true);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  };

  // --- BAŞLANGIÇ: VERİLERİ BULUTTAN ÇEKME ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        if (!user.emailVerified) {
            alert("Giriş yapabilmek için lütfen e-posta adresinizi doğrulayın. (Spam kutusunu kontrol etmeyi unutmayın)");
            await signOut(auth);
            setLoading(false);
            return;
        }

        setLoading(true);
        const userDocRef = doc(db, "users", user.uid);

        try {
          const docSnap = await getDoc(userDocRef);

          if (docSnap.exists()) {
            const data = docSnap.data();
            const rawAccounts = data.accounts || [];
            const loadedAccounts = rawAccounts.map(migrateAccount);

            // Load username
            if (data.username) {
              setUsername(data.username);
            } else {
              setUsername(null);
            }

            // Load social link
            if (data.socialLink) {
              setSocialLink(data.socialLink);
            } else {
              setSocialLink('');
            }

            // Mevcut kullanıcılara email alanı yoksa ekle
            if (!data.email && user.email) {
              setDoc(userDocRef, { email: user.email }, { merge: true }).catch(() => {});
            }

            if (loadedAccounts.length > 0) {
              // Check if migration happened and auto-save
              const needsMigration = rawAccounts.some((acc: any) => !acc.servers || acc.servers.length === 0);

              setAccounts(loadedAccounts);
              setSelectedAccountId(loadedAccounts[0].id);

              if (needsMigration) {
                await setDoc(userDocRef, { accounts: loadedAccounts }, { merge: true });
              }
            } else {
              initializeDefault(userDocRef);
            }
          } else {
            await initializeDefault(userDocRef);
          }

          // Admin kontrolü: hardcoded email + Firestore metadata/admins
          const adminEmail = "yvzsltn61@gmail.com";
          let isAdmin = user.email === adminEmail;
          if (!isAdmin) {
            try {
              const adminsDoc = await getDoc(doc(db, "metadata", "admins"));
              if (adminsDoc.exists()) {
                const emails: string[] = adminsDoc.data().emails || [];
                if (user.email && emails.includes(user.email.toLowerCase())) {
                  isAdmin = true;
                }
              }
            } catch { /* admins doc may not exist */ }
          }
          setUserRole(isAdmin ? 'admin' : 'user');

          // Global efsun önerilerini yükle
          try {
            const enchDoc = await getDoc(doc(db, "metadata", "enchantments"));
            if (enchDoc.exists()) {
              setGlobalEnchantments(enchDoc.data().names || []);
            }
          } catch (e) {
            console.warn("Global enchantments yüklenemedi:", e);
          }

        } catch (error) {
          alert("Veriler yüklenirken bir hata oluştu. İnternet bağlantınızı kontrol edin.");
        } finally {
          setLoading(false);
        }

      } else {
        setUserRole(null);
        setAccounts([]);
        setUsername(null);
        setSocialLink('');
        setGlobalEnchantments([]);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const initializeDefault = async (docRef: any) => {
    const newId = crypto.randomUUID();
    const defaultAccount = createAccount(newId, 'Hesap 1');
    const initialAccounts = [defaultAccount];

    const user = auth.currentUser;
    await setDoc(docRef, {
      accounts: initialAccounts,
      email: user?.email || '',
      createdAt: Date.now(),
    });

    setAccounts(initialAccounts);
    setSelectedAccountId(newId);
  };

  // --- USERNAME SET ---
  const handleSetUsername = async () => {
    const user = auth.currentUser;
    if (!user || !usernameInput.trim()) return;

    const trimmed = usernameInput.trim();

    if (trimmed.length < 3 || trimmed.length > 20) {
      setUsernameError('Kullanıcı adı 3 ile 20 karakter arasında olmalıdır.');
      return;
    }

    setUsernameLoading(true);
    setUsernameError('');

    try {
      const usernameLower = trimmed.toLowerCase();

      await runTransaction(db, async (transaction) => {
        const usernameDocRef = doc(db, "usernames", usernameLower);
        const usernameSnap = await transaction.get(usernameDocRef);

        if (usernameSnap.exists()) {
          throw new Error("USERNAME_TAKEN");
        }

        transaction.set(usernameDocRef, { uid: user.uid, displayName: trimmed });
        transaction.set(doc(db, "users", user.uid), { username: trimmed }, { merge: true });
      });

      setUsername(trimmed);
      setShowUsernameModal(false);
      setUsernameInput('');
    } catch (error: any) {
      console.error("Username set error:", error);
      if (error.message === 'USERNAME_TAKEN') {
        setUsernameError('Bu kullanıcı adı zaten alınmış. Lütfen başka bir isim deneyin.');
      } else {
        setUsernameError('Bir hata oluştu. Lütfen tekrar deneyin.');
      }
    } finally {
      setUsernameLoading(false);
    }
  };

  // --- SOCIAL LINK SET ---
  const handleSaveSocialLink = async () => {
    const user = auth.currentUser;
    if (!user) return;

    const trimmed = socialLinkInput.trim();

    setSocialLinkSaving(true);
    try {
      // 1. Save to user doc
      const userDocRef = doc(db, "users", user.uid);
      await setDoc(userDocRef, { socialLink: trimmed }, { merge: true });

      // 2. Update all existing globalItems belonging to this user
      const q = query(collection(db, "globalItems"), where("uid", "==", user.uid));
      const snapshot = await getDocs(q);
      const updatePromises = snapshot.docs.map(d => updateDoc(d.ref, { socialLink: trimmed }));
      await Promise.all(updatePromises);

      setSocialLink(trimmed);
      setShowSocialLinkModal(false);
    } catch (error) {
      console.error("Social link save error:", error);
    } finally {
      setSocialLinkSaving(false);
    }
  };

  // --- VERİLERİ BULUTA KAYDETME ---
  const [isSaving, setIsSaving] = useState(false);
  const [saveNotification, setSaveNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const saveData = async () => {
    if (isSaving) return;
    const user = auth.currentUser;
    if (!user) {
        alert("Oturum süresi dolmuş, lütfen sayfayı yenileyip tekrar giriş yapın.");
        return;
    }

    setIsSaving(true);
    try {
        const userDocRef = doc(db, "users", user.uid);
        await setDoc(userDocRef, { accounts: accounts }, { merge: true });
        setHasUnsavedChanges(false);
        setSaveNotification({ type: 'success', message: 'Tüm veriler başarıyla buluta kaydedildi!' });
        setTimeout(() => setSaveNotification(null), 3000);
    } catch (error) {
        setSaveNotification({ type: 'error', message: 'Kayıt sırasında bir hata oluştu. Lütfen tekrar deneyin.' });
        setTimeout(() => setSaveNotification(null), 4000);
    } finally {
        setTimeout(() => setIsSaving(false), 2000);
    }
  };

  const updateAccountsState = (newAccounts: Account[]) => {
    setAccounts(newAccounts);
  };

  // --- Sync Temp States when Active Data Changes ---
  const activeAccount = accounts.find(a => a.id === selectedAccountId);
  const activeServer = activeAccount?.servers[selectedServerIndex];
  const activeChar = activeServer?.characters[activeCharIndex];

  // Tılsım duplikasyon tespiti: aynı karakter içinde 3+ aynı tılsım varsa glow efekti
  const TALISMAN_GLOW_COLORS = [
    '#06b6d4', '#ef4444', '#84cc16', '#8b5cf6', '#f59e0b',
    '#ec4899', '#0ea5e9', '#10b981', '#f43f5e', '#f97316',
  ];
  const getTalismanColor = (name: string): string => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = ((hash << 5) - hash) + name.charCodeAt(i);
      hash |= 0;
    }
    return TALISMAN_GLOW_COLORS[Math.abs(hash) % TALISMAN_GLOW_COLORS.length];
  };
  const talismanDuplicates = useMemo(() => {
    if (!activeChar) return new Map<string, { count: number; color: string }>();
    const countMap = new Map<string, number>();
    [activeChar.bank1, activeChar.bank2, activeChar.bag].forEach(container => {
      container.slots.forEach(slot => {
        if (slot.item && slot.item.category === 'Tılsım' && slot.item.enchantment1?.trim()) {
          const ench2 = (slot.item.enchantment2 || '').trim();
          if (ench2 === 'III') return; // 3. kademe hariç
          const key = `${slot.item.enchantment1.toLocaleLowerCase('tr')}|${ench2.toLocaleLowerCase('tr')}|${slot.item.heroClass}`;
          countMap.set(key, (countMap.get(key) || 0) + 1);
        }
      });
    });
    const result = new Map<string, { count: number; color: string }>();
    countMap.forEach((count, key) => {
      if (count >= 3) {
        const name = key.split('|')[0];
        result.set(key, { count, color: getTalismanColor(name) });
      }
    });
    return result;
  }, [activeChar]);

  // Detay modalında gösterilecek tılsım duplikasyon konumları
  const talismanLocations = useMemo(() => {
    if (!detailItem || !activeChar || detailItem.category !== 'Tılsım' || !detailItem.enchantment1?.trim()) return null;
    const key = `${detailItem.enchantment1.toLocaleLowerCase('tr')}|${(detailItem.enchantment2 || '').toLocaleLowerCase('tr')}|${detailItem.heroClass}`;
    if (!talismanDuplicates.has(key)) return null;
    const locations: { containerName: string; row: number; col: number }[] = [];
    [
      { data: activeChar.bank1, name: 'Kasa 1' },
      { data: activeChar.bank2, name: 'Kasa 2' },
      { data: activeChar.bag, name: 'Çanta' },
    ].forEach(({ data, name }) => {
      data.slots.forEach(slot => {
        if (slot.item && slot.item.category === 'Tılsım' && slot.item.enchantment1?.trim()) {
          const slotKey = `${slot.item.enchantment1.toLocaleLowerCase('tr')}|${(slot.item.enchantment2 || '').toLocaleLowerCase('tr')}|${slot.item.heroClass}`;
          if (slotKey === key) {
            locations.push({ containerName: name, row: Math.floor(slot.id / data.cols) + 1, col: (slot.id % data.cols) + 1 });
          }
        }
      });
    });
    return locations.length >= 3 ? locations : null;
  }, [detailItem, activeChar, talismanDuplicates]);

  const enchantmentSuggestions = useMemo(() => {
    const set = new Set<string>();
    // Lokal: kullanıcının kendi itemlerinden
    accounts.forEach(acc => {
      acc.servers.forEach(server => {
        server.characters.forEach(char => {
          [char.bank1, char.bank2, char.bag].forEach(container => {
            container.slots.forEach(slot => {
              if (slot.item) {
                if (slot.item.enchantment1?.trim()) set.add(slot.item.enchantment1.trim());
                if (slot.item.enchantment2?.trim()) set.add(slot.item.enchantment2.trim());
              }
            });
          });
          (char.learnedRecipes || []).forEach(recipe => {
            if (recipe.enchantment1?.trim()) set.add(recipe.enchantment1.trim());
            if (recipe.enchantment2?.trim()) set.add(recipe.enchantment2.trim());
          });
        });
      });
    });
    // Global: tüm kullanıcılardan
    globalEnchantments.forEach(e => { if (e?.trim()) set.add(e.trim()); });
    return [...set].sort((a, b) => a.toLocaleLowerCase('tr').localeCompare(b.toLocaleLowerCase('tr'), 'tr'));
  }, [accounts, globalEnchantments]);

  // Global set lookup: tüm hesaplar/sunucular/karakterler genelinde efsun çiftine göre set durumu
  const { globalSetLookup, globalSetMap } = useMemo(() => {
    const lookup = new Map<string, GlobalSetInfo>();
    const setMap = new Map<string, SetItemLocation[]>();

    // Tüm itemleri topla (account/server/char bilgisiyle)
    const allSetItems: { item: ItemData; accountName: string; serverName: string; charName: string; containerName: string; row: number; col: number }[] = [];

    accounts.forEach(acc => {
      acc.servers.forEach(server => {
        server.characters.forEach(char => {
          const containers = [
            { data: char.bank1, name: 'Kasa 1' },
            { data: char.bank2, name: 'Kasa 2' },
            { data: char.bag, name: 'Çanta' },
          ];
          containers.forEach(({ data, name }) => {
            data.slots.forEach(slot => {
              if (slot.item && SET_CATEGORIES.includes(slot.item.category) && slot.item.enchantment1 && slot.item.enchantment1.trim() !== '') {
                allSetItems.push({
                  item: slot.item,
                  accountName: acc.name,
                  serverName: server.name,
                  charName: char.name,
                  containerName: name,
                  row: Math.floor(slot.id / data.cols) + 1,
                  col: (slot.id % data.cols) + 1,
                });
              }
            });
          });
          // Okunmuş reçeteler
          (char.learnedRecipes || []).forEach((recipe, idx) => {
            if (SET_CATEGORIES.includes(recipe.category) && recipe.enchantment1 && recipe.enchantment1.trim() !== '') {
              allSetItems.push({
                item: recipe,
                accountName: acc.name,
                serverName: server.name,
                charName: char.name,
                containerName: 'Okunmuş Reçete',
                row: idx + 1,
                col: 1,
              });
            }
          });
        });
      });
    });

    // Efsun çiftine göre grupla
    const enchGroups = new Map<string, typeof allSetItems>();
    allSetItems.forEach(entry => {
      const enchKey = `${entry.item.enchantment1.toLocaleLowerCase('tr')}|${entry.item.enchantment2.toLocaleLowerCase('tr')}`;
      const group = enchGroups.get(enchKey) || [];
      group.push(entry);
      enchGroups.set(enchKey, group);
    });

    // Her grup için gender/class kombinasyonlarıyla set sayısı hesapla
    enchGroups.forEach((entries, enchKey) => {
      const genders = new Set<string>();
      const classes = new Set<string>();
      entries.forEach(e => {
        genders.add(e.item.gender);
        classes.add(e.item.heroClass);
      });

      genders.forEach(targetGender => {
        classes.forEach(targetClass => {
          const coveredCategories = new Set<string>();
          const locations: SetItemLocation[] = [];

          entries.forEach(e => {
            const genderMatch = e.item.gender === targetGender || e.item.gender === 'Tüm Cinsiyetler' || targetGender === 'Tüm Cinsiyetler';
            const classMatch = e.item.heroClass === targetClass || e.item.heroClass === 'Tüm Sınıflar' || targetClass === 'Tüm Sınıflar';
            if (genderMatch && classMatch) {
              coveredCategories.add(e.item.category);
              locations.push({
                accountName: e.accountName,
                serverName: e.serverName,
                charName: e.charName,
                containerName: e.containerName,
                row: e.row,
                col: e.col,
                category: e.item.category,
                item: e.item,
              });
            }
          });

          if (coveredCategories.size > 0) {
            const globalKey = `${enchKey}|${targetGender}|${targetClass}`;
            lookup.set(globalKey, { count: coveredCategories.size, categories: coveredCategories });
            setMap.set(globalKey, locations);
          }
        });
      });
    });

    console.log('[SET] Global set lookup hesaplandı:', lookup.size, 'kombinasyon,', allSetItems.length, 'set item');
    return { globalSetLookup: lookup, globalSetMap: setMap };
  }, [accounts]);

  useEffect(() => {
    if (activeAccount) {
        setTempAccountName(activeAccount.name);
    }
  }, [selectedAccountId, accounts]);

  useEffect(() => {
    if (activeChar) {
        setTempCharName(activeChar.name);
    }
  }, [activeCharIndex, selectedServerIndex, selectedAccountId, accounts]);


  // --- Account Management ---

  const handleAddAccount = () => {
    const newId = crypto.randomUUID();
    const name = `Hesap ${accounts.length + 1}`;
    const newAccount = createAccount(newId, name);
    const newAccounts = [...accounts, newAccount];
    setAccounts(newAccounts);
    setSelectedAccountId(newId);
    setSelectedServerIndex(0);
    setActiveCharIndex(0);
    setHasUnsavedChanges(true);
  };

  const handleDeleteAccount = () => {
    if (accounts.length <= 1) {
      alert("En az bir hesap kalmalıdır.");
      return;
    }
    const confirmDelete = window.confirm("Bu hesabı silmek istediğinize emin misiniz?");
    if (confirmDelete) {
      const newAccounts = accounts.filter(a => a.id !== selectedAccountId);
      setAccounts(newAccounts);
      setSelectedAccountId(newAccounts[0].id);
      setSelectedServerIndex(0);
      setActiveCharIndex(0);
      setHasUnsavedChanges(true);
    }
  };

  // --- Auth Handlers ---
  const handleLogin = (role: UserRole) => {
    setUserRole(role);
  };

  const handleLogout = async () => {
    try {
        await signOut(auth);
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
    setHasUnsavedChanges(true);
  };

  const commitCharacterName = () => {
    if (!activeAccount || !activeServer) return;
    const newChars = [...activeServer.characters];
    newChars[activeCharIndex] = { ...newChars[activeCharIndex], name: tempCharName };
    const newAccounts = accounts.map(acc => {
        if (acc.id !== selectedAccountId) return acc;
        const newServers = [...acc.servers];
        newServers[selectedServerIndex] = { ...newServers[selectedServerIndex], characters: newChars };
        return { ...acc, servers: newServers };
    });
    updateAccountsState(newAccounts);
    setHasUnsavedChanges(true);
  };


  // --- Export Excel (CSV) ---
  const handleExportExcel = () => {
    if (!activeAccount) return;

    const rows = [
      ["Hesap", "Sunucu", "Karakter", "Kasa/Çanta", "Satır", "Sütun", "Efsun 1", "Efsun 2", "Kategori", "Silah Cinsi", "Seviye", "Cinsiyet", "Sınıf", "Okunmuş", "Adet"]
    ];

    activeAccount.servers.forEach(server => {
      server.characters.forEach(char => {
        [char.bank1, char.bank2, char.bag].forEach(container => {
          container.slots.forEach(slot => {
            if (slot.item) {
              const row = Math.floor(slot.id / container.cols) + 1;
              const col = (slot.id % container.cols) + 1;
              rows.push([
                activeAccount.name, server.name, char.name, container.name, row.toString(), col.toString(),
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
              activeAccount.name, server.name, char.name, "Reçete Kitabı", "-", "-",
              item.enchantment1 || "-", item.enchantment2 || "-",
              item.category,
              item.weaponType || "-",
              item.level.toString(), item.gender || "-", item.heroClass, "Evet",
              item.count ? item.count.toString() : "1"
          ]);
        });
      });
    });

    const sanitizeCell = (val: string) => {
      let s = val.replace(/"/g, '""');
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return `"${s}"`;
    };
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF"
      + rows.map(e => e.map(c => sanitizeCell(c)).join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${activeAccount.name}_rpg_export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Search Navigation ---
  const handleSearchResultNavigate = (accountId: string, serverIndex: number, charIndex: number, viewIndex: number, openBook?: boolean) => {
    setSelectedAccountId(accountId);
    setSelectedServerIndex(serverIndex);
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

      const newServers = [...acc.servers];
      const newServer = { ...newServers[selectedServerIndex] };
      const newChars = [...newServer.characters];
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

      newServer.characters = newChars;
      newServers[selectedServerIndex] = newServer;
      return { ...acc, servers: newServers };
    }));
    setHasUnsavedChanges(true);
  };

  const updateSlot = (containerId: string, slotId: number, item: ItemData | null) => {
    if (!activeAccount) return;

    setAccounts(prevAccounts => prevAccounts.map(acc => {
      if (acc.id !== selectedAccountId) return acc;

      const newServers = [...acc.servers];
      const newServer = { ...newServers[selectedServerIndex] };
      const newChars = [...newServer.characters];
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

      newServer.characters = newChars;
      newServers[selectedServerIndex] = newServer;
      return { ...acc, servers: newServers };
    }));
  };

  const handleReadRecipe = (item: ItemData) => {
      if (!activeAccount || !activeSlot) return;

      setAccounts(prevAccounts => prevAccounts.map(acc => {
        if (acc.id !== selectedAccountId) return acc;

        const newServers = [...acc.servers];
        const newServer = { ...newServers[selectedServerIndex] };
        const newChars = [...newServer.characters];
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
        newServer.characters = newChars;
        newServers[selectedServerIndex] = newServer;
        return { ...acc, servers: newServers };
      }));
      setHasUnsavedChanges(true);
  };

  const handleUnlearnRecipe = (recipeId: string) => {
    setAccounts(prevAccounts => prevAccounts.map(acc => {
        if (acc.id !== selectedAccountId) return acc;
        const newServers = [...acc.servers];
        const newServer = { ...newServers[selectedServerIndex] };
        const newChars = [...newServer.characters];
        const targetChar = { ...newChars[activeCharIndex] };
        targetChar.learnedRecipes = targetChar.learnedRecipes.filter(r => r.id !== recipeId);
        newChars[activeCharIndex] = targetChar;
        newServer.characters = newChars;
        newServers[selectedServerIndex] = newServer;
        return { ...acc, servers: newServers };
    }));
    setHasUnsavedChanges(true);
  };

  const handleEditRecipe = (recipe: ItemData) => {
    setEditingRecipe(recipe);
    setIsRecipeEditModalOpen(true);
  };

  const handleSaveEditedRecipe = (item: ItemData) => {
    setAccounts(prevAccounts => prevAccounts.map(acc => {
        if (acc.id !== selectedAccountId) return acc;
        const newServers = [...acc.servers];
        const newServer = { ...newServers[selectedServerIndex] };
        const newChars = [...newServer.characters];
        const targetChar = { ...newChars[activeCharIndex] };
        targetChar.learnedRecipes = targetChar.learnedRecipes.map(r =>
            r.id === item.id ? item : r
        );
        newChars[activeCharIndex] = targetChar;
        newServer.characters = newChars;
        newServers[selectedServerIndex] = newServer;
        return { ...acc, servers: newServers };
    }));
    setIsRecipeEditModalOpen(false);
    setEditingRecipe(null);
    setHasUnsavedChanges(true);
  };

  const handleDeleteEditedRecipe = () => {
    if (editingRecipe) {
        handleUnlearnRecipe(editingRecipe.id);
        setIsRecipeEditModalOpen(false);
        setEditingRecipe(null);
    }
  };

  const handleSlotClick = (containerId: string, slotId: number) => {
    setTooltip(null);

    if (!activeChar) return;

    // Find the container and check if slot has an item
    let container: Container | undefined;
    if (activeChar.bank1.id === containerId) container = activeChar.bank1;
    else if (activeChar.bank2.id === containerId) container = activeChar.bank2;
    else if (activeChar.bag.id === containerId) container = activeChar.bag;

    const item = container?.slots[slotId]?.item;

    if (item) {
      // Show detail modal for existing items
      setDetailItem(item);
      setDetailSlot({ containerId, slotId });
    } else {
      // Open ItemModal for creating new item in empty slot
      setActiveSlot({ containerId, slotId });
      setModalOpen(true);
    }
  };

  const handleEditFromDetail = () => {
    if (detailSlot) {
      setActiveSlot(detailSlot);
      setModalOpen(true);
    }
    setDetailItem(null);
    setDetailSlot(null);
  };

  const handleSlotHover = (item: ItemData | null, e: React.MouseEvent) => {
    if (item) {
      setTooltip({ item, x: e.clientX, y: e.clientY });
    } else {
      setTooltip(null);
    }
  };

  const syncGlobalItem = async (item: ItemData) => {
    const user = auth.currentUser;
    if (!user || !activeAccount || !activeServer || !activeChar) return;

    const globalDocRef = doc(db, "globalItems", item.id);

    try {
      if (item.isGlobal) {
        const containerName = VIEW_ORDER[currentViewIndex] === 'bank1' ? 'Kasa 1'
          : VIEW_ORDER[currentViewIndex] === 'bank2' ? 'Kasa 2' : 'Çanta';

        await setDoc(globalDocRef, {
          uid: user.uid,
          username: username || user.email || '',
          accountName: activeAccount.name,
          serverName: activeServer.name,
          charName: activeChar.name,
          containerName,
          item,
          socialLink: socialLink || '',
          updatedAt: Date.now(),
        });
      } else {
        // If not global, try to delete from globalItems (may not exist)
        await deleteDoc(globalDocRef).catch(() => {});
      }
    } catch (error) {
      console.error("Global item sync error:", error);
    }
  };

  const handleSaveItem = (item: ItemData) => {
    if (!activeAccount || !activeSlot) return;

    if (item.type === 'Recipe' && item.isRead) {
        setAccounts(prevAccounts => prevAccounts.map(acc => {
            if (acc.id !== selectedAccountId) return acc;

            const newServers = [...acc.servers];
            const newServer = { ...newServers[selectedServerIndex] };
            const newChars = [...newServer.characters];
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
            newServer.characters = newChars;
            newServers[selectedServerIndex] = newServer;
            return { ...acc, servers: newServers };
        }));
    } else {
        updateSlot(activeSlot.containerId, activeSlot.slotId, item);
    }

    // Sync global item
    syncGlobalItem(item);

    // Efsun isimlerini global metadata'ya kaydet
    const newEnchantments: string[] = [];
    if (item.enchantment1?.trim()) newEnchantments.push(item.enchantment1.trim());
    if (item.enchantment2?.trim()) newEnchantments.push(item.enchantment2.trim());
    if (newEnchantments.length > 0) {
      setDoc(doc(db, "metadata", "enchantments"), { names: arrayUnion(...newEnchantments) }, { merge: true }).catch(() => {});
      // Lokal state'i de anında güncelle
      setGlobalEnchantments(prev => {
        const set = new Set(prev);
        newEnchantments.forEach(e => set.add(e));
        return set.size !== prev.length ? [...set] : prev;
      });
    }

    showToast('Kaydetmek için disket butonuna basmayı unutmayın!');
  };

  const handleDeleteItem = () => {
    if (activeSlot) {
      const currentItem = getCurrentItem();
      updateSlot(activeSlot.containerId, activeSlot.slotId, null);
      setModalOpen(false);
      setHasUnsavedChanges(true);

      // Delete from globalItems if it was global
      if (currentItem) {
        const globalDocRef = doc(db, "globalItems", currentItem.id);
        deleteDoc(globalDocRef).catch(() => {});
      }
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

  if (loading) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center text-yellow-500 font-bold gap-4">
        <Shield size={64} className="animate-bounce" />
        <div className="text-2xl animate-pulse">SUNUCUYA BAĞLANILIYOR...</div>
        <div className="text-xs text-slate-500 mt-2">Bulut Veritabanı Senkronizasyonu</div>
      </div>
    );
  }

  if (!userRole) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (showAdminPanel && userRole === 'admin') {
    return <AdminPanel onBack={() => setShowAdminPanel(false)} />;
  }

  if (!activeAccount || !activeServer || !activeChar) return <div className="text-white p-10">Hesap verisi yüklenemedi. Lütfen sayfayı yenileyin.</div>;

  const currentView = VIEW_ORDER[currentViewIndex];
  const activeContainer = activeChar[currentView];

  return (
    <div className="min-h-screen w-screen bg-slate-950 md:bg-gradient-to-br md:from-slate-950 md:via-slate-900 md:to-slate-950 flex md:items-center md:justify-center md:h-screen md:overflow-hidden">

<div className="w-full md:w-[98vw] min-h-screen md:min-h-0 md:h-[98vh] bg-slate-900/95 border-0 md:border-2 md:border-slate-700 rounded-none md:rounded-lg shadow-none md:shadow-[0_0_50px_rgba(0,0,0,0.9)] md:overflow-hidden flex flex-col relative">

        {/* === HEADER === */}
        <div className="flex flex-col border-b-2 border-slate-700 shrink-0">

          {/* MOBILE TOP BAR */}
          <div className="md:hidden bg-gradient-to-b from-slate-800 to-slate-800/95">
            <div className="px-2 pt-2 pb-1 flex items-center gap-2">
              <div className="bg-gradient-to-br from-yellow-500/15 to-yellow-700/10 p-1.5 rounded-lg border border-yellow-500/20 shadow-lg shadow-yellow-900/10 shrink-0">
                <Shield size={14} className="text-yellow-500" />
              </div>
              <div className="flex-1 min-w-0 flex items-center gap-1 group/acc">
                <input
                  value={tempAccountName}
                  onChange={(e) => setTempAccountName(e.target.value)}
                  onBlur={commitAccountName}
                  className="bg-transparent text-yellow-500 font-bold text-[14px] outline-none flex-1 min-w-0 placeholder-slate-600"
                  placeholder="Hesap İsmi"
                  maxLength={30}
                />
                <Edit3 size={10} className="text-yellow-400 shrink-0" />
              </div>
              {username ? (
                <span className="text-[9px] text-cyan-400 bg-cyan-900/30 border border-cyan-700/40 rounded-full px-2 py-0.5 shrink-0 truncate max-w-[80px]">@{username}</span>
              ) : (
                <button onClick={() => setShowUsernameModal(true)} className="text-[9px] text-amber-400 bg-amber-900/30 border border-amber-700/40 rounded-full px-2 py-0.5 shrink-0 animate-pulse">Ad Belirle</button>
              )}
              <button
                onClick={() => { setSocialLinkInput(socialLink); setShowSocialLinkModal(true); }}
                className={`p-1 rounded-lg shrink-0 transition-colors ${socialLink ? 'text-blue-400 bg-blue-900/30 border border-blue-700/30' : 'text-slate-500 bg-slate-800/40 border border-slate-700/30'}`}
                title="Sosyal Medya Linki"
              >
                <Link2 size={12} />
              </button>
            </div>

            <div className="px-2 pb-1.5 flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1 min-w-0 flex-shrink">
                <div className="relative">
                  <select
                    value={selectedAccountId}
                    onChange={(e) => {
                      setSelectedAccountId(e.target.value);
                      setSelectedServerIndex(0);
                      setActiveCharIndex(0);
                      setCurrentViewIndex(0);
                    }}
                    className="appearance-none bg-slate-900/50 text-slate-300 text-[11px] py-1.5 pl-2 pr-5 rounded-lg border border-slate-600/40 focus:outline-none cursor-pointer"
                  >
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500"/>
                </div>
                <button onClick={handleAddAccount} className="p-1 text-green-500 active:text-green-400 rounded-lg active:bg-green-900/30 shrink-0" title="Hesap Ekle"><Plus size={15} /></button>
                {accounts.length > 1 && (
                  <button onClick={handleDeleteAccount} className="p-1 text-red-800 active:text-red-500 rounded-lg active:bg-red-900/30 shrink-0" title="Hesap Sil"><Trash2 size={15} /></button>
                )}
              </div>

              <div className="flex items-center bg-slate-900/40 rounded-xl p-0.5 border border-slate-700/30 gap-0.5 shrink-0">
                <button onClick={() => setIsSearchOpen(true)} className="p-1.5 text-yellow-500 active:bg-yellow-600/20 rounded-lg transition-colors"><Search size={15} /></button>
                <button onClick={handleExportExcel} className="p-1.5 text-emerald-400 active:bg-emerald-600/20 rounded-lg transition-colors"><FileSpreadsheet size={15} /></button>
                <div className="relative">
                  <button onClick={saveData} className={`p-1.5 rounded-lg transition-colors ${hasUnsavedChanges ? 'text-yellow-400 bg-yellow-500/20 animate-pulse ring-2 ring-yellow-400' : 'text-blue-400 active:bg-blue-600/20'}`}><Save size={15} /></button>
                  {hasUnsavedChanges && (
                    <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 bg-yellow-500 text-black text-[8px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap shadow-lg animate-bounce">
                      Kaydet!
                    </div>
                  )}
                </div>
                {userRole === 'admin' && (
                  <>
                    <div className="w-px h-4 bg-slate-600/40 mx-0.5"></div>
                    <button onClick={() => setShowAdminPanel(true)} className="p-1.5 text-red-400 active:bg-red-600/20 rounded-lg transition-colors"><Crown size={15} /></button>
                  </>
                )}
                <div className="w-px h-4 bg-slate-600/40 mx-0.5"></div>
                <button onClick={handleLogout} className="p-1.5 text-red-400 active:bg-red-600/20 rounded-lg transition-colors"><LogOut size={15} /></button>
              </div>
            </div>

            {/* Mobile Server Selector */}
            <div className="px-2 pb-1.5 flex items-center gap-1 overflow-x-auto no-scrollbar">
              {activeAccount.servers.map((server, idx) => (
                <button
                  key={server.id}
                  onClick={() => { setSelectedServerIndex(idx); setActiveCharIndex(0); setCurrentViewIndex(0); }}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap transition-all flex items-center gap-1 ${
                    selectedServerIndex === idx
                      ? 'bg-emerald-800/60 text-emerald-300 border border-emerald-500/40 shadow-sm'
                      : 'bg-slate-900/40 text-slate-500 border border-slate-700/30 active:bg-slate-800'
                  }`}
                >
                  <Globe size={10} />
                  {server.name}
                </button>
              ))}
            </div>
          </div>

          {/* DESKTOP TOP BAR */}
          <div className="hidden md:flex bg-gradient-to-r from-slate-800 via-slate-800/95 to-slate-800 px-4 py-2 justify-between items-center gap-4 border-b border-slate-700/50">
            {/* Left: Logo + Account */}
            <div className="flex items-center gap-3">
               <div className="bg-gradient-to-br from-yellow-500/20 to-yellow-700/10 p-2 rounded-lg border border-yellow-500/30 shadow-lg shadow-yellow-900/20">
                 <Shield size={20} className="text-yellow-500" />
               </div>

               <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2 group/acc">
                    <div className="flex items-center gap-1.5">
                      <input
                        value={tempAccountName}
                        onChange={(e) => setTempAccountName(e.target.value)}
                        onBlur={commitAccountName}
                        className="bg-transparent text-yellow-400 font-bold text-base outline-none w-36 placeholder-slate-600 border-b border-dashed border-yellow-700/30 focus:border-yellow-600/50 focus:border-solid transition-all"
                        placeholder="Hesap Adı"
                        maxLength={30}
                      />
                      <Edit3 size={11} className="text-yellow-400 shrink-0" />
                    </div>
                    {username ? (
                      <span className="text-[9px] text-cyan-400 bg-cyan-900/25 border border-cyan-700/30 rounded-full px-2 py-0.5 tracking-wider">@{username}</span>
                    ) : (
                      <button onClick={() => setShowUsernameModal(true)} className="text-[9px] text-amber-400 bg-amber-900/20 border border-amber-700/30 rounded-full px-2 py-0.5 tracking-wider hover:bg-amber-900/40 transition-colors animate-pulse">Kullanıcı Adı Belirle</button>
                    )}
                    <button
                      onClick={() => { setSocialLinkInput(socialLink); setShowSocialLinkModal(true); }}
                      className={`p-1 rounded-md transition-colors ${socialLink ? 'text-blue-400 bg-blue-900/20 border border-blue-700/25 hover:bg-blue-900/40' : 'text-slate-500 bg-slate-800/30 border border-slate-700/25 hover:text-blue-400 hover:bg-blue-900/20'}`}
                      title="Sosyal Medya Linki"
                    >
                      <Link2 size={12} />
                    </button>
                    {userRole === 'user' && <span className="text-[9px] text-amber-400/70 bg-amber-900/20 border border-amber-700/30 rounded-full px-2 py-0.5 tracking-wider uppercase">Kullanıcı</span>}
                  </div>

                  <div className="flex items-center gap-1.5">
                     <div className="relative">
                        <select
                          value={selectedAccountId}
                          onChange={(e) => {
                            setSelectedAccountId(e.target.value);
                            setSelectedServerIndex(0);
                            setActiveCharIndex(0);
                            setCurrentViewIndex(0);
                          }}
                          className="appearance-none bg-slate-900/60 hover:bg-slate-700 text-slate-300 text-[11px] py-1 pl-2.5 pr-6 rounded-md border border-slate-600/50 focus:outline-none focus:border-yellow-600/50 cursor-pointer transition-colors"
                        >
                          {accounts.map(acc => (
                            <option key={acc.id} value={acc.id}>{acc.name}</option>
                          ))}
                        </select>
                        <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500"/>
                     </div>
                     <button onClick={handleAddAccount} className="p-1 text-green-500/70 hover:text-green-400 hover:bg-green-900/20 rounded transition-colors" title="Hesap Ekle"><Plus size={14} /></button>
                     {accounts.length > 1 && (
                       <button onClick={handleDeleteAccount} className="p-1 text-red-800/70 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors" title="Hesap Sil"><Trash2 size={14} /></button>
                     )}
                  </div>
               </div>
            </div>

            {/* Right: Action Buttons */}
            <div className="flex items-center gap-1.5">
              <button onClick={() => setIsSearchOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/50 hover:bg-yellow-600 hover:text-black text-yellow-500 text-[11px] font-bold rounded-md border border-slate-600/40 hover:border-yellow-500 transition-all"><Search size={13} /><span>Ara</span></button>
              <button onClick={handleExportExcel} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/50 hover:bg-emerald-700 text-emerald-300 hover:text-white text-[11px] font-bold rounded-md border border-slate-600/40 hover:border-emerald-500 transition-all"><FileSpreadsheet size={13} /><span>Excel</span></button>
              <button onClick={saveData} className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-md border transition-all ${hasUnsavedChanges ? 'bg-yellow-500/20 text-yellow-300 border-yellow-400/60 animate-pulse ring-2 ring-yellow-400/50 shadow-lg shadow-yellow-500/20' : 'bg-slate-700/50 hover:bg-blue-700 text-blue-300 hover:text-white border-slate-600/40 hover:border-blue-500'}`}><Save size={13} /><span>Kaydet</span></button>
              {userRole === 'admin' && (
                <button onClick={() => setShowAdminPanel(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-950/50 hover:bg-red-800 text-red-400 hover:text-white text-[11px] font-bold rounded-md border border-red-900/40 hover:border-red-600 transition-all"><Crown size={13} /><span>Admin</span></button>
              )}
              <div className="w-px h-6 bg-slate-600/30 mx-1"></div>
              <button onClick={handleLogout} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-900/20 rounded-md border border-transparent hover:border-red-800/30 transition-all" title="Çıkış"><LogOut size={14} /></button>
            </div>
          </div>

          {/* Desktop Server Selector */}
          <div className="hidden md:flex bg-gradient-to-r from-slate-800/60 to-slate-800/40 px-4 py-1 items-center gap-1.5 border-b border-slate-700/30">
            <Globe size={13} className="text-emerald-500 shrink-0" />
            <span className="text-[10px] text-slate-500 font-bold mr-1">SUNUCU:</span>
            {activeAccount.servers.map((server, idx) => (
              <button
                key={server.id}
                onClick={() => { setSelectedServerIndex(idx); setActiveCharIndex(0); setCurrentViewIndex(0); }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold whitespace-nowrap transition-all ${
                  selectedServerIndex === idx
                    ? 'bg-emerald-800/50 text-emerald-300 border border-emerald-500/40 shadow-sm'
                    : 'bg-slate-900/30 text-slate-500 border border-transparent hover:bg-slate-800 hover:text-slate-300'
                }`}
              >
                {server.name}
              </button>
            ))}
          </div>

          {/* Bottom Bar: Characters */}
          <div className="bg-gradient-to-b from-slate-800/80 to-slate-800/40 px-2 flex justify-between items-end gap-2">
             <div className="flex gap-1 overflow-x-auto w-full no-scrollbar py-0.5">
                {activeServer.characters.map((char, idx) => (
                  <button
                    key={char.id}
                    onClick={() => { setActiveCharIndex(idx); setCurrentViewIndex(0); }}
                    className={`
                      px-3 md:px-4 py-2 md:py-1.5 rounded-t-lg font-bold text-[11px] md:text-xs tracking-wide transition-all whitespace-nowrap flex items-center gap-1.5 flex-1 justify-center
                      ${activeCharIndex === idx
                        ? 'bg-slate-900/80 text-white shadow-inner border-t-2 border-x border-yellow-500/40 border-x-slate-600/50'
                        : 'bg-slate-900/20 text-slate-500 hover:bg-slate-800/60 hover:text-slate-300 border-t-2 border-x border-transparent'
                      }
                    `}
                  >
                    <User size={11} className={activeCharIndex === idx ? 'text-yellow-500' : 'opacity-40'} />
                    {char.name}
                  </button>
                ))}
             </div>

             <div className="hidden md:flex items-center gap-2 bg-slate-900/40 px-3 py-1.5 rounded-t-lg border-t border-x border-slate-700/30 shrink-0">
                <button
                  onClick={() => setIsRecipeBookOpen(true)}
                  className="p-1 text-purple-400 hover:text-purple-300 hover:bg-purple-900/30 rounded-md transition-colors relative"
                  title="Reçete Kitabı"
                >
                    <Book size={14} />
                    {activeChar.learnedRecipes?.length > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 bg-purple-500 text-white text-[7px] rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold shadow-sm">
                            {activeChar.learnedRecipes.length}
                        </span>
                    )}
                </button>

                <div className="w-px h-4 bg-slate-700/50"></div>

                <div className="flex items-center gap-1 group/char">
                  <input
                     value={tempCharName}
                     onChange={(e) => setTempCharName(e.target.value)}
                     onBlur={commitCharacterName}
                     className="bg-transparent text-blue-300 font-bold text-xs outline-none w-24 border-b border-dashed border-blue-500/25 focus:border-blue-500/50 focus:border-solid placeholder-slate-600 transition-colors"
                     placeholder="Karakter Adı"
                     maxLength={20}
                  />
                  <Edit3 size={10} className="text-blue-400 shrink-0" />
                </div>
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
                  maxLength={20}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-1 bg-slate-800/50 md:flex-1 flex flex-col md:min-h-0">
           <div className="md:flex-1 w-full md:h-full">
              {currentView === 'bag' ? (
                 <div className="w-full md:h-full flex items-center justify-center animate-in fade-in zoom-in duration-300">
                    <div className="w-full md:h-full max-w-[90%] md:max-h-[80%] bg-[#1a1510] p-1 rounded-xl border-4 border-[#3e3428] shadow-2xl relative flex flex-col">
                        <ContainerGrid
                            container={activeContainer}
                            onSlotClick={handleSlotClick}
                            onSlotHover={handleSlotHover}
                            onMoveItem={handleMoveItem}
                            searchQuery={""}
                            onNext={handleNextView}
                            talismanDuplicates={talismanDuplicates}
                        />
                    </div>
                 </div>
              ) : (
                  <div className="w-full md:h-full animate-in fade-in slide-in-from-bottom-4 duration-300">
                     <ContainerGrid
                        container={activeContainer}
                        onSlotClick={handleSlotClick}
                        onSlotHover={handleSlotHover}
                        onMoveItem={handleMoveItem}
                        searchQuery={""}
                        onNext={handleNextView}
                        talismanDuplicates={talismanDuplicates}
                    />
                  </div>
              )}
           </div>
        </div>

        {/* Save Reminder Toast */}
        {toast && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="bg-yellow-600 text-black text-xs md:text-sm font-bold px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 whitespace-nowrap">
              <Save size={14} />
              {toast}
            </div>
          </div>
        )}

        {/* Save Notification */}
        {saveNotification && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setSaveNotification(null)}>
            <div
              className="relative mx-4 px-8 py-6 rounded-2xl shadow-2xl flex flex-col items-center gap-3 animate-in zoom-in-95 fade-in duration-300"
              style={{
                background: saveNotification.type === 'success'
                  ? 'linear-gradient(135deg, #064e3b 0%, #065f46 50%, #047857 100%)'
                  : 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 50%, #b91c1c 100%)',
                border: `1px solid ${saveNotification.type === 'success' ? 'rgba(52,211,153,0.3)' : 'rgba(252,165,165,0.3)'}`,
                boxShadow: saveNotification.type === 'success'
                  ? '0 0 40px rgba(16,185,129,0.3), 0 20px 60px rgba(0,0,0,0.4)'
                  : '0 0 40px rgba(239,68,68,0.3), 0 20px 60px rgba(0,0,0,0.4)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={`p-3 rounded-full ${saveNotification.type === 'success' ? 'bg-emerald-500/20 ring-2 ring-emerald-400/40' : 'bg-red-500/20 ring-2 ring-red-400/40'}`}>
                {saveNotification.type === 'success'
                  ? <CheckCircle size={36} className="text-emerald-400 drop-shadow-lg" />
                  : <XCircle size={36} className="text-red-400 drop-shadow-lg" />
                }
              </div>
              <p className="text-white font-bold text-sm md:text-base text-center leading-relaxed">{saveNotification.message}</p>
              <button
                onClick={() => setSaveNotification(null)}
                className={`mt-1 px-5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  saveNotification.type === 'success'
                    ? 'bg-emerald-500/25 hover:bg-emerald-500/40 text-emerald-200 border border-emerald-400/30'
                    : 'bg-red-500/25 hover:bg-red-500/40 text-red-200 border border-red-400/30'
                }`}
              >
                Tamam
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="bg-slate-900 p-0.5 flex justify-between items-center text-[8px] md:text-[9px] text-slate-600 border-t border-slate-700 shrink-0">
           <span className="w-full text-center">IKV KASA YÖNETİM SİSTEMİ v4.0 • {activeServer.name} • {activeChar.name} • {username ? `@${username}` : auth.currentUser?.email} • {userRole === 'admin' ? 'Yönetici' : 'Kullanıcı'}</span>
        </div>
      </div>

      {/* Username Modal */}
      {showUsernameModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowUsernameModal(false)}>
          <div
            className="relative mx-4 w-full max-w-sm bg-gradient-to-b from-slate-800 to-slate-900 border border-slate-600/50 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-cyan-900/40 to-blue-900/40 px-6 py-4 border-b border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="bg-cyan-500/15 p-2 rounded-xl border border-cyan-500/25">
                  <AtSign size={20} className="text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-sm">Kullanıcı Adı Belirle</h3>
                  <p className="text-slate-400 text-[10px] mt-0.5">Bu işlem sadece 1 kez yapılabilir</p>
                </div>
              </div>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-[10px] font-semibold text-slate-400 mb-1.5 block tracking-wider">KULLANICI ADI</label>
                <input
                  type="text"
                  value={usernameInput}
                  onChange={(e) => { setUsernameInput(e.target.value); setUsernameError(''); }}
                  className="w-full bg-slate-950/80 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all placeholder-slate-600"
                  placeholder="kullanici_adi"
                  maxLength={20}
                  minLength={3}
                />
                <p className="text-[10px] text-slate-500 mt-1">En az 3, en çok 20 karakter.</p>
              </div>

              {usernameError && (
                <div className="bg-red-950/40 border border-red-900/50 rounded-lg p-2 flex items-start gap-2 text-red-300/90 text-xs">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>{usernameError}</span>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => setShowUsernameModal(false)}
                  className="flex-1 py-2 px-4 bg-slate-800 text-slate-400 text-xs font-bold rounded-lg border border-slate-700 hover:bg-slate-700 transition-colors"
                >
                  Daha Sonra
                </button>
                <button
                  onClick={handleSetUsername}
                  disabled={usernameLoading || usernameInput.trim().length < 3}
                  className="flex-1 py-2 px-4 bg-gradient-to-r from-cyan-700 to-blue-600 text-white text-xs font-bold rounded-lg hover:from-cyan-600 hover:to-blue-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  {usernameLoading ? (
                    <span className="animate-pulse">Kontrol ediliyor...</span>
                  ) : (
                    <>
                      <Check size={14} />
                      Kaydet
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Social Link Modal */}
      {showSocialLinkModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowSocialLinkModal(false)}>
          <div
            className="relative mx-4 w-full max-w-sm bg-gradient-to-b from-slate-800 to-slate-900 border border-slate-600/50 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-blue-900/40 to-indigo-900/40 px-6 py-4 border-b border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="bg-blue-500/15 p-2 rounded-xl border border-blue-500/25">
                  <Link2 size={20} className="text-blue-400" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-sm">Sosyal Medya Linki</h3>
                  <p className="text-slate-400 text-[10px] mt-0.5">Global aramada profilinizde gosterilir</p>
                </div>
              </div>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-[10px] font-semibold text-slate-400 mb-1.5 block tracking-wider">PROFIL LINKI</label>
                <input
                  type="url"
                  value={socialLinkInput}
                  onChange={(e) => setSocialLinkInput(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all placeholder-slate-600"
                  placeholder="https://instagram.com/kullanici"
                  maxLength={200}
                />
                <p className="text-[10px] text-slate-500 mt-1">Facebook, Instagram, Twitter vb. profil linkinizi girin.</p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowSocialLinkModal(false)}
                  className="flex-1 py-2 px-4 bg-slate-800 text-slate-400 text-xs font-bold rounded-lg border border-slate-700 hover:bg-slate-700 transition-colors"
                >
                  Vazgec
                </button>
                <button
                  onClick={handleSaveSocialLink}
                  disabled={socialLinkSaving}
                  className="flex-1 py-2 px-4 bg-gradient-to-r from-blue-700 to-indigo-600 text-white text-xs font-bold rounded-lg hover:from-blue-600 hover:to-indigo-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  {socialLinkSaving ? (
                    <span className="animate-pulse">Kaydediliyor...</span>
                  ) : (
                    <>
                      <Check size={14} />
                      Kaydet
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ItemDetailModal
        item={detailItem}
        onClose={() => { setDetailItem(null); setDetailSlot(null); }}
        onEdit={handleEditFromDetail}
        talismanLocations={talismanLocations}
      />

      <ItemModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSaveItem}
        onDelete={handleDeleteItem}
        onRead={handleReadRecipe}
        existingItem={getCurrentItem()}
        enchantmentSuggestions={enchantmentSuggestions}
        globalSetLookup={globalSetLookup}
        globalSetMap={globalSetMap}
      />

      <GlobalSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        accounts={accounts}
        onNavigate={handleSearchResultNavigate}
        globalSetLookup={globalSetLookup}
        globalSetMap={globalSetMap}
        currentUserUid={auth.currentUser?.uid || ''}
        currentUserRole={userRole}
      />

      <RecipeBookModal
        isOpen={isRecipeBookOpen}
        onClose={() => setIsRecipeBookOpen(false)}
        characterName={activeChar.name}
        recipes={activeChar.learnedRecipes || []}
        onUnlearn={handleUnlearnRecipe}
        onEdit={handleEditRecipe}
      />

      <ItemModal
        isOpen={isRecipeEditModalOpen}
        onClose={() => { setIsRecipeEditModalOpen(false); setEditingRecipe(null); }}
        onSave={handleSaveEditedRecipe}
        onDelete={handleDeleteEditedRecipe}
        existingItem={editingRecipe}
        enchantmentSuggestions={enchantmentSuggestions}
        globalSetLookup={globalSetLookup}
        globalSetMap={globalSetMap}
      />

      {/* Desktop Tooltip (mouse hover) */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none hidden md:block"
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
