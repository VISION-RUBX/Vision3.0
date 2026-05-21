import {
  initPerformanceMode,
  initTheme,
  initParticleField,
  markPageReady,
  openAboutBlankWindow
} from "./site.js?v=20260520-auth-live";
import { createDefaultAvatar, renderAvatarCanvas } from "./avatar.js?v=20260520-auth-live";
import {
  getBackendState,
  getLeaderboardEntries,
  initAuthSession,
  saveThemePreference,
  startPlaytimeTracker,
  subscribeToSession
} from "./auth-service.js?v=20260520-auth-live";

const particleCanvas = document.getElementById("particleCanvas");
const themeSelect = document.getElementById("themeSelect");
const openBlankButton = document.getElementById("openBlankButton");
const leaderboardBackendNotice = document.getElementById("leaderboardBackendNotice");
const leaderboardStatus = document.getElementById("leaderboardStatus");
const leaderboardList = document.getElementById("leaderboardList");
const currentUserAvatarCanvas = document.getElementById("currentUserAvatarCanvas");
const currentUserName = document.getElementById("currentUserName");
const currentUserStatus = document.getElementById("currentUserStatus");
const currentUserRank = document.getElementById("currentUserRank");
const currentUserTime = document.getElementById("currentUserTime");

let activeSession = null;
let leaderboardEntries = [];

document.addEventListener("DOMContentLoaded", async () => {
  markPageReady();
  initPerformanceMode();
  initParticleField(particleCanvas);
  const theme = initTheme(themeSelect);
  theme.subscribe(nextTheme => {
    void saveThemePreference(nextTheme).catch(() => {});
  });

  openBlankButton?.addEventListener("click", () => {
    openAboutBlankWindow(window.location.href, {
      title: "Opening Vision Leaderboard",
      message: "Launching the leaderboard in a clean tab."
    });
  });

  initAuthSession();
  startPlaytimeTracker();
  subscribeToSession(session => {
    activeSession = session;
    if (session?.profile?.theme) {
      themeSelect.value = session.profile.theme;
    }
    updateCurrentUserCard();
  });

  renderBackendState();
  renderAvatarCanvas(currentUserAvatarCanvas, createDefaultAvatar("leaderboard"));
  await loadLeaderboard();
});

async function loadLeaderboard() {
  const backendState = getBackendState();
  if (!backendState.ready) {
    leaderboardStatus.textContent = backendState.message;
    leaderboardList.innerHTML = "";
    return;
  }

  try {
    leaderboardStatus.textContent = "Loading leaderboard data.";
    leaderboardEntries = await getLeaderboardEntries(50);
    leaderboardStatus.textContent = `${leaderboardEntries.length} player${leaderboardEntries.length === 1 ? "" : "s"} on the board.`;
    renderLeaderboardList();
    updateCurrentUserCard();
  } catch (error) {
    leaderboardStatus.textContent = error?.message || "Could not load leaderboard.";
    leaderboardList.innerHTML = "";
  }
}

function renderLeaderboardList() {
  leaderboardList.innerHTML = "";

  if (!leaderboardEntries.length) {
    leaderboardList.innerHTML = `
      <div class="state-block">
        <h2>No saved players yet</h2>
        <p>Once accounts are connected and people save profiles, the board will fill in here.</p>
      </div>
    `;
    return;
  }

  leaderboardEntries.forEach((entry, index) => {
    const card = document.createElement("article");
    card.className = "leaderboard-entry";
    card.innerHTML = `
      <div class="leaderboard-entry-rank">${index + 1}</div>
      <canvas class="leaderboard-entry-avatar" width="96" height="96" aria-hidden="true"></canvas>
      <div class="leaderboard-entry-copy">
        <strong>${escapeHtml(entry.username)}</strong>
        <span>${formatDuration(entry.totalTimeMs)}</span>
      </div>
      <div class="leaderboard-entry-badge">${entry.role === "owner" ? "Owner" : "Player"}</div>
    `;

    leaderboardList.appendChild(card);
    renderAvatarCanvas(card.querySelector("canvas"), entry.avatar || createDefaultAvatar(entry.username));
  });
}

function updateCurrentUserCard() {
  if (!activeSession?.user || !activeSession.profile?.username) {
    currentUserName.textContent = "Guest";
    currentUserStatus.textContent = "Sign in, save a username, and your tracked time will start climbing the board.";
    currentUserRank.textContent = "--";
    currentUserTime.textContent = "0m";
    renderAvatarCanvas(currentUserAvatarCanvas, createDefaultAvatar("guest"));
    return;
  }

  currentUserName.textContent = activeSession.profile.username;
  currentUserStatus.textContent = "Your saved Vision profile is live.";
  currentUserTime.textContent = formatDuration(activeSession.profile.totalTimeMs || 0);
  renderAvatarCanvas(currentUserAvatarCanvas, activeSession.profile.avatar || createDefaultAvatar(activeSession.profile.username));

  const rank = leaderboardEntries.findIndex(entry => entry.uid === activeSession.user.uid);
  currentUserRank.textContent = rank >= 0 ? `#${rank + 1}` : "Outside Top 50";
}

function renderBackendState() {
  const backendState = getBackendState();
  leaderboardBackendNotice.classList.toggle("hidden", backendState.ready);
  leaderboardBackendNotice.innerHTML = backendState.ready
    ? ""
    : `<h2>Leaderboard backend not connected yet</h2><p>${escapeHtml(backendState.message)}</p>`;
}

function formatDuration(totalMs) {
  const totalMinutes = Math.max(0, Math.round(Number(totalMs || 0) / 60000));
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}
