import { Container, SlotData } from './types';

type SlotPosition = { row: number; col: number };

const BAG_COLS = 4;
const BAG_BASE_ROWS = 6;
const BAG_TOP_COLUMN_HEIGHTS = [3, 4, 2] as const;
const BAG_TOP_ROWS = Math.max(...BAG_TOP_COLUMN_HEIGHTS);
const BAG_BASE_START_ROW = BAG_TOP_ROWS + 1;

export const BAG_GRID_COLS = BAG_COLS;
export const BAG_GRID_ROWS = BAG_BASE_ROWS + BAG_TOP_ROWS;

const BAG_SLOT_LAYOUT: SlotPosition[] = (() => {
  const layout: SlotPosition[] = [];

  // Base 24 slots (4 cols x 6 rows).
  for (let rowOffset = 0; rowOffset < BAG_BASE_ROWS; rowOffset += 1) {
    for (let col = 1; col <= BAG_COLS; col += 1) {
      layout.push({ row: BAG_BASE_START_ROW + rowOffset, col });
    }
  }

  // Extra 9 slots over the first 3 columns: 3 / 4 / 2.
  BAG_TOP_COLUMN_HEIGHTS.forEach((height, index) => {
    const col = index + 1;
    for (let step = 1; step <= height; step += 1) {
      layout.push({ row: BAG_BASE_START_ROW - step, col });
    }
  });

  return layout;
})();

export const BAG_SLOT_COUNT = BAG_SLOT_LAYOUT.length;

const bagPositionToSlotId = new Map<string, number>();
BAG_SLOT_LAYOUT.forEach((position, slotId) => {
  bagPositionToSlotId.set(`${position.row}:${position.col}`, slotId);
});

const normalizeToken = (value: unknown) => (
  String(value ?? '')
    .trim()
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
);

export const isBagContainer = (
  container: Pick<Container, 'id' | 'name'> | null | undefined
): boolean => {
  if (!container) return false;
  const idToken = normalizeToken(container.id);
  const nameToken = normalizeToken(container.name);
  return idToken.includes('bag') || nameToken.includes('canta');
};

export const getContainerGridDimensions = (
  container: Pick<Container, 'id' | 'name' | 'rows' | 'cols'>
) => {
  if (isBagContainer(container)) {
    return { rows: BAG_GRID_ROWS, cols: BAG_GRID_COLS };
  }
  return { rows: container.rows, cols: container.cols };
};

export const getContainerSlotPosition = (
  container: Pick<Container, 'id' | 'name' | 'cols'>,
  slotId: number
): SlotPosition | null => {
  if (!Number.isInteger(slotId) || slotId < 0) return null;

  if (isBagContainer(container)) {
    return BAG_SLOT_LAYOUT[slotId] ?? null;
  }

  const col = (slotId % container.cols) + 1;
  const row = Math.floor(slotId / container.cols) + 1;
  return { row, col };
};

export const getContainerSlotIdFromPosition = (
  container: Pick<Container, 'id' | 'name' | 'rows' | 'cols' | 'slots'>,
  row: number,
  col: number
): number | null => {
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 1 || col < 1) return null;

  if (isBagContainer(container)) {
    return bagPositionToSlotId.get(`${row}:${col}`) ?? null;
  }

  const rowIndex = row - 1;
  const colIndex = col - 1;
  if (rowIndex >= container.rows || colIndex >= container.cols) return null;

  const slotId = (rowIndex * container.cols) + colIndex;
  return slotId >= 0 && slotId < container.slots.length ? slotId : null;
};

export const normalizeBagContainerLayout = (container: Container): Container => {
  const slots: SlotData[] = Array.from({ length: BAG_SLOT_COUNT }, (_, index) => {
    const slot = container.slots[index];
    if (slot && typeof slot === 'object') {
      return { id: index, item: slot.item ?? null };
    }
    return { id: index, item: null };
  });

  return {
    ...container,
    rows: BAG_GRID_ROWS,
    cols: BAG_GRID_COLS,
    slots,
  };
};

