# Flat Chores

Flat Chores is a small installable PWA for sharing weekly household chores fairly across a flat. It rotates weekly and biweekly jobs, respects bathroom zones, and lets people mark away weeks so chores are reassigned to the people who are home.

Live site: https://ansh-jainx.github.io/chores/

## Edit the household

Default household data lives in `public/household.json`. Edit that file to change:

- `people`: each flatmate's `id`, display `name`, and `bathZone` (`"up"` or `"down"`).
- `chores`: each chore's `id`, `name`, `cadence` (`"weekly"` or `"biweekly"`), and optional `zone`.
- `biweeklyParity`: whether biweekly chores run on even (`0`) or odd (`1`) ISO week numbers.

Keep `id` values stable where possible so saved away weeks and shared links continue to match the same people and chores.

## Share links and away weeks

Away weeks are stored in the browser with the household setup. Mark a person away for an ISO week and the scheduler skips them for that week, redistributing their chores to present flatmates. Zone chores stay within the matching bathroom zone unless everyone in that zone is away, in which case the app can spill the chore to another present person with a warning.

Share links encode the current household and away-week state in the URL hash. Send a share link to another flatmate to copy that setup into their browser without needing a backend account.

## Local development

```sh
npm i
npm run dev
```

## Deploy on GitHub Pages

The app is configured for the `/chores/` GitHub Pages base path. To enable deployment:

1. Open the repository on GitHub.
2. Go to Settings -> Pages.
3. Set Source to GitHub Actions.
4. Push to `main` or run the Pages workflow manually.
