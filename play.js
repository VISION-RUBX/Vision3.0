import {
  createMusicPlayer,
  formatDisplayName,
  initFocusMode,
  initParticleField,
  loadJson,
  markPageReady,
  mountMusicDock,
  startTransition
} from "./site.js";

const GAME_DATA_PATH = "./games.json";
const MUSIC_DATA_PATH = "./music.json";

const particleCanvas = document.getElementById("particleCanvas");
const homepageButton = document.getElementById("homepageButton");
const fullscreenButton = document.getElementById("fullscreenButton");
const fullscreenLabel = document.getElementById("fullscreenLabel");
const focusModeButton = document.getElementById("focusModeButton");
const playerTitle = document.getElementById("playerTitle");
const playerMeta = document.getElementById("playerMeta");
const playerStatus = document.getElementById("playerStatus");
const playerError = document.getElementById("playerError");
const frameWrap = document.getElementById("frameWrap");
const frameLoading = document.getElementById("frameLoading");
const gameFrame = document.getElementById("gameFrame");
const musicDock = document.getElementById("musicDock");

let musicController = null;
let previousMuteState = null;
let leaving = false;

document.addEventListener("DOMContentLoaded", async () => {
  markPageReady();

  const focusMode = initFocusMode(focusModeButton);
  const particles = initParticleField(particleCanvas);
  focusMode.subscribe(enabled => {
    particles.setFocusMode(enabled);

    if (!musicController) {
      return;
    }

    if (enabled) {
      previousMuteState = musicController.getState().muted;
      musicController.setMuted(true);
      return;
    }

    if (previousMuteState !== null) {
      musicController.setMuted(previousMuteState);
      previousMuteState = null;
    }
  });

  homepageButton.addEventListener("click", goHome);
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
    const [games, tracks] = await Promise.all([
      loadJson(GAME_DATA_PATH),
      loadJson(MUSIC_DATA_PATH)
    ]);

    musicController = createMusicPlayer(Array.isArray(tracks) ? tracks : []);
    mountMusicDock(musicDock, musicController);
    if (document.body.classList.contains("focus-mode")) {
      previousMuteState = musicController.getState().muted;
      musicController.setMuted(true);
    }

    const game = Array.isArray(games) ? games.find(entry => entry.key === selectedKey) : null;
    if (!game) {
      showError("That game was not found in the validated list.");
      return;
    }

    const displayName = formatDisplayName(game.name);
    playerTitle.textContent = displayName;
    playerMeta.textContent = `${game.platform || "Web"} • ${game.category === "Mixed" ? "Mixed / Featured" : `Category ${game.category}`}`;
    playerStatus.textContent = "Opening local validated build...";
    document.title = `${displayName} | Vision 3.0`;

    frameWrap.classList.remove("hidden");
    requestAnimationFrame(() => {
      frameWrap.classList.add("is-visible");
    });

    gameFrame.addEventListener("load", () => {
      frameWrap.classList.add("is-loaded");
      frameLoading.textContent = "Game ready.";
      playerStatus.textContent = "Game loaded. Fullscreen is available, and Enter exits fullscreen.";
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
  fullscreenButton.disabled = true;
  focusModeButton.disabled = true;
  playerStatus.textContent = "Returning to homepage...";

  if (document.fullscreenElement === frameWrap) {
    try {
      await document.exitFullscreen();
    } catch (error) {
      console.error(error);
    }
  }

  startTransition(() => {
    window.location.href = "./index.html";
  }, 280);
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
      : "Game loaded. Fullscreen is available, and Enter exits fullscreen.";
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
