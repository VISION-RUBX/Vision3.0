# Vision 3.0

GitHub Pages launcher for validated games, local music playback, and updates.

## Main files

- `index.html`: launcher homepage
- `play.html`: game player page
- `games.json`: validated game manifest
- `music.json`: local music manifest
- `updates.json`: update posts
- `app.js`: homepage logic
- `play.js`: player logic
- `site.js`: shared focus mode, particles, transitions, and music dock
- `styles.css`: shared UI styling
- `games/`: local validated game files
- `music/`: local audio files pulled from the Canva page
- `scripts/build-manifests.mjs`: rebuilds `games.json`, `music.json`, `games/`, and `music/`

## Daily updates

For normal content updates:

1. Edit `updates.json` to change the Updates tab.
2. Commit and push.

For music or game source rebuilds:

1. Run:

```powershell
node .\scripts\build-manifests.mjs
```

2. This refreshes:
   - `games.json`
   - `music.json`
   - `games/`
   - `music/`
   - `build-report.json`
3. Commit and push.

## Manifest shapes

`games.json` uses an array:

```json
[
  {
    "key": "99_balls",
    "name": "99 balls",
    "category": "Mixed",
    "platform": "Web",
    "popular": true,
    "order": 5,
    "fileId": "1wDO0ksBgJdb4PVn7GzaAtwJDpkoS3Es4",
    "sourceUrl": "https://drive.google.com/file/d/1wDO0ksBgJdb4PVn7GzaAtwJDpkoS3Es4/view?usp=drive_link",
    "path": "./games/99_balls.html"
  }
]
```

`music.json` uses an array:

```json
[
  {
    "key": "adapt_vision2",
    "name": "Adapt VISION2",
    "path": "./music/adapt_vision2.mp3"
  }
]
```

## Local preview

Run a static server from the repo root:

```powershell
python -m http.server 4173
```

Then open:

`http://127.0.0.1:4173/`
