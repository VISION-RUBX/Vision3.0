import {
  formatDisplayName,
  initTheme,
  initPerformanceMode,
  initParticleField,
  loadJson,
  markPageReady,
  openAboutBlankWindow,
  startTransition
} from "./site.js?v=20260520-auth-live";
import { initAuthSession, saveThemePreference, startPlaytimeTracker, subscribeToSession } from "./auth-service.js?v=20260520-auth-live";

const GAME_DATA_PATH = "./games.json?v=20260520-auth-live";

const particleCanvas = document.getElementById("particleCanvas");
const homepageButton = document.getElementById("homepageButton");
const openBlankButton = document.getElementById("openBlankButton");
const fullscreenButton = document.getElementById("fullscreenButton");
const fullscreenLabel = document.getElementById("fullscreenLabel");
const themeSelect = document.getElementById("themeSelect");
const playerTitle = document.getElementById("playerTitle");
const playerMeta = document.getElementById("playerMeta");
const playerStatus = document.getElementById("playerStatus");
const playerError = document.getElementById("playerError");
const frameWrap = document.getElementById("frameWrap");
const gameFrame = document.getElementById("gameFrame");

let leaving = false;

document.addEventListener("DOMContentLoaded", async () => {
  markPageReady();
  initPerformanceMode();
  initParticleField(particleCanvas);
  const theme = initTheme(themeSelect);
  initAuthSession();
  startPlaytimeTracker();
  subscribeToSession(session => {
    if (session?.profile?.theme) {
      themeSelect.value = session.profile.theme;
    }
  });
  theme.subscribe(nextTheme => {
    void saveThemePreference(nextTheme).catch(() => {});
  });

  homepageButton.addEventListener("click", goHome);
  openBlankButton?.addEventListener("click", () => {
    openAboutBlankWindow(window.location.href, {
      title: "Opening Vision",
      message: "Launching this page in a clean tab."
    });
  });
  fullscreenButton.addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", syncFullscreenState);
  document.addEventListener("keydown", handleKeydown, true);

  await loadPlayer();
});

async function loadPlayer() {
  const params = new URLSearchParams(window.location.search);
  const selectedKey = params.get("game");

  if (!selectedKey) {
    showError("No game key was provided.");
    return;
  }

  try {
    const games = await loadJson(GAME_DATA_PATH);

    const game = Array.isArray(games) ? games.find(entry => entry.key === selectedKey) : null;
    if (!game) {
      showError("That game was not found in the launcher list.");
      return;
    }

    const displayName = formatDisplayName(game.name);
    playerTitle.textContent = displayName;
    playerMeta.textContent = `${game.platform || "Web"} - ${game.category === "Mixed" ? "Mixed / Featured" : `Category ${game.category}`}`;
    playerStatus.textContent = "Opening dedicated game tab...";
    document.title = `${displayName} | Vision`;

    frameWrap.classList.remove("hidden");
    requestAnimationFrame(() => {
      frameWrap.classList.add("is-visible");
    });

    gameFrame.addEventListener("load", () => {
      frameWrap.classList.add("is-loaded");
      playerStatus.textContent = "Game loaded. Press Homepage to return, and Enter exits fullscreen.";
    }, { once: true });

    gameFrame.src = game.path;
  } catch (error) {
    console.error(error);
    showError("The player could not load its local files.");
  }
}

async function goHome() {
  if (leaving) {
    return;
  }

  leaving = true;
  homepageButton.disabled = true;
  openBlankButton.disabled = true;
  fullscreenButton.disabled = true;
  playerStatus.textContent = "Returning to homepage...";

  if (document.fullscreenElement === frameWrap) {
    try {
      await document.exitFullscreen();
    } catch (error) {
      console.error(error);
    }
  }

  startTransition(() => {
    const opener = window.opener;

    if (opener && !opener.closed) {
      try {
        opener.focus();
        window.close();
      } catch (error) {
        console.error(error);
      }
    }

    window.setTimeout(() => {
      if (!window.closed) {
        window.location.replace("./index.html");
      }
    }, 40);
  }, 220);
}

function showError(message) {
  playerError.classList.remove("hidden");
  frameWrap.classList.add("hidden");
  playerTitle.textContent = "Game unavailable";
  playerStatus.textContent = "Return to the launcher and pick another game.";
  playerError.querySelector("p").textContent = message;
}

async function toggleFullscreen() {
  if (document.fullscreenElement === frameWrap) {
    await document.exitFullscreen();
    return;
  }

  if (!frameWrap.classList.contains("hidden")) {
    await frameWrap.requestFullscreen();
    frameWrap.focus();
  }
}

function syncFullscreenState() {
  const isFullscreen = document.fullscreenElement === frameWrap;
  fullscreenLabel.textContent = isFullscreen ? "Exit Fullscreen" : "Fullscreen";
  frameWrap.classList.toggle("is-fullscreen", isFullscreen);

  if (frameWrap.classList.contains("is-loaded")) {
    playerStatus.textContent = isFullscreen
      ? "Fullscreen on. Press Enter to step back out."
      : "Game loaded. Press Homepage to return, and Enter exits fullscreen.";
  }
}

function handleKeydown(event) {
  if (event.key !== "Enter") {
    return;
  }

  if (document.fullscreenElement === frameWrap) {
    event.preventDefault();
    event.stopPropagation();
    document.exitFullscreen().catch(() => {});
  }
}
