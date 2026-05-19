"use client";

import { ChatSidebar } from "@/components/ChatSidebar";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { KanbanColumn } from "@/components/KanbanColumn";
import { BoardSelector } from "@/components/BoardSelector";
import { FilterBar } from "@/components/FilterBar";
import type { FilterState } from "@/components/FilterBar";
import { fetchBoard, persistBoard, sendAiChat } from "@/lib/api";
import type { BoardSummary } from "@/lib/api";
import { createId, initialData, isOverdue, moveCard, type BoardData, type Priority } from "@/lib/kanban";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { useEffect, useMemo, useState } from "react";

type KanbanBoardProps = {
  onLogout: () => void;
  userName: string;
  boards: BoardSummary[];
  activeBoardId: string;
  onBoardsChange: (boards: BoardSummary[]) => void;
  onActiveBoardChange: (boardId: string) => void;
};

export const KanbanBoard = ({
  onLogout,
  userName,
  boards,
  activeBoardId,
  onBoardsChange,
  onActiveBoardChange,
}: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [boardTitle, setBoardTitle] = useState<string>("");
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterState>({ search: "", priority: "" });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const boardData = board ?? initialData;

  const boardStats = useMemo(() => {
    const cards = Object.values(boardData.cards);
    return {
      total: cards.length,
      high: cards.filter((c) => c.priority === "high").length,
      overdue: cards.filter((c) => isOverdue(c.due_date)).length,
    };
  }, [boardData.cards]);

  const filteredCardIds = useMemo(() => {
    const search = filter.search.toLowerCase();
    return new Set(
      Object.values(boardData.cards)
        .filter((card) => {
          if (filter.priority && (card.priority ?? "medium") !== filter.priority) return false;
          if (search && !card.title.toLowerCase().includes(search) && !card.details.toLowerCase().includes(search)) return false;
          return true;
        })
        .map((card) => card.id)
    );
  }, [boardData.cards, filter]);

  useEffect(() => {
    let isMounted = true;
    setFilter({ search: "", priority: "" });
    const loadBoard = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchBoard(activeBoardId);
        if (isMounted) {
          setBoard(data.board);
          setBoardTitle(data.title);
        }
      } catch {
        if (isMounted) {
          setBoard(initialData);
          setError("Unable to load board. Showing local data.");
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    void loadBoard();
    return () => { isMounted = false; };
  }, [activeBoardId]);

  const saveBoard = async (nextBoard: BoardData) => {
    try {
      const saved = await persistBoard(activeBoardId, nextBoard);
      setBoard(saved);
      setError(null);
    } catch {
      setError("Unable to save changes. They may not persist after refresh.");
    }
  };

  const updateBoard = (updater: (current: BoardData) => BoardData) => {
    const nextBoard = updater(board ?? initialData);
    setBoard(nextBoard);
    void saveBoard(nextBoard);
  };

  const handleAiBoardUpdate = (nextBoard: BoardData) => {
    setBoard(nextBoard);
    setError(null);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const id = event.active.id as string;
    if (boardData.columns.some((col) => col.id === id)) {
      setActiveColumnId(id);
    } else {
      setActiveCardId(id);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);
    setActiveColumnId(null);
    if (!over || active.id === over.id) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    if (boardData.columns.some((col) => col.id === activeId)) {
      const oldIndex = boardData.columns.findIndex((col) => col.id === activeId);
      const newIndex = boardData.columns.findIndex((col) => col.id === overId);
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        updateBoard((current) => ({
          ...current,
          columns: arrayMove(current.columns, oldIndex, newIndex),
        }));
      }
      return;
    }

    updateBoard((current) => ({
      ...current,
      columns: moveCard(current.columns, activeId, overId),
    }));
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    updateBoard((current) => ({
      ...current,
      columns: current.columns.map((col) =>
        col.id === columnId ? { ...col, title } : col,
      ),
    }));
  };

  const handleAddColumn = (title: string) => {
    const id = createId("col");
    updateBoard((current) => ({
      ...current,
      columns: [...current.columns, { id, title, cardIds: [] }],
    }));
  };

  const handleDeleteColumn = (columnId: string) => {
    updateBoard((current) => {
      const col = current.columns.find((c) => c.id === columnId);
      if (!col) return current;
      const cardIds = new Set(col.cardIds);
      return {
        columns: current.columns.filter((c) => c.id !== columnId),
        cards: Object.fromEntries(
          Object.entries(current.cards).filter(([id]) => !cardIds.has(id))
        ),
      };
    });
  };

  const handleAddCard = (columnId: string, title: string, details: string, priority: Priority = "medium") => {
    const id = createId("card");
    updateBoard((current) => ({
      ...current,
      cards: {
        ...current.cards,
        [id]: { id, title, details: details || "No details yet.", priority },
      },
      columns: current.columns.map((col) =>
        col.id === columnId ? { ...col, cardIds: [...col.cardIds, id] } : col,
      ),
    }));
  };

  const handleEditCard = (
    cardId: string,
    title: string,
    details: string,
    priority: Priority,
    due_date: string | null = null
  ) => {
    updateBoard((current) => ({
      ...current,
      cards: {
        ...current.cards,
        [cardId]: {
          ...current.cards[cardId],
          title,
          details,
          priority,
          due_date,
        },
      },
    }));
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    updateBoard((current) => ({
      ...current,
      cards: Object.fromEntries(Object.entries(current.cards).filter(([id]) => id !== cardId)),
      columns: current.columns.map((col) =>
        col.id === columnId
          ? { ...col, cardIds: col.cardIds.filter((id) => id !== cardId) }
          : col,
      ),
    }));
  };

  const handleAiChat = async (message: string) => {
    const response = await sendAiChat(activeBoardId, message, boardData);
    if (response.board) {
      handleAiBoardUpdate(response.board);
    }
    return response;
  };

  const activeCard = activeCardId ? boardData.cards[activeCardId] : null;

  if (isLoading && !board) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface)]">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
          Loading board
        </p>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-[1500px] flex-col gap-10 px-6 pb-16 pt-12">
        <header className="flex flex-col gap-6 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                Project Management
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
                {boardTitle || "Kanban Studio"}
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--gray-text)]">
                Keep momentum visible. Rename columns, drag cards between stages, and use AI to manage cards.
              </p>
            </div>
            <div className="flex flex-col items-end gap-3">
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                  Signed in as
                </p>
                <p className="mt-2 text-lg font-semibold text-[var(--primary-blue)]">
                  {userName}
                </p>
              </div>
              <button
                type="button"
                onClick={onLogout}
                className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]"
              >
                Log out
              </button>
            </div>
          </div>

          <BoardSelector
            boards={boards}
            activeBoardId={activeBoardId}
            onSelect={onActiveBoardChange}
            onBoardsChange={onBoardsChange}
          />

          <div className="flex flex-wrap items-center gap-4 text-xs">
            <span className="text-[var(--gray-text)]">
              <span className="font-semibold text-[var(--navy-dark)]">{boardStats.total}</span> cards
            </span>
            {boardStats.high > 0 && (
              <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 font-semibold text-red-700">
                {boardStats.high} high priority
              </span>
            )}
            {boardStats.overdue > 0 && (
              <span className="rounded-full border border-red-300 bg-red-100 px-2.5 py-0.5 font-semibold text-red-800">
                {boardStats.overdue} overdue
              </span>
            )}
          </div>

          <FilterBar
            filter={filter}
            onChange={setFilter}
            totalCards={Object.keys(boardData.cards).length}
            visibleCards={filteredCardIds.size}
          />

          {error ? (
            <div className="rounded-2xl border border-[color:rgba(117,57,145,0.3)] bg-[color:rgba(117,57,145,0.08)] px-5 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--secondary-purple)]">
              {error}
            </div>
          ) : null}
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={boardData.columns.map((col) => col.id)}
              strategy={horizontalListSortingStrategy}
            >
              <section
                className="grid gap-6"
                style={{
                  gridTemplateColumns: `repeat(${boardData.columns.length}, minmax(0, 1fr)) auto`,
                }}
              >
                {boardData.columns.map((column) => (
                  <KanbanColumn
                    key={column.id}
                    column={column}
                    cards={column.cardIds
                      .map((cardId) => boardData.cards[cardId])
                      .filter((card) => filteredCardIds.has(card.id))}
                    allCardIds={column.cardIds}
                    onRename={handleRenameColumn}
                    onAddCard={handleAddCard}
                    onDeleteCard={handleDeleteCard}
                    onEditCard={handleEditCard}
                    onDeleteColumn={boardData.columns.length > 1 ? handleDeleteColumn : undefined}
                  />
                ))}
                <AddColumnButton onAdd={handleAddColumn} />
              </section>
            </SortableContext>
            <DragOverlay>
              {activeCard ? (
                <div className="w-[260px]">
                  <KanbanCardPreview card={activeCard} />
                </div>
              ) : activeColumnId ? (
                <div className="w-[260px] rounded-3xl border border-[var(--primary-blue)] bg-white/80 px-4 py-4 shadow-[0_18px_32px_rgba(3,33,71,0.16)]">
                  <p className="font-display text-lg font-semibold text-[var(--navy-dark)]">
                    {boardData.columns.find((col) => col.id === activeColumnId)?.title}
                  </p>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
          <ChatSidebar
            board={boardData}
            boardId={activeBoardId}
            disabled={isLoading}
            onBoardUpdate={handleAiBoardUpdate}
          />
        </div>
      </main>
    </div>
  );
};

const AddColumnButton = ({ onAdd }: { onAdd: (title: string) => void }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [title, setTitle] = useState("");

  const handleSave = () => {
    const t = title.trim();
    if (t) onAdd(t);
    setTitle("");
    setIsAdding(false);
  };

  if (isAdding) {
    return (
      <div className="flex w-48 flex-col gap-2 rounded-3xl border border-[var(--primary-blue)] bg-white/80 p-4 shadow-[var(--shadow)]">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") { setIsAdding(false); setTitle(""); }
          }}
          placeholder="Column title"
          className="w-full bg-transparent text-sm font-semibold text-[var(--navy-dark)] outline-none"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            className="rounded-lg bg-[var(--primary-blue)] px-3 py-1 text-xs font-semibold text-white"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => { setIsAdding(false); setTitle(""); }}
            className="rounded-lg border border-[var(--stroke)] px-2 py-1 text-xs text-[var(--gray-text)]"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setIsAdding(true)}
      aria-label="Add column"
      className="flex w-12 flex-col items-center justify-center rounded-3xl border border-dashed border-[var(--stroke)] text-[var(--gray-text)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]"
    >
      <span className="text-2xl leading-none">+</span>
    </button>
  );
};
