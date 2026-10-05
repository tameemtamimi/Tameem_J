# Username + Password — setup stages

**Your database already has `001_store.sql`. Do not run it again.** This update preserves your tables, prices, history, staff roles, RLS, design and calculator. Work through the stages below one at a time. Keep your existing Supabase project and GitHub repository.

## Stage 1 — Run the new migration

1. In your existing Supabase project, open **SQL Editor → New query**.
2. Paste the complete contents of **`database/002_username_auth.sql`**.
3. Click **Run**. Wait for success.

This adds an optional username to existing profiles, unique case-insensitive usernames, validation, and a server-only account-provisioning function. It does not delete any data or change existing RLS policies. Run it once. Stop here before proceeding to Stage 2 if you need help.

## Stage 2 — Create the FIRST Admin

No existing Admin is assumed. For this example the username will be **tamim** and the display name **تميم**. Choose a strong password of at least 12 characters. Do not put that password in a SQL query or project file. Before creating it, turn **Allow new users to sign up** off if it is still enabled.

1. Open **Authentication → Users → Add user → Create new user** in Supabase.
2. In Supabase's **Email** field, enter **`tamim@users.wj.invalid`**. This is an internal account identifier, not a real inbox. Staff will only type **tamim** on your website. Supabase's password provider needs this internal identifier; the website never asks staff for it.
3. Enter your chosen password **only in the dashboard's Password field**. Enable **Auto Confirm User / Auto Confirm Email** when offered, then create the user. No confirmation email should be sent to the internal identifier.
4. Continue only if the account you just created succeeded. If Supabase reports that the identifier already exists, stop and verify its owner; do not promote an unknown account. Open **SQL Editor → New query**, paste **`database/first_admin.sql`**, and click **Run**. Its example values are `tamim` and `تميم`. If you chose another username, change `chosen_username` in that query to the same username you used before `@users.wj.invalid` in step 2. Change `chosen_display_name` if desired. No password belongs in this query.
5. Confirm the result in **Table Editor → staff_profiles**: username `tamim`, role `admin`, active `true`.

The bootstrap query refuses to run if an active Admin already exists. If that happens, do not delete the Admin or recreate the database. Use the existing account; see “Existing accounts” below if it needs a username.

Username rules: 3–32 characters, starts with an English letter; remaining characters may be English letters, digits, `_` or `-`. `Tamim`, `TAMIM` and `tamim` are the same username. Arabic is supported in the separate display name.

## Stage 3 — Check Auth settings

Only change settings that differ from these:

1. Under **Authentication → Sign In / Providers**, keep the **Email/password provider enabled**. It backs the internal username identifiers. Staff still see only Username + Password.
2. Turn **Allow new users to sign up** off. There is no public registration. Turn anonymous sign-ins off. Do not enable an email-OTP-only or phone login flow for this site.
3. Use a minimum password length of at least 12 characters. Leave Supabase's token refresh and rotation enabled. Keep normal session settings; avoid short inactivity/session limits if you want staff to stay signed in.

Do not disable email confirmation globally merely to support usernames: trusted account creation uses `email_confirm: true`. For the first account, confirm it through the trusted dashboard as described above. Existing Site URL settings can remain unchanged; this version does not use email recovery links.

## Stage 4 — Check the frontend public configuration

If `config.js` is already configured for this project, keep its values. Otherwise copy your **Project URL** and **publishable key** into the two blank fields:

```js
window.STORE_CONFIG = Object.freeze({
  supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
  supabasePublishableKey: 'YOUR_PUBLISHABLE_KEY'
});
```

Get these from your Supabase project's Connect/settings and **API Keys** pages. A legacy `anon` key also works. Never place a `service_role`, `sb_secret_`, database password or personal password in this file or anywhere in the frontend. These public values are the only frontend configuration needed.

## Stage 5 — Test Username + Password

1. Open the project folder in VS Code. Run **`npm start`** in its terminal (Node.js required), then open **`http://localhost:4180/`**.
2. Sign in using **tamim** and the password you chose in Stage 2. You should see **أهلاً تميم** and the existing calculator.
3. Refresh the page. It should restore the session without flashing the login form.
4. Close/reopen the page, then try logout and login again. Try an incorrect username or password; it must not grant access.

You can test the first Admin login before deploying the staff-creation function. Do not double-click `index.html` for authentication testing; use the local server or the final HTTPS site.

## Stage 6 — Enable secure employee creation

This is a one-time Supabase Edge Function deployment. It does not move the website away from GitHub Pages.

**Dashboard method:**

1. Open **Edge Functions → Deploy a new function → Via Editor**.
2. Name the function exactly **`create-staff`**.
3. Replace the editor's sample `index.ts` with the complete contents of **`supabase/dashboard-create-staff.ts`**. This single-file copy is supplied for easy pasting.
4. Deploy it. In this function's configuration, turn **Verify JWT with legacy secret** off. The function itself validates the caller using Supabase Auth and checks the caller's live Admin role through RLS before performing privileged work. It is not an anonymous account-creation endpoint.
5. Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` inside its hosted function environment. Do not copy any privileged value into the website, GitHub, SQL scripts, or chat. No new browser secret is required.

If using the Supabase CLI instead, run these from the project folder after installing the CLI:

```text
supabase login
supabase functions deploy create-staff --project-ref YOUR_PROJECT_REF --no-verify-jwt
```

The canonical source is `supabase/functions/create-staff/`. `supabase/config.toml` contains its gateway setting. The dashboard single-file copy is generated from that source using `node scripts/build-edge.cjs`.

Then sign in as Admin, open **الإعدادات**, scroll to **إنشاء حساب موظف**, enter username, password, display name and role, and press **إنشاء الحساب**. Choose Employee for ordinary staff. Only Admins can create accounts, including additional Admins. Share initial credentials privately with the employee. Duplicate usernames are rejected, not overwritten. Account creation never logs the Admin out or replaces the Admin's session with the new user's session.

If creation fails after the Auth account is created, the server attempts to remove that newly created account. If cleanup also fails, the UI asks the project owner to inspect the orphan in **Authentication → Users**. It has no staff profile and therefore no store access. Verify the identifier and absence of a staff profile before removing an orphan; never delete an existing working account to resolve a username conflict.

## Stage 7 — Update GitHub Pages

Back up/commit the existing repository first. Replace the website files with this updated project's contents, keeping your actual `config.js` values and any existing `CNAME` file. Include `username.js` and the other updated scripts. Keep `index.html` at the existing Pages publishing root; do not add an extra folder layer. Commit and push. Your existing Pages configuration should redeploy automatically; no new hosting setup is required.

The Edge Function deployment in Stage 6 is separate: pushing to GitHub does not deploy it. After deployment, the browser talks to Supabase directly and your computer can be turned off.

## Existing accounts — preserve their IDs and history

The migration deliberately leaves existing profiles' usernames blank rather than guessing their identity or changing their passwords. Existing valid sessions continue working with their original role. To give an existing email-based Auth account a username, keep the **same Auth user UUID**. Do not delete/recreate that user.

A trusted project owner can run:

```text
node scripts/account-maintenance.cjs
```

Choose **link-existing**. The tool asks for the project URL, the owner's legacy `service_role` key in a **hidden local terminal prompt**, the new username, and the existing Auth user UUID. It uses Supabase's Auth Admin API to change the internal identifier, then links the username on the existing profile. It preserves the UUID, password, role, display name and history. The key is used only in that process's memory; it is not written to a file. Never enter it into the website or paste it into chat. Run this tool only on your own trusted computer, not a shared terminal or screen recording.

The script stops for duplicate names, missing profiles or failed operations. If it reports that rollback failed, inspect the user's Auth identifier and staff username before retrying. The regular website's account-creation feature is for **new** accounts, not migration or replacement of existing ones.

## Forgotten passwords and revocation

There are no email-based recovery screens or fake recovery emails. Staff contact the store administrator. A trusted project owner can use the same local maintenance tool, choose **reset-password**, and enter the username and new password at hidden prompts. The password is sent over HTTPS to Supabase Auth, which hashes/stores it; it is never written to a custom table or file.

For an account that must immediately lose store access, set `staff_profiles.active` to `false` in the trusted Supabase dashboard, and ban the Auth user as appropriate. Existing RLS checks this on subsequent requests. Do not rely on changing a password alone as your immediate account-revocation procedure. The owner can restore access later after resolving the issue.

## Architecture and security

- A normalized username maps deterministically to `username@users.wj.invalid`, an internal Supabase Auth identifier. This is real Supabase password authentication, not a custom password table. The identifier is not a secret and may be present in developer tools/Auth responses; it is never displayed in the normal login UI.
- `staff_profiles.username` has a uniqueness constraint and validation. Only trusted administration writes it. A database trigger checks that the mapping matches the Auth user. Existing Admin/Employee table policies are unchanged.
- The browser uses Supabase `signInWithPassword` with the derived internal identifier. There is no public username lookup endpoint or directory and no privileged credential in the browser. Unknown username and wrong password receive the same user-facing failure message. Supabase Auth rate limits still apply.
- The staff-creation function checks the JWT with `getUser`, checks live Admin membership through the caller's RLS context, then uses a server-only Auth Admin client. A service-only database function rechecks the Admin/session before creating the profile. Neither employees nor anonymous users can call that provisioning RPC successfully.
- Passwords appear only in transient password fields/request memory and are sent over HTTPS to Supabase Auth (through the protected server function for new accounts). They are never logged, added to custom tables, or saved in localStorage/GitHub.
- Supabase continues to persist/refresh access and refresh tokens with its official SDK. Passwords are not persisted. Startup waits for restoration before showing login. Logout revokes the current Supabase session and clears the UI. A pending-logout flag prevents connection failure from silently signing the user back in.
- Sell/Buy pricing, exact arithmetic, shared settings, immutable history, price-range enforcement, existing RLS, navy/gold styling and the WJ Apple touch icon remain in place.

## iPhone persistence

Use the same final HTTPS URL consistently. Safari restores its saved session unless website storage is cleared, the account/session is revoked, private browsing is used, or another security/browser condition requires login.

For **Share → Add to Home Screen**, turn **Open as Web App** off if you want the shortcut to reuse Safari's session. If you choose standalone app mode, iOS may use separate storage: sign in once there, then subsequent launches should restore that app's session. No static website can promise that separate Safari/app storage will share a login automatically. The WJ icon configuration is preserved.

## Verification and remaining live checks

Automated checks cover username normalization, no email field, login failures, restoration/reopening, expired-session refresh, logout/re-login, Admin account-creation UI, duplicate creation, handler authorization and cleanup, additive migration, first Admin bootstrap, preserved RLS, staff permissions and existing calculator behavior. Database tests use actual PostgreSQL via PGlite with disposable Auth stubs; browser/handler tests use isolated responses. They are not a substitute for your hosted project.

After setup, test an actual Employee login, duplicate username, wrong password, Employee denial of account creation/settings changes, disabled user, two devices, refresh, Safari close/reopen, Home Screen launch, and logout. We have not deployed or tested your live project, and physical iPhone testing remains necessary.

Developer checks (Node.js 24): `npm test`; after `npm install`, run `npm run test:database`, `npm run test:username-db`, `npm run test:auth-server`; with `npm start` running, run `npm run test:browser`. The tests install the original schema only in an empty disposable database. This is **not** an instruction to rerun `001_store.sql` in your existing project.

Official references: [Supabase password sign-in](https://supabase.com/docs/reference/javascript/auth-signinwithpassword), [server-only account creation](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [Edge Function dashboard deployment](https://supabase.com/docs/guides/functions/quickstart-dashboard), [function secrets](https://supabase.com/docs/guides/functions/secrets), [sessions](https://supabase.com/docs/guides/auth/sessions), [WebKit Home Screen storage](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/).
