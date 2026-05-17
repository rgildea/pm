import { KanbanBoard } from "@/components/KanbanBoard";
import { KanbanColumn } from "@/components/KanbanColumn";
import { initialData } from "@/lib/kanban";
import type { BoardSummary } from "@/lib/api";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, vi } from "vitest";

const TEST_BOARD_ID = "test-board-id";

const defaultBoards: BoardSummary[] = [
  {
    id: TEST_BOARD_ID,
    title: "Test Board",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
];

const defaultProps = {
  onLogout: () => {},
  userName: "user",
  boards: defaultBoards,
  activeBoardId: TEST_BOARD_ID,
  onBoardsChange: () => {},
  onActiveBoardChange: () => {},
};

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

const mockFetch = () => {
  const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";

    if (url === `/api/boards/${TEST_BOARD_ID}` && method === "GET") {
      return Promise.resolve(
        new Response(
          JSON.stringify({ board: initialData, title: "Test Board", id: TEST_BOARD_ID }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    }

    if (url === `/api/boards/${TEST_BOARD_ID}` && method === "PUT") {
      const body = init?.body ? JSON.parse(init.body.toString()) : {};
      return Promise.resolve(
        new Response(JSON.stringify({ board: body.board ?? initialData }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    }

    return Promise.resolve(new Response("Not found", { status: 404 }));
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = mockFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("KanbanBoard", () => {
  it("renders five columns", async () => {
    render(<KanbanBoard {...defaultProps} />);
    expect(await screen.findAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("renames a column", async () => {
    render(<KanbanBoard {...defaultProps} />);
    await screen.findAllByTestId(/column-/i);
    const column = getFirstColumn();
    const input = within(column).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    expect(input).toHaveValue("New Name");
    fireEvent.blur(input);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/boards/${TEST_BOARD_ID}`,
        expect.objectContaining({
          method: "PUT",
          body: expect.stringContaining("New Name"),
        }),
      );
    });
  });

  it("adds and removes a card", async () => {
    render(<KanbanBoard {...defaultProps} />);
    await screen.findAllByTestId(/column-/i);
    const column = getFirstColumn();
    const addButton = within(column).getByRole("button", { name: /add a card/i });
    await userEvent.click(addButton);

    const titleInput = within(column).getByPlaceholderText(/card title/i);
    await userEvent.type(titleInput, "New card");
    const detailsInput = within(column).getByPlaceholderText(/details/i);
    await userEvent.type(detailsInput, "Notes");

    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(within(column).getByText("New card")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/boards/${TEST_BOARD_ID}`,
      expect.objectContaining({
        method: "PUT",
        body: expect.stringContaining("New card"),
      }),
    );

    const deleteButton = within(column).getByRole("button", { name: /delete new card/i });
    await userEvent.click(deleteButton);

    expect(within(column).queryByText("New card")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/boards/${TEST_BOARD_ID}`,
      expect.objectContaining({ method: "PUT" }),
    );
  });
});

  it("adds a new column", async () => {
    render(<KanbanBoard {...defaultProps} />);
    await screen.findAllByTestId(/column-/i);

    const addColButton = screen.getByRole("button", { name: /add column/i });
    await userEvent.click(addColButton);

    const titleInput = screen.getByPlaceholderText(/column title/i);
    await userEvent.type(titleInput, "New Stage");
    await userEvent.click(screen.getByRole("button", { name: /^Add$/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/boards/${TEST_BOARD_ID}`,
        expect.objectContaining({
          method: "PUT",
          body: expect.stringContaining("New Stage"),
        }),
      );
    });
  });

describe("KanbanColumn title sync", () => {
  it("updates the title input when the column prop changes externally", () => {
    const column = { id: "col-a", title: "Original", cardIds: [] };
    const { rerender } = render(
      <KanbanColumn
        column={column}
        cards={[]}
        onRename={() => {}}
        onAddCard={() => {}}
        onDeleteCard={() => {}} onEditCard={() => {}}
      />,
    );

    expect(screen.getByLabelText("Column title")).toHaveValue("Original");

    rerender(
      <KanbanColumn
        column={{ ...column, title: "AI Renamed" }}
        cards={[]}
        onRename={() => {}}
        onAddCard={() => {}}
        onDeleteCard={() => {}} onEditCard={() => {}}
      />,
    );

    expect(screen.getByLabelText("Column title")).toHaveValue("AI Renamed");
  });

  it("does not rename a column to a blank title on blur", async () => {
    const onRename = vi.fn();
    const column = { id: "col-a", title: "Original", cardIds: [] };
    render(
      <KanbanColumn
        column={column}
        cards={[]}
        onRename={onRename}
        onAddCard={() => {}}
        onDeleteCard={() => {}} onEditCard={() => {}}
      />,
    );
    const input = screen.getByLabelText("Column title");
    await userEvent.clear(input);
    fireEvent.blur(input);
    expect(onRename).not.toHaveBeenCalled();
  });

  it("does not clobber an in-progress user edit with an external update", async () => {
    const column = { id: "col-a", title: "Original", cardIds: [] };
    const { rerender } = render(
      <KanbanColumn
        column={column}
        cards={[]}
        onRename={() => {}}
        onAddCard={() => {}}
        onDeleteCard={() => {}} onEditCard={() => {}}
      />,
    );

    const input = screen.getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "User typing");

    rerender(
      <KanbanColumn
        column={{ ...column, title: "Original" }}
        cards={[]}
        onRename={() => {}}
        onAddCard={() => {}}
        onDeleteCard={() => {}} onEditCard={() => {}}
      />,
    );

    expect(input).toHaveValue("User typing");
  });
});
