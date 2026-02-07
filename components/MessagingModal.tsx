import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Lock, MessageCircle, Search, Send, Shield, User, Users, X } from 'lucide-react';
import { db } from '../firebase';
import { collection, doc, getDoc, getDocs, onSnapshot, query, runTransaction, setDoc, where, writeBatch } from 'firebase/firestore';
import { UserRole } from '../types';

interface MessagingModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserUid: string;
  currentUserRole: UserRole;
  currentUsername: string | null;
  currentUserEmail?: string | null;
}

interface RecipientOption {
  uid: string;
  label: string;
  username?: string;
  email?: string;
}

interface RecipientDirectoryEntry {
  username: string;
  email: string;
}

interface ConversationSummary {
  peerUid: string;
  peerLabel: string;
  lastText: string;
  lastAt: number;
  lastSenderUid: string;
}

interface ChatMessage {
  id: string;
  senderUid: string;
  receiverUid: string;
  text: string;
  createdAt: number;
  readBy: string[];
}

const DEFAULT_DAILY_MESSAGE_LIMIT = 5;

const getLocalDayKey = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getNextLocalMidnight = () => {
  const next = new Date();
  next.setHours(24, 0, 0, 0);
  return next.getTime();
};

const formatDuration = (ms: number) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}s ${minutes}d ${seconds}sn`;
};

const toMessageLimit = (rawData: unknown) => {
  const settings = (rawData && typeof rawData === 'object') ? (rawData as { messageSettings?: { dailySendLimit?: unknown } }).messageSettings : undefined;
  const rawLimit = settings?.dailySendLimit;
  if (typeof rawLimit === 'number' && Number.isFinite(rawLimit) && rawLimit > 0) {
    return Math.floor(rawLimit);
  }
  return DEFAULT_DAILY_MESSAGE_LIMIT;
};

const buildConversationId = (uidA: string, uidB: string) => [uidA, uidB].sort().join('__');

export const MessagingModal: React.FC<MessagingModalProps> = ({
  isOpen,
  onClose,
  currentUserUid,
  currentUserRole,
  currentUsername,
  currentUserEmail,
}) => {
  const isAdminUser = currentUserRole === 'admin';
  const [recipientDirectory, setRecipientDirectory] = useState<Record<string, RecipientDirectoryEntry>>({});
  const [recipientSearch, setRecipientSearch] = useState('');
  const [selectedPeerUid, setSelectedPeerUid] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [receiveOnlyFromAdmin, setReceiveOnlyFromAdmin] = useState(false);
  const [preferenceSaving, setPreferenceSaving] = useState(false);
  const [selectedPeerRestricted, setSelectedPeerRestricted] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'list' | 'chat'>('list');

  const [messageLimitTotal, setMessageLimitTotal] = useState(DEFAULT_DAILY_MESSAGE_LIMIT);
  const [messageLimitUsed, setMessageLimitUsed] = useState(0);
  const [messageLimitReached, setMessageLimitReached] = useState(false);
  const [messageResetAt, setMessageResetAt] = useState<number | null>(null);
  const [messageResetCountdown, setMessageResetCountdown] = useState('');

  const bottomRef = useRef<HTMLDivElement | null>(null);

  const currentUserDisplay = (currentUsername && currentUsername.trim()) || (currentUserEmail && currentUserEmail.trim()) || currentUserUid;
  const messageLimitRemaining = Math.max(0, messageLimitTotal - messageLimitUsed);

  const updateQuotaState = useCallback((limitValue: number, usedValue: number) => {
    const normalizedLimit = Math.max(1, Math.floor(limitValue || DEFAULT_DAILY_MESSAGE_LIMIT));
    const normalizedUsed = Math.max(0, usedValue);
    const remaining = Math.max(0, normalizedLimit - normalizedUsed);

    setMessageLimitTotal(normalizedLimit);
    setMessageLimitUsed(normalizedUsed);
    setMessageLimitReached(remaining <= 0);
    setMessageResetAt(getNextLocalMidnight());
  }, []);

  const refreshQuota = useCallback(async () => {
    if (!currentUserUid) return;
    if (isAdminUser) {
      setMessageLimitTotal(0);
      setMessageLimitUsed(0);
      setMessageLimitReached(false);
      setMessageResetAt(null);
      setMessageResetCountdown('');
      return;
    }
    try {
      const userRef = doc(db, 'users', currentUserUid);
      const userSnap = await getDoc(userRef);
      const userData = userSnap.exists() ? userSnap.data() : {};
      const dailyLimit = toMessageLimit(userData);
      const todayKey = getLocalDayKey();
      const quota = (userData?.messageQuota?.direct || {}) as { day?: string; used?: number };
      const usedToday = quota.day === todayKey ? Math.max(0, quota.used || 0) : 0;
      updateQuotaState(dailyLimit, usedToday);
    } catch {
      updateQuotaState(DEFAULT_DAILY_MESSAGE_LIMIT, 0);
    }
  }, [currentUserUid, isAdminUser, updateQuotaState]);

  const allRecipients = useMemo<RecipientOption[]>(() => {
    const map = new Map<string, RecipientOption>();

    (Object.entries(recipientDirectory) as Array<[string, RecipientDirectoryEntry]>).forEach(([uid, info]) => {
      const normalizedUsername = info.username.trim();
      const normalizedEmail = info.email.trim().toLowerCase();
      map.set(uid, {
        uid,
        username: normalizedUsername || undefined,
        email: normalizedEmail || undefined,
        label: normalizedUsername || normalizedEmail || uid,
      });
    });

    conversations.forEach(conv => {
      const existing = map.get(conv.peerUid);
      const username = existing?.username || '';
      const email = existing?.email || '';
      map.set(conv.peerUid, {
        uid: conv.peerUid,
        username: username || undefined,
        email: email || undefined,
        label: (conv.peerLabel && conv.peerLabel.trim()) || username || email || conv.peerUid,
      });
    });

    return Array.from(map.values())
      .filter(option => option.uid !== currentUserUid)
      .sort((a, b) => a.label.localeCompare(b.label, 'tr'));
  }, [conversations, currentUserUid, recipientDirectory]);

  const filteredRecipients = useMemo(() => {
    const queryText = recipientSearch.trim().toLocaleLowerCase('tr');
    if (!queryText) return allRecipients;
    if (queryText.length < 4) return [];
    return allRecipients.filter(option =>
      option.label.toLocaleLowerCase('tr').includes(queryText) ||
      option.uid.toLocaleLowerCase('tr').includes(queryText) ||
      (option.username || '').toLocaleLowerCase('tr').includes(queryText) ||
      (option.email || '').toLocaleLowerCase('tr').includes(queryText)
    );
  }, [allRecipients, recipientSearch]);

  const hasShortSearchText = recipientSearch.trim().length > 0 && recipientSearch.trim().length < 4;

  const selectedPeer = useMemo(
    () => allRecipients.find(option => option.uid === selectedPeerUid) || null,
    [allRecipients, selectedPeerUid]
  );

  const conversationMap = useMemo(() => {
    const map = new Map<string, ConversationSummary>();
    conversations.forEach(conv => map.set(conv.peerUid, conv));
    return map;
  }, [conversations]);

  useEffect(() => {
    if (!isOpen || !selectedPeerUid) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [isOpen, messages, selectedPeerUid]);

  useEffect(() => {
    if (!isOpen) {
      setRecipientSearch('');
      setSelectedPeerUid(null);
      setConversations([]);
      setMessages([]);
      setMessageInput('');
      setSendError('');
      setSelectedPeerRestricted(false);
      setMessageResetCountdown('');
      setMobilePanel('list');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !currentUserUid) return;
    let isCancelled = false;

    const loadRecipients = async () => {
      setLoadingRecipients(true);
      try {
        const [usersSnap, usernamesSnap] = await Promise.all([
          getDocs(collection(db, 'users')),
          getDocs(collection(db, 'usernames')),
        ]);

        const nextMap: Record<string, RecipientDirectoryEntry> = {};

        usersSnap.forEach(docSnap => {
          if (docSnap.id === currentUserUid) return;
          const data = docSnap.data() as { username?: unknown; email?: unknown };
          const username = typeof data.username === 'string' ? data.username.trim() : '';
          const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
          nextMap[docSnap.id] = { username, email };
        });

        usernamesSnap.forEach(docSnap => {
          const data = docSnap.data() as { uid?: string; displayName?: string };
          if (!data.uid || data.uid === currentUserUid) return;
          if (!nextMap[data.uid]) {
            nextMap[data.uid] = { username: '', email: '' };
          }
          if (!nextMap[data.uid].username) {
            nextMap[data.uid].username = (data.displayName && data.displayName.trim()) || docSnap.id;
          }
        });

        if (!isCancelled) {
          setRecipientDirectory(nextMap);
        }
      } catch {
        if (!isCancelled) {
          setRecipientDirectory({});
        }
      } finally {
        if (!isCancelled) {
          setLoadingRecipients(false);
        }
      }
    };

    loadRecipients();
    return () => { isCancelled = true; };
  }, [currentUserUid, isOpen]);

  useEffect(() => {
    if (!isOpen || !currentUserUid) return;

    const prefRef = doc(db, 'messagePrefs', currentUserUid);
    const unsubscribe = onSnapshot(prefRef, snap => {
      const data = snap.exists() ? snap.data() : {};
      setReceiveOnlyFromAdmin(data?.receiveOnlyFromAdmin === true);
    });

    return () => unsubscribe();
  }, [currentUserUid, isOpen]);

  useEffect(() => {
    if (!isOpen || !currentUserUid) return;
    refreshQuota();
  }, [currentUserUid, isOpen, refreshQuota]);

  useEffect(() => {
    if (!isOpen || !messageResetAt) return;

    const updateCountdown = () => {
      const remainingMs = messageResetAt - Date.now();
      setMessageResetCountdown(formatDuration(remainingMs));
      if (remainingMs <= 0) {
        refreshQuota();
      }
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [isOpen, messageResetAt, refreshQuota]);

  useEffect(() => {
    if (!isOpen || !currentUserUid) return;

    const messagesQuery = query(
      collection(db, 'messages'),
      where('participants', 'array-contains', currentUserUid)
    );

    const unsubscribe = onSnapshot(messagesQuery, snap => {
      const byPeer = new Map<string, ConversationSummary>();

      snap.forEach(docSnap => {
        const data = docSnap.data() as {
          senderUid?: string;
          receiverUid?: string;
          senderDisplay?: string;
          receiverDisplay?: string;
          text?: string;
          createdAt?: number;
        };

        const senderUid = data.senderUid || '';
        const receiverUid = data.receiverUid || '';
        const createdAt = typeof data.createdAt === 'number' ? data.createdAt : 0;
        if (!senderUid || !receiverUid) return;

        const peerUid = senderUid === currentUserUid ? receiverUid : senderUid;
        if (!peerUid) return;

        const recipientInfo = recipientDirectory[peerUid];
        const fallbackLabel = recipientInfo?.username || recipientInfo?.email || peerUid;
        const peerLabel = senderUid === currentUserUid
          ? ((data.receiverDisplay && data.receiverDisplay.trim()) || fallbackLabel)
          : ((data.senderDisplay && data.senderDisplay.trim()) || fallbackLabel);

        const nextEntry: ConversationSummary = {
          peerUid,
          peerLabel,
          lastText: data.text || '',
          lastAt: createdAt,
          lastSenderUid: senderUid,
        };

        const currentEntry = byPeer.get(peerUid);
        if (!currentEntry || nextEntry.lastAt >= currentEntry.lastAt) {
          byPeer.set(peerUid, nextEntry);
        }
      });

      const sortedConversations = Array.from(byPeer.values()).sort((a, b) => b.lastAt - a.lastAt);
      setConversations(sortedConversations);
    });

    return () => unsubscribe();
  }, [currentUserUid, isOpen, recipientDirectory]);

  useEffect(() => {
    if (!isOpen) return;
    if (selectedPeerUid && allRecipients.some(option => option.uid === selectedPeerUid)) return;
    setSelectedPeerUid(allRecipients.length > 0 ? allRecipients[0].uid : null);
  }, [allRecipients, isOpen, selectedPeerUid]);

  useEffect(() => {
    if (!isOpen || !selectedPeerUid) return;
    setMobilePanel('chat');
  }, [isOpen, selectedPeerUid]);

  useEffect(() => {
    if (!isOpen || !selectedPeerUid) {
      setSelectedPeerRestricted(false);
      return;
    }

    const peerPrefRef = doc(db, 'messagePrefs', selectedPeerUid);
    const unsubscribe = onSnapshot(peerPrefRef, snap => {
      const data = snap.exists() ? snap.data() : {};
      setSelectedPeerRestricted(data?.receiveOnlyFromAdmin === true);
    });

    return () => unsubscribe();
  }, [isOpen, selectedPeerUid]);

  useEffect(() => {
    if (!isOpen || !currentUserUid || !selectedPeerUid) {
      setMessages([]);
      return;
    }

    const conversationId = buildConversationId(currentUserUid, selectedPeerUid);
    const conversationQuery = query(
      collection(db, 'messages'),
      where('conversationId', '==', conversationId)
    );

    const unsubscribe = onSnapshot(conversationQuery, snap => {
      const thread: ChatMessage[] = [];
      snap.forEach(docSnap => {
        const data = docSnap.data() as {
          senderUid?: string;
          receiverUid?: string;
          text?: string;
          createdAt?: number;
        };

        if (!data.senderUid || !data.receiverUid) return;
        thread.push({
          id: docSnap.id,
          senderUid: data.senderUid,
          receiverUid: data.receiverUid,
          text: data.text || '',
          createdAt: typeof data.createdAt === 'number' ? data.createdAt : 0,
          readBy: Array.isArray((data as { readBy?: unknown }).readBy)
            ? (data as { readBy: unknown[] }).readBy.filter((value): value is string => typeof value === 'string')
            : [],
        });
      });

      thread.sort((a, b) => a.createdAt - b.createdAt);
      setMessages(thread);
    });

    return () => unsubscribe();
  }, [currentUserUid, isOpen, selectedPeerUid]);

  useEffect(() => {
    if (!isOpen || !currentUserUid || !selectedPeerUid) return;
    const unreadIncoming = messages.filter(msg =>
      msg.receiverUid === currentUserUid &&
      !msg.readBy.includes(currentUserUid)
    );
    if (unreadIncoming.length === 0) return;

    const markAsRead = async () => {
      const batch = writeBatch(db);
      const now = Date.now();

      unreadIncoming.forEach(msg => {
        const nextReadBy = Array.from(new Set([...msg.readBy, currentUserUid]));
        batch.update(doc(db, 'messages', msg.id), {
          readBy: nextReadBy,
          readAt: now,
        });
      });

      try {
        await batch.commit();
      } catch {
        // Ignore read receipt errors to avoid blocking chat usage.
      }
    };

    markAsRead();
  }, [currentUserUid, isOpen, messages, selectedPeerUid]);

  const handleToggleReceiveMode = async () => {
    if (!currentUserUid || preferenceSaving) return;
    setPreferenceSaving(true);
    try {
      await setDoc(doc(db, 'messagePrefs', currentUserUid), {
        receiveOnlyFromAdmin: !receiveOnlyFromAdmin,
        updatedAt: Date.now(),
      }, { merge: true });
    } finally {
      setPreferenceSaving(false);
    }
  };

  const handleSendMessage = async () => {
    if (!currentUserUid || !selectedPeerUid) return;
    const trimmed = messageInput.trim();
    if (!trimmed) return;

    if (selectedPeerRestricted && !isAdminUser) {
      setSendError('Bu kullanici sadece yoneticilerden mesaj kabul ediyor.');
      return;
    }

    if (!isAdminUser && messageLimitReached) {
      setSendError('Bugunku mesaj hakkiniz bitti. Limit gece yarisi yenilenir.');
      return;
    }

    const selectedLabel = selectedPeer?.label || selectedPeerUid;
    const senderRef = doc(db, 'users', currentUserUid);
    const peerPrefRef = doc(db, 'messagePrefs', selectedPeerUid);

    setSending(true);
    setSendError('');

    try {
      if (isAdminUser) {
        const now = Date.now();
        const messageRef = doc(collection(db, 'messages'));
        const conversationId = buildConversationId(currentUserUid, selectedPeerUid);

        await setDoc(messageRef, {
          conversationId,
          participants: [currentUserUid, selectedPeerUid].sort(),
          senderUid: currentUserUid,
          receiverUid: selectedPeerUid,
          senderDisplay: currentUserDisplay,
          receiverDisplay: selectedLabel,
          text: trimmed,
          createdAt: now,
          readBy: [currentUserUid],
        });

        setMessageInput('');
        return;
      }

      const txResult = await runTransaction(db, async (transaction) => {
        const senderSnap = await transaction.get(senderRef);
        const senderData = senderSnap.exists() ? senderSnap.data() : {};

        const messageLimit = toMessageLimit(senderData);
        const todayKey = getLocalDayKey();
        const quota = (senderData?.messageQuota?.direct || {}) as { day?: string; used?: number };
        const usedToday = quota.day === todayKey ? Math.max(0, quota.used || 0) : 0;

        if (usedToday >= messageLimit) {
          throw new Error('LIMIT_REACHED');
        }

        const peerPrefSnap = await transaction.get(peerPrefRef);
        const peerPref = peerPrefSnap.exists() ? peerPrefSnap.data() : {};
        if (peerPref?.receiveOnlyFromAdmin === true && !isAdminUser) {
          throw new Error('RECEIVER_ONLY_ADMIN');
        }

        const now = Date.now();
        const nextUsed = usedToday + 1;
        const messageRef = doc(collection(db, 'messages'));
        const conversationId = buildConversationId(currentUserUid, selectedPeerUid);

        transaction.set(senderRef, {
          messageQuota: {
            direct: {
              day: todayKey,
              used: nextUsed,
              updatedAt: now,
            },
          },
        }, { merge: true });

        transaction.set(messageRef, {
          conversationId,
          participants: [currentUserUid, selectedPeerUid].sort(),
          senderUid: currentUserUid,
          receiverUid: selectedPeerUid,
          senderDisplay: currentUserDisplay,
          receiverDisplay: selectedLabel,
          text: trimmed,
          createdAt: now,
          readBy: [currentUserUid],
        });

        return { messageLimit, nextUsed };
      });

      updateQuotaState(txResult.messageLimit, txResult.nextUsed);
      setMessageInput('');
    } catch (error: any) {
      if (error?.message === 'LIMIT_REACHED') {
        setSendError('Bugunku mesaj hakkiniz bitti. Limit gece yarisi yenilenir.');
      } else if (error?.message === 'RECEIVER_ONLY_ADMIN') {
        setSendError('Bu kullanici sadece yoneticilerden mesaj kabul ediyor.');
      } else {
        setSendError('Mesaj gonderilirken bir hata olustu. Lutfen tekrar deneyin.');
      }
    } finally {
      setSending(false);
    }
  };

  const canSendToSelected = !!selectedPeerUid && (!selectedPeerRestricted || isAdminUser);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[130] bg-black/65 backdrop-blur-sm flex items-center justify-center p-1.5 md:p-5" onClick={onClose}>
      <div
        className="w-full max-w-6xl h-[94vh] md:h-[88vh] bg-gradient-to-b from-slate-800 to-slate-900 border border-slate-600/50 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 md:px-5 py-2.5 md:py-3 border-b border-slate-700/60 bg-slate-900/45 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 md:p-2 rounded-xl border border-cyan-700/40 bg-cyan-900/25">
              <MessageCircle size={18} className="text-cyan-300" />
            </div>
            <div>
              <h3 className="text-sm md:text-base font-bold text-white">Kullanicilar Arasi Mesajlasma</h3>
              <p className="hidden md:block text-[11px] text-slate-400">Gunluk mesaj hakki ve alici tercihlerine gore calisir.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors"
            title="Kapat"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-2.5 md:px-5 py-2 border-b border-slate-700/40 bg-slate-900/30 flex items-center gap-1.5 overflow-x-auto">
          <div className={`shrink-0 rounded-md border px-2 py-1 flex items-center gap-1 ${messageLimitReached ? 'bg-red-950/30 border-red-800/45 text-red-300' : 'bg-emerald-950/20 border-emerald-800/45 text-emerald-300'}`}>
            {isAdminUser ? <Shield size={11} /> : <MessageCircle size={11} />}
            <span className="text-[10px] font-bold">
              {isAdminUser ? 'Sinirsiz' : `${messageLimitRemaining}/${messageLimitTotal}`}
            </span>
          </div>

          {!isAdminUser && (
            <div className="md:hidden shrink-0 rounded-md border border-slate-700/50 bg-slate-800/70 text-slate-300 px-2 py-1 text-[10px] font-semibold">
              {messageResetCountdown || '--'}
            </div>
          )}

          <button
            onClick={handleToggleReceiveMode}
            disabled={preferenceSaving}
            className={`shrink-0 px-2 py-1 rounded-md border text-[10px] md:text-xs font-bold transition-colors flex items-center gap-1 ${
              receiveOnlyFromAdmin
                ? 'bg-amber-950/35 border-amber-800/45 text-amber-300 hover:bg-amber-900/35'
                : 'bg-slate-800/70 border-slate-700/50 text-slate-300 hover:bg-slate-700/70'
            } disabled:opacity-60`}
          >
            {receiveOnlyFromAdmin ? <Shield size={11} /> : <User size={11} />}
            {receiveOnlyFromAdmin ? 'Yonetici' : 'Herkes'}
          </button>

          <button
            onClick={() => setMobilePanel(prev => prev === 'list' ? 'chat' : 'list')}
            className="md:hidden shrink-0 px-2 py-1 rounded-md border border-slate-700/50 bg-slate-800/70 text-slate-200 text-[10px] font-bold flex items-center gap-1"
          >
            {mobilePanel === 'list' ? <MessageCircle size={11} /> : <Users size={11} />}
            {mobilePanel === 'list' ? 'Sohbet' : 'Kisiler'}
          </button>

          {selectedPeer && mobilePanel === 'chat' && (
            <div className="md:hidden shrink-0 max-w-[40vw] truncate rounded-md border border-slate-700/50 bg-slate-800/70 px-2 py-1 text-[10px] text-slate-300 flex items-center gap-1">
              <User size={11} className="shrink-0" />
              <span className="truncate">{selectedPeer.label}</span>
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 flex md:flex-row">
          <div className={`${mobilePanel === 'list' ? 'flex' : 'hidden'} md:flex w-full md:w-[300px] border-b md:border-b-0 md:border-r border-slate-700/50 bg-slate-900/30 flex-col min-h-0`}>
            <div className="p-2.5 border-b border-slate-700/50">
              <div className="flex items-center gap-2 bg-slate-800/65 border border-slate-700/60 rounded-lg px-2.5 py-2">
                <Search size={14} className="text-slate-500 shrink-0" />
                <input
                  type="text"
                  value={recipientSearch}
                  onChange={(e) => setRecipientSearch(e.target.value)}
                  placeholder="Email veya ad ara (min 4)"
                  className="flex-1 bg-transparent text-xs text-slate-200 outline-none placeholder-slate-500"
                />
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-1.5 md:p-2 space-y-1 md:space-y-1.5">
              {loadingRecipients && (
                <div className="text-[11px] text-slate-500 px-2 py-1">Kullanicilar yukleniyor...</div>
              )}

              {!loadingRecipients && hasShortSearchText && (
                <div className="text-[11px] text-slate-500 px-2 py-1">En az 4 karakter yazin.</div>
              )}

              {!loadingRecipients && !hasShortSearchText && filteredRecipients.length === 0 && (
                <div className="text-[11px] text-slate-500 px-2 py-1">Mesajlasilacak kullanici bulunamadi.</div>
              )}

              {filteredRecipients.map(option => {
                const conversation = conversationMap.get(option.uid);
                const isActive = selectedPeerUid === option.uid;
                const lastText = conversation?.lastText || 'Henuz mesaj yok.';
                const lastTime = conversation?.lastAt
                  ? new Date(conversation.lastAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
                  : '';
                const lastFromMe = conversation?.lastSenderUid === currentUserUid;

                return (
                  <button
                    key={option.uid}
                    onClick={() => { setSelectedPeerUid(option.uid); setSendError(''); setMobilePanel('chat'); }}
                    className={`w-full text-left rounded-md md:rounded-lg border px-2 py-1.5 md:px-2.5 md:py-2 transition-colors ${
                      isActive
                        ? 'bg-cyan-900/30 border-cyan-700/45'
                        : 'bg-slate-800/50 border-slate-700/45 hover:bg-slate-700/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className={`text-[11px] md:text-xs font-semibold truncate ${isActive ? 'text-cyan-200' : 'text-slate-200'}`}>{option.label}</span>
                      {lastTime && <span className="text-[9px] md:text-[10px] text-slate-500">{lastTime}</span>}
                    </div>
                    {option.email && (
                      <p className="text-[9px] text-cyan-300/70 truncate mt-0.5">{option.email}</p>
                    )}
                    <p className="text-[9px] md:text-[10px] text-slate-500 truncate mt-0 md:mt-0.5">
                      {conversation ? `${lastFromMe ? 'Sen: ' : ''}${lastText}` : 'Mesajlasma baslat'}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className={`${mobilePanel === 'chat' ? 'flex' : 'hidden'} md:flex flex-1 min-h-0 flex-col`}>
            {!selectedPeerUid ? (
              <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
                Mesajlasmak icin bir kullanici secin.
              </div>
            ) : (
              <>
                <div className="px-3 md:px-4 py-2 border-b border-slate-700/50 bg-slate-900/25">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">{selectedPeer?.label || selectedPeerUid}</p>
                      {selectedPeer?.email ? (
                        <p className="text-[10px] text-cyan-300/70 truncate">{selectedPeer.email}</p>
                      ) : (
                        <p className="hidden md:block text-[11px] text-slate-500 font-mono">{selectedPeerUid}</p>
                      )}
                    </div>
                    <button
                      onClick={() => setMobilePanel('list')}
                      className="md:hidden shrink-0 px-2.5 py-1 rounded-md border border-slate-700/50 bg-slate-800/80 text-[10px] text-slate-200 font-bold"
                    >
                      Kisiler
                    </button>
                  </div>
                  {selectedPeerRestricted && (
                    <div className={`mt-2 px-2 py-1 rounded-md border text-[10px] font-bold flex items-center gap-1 w-fit ${
                      isAdminUser
                        ? 'bg-amber-950/30 border-amber-800/45 text-amber-300'
                        : 'bg-red-950/30 border-red-800/45 text-red-300'
                    }`}>
                      {isAdminUser ? <Shield size={12} /> : <Lock size={12} />}
                      {isAdminUser ? 'Sadece yoneticiye acik (gonderebilirsin)' : 'Sadece yoneticiden mesaj aliyor'}
                    </div>
                  )}
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto p-2.5 md:p-4 space-y-2 bg-slate-900/20">
                  {messages.length === 0 && (
                    <div className="text-[12px] text-slate-500 text-center py-6">
                      Bu gorusmede henuz mesaj yok.
                    </div>
                  )}

                  {messages.map(msg => {
                    const isMine = msg.senderUid === currentUserUid;
                    return (
                      <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[90%] md:max-w-[70%] rounded-xl border px-2.5 md:px-3 py-1.5 md:py-2 ${
                          isMine
                            ? 'bg-cyan-900/30 border-cyan-700/45 text-cyan-50'
                            : 'bg-slate-800/70 border-slate-700/50 text-slate-100'
                        }`}>
                          <p className="text-[13px] md:text-sm whitespace-pre-wrap break-words">{msg.text}</p>
                          <p className="text-[10px] mt-1 text-right text-slate-400">
                            {new Date(msg.createdAt).toLocaleString('tr-TR')}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>

                <div className="border-t border-slate-700/50 p-2.5 md:p-3 bg-slate-900/35">
                  {sendError && (
                    <div className="mb-2 rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-[11px] text-red-300 flex items-start gap-1.5">
                      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                      <span>{sendError}</span>
                    </div>
                  )}

                  <div className="flex items-end gap-1.5 md:gap-2">
                    <textarea
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      placeholder={canSendToSelected ? 'Mesajini yaz...' : 'Bu kullaniciya mesaj gonderemezsin'}
                      className="flex-1 min-h-[40px] max-h-28 resize-y bg-slate-950/80 border border-slate-700/60 rounded-lg px-2.5 py-2 text-[13px] md:text-sm text-slate-200 outline-none focus:border-cyan-500/50 placeholder-slate-600"
                      disabled={!canSendToSelected || sending}
                      maxLength={1200}
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={!canSendToSelected || sending || !messageInput.trim()}
                      className="h-[40px] md:h-[44px] px-3 md:px-3.5 rounded-lg border border-cyan-700/45 bg-cyan-800/80 text-cyan-50 hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 text-[11px] md:text-xs font-bold"
                    >
                      <Send size={13} />
                      {sending ? 'Gonderiliyor' : 'Gonder'}
                    </button>
                  </div>
                  <div className="mt-1 text-[10px] text-slate-500 flex justify-between">
                    <span>Maksimum 1200 karakter</span>
                    <span>{messageInput.length}/1200</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
