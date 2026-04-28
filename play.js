const GAME_DATA_PATH = "./games.json";
const TITLE_FALLBACK = "Vision 3.0 Player";
const GAME_NAME_OVERRIDES = {
  fridaynightfunkingsonicexe: "Friday Night Funkin Exe",
  idkthegamenamelol: "Tomb Of The Mask",
  slowp: "Slope",
  subiceland: "Subway Surfers Iceland",
  webcomewhatwebehold: "We Become What We Behold",
  whackyobuss: "Whack Your Boss",
  whackyurpc: "Whack Your PC",
  whg1: "Worlds Hardest Game 1"
};

const backButton = document.getElementById("backButton");
const fullscreenButton = document.getElementById("fullscreenButton");
const fullscreenLabel = document.getElementById("fullscreenLabel");
const playerTitle = document.getElementById("playerTitle");
const playerStatus = document.getElementById("playerStatus");
const playerError = document.getElementById("playerError");
const frameWrap = document.getElementById("frameWrap");
const frameLoading = document.getElementById("frameLoading");
const gameFrame = document.getElementById("gameFrame");
let isLeavingHomepage = false;

document.addEventListener("DOMContentLoaded", async () => {
  requestAnimationFrame(() => {
    document.body.classList.add("is-ready");
  });

  backButton.addEventListener("click", goBack);
  fullscreenButton.addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", syncFullscreenState);
  document.addEventListener("keydown", handleKeydown, true);
  await loadSelectedGame();
});

async function loadSelectedGame() {
  const params = new URLSearchParams(window.location.search);
  const selectedKey = params.get("game");

  if (!selectedKey) {
    showError("No game key was provided in the URL.");
    return;
  }

  try {
    const response = await fetch(GAME_DATA_PATH, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Unable to fetch games.json");
    }

    const rawGames = await response.json();
    const selectedUrl = rawGames[selectedKey];
    if (!selectedUrl) {
      showError(`The key "${selectedKey}" does not exist in games.json.`);
      return;
    }

    const displayName = formatGameName(selectedKey, selectedUrl);
    playerTitle.textContent = displayName;
    playerStatus.textContent = "Launching game...";
    document.title = `${displayName} | Vision 3.0`;

    frameWrap.classList.remove("hidden");
    requestAnimationFrame(() => {
      frameWrap.classList.add("is-visible");
    });

    gameFrame.addEventListener("load", () => {
      frameWrap.classList.add("is-loaded");
      playerStatus.textContent = "Game loaded. Use Fullscreen, Enter exits fullscreen, and Homepage returns you to the hub.";
      frameLoading.textContent = "Game ready.";
    }, { once: true });

    gameFrame.src = selectedUrl;
  } catch (error) {
    console.error(error);
    showError("The player could not load games.json.");
  }
}

async function goBack() {
  if (isLeavingHomepage) {
    return;
  }

  isLeavingHomepage = true;
  playerStatus.textContent = "Returning to homepage...";
  backButton.disabled = true;
  fullscreenButton.disabled = true;

  if (document.fullscreenElement === frameWrap) {
    try {
      await document.exitFullscreen();
    } catch (error) {
      console.error(error);
    }
  }

  startTransition(() => {
    window.location.href = "./index.html";
  }, 260);
}

function showError(message) {
  playerTitle.textContent = "Game not found";
  playerStatus.textContent = "Return to the launcher and try another game.";
  playerError.classList.remove("hidden");
  const paragraph = playerError.querySelector("p");
  if (paragraph) {
    paragraph.textContent = message;
  }
  document.title = TITLE_FALLBACK;
}

function formatGameName(key, url) {
  if (GAME_NAME_OVERRIDES[key]) {
    return GAME_NAME_OVERRIDES[key];
  }

  let slug = key;

  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length > 0) {
      slug = parts[parts.length - 1];
    }
  } catch (error) {
    slug = key;
  }

  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map(token => formatToken(token))
    .join(" ");
}

function formatToken(token) {
  if (!token) {
    return token;
  }

  const upperTokens = new Set(["fnaf", "csgo", "lol", "io", "whg1", "dxsh"]);
  if (upperTokens.has(token.toLowerCase())) {
    return token.toUpperCase();
  }

  if (/[A-Z]{2,}/.test(token) || /^[0-9]+[A-Za-z0-9]*$/.test(token)) {
    return token;
  }

  return token.charAt(0).toUpperCase() + token.slice(1);
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
  const nextLabel = isFullscreen ? "Exit Fullscreen" : "Fullscreen";

  fullscreenLabel.textContent = nextLabel;
  frameWrap.classList.toggle("is-fullscreen", isFullscreen);

  if (frameWrap.classList.contains("is-loaded")) {
    playerStatus.textContent = isFullscreen
      ? "Fullscreen on. Press Enter to exit, or use Homepage."
      : "Game loaded. Use Fullscreen, Enter exits fullscreen, and Homepage returns you to the hub.";
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

function startTransition(callback, delay = 220) {
  document.body.classList.add("is-transitioning");
  window.setTimeout(callback, delay);
}
