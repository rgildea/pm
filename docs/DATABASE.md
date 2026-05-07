# Database model

## Summary

The MVP stores one board per user in a single row with the board state captured as JSON. This keeps the backend simple while still allowing multiple users and future schema changes.

## Storage approach

- Users are normalized in a users table.
- Each board is stored in a boards table with a state_json column.
- The board JSON mirrors the frontend BoardData structure (columns and cards).
- The database is created on first run if it does not exist.

## Rationale

- Simplicity: minimal tables and no joins for cards/columns during MVP.
- Flexibility: schema can evolve later without migrations for card-level fields.
- Performance: board state is read and written as a single payload.

## Schema

See docs/db-schema.json for the proposed table definition.

## Open questions for approval

- Confirm JSON blob per board is acceptable for MVP.
- Confirm table and column names are acceptable.
