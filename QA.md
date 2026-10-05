# Verification — Username authentication update, 5 October 2026

## Username update checks

- New `002_username_auth.sql` successfully applied to a disposable copy of the original schema. Existing profiles/roles and all original RLS policies were preserved. `001_store.sql` is byte-for-byte unchanged.
- First Admin bootstrap succeeds for the matching Auth account and refuses a second bootstrap when an active Admin exists.
- Usernames normalize to lowercase; duplicate names, invalid formats and inconsistent Auth mappings are rejected.
- Employees/anonymous users cannot provision accounts or alter username mappings. Disabled Admins and revoked Admin sessions cannot provision profiles.
- Actual Edge handler tested with isolated Auth/DB dependencies: JWT validation, Admin/active checks, normalized Auth account creation, input rejection and cleanup after provisioning failures. No real secrets used.
- Browser suite updated to use Username + Password, mixed-case login, wrong username/password, no email input, Admin account creation and duplicate creation errors. Existing session restoration, refresh, reopen, logout, permissions and calculator checks still pass.
- Auth session persistence remains handled by the real bundled SDK; test servers return isolated fixtures. No live Supabase user account was created and no hosted function was deployed by these tests.
- Trusted owner maintenance helper was syntax-checked; live account linking/password reset requires testing against the actual project.

## Completed automated checks

1. **Original calculation tests:** decimal arithmetic, JOD-first conversion, conversion before rounding, Arabic/Persian digits, blanks, zeroes, invalid formats, and maximum accepted numeric values.
2. **Pricing rules:** decimal sell prices, both bounds, step controls, fixed buy price, all four mode-specific exchange rates, and switching modes.
3. **Actual PostgreSQL engine via PGlite:** 38 assertion groups against the delivered schema. Tests execute with PostgreSQL `anon`/`authenticated` roles and per-request claims, not only source inspection. Auth users/sessions are local test stubs. Verified RLS/grants block anonymous access, employee settings writes, role escalation, direct history inserts/deletes, invalid prices/weights, stale revisions, inactive/banned users and revoked session IDs. Verified Admin settings initialization/update, exact server totals, immutable snapshots, multi-user store history, latest-10 limit, and idempotent save retries.
4. **Browser integration with the real bundled Supabase SDK and isolated test API responses:** first login, incorrect credentials, reload restoration without login flash, new-page restoration, expired-session refresh, logout and re-login; Admin/Employee UI; Sell/Buy prices/rates; save only on explicit action; retry after save failure; stale-settings conflicts; last-10 display; network failure and account revocation.
5. **Responsive browser checks:** Chromium/Edge at 390×844, 320×667, 768×1024 and 1440×1000, with no horizontal page overflow or uncaught page errors. Phone and desktop screenshots visually reviewed.
6. **Assets:** existing WJ logo reused, Apple touch icon linked, local Supabase SDK pinned and licensed. No remote font/script dependency.

## Not yet verified / required before live use

- The user reports that `001_store.sql` is already installed. Only the new username migration/function and live Username + Password flow remain to be configured/verified in that project.
- Password recovery is now owner-assisted through Supabase Auth Admin API; the frontend contains no email recovery flow.
- No physical iPhone or iOS Safari was available. Actual Safari close/reopen, keyboard behavior, Home Screen shortcut/app storage and icon appearance require device testing.
- GitHub Pages deployment and cross-device live synchronization were not performed.
- Browser API response fixtures are test-only; they are not real authentication and are never loaded by `index.html`. Passing them does not prove production service configuration.

## Repeat the tests

```text
npm test
npm install
npm run test:database
```

For browser tests, run `npm start` in one terminal and `npm run test:browser` in another. The test uses installed Microsoft Edge through Playwright. If Edge is unavailable, install a Playwright browser and adjust the test's launch channel. Browser screenshots go to ignored `tests/artifacts/`.

Use the live acceptance checklist in `SETUP.md` after connecting the real project. Do not treat this package as commissioned for daily production use until those live checks pass.
