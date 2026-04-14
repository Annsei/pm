# Database Design for Kanban Studio

## Overview

This document describes the database schema for the Kanban Studio MVP. The database will store user accounts and their associated Kanban boards with cards.

## Technology Choice

- **Database**: SQLite (file-based, no server required)
- **ORM**: SQLAlchemy (Python)
- **Migration**: Alembic (for schema changes)

## Schema Design

### Tables

#### 1. users
Stores user account information.

```sql
CREATE TABLE users (
    id TEXT PRIMARY KEY,  -- UUID
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,  -- For MVP: simple hash, future: proper bcrypt
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Fields:**
- `id`: Unique identifier (UUID)
- `username`: Login username (unique)
- `password_hash`: Hashed password
- `created_at/updated_at`: Timestamps

#### 2. boards
Stores Kanban boards, one per user for MVP.

```sql
CREATE TABLE boards (
    id TEXT PRIMARY KEY,  -- UUID
    user_id TEXT NOT NULL,
    name TEXT DEFAULT 'My Kanban Board',
    data TEXT NOT NULL,  -- JSON string containing board state
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

**Fields:**
- `id`: Unique identifier (UUID)
- `user_id`: Reference to user
- `name`: Board name (for future multi-board support)
- `data`: JSON string containing the full board state
- `created_at/updated_at`: Timestamps

### JSON Data Structure

The `boards.data` field will store a JSON object with this structure:

```json
{
  "columns": [
    {
      "id": "column-1",
      "title": "To Do",
      "cardIds": ["card-1", "card-2"]
    },
    {
      "id": "column-2",
      "title": "In Progress",
      "cardIds": ["card-3"]
    }
  ],
  "cards": {
    "card-1": {
      "id": "card-1",
      "title": "Implement login",
      "details": "Add user authentication with hardcoded credentials"
    },
    "card-2": {
      "id": "card-2",
      "title": "Design database schema",
      "details": "Create tables for users and boards"
    }
  }
}
```

This matches the existing frontend `BoardData` type.

## Database Operations

### User Operations
- `CREATE`: Insert new user with hashed password
- `READ`: Get user by username for login
- `UPDATE`: Change password (future feature)

### Board Operations
- `CREATE`: Create default board for new user
- `READ`: Get board data by user_id
- `UPDATE`: Save updated board JSON after user actions

## Implementation Notes

1. **SQLite Path**: Store database file in `backend/data/kanban.db`
2. **Connection**: Use SQLAlchemy engine with `check_same_thread=False` for async support
3. **Migrations**: Use Alembic for schema versioning
4. **Default Data**: When creating a user, also create a default board with 5 empty columns
5. **Data Validation**: Validate JSON structure on save/load

## Security Considerations (MVP)

- Passwords stored as simple hash (not secure, but sufficient for demo)
- No rate limiting on login attempts
- No session management (using localStorage on frontend)

## Future Enhancements

- Multiple boards per user
- Board sharing/collaboration
- Audit logs for card changes
- Proper password hashing with bcrypt
- Database connection pooling (if needed)