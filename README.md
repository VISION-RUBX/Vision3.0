# Vision 3.0

GitHub Pages launcher for validated games, local music playback, saved accounts, avatars, themes, and leaderboard tracking.

Deploys from the repo root on GitHub Pages.

## Main files

- `index.html`: launcher homepage
- `play.html`: game player page
- `account.html`: sign in, sign up, avatar, and profile management
- `leaderboard.html`: leaderboard explainer and ranking page
- `games.json`: ready-only game manifest
- `music.json`: local music manifest
- `updates.json`: update posts
- `app.js`: homepage logic
- `play.js`: player logic
- `account.js`: account page logic
- `leaderboard.js`: leaderboard page logic
- `auth-service.js`: Firebase auth, profile, and leaderboard data layer
- `avatar.js`: 8-bit avatar renderer and avatar defaults
- `firebase-config.js`: Firebase project configuration placeholder
- `firestore.rules`: Firestore security rules reference
- `site.js`: shared particles, themes, transitions, and music dock
- `styles.css`: shared UI styling
- `games/`: local validated game files
- `music/`: local audio files pulled from the Canva page
- `scripts/build-manifests.mjs`: rebuilds `games.json`, `music.json`, `games/`, and `music/`

## Daily updates

For normal content updates:

1. Edit `updates.json` to change the Updates tab.
2. Commit and push.

## Firebase account setup

To turn on email/password login, Google login, synced profiles, avatars, and the leaderboard:

1. Create a Firebase project.
2. Enable Firebase Authentication:
   - Email/Password
   - Google
3. Create a Firestore database.
4. Add `vision-rubx.github.io` to the authorized domains in Firebase Authentication.
5. Replace the placeholder values in `firebase-config.js`.
6. Apply the rules in `firestore.rules` to your Firestore project.

### Owner / admin account

The UI only exposes the owner panel when a user document has `role: "owner"`.

For a secure owner account:

1. Create your account normally.
2. Set your Firestore user document role to `owner`, or assign an owner/admin custom claim from a privileged Firebase Admin environment.

Do not rely on client-side hidden emails or JavaScript-only checks for admin access.

For music or game source rebuilds:

1. Run:

```powershell
$env:VISION_GAMES_HTML_SOURCE_URL = "your html export url"
$env:VISION_GAMES_TEXT_SOURCE_URL = "your text export url"
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
