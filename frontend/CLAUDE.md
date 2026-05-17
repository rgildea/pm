# Frontend

## Overview

Next.js app that renders a single Kanban board at `/`. State is local React state with drag-and-drop via dnd-kit. Styling is Tailwind with CSS variables defined in globals.

## Key files

- `src/app/page.tsx`: Login gate — renders `LoginScreen` or `KanbanBoard` based on React state.
- `src/components/KanbanBoard.tsx`: Board state, drag-and-drop wiring, column/card actions.
- `src/components/KanbanColumn.tsx`: Column UI, title editing, droppable target, new card form.
- `src/components/KanbanCard.tsx`: Draggable card UI with delete action.
- `src/components/KanbanCardPreview.tsx`: Drag overlay card preview.
- `src/components/NewCardForm.tsx`: Inline form to add cards.
- `src/lib/kanban.ts`: Data model types, initial demo data, `moveCard` logic, `createId` utility.
- `src/app/globals.css`: Theme variables and base styles.

## State and behavior

- Board state is kept in React state in `KanbanBoard`.
- Columns are renamed via inline input changes.
- Cards can be added, deleted, and moved across columns.
- Drag-and-drop uses dnd-kit with sortable lists and a drag overlay.

## Tests

- Unit tests are under `src/components/` and `src/lib/`.
- Playwright tests are under `frontend/tests/`.
