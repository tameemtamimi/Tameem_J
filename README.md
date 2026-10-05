# مجوهرات الحاج وجيه التميمي — WJ

Upgraded existing Arabic jewelry calculator with Supabase authentication, persistent login, Admin/Employee roles, shared Sell/Buy pricing and saved history. The existing design, WJ logo and exact decimal calculation engine are preserved.

**Start with [SETUP.md](SETUP.md), one stage at a time.** Your `001_store.sql` database is already installed: do not run it again. Apply only the new `database/002_username_auth.sql`, create the first Admin using Stage 2, and keep any existing public values in `config.js`. Staff sign in with Username + Password only. No real passwords, secret keys or demo accounts are included.

Run locally:

```text
npm start
```

Open `http://localhost:4180/`. Node.js is needed only for the local preview/tests. No build or runtime package installation is needed for GitHub Pages. Publish this folder's files at your existing repository's Pages root, including `assets/` and `vendor/`.

## Included

- `index.html`, `styles.css`: original brand/layout extended with accounts, modes and dialogs.
- `calculator.js`: preserved exact decimal engine.
- `pricing.js`: mode and range behavior.
- `store-api.js`, `username.js`: official Supabase client, case-insensitive username mapping and data operations.
- `app.js`: session restoration, calculator, synchronization, history and settings.
- `config.js`: browser-safe Project URL / publishable key only.
- `database/001_store.sql`: unchanged historical schema, already installed.
- `database/002_username_auth.sql`: additive username upgrade; preserves existing data and RLS.
- `database/first_admin.sql`: trusted first-Admin provisioning after dashboard Auth account creation.
- `supabase/functions/create-staff/`: protected server-side staff creation; deploy separately to Supabase.
- `supabase/dashboard-create-staff.ts`: single-file dashboard deployment copy.
- `vendor/`: pinned official Supabase SDK and license.
- `assets/`: existing WJ logo and matching Apple touch icon.
- `scripts/serve.cjs`: optional local preview server.
- `tests/`: arithmetic, pricing, database-policy and browser tests.
- `SETUP.md`: complete setup, staff provisioning, security, persistence and deployment instructions.
- `QA.md`: completed checks and remaining live/iPhone verification.

The database retains saved history; the interface shows the latest **10 store-wide pieces**. Admins can create staff accounts in the existing settings area after deploying the function. Existing memberships are preserved; trusted owner maintenance can link usernames to existing accounts without replacing them. Existing pricing and calculator behavior are unchanged.

No GitHub or Supabase deployment was performed as part of generating these files.
