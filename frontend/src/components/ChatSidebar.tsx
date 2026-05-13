"use client";

import { createId, type BoardData } from "@/lib/kanban";
import { useState, type FormEvent } from "react";

const INITIAL_MESSAGE = {
  id: "msg-welcome",
  role: "assistant",
  content: "Ask me to add, move, or rewrite cards.",
} as const;

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type ChatSidebarProps = {
  board: BoardData;
  disabled?: boolean;
  onBoardUpdate: (board: BoardData) => void;
};

type ChatResponse = {
  response: string;
  board?: BoardData | null;
};

export const ChatSidebar = ({
  board,
  disabled = false,
  onBoardUpdate,
}: ChatSidebarProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled || isSending) {
      return;
    }
    const message = input.trim();
    if (!message) {
      return;
    }

    setInput("");
    setError(null);
    setIsSending(true);
    setMessages((prev) => [
      ...prev,
      { id: createId("msg"), role: "user", content: message },
    ]);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, board }),
      });
      if (!response.ok) {
        throw new Error("AI request failed");
      }
      const payload = (await response.json()) as ChatResponse;
      setMessages((prev) => [
        ...prev,
        { id: createId("msg"), role: "assistant", content: payload.response },
      ]);
      if (payload.board) {
        onBoardUpdate(payload.board);
      }
    } catch {
      setError("Unable to reach the AI assistant.");
      setMessages((prev) => [
        ...prev,
        {
          id: createId("msg"),
          role: "assistant",
          content: "Sorry, I could not complete that request.",
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <aside className="flex h-full flex-col gap-6 rounded-[28px] border border-[var(--stroke)] bg-white/85 p-6 shadow-[var(--shadow)] backdrop-blur">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
          AI assistant
        </p>
        <h2 className="mt-3 font-display text-2xl font-semibold text-[var(--navy-dark)]">
          Board copilot
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--gray-text)]">
          Send a request and the assistant will update cards or column flow for
          you.
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`rounded-2xl border px-4 py-3 text-sm leading-6 shadow-sm ${
              message.role === "user"
                ? "border-[var(--primary-blue)] bg-[color:rgba(32,157,215,0.1)] text-[var(--navy-dark)]"
                : "border-[var(--stroke)] bg-[var(--surface)] text-[var(--gray-text)]"
            }`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
              {message.role === "user" ? "You" : "Assistant"}
            </p>
            <p className="mt-2 text-sm text-[var(--navy-dark)]">
              {message.content}
            </p>
          </div>
        ))}
      </div>

      {error ? (
        <div className="rounded-2xl border border-[color:rgba(117,57,145,0.3)] bg-[color:rgba(117,57,145,0.08)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--secondary-purple)]">
          {error}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
          Your request
          <textarea
            className="min-h-[120px] resize-none rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm font-medium text-[var(--navy-dark)] shadow-sm focus:border-[var(--primary-blue)] focus:outline-none"
            placeholder="Move the roadmap card to Review and add a QA note."
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={disabled || isSending}
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-2xl bg-[var(--primary-blue)] px-5 py-3 text-xs font-semibold uppercase tracking-[0.25em] text-white transition hover:bg-[color:rgba(32,157,215,0.9)] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={disabled || isSending}
        >
          {isSending ? "Sending" : "Send"}
        </button>
      </form>
    </aside>
  );
};
