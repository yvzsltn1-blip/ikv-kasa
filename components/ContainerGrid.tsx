import React, { useRef, useState, useEffect } from 'react';
import { Container, SlotData, ItemData } from '../types';
import { SlotItem } from './SlotItem';
import { ArrowRight } from 'lucide-react';

interface ContainerGridProps {
  container: Container;
  onSlotClick: (containerId: string, slotId: number) => void;
  onSlotHover: (item: ItemData | null, e: React.MouseEvent) => void;
  onMoveItem: (containerId: string, fromSlotId: number, toSlotId: number) => void;
  searchQuery: string;
  onNext?: () => void;
  talismanDuplicates?: Map<string, { count: number; color: string }>;
}

export const ContainerGrid: React.FC<ContainerGridProps> = ({ container, onSlotClick, onSlotHover, onMoveItem, searchQuery, onNext, talismanDuplicates }) => {
  const isMd = typeof window !== 'undefined' && window.innerWidth >= 768;
  const gridStyle = {
    gridTemplateColumns: `repeat(${container.cols}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${container.rows}, minmax(${isMd ? '72px' : '52px'}, 1fr))`,
  };

  // Touch drag visual state (for floating item indicator)
  const [dragVisual, setDragVisual] = useState<{
    x: number; y: number; item: ItemData; sourceSlotId: number;
  } | null>(null);

  // Refs
  const gridRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPress = useRef(false);
  const SCROLL_DETECT_MS = 400; // hold time to activate drag mode
  const DRAG_START_THRESHOLD = 5; // px — movement to start showing drag visual after long press
  const touchInfo = useRef({
    startX: 0, startY: 0, slotId: -1, item: null as ItemData | null,
    longPressDetected: false, dragConfirmed: false,
  });

  const clearTimer = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };

  // Non-passive touchmove on grid to allow preventDefault during drag
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;

    const handleMove = (e: TouchEvent) => {
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
  }, []);

  const handleTouchStart = (slot: SlotData, e: React.TouchEvent) => {
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

  const handleSlotClick = (containerId: string, slotId: number) => {
    if (isLongPress.current) {
      isLongPress.current = false;
      return;
    }
    onSlotClick(containerId, slotId);
  };

  const isMatchingSearch = (slot: SlotData) => {
    if (!slot.item || !searchQuery) return false;
    const q = searchQuery.toLowerCase();
    return (
      (slot.item.enchantment1 || '').toLowerCase().includes(q) ||
      (slot.item.enchantment2 || '').toLowerCase().includes(q) ||
      slot.item.category.toLowerCase().includes(q)
    );
  };

  // --- Desktop Drag and Drop ---
  const handleDragStart = (e: React.DragEvent, slotId: number) => {
    e.dataTransfer.setData("text/plain", slotId.toString());
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetSlotId: number) => {
    e.preventDefault();
    const sourceSlotIdStr = e.dataTransfer.getData("text/plain");
    if (!sourceSlotIdStr) return;
    const sourceSlotId = parseInt(sourceSlotIdStr, 10);
    if (!isNaN(sourceSlotId) && sourceSlotId !== targetSlotId) {
      onMoveItem(container.id, sourceSlotId, targetSlotId);
    }
  };

  return (
    <div className="flex flex-col md:h-full w-full">
      {/* Container Header */}
      <div className="bg-slate-800 border-t-2 border-l-2 border-r-2 border-slate-600 p-1 px-2 flex justify-between items-center rounded-t-md select-none shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs md:text-sm font-bold text-yellow-500 ml-1 md:ml-2 uppercase tracking-wide">{container.name}</span>
          <div className="text-[10px] text-slate-500 bg-black/30 px-2 py-0.5 rounded-full">
            {container.slots.filter(s => s.item).length} / {container.slots.length}
          </div>
        </div>

        {onNext && (
          <button
            onClick={onNext}
            className="group flex items-center gap-1 text-slate-400 hover:text-white bg-slate-700 hover:bg-blue-600 px-3 py-1 rounded transition-all text-xs font-bold"
            title="Sonraki Depo"
          >
            <span>SONRAKİ</span>
            <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
          </button>
        )}
      </div>

      {/* Grid Area */}
      <div
        ref={gridRef}
        className="relative bg-slate-900 border-2 border-slate-600 p-0.5 md:p-1 rounded-b-md shadow-inner metal-pattern md:flex-1 flex flex-col justify-center md:min-h-0 overflow-auto"
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
      >
        <div className="grid gap-0.5 md:gap-1 w-full md:h-full" style={gridStyle}>
          {container.slots.map((slot) => {
            const highlight = isMatchingSearch(slot);
            const isBeingDragged = dragVisual?.sourceSlotId === slot.id;
            const talismanKey = slot.item?.category === 'Tılsım' && slot.item.enchantment1?.trim()
              ? `${slot.item.enchantment1.toLocaleLowerCase('tr')}|${(slot.item.enchantment2 || '').toLocaleLowerCase('tr')}|${slot.item.heroClass}`
              : null;
            const glowInfo = talismanKey ? talismanDuplicates?.get(talismanKey) : undefined;
            return (
              <div
                key={slot.id}
                data-slot-id={slot.id}
                draggable={!!slot.item}
                onDragStart={(e) => slot.item && handleDragStart(e, slot.id)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, slot.id)}
                onClick={() => handleSlotClick(container.id, slot.id)}
                onMouseEnter={(e) => onSlotHover(slot.item, e)}
                onMouseLeave={(e) => onSlotHover(null, e)}
                onTouchStart={(e) => handleTouchStart(slot, e)}
                className={`
                  relative bg-black/40 border border-slate-700/50
                  transition-colors group
                  ${slot.item ? 'cursor-grab active:cursor-grabbing hover:border-yellow-500/50 hover:bg-slate-800' : 'hover:bg-slate-800/50'}
                  ${isBeingDragged ? 'opacity-30 border-yellow-500 border-2' : ''}
                `}
              >
                {slot.item && <SlotItem item={slot.item} highlight={highlight} talismanGlowColor={glowInfo?.color} />}
              </div>
            );
          })}
        </div>

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
    </div>
  );
};
