# Flat Chores

Flat Chores is a small installable PWA for sharing weekly household chores fairly across a flat. It rotates weekly and biweekly jobs, respects bathroom zones and effort tiers, and lets people mark holiday date ranges so chores are reassigned when someone is away for 4+ days in a week.

Live site: https://ansh-jainx.github.io/Chores/

## Edit the household

Default household data lives in `public/household.json`. Edit that file to change the defaults loaded by new browsers and by the in-app "Reset to defaults" action:

- `people`: each flatmate's `id`, display `name`, and `bathZone` (`"up"` or `"down"`).
- `chores`: each chore's `id`, `name`, `cadence` (`"weekly"` or `"biweekly"`), optional `zone`, and optional `effort` (`"heavy"`, `"medium"`, `"light"`).
- `biweeklyParity`: whether biweekly chores run on even (`0`) or odd (`1`) ISO week numbers.

The Setup tab can also edit people, chores, and biweekly parity in the browser. With cloud sync enabled, those edits (and holidays) sync to every device automatically. Without cloud sync, edits stay in that browser's local storage only.

Keep `id` values stable where possible so saved holidays continue to match the same people and chores.

## Cloud sync (names + holidays across phones)

The live site needs a free Firebase Realtime Database so every flatmate sees the same names and holidays.

1. Open [Firebase Console](https://console.firebase.google.com/) and create a project (Spark / free).
2. Add a **Web** app; copy the `firebaseConfig` values.
3. Create a **Realtime Database** (start in test mode for a private flat app, or use the rules below).
4. Copy [`public/firebase-config.example.json`](public/firebase-config.example.json) to `public/firebase-config.json` and fill in the values. Keep `householdPath` as `households/flat-chores` unless you want a different shared bucket.
5. Set Realtime Database rules to:

```json
{
  "rules": {
    "households": {
      "flat-chores": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

6. Commit `firebase-config.json` and push to `main` (GitHub Pages will redeploy).

The header shows **Synced across devices** when cloud sync is working.

## Holidays

On the Holidays tab, pick who is away, give the trip a name, and choose **Away from** / **Back on** dates on the calendar. The app decides which Mon–Sun weeks skip chores (4+ days away in that week). The This week view shows who is on holiday and the holiday name.

## Local development

```sh
npm install
npm run dev
```

Useful scripts:

- `npm run dev`: start the Vite dev server.
- `npm run test`: run the Vitest test suite once.
- `npm run build`: run the TypeScript project build and create the production `dist/` bundle.

## Deploy on GitHub Pages

The app is configured for the `/Chores/` GitHub Pages base path. To enable deployment:

1. Open the repository on GitHub.
2. Go to Settings -> Pages.
3. Under "Build and deployment", set Source to "GitHub Actions".
4. Push to `main` or run the "Deploy to GitHub Pages" workflow manually.

The Pages workflow installs dependencies with `npm ci`, runs `npm run build`, uploads `dist/`, and deploys it to GitHub Pages. If the repository name changes, update the live-site URL here and the `/Chores/` base path in `vite.config.ts`.
