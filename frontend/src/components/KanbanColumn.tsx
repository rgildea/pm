import clsx from "clsx";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useState } from "react";
import type { Card, Column } from "@/lib/kanban";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";

type KanbanColumnProps = {
  column: Column;
  cards: Card[];
  allCardIds?: string[];
  onRename: (columnId: string, title: string) => void;
  onAddCard: (columnId: string, title: string, details: string, priority?: string) => void;
  onDeleteCard: (columnId: string, cardId: string) => void;
  onEditCard: (cardId: string, title: string, details: string, priority: string, dueDate: string | null) => void;
  onDeleteColumn?: (columnId: string) => void;
};

export const KanbanColumn = ({
  column,
  cards,
  allCardIds,
  onRename,
  onAddCard,
  onDeleteCard,
  onEditCard,
  onDeleteColumn,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [editingTitle, setEditingTitle] = useState<string | null>(null);

  const displayTitle = editingTitle ?? column.title;
  const sortableIds = allCardIds ?? column.cardIds;

  const handleBlur = () => {
    if (editingTitle !== null) {
      if (editingTitle.trim()) {
        onRename(column.id, editingTitle);
      }
      setEditingTitle(null);
    }
  };

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        "flex min-h-[520px] flex-col rounded-3xl border border-[var(--stroke)] bg-[var(--surface-strong)] p-4 shadow-[var(--shadow)] transition",
        isOver && "ring-2 ring-[var(--accent-yellow)]"
      )}
      data-testid={`column-${column.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <div className="h-2 w-10 rounded-full bg-[var(--accent-yellow)]" />
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
              {cards.length} {cards.length === 1 ? "card" : "cards"}
            </span>
          </div>
          <input
            value={displayTitle}
            onChange={(event) => setEditingTitle(event.target.value)}
            onBlur={handleBlur}
            className="mt-3 w-full bg-transparent font-display text-lg font-semibold text-[var(--navy-dark)] outline-none"
            aria-label="Column title"
          />
        </div>
        {onDeleteColumn && (
          <button
            type="button"
            onClick={() => onDeleteColumn(column.id)}
            className="mt-1 flex-shrink-0 rounded-full p-1 text-[var(--gray-text)] hover:text-red-500"
            aria-label={`Delete ${column.title} column`}
            title="Delete column (removes all cards)"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M9.5 3.5L6 7 2.5 3.5 1.5 4.5 5 8 1.5 11.5l1 1L6 9l3.5 3.5 1-1L7 8l3.5-3.5z" />
            </svg>
          </button>
        )}
      </div>
      <div className="mt-4 flex flex-1 flex-col gap-3">
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onDelete={(cardId) => onDeleteCard(column.id, cardId)}
              onEdit={onEditCard}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-[var(--stroke)] px-3 py-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            Drop a card here
          </div>
        )}
      </div>
      <NewCardForm
        onAdd={(title, details, priority) => onAddCard(column.id, title, details, priority)}
      />
    </section>
  );
};
