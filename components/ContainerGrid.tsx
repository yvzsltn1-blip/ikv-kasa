import React from 'react';
import { Container, SlotData, ItemData } from '../types';
import { SlotItem } from './SlotItem';
import { ArrowRight } from 'lucide-react';

interface ContainerGridProps {
  container: Container;
  onSlotClick: (containerId: string, slotId: number) => void;
  onSlotHover: (item: ItemData | null, e: React.MouseEvent) => void;
  onMoveItem: (containerId: string, fromSlotId: number, toSlotId: number) => void; // New prop for DnD
  searchQuery: string;
  onNext?: () => void;
}

export const ContainerGrid: React.FC<ContainerGridProps> = ({ container, onSlotClick, onSlotHover, onMoveItem, searchQuery, onNext }) => {
  // Determine grid template based on rows/cols
  const gridStyle = {
    gridTemplateColumns: `repeat(${container.cols}, minmax(0, 1fr))`,
    // Değişiklik: minmax(0, 1fr) yerine minmax(40px, 1fr) yaptık.
    // Böylece mobilde kutular çok ezilmez, aşağı doğru uzar ve scroll açılır.
    gridTemplateRows: `repeat(${container.rows}, minmax(40px, 1fr))`,
  };

  const isMatchingSearch = (slot: SlotData) => {
    if (!slot.item || !searchQuery) return false;
    const q = searchQuery.toLowerCase();
    return (
      slot.item.enchantment1.toLowerCase().includes(q) ||
      slot.item.enchantment2.toLowerCase().includes(q) ||
      slot.item.category.toLowerCase().includes(q)
    );
  };

  // --- Drag and Drop Handlers ---
  const handleDragStart = (e: React.DragEvent, slotId: number) => {
    // Only allow dragging if there is an item
    e.dataTransfer.setData("text/plain", slotId.toString());
    e.dataTransfer.effectAllowed = "move";
    // Optional: Set a drag image or style
  };

  const handleDragOver = (e: React.DragEvent) => {
    // Prevent default to allow drop
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetSlotId: number) => {
    e.preventDefault();
    const sourceSlotIdStr = e.dataTransfer.getData("text/plain");
    if (!sourceSlotIdStr) return;

    const sourceSlotId = parseInt(sourceSlotIdStr, 10);
    
    // Check if valid number and not dropping on itself
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

      {/* Grid Area - Added flex-col and justify-center to center content if extra height */}
      <div className="relative bg-slate-900 border-2 border-slate-600 p-0.5 md:p-1 rounded-b-md shadow-inner metal-pattern md:flex-1 flex flex-col justify-center md:min-h-0 overflow-auto">
        {/* Added h-full to grid to force it to fill vertical space */}
        <div className="grid gap-0.5 md:gap-1 w-full md:h-full" style={gridStyle}>
          {container.slots.map((slot) => {
            const highlight = isMatchingSearch(slot);
            return (
              <div
                key={slot.id}
                draggable={!!slot.item} // Only draggable if item exists
                onDragStart={(e) => slot.item && handleDragStart(e, slot.id)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, slot.id)}
                onClick={() => onSlotClick(container.id, slot.id)}
                onMouseEnter={(e) => onSlotHover(slot.item, e)}
                onMouseLeave={(e) => onSlotHover(null, e)}
                // Removed fixed aspect ratio (aspect-[2.2/1]) to allow slots to stretch vertically
                className={`
                    relative bg-black/40 border border-slate-700/50 
                    transition-colors group
                    ${slot.item ? 'cursor-grab active:cursor-grabbing hover:border-yellow-500/50 hover:bg-slate-800' : 'hover:bg-slate-800/50'}
                `}
              >
                {slot.item && <SlotItem item={slot.item} highlight={highlight} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};