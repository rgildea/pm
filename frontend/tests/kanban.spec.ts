import { expect, test } from "@playwright/test";

const initialBoard = {
  columns: [
    { id: "col-backlog", title: "Backlog", cardIds: ["card-1", "card-2"] },
    { id: "col-discovery", title: "Discovery", cardIds: ["card-3"] },
    { id: "col-progress", title: "In Progress", cardIds: ["card-4", "card-5"] },
    { id: "col-review", title: "Review", cardIds: ["card-6"] },
    { id: "col-done", title: "Done", cardIds: ["card-7", "card-8"] }
  ],
  cards: {
    "card-1": {
      id: "card-1",
      title: "Align roadmap themes",
      details: "Draft quarterly themes with impact statements and metrics."
    },
    "card-2": {
      id: "card-2",
      title: "Gather customer signals",
      details: "Review support tags, sales notes, and churn feedback."
    },
    "card-3": {
      id: "card-3",
      title: "Prototype analytics view",
      details: "Sketch initial dashboard layout and key drill-downs."
    },
    "card-4": {
      id: "card-4",
      title: "Refine status language",
      details: "Standardize column labels and tone across the board."
    },
    "card-5": {
      id: "card-5",
      title: "Design card layout",
      details: "Add hierarchy and spacing for scanning dense lists."
    },
    "card-6": {
      id: "card-6",
      title: "QA micro-interactions",
      details: "Verify hover, focus, and loading states."
    },
    "card-7": {
      id: "card-7",
      title: "Ship marketing page",
      details: "Final copy approved and asset pack delivered."
    },
    "card-8": {
      id: "card-8",
      title: "Close onboarding sprint",
      details: "Document release notes and share internally."
    }
  }
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/board", async (route, request) => {
    if (request.method() === "GET") {
      await route.fulfill({ json: { board: initialBoard } });
      return;
    }
    if (request.method() === "PUT") {
      const body = request.postDataJSON() as { board: typeof initialBoard };
      await route.fulfill({ json: { board: body.board } });
      return;
    }
    await route.fulfill({ status: 405 });
  });
});

test("loads the kanban board", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("adds a card to a column", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Playwright card");
  await firstColumn.getByPlaceholder("Details").fill("Added via e2e.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("Playwright card")).toBeVisible();
});

test("sends a chat message and applies a board update", async ({ page }) => {
  const aiUpdatedBoard = {
    ...initialBoard,
    columns: initialBoard.columns.map((col) => {
      if (col.id === "col-backlog") return { ...col, cardIds: ["card-2"] };
      if (col.id === "col-done") return { ...col, cardIds: ["card-7", "card-8", "card-1"] };
      return col;
    }),
  };

  await page.route("**/api/ai/chat", async (route) => {
    await route.fulfill({ json: { response: "Moved it for you.", board: aiUpdatedBoard } });
  });

  await page.goto("/");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();

  await page.getByLabel(/your request/i).fill("Move card-1 to Done.");
  await page.getByRole("button", { name: /send/i }).click();

  await expect(page.getByText("Moved it for you.")).toBeVisible();
  await expect(page.getByTestId("column-col-done").getByTestId("card-card-1")).toBeVisible();
});

test("moves a card between columns", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  const card = page.getByTestId("card-card-1");
  const targetColumn = page.getByTestId("column-col-review");
  const cardBox = await card.boundingBox();
  const columnBox = await targetColumn.boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    columnBox.x + columnBox.width / 2,
    columnBox.y + 120,
    { steps: 12 }
  );
  await page.mouse.up();
  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
});
