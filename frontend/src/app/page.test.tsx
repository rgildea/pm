import Home from "@/app/page";
import { initialData } from "@/lib/kanban";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

beforeEach(() => {
  mockFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Home login", () => {
  it("shows the login form by default", () => {
    render(<Home />);
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("rejects invalid credentials", async () => {
    render(<Home />);
    await userEvent.type(screen.getByLabelText(/password/i), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(
      screen.getByText(/invalid username or password/i)
    ).toBeInTheDocument();
  });

  it("allows login and logout", async () => {
    render(<Home />);
    await userEvent.type(screen.getByLabelText(/password/i), "password");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(
      await screen.findByRole("heading", { name: /kanban studio/i })
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /log out/i }));
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });
});
