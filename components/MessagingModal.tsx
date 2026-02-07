import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Lock, MessageCircle, Search, Send, Shield, Trash2, User, X } from 'lucide-react';
import { db } from '../firebase';
import { collection, deleteDoc, doc, documentId, endAt, getDoc, getDocs, limit, onSnapshot, orderBy, query, runTransaction, setDoc, startAt, where, writeBatch } from 'firebase/firestore';
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
  const [searchResults, setSearchResults] = useState<RecipientOption[]>([]);
  const [recipientSearch, setRecipientSearch] = useState('');
  const [selectedPeerUid, setSelectedPeerUid] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [searchingRecipients, setSearchingRecipients] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
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

  const conversationRecipients = useMemo<RecipientOption[]>(
    () => conversations.map(conv => ({
      uid: conv.peerUid,
      username: conv.peerLabel,
      label: (conv.peerLabel && conv.peerLabel.trim()) || conv.peerUid,
    })),
    [conversations]
  );

  const allRecipients = useMemo<RecipientOption[]>(() => {
    const map = new Map<string, RecipientOption>();
    conversationRecipients.forEach(option => map.set(option.uid, option));
    searchResults.forEach(option => {
      if (!map.has(option.uid)) {
        map.set(option.uid, option);
      }
    });
    return Array.from(map.values())
      .filter(option => option.uid !== currentUserUid);
  }, [conversationRecipients, currentUserUid, searchResults]);

  const filteredRecipients = useMemo(() => {
    const queryText = recipientSearch.trim().toLocaleLowerCase('tr');
    if (!queryText) return allRecipients;
    return allRecipients.filter(option =>
      option.label.toLocaleLowerCase('tr').includes(queryText) ||
      option.uid.toLocaleLowerCase('tr').includes(queryText) ||
      (option.username || '').toLocaleLowerCase('tr').includes(queryText) ||
      (option.email || '').toLocaleLowerCase('tr').includes(queryText)
    );
  }, [allRecipients, recipientSearch]);

  const hasShortSearchText = recipientSearch.trim().length > 0 && recipientSearch.trim().length < 3;

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
      setSearchResults([]);
      setRecipientSearch('');
      setSelectedPeerUid(null);
      setConversations([]);
      setMessages([]);
      setMessageInput('');
      setSearchingRecipients(false);
      setDeletingMessageId(null);
      setSendError('');
      setSelectedPeerRestricted(false);
      setMessageResetCountdown('');
      setMobilePanel('list');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !currentUserUid) return;
    const queryText = recipientSearch.trim().toLocaleLowerCase('tr');
    if (queryText.length < 3) {
      setSearchResults([]);
      setSearchingRecipients(false);
      return;
    }

    let isCancelled = false;
    const searchRecipients = async () => {
      setSearchingRecipients(true);
      try {
        const usernamesRef = collection(db, 'usernames');
        const usernamesQuery = query(
          usernamesRef,
          orderBy(documentId()),
          startAt(queryText),
          endAt(`${queryText}\uf8ff`),
          limit(20)
        );
        const profilesQuery = query(
          collection(db, 'publicProfiles'),
          orderBy('emailLower'),
          startAt(queryText),
          endAt(`${queryText}\uf8ff`),
          limit(20)
        );
        const [usernamesSnap, profilesSnap] = await Promise.all([
          getDocs(usernamesQuery),
          getDocs(profilesQuery),
        ]);

        const nextMap = new Map<string, RecipientOption>();
        usernamesSnap.forEach(docSnap => {
          const data = docSnap.data() as { uid?: string; displayName?: string };
          const uid = typeof data.uid === 'string' ? data.uid : '';
          if (!uid || uid === currentUserUid) return;
          const displayName = (typeof data.displayName === 'string' && data.displayName.trim())
            ? data.displayName.trim()
            : docSnap.id;
          nextMap.set(uid, {
            uid,
            username: displayName,
            label: displayName,
          });
        });

        profilesSnap.forEach(docSnap => {
          const data = docSnap.data() as { uid?: string; username?: string; emailLower?: string };
          const uid = typeof data.uid === 'string' ? data.uid : docSnap.id;
          if (!uid || uid === currentUserUid) return;
          const existing = nextMap.get(uid);
          const username = (typeof data.username === 'string' && data.username.trim())
            ? data.username.trim()
            : (existing?.username || '');
          const email = (typeof data.emailLower === 'string' && data.emailLower.trim())
            ? data.emailLower.trim().toLowerCase()
            : '';

          nextMap.set(uid, {
            uid,
            username: username || undefined,
            email: email || undefined,
            label: existing?.label || username || email || uid,
          });
        });

        if (!isCancelled) {
          setSearchResults(Array.from(nextMap.values()));
        }
      } catch {
        if (!isCancelled) {
          setSearchResults([]);
        }
      } finally {
        if (!isCancelled) {
          setSearchingRecipients(false);
        }
      }
    };

    searchRecipients();
    return () => { isCancelled = true; };
  }, [currentUserUid, isOpen, recipientSearch]);

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

        const fallbackLabel = peerUid;
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
  }, [currentUserUid, isOpen]);

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

  const handleDeleteMessage = async (messageId: string) => {
    if (!currentUserUid || deletingMessageId) return;
    const confirmed = window.confirm('Bu mesaji silmek istediginize emin misiniz?');
    if (!confirmed) return;

    setDeletingMessageId(messageId);
    setSendError('');
    try {
      await deleteDoc(doc(db, 'messages', messageId));
    } catch {
      setSendError('Mesaj silinirken bir hata olustu. Lutfen tekrar deneyin.');
    } finally {
      setDeletingMessageId(null);
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
            {mobilePanel === 'list' ? <MessageCircle size={11} /> : <User size={11} />}
            {mobilePanel === 'list' ? 'Mesaj' : 'Liste'}
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
                  placeholder="Kullanici adi veya e-posta ara (min 3)"
                  className="flex-1 bg-transparent text-xs text-slate-200 outline-none placeholder-slate-500"
                />
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-1.5 md:p-2 space-y-1 md:space-y-1.5">
              {searchingRecipients && recipientSearch.trim().length >= 3 && (
                <div className="text-[11px] text-slate-500 px-2 py-1">Kullanicilar araniyor...</div>
              )}

              {recipientSearch.trim().length === 0 && conversationRecipients.length === 0 && (
                <div className="text-[11px] text-slate-500 px-2 py-1">Henuz mesajlasma yok. Kullanici adi veya e-posta aratip mesaj gonderebilirsiniz.</div>
              )}

              {hasShortSearchText && conversationRecipients.length === 0 && (
                <div className="text-[11px] text-slate-500 px-2 py-1">Yeni kisi aramak icin en az 3 karakter yazin.</div>
              )}

              {!searchingRecipients && !hasShortSearchText && recipientSearch.trim().length > 0 && filteredRecipients.length === 0 && (
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
                      {conversation ? `${lastFromMe ? 'Sen: ' : ''}${lastText}` : 'Arama sonucu'}
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
                      Sohbetler
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
                    const canDelete = isAdminUser || msg.senderUid === currentUserUid || msg.receiverUid === currentUserUid;
                    return (
                      <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[90%] md:max-w-[70%] rounded-xl border px-2.5 md:px-3 py-1.5 md:py-2 ${
                          isMine
                            ? 'bg-cyan-900/30 border-cyan-700/45 text-cyan-50'
                            : 'bg-slate-800/70 border-slate-700/50 text-slate-100'
                        }`}>
                          <p className="text-[13px] md:text-sm whitespace-pre-wrap break-words">{msg.text}</p>
                          <div className="mt-1 flex items-center justify-end gap-1.5">
                            <p className="text-[10px] text-slate-400">
                              {new Date(msg.createdAt).toLocaleString('tr-TR')}
                            </p>
                            {canDelete && (
                              <button
                                onClick={() => handleDeleteMessage(msg.id)}
                                disabled={deletingMessageId === msg.id}
                                title="Mesaji sil"
                                className="p-1 rounded text-slate-400 hover:text-red-300 hover:bg-red-950/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                <Trash2 size={11} />
                              </button>
                            )}
                          </div>
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
