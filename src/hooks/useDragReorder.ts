// src/hooks/useDragReorder.ts
//
// HTML5 native drag-and-drop reorder hook. No external deps.
// Returns props you spread onto each draggable item plus the dragging index.

"use client";

import { useState, useCallback } from "react";

export type DragReorderOptions = {
  itemCount: number;
  onReorder: (fromIndex: number, toIndex: number) => void;
};

export type DragItemProps = {
  draggable: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  "data-drag-index": number;
};

export function useDragReorder({ itemCount, onReorder }: DragReorderOptions) {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  const getItemProps = useCallback(
    (index: number): DragItemProps => ({
      draggable: true,
      "data-drag-index": index,
      onDragStart: (e) => {
        setDraggingIndex(index);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(index));
      },
      onDragOver: (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (dropTargetIndex !== index) setDropTargetIndex(index);
      },
      onDrop: (e) => {
        e.preventDefault();
        const from = draggingIndex;
        if (from === null || from === index) {
          setDraggingIndex(null);
          setDropTargetIndex(null);
          return;
        }
        if (index < 0 || index >= itemCount) return;
        onReorder(from, index);
        setDraggingIndex(null);
        setDropTargetIndex(null);
      },
      onDragEnd: () => {
        setDraggingIndex(null);
        setDropTargetIndex(null);
      },
    }),
    [draggingIndex, dropTargetIndex, itemCount, onReorder],
  );

  return { getItemProps, draggingIndex, dropTargetIndex };
}

/** Pure helper: move array[from] to position `to`. Returns a new array. */
export function reorderArray<T>(arr: T[], from: number, to: number): T[] {
  if (from === to) return arr;
  const out = [...arr];
  const [moved] = out.splice(from, 1);
  out.splice(to, 0, moved);
  return out;
}
