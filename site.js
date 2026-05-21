export const STORAGE_KEYS = {
  query: "vision3.query",
  tab: "vision3.tab",
  quickFilter: "vision3.quickFilter",
  letterFilter: "vision3.letterFilter",
  scroll: "vision3.scroll",
  theme: "vision3.theme",
  musicState: "vision3.musicState",
  musicListCollapsed: "vision3.musicListCollapsed",
  buildVersion: "vision3.buildVersion",
  musicDockCollapsed: "vision3.musicDockCollapsed",
  musicDockHidden: "vision3.musicDockHidden",
  flagLeft: "vision3.flagLeft.v2"
};

export const APP_VERSION = "20260520-auth-live";
export const THEME_OPTIONS = [
  { key: "noir", label: "Noir" },
  { key: "graphite", label: "Graphite" },
  { key: "frost", label: "Frost" },
  { key: "ember", label: "Ember" }
];

const TITLE_SMALL_WORDS = new Set(["a", "an", "and", "as", "at", "by", "for", "in", "of", "on", "or", "the", "to", "vs"]);
const UPPERCASE_TOKENS = new Set(["gba", "n64", "nfl", "nba", "nhl", "fnaf", "fps", "rpg", "btd", "csgo", "bas", "c.s"]);

export function markPageReady() {
  requestAnimationFrame(() => {
    document.body.classList.add("is-ready");
  });
}

export function initPerformanceMode() {
  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  const lowMemory = typeof navigator.deviceMemory === "number" && navigator.deviceMemory <= 4;
  const lowCores = typeof navigator.hardwareConcurrency === "number" && navigator.hardwareConcurrency <= 4;
  const lowPower = prefersReducedMotion || lowMemory || lowCores;

  document.body.classList.toggle("performance-mode", lowPower);

  return {
    lowPower,
    lowMemory,
    lowCores,
    prefersReducedMotion
  };
}

export function startTransition(callback, delay = 240) {
  document.body.classList.add("is-transitioning");
  window.setTimeout(callback, delay);
}

export async function loadJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load ${path}`);
  }

  return response.json();
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatDisplayName(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  return text
    .split(/\s+/)
    .map((token, index, tokens) => formatToken(token, index, tokens.length))
    .join(" ")
    .replace(/\s+([.,!?])/g, "$1")
    .replace(/\s+-\s+/g, " - ");
}

export function formatTrackDisplayName(value) {
  const original = String(value || "").trim();
  if (!original) {
    return "";
  }

  const cleaned = original
    .replace(/[\s_-]*vision(?:\+|[0-9.]+)?\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/[-_(\[]+\s*$/g, "")
    .trim();

  return formatDisplayName(cleaned || original);
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }

  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "";
  }

  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.round(bytes / 1024)} KB`;
}

export function getStoredTheme() {
  const savedTheme = localStorage.getItem(STORAGE_KEYS.theme) || "";
  return THEME_OPTIONS.some(option => option.key === savedTheme) ? savedTheme : "noir";
}

export function applyTheme(themeKey) {
  const nextTheme = THEME_OPTIONS.some(option => option.key === themeKey) ? themeKey : "noir";
  document.body.dataset.theme = nextTheme;
  localStorage.setItem(STORAGE_KEYS.theme, nextTheme);
  return nextTheme;
}

export function initTheme(select) {
  let theme = applyTheme(getStoredTheme());
  const listeners = new Set();

  function syncSelect() {
    if (select) {
      select.value = theme;
    }
  }

  function emit() {
    syncSelect();
    listeners.forEach(listener => listener(theme));
  }

  select?.addEventListener("change", event => {
    theme = applyTheme(event.target.value);
    emit();
  });

  syncSelect();

  return {
    getTheme() {
      return theme;
    },
    setTheme(nextTheme) {
      theme = applyTheme(nextTheme);
      emit();
      return theme;
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(theme);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}

export function openAboutBlankWindow(url, options = {}) {
  const popup = window.open("about:blank", "_blank");
  if (!popup) {
    window.location.assign(url);
    return null;
  }

  const title = options.title || "Opening Vision...";
  const message = options.message || "Loading...";

  try {
    popup.document.write(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#050505;color:#f6f6f6;font-family:Segoe UI,Arial,sans-serif}main{display:grid;gap:12px;justify-items:center;padding:32px;text-align:center}strong{font-size:1rem;letter-spacing:.08em;text-transform:uppercase}p{margin:0;opacity:.72;line-height:1.6;max-width:28rem}</style></head><body><main><strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p></main></body></html>`);
    popup.document.close();
  } catch (error) {
    void error;
  }

  popup.location.replace(url);
  return popup;
}

export function initParticleField(canvas) {
  if (!canvas) {
    return {
      setFocusMode() {},
      destroy() {}
    };
  }

  const context = canvas.getContext("2d");
  if (!context) {
    return {
      setFocusMode() {},
      destroy() {}
    };
  }

  let width = 0;
  let height = 0;
  let dpr = 1;
  let animationId = 0;
  let lastFrameTime = 0;
  let pointer = { x: 0, y: 0, active: false };
  let particles = [];
  const performanceMode = document.body.classList.contains("performance-mode");
  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  const targetFrameLength = prefersReducedMotion ? 1000 / 24 : performanceMode ? 1000 / 30 : 1000 / 60;

  function setSize() {
    dpr = window.devicePixelRatio || 1;
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildParticles();
  }

  function buildParticles() {
    const targetCount = performanceMode
      ? width < 720
        ? 8
        : width < 1200
          ? 12
          : 18
      : width < 720
        ? 14
        : width < 1200
          ? 22
          : 30;
    particles = Array.from({ length: targetCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.22,
      vy: (Math.random() - 0.5) * 0.22,
      radius: 1 + Math.random() * 1.8
    }));
  }

  function frame(now = 0) {
    if (lastFrameTime && now - lastFrameTime < targetFrameLength) {
      animationId = requestAnimationFrame(frame);
      return;
    }

    lastFrameTime = now;
    context.clearRect(0, 0, width, height);

    const pointAlpha = performanceMode ? 0.24 : 0.34;
    const lineAlpha = performanceMode ? 0.08 : 0.12;
    const maxDistance = performanceMode ? 92 : 112;
    const pointerRadius = performanceMode ? 92 : 120;

    for (const particle of particles) {
      particle.x += particle.vx;
      particle.y += particle.vy;

      if (particle.x < -10 || particle.x > width + 10) {
        particle.vx *= -1;
      }

      if (particle.y < -10 || particle.y > height + 10) {
        particle.vy *= -1;
      }

      if (pointer.active) {
        const dx = particle.x - pointer.x;
        const dy = particle.y - pointer.y;
        const distance = Math.hypot(dx, dy);
        if (distance > 0 && distance < pointerRadius) {
          const force = (pointerRadius - distance) / (performanceMode ? 1700 : 1200);
          particle.vx += (dx / distance) * force;
          particle.vy += (dy / distance) * force;
        }
      }

      particle.vx = clamp(particle.vx, -0.38, 0.38);
      particle.vy = clamp(particle.vy, -0.38, 0.38);

      context.beginPath();
      context.fillStyle = `rgba(255,255,255,${pointAlpha})`;
      context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      context.fill();
    }

    for (let leftIndex = 0; leftIndex < particles.length; leftIndex += 1) {
      const left = particles[leftIndex];

      for (let rightIndex = leftIndex + 1; rightIndex < particles.length; rightIndex += 1) {
        const right = particles[rightIndex];
        const dx = left.x - right.x;
        const dy = left.y - right.y;
        const distance = Math.hypot(dx, dy);

        if (distance > maxDistance) {
          continue;
        }

        const alpha = (1 - distance / maxDistance) * lineAlpha;
        context.strokeStyle = `rgba(255,255,255,${alpha})`;
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(left.x, left.y);
        context.lineTo(right.x, right.y);
        context.stroke();
      }
    }

    animationId = requestAnimationFrame(frame);
  }

  function handlePointerMove(event) {
    pointer = {
      x: event.clientX,
      y: event.clientY,
      active: true
    };
  }

  function handlePointerLeave() {
    pointer.active = false;
  }

  setSize();
  frame();

  window.addEventListener("resize", setSize);
  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerleave", handlePointerLeave);

  return {
    setFocusMode() {},
    destroy() {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", setSize);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerleave", handlePointerLeave);
    }
  };
}

export function createMusicPlayer(tracks) {
  const audio = new Audio();
  const listeners = new Set();
  const trackList = Array.isArray(tracks) ? tracks : [];
  const saved = readSavedMusicState();
  let currentIndex = resolveStartingIndex(trackList, saved.key);
  let loadingToken = 0;
  let isLoading = false;
  let errorMessage = "";

  audio.preload = "none";
  audio.volume = clamp(saved.volume ?? 0.72, 0, 1);
  audio.muted = Boolean(saved.muted);

  function snapshot() {
    const activeTrack = trackList[currentIndex] || null;
    return {
      tracks: trackList,
      activeTrack,
      currentIndex,
      isPaused: audio.paused,
      isLoading,
      errorMessage,
      currentTime: audio.currentTime || 0,
      duration: Number.isFinite(audio.duration) ? audio.duration : 0,
      volume: audio.volume,
      muted: audio.muted
    };
  }

  function emit() {
    const state = snapshot();
    persistState(state);
    listeners.forEach(listener => listener(state));
  }

  async function ensureTrackLoaded(index, options = {}) {
    const track = trackList[index];
    if (!track) {
      return;
    }

    const token = ++loadingToken;
    isLoading = true;
    errorMessage = "";
    currentIndex = index;
    emit();

    try {
      const sourceUrl = track.path || track.downloadUrl;

      if (token !== loadingToken) {
        return;
      }

      if (audio.dataset.trackId !== track.id) {
        audio.src = sourceUrl;
        audio.dataset.trackId = track.id;
        audio.load();
      }

      await waitForMetadata(audio);

      if (options.resumeTime && Number.isFinite(saved.time) && saved.time > 0 && saved.key === track.key) {
        audio.currentTime = Math.min(saved.time, Math.max(audio.duration - 1, 0));
      } else if (Number.isFinite(options.startTime) && options.startTime > 0) {
        audio.currentTime = Math.min(options.startTime, Math.max(audio.duration - 1, 0));
      } else if (!options.keepTime) {
        audio.currentTime = 0;
      }

      if (options.autoplay) {
        await audio.play();
      }

      prefetchTrack((index + 1) % trackList.length);
    } catch (error) {
      if (token === loadingToken) {
        errorMessage = "Audio is ready, but the browser needs a play tap.";
      }
    } finally {
      if (token === loadingToken) {
        isLoading = false;
        emit();
      }
    }
  }

  async function togglePlayback() {
    if (!trackList.length) {
      return;
    }

    if (!audio.src) {
      await ensureTrackLoaded(currentIndex, { autoplay: true, resumeTime: true });
      return;
    }

    if (audio.paused) {
      try {
        await audio.play();
      } catch (error) {
        errorMessage = "Press play again to start audio.";
      }
      emit();
      return;
    }

    audio.pause();
    emit();
  }

  async function selectByKey(key, options = {}) {
    const index = trackList.findIndex(track => track.key === key);
    if (index === -1) {
      return;
    }

    await ensureTrackLoaded(index, options);
  }

  async function selectByIndex(index, options = {}) {
    if (!trackList.length) {
      return;
    }

    const normalizedIndex = (index + trackList.length) % trackList.length;
    await ensureTrackLoaded(normalizedIndex, options);
  }

  async function next(autoplay = true) {
    await selectByIndex(currentIndex + 1, { autoplay });
  }

  async function previous(autoplay = true) {
    await selectByIndex(currentIndex - 1, { autoplay });
  }

  function setVolume(value) {
    audio.volume = clamp(Number(value), 0, 1);
    if (audio.volume > 0 && audio.muted) {
      audio.muted = false;
    }
    emit();
  }

  function setMuted(value) {
    audio.muted = Boolean(value);
    emit();
  }

  function seek(seconds) {
    if (!audio.src || !Number.isFinite(seconds)) {
      return;
    }

    audio.currentTime = Math.max(0, seconds);
    emit();
  }

  function getState() {
    return snapshot();
  }

  function subscribe(listener) {
    listeners.add(listener);
    listener(snapshot());
    return () => {
      listeners.delete(listener);
    };
  }

  audio.addEventListener("timeupdate", emit);
  audio.addEventListener("play", emit);
  audio.addEventListener("pause", emit);
  audio.addEventListener("loadedmetadata", emit);
  audio.addEventListener("volumechange", emit);
  audio.addEventListener("ended", () => {
    void next(true);
  });
  audio.addEventListener("error", () => {
    errorMessage = "This track could not be played.";
    emit();
  });

  if (trackList.length) {
    void ensureTrackLoaded(currentIndex, {
      autoplay: saved.paused === false,
      resumeTime: true
    });
  }

  return {
    subscribe,
    togglePlayback,
    selectByKey,
    selectByIndex,
    next,
    previous,
    setVolume,
    setMuted,
    seek,
    getState
  };
}

export function mountMusicDock(root, controller) {
  if (!root || !controller) {
    return () => {};
  }

  const title = root.querySelector("[data-track-title]");
  const meta = root.querySelector("[data-track-meta]");
  const playButton = root.querySelector("[data-music-play]");
  const prevButton = root.querySelector("[data-music-prev]");
  const nextButton = root.querySelector("[data-music-next]");
  const muteButton = root.querySelector("[data-music-mute]");
  const toggleButton = root.querySelector("[data-music-toggle]");
  const closeButton = root.querySelector("[data-music-close]");
  const seek = root.querySelector("[data-music-seek]");
  const currentTime = root.querySelector("[data-track-time]");
  const duration = root.querySelector("[data-track-duration]");
  const volume = root.querySelector("[data-music-volume]");
  const reopenButton = document.getElementById("musicDockReopen");
  let isCollapsed = localStorage.getItem(STORAGE_KEYS.musicDockCollapsed) === "true";
  let isHidden = localStorage.getItem(STORAGE_KEYS.musicDockHidden) === "true";

  function syncDockUi() {
    root.classList.toggle("hidden", isHidden);
    root.classList.toggle("is-collapsed", isCollapsed && !isHidden);
    reopenButton?.classList.toggle("hidden", !isHidden);

    if (toggleButton) {
      toggleButton.textContent = isCollapsed ? "Expand" : "Collapse";
      toggleButton.setAttribute("aria-pressed", String(isCollapsed));
    }

    if (closeButton) {
      closeButton.textContent = "Close Player";
    }

    if (reopenButton) {
      reopenButton.textContent = "Open Music Player";
    }
  }

  playButton?.addEventListener("click", () => {
    void controller.togglePlayback();
  });
  prevButton?.addEventListener("click", () => {
    void controller.previous(true);
  });
  nextButton?.addEventListener("click", () => {
    void controller.next(true);
  });
  muteButton?.addEventListener("click", () => {
    const state = controller.getState();
    controller.setMuted(!state.muted);
  });
  seek?.addEventListener("input", event => {
    controller.seek(Number(event.target.value));
  });
  volume?.addEventListener("input", event => {
    controller.setVolume(Number(event.target.value));
  });
  toggleButton?.addEventListener("click", () => {
    isCollapsed = !isCollapsed;
    localStorage.setItem(STORAGE_KEYS.musicDockCollapsed, String(isCollapsed));
    syncDockUi();
  });
  closeButton?.addEventListener("click", () => {
    isHidden = true;
    localStorage.setItem(STORAGE_KEYS.musicDockHidden, "true");
    syncDockUi();
  });
  reopenButton?.addEventListener("click", () => {
    isHidden = false;
    localStorage.setItem(STORAGE_KEYS.musicDockHidden, "false");
    syncDockUi();
  });

  const unsubscribe = controller.subscribe(state => {
    if (!isHidden) {
      root.classList.remove("hidden");
    }

    const track = state.activeTrack;
    title.textContent = track ? (track.displayName || formatTrackDisplayName(track.name)) : "Music Offline";
    meta.textContent = state.errorMessage || (track ? `${formatBytes(track.size)}${track.contentType ? ` - ${track.contentType.replace("audio/", "").toUpperCase()}` : ""}`.trim() : "No track selected");
    playButton.textContent = state.isLoading ? "Loading..." : state.isPaused ? "Play" : "Pause";
    muteButton.textContent = state.muted ? "Unmute" : "Mute";
    currentTime.textContent = formatDuration(state.currentTime);
    duration.textContent = formatDuration(state.duration);
    seek.max = String(Math.max(state.duration, 1));
    seek.value = String(Math.min(state.currentTime, state.duration || 0));
    volume.value = String(state.volume);
    syncDockUi();
  });

  syncDockUi();
  return unsubscribe;
}

function formatToken(token, index, tokenCount) {
  const plain = token.trim();
  if (!plain) {
    return plain;
  }

  const lower = plain.toLowerCase();

  if (UPPERCASE_TOKENS.has(lower) || /^[A-Z0-9.]{2,}$/.test(plain)) {
    return plain.toUpperCase();
  }

  if (plain.includes(".")) {
    return plain
      .split(".")
      .map(segment => {
        if (!segment) {
          return segment;
        }
        if (segment.length <= 2) {
          return segment.toUpperCase();
        }
        return capitalize(segment);
      })
      .join(".");
  }

  if (lower === "io") {
    return "io";
  }

  if (index > 0 && index < tokenCount - 1 && TITLE_SMALL_WORDS.has(lower)) {
    return lower;
  }

  if (/[0-9]/.test(plain) && /[A-Za-z]/.test(plain)) {
    return plain.charAt(0).toUpperCase() + plain.slice(1);
  }

  return capitalize(plain);
}

function capitalize(token) {
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

function waitForMetadata(audio) {
  if (audio.readyState >= 1) {
    return Promise.resolve();
  }

  return new Promise(resolve => {
    audio.addEventListener("loadedmetadata", resolve, { once: true });
    audio.addEventListener("canplay", resolve, { once: true });
  });
}

function prefetchTrack(index) {
  void index;
}

function readSavedMusicState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.musicState) || "{}");
  } catch (error) {
    return {};
  }
}

function persistState(state) {
  const track = state.activeTrack;
  localStorage.setItem(
    STORAGE_KEYS.musicState,
    JSON.stringify({
      key: track?.key || "",
      time: state.currentTime || 0,
      volume: state.volume,
      muted: state.muted,
      paused: state.isPaused
    })
  );
}

function resolveStartingIndex(tracks, savedKey) {
  if (!tracks.length) {
    return 0;
  }

  const index = tracks.findIndex(track => track.key === savedKey);
  return index >= 0 ? index : 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
