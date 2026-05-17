"use client";

import { ChatSidebar } from "@/components/ChatSidebar";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { KanbanColumn } from "@/components/KanbanColumn";
import { BoardSelector } from "@/components/BoardSelector";
import { fetchBoard, persistBoard, sendAiChat } from "@/lib/api";
import type { BoardSummary } from "@/lib/api";
import { createId, initialData, moveCard, type BoardData } from "@/lib/kanban";
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
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const boardData = board ?? initialData;
  const cardsById = useMemo(() => boardData.cards, [boardData.cards]);

  useEffect(() => {
    let isMounted = true;
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
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);
    if (!over || active.id === over.id) return;
    updateBoard((current) => ({
      ...current,
      columns: moveCard(current.columns, active.id as string, over.id as string),
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

  const handleAddCard = (columnId: string, title: string, details: string, priority = "medium") => {
    const id = createId("card");
    updateBoard((current) => ({
      ...current,
      cards: {
        ...current.cards,
        [id]: { id, title, details: details || "No details yet.", priority: priority as import("@/lib/kanban").Priority },
      },
      columns: current.columns.map((col) =>
        col.id === columnId ? { ...col, cardIds: [...col.cardIds, id] } : col,
      ),
    }));
  };

  const handleEditCard = (cardId: string, title: string, details: string, priority: string) => {
    updateBoard((current) => ({
      ...current,
      cards: {
        ...current.cards,
        [cardId]: { ...current.cards[cardId], title, details, priority: priority as import("@/lib/kanban").Priority },
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

  const activeCard = activeCardId ? cardsById[activeCardId] : null;

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
            <section className="grid gap-6 lg:grid-cols-5">
              {boardData.columns.map((column) => (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  cards={column.cardIds.map((cardId) => boardData.cards[cardId])}
                  onRename={handleRenameColumn}
                  onAddCard={handleAddCard}
                  onDeleteCard={handleDeleteCard}
                  onEditCard={handleEditCard}
                />
              ))}
            </section>
            <DragOverlay>
              {activeCard ? (
                <div className="w-[260px]">
                  <KanbanCardPreview card={activeCard} />
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
