import React, { useState, useEffect, useMemo } from 'react';
import { AdminUserInfo, SearchLimitsConfig, Account } from '../types';
import { CATEGORY_OPTIONS } from '../types';
import { Shield, ArrowLeft, Users, Settings, BarChart3, Search, Trash2, Crown, Plus, X, Loader2, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { db } from '../firebase';
import { collection, getDocs, doc, getDoc, setDoc, deleteDoc, query, where, writeBatch, arrayUnion, arrayRemove } from 'firebase/firestore';

interface AdminPanelProps {
  onBack: () => void;
}

type TabType = 'dashboard' | 'users' | 'settings';

export const AdminPanel: React.FC<AdminPanelProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Data
  const [allUsers, setAllUsers] = useState<AdminUserInfo[]>([]);
  const [globalItemCount, setGlobalItemCount] = useState(0);
  const [globalItemCategories, setGlobalItemCategories] = useState<Record<string, number>>({});
  const [globalItemClasses, setGlobalItemClasses] = useState<Record<string, number>>({});
  const [globalItemGenders, setGlobalItemGenders] = useState<Record<string, number>>({});

  // Settings
  const [adminEmails, setAdminEmails] = useState<string[]>([]);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);
  const [searchLimits, setSearchLimits] = useState<SearchLimitsConfig>({ defaultLimit: 50, userOverrides: {} });
  const [newLimitValue, setNewLimitValue] = useState('50');
  const [limitSaving, setLimitSaving] = useState(false);
  const [newOverrideUid, setNewOverrideUid] = useState('');
  const [newOverrideLimit, setNewOverrideLimit] = useState('');

  // Users tab
  const [userSearch, setUserSearch] = useState('');
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Fetch all data on mount
  useEffect(() => {
    fetchAllData();
  }, []);

  const normalizeAccounts = (raw: unknown): Account[] => {
    if (Array.isArray(raw)) return raw as Account[];
    if (raw && typeof raw === 'object') {
      return Object.values(raw).filter((value): value is Account => !!value && typeof value === 'object');
    }
    return [];
  };

  const toMillis = (value: unknown): number | undefined => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (value instanceof Date) return value.getTime();
    if (value && typeof value === 'object' && 'toMillis' in value) {
      const fn = (value as { toMillis?: unknown }).toMillis;
      if (typeof fn === 'function') {
        try {
          return (fn as () => number)();
        } catch {
          return undefined;
        }
      }
    }
    return undefined;
  };

  const fetchAllData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // Fetch all users
      const usersSnap = await getDocs(collection(db, "users"));
      const users: AdminUserInfo[] = [];

      usersSnap.forEach(docSnap => {
        try {
          const data = docSnap.data();
          const accounts = normalizeAccounts(data.accounts);
          const createdAt = toMillis(data.createdAt);

          let totalItems = 0;
          let totalRecipes = 0;

          accounts.forEach(acc => {
            const servers = Array.isArray(acc?.servers) ? acc.servers : [];
            servers.forEach(server => {
              const characters = Array.isArray(server?.characters) ? server.characters : [];
              characters.forEach(char => {
                [char?.bank1, char?.bank2, char?.bag].forEach(container => {
                  if (Array.isArray(container?.slots)) {
                    container.slots.forEach(slot => {
                      if (slot?.item) totalItems++;
                    });
                  }
                });
                totalRecipes += Array.isArray(char?.learnedRecipes) ? char.learnedRecipes.length : 0;
              });
            });
          });

          users.push({
            uid: docSnap.id,
            email: data.email || '',
            username: data.username || null,
            socialLink: data.socialLink || '',
            accountCount: accounts.length,
            totalItemCount: totalItems,
            totalRecipeCount: totalRecipes,
            createdAt,
            accounts,
          });
        } catch (userError) {
          console.warn("Kullanici parse atlaniyor:", docSnap.id, userError);
        }
      });

      setAllUsers(users);

      // Fetch global items stats
      const globalSnap = await getDocs(collection(db, "globalItems"));
      setGlobalItemCount(globalSnap.size);

      const catCount: Record<string, number> = {};
      const classCount: Record<string, number> = {};
      const genderCount: Record<string, number> = {};

      globalSnap.forEach(d => {
        const item = d.data().item;
        if (item) {
          const category = typeof item.category === 'string' && item.category ? item.category : 'Bilinmiyor';
          const heroClass = typeof item.heroClass === 'string' && item.heroClass ? item.heroClass : 'Bilinmiyor';
          const gender = typeof item.gender === 'string' && item.gender ? item.gender : 'Bilinmiyor';
          catCount[category] = (catCount[category] || 0) + 1;
          classCount[heroClass] = (classCount[heroClass] || 0) + 1;
          genderCount[gender] = (genderCount[gender] || 0) + 1;
        }
      });

      setGlobalItemCategories(catCount);
      setGlobalItemClasses(classCount);
      setGlobalItemGenders(genderCount);

      // Fetch admin list
      try {
        const adminsDoc = await getDoc(doc(db, "metadata", "admins"));
        if (adminsDoc.exists()) {
          setAdminEmails(adminsDoc.data().emails || []);
        }
      } catch { /* no admins doc yet */ }

      // Fetch search limits
      try {
        const limitsDoc = await getDoc(doc(db, "metadata", "searchLimits"));
        if (limitsDoc.exists()) {
          const data = limitsDoc.data();
          setSearchLimits({
            defaultLimit: data.defaultLimit || 50,
            userOverrides: data.userOverrides || {},
          });
          setNewLimitValue(String(data.defaultLimit || 50));
        }
      } catch { /* no limits doc yet */ }

    } catch (error) {
      setLoadError("Veriler yuklenirken hata olustu. Firestore izinlerini ve kullanici kayit verilerini kontrol edin.");
      console.error("Admin veri yükleme hatası:", error);
    } finally {
      setLoading(false);
    }
  };

  // Stats
  const totalItems = useMemo(() => allUsers.reduce((sum, u) => sum + u.totalItemCount, 0), [allUsers]);
  const totalRecipes = useMemo(() => allUsers.reduce((sum, u) => sum + u.totalRecipeCount, 0), [allUsers]);
  const recentUsers = useMemo(() => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return allUsers.filter(u => u.createdAt && u.createdAt > sevenDaysAgo).length;
  }, [allUsers]);

  // Category distribution from ALL users' items
  const allItemCategoryDist = useMemo(() => {
    const dist: Record<string, number> = {};
    allUsers.forEach(u => {
      const accounts = Array.isArray(u.accounts) ? u.accounts : [];
      accounts.forEach(acc => {
        const servers = Array.isArray(acc?.servers) ? acc.servers : [];
        servers.forEach(server => {
          const characters = Array.isArray(server?.characters) ? server.characters : [];
          characters.forEach(char => {
            [char?.bank1, char?.bank2, char?.bag].forEach(container => {
              if (Array.isArray(container?.slots)) {
                container.slots.forEach(slot => {
                  if (slot?.item?.category) {
                    dist[slot.item.category] = (dist[slot.item.category] || 0) + 1;
                  }
                });
              }
            });
          });
        });
      });
    });
    return dist;
  }, [allUsers]);

  const allItemClassDist = useMemo(() => {
    const dist: Record<string, number> = {};
    allUsers.forEach(u => {
      const accounts = Array.isArray(u.accounts) ? u.accounts : [];
      accounts.forEach(acc => {
        const servers = Array.isArray(acc?.servers) ? acc.servers : [];
        servers.forEach(server => {
          const characters = Array.isArray(server?.characters) ? server.characters : [];
          characters.forEach(char => {
            [char?.bank1, char?.bank2, char?.bag].forEach(container => {
              if (Array.isArray(container?.slots)) {
                container.slots.forEach(slot => {
                  if (slot?.item?.heroClass) {
                    dist[slot.item.heroClass] = (dist[slot.item.heroClass] || 0) + 1;
                  }
                });
              }
            });
          });
        });
      });
    });
    return dist;
  }, [allUsers]);

  const allItemGenderDist = useMemo(() => {
    const dist: Record<string, number> = {};
    allUsers.forEach(u => {
      const accounts = Array.isArray(u.accounts) ? u.accounts : [];
      accounts.forEach(acc => {
        const servers = Array.isArray(acc?.servers) ? acc.servers : [];
        servers.forEach(server => {
          const characters = Array.isArray(server?.characters) ? server.characters : [];
          characters.forEach(char => {
            [char?.bank1, char?.bank2, char?.bag].forEach(container => {
              if (Array.isArray(container?.slots)) {
                container.slots.forEach(slot => {
                  if (slot?.item?.gender) {
                    dist[slot.item.gender] = (dist[slot.item.gender] || 0) + 1;
                  }
                });
              }
            });
          });
        });
      });
    });
    return dist;
  }, [allUsers]);

  // User search filter
  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return allUsers;
    const q = userSearch.toLocaleLowerCase('tr');
    return allUsers.filter(u =>
      (u.username || '').toLocaleLowerCase('tr').includes(q) ||
      u.email.toLocaleLowerCase('tr').includes(q) ||
      u.uid.toLocaleLowerCase('tr').includes(q)
    );
  }, [allUsers, userSearch]);

  // Delete user
  const handleDeleteUser = async (user: AdminUserInfo) => {
    setDeleting(true);
    try {
      const batch = writeBatch(db);

      // 1. Delete username doc
      if (user.username) {
        batch.delete(doc(db, "usernames", user.username.toLowerCase()));
      }

      // 2. Delete all globalItems belonging to this user
      const globalQ = query(collection(db, "globalItems"), where("uid", "==", user.uid));
      const globalSnap = await getDocs(globalQ);
      globalSnap.forEach(d => batch.delete(d.ref));

      // 3. Delete user doc
      batch.delete(doc(db, "users", user.uid));

      await batch.commit();

      // Update local state
      setAllUsers(prev => prev.filter(u => u.uid !== user.uid));
      setDeleteConfirm(null);
    } catch (error) {
      console.error("Kullanıcı silme hatası:", error);
      alert("Kullanıcı silinirken hata oluştu.");
    } finally {
      setDeleting(false);
    }
  };

  // Admin management
  const handleAddAdmin = async () => {
    const email = newAdminEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) return;

    setAdminLoading(true);
    try {
      await setDoc(doc(db, "metadata", "admins"), { emails: arrayUnion(email) }, { merge: true });
      setAdminEmails(prev => [...prev, email]);
      setNewAdminEmail('');
    } catch (error) {
      console.error("Admin ekleme hatası:", error);
    } finally {
      setAdminLoading(false);
    }
  };

  const handleRemoveAdmin = async (email: string) => {
    if (email === 'yvzsltn61@gmail.com') return;

    setAdminLoading(true);
    try {
      await setDoc(doc(db, "metadata", "admins"), { emails: arrayRemove(email) }, { merge: true });
      setAdminEmails(prev => prev.filter(e => e !== email));
    } catch (error) {
      console.error("Admin kaldırma hatası:", error);
    } finally {
      setAdminLoading(false);
    }
  };

  // Search limits
  const handleSaveDefaultLimit = async () => {
    const val = parseInt(newLimitValue);
    if (isNaN(val) || val < 1) return;

    setLimitSaving(true);
    try {
      await setDoc(doc(db, "metadata", "searchLimits"), { defaultLimit: val, userOverrides: searchLimits.userOverrides }, { merge: true });
      setSearchLimits(prev => ({ ...prev, defaultLimit: val }));
    } catch (error) {
      console.error("Limit kaydetme hatası:", error);
    } finally {
      setLimitSaving(false);
    }
  };

  const handleAddOverride = async () => {
    const uid = newOverrideUid.trim();
    const lim = parseInt(newOverrideLimit);
    if (!uid || isNaN(lim) || lim < 1) return;

    setLimitSaving(true);
    try {
      const newOverrides = { ...searchLimits.userOverrides, [uid]: lim };
      await setDoc(doc(db, "metadata", "searchLimits"), { defaultLimit: searchLimits.defaultLimit, userOverrides: newOverrides }, { merge: true });
      setSearchLimits(prev => ({ ...prev, userOverrides: newOverrides }));
      setNewOverrideUid('');
      setNewOverrideLimit('');
    } catch (error) {
      console.error("Override ekleme hatası:", error);
    } finally {
      setLimitSaving(false);
    }
  };

  const handleRemoveOverride = async (uid: string) => {
    setLimitSaving(true);
    try {
      const newOverrides = { ...searchLimits.userOverrides };
      delete newOverrides[uid];
      await setDoc(doc(db, "metadata", "searchLimits"), { defaultLimit: searchLimits.defaultLimit, userOverrides: newOverrides });
      setSearchLimits(prev => ({ ...prev, userOverrides: newOverrides }));
    } catch (error) {
      console.error("Override kaldırma hatası:", error);
    } finally {
      setLimitSaving(false);
    }
  };

  // Bar chart helper
  const BarChart: React.FC<{ data: Record<string, number>; color: string }> = ({ data, color }) => {
    const entries = Object.entries(data) as Array<[string, number]>;
    entries.sort((a, b) => b[1] - a[1]);
    const max = Math.max(...entries.map(e => e[1]), 1);
    return (
      <div className="space-y-1">
        {entries.map(([label, count]) => (
          <div key={label} className="flex items-center gap-2 text-[11px]">
            <span className="w-24 text-slate-400 text-right truncate shrink-0">{label}</span>
            <div className="flex-1 bg-slate-800 rounded-full h-4 overflow-hidden">
              <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${(count / max) * 100}%` }} />
            </div>
            <span className="w-8 text-slate-300 text-right shrink-0">{count}</span>
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen w-screen bg-slate-950 flex flex-col items-center justify-center text-red-400 font-bold gap-4">
        <Loader2 size={48} className="animate-spin" />
        <div className="text-lg animate-pulse">Admin Paneli Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-screen bg-slate-950 md:bg-gradient-to-br md:from-slate-950 md:via-slate-900 md:to-slate-950 flex md:items-center md:justify-center md:h-screen md:overflow-hidden">
      <div className="w-full md:w-[98vw] min-h-screen md:min-h-0 md:h-[98vh] bg-slate-900/95 border-0 md:border-2 md:border-red-900/50 rounded-none md:rounded-lg shadow-none md:shadow-[0_0_50px_rgba(220,38,38,0.15)] md:overflow-hidden flex flex-col">

        {/* Header */}
        <div className="bg-gradient-to-r from-red-950/80 via-slate-800 to-red-950/80 px-4 py-3 flex items-center gap-3 border-b-2 border-red-900/50 shrink-0">
          <button onClick={onBack} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div className="bg-red-900/30 p-2 rounded-lg border border-red-700/30">
            <Crown size={20} className="text-red-400" />
          </div>
          <div>
            <h1 className="text-red-400 font-bold text-sm tracking-wider">ADMiN PANELi</h1>
            <p className="text-slate-500 text-[9px]">Sistem Yönetimi</p>
          </div>
          <div className="flex-1" />
          <button onClick={fetchAllData} className="text-[10px] text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-700 transition-colors">
            Yenile
          </button>
        </div>

        {/* Tabs */}
        <div className="bg-slate-800/60 px-4 py-1.5 flex gap-1.5 border-b border-slate-700/50 shrink-0">
          {([
            { key: 'dashboard' as TabType, label: 'Panel', icon: BarChart3 },
            { key: 'users' as TabType, label: 'Kullanıcılar', icon: Users },
            { key: 'settings' as TabType, label: 'Ayarlar', icon: Settings },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === tab.key
                  ? 'bg-red-900/40 text-red-300 border border-red-700/40'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800 border border-transparent'
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">

          {/* DASHBOARD TAB */}
          {activeTab === 'dashboard' && (
            <div className="space-y-4 max-w-4xl mx-auto">
              {loadError && (
                <div className="bg-red-950/30 border border-red-800/40 text-red-300 text-xs rounded-xl px-3 py-2">
                  {loadError}
                </div>
              )}
              {/* Stat Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Toplam Kullanıcı" value={allUsers.length} color="text-cyan-400" bg="from-cyan-950/40 to-cyan-900/20" />
                <StatCard label="Toplam Eşya" value={totalItems} color="text-yellow-400" bg="from-yellow-950/40 to-yellow-900/20" />
                <StatCard label="Global Eşya" value={globalItemCount} color="text-emerald-400" bg="from-emerald-950/40 to-emerald-900/20" />
                <StatCard label="Son 7 Gün Kayıt" value={recentUsers} color="text-purple-400" bg="from-purple-950/40 to-purple-900/20" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <StatCard label="Toplam Reçete" value={totalRecipes} color="text-orange-400" bg="from-orange-950/40 to-orange-900/20" />
                <StatCard label="Ort. Eşya/Kullanıcı" value={allUsers.length > 0 ? Math.round(totalItems / allUsers.length) : 0} color="text-pink-400" bg="from-pink-950/40 to-pink-900/20" />
              </div>

              {/* Category Distribution */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                <h3 className="text-slate-300 text-xs font-bold mb-3 tracking-wider">KATEGORi DAGILIMI (Tüm Kullanıcılar)</h3>
                <BarChart data={allItemCategoryDist} color="bg-yellow-500" />
              </div>

              {/* Class Distribution */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                <h3 className="text-slate-300 text-xs font-bold mb-3 tracking-wider">SINIF DAGILIMI</h3>
                <BarChart data={allItemClassDist} color="bg-blue-500" />
              </div>

              {/* Gender Distribution */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                <h3 className="text-slate-300 text-xs font-bold mb-3 tracking-wider">CiNSiYET DAGILIMI</h3>
                <BarChart data={allItemGenderDist} color="bg-pink-500" />
              </div>
            </div>
          )}

          {/* USERS TAB */}
          {activeTab === 'users' && (
            <div className="space-y-3 max-w-4xl mx-auto">
              {loadError && (
                <div className="bg-red-950/30 border border-red-800/40 text-red-300 text-xs rounded-xl px-3 py-2">
                  {loadError}
                </div>
              )}
              {/* Search */}
              <div className="flex items-center gap-2 bg-slate-800/50 border border-slate-700/50 rounded-xl px-3 py-2">
                <Search size={16} className="text-slate-500" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  placeholder="Kullanıcı adı, email veya UID ile ara..."
                  className="flex-1 bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600"
                />
                <span className="text-[10px] text-slate-500">{filteredUsers.length} kullanıcı</span>
              </div>

              {/* User List */}
              {filteredUsers.map(user => (
                <div key={user.uid} className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedUser(expandedUser === user.uid ? null : user.uid)}
                    className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-700/30 transition-colors"
                  >
                    <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center shrink-0">
                      <Users size={14} className="text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-white font-bold truncate">{user.username || '(İsimsiz)'}</span>
                        <span className="text-[9px] text-slate-500 truncate hidden md:inline">{user.email}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-slate-500 mt-0.5">
                        <span>{user.accountCount} hesap</span>
                        <span>{user.totalItemCount} eşya</span>
                        <span>{user.totalRecipeCount} reçete</span>
                        {user.createdAt && (
                          <span className="hidden md:inline">{new Date(user.createdAt).toLocaleDateString('tr-TR')}</span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0">
                      {expandedUser === user.uid ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                    </div>
                  </button>

                  {/* Expanded Detail */}
                  {expandedUser === user.uid && (
                    <div className="border-t border-slate-700/50 px-4 py-3 space-y-2 bg-slate-900/30 animate-in slide-in-from-top-2 duration-200">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-[11px]">
                        <div><span className="text-slate-500">UID:</span> <span className="text-slate-300 font-mono text-[9px] break-all">{user.uid}</span></div>
                        <div><span className="text-slate-500">Email:</span> <span className="text-slate-300">{user.email || '-'}</span></div>
                        <div><span className="text-slate-500">Sosyal:</span> <span className="text-blue-300 truncate">{user.socialLink || '-'}</span></div>
                        {user.createdAt && (
                          <div><span className="text-slate-500">Kayıt:</span> <span className="text-slate-300">{new Date(user.createdAt).toLocaleString('tr-TR')}</span></div>
                        )}
                      </div>

                      {/* Account/Server/Char breakdown */}
                      <div className="mt-2 space-y-1">
                        <span className="text-[10px] text-slate-500 font-bold tracking-wider">HESAP DETAYLARI</span>
                        {(Array.isArray(user.accounts) ? user.accounts : []).map((acc, aIdx) => (
                          <div key={aIdx} className="bg-slate-800/50 rounded-lg p-2 text-[10px]">
                            <span className="text-yellow-400 font-bold">{acc.name}</span>
                            <div className="ml-2 mt-1 space-y-0.5">
                              {(acc.servers || []).map((srv, sIdx) => {
                                const charItems = (Array.isArray(srv.characters) ? srv.characters : []).map(c => {
                                  let cnt = 0;
                                  [c?.bank1, c?.bank2, c?.bag].forEach(cont => {
                                    if (Array.isArray(cont?.slots)) cont.slots.forEach(s => { if (s?.item) cnt++; });
                                  });
                                  const recipes = Array.isArray(c?.learnedRecipes) ? c.learnedRecipes.length : 0;
                                  return { name: c?.name || 'Isimsiz', items: cnt, recipes };
                                });
                                const totalSrvItems = charItems.reduce((s, c) => s + c.items, 0);
                                if (totalSrvItems === 0 && charItems.every(c => c.recipes === 0)) return null;
                                return (
                                  <div key={sIdx} className="flex flex-wrap gap-x-3 gap-y-0.5">
                                    <span className="text-emerald-400">{srv.name}:</span>
                                    {charItems.map((c, cIdx) => (
                                      (c.items > 0 || c.recipes > 0) && (
                                        <span key={cIdx} className="text-slate-400">
                                          {c.name} <span className="text-slate-300">({c.items}e {c.recipes}r)</span>
                                        </span>
                                      )
                                    ))}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* User-specific search limit */}
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] text-slate-500">Arama Limiti:</span>
                        <span className="text-[10px] text-slate-300 font-bold">
                          {searchLimits.userOverrides[user.uid] !== undefined ? searchLimits.userOverrides[user.uid] : `Varsayılan (${searchLimits.defaultLimit})`}
                        </span>
                      </div>

                      {/* Delete */}
                      {deleteConfirm === user.uid ? (
                        <div className="flex items-center gap-2 mt-2 bg-red-950/30 border border-red-900/50 rounded-lg p-2">
                          <AlertTriangle size={14} className="text-red-400 shrink-0" />
                          <span className="text-[11px] text-red-300 flex-1">Bu kullanıcının tüm verileri silinecek. Emin misiniz?</span>
                          <button
                            onClick={() => handleDeleteUser(user)}
                            disabled={deleting}
                            className="px-3 py-1 bg-red-700 hover:bg-red-600 text-white text-[10px] font-bold rounded transition-colors disabled:opacity-50"
                          >
                            {deleting ? 'Siliniyor...' : 'Evet, Sil'}
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-[10px] font-bold rounded transition-colors"
                          >
                            Vazgeç
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(user.uid)}
                          className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-red-950/30 hover:bg-red-900/40 text-red-400 hover:text-red-300 text-[10px] font-bold rounded-lg border border-red-900/30 hover:border-red-700/50 transition-colors"
                        >
                          <Trash2 size={12} />
                          Kullanıcıyı Sil
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* SETTINGS TAB */}
          {activeTab === 'settings' && (
            <div className="space-y-4 max-w-2xl mx-auto">

              {/* Admin Management */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                <h3 className="text-red-400 text-xs font-bold mb-3 tracking-wider flex items-center gap-2">
                  <Crown size={14} />
                  ADMiN YÖNETiMi
                </h3>

                {/* Permanent admin */}
                <div className="mb-3 space-y-1.5">
                  <div className="flex items-center gap-2 bg-slate-900/50 rounded-lg px-3 py-2 border border-slate-700/30">
                    <Shield size={14} className="text-yellow-500 shrink-0" />
                    <span className="text-sm text-slate-200 flex-1">yvzsltn61@gmail.com</span>
                    <span className="text-[9px] text-yellow-500 bg-yellow-900/30 px-2 py-0.5 rounded-full border border-yellow-700/30">Kalıcı Yönetici</span>
                  </div>

                  {adminEmails.filter(e => e !== 'yvzsltn61@gmail.com').map(email => (
                    <div key={email} className="flex items-center gap-2 bg-slate-900/50 rounded-lg px-3 py-2 border border-slate-700/30">
                      <Crown size={14} className="text-red-400 shrink-0" />
                      <span className="text-sm text-slate-200 flex-1">{email}</span>
                      <button
                        onClick={() => handleRemoveAdmin(email)}
                        disabled={adminLoading}
                        className="text-red-500 hover:text-red-400 p-1 hover:bg-red-900/20 rounded transition-colors disabled:opacity-50"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add admin */}
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={newAdminEmail}
                    onChange={e => setNewAdminEmail(e.target.value)}
                    placeholder="yeni-admin@email.com"
                    className="flex-1 bg-slate-950/80 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-red-500/50 placeholder-slate-600"
                  />
                  <button
                    onClick={handleAddAdmin}
                    disabled={adminLoading || !newAdminEmail.trim()}
                    className="px-4 py-2 bg-red-800 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Plus size={14} />
                    Ekle
                  </button>
                </div>
              </div>

              {/* Search Limits */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                <h3 className="text-emerald-400 text-xs font-bold mb-3 tracking-wider flex items-center gap-2">
                  <Search size={14} />
                  GLOBAL ARAMA LiMiTi
                </h3>

                {/* Default limit */}
                <div className="mb-4">
                  <label className="text-[10px] text-slate-500 font-bold block mb-1">VARSAYILAN GÜNLÜK LiMiT</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={newLimitValue}
                      onChange={e => setNewLimitValue(e.target.value)}
                      className="w-24 bg-slate-950/80 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500/50"
                      min="1"
                    />
                    <button
                      onClick={handleSaveDefaultLimit}
                      disabled={limitSaving}
                      className="px-4 py-2 bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
                    >
                      {limitSaving ? 'Kaydediliyor...' : 'Kaydet'}
                    </button>
                  </div>
                </div>

                {/* User overrides */}
                <div>
                  <label className="text-[10px] text-slate-500 font-bold block mb-1">KULLANICI BAZLI OVERRIDE</label>

                  {Object.entries(searchLimits.userOverrides).length > 0 && (
                    <div className="space-y-1 mb-2">
                      {Object.entries(searchLimits.userOverrides).map(([uid, lim]) => {
                        const user = allUsers.find(u => u.uid === uid);
                        return (
                          <div key={uid} className="flex items-center gap-2 bg-slate-900/50 rounded-lg px-3 py-1.5 border border-slate-700/30 text-[11px]">
                            <span className="text-slate-300 flex-1 truncate">{user?.username || user?.email || uid}</span>
                            <span className="text-emerald-400 font-bold">{lim}/gün</span>
                            <button onClick={() => handleRemoveOverride(uid)} className="text-red-500 hover:text-red-400 p-0.5" disabled={limitSaving}>
                              <X size={12} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <select
                      value={newOverrideUid}
                      onChange={e => setNewOverrideUid(e.target.value)}
                      className="flex-1 bg-slate-950/80 border border-slate-700 rounded-lg px-2 py-2 text-[11px] text-slate-200 outline-none focus:border-emerald-500/50"
                    >
                      <option value="">Kullanıcı seç...</option>
                      {allUsers.map(u => (
                        <option key={u.uid} value={u.uid}>{u.username || u.email || u.uid}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={newOverrideLimit}
                      onChange={e => setNewOverrideLimit(e.target.value)}
                      placeholder="Limit"
                      className="w-20 bg-slate-950/80 border border-slate-700 rounded-lg px-2 py-2 text-[11px] text-slate-200 outline-none focus:border-emerald-500/50"
                      min="1"
                    />
                    <button
                      onClick={handleAddOverride}
                      disabled={limitSaving || !newOverrideUid || !newOverrideLimit}
                      className="px-3 py-2 bg-emerald-800 hover:bg-emerald-700 text-white text-[10px] font-bold rounded-lg transition-colors disabled:opacity-50"
                    >
                      Ekle
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="bg-slate-900 p-0.5 flex justify-center text-[8px] md:text-[9px] text-slate-600 border-t border-red-900/30 shrink-0">
          <span>ADMiN PANELi • {allUsers.length} Kullanıcı • {totalItems} Eşya • {globalItemCount} Global</span>
        </div>
      </div>
    </div>
  );
};

// Stat card sub-component
const StatCard: React.FC<{ label: string; value: number; color: string; bg: string }> = ({ label, value, color, bg }) => (
  <div className={`bg-gradient-to-br ${bg} border border-slate-700/50 rounded-xl p-4 text-center`}>
    <div className={`text-2xl md:text-3xl font-bold ${color}`}>{value.toLocaleString('tr-TR')}</div>
    <div className="text-[10px] text-slate-500 mt-1 font-bold tracking-wider">{label}</div>
  </div>
);
