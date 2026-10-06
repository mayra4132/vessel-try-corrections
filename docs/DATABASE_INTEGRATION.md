# Database-backed local application

The Express application uses the MySQL/MariaDB schema in `database/schema.sql`.
The current local database is `vigor_connected` on `127.0.0.1:3307`. The portable
MariaDB data directory is on E:. This is a local database, not a cPanel deployment.

## Configuration

Copy `.env.example` to `.env` and fill in DB_HOST, DB_PORT, DB_USER, DB_PASSWORD,
DB_NAME and a strong SESSION_SECRET. Server startup loads `.env` through dotenv.
Keep VITE_USE_MOCK_API=false. `.env`, dependencies and build output are ignored by Git.

For a new empty database, import `database/schema.sql` once. Do not reimport it
into an existing database. The old `database/demo_seed.sql` is not compatible
with the new setup; use the explicit local seeder for evaluation instead.

Run `npm install`, `npm run build`, then `npm start` (NODE_ENV=production).
The frontend and API share port 3000. Set PORT to use another port.

## Explicit local demo initialization

`npm run db:seed-local` requires DB_HOST=localhost or 127.0.0.1,
SEED_LOCAL_DEMO=true and BOOTSTRAP_PASSWORD (at least 10 characters).
It refuses a database containing users or fleet data. It inserts actual SQL
records and bcrypt-hashed local evaluation users in one transaction.
It is never invoked by application startup. The current local evaluation users
have already been initialized; do not run it again against vigor_connected.

## Persistence behavior

- Vessels, berths, voyages, visits, payments, fuel, manufacturer queues,
  operational readings, delays, settings and activities use their relational tables.
- Activity actions, dependencies and events are committed atomically. The engine
  runs on transaction-local state rather than shared process memory.
- The existing operations/state frontend contract writes normalized rows in a
  transaction. A locked singleton revision rejects stale writes with HTTP 409.
- operational_state_snapshots retains client fields not represented by schema
  columns (for example presentation/planning details). Reads overlay normalized
  SQL values, so the snapshot does not replace the relational source of truth.
- Posted financial entries cannot be edited or deleted through state sync.
- Database-configured authentication uses SQL users; it never falls back to
  built-in demo accounts when an account is absent or a query fails.
- The UI loads SQL state after login. It does not auto-upload browser demo data.
  Activity commands wait for server success. Other edits are queued briefly and
  display a save error if rejected. A conflict requires refreshing before editing.
- The dashboard summary derives its counts and alerts from the loaded records.
  The previous hard-coded production/dispatch/fuel-reserve KPIs were removed.
- What-if scenarios remain simulations; they are not new operational transactions.

## Tests

`npm run lint` and `npm run build` check source/build integrity.
`npm run test:database` requires an explicit local database configuration with
permission to create a test database. It creates its own uniquely named database,
imports the schema, tests API writes, SQL rows, activity lifecycle and history,
financial immutability, rollback, permissions, conflicting edits and server restart,
then removes only that test database. It does not overwrite the working database.

The application still uses the existing snapshot-shaped client API and serializes
operational writes through one revision lock. For high-volume/multi-site use,
replace full-state saves with per-entity commands and narrower locks. No cloud
or cPanel credentials are bundled, and no remote deployment is implied.

## Live synchronization

Visible browser tabs fetch current operational data every two seconds, with an additional refresh when the window regains focus or connectivity returns. This is polling, so changes normally appear on the next poll plus request time; it is not zero-latency delivery. Data refreshes do not wait for the 30-second health check. Operational API responses disable browser caching.

Normalized SQL tables remain authoritative. A stable fingerprint of loaded operational data detects direct SQL inserts, updates and deletions and advances the shared revision, including when an import bypasses the API. Stale full-state writes receive a conflict instead of deleting imported records. Simultaneous edits require refresh if they conflict. The read guard also prevents a response started before a local edit from overwriting that edit.

Imports must target the database configured for the running server and use its schema and foreign keys. The current preview uses local MariaDB `vigor_connected`; this does not synchronize a separate hosting database. Import related records in a transaction so clients do not observe a partially imported dataset.

The dashboard lists configured berths, including training examples, even when there are no vessels or voyages. Verification covers direct SQL insert/update/delete appearing in an open browser, UI add/remove persistence in SQL, and synchronization between tabs.

## Linked data-entry workflow

Create fleet vessels and berths first. In Voyages, select an existing vessel and berth, enter the voyage number, arrival time, cargo and unloading rate, and select whether the vessel is planned or currently unloading. Saving creates linked voyage and visit records in one transaction. Missing relationships, duplicate voyage numbers, invalid cargo/rates and a second active voyage for the same vessel are rejected with a visible form error.

Fuel orders select vessels with active voyages. A successful order creates its associated payment account in the same transaction. Both forms remain open on save failure. The vessel console links users without an active voyage to the voyage page, and fuel/payment/queue lookups use the current voyage rather than unrelated historical records for that vessel. Berth conflict calculations use the assigned berth, not a fixed B01 ID.

Verified in the browser: create a voyage against the example vessel and berth, see the berth occupant, schedule fuel, verify linked fuel/payment/visit rows in SQL, and reload to verify persistence. Temporary test voyage and child records were removed; example vessel and berth records were preserved.
