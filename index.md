# Eventora — Event Management System

A Bootstrap + JavaScript + Firebase project with two roles:
- **Admin:** dashboard analytics, student directory, create/delete events, view registration counts.
- **Student:** sign up/login, student dashboard, browse events, register once per event.

## 1. Firebase setup

1. Open https://console.firebase.google.com/ and select project **events2026-89a7e** (or create a project and replace the config in `app.js`).
2. Go to **Build → Authentication → Get started → Sign-in method** and enable **Email/Password**.
3. Go to **Build → Firestore Database → Create database**. Choose a location close to your users.
4. Open Firestore **Rules**, replace the rules with the contents of `firestore.rules`, and click **Publish**.
5. In **Authentication → Settings → Authorized domains**, ensure `localhost` is listed for local testing. Add your deployed domain later.

## 2. Create the admin manually (no admin sign-up)

1. Open **Authentication → Users → Add user**. Enter the admin email and a strong password.
2. Copy the newly created user's **UID**.
3. Open **Firestore Database → Data → Start collection**.
   - Collection ID: `users`
   - Document ID: paste the admin UID exactly.
   - Add fields:
     - `uid` — string — same UID
     - `name` — string — Admin
     - `email` — string — the admin email (same as Auth)
     - `role` — string — `admin`
     - `rollNumber` — string — `ADMIN`
     - `department` — string — `Administration`
4. Save. Now sign in using that email/password in the app. There is intentionally no admin sign-up option.

## 3. Run locally

Because this uses JavaScript modules, don't open `index.html` directly with `file://`.

**Option A — VS Code Live Server**
1. Extract the ZIP.
2. Open the extracted folder in VS Code.
3. Install the **Live Server** extension if needed.
4. Right-click `index.html` → **Open with Live Server**.
5. The page normally opens at `http://127.0.0.1:5500`.

**Option B — Python local server**
From the project folder, run `python -m http.server 5500`, then open `http://localhost:5500`.

## 4. Data collections

- `users/{uid}` — user profile and role.
- `rollNumbers/{ROLL_NUMBER}` — unique roll-number reservation.
- `events/{eventId}` — event details and registration UID list.

Firebase Authentication enforces unique email addresses. Roll numbers are uppercased and claimed in a Firestore transaction, so duplicates are rejected even if two people sign up at the same time.

## 5. Important security notes

- Do not publish permissive Firestore rules such as `allow read, write: if true`.
- The provided rules restrict event creation/deletion to admins and prevent public users from creating an admin profile.
- For a production-grade deployment, move role assignment and roll-number uniqueness into trusted server-side code (Firebase Cloud Functions/Admin SDK), and consider storing registrations in a separate subcollection to avoid document size limits on large events.
- Client-side configuration values like Firebase `apiKey` identify the web app; they are not an admin password. Security depends on Authentication, Firestore rules, and authorized domains.
- If signup creates an Auth user but profile creation fails, remove that orphan user in Firebase Console → Authentication → Users, then retry.
- If a duplicate roll-number attempt leaves a just-created Auth user, remove that user in Firebase Console. For a production app, implement cleanup with a callable Cloud Function.
- Test with a student account and an admin account before using real student data.

## 6. Troubleshooting

- `auth/configuration-not-found`: Enable Email/Password under Authentication → Sign-in method and verify the Firebase config/project.
- `permission-denied`: Confirm Firestore database exists, publish `firestore.rules`, and ensure the signed-in account has a matching `users/{UID}` document.
- Admin signs in but sees student dashboard: the user's `users/{UID}` document must have `role` exactly `admin`.
- Firebase app/module import errors: run through Live Server or `python -m http.server`; don't open as a local file.

## Project files

- `index.html` — page structure and forms
- `styles.css` — responsive design, animations and visual styling
- `app.js` — Firebase Auth, Firestore operations, validation and dashboard rendering
- `firestore.rules` — starter security rules
