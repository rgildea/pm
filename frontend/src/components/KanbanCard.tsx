"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { useState } from "react";
import type { Card, Priority } from "@/lib/kanban";

const PRIORITY_STYLES: Record<Priority, string> = {
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

type KanbanCardProps = {
  card: Card;
  onDelete: (cardId: string) => void;
  onEdit: (cardId: string, title: string, details: string, priority: string) => void;
};

export const KanbanCard = ({ card, onDelete, onEdit }: KanbanCardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(card.title);
  const [editDetails, setEditDetails] = useState(card.details);
  const [editPriority, setEditPriority] = useState<Priority>(card.priority ?? "medium");

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleSave = () => {
    const title = editTitle.trim();
    if (!title) {
      setEditTitle(card.title);
      setIsEditing(false);
      return;
    }
    onEdit(card.id, title, editDetails, editPriority);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditTitle(card.title);
    setEditDetails(card.details);
    setEditPriority(card.priority ?? "medium");
    setIsEditing(false);
  };

  const priority = card.priority ?? "medium";

  if (isEditing) {
    return (
      <article
        className="rounded-2xl border border-[var(--primary-blue)] bg-white px-4 py-4 shadow-[0_12px_24px_rgba(3,33,71,0.08)]"
        data-testid={`card-${card.id}`}
      >
        <input
          autoFocus
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") handleCancel();
          }}
          className="w-full bg-transparent font-display text-base font-semibold text-[var(--navy-dark)] outline-none"
          placeholder="Card title"
          aria-label="Card title"
        />
        <textarea
          value={editDetails}
          onChange={(e) => setEditDetails(e.target.value)}
          className="mt-2 w-full resize-none bg-transparent text-sm text-[var(--gray-text)] outline-none"
          rows={3}
          placeholder="Details"
          aria-label="Card details"
        />
        <div className="mt-3 flex items-center justify-between gap-2">
          <select
            value={editPriority}
            onChange={(e) => setEditPriority(e.target.value as Priority)}
            className="rounded-lg border border-[var(--stroke)] bg-white px-2 py-1 text-xs font-semibold text-[var(--navy-dark)] focus:outline-none"
            aria-label="Card priority"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-lg border border-[var(--stroke)] px-3 py-1 text-xs font-semibold text-[var(--gray-text)] hover:border-[var(--navy-dark)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-lg bg-[var(--primary-blue)] px-3 py-1 text-xs font-semibold text-white hover:opacity-90"
            >
              Save
            </button>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={clsx(
        "rounded-2xl border border-transparent bg-white px-4 py-4 shadow-[0_12px_24px_rgba(3,33,71,0.08)]",
        "transition-all duration-150",
        isDragging && "opacity-60 shadow-[0_18px_32px_rgba(3,33,71,0.16)]"
      )}
      {...attributes}
      {...listeners}
      data-testid={`card-${card.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h4 className="font-display text-base font-semibold text-[var(--navy-dark)]">
            {card.title}
          </h4>
          {card.details && (
            <p className="mt-2 text-sm leading-6 text-[var(--gray-text)]">
              {card.details}
            </p>
          )}
          <span
            className={clsx(
              "mt-3 inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em]",
              PRIORITY_STYLES[priority]
            )}
          >
            {priority}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
            onPointerDown={(e) => e.stopPropagation()}
            className="rounded-full border border-transparent px-2 py-1 text-xs font-semibold text-[var(--gray-text)] transition hover:border-[var(--stroke)] hover:text-[var(--primary-blue)]"
            aria-label={`Edit ${card.title}`}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(card.id); }}
            onPointerDown={(e) => e.stopPropagation()}
            className="rounded-full border border-transparent px-2 py-1 text-xs font-semibold text-[var(--gray-text)] transition hover:border-[var(--stroke)] hover:text-[var(--navy-dark)]"
            aria-label={`Delete ${card.title}`}
          >
            Remove
          </button>
        </div>
      </div>
    </article>
  );
};
