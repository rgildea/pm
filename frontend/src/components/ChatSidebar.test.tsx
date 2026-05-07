import { ChatSidebar } from "@/components/ChatSidebar";
import { initialData } from "@/lib/kanban";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const updatedBoard = {
  columns: [{ id: "col-a", title: "A", cardIds: [] }],
  cards: {},
};

const mockFetch = () => {
  const fetchMock = vi.fn().mockImplementation((url, init) => {
    if (url === "/api/ai/chat" && init?.method === "POST") {
      return Promise.resolve(
        new Response(
          JSON.stringify({ response: "Updated", board: updatedBoard }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    }

    return Promise.resolve(new Response("Not found", { status: 404 }));
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

beforeEach(() => {
  mockFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ChatSidebar", () => {
  it("sends a message and applies board updates", async () => {
    const onBoardUpdate = vi.fn();
    render(<ChatSidebar board={initialData} onBoardUpdate={onBoardUpdate} />);

    await userEvent.type(
      screen.getByLabelText(/your request/i),
      "Move the roadmap card.",
    );
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(await screen.findByText("Updated")).toBeInTheDocument();
    expect(onBoardUpdate).toHaveBeenCalledWith(updatedBoard);
  });
});
