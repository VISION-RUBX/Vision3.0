import {
  STORAGE_KEYS,
  createMusicPlayer,
  escapeHtml,
  formatBytes,
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
const UPDATES_DATA_PATH = "./updates.json";
const CATEGORY_FILTERS = ["all", "popular", "mixed", ...Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ")];

const particleCanvas = document.getElementById("particleCanvas");
const searchInput = document.getElementById("searchInput");
const clearSearchButton = document.getElementById("clearSearch");
const focusModeButton = document.getElementById("focusModeButton");
const statusText = document.getElementById("statusText");
const loadingState = document.getElementById("loadingState");
const errorState = document.getElementById("errorState");
const emptyState = document.getElementById("emptyState");
const updatesEmptyState = document.getElementById("updatesEmptyState");
const musicEmptyState = document.getElementById("musicEmptyState");
const gameGrid = document.getElementById("gameGrid");
const updatesList = document.getElementById("updatesList");
const musicList = document.getElementById("musicList");
const filterBar = document.getElementById("filterBar");
const gamesTabCount = document.getElementById("gamesTabCount");
const musicTabCount = document.getElementById("musicTabCount");
const updatesTabCount = document.getElementById("updatesTabCount");
const totalGamesValue = document.getElementById("totalGamesValue");
const visibleGamesValue = document.getElementById("visibleGamesValue");
const musicTracksValue = document.getElementById("musicTracksValue");
const gamesPanel = document.getElementById("gamesPanel");
const musicPanel = document.getElementById("musicPanel");
const updatesPanel = document.getElementById("updatesPanel");
const tabButtons = [...document.querySelectorAll(".tab-button")];
const musicDock = document.getElementById("musicDock");
const featuredTrackName = document.getElementById("featuredTrackName");
const featuredTrackMeta = document.getElementById("featuredTrackMeta");
const featuredTrackStatus = document.getElementById("featuredTrackStatus");

let games = [];
let tracks = [];
let updates = [];
let musicController = null;
let activeTab = sessionStorage.getItem(STORAGE_KEYS.tab) || "games";
let categoryFilter = sessionStorage.getItem(STORAGE_KEYS.quickFilter) || "all";
let previousMuteState = null;
let lastMusicSummaryKey = "";
let lastMusicListKey = "";
let lastMusicListStateKey = "";

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

  searchInput.value = sessionStorage.getItem(STORAGE_KEYS.query) || "";
  renderFilterBar();
  wireEvents();
  await loadContent();
});

function wireEvents() {
  searchInput.addEventListener("input", () => {
    sessionStorage.setItem(STORAGE_KEYS.query, searchInput.value);
    renderActiveTab();
  });

  clearSearchButton.addEventListener("click", () => {
    searchInput.value = "";
    sessionStorage.setItem(STORAGE_KEYS.query, "");
    renderActiveTab();
    searchInput.focus();
  });

  filterBar.addEventListener("click", event => {
    const button = event.target.closest("[data-filter]");
    if (!button) {
      return;
    }

    categoryFilter = button.dataset.filter || "all";
    sessionStorage.setItem(STORAGE_KEYS.quickFilter, categoryFilter);
    renderFilterBar();
    renderActiveTab();
  });

  tabButtons.forEach(button => {
    button.addEventListener("click", () => {
      activeTab = button.dataset.tab || "games";
      sessionStorage.setItem(STORAGE_KEYS.tab, activeTab);
      renderActiveTab();
    });
  });

  gameGrid.addEventListener("click", event => {
    const link = event.target.closest(".game-card");
    if (!link) {
      return;
    }

    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
      return;
    }

    event.preventDefault();
    sessionStorage.setItem(STORAGE_KEYS.scroll, String(window.scrollY));
    startTransition(() => {
      window.location.href = link.href;
    });
  });

  musicList.addEventListener("click", event => {
    const button = event.target.closest("[data-track-key]");
    if (!button || !musicController) {
      return;
    }

    void musicController.selectByKey(button.dataset.trackKey, { autoplay: true });
  });
}

async function loadContent() {
  try {
    const [gameData, musicData, updatesData] = await Promise.all([
      loadJson(GAME_DATA_PATH),
      loadJson(MUSIC_DATA_PATH),
      loadJson(UPDATES_DATA_PATH)
    ]);

    games = Array.isArray(gameData)
      ? gameData.map(game => ({
          ...game,
          displayName: formatDisplayName(game.name),
          searchText: `${game.name} ${game.key} ${game.platform} ${game.category}`.toLowerCase()
        }))
      : [];

    tracks = Array.isArray(musicData)
      ? musicData.map(track => ({
          ...track,
          displayName: formatDisplayName(track.name),
          searchText: `${track.name} ${track.key}`.toLowerCase()
        }))
      : [];

    updates = Array.isArray(updatesData)
      ? updatesData.map((entry, index) => ({
          id: `${entry.date || "update"}-${index}`,
          date: entry.date || "",
          title: entry.title || `Update ${index + 1}`,
          summary: entry.summary || "",
          body: Array.isArray(entry.body) ? entry.body : [],
          notes: Array.isArray(entry.notes) ? entry.notes : []
        }))
      : [];

    totalGamesValue.textContent = String(games.length);
    visibleGamesValue.textContent = String(games.length);
    musicTracksValue.textContent = String(tracks.length);
    gamesTabCount.textContent = String(games.length);
    musicTabCount.textContent = String(tracks.length);
    updatesTabCount.textContent = String(updates.length);

    musicController = createMusicPlayer(tracks);
    mountMusicDock(musicDock, musicController);
    musicController.subscribe(handleMusicStateChange);
    if (document.body.classList.contains("focus-mode")) {
      previousMuteState = musicController.getState().muted;
      musicController.setMuted(true);
    }

    loadingState.classList.add("hidden");
    renderActiveTab();
    restoreScroll();
  } catch (error) {
    console.error(error);
    loadingState.classList.add("hidden");
    errorState.classList.remove("hidden");
    statusText.textContent = "Launcher data could not be loaded.";
  }
}

function renderActiveTab() {
  updateTabUi();

  if (activeTab === "music") {
    renderMusic();
    return;
  }

  if (activeTab === "updates") {
    renderUpdates();
    return;
  }

  renderGames();
}

function updateTabUi() {
  const gamesView = activeTab === "games";
  const musicView = activeTab === "music";
  const updatesView = activeTab === "updates";

  tabButtons.forEach(button => {
    const isActive = button.dataset.tab === activeTab;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });

  gamesPanel.classList.toggle("hidden", !gamesView);
  musicPanel.classList.toggle("hidden", !musicView);
  updatesPanel.classList.toggle("hidden", !updatesView);
  filterBar.classList.toggle("hidden", !gamesView);

  searchInput.placeholder = gamesView
    ? `Search ${games.length} games...`
    : musicView
      ? `Search ${tracks.length} tracks...`
      : "Search updates...";
}

function renderGames() {
  const query = searchInput.value.trim().toLowerCase();
  const filteredGames = games.filter(game => {
    if (categoryFilter === "popular" && !game.popular) {
      return false;
    }

    if (categoryFilter === "mixed" && game.category !== "Mixed") {
      return false;
    }

    if (categoryFilter.length === 1 && game.category !== categoryFilter) {
      return false;
    }

    if (!query) {
      return true;
    }

    return game.searchText.includes(query);
  });

  clearSearchButton.hidden = query.length === 0;
  visibleGamesValue.textContent = String(filteredGames.length);
  statusText.textContent = query
    ? `${filteredGames.length} game result${filteredGames.length === 1 ? "" : "s"} for "${searchInput.value.trim()}".`
    : `${filteredGames.length} validated game${filteredGames.length === 1 ? "" : "s"} ready to launch.`;

  const nextMarkup = filteredGames
    .map((game, index) => createGameCardMarkup(game, index))
    .join("");

  swapMarkup(gameGrid, nextMarkup, () => {
    gameGrid.classList.toggle("hidden", filteredGames.length === 0);
    emptyState.classList.toggle("hidden", filteredGames.length !== 0);
    musicEmptyState.classList.add("hidden");
    updatesEmptyState.classList.add("hidden");
    updatesList.classList.add("hidden");
    musicList.classList.add("hidden");
  });
}

function renderMusic() {
  const query = searchInput.value.trim().toLowerCase();
  const filteredTracks = tracks.filter(track => !query || track.searchText.includes(query));

  clearSearchButton.hidden = query.length === 0;
  statusText.textContent = query
    ? `${filteredTracks.length} music result${filteredTracks.length === 1 ? "" : "s"} for "${searchInput.value.trim()}".`
    : `${tracks.length} Canva music track${tracks.length === 1 ? "" : "s"} integrated into Vision 3.0.`;

  const state = musicController?.getState();
  const signature = `${filteredTracks.map(track => track.key).join("|")}::${state?.activeTrack?.key || ""}::${state?.isPaused}`;

  if (signature !== lastMusicListKey) {
    const markup = filteredTracks
      .map((track, index) => createTrackMarkup(track, index, state))
      .join("");

    swapMarkup(musicList, markup, () => {
      musicList.classList.toggle("hidden", filteredTracks.length === 0);
      musicEmptyState.classList.toggle("hidden", filteredTracks.length !== 0);
      emptyState.classList.add("hidden");
      updatesEmptyState.classList.add("hidden");
      gameGrid.classList.add("hidden");
      updatesList.classList.add("hidden");
    });

    lastMusicListKey = signature;
  } else {
    musicList.classList.toggle("hidden", filteredTracks.length === 0);
    musicEmptyState.classList.toggle("hidden", filteredTracks.length !== 0);
  }
}

function renderUpdates() {
  const query = searchInput.value.trim().toLowerCase();
  const filteredUpdates = updates.filter(update => {
    if (!query) {
      return true;
    }

    return [update.title, update.summary, update.date, ...update.body, ...update.notes]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });

  clearSearchButton.hidden = query.length === 0;
  statusText.textContent = query
    ? `${filteredUpdates.length} update result${filteredUpdates.length === 1 ? "" : "s"} for "${searchInput.value.trim()}".`
    : `${updates.length} post${updates.length === 1 ? "" : "s"} in updates.`;

  const markup = filteredUpdates.map((update, index) => createUpdateMarkup(update, index)).join("");

  swapMarkup(updatesList, markup, () => {
    updatesList.classList.toggle("hidden", filteredUpdates.length === 0);
    updatesEmptyState.classList.toggle("hidden", filteredUpdates.length !== 0);
    emptyState.classList.add("hidden");
    musicEmptyState.classList.add("hidden");
    gameGrid.classList.add("hidden");
    musicList.classList.add("hidden");
  });
}

function handleMusicStateChange(state) {
  const track = state.activeTrack;
  const summaryKey = `${track?.key || ""}::${state.isPaused}::${state.isLoading}::${state.errorMessage}`;
  if (summaryKey !== lastMusicSummaryKey) {
    featuredTrackName.textContent = track ? track.displayName : "No track selected";
    featuredTrackMeta.textContent = track ? `${formatBytes(track.size)} ${track.contentType ? `• ${track.contentType.replace("audio/", "").toUpperCase()}` : ""}`.trim() : "Playlist offline";
    featuredTrackStatus.textContent = state.errorMessage || (state.isLoading ? "Loading track..." : state.isPaused ? "Ready to play" : "Now playing");
    lastMusicSummaryKey = summaryKey;
  }

  if (activeTab === "music") {
    const listStateKey = `${track?.key || ""}::${state.isPaused}::${state.isLoading}`;
    if (listStateKey !== lastMusicListStateKey) {
      lastMusicListKey = "";
      lastMusicListStateKey = listStateKey;
      renderMusic();
    }
  }
}

function renderFilterBar() {
  filterBar.innerHTML = CATEGORY_FILTERS.map(filter => {
    const isActive = filter === categoryFilter;
    const label = filter === "all"
      ? "All"
      : filter === "popular"
        ? "Popular"
        : filter === "mixed"
          ? "Mixed"
          : filter;

    return `
      <button
        class="filter-chip${isActive ? " is-active" : ""}"
        type="button"
        data-filter="${filter}"
        aria-pressed="${String(isActive)}"
      >
        ${escapeHtml(label)}
      </button>
    `;
  }).join("");
}

function createGameCardMarkup(game, index) {
  return `
    <a
      class="game-card"
      href="play.html?game=${encodeURIComponent(game.key)}"
      style="--stagger:${Math.min(index, 24)};"
      aria-label="Open ${escapeHtml(game.displayName)}"
    >
      <div class="card-tags">
        <span class="pill">${escapeHtml(game.platform || "Web")}</span>
        ${game.popular ? '<span class="pill pill-strong">Popular</span>' : ""}
      </div>
      <h2>${escapeHtml(game.displayName)}</h2>
      <p>${escapeHtml(game.category === "Mixed" ? "Mixed / Featured" : `Category ${game.category}`)}</p>
    </a>
  `;
}

function createTrackMarkup(track, index, state) {
  const isActive = state?.activeTrack?.key === track.key;
  const status = state?.isLoading && isActive ? "Loading" : isActive ? (state.isPaused ? "Paused" : "Playing") : "Ready";

  return `
    <button
      class="track-row${isActive ? " is-active" : ""}"
      type="button"
      data-track-key="${escapeHtml(track.key)}"
    >
      <span class="track-row-index">${String(index + 1).padStart(2, "0")}</span>
      <span class="track-row-main">
        <strong>${escapeHtml(track.displayName)}</strong>
        <small>${escapeHtml(formatBytes(track.size) || "Drive audio")}</small>
      </span>
      <span class="track-row-state">${escapeHtml(status)}</span>
    </button>
  `;
}

function createUpdateMarkup(update, index) {
  const bodyMarkup = update.body
    .map(paragraph => `<p class="update-copy">${escapeHtml(paragraph)}</p>`)
    .join("");

  return `
    <article class="update-card" style="--stagger:${Math.min(index, 12)};">
      <div class="card-tags">
        <span class="pill">Update ${String(index + 1).padStart(2, "0")}</span>
        ${update.date ? `<span class="pill">${escapeHtml(update.date)}</span>` : ""}
      </div>
      <h2>${escapeHtml(update.title)}</h2>
      <p class="update-copy">${escapeHtml(update.summary)}</p>
      ${bodyMarkup}
    </article>
  `;
}

function swapMarkup(target, markup, finalize) {
  const apply = () => {
    target.innerHTML = markup;
    finalize();
  };

  if (typeof document.startViewTransition === "function") {
    document.startViewTransition(apply);
    return;
  }

  apply();
}

function restoreScroll() {
  const savedScroll = Number(sessionStorage.getItem(STORAGE_KEYS.scroll));
  if (!Number.isFinite(savedScroll) || savedScroll <= 0) {
    return;
  }

  requestAnimationFrame(() => {
    window.scrollTo({ top: savedScroll, behavior: "auto" });
  });
}
