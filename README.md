# Vision 3.0

Static GitHub Pages game launcher built from `games.json`.

## Files

- `index.html`: launcher hub
- `play.html`: fullscreen game loader
- `games.json`: all game keys and URLs
- `updates.json`: update posts for the updates tab
- `styles.css`: shared UI styling and animations
- `app.js`: dynamic card generation and search
- `play.js`: iframe loader and back transition

## Daily updates

1. Open `games.json` to change the launcher games.
2. Open `updates.json` to add daily update posts.
3. Keep game keys lowercase with underscores.
4. Commit and push the repo to GitHub.
5. GitHub Pages will serve the updated launcher.

Example entry:

```json
"basketball_stars": "https://vision-rubx.github.io/BASKETBALL_STARS/"
```

Example update:

```json
{
  "date": "2026-04-27",
  "title": "New Games Added",
  "summary": "Added more launcher entries and cleaned up the home page.",
  "notes": [
    "Updated games.json",
    "Adjusted the search and tab layout"
  ]
}
```

## Local preview

Run a simple static server from the repo root:

```powershell
python -m http.server 4173
```

Then open `http://localhost:4173/`.
