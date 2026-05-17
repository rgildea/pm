"use client";

import { useState } from "react";
import type { BoardSummary } from "@/lib/api";
import { createBoard, deleteBoard, renameBoard } from "@/lib/api";

type BoardSelectorProps = {
  boards: BoardSummary[];
  activeBoardId: string;
  onSelect: (boardId: string) => void;
  onBoardsChange: (boards: BoardSummary[]) => void;
};

export const BoardSelector = ({
  boards,
  activeBoardId,
  onSelect,
  onBoardsChange,
}: BoardSelectorProps) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    const title = newTitle.trim();
    if (!title) return;
    try {
      const created = await createBoard(title);
      const newBoard: BoardSummary = {
        id: created.id,
        title: created.title,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      onBoardsChange([...boards, newBoard]);
      onSelect(created.id);
      setNewTitle("");
      setIsCreating(false);
      setError(null);
    } catch {
      setError("Failed to create board.");
    }
  };

  const handleRename = async (boardId: string) => {
    const title = editTitle.trim();
    if (!title) {
      setEditingId(null);
      return;
    }
    try {
      await renameBoard(boardId, title);
      onBoardsChange(boards.map((b) => (b.id === boardId ? { ...b, title } : b)));
      setEditingId(null);
      setError(null);
    } catch {
      setError("Failed to rename board.");
    }
  };

  const handleDelete = async (boardId: string) => {
    if (boards.length <= 1) return;
    try {
      await deleteBoard(boardId);
      const remaining = boards.filter((b) => b.id !== boardId);
      onBoardsChange(remaining);
      if (activeBoardId === boardId) {
        onSelect(remaining[0].id);
      }
      setError(null);
    } catch {
      setError("Failed to delete board.");
    }
  };

  const startEditing = (board: BoardSummary) => {
    setEditingId(board.id);
    setEditTitle(board.title);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {boards.map((board) => (
        <div key={board.id} className="flex items-center gap-1">
          {editingId === board.id ? (
            <input
              autoFocus
              className="rounded-xl border border-[var(--primary-blue)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--navy-dark)] focus:outline-none"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={() => void handleRename(board.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleRename(board.id);
                if (e.key === "Escape") setEditingId(null);
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => onSelect(board.id)}
              onDoubleClick={() => startEditing(board)}
              className={`rounded-xl border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] transition ${
                board.id === activeBoardId
                  ? "border-[var(--primary-blue)] bg-[var(--primary-blue)] text-white"
                  : "border-[var(--stroke)] text-[var(--navy-dark)] hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]"
              }`}
            >
              {board.title}
            </button>
          )}
          {boards.length > 1 && editingId !== board.id && (
            <button
              type="button"
              onClick={() => void handleDelete(board.id)}
              className="rounded-full p-0.5 text-[var(--gray-text)] hover:text-red-500"
              aria-label={`Delete ${board.title}`}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <path d="M9.5 3.5L6 7 2.5 3.5 1.5 4.5 5 8 1.5 11.5l1 1L6 9l3.5 3.5 1-1L7 8l3.5-3.5z" />
              </svg>
            </button>
          )}
        </div>
      ))}

      {isCreating ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            placeholder="Board name"
            className="rounded-xl border border-[var(--stroke)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--navy-dark)] focus:border-[var(--primary-blue)] focus:outline-none"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCreate();
              if (e.key === "Escape") {
                setIsCreating(false);
                setNewTitle("");
              }
            }}
          />
          <button
            type="button"
            onClick={() => void handleCreate()}
            className="rounded-xl bg-[var(--primary-blue)] px-3 py-1.5 text-xs font-semibold text-white"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => { setIsCreating(false); setNewTitle(""); }}
            className="rounded-xl border border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold text-[var(--gray-text)]"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="rounded-xl border border-dashed border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold text-[var(--gray-text)] hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]"
        >
          + New board
        </button>
      )}

      {error ? (
        <span className="text-xs text-red-500">{error}</span>
      ) : null}
    </div>
  );
};
