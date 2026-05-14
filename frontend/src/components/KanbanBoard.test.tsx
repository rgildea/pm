import { KanbanBoard } from "@/components/KanbanBoard";
import { KanbanColumn } from "@/components/KanbanColumn";
import { initialData } from "@/lib/kanban";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, vi } from "vitest";

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

const mockFetch = () => {
  const fetchMock = vi.fn().mockImplementation((_, init) => {
    const method = init?.method ?? "GET";
    if (method === "GET") {
      return Promise.resolve(
        new Response(JSON.stringify({ board: initialData }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    }

    if (method === "PUT") {
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
    render(<KanbanBoard onLogout={() => {}} userName="user" />);
    expect(await screen.findAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("renames a column", async () => {
    render(<KanbanBoard onLogout={() => {}} userName="user" />);
    await screen.findAllByTestId(/column-/i);
    const column = getFirstColumn();
    const input = within(column).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    expect(input).toHaveValue("New Name");
    fireEvent.blur(input);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/board",
        expect.objectContaining({
          method: "PUT",
          body: expect.stringContaining("New Name"),
        }),
      );
    });
  });

  it("adds and removes a card", async () => {
    render(<KanbanBoard onLogout={() => {}} userName="user" />);
    await screen.findAllByTestId(/column-/i);
    const column = getFirstColumn();
    const addButton = within(column).getByRole("button", {
      name: /add a card/i,
    });
    await userEvent.click(addButton);

    const titleInput = within(column).getByPlaceholderText(/card title/i);
    await userEvent.type(titleInput, "New card");
    const detailsInput = within(column).getByPlaceholderText(/details/i);
    await userEvent.type(detailsInput, "Notes");

    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(within(column).getByText("New card")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/board",
      expect.objectContaining({
        method: "PUT",
        body: expect.stringContaining("New card"),
      }),
    );

    const deleteButton = within(column).getByRole("button", {
      name: /delete new card/i,
    });
    await userEvent.click(deleteButton);

    expect(within(column).queryByText("New card")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/board",
      expect.objectContaining({ method: "PUT" }),
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
        onDeleteCard={() => {}}
      />,
    );

    expect(screen.getByLabelText("Column title")).toHaveValue("Original");

    rerender(
      <KanbanColumn
        column={{ ...column, title: "AI Renamed" }}
        cards={[]}
        onRename={() => {}}
        onAddCard={() => {}}
        onDeleteCard={() => {}}
      />,
    );

    expect(screen.getByLabelText("Column title")).toHaveValue("AI Renamed");
  });
});
