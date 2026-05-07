import Home from "@/app/page";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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
