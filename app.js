const GAME_DATA_PATH = "./games.json";
const UPDATES_DATA_PATH = "./updates.json";
const STORAGE_KEYS = {
  query: "vision3.launcher.query",
  scroll: "vision3.launcher.scroll",
  tab: "vision3.launcher.tab"
};
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

const searchInput = document.getElementById("searchInput");
const clearSearchButton = document.getElementById("clearSearch");
const loadingState = document.getElementById("loadingState");
const errorState = document.getElementById("errorState");
const emptyState = document.getElementById("emptyState");
const updatesEmptyState = document.getElementById("updatesEmptyState");
const gameGrid = document.getElementById("gameGrid");
const updatesList = document.getElementById("updatesList");
const gameCount = document.getElementById("gameCount");
const resultCount = document.getElementById("resultCount");
const statusText = document.getElementById("statusText");
const gamesTabCount = document.getElementById("gamesTabCount");
const updatesTabCount = document.getElementById("updatesTabCount");
const tabButtons = document.querySelectorAll(".tab-button");
const gamesPanel = document.getElementById("gamesPanel");
const updatesPanel = document.getElementById("updatesPanel");

let games = [];
let updates = [];
let activeTab = sessionStorage.getItem(STORAGE_KEYS.tab) || "games";

document.addEventListener("DOMContentLoaded", async () => {
  requestAnimationFrame(() => {
    document.body.classList.add("is-ready");
  });

  searchInput.value = sessionStorage.getItem(STORAGE_KEYS.query) || "";
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

  tabButtons.forEach(button => {
    button.addEventListener("click", () => {
      setActiveTab(button.dataset.tab);
    });
  });

  gameGrid.addEventListener("click", event => {
    const card = event.target.closest(".game-card");
    if (!card) {
      return;
    }

    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    sessionStorage.setItem(STORAGE_KEYS.query, searchInput.value);
    sessionStorage.setItem(STORAGE_KEYS.scroll, String(window.scrollY));
    startTransition(() => {
      window.location.href = card.href;
    });
  });
}

async function loadContent() {
  try {
    const [gamesResponse, updatesResponse] = await Promise.all([
      fetch(GAME_DATA_PATH, { cache: "no-store" }),
      fetch(UPDATES_DATA_PATH, { cache: "no-store" })
    ]);

    if (!gamesResponse.ok) {
      throw new Error("Unable to fetch games.json");
    }

    if (!updatesResponse.ok) {
      throw new Error("Unable to fetch updates.json");
    }

    const rawGames = await gamesResponse.json();
    const rawUpdates = await updatesResponse.json();

    games = Object.entries(rawGames).map(([key, url], index) => ({
      key,
      url,
      slot: index + 1,
      name: formatGameName(key, url),
      initials: createInitials(formatGameName(key, url)),
      hue: hueFromKey(key)
    }));

    updates = rawUpdates.map((entry, index) => ({
      id: `${entry.date || "update"}-${index}`,
      date: entry.date || "",
      title: entry.title || `Update ${index + 1}`,
      summary: entry.summary || "",
      body: Array.isArray(entry.body) ? entry.body : [],
      notes: Array.isArray(entry.notes) ? entry.notes : []
    }));

    gameCount.textContent = String(games.length);
    gamesTabCount.textContent = String(games.length);
    updatesTabCount.textContent = String(updates.length);
    loadingState.classList.add("hidden");
    renderActiveTab();
    restoreScroll();
  } catch (error) {
    console.error(error);
    loadingState.classList.add("hidden");
    errorState.classList.remove("hidden");
    statusText.textContent = "Launcher data could not be loaded.";
    gameCount.textContent = "0";
    gamesTabCount.textContent = "0";
    updatesTabCount.textContent = "0";
    resultCount.textContent = "0";
  }
}

function setActiveTab(tab) {
  activeTab = tab === "updates" ? "updates" : "games";
  sessionStorage.setItem(STORAGE_KEYS.tab, activeTab);
  updateTabUi();
  renderActiveTab();
}

function updateTabUi() {
  const isGamesTab = activeTab === "games";

  tabButtons.forEach(button => {
    const isActive = button.dataset.tab === activeTab;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });

  gamesPanel.classList.toggle("hidden", !isGamesTab);
  updatesPanel.classList.toggle("hidden", isGamesTab);
  searchInput.placeholder = isGamesTab ? "Search games..." : "Search updates...";
}

function renderActiveTab() {
  updateTabUi();

  if (activeTab === "updates") {
    renderUpdates();
    return;
  }

  renderGames();
}

function renderGames() {
  const query = searchInput.value.trim().toLowerCase();
  const filteredGames = games.filter(game => {
    if (!query) {
      return true;
    }

    return (
      game.name.toLowerCase().includes(query) ||
      game.key.toLowerCase().includes(query)
    );
  });

  clearSearchButton.hidden = query.length === 0;
  resultCount.textContent = String(filteredGames.length);
  statusText.textContent = query
    ? `${filteredGames.length} result${filteredGames.length === 1 ? "" : "s"} for "${searchInput.value.trim()}".`
    : `${games.length} game${games.length === 1 ? "" : "s"} ready to launch.`;

  const updateGrid = () => {
    emptyState.classList.toggle("hidden", filteredGames.length !== 0);
    gameGrid.classList.toggle("hidden", filteredGames.length === 0);
    gameGrid.innerHTML = filteredGames.map((game, index) => createGameCardMarkup(game, index)).join("");
  };

  if (typeof document.startViewTransition === "function") {
    document.startViewTransition(updateGrid);
    return;
  }

  updateGrid();
}

function renderUpdates() {
  const query = searchInput.value.trim().toLowerCase();
  const filteredUpdates = updates.filter(update => {
    if (!query) {
      return true;
    }

    return (
      update.title.toLowerCase().includes(query) ||
      update.summary.toLowerCase().includes(query) ||
      update.body.some(paragraph => paragraph.toLowerCase().includes(query)) ||
      update.date.toLowerCase().includes(query) ||
      update.notes.some(note => note.toLowerCase().includes(query))
    );
  });

  clearSearchButton.hidden = query.length === 0;
  resultCount.textContent = String(filteredUpdates.length);
  statusText.textContent = query
    ? `${filteredUpdates.length} update result${filteredUpdates.length === 1 ? "" : "s"} for "${searchInput.value.trim()}".`
    : `${updates.length} update${updates.length === 1 ? "" : "s"} posted.`;

  const updateList = () => {
    emptyState.classList.add("hidden");
    gameGrid.classList.add("hidden");
    updatesEmptyState.classList.toggle("hidden", filteredUpdates.length !== 0);
    updatesList.classList.toggle("hidden", filteredUpdates.length === 0);
    updatesList.innerHTML = filteredUpdates.map((update, index) => createUpdateMarkup(update, index)).join("");
  };

  if (typeof document.startViewTransition === "function") {
    document.startViewTransition(updateList);
    return;
  }

  updateList();
}

function createGameCardMarkup(game, index) {
  return `
    <a
      class="game-card game-card-text"
      href="play.html?game=${encodeURIComponent(game.key)}"
      style="--stagger:${index};"
      aria-label="Open ${escapeHtml(game.name)}"
      title="${escapeHtml(game.name)}"
    >
      <div class="game-card-body game-card-body-text">
        <h2>${escapeHtml(game.name)}</h2>
      </div>
    </a>
  `;
}

function createUpdateMarkup(update, index) {
  const bodyMarkup = update.body
    .map(paragraph => `<p class="update-paragraph">${escapeHtml(paragraph)}</p>`)
    .join("");

  const notesMarkup = update.notes
    .map(note => `<li>${escapeHtml(note)}</li>`)
    .join("");

  return `
    <article class="update-card" style="--stagger:${index};">
      <div class="update-topline">
        <p class="update-date">${escapeHtml(formatDate(update.date))}</p>
        <span class="slot-pill">Update ${String(index + 1).padStart(2, "0")}</span>
      </div>
      <h2>${escapeHtml(update.title)}</h2>
      <p class="update-summary">${escapeHtml(update.summary)}</p>
      ${bodyMarkup}
      ${notesMarkup ? `<ul class="update-notes">${notesMarkup}</ul>` : ""}
    </article>
  `;
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

function createInitials(name) {
  const words = name.split(" ").filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
  }

  return name.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "GG";
}

function hueFromKey(key) {
  const hash = Array.from(key).reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 3), 0);
  return 170 + (hash % 110);
}

function formatDate(value) {
  if (!value) {
    return "Recent update";
  }

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
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

function startTransition(callback) {
  document.body.classList.add("is-transitioning");
  window.setTimeout(callback, 220);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
