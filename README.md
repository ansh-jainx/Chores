# Flat Chores

Flat Chores is a small installable PWA for sharing weekly household chores fairly across a flat. It rotates weekly and biweekly jobs, respects bathroom zones, and lets people mark away weeks so chores are reassigned to the people who are home.

Live site: https://ansh-jainx.github.io/Chores/

## Edit the household

Default household data lives in `public/household.json`. Edit that file to change the defaults loaded by new browsers and by the in-app "Reset to defaults" action:

- `people`: each flatmate's `id`, display `name`, and `bathZone` (`"up"` or `"down"`).
- `chores`: each chore's `id`, `name`, `cadence` (`"weekly"` or `"biweekly"`), and optional `zone`.
- `biweeklyParity`: whether biweekly chores run on even (`0`) or odd (`1`) ISO week numbers.

The Setup tab can also edit people, chores, and biweekly parity in the browser. Those edits are saved in local storage with away weeks; they do not write back to `public/household.json`. Existing browsers with saved data keep using their saved setup until they reset to defaults, clear site data, or open a share link.

Keep `id` values stable where possible so saved away weeks and share links continue to match the same people and chores.

## Share links and away weeks

Away weeks are stored in the browser with the household setup. The Away tab shows the selected week and the next seven ISO weeks as `YYYY-Www` chips. Mark a person away for an ISO week and the scheduler skips them for that week, redistributing their chores to present flatmates. If everyone is away, the app shows no assignments for that week. Zone chores stay within the matching bathroom zone unless everyone in that zone is away, in which case the app can spill the chore to another present person with a warning.

Share links use the current page URL plus a `#s=<base64url-json>` hash, for example:

```text
https://ansh-jainx.github.io/Chores/#s=eyJob3VzZWhvbGQiOi...
```

The encoded JSON contains the current household and away-week state. Send a share link to another flatmate to copy that setup into their browser without needing a backend account.

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
