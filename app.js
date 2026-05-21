import {
  APP_VERSION,
  STORAGE_KEYS,
  createMusicPlayer,
  escapeHtml,
  formatBytes,
  formatDisplayName,
  formatTrackDisplayName,
  initPerformanceMode,
  initTheme,
  initParticleField,
  loadJson,
  markPageReady,
  mountMusicDock,
  openAboutBlankWindow
} from "./site.js?v=20260520-auth-live";
import { createDefaultAvatar, renderAvatarCanvas } from "./avatar.js?v=20260520-auth-live";
import { initAuthSession, saveThemePreference, startPlaytimeTracker, subscribeToSession } from "./auth-service.js?v=20260520-auth-live";

const GAME_DATA_PATH = "./games.json?v=20260520-auth-live";
const MUSIC_DATA_PATH = "./music.json?v=20260520-auth-live";
const UPDATES_DATA_PATH = "./updates.json?v=20260520-auth-live";
const CATEGORY_FILTERS = ["all", "popular", "mixed", ...Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ")];
const FLAG_COUNTER_API = "https://api.countapi.xyz";
const FLAG_COUNTERS = {
  production: {
    namespace: "vision-rubx.github.io",
    key: "vision3-flags-v2"
  },
  development: {
    namespace: "vision-rubx.github.io-dev",
    key: "vision3-flags-v2"
  }
};

const particleCanvas = document.getElementById("particleCanvas");
const searchInput = document.getElementById("searchInput");
const clearSearchButton = document.getElementById("clearSearch");
const themeSelect = document.getElementById("themeSelect");
const openBlankButton = document.getElementById("openBlankButton");
const accountButton = document.getElementById("accountButton");
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
const gameActions = document.getElementById("gameActions");
const showMoreGamesButton = document.getElementById("showMoreGames");
const featuredTrackName = document.getElementById("featuredTrackName");
const featuredTrackMeta = document.getElementById("featuredTrackMeta");
const featuredTrackStatus = document.getElementById("featuredTrackStatus");
const toggleMusicList = document.getElementById("toggleMusicList");
const leaveFlagButton = document.getElementById("leaveFlagButton");
const flagCountValue = document.getElementById("flagCountValue");
const flagSummary = document.getElementById("flagSummary");
const flagStatus = document.getElementById("flagStatus");
const profilePreviewCanvas = document.getElementById("profilePreviewCanvas");
const profilePanelTitle = document.getElementById("profilePanelTitle");
const profilePanelStatus = document.getElementById("profilePanelStatus");
const profilePanelTime = document.getElementById("profilePanelTime");
const profilePanelAction = document.getElementById("profilePanelAction");

let games = [];
let tracks = [];
let updates = [];
let musicController = null;
let activeTab = sessionStorage.getItem(STORAGE_KEYS.tab) || "games";
let categoryFilter = sessionStorage.getItem(STORAGE_KEYS.quickFilter) || "all";
let lastMusicSummaryKey = "";
let lastMusicListKey = "";
let lastMusicListStateKey = "";
let musicListCollapsed = sessionStorage.getItem(STORAGE_KEYS.musicListCollapsed) === "true";
let gamePageSize = 96;
let visibleGameLimit = gamePageSize;
let pendingSearchFrame = 0;
let flagState = {
  count: null,
  hasFlag: localStorage.getItem(STORAGE_KEYS.flagLeft) === "true",
  isLoading: true,
  isSubmitting: false,
  errorMessage: ""
};

const countFormatter = new Intl.NumberFormat();

function updateMusicListToggle() {
  if (!toggleMusicList) {
    return;
  }

  const expanded = !musicListCollapsed;
  toggleMusicList.setAttribute("aria-expanded", String(expanded));
  toggleMusicList.querySelector("span").textContent = expanded ? "Hide Playlist" : "Show Playlist";
}

document.addEventListener("DOMContentLoaded", async () => {
  markPageReady();
  syncStoredLauncherState();
  const performanceProfile = initPerformanceMode();
  gamePageSize = performanceProfile.lowPower ? 60 : 96;
  visibleGameLimit = gamePageSize;
  initParticleField(particleCanvas);
  const theme = initTheme(themeSelect);

  searchInput.value = sessionStorage.getItem(STORAGE_KEYS.query) || "";
  renderFilterBar();
  wireEvents();
  updateFlagUi();
  void loadFlagCounter();
  renderGuestProfile();
  initAuthSession();
  subscribeToSession(handleSessionChange);
  startPlaytimeTracker();
  theme.subscribe(nextTheme => {
    void saveThemePreference(nextTheme).catch(() => {});
  });
  await loadContent();
});

function syncStoredLauncherState() {
  const savedVersion = sessionStorage.getItem(STORAGE_KEYS.buildVersion);
  if (savedVersion === APP_VERSION) {
    return;
  }

  sessionStorage.setItem(STORAGE_KEYS.buildVersion, APP_VERSION);
  sessionStorage.setItem(STORAGE_KEYS.query, "");
  sessionStorage.setItem(STORAGE_KEYS.quickFilter, "all");
  sessionStorage.setItem(STORAGE_KEYS.tab, "games");
  sessionStorage.removeItem(STORAGE_KEYS.scroll);
  activeTab = "games";
  categoryFilter = "all";
}

function resetGameLimit() {
  visibleGameLimit = gamePageSize;
}

function wireEvents() {
  openBlankButton?.addEventListener("click", () => {
    openAboutBlankWindow(window.location.href, {
      title: "Opening Vision",
      message: "Launching the full Vision launcher in a clean tab."
    });
  });

  searchInput.addEventListener("input", () => {
    sessionStorage.setItem(STORAGE_KEYS.query, searchInput.value);
    resetGameLimit();
    cancelAnimationFrame(pendingSearchFrame);
    pendingSearchFrame = requestAnimationFrame(() => {
      renderActiveTab();
    });
  });

  clearSearchButton.addEventListener("click", () => {
    searchInput.value = "";
    sessionStorage.setItem(STORAGE_KEYS.query, "");
    resetGameLimit();
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
    resetGameLimit();
    renderFilterBar();
    renderActiveTab();
  });

  tabButtons.forEach(button => {
    button.addEventListener("click", () => {
      activeTab = button.dataset.tab || "games";
      sessionStorage.setItem(STORAGE_KEYS.tab, activeTab);
      if (activeTab === "games") {
        resetGameLimit();
      }
      renderActiveTab();
    });
  });

  toggleMusicList?.addEventListener("click", () => {
    musicListCollapsed = !musicListCollapsed;
    sessionStorage.setItem(STORAGE_KEYS.musicListCollapsed, String(musicListCollapsed));
    updateMusicListToggle();
    renderActiveTab();
  });

  updateMusicListToggle();

  leaveFlagButton?.addEventListener("click", () => {
    void submitFlag();
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
    openAboutBlankWindow(link.href, {
      title: "Opening Vision Game",
      message: "Launching the game in its own clean tab."
    });
  });

  musicList.addEventListener("click", event => {
    const button = event.target.closest("[data-track-key]");
    if (!button || !musicController) {
      return;
    }

    void musicController.selectByKey(button.dataset.trackKey, { autoplay: true });
  });

  showMoreGamesButton?.addEventListener("click", () => {
    visibleGameLimit += gamePageSize;
    renderGames();
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
          displayName: formatTrackDisplayName(track.name),
          searchText: `${track.name} ${formatTrackDisplayName(track.name)} ${track.key}`.toLowerCase()
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
  const visibleGames = filteredGames.slice(0, visibleGameLimit);
  const hasMoreGames = visibleGames.length < filteredGames.length;

  clearSearchButton.hidden = query.length === 0;
  visibleGamesValue.textContent = String(filteredGames.length);
  statusText.textContent = query
    ? `${filteredGames.length} game result${filteredGames.length === 1 ? "" : "s"} for "${searchInput.value.trim()}".`
    : `${filteredGames.length} game${filteredGames.length === 1 ? "" : "s"} ready to launch in a separate tab.`;

  const nextMarkup = visibleGames
    .map((game, index) => createGameCardMarkup(game, index))
    .join("");

  swapMarkup(gameGrid, nextMarkup, () => {
    gameGrid.classList.toggle("hidden", filteredGames.length === 0);
    emptyState.classList.toggle("hidden", filteredGames.length !== 0);
    musicEmptyState.classList.add("hidden");
    updatesEmptyState.classList.add("hidden");
    updatesList.classList.add("hidden");
    musicList.classList.add("hidden");
    gameActions?.classList.toggle("hidden", !hasMoreGames);
    if (showMoreGamesButton) {
      showMoreGamesButton.textContent = hasMoreGames
        ? `Load More Games (${visibleGames.length}/${filteredGames.length})`
        : "All Games Loaded";
    }
  }, { skipTransition: true });
}

function renderMusic() {
  const query = searchInput.value.trim().toLowerCase();
  const filteredTracks = tracks.filter(track => !query || track.searchText.includes(query));

  clearSearchButton.hidden = query.length === 0;
  statusText.textContent = query
    ? `${filteredTracks.length} music result${filteredTracks.length === 1 ? "" : "s"} for "${searchInput.value.trim()}".`
    : `${tracks.length} Canva music track${tracks.length === 1 ? "" : "s"} integrated into Vision.`;

  const state = musicController?.getState();
  const signature = `${filteredTracks.map(track => track.key).join("|")}::${state?.activeTrack?.key || ""}::${state?.isPaused}`;

  if (signature !== lastMusicListKey) {
    const markup = filteredTracks
      .map((track, index) => createTrackMarkup(track, index, state))
      .join("");

    swapMarkup(musicList, markup, () => {
      musicList.classList.toggle("hidden", filteredTracks.length === 0);
      musicList.classList.toggle("music-list-collapsed", musicListCollapsed && filteredTracks.length > 0);
      musicEmptyState.classList.toggle("hidden", filteredTracks.length !== 0);
      emptyState.classList.add("hidden");
      updatesEmptyState.classList.add("hidden");
      gameGrid.classList.add("hidden");
      updatesList.classList.add("hidden");
    });

    lastMusicListKey = signature;
  } else {
    musicList.classList.toggle("hidden", filteredTracks.length === 0);
    musicList.classList.toggle("music-list-collapsed", musicListCollapsed && filteredTracks.length > 0);
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
    featuredTrackMeta.textContent = track ? `${formatBytes(track.size)}${track.contentType ? ` - ${track.contentType.replace("audio/", "").toUpperCase()}` : ""}`.trim() : "Playlist offline";
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
      target="_blank"
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
  const notesMarkup = update.notes.length
    ? `
      <ul class="update-notes">
        ${update.notes.map(note => `<li>${escapeHtml(note)}</li>`).join("")}
      </ul>
    `
    : "";
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
      ${notesMarkup}
      ${bodyMarkup}
    </article>
  `;
}

function swapMarkup(target, markup, finalize, options = {}) {
  const apply = () => {
    target.innerHTML = markup;
    finalize();
  };

  if (!options.skipTransition && typeof document.startViewTransition === "function") {
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

function handleSessionChange(session) {
  if (!session.user || !session.profile) {
    renderGuestProfile(session.backendMessage);
    return;
  }

  renderAvatarCanvas(profilePreviewCanvas, session.profile.avatar || createDefaultAvatar(session.user.email || session.user.uid));
  profilePanelTitle.textContent = session.profile.username || "Finish Your Profile";
  profilePanelStatus.textContent = session.profile.username
    ? `Signed in as ${session.profile.email || "Vision player"}. Your theme, avatar, and leaderboard time save automatically.`
    : "Your account is live. Finish your username and avatar to show up on the leaderboard.";
  profilePanelTime.textContent = formatCompactDuration(session.profile.totalTimeMs || 0);
  profilePanelAction.textContent = session.profile.username ? "Edit Profile" : "Finish Setup";
  accountButton.textContent = session.profile.username || "Account";
  themeSelect.value = session.profile.theme || themeSelect.value;
}

function renderGuestProfile(backendMessage = "") {
  renderAvatarCanvas(profilePreviewCanvas, createDefaultAvatar("guest"));
  profilePanelTitle.textContent = "Guest Mode";
  profilePanelStatus.textContent = backendMessage || "Themes and the launcher work now. Accounts unlock saved avatars, usernames, and leaderboard time.";
  profilePanelTime.textContent = "0m";
  profilePanelAction.textContent = "Open Account";
  accountButton.textContent = "Account";
}

function formatCompactDuration(totalMs) {
  const totalMinutes = Math.max(0, Math.round(Number(totalMs || 0) / 60000));
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function getFlagCounterConfig() {
  return window.location.hostname === "vision-rubx.github.io"
    ? FLAG_COUNTERS.production
    : FLAG_COUNTERS.development;
}

function getFlagCounterUrl(action) {
  const { namespace, key } = getFlagCounterConfig();
  return `${FLAG_COUNTER_API}/${action}/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`;
}

async function requestFlagCount(action) {
  const response = await fetch(getFlagCounterUrl(action), {
    cache: "no-store"
  });

  if (action === "get" && response.status === 404) {
    return 0;
  }

  if (!response.ok) {
    throw new Error(`Flag counter request failed with ${response.status}`);
  }

  const payload = await response.json();
  if (!Number.isFinite(payload?.value)) {
    throw new Error("Flag counter did not return a numeric value.");
  }

  return payload.value;
}

async function loadFlagCounter() {
  flagState = {
    ...flagState,
    isLoading: true,
    errorMessage: ""
  };
  updateFlagUi();

  try {
    const count = await requestFlagCount("get");
    flagState = {
      ...flagState,
      count,
      isLoading: false,
      errorMessage: ""
    };
  } catch (error) {
    console.error(error);
    flagState = {
      ...flagState,
      isLoading: false,
      errorMessage: "Flag counter is offline right now."
    };
  }

  updateFlagUi();
}

async function submitFlag() {
  if (flagState.hasFlag || flagState.isSubmitting) {
    return;
  }

  flagState = {
    ...flagState,
    isSubmitting: true,
    errorMessage: ""
  };
  updateFlagUi();

  try {
    const count = await requestFlagCount("hit");
    localStorage.setItem(STORAGE_KEYS.flagLeft, "true");
    flagState = {
      ...flagState,
      count,
      hasFlag: true,
      isSubmitting: false,
      isLoading: false,
      errorMessage: ""
    };
  } catch (error) {
    console.error(error);
    flagState = {
      ...flagState,
      isSubmitting: false,
      isLoading: false,
      errorMessage: "Could not save your flag yet. Try again in a moment."
    };
  }

  updateFlagUi();
}

function updateFlagUi() {
  if (!flagCountValue || !flagSummary || !flagStatus || !leaveFlagButton) {
    return;
  }

  const countText = Number.isFinite(flagState.count)
    ? countFormatter.format(flagState.count)
    : "--";
  const count = Number.isFinite(flagState.count) ? flagState.count : 0;
  const peopleLabel = `${countFormatter.format(count)} ${count === 1 ? "person has" : "people have"} left a flag so far.`;

  flagCountValue.textContent = countText;
  leaveFlagButton.disabled = flagState.hasFlag || flagState.isSubmitting;
  leaveFlagButton.textContent = flagState.isSubmitting
    ? "Saving..."
    : flagState.hasFlag
      ? "Flag Left"
      : "Leave a Flag";

  if (flagState.isLoading) {
    flagSummary.textContent = "Checking how many flags have been left.";
    flagStatus.textContent = flagState.hasFlag ? "Your browser already has a saved flag." : "One press per browser.";
    return;
  }

  if (flagState.errorMessage) {
    flagSummary.textContent = Number.isFinite(flagState.count)
      ? peopleLabel
      : "The shared flag counter is offline right now.";
    flagStatus.textContent = flagState.errorMessage;
    return;
  }

  flagSummary.textContent = peopleLabel;
  flagStatus.textContent = flagState.hasFlag
    ? "Your flag is already saved on this browser."
    : "Tap once to add your mark to the counter.";
}
