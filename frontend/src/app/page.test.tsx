import Home from "@/app/page";
import { initialData } from "@/lib/kanban";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_TOKEN = "test-token-abc";
const TEST_BOARD_ID = "board-1";
const TEST_BOARDS = [
  {
    id: TEST_BOARD_ID,
    title: "My Board",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
];

const mockFetch = ({
  loginShouldFail = false,
}: { loginShouldFail?: boolean } = {}) => {
  const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";

    if (url === "/api/auth/login" && method === "POST") {
      if (loginShouldFail) {
        return Promise.resolve(
          new Response(JSON.stringify({ detail: "Invalid username or password" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          })
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ token: TEST_TOKEN, username: "user" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    }

    if (url === "/api/auth/logout" && method === "POST") {
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    }

    if (url === "/api/auth/me" && method === "GET") {
      return Promise.resolve(
        new Response(JSON.stringify({ user_id: "user", username: "user" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    }

    if (url === "/api/boards" && method === "GET") {
      return Promise.resolve(
        new Response(JSON.stringify({ boards: TEST_BOARDS }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    }

    if (url === `/api/boards/${TEST_BOARD_ID}` && method === "GET") {
      return Promise.resolve(
        new Response(
          JSON.stringify({ board: initialData, title: "My Board", id: TEST_BOARD_ID }),
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

beforeEach(() => {
  localStorage.clear();
  mockFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("Home login", () => {
  it("shows the login form by default", () => {
    render(<Home />);
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("rejects invalid credentials", async () => {
    vi.unstubAllGlobals();
    mockFetch({ loginShouldFail: true });
    render(<Home />);
    await userEvent.type(screen.getByLabelText(/password/i), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(
      await screen.findByText(/invalid username or password/i)
    ).toBeInTheDocument();
  });

  it("allows login and logout", async () => {
    render(<Home />);
    await userEvent.type(screen.getByLabelText(/password/i), "password");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(
      await screen.findByRole("heading", { name: /my board/i })
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /log out/i }));
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("shows registration form when create account is clicked", async () => {
    render(<Home />);
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));
    expect(screen.getByRole("heading", { name: /get started/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument();
  });
});
