import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Container, SlotData, ItemData } from '../types';
import { SlotItem } from './SlotItem';
import { ArrowLeft, ArrowRight, Maximize2, Minimize2, CheckSquare, Copy, X, Check } from 'lucide-react';
import { getContainerGridDimensions, getContainerSlotPosition } from '../containerLayout';

const resolveTalismanTier = (item: Pick<ItemData, 'talismanTier' | 'enchantment2'>): '-' | 'I' | 'II' | 'III' => {
  const direct = String(item.talismanTier || '').trim().toUpperCase();
  if (direct === '-') return '-';
  if (direct === 'I' || direct === 'II' || direct === 'III') return direct;
  const legacy = String(item.enchantment2 || '').trim().toUpperCase();
  if (legacy === '-') return '-';
  if (legacy === 'I' || legacy === 'II' || legacy === 'III') return legacy;
  return '-';
};

const resolveTalismanColor = (item: Pick<ItemData, 'enchantment2'>): 'Mavi' | 'Kırmızı' => {
  const text = String(item.enchantment2 || '').trim().toLocaleLowerCase('tr');
  if (text.includes('kırmızı') || text.includes('kirmizi')) return 'Kırmızı';
  return 'Mavi';
};

// Hook for horizontal swipe detection on a given element ref
const useSwipeNavigation = (
  ref: React.RefObject<HTMLElement | null>,
  onSwipeLeft?: () => void,
  onSwipeRight?: () => void,
) => {
  const swipeInfo = useRef({ startX: 0, startY: 0, startAt: 0, swiping: false });
  const SWIPE_THRESHOLD = 60; // minimum px for a valid swipe
  const MAX_VERTICAL = 40; // max vertical drift to still count as horizontal swipe
  const MAX_DURATION = 450; // ignore slow drags/long-press gestures

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      swipeInfo.current = { startX: t.clientX, startY: t.clientY, startAt: Date.now(), swiping: true };
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!swipeInfo.current.swiping) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - swipeInfo.current.startX;
      const dy = Math.abs(t.clientY - swipeInfo.current.startY);
      const duration = Date.now() - swipeInfo.current.startAt;
      swipeInfo.current.swiping = false;

      if (duration > MAX_DURATION) return; // likely long press / drag
      if (dy > MAX_VERTICAL) return; // too vertical
      if (Math.abs(dx) < SWIPE_THRESHOLD) return; // too short

      if (dx < 0) {
        // Swiped left → next
        onSwipeLeft?.();
      } else {
        // Swiped right → prev
        onSwipeRight?.();
      }
    };

    const onTouchCancel = () => {
      swipeInfo.current.swiping = false;
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchCancel, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchCancel);
    };
  }, [ref, onSwipeLeft, onSwipeRight]);
};

interface ContainerGridProps {
  container: Container;
  onSlotClick: (containerId: string, slotId: number) => void;
  onSlotHover: (item: ItemData | null, e: React.MouseEvent) => void;
  onMoveItem: (containerId: string, fromSlotId: number, toSlotId: number) => void;
  searchQuery: string;
  categoryFilter?: 'All' | string;
  onNext?: () => void;
  onPrev?: () => void;
  talismanDuplicates?: Map<string, { count: number; color: string }>;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  hasClipboard?: boolean;
  multiSelectMode?: boolean;
  selectedSlotIds?: Set<number>;
  onToggleMultiSelect?: () => void;
  onToggleSlotSelection?: (slotId: number) => void;
  onBulkCopy?: () => void;
  onCancelSelection?: () => void;
}

export const ContainerGrid: React.FC<ContainerGridProps> = ({ container, onSlotClick, onSlotHover, onMoveItem, searchQuery, categoryFilter = 'All', onNext, onPrev, talismanDuplicates, isFullscreen = false, onToggleFullscreen, hasClipboard = false, multiSelectMode = false, selectedSlotIds, onToggleMultiSelect, onToggleSlotSelection, onBulkCopy, onCancelSelection }) => {
  const { cols: gridCols, rows: gridRows } = getContainerGridDimensions(container);
  const gridStyle = {
    gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${gridRows}, minmax(0, 1fr))`,
  };

  // Touch drag visual state (for floating item indicator)
  const [dragVisual, setDragVisual] = useState<{
    x: number; y: number; item: ItemData; sourceSlotId: number;
  } | null>(null);

  // Shift+Click range selection tracking
  const lastSelectedSlotId = useRef<number | null>(null);

  // Refs
  const rootRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPress = useRef(false);
  const SCROLL_DETECT_MS = 400; // hold time to activate drag mode
  const DRAG_START_THRESHOLD = 5; // px — movement to start showing drag visual after long press
  const touchInfo = useRef({
    startX: 0, startY: 0, slotId: -1, item: null as ItemData | null,
    longPressDetected: false, dragConfirmed: false,
  });

  // Stable callback refs for swipe hook
  const stableOnNext = useCallback(() => onNext?.(), [onNext]);
  const stableOnPrev = useCallback(() => onPrev?.(), [onPrev]);

  // Mobile swipe across the whole container area
  useSwipeNavigation(rootRef, stableOnNext, stableOnPrev);

  const clearTimer = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };

  // Non-passive touchmove on grid to allow preventDefault during drag
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;

    const handleMove = (e: TouchEvent) => {
      // In multi-select mode, no drag behavior
      if (multiSelectMode) return;

      if (!touchInfo.current.longPressDetected) {
        // Phase 1 (scroll detection): if finger moved too much, it's a scroll
        const touch = e.touches[0];
        const dx = Math.abs(touch.clientX - touchInfo.current.startX);
        const dy = Math.abs(touch.clientY - touchInfo.current.startY);
        if (dx > 10 || dy > 10) {
          clearTimer();
        }
        return;
      }

      // Long press active — prevent scroll, handle drag
      e.preventDefault();
      const touch = e.touches[0];

      if (touchInfo.current.dragConfirmed) {
        // Already in drag mode — update floating item position
        setDragVisual(prev => prev ? { ...prev, x: touch.clientX, y: touch.clientY } : null);
      } else {
        const dx = Math.abs(touch.clientX - touchInfo.current.startX);
        const dy = Math.abs(touch.clientY - touchInfo.current.startY);
        const dist = Math.max(dx, dy);

        // Movement > threshold → confirm drag, show visual
        if (dist > DRAG_START_THRESHOLD) {
          touchInfo.current.dragConfirmed = true;
          setDragVisual({
            sourceSlotId: touchInfo.current.slotId,
            item: touchInfo.current.item!,
            x: touch.clientX,
            y: touch.clientY,
          });
        }
      }
    };

    el.addEventListener('touchmove', handleMove, { passive: false });
    return () => el.removeEventListener('touchmove', handleMove);
  }, [multiSelectMode]);

  const handleTouchStart = (slot: SlotData, e: React.TouchEvent) => {
    // In multi-select mode, don't start drag
    if (multiSelectMode) return;
    if (!slot.item) return;
    isLongPress.current = false;
    const touch = e.touches[0];

    touchInfo.current = {
      startX: touch.clientX, startY: touch.clientY,
      slotId: slot.id, item: slot.item,
      longPressDetected: false, dragConfirmed: false,
    };

    // After 400ms hold without scroll → activate drag mode
    longPressTimer.current = setTimeout(() => {
      touchInfo.current.longPressDetected = true;
      try { navigator.vibrate?.(30); } catch {}
    }, SCROLL_DETECT_MS);
  };

  const resetTouchState = () => {
    clearTimer();
    setDragVisual(null);
    touchInfo.current = {
      startX: 0, startY: 0, slotId: -1, item: null,
      longPressDetected: false, dragConfirmed: false,
    };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (multiSelectMode) return;
    clearTimer();

    if (touchInfo.current.longPressDetected) {
      isLongPress.current = true; // prevent the following click

      if (touchInfo.current.dragConfirmed) {
        // Drag threshold exceeded → find drop target
        const touch = e.changedTouches[0];
        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        const slotEl = el?.closest('[data-slot-id]') as HTMLElement | null;
        if (slotEl && touchInfo.current.slotId >= 0) {
          const targetId = parseInt(slotEl.dataset.slotId || '', 10);
          if (!isNaN(targetId) && targetId !== touchInfo.current.slotId) {
            onMoveItem(container.id, touchInfo.current.slotId, targetId);
          }
        }
      }
      // If lifted after long press without moving: nothing happens (just vibration feedback was given)
    }

    resetTouchState();
  };

  const handleTouchCancel = () => {
    resetTouchState();
  };

  const handleSlotClick = (containerId: string, slotId: number, e: React.MouseEvent) => {
    if (isLongPress.current) {
      isLongPress.current = false;
      return;
    }

    // Shift+Click range selection in multi-select mode
    if (multiSelectMode && e.shiftKey && onToggleSlotSelection && lastSelectedSlotId.current !== null) {
      const start = Math.min(lastSelectedSlotId.current, slotId);
      const end = Math.max(lastSelectedSlotId.current, slotId);
      for (let i = start; i <= end; i++) {
        const slotItem = container.slots[i]?.item;
        if (slotItem && !selectedSlotIds?.has(i)) {
          onToggleSlotSelection(i);
        }
      }
      return;
    }

    // Track last selected slot for shift+click
    if (multiSelectMode && container.slots[slotId]?.item) {
      lastSelectedSlotId.current = slotId;
    }

    onSlotClick(containerId, slotId);
  };

  // Reset last selected when leaving multi-select
  useEffect(() => {
    if (!multiSelectMode) {
      lastSelectedSlotId.current = null;
    }
  }, [multiSelectMode]);

  const isMatchingSearch = (slot: SlotData) => {
    if (!slot.item || !searchQuery) return false;
    const q = searchQuery.toLowerCase();
    return (
      (slot.item.enchantment1 || '').toLowerCase().includes(q) ||
      (slot.item.enchantment2 || '').toLowerCase().includes(q) ||
      (slot.item.talismanTier || '').toLowerCase().includes(q) ||
      slot.item.category.toLowerCase().includes(q)
    );
  };

  // --- Desktop Drag and Drop ---
  const handleDragStart = (e: React.DragEvent, slotId: number) => {
    if (multiSelectMode) { e.preventDefault(); return; }
    e.dataTransfer.setData("text/plain", slotId.toString());
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (multiSelectMode) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetSlotId: number) => {
    if (multiSelectMode) return;
    e.preventDefault();
    const sourceSlotIdStr = e.dataTransfer.getData("text/plain");
    if (!sourceSlotIdStr) return;
    const sourceSlotId = parseInt(sourceSlotIdStr, 10);
    if (!isNaN(sourceSlotId) && sourceSlotId !== targetSlotId) {
      onMoveItem(container.id, sourceSlotId, targetSlotId);
    }
  };

  const selectedCount = selectedSlotIds?.size ?? 0;

  return (
    <div ref={rootRef} className="flex flex-col h-full min-h-0 w-full">
      {/* Container Header — also a mobile swipe zone */}
      <div
        className="bg-gradient-to-b from-slate-800 to-slate-900 border-t-2 border-l-2 border-r-2 border-amber-900/40 p-1.5 px-3 flex justify-between items-center rounded-t-md select-none shrink-0 shadow-lg"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs md:text-sm font-bold text-amber-500 ml-1 md:ml-2 uppercase tracking-wider drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">{container.name}</span>
          <div className="text-[10px] text-amber-400/80 bg-black/40 backdrop-blur-sm px-2 py-0.5 rounded-full border border-amber-900/30">
            {container.slots.filter(s => s.item).length} / {container.slots.length}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {onToggleMultiSelect && (
            <button
              onClick={onToggleMultiSelect}
              className={`group flex items-center gap-1 px-2.5 py-1 rounded transition-all text-xs font-bold ${
                multiSelectMode
                  ? 'text-green-200 bg-green-700 hover:bg-green-600'
                  : 'text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600'
              }`}
              title={multiSelectMode ? 'Seçim Modunu Kapat' : 'Toplu Seç'}
            >
              <CheckSquare size={14} />
              <span className="hidden sm:inline">{multiSelectMode ? 'SEÇİM' : 'TOPLU SEÇ'}</span>
            </button>
          )}
          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              className="group flex items-center gap-1 text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 px-2.5 py-1 rounded transition-all text-xs font-bold"
              title={isFullscreen ? 'Tam Ekrandan Cik' : 'Tam Ekran'}
            >
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              <span className="hidden sm:inline">{isFullscreen ? 'CIK' : 'TAM EKRAN'}</span>
            </button>
          )}
          {onPrev && (
            <button
              onClick={onPrev}
              className="group hidden md:flex items-center gap-1 text-slate-400 hover:text-white bg-slate-700 hover:bg-blue-600 px-3 py-1 rounded transition-all text-xs font-bold"
              title="Önceki Depo"
            >
              <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
              <span>ÖNCEKİ</span>
            </button>
          )}
          {onNext && (
            <button
              onClick={onNext}
              className="group hidden md:flex items-center gap-1 text-slate-400 hover:text-white bg-slate-700 hover:bg-blue-600 px-3 py-1 rounded transition-all text-xs font-bold"
              title="Sonraki Depo"
            >
              <span>SONRAKİ</span>
              <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
            </button>
          )}
        </div>
      </div>

      {/* Grid Area */}
      <div
        ref={gridRef}
        className="relative rpg-container-bg border-x-2 md:border-b-2 border-amber-900/40 md:rounded-b-md p-0.5 md:p-2 shadow-[inset_0_2px_8px_rgba(0,0,0,0.6)] flex-1 flex flex-col min-h-0 overflow-hidden"
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
      >
        <div className={`grid gap-0.5 md:gap-1.5 w-full h-full ${multiSelectMode && selectedCount > 0 ? 'pb-8' : ''}`} style={gridStyle}>
          {container.slots.map((slot) => {
            const highlight = isMatchingSearch(slot);
            const isCategoryDimmed = !!slot.item && categoryFilter !== 'All' && slot.item.category !== categoryFilter;
            const isBeingDragged = dragVisual?.sourceSlotId === slot.id;
            const slotPosition = getContainerSlotPosition(container, slot.id);
            const talismanKey = slot.item?.category === 'Tılsım' && slot.item.enchantment1?.trim()
              ? `${slot.item.enchantment1.toLocaleLowerCase('tr')}|${resolveTalismanColor(slot.item).toLocaleLowerCase('tr')}|${resolveTalismanTier(slot.item).toLocaleLowerCase('tr')}|${slot.item.heroClass}`
              : null;
            const glowInfo = talismanKey ? talismanDuplicates?.get(talismanKey) : undefined;
            const isSelected = multiSelectMode && selectedSlotIds?.has(slot.id);
            return (
              <div
                key={slot.id}
                data-slot-id={slot.id}
                draggable={!multiSelectMode && !!slot.item}
                onDragStart={(e) => slot.item && handleDragStart(e, slot.id)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, slot.id)}
                onClick={(e) => handleSlotClick(container.id, slot.id, e)}
                onMouseEnter={(e) => onSlotHover(slot.item, e)}
                onMouseLeave={(e) => onSlotHover(null, e)}
                onTouchStart={(e) => handleTouchStart(slot, e)}
                style={slotPosition ? { gridColumnStart: slotPosition.col, gridRowStart: slotPosition.row } : undefined}
                className={`
                  relative bg-black/20 border border-slate-900/40 rounded-md
                  transition-colors group
                  ${multiSelectMode
                    ? (slot.item
                        ? (isSelected ? 'ring-2 ring-green-400 bg-green-950/30 cursor-pointer' : 'cursor-pointer hover:border-green-500/50 hover:bg-slate-800/20')
                        : '')
                    : (slot.item ? 'cursor-grab active:cursor-grabbing hover:border-yellow-500/50 hover:bg-slate-800/20' : hasClipboard ? 'cursor-pointer ring-2 ring-blue-400/40 hover:ring-blue-400/70 hover:bg-blue-950/30' : 'hover:bg-slate-800/20')
                  }
                  ${isCategoryDimmed ? 'opacity-25 grayscale-[0.8] saturate-50' : ''}
                  ${isBeingDragged ? 'opacity-30 border-yellow-500 border-2' : ''}
                `}
              >
                {slot.item && <SlotItem item={slot.item} highlight={highlight} talismanGlowColor={glowInfo?.color} />}
                {isSelected && (
                  <div className="absolute top-0 right-0 bg-green-500 rounded-bl-sm p-px z-10">
                    <Check size={10} className="text-white" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Multi-select action bar */}
        {multiSelectMode && selectedCount > 0 && (
          <div className="absolute bottom-0 left-0 right-0 bg-slate-800/95 border-t border-slate-600 px-3 py-1.5 flex items-center justify-between backdrop-blur-sm z-20">
            <span className="text-xs text-green-300 font-bold">{selectedCount} eşya seçildi</span>
            <div className="flex items-center gap-2">
              <button
                onClick={onBulkCopy}
                className="flex items-center gap-1 bg-green-700 hover:bg-green-600 text-white text-xs font-bold px-3 py-1 rounded transition-colors"
              >
                <Copy size={12} />
                Kopyala
              </button>
              <button
                onClick={onCancelSelection}
                className="flex items-center gap-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-bold px-3 py-1 rounded transition-colors"
              >
                <X size={12} />
                İptal
              </button>
            </div>
          </div>
        )}

        {/* Floating drag indicator (mobile) */}
        {dragVisual && (
          <div
            className="fixed z-[100] pointer-events-none"
            style={{
              left: dragVisual.x - 30,
              top: dragVisual.y - 50,
              width: 60,
              height: 50,
            }}
          >
            <div className="w-full h-full border-2 border-yellow-400 rounded-lg shadow-[0_0_20px_rgba(234,179,8,0.5)] bg-slate-900/90">
              <SlotItem item={dragVisual.item} />
            </div>
          </div>
        )}
      </div>

      {/* Footer swipe zone (mobile) — also shows swipe hint */}
      <div
        className="md:hidden bg-slate-800 border-b-2 border-x-2 border-slate-600 rounded-b-md select-none shrink-0 flex items-center justify-center py-1.5 gap-2"
      >
        <ArrowLeft size={12} className="text-slate-500" />
        <span className="text-[10px] text-slate-500 tracking-wide">kaydır</span>
        <ArrowRight size={12} className="text-slate-500" />
      </div>

      {/* Desktop: keep rounded bottom on grid */}
      <div className="hidden md:block h-0">
        {/* spacer — grid area already has rounded-b via md styles */}
      </div>
    </div>
  );
};
