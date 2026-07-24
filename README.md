# Flat Chores

Flat Chores is a small installable PWA for sharing weekly household chores fairly across a flat. It rotates weekly and biweekly jobs, respects bathroom zones and effort tiers, and lets people mark holiday date ranges so chores are reassigned when someone is away for 4+ days in a week.

Live site: https://ansh-jainx.github.io/Chores/

## Edit the household

Default household data lives in `public/household.json`. Edit that file to change the defaults loaded by new browsers and by the in-app "Reset to defaults" action:

- `people`: each flatmate's `id`, display `name`, and `bathZone` (`"up"` or `"down"`).
- `chores`: each chore's `id`, `name`, `cadence` (`"weekly"` or `"biweekly"`), optional `zone`, and optional `effort` (`"heavy"`, `"medium"`, `"light"`).
- `biweeklyParity`: whether biweekly chores run on even (`0`) or odd (`1`) ISO week numbers.

The Setup tab can also edit people, chores, and biweekly parity in the browser. Those edits are saved in local storage with holiday ranges; they do not write back to `public/household.json`. Existing browsers with saved data keep using their saved setup until they reset to defaults, clear site data, or open a share link.

Keep `id` values stable where possible so saved holidays and share links continue to match the same people and chores.

## Share links and holidays

Holidays are date ranges: **Away from** (first day away) to **Back on** (first day home again). A Mon–Sun week skips chores for that person only if they are away **4 or more days** in that week. Example: away Thu → back next Thu means 4 days in week 1 (no chores) and 3 days in week 2 (still chores).

Share links use the current page URL plus a `#s=<base64url-json>` hash, for example:

```text
https://ansh-jainx.github.io/Chores/#s=eyJob3VzZWhvbGQiOi...
```

The encoded JSON contains the current household and holiday state. Send a share link to another flatmate to copy that setup into their browser without needing a backend account.

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
