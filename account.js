import {
  initPerformanceMode,
  initTheme,
  initParticleField,
  markPageReady,
  openAboutBlankWindow
} from "./site.js?v=20260520-auth-live";
import {
  ACCENT_SWATCHES,
  createDefaultAvatar,
  HAIR_SWATCHES,
  normalizeAvatar,
  OUTFIT_SWATCHES,
  renderAvatarCanvas,
  SKIN_SWATCHES
} from "./avatar.js?v=20260520-auth-live";
import {
  changeUsername,
  getBackendState,
  getOwnerUserCount,
  initAuthSession,
  saveAvatar,
  saveProfileSetup,
  saveThemePreference,
  signInWithEmail,
  signInWithGoogle,
  signOutUser,
  signUpWithEmail,
  startPlaytimeTracker,
  subscribeToSession
} from "./auth-service.js?v=20260520-auth-live";

const particleCanvas = document.getElementById("particleCanvas");
const themeSelect = document.getElementById("themeSelect");
const openBlankButton = document.getElementById("openBlankButton");
const authBackendNotice = document.getElementById("authBackendNotice");
const authGate = document.getElementById("authGate");
const usernameSetupSection = document.getElementById("usernameSetupSection");
const accountProfileSection = document.getElementById("accountProfileSection");
const accountStatusBlock = document.getElementById("accountStatusBlock");
const signInForm = document.getElementById("signInForm");
const signUpForm = document.getElementById("signUpForm");
const googleSignInButton = document.getElementById("googleSignInButton");
const setupAvatarCanvas = document.getElementById("setupAvatarCanvas");
const setupAccountEmail = document.getElementById("setupAccountEmail");
const usernameSetupForm = document.getElementById("usernameSetupForm");
const usernameInput = document.getElementById("usernameInput");
const usernameSignOutButton = document.getElementById("usernameSignOutButton");
const accountSignOutButton = document.getElementById("accountSignOutButton");
const usernameChangeForm = document.getElementById("usernameChangeForm");
const usernameChangeInput = document.getElementById("usernameChangeInput");
const usernameCooldownCopy = document.getElementById("usernameCooldownCopy");
const profileAvatarCanvas = document.getElementById("profileAvatarCanvas");
const profileHeadline = document.getElementById("profileHeadline");
const profileSubline = document.getElementById("profileSubline");
const profileUsername = document.getElementById("profileUsername");
const profileEmail = document.getElementById("profileEmail");
const profileTimePlayed = document.getElementById("profileTimePlayed");
const profileThemeValue = document.getElementById("profileThemeValue");
const saveAvatarButton = document.getElementById("saveAvatarButton");
const ownerPanel = document.getElementById("ownerPanel");
const ownerUserCount = document.getElementById("ownerUserCount");

const setupControls = {
  hairStyle: document.getElementById("setupHairStyle"),
  outfitStyle: document.getElementById("setupOutfitStyle"),
  accessory: document.getElementById("setupAccessory"),
  skin: document.getElementById("setupSkinSwatches"),
  hair: document.getElementById("setupHairSwatches"),
  outfit: document.getElementById("setupOutfitSwatches"),
  accent: document.getElementById("setupAccentSwatches")
};

const profileControls = {
  hairStyle: document.getElementById("profileHairStyle"),
  outfitStyle: document.getElementById("profileOutfitStyle"),
  accessory: document.getElementById("profileAccessory"),
  skin: document.getElementById("profileSkinSwatches"),
  hair: document.getElementById("profileHairSwatches"),
  outfit: document.getElementById("profileOutfitSwatches"),
  accent: document.getElementById("profileAccentSwatches")
};

let setupAvatar = createDefaultAvatar("setup");
let profileAvatar = createDefaultAvatar("profile");
let activeSession = null;

document.addEventListener("DOMContentLoaded", () => {
  markPageReady();
  initPerformanceMode();
  initParticleField(particleCanvas);
  const theme = initTheme(themeSelect);
  theme.subscribe(nextTheme => {
    profileThemeValue.textContent = capitalize(nextTheme);
    void saveThemePreference(nextTheme).catch(() => {});
  });

  initAuthSession();
  startPlaytimeTracker();
  subscribeToSession(handleSessionChange);
  wireEvents();
  buildAvatarEditor(setupControls, "setup", updateSetupAvatar);
  buildAvatarEditor(profileControls, "profile", updateProfileAvatar);
  setAvatarControls(setupControls, setupAvatar);
  setAvatarControls(profileControls, profileAvatar);
  updateSetupAvatar();
  updateProfileAvatar();
  renderBackendState();
});

function wireEvents() {
  openBlankButton?.addEventListener("click", () => {
    openAboutBlankWindow(window.location.href, {
      title: "Opening Vision Account",
      message: "Launching your account page in a clean tab."
    });
  });

  googleSignInButton?.addEventListener("click", async () => {
    await runAction(async () => {
      await signInWithGoogle();
      showStatus("Google sign-in started.", false);
    });
  });

  signInForm?.addEventListener("submit", async event => {
    event.preventDefault();
    const form = new FormData(signInForm);
    const email = String(form.get("signInEmail") || document.getElementById("signInEmail").value || "");
    const password = String(form.get("signInPassword") || document.getElementById("signInPassword").value || "");
    await runAction(async () => {
      await signInWithEmail(email, password);
      showStatus("Signed in.", false);
      signInForm.reset();
    });
  });

  signUpForm?.addEventListener("submit", async event => {
    event.preventDefault();
    const email = document.getElementById("signUpEmail").value;
    const password = document.getElementById("signUpPassword").value;
    await runAction(async () => {
      await signUpWithEmail(email, password);
      showStatus("Account created. Save your email and password.", false);
      signUpForm.reset();
    });
  });

  usernameSetupForm?.addEventListener("submit", async event => {
    event.preventDefault();
    await runAction(async () => {
      const profile = await saveProfileSetup(usernameInput.value, setupAvatar, themeSelect.value);
      setupAvatar = normalizeAvatar(profile.avatar);
      profileAvatar = normalizeAvatar(profile.avatar);
      showStatus("Username and avatar saved.", false);
      usernameSetupForm.reset();
    });
  });

  usernameChangeForm?.addEventListener("submit", async event => {
    event.preventDefault();
    await runAction(async () => {
      const profile = await changeUsername(usernameChangeInput.value);
      showStatus("Username updated.", false);
      usernameChangeInput.value = "";
      profileAvatar = normalizeAvatar(profile.avatar);
    });
  });

  saveAvatarButton?.addEventListener("click", async () => {
    await runAction(async () => {
      await saveAvatar(profileAvatar);
      showStatus("Avatar saved.", false);
    });
  });

  usernameSignOutButton?.addEventListener("click", () => {
    void signOutUser().catch(error => showStatus(error.message || "Could not sign out.", true));
  });

  accountSignOutButton?.addEventListener("click", () => {
    void signOutUser().catch(error => showStatus(error.message || "Could not sign out.", true));
  });
}

function handleSessionChange(session) {
  activeSession = session;
  renderBackendState();

  if (!session.user || !session.profile) {
    authGate.classList.remove("hidden");
    usernameSetupSection.classList.add("hidden");
    accountProfileSection.classList.add("hidden");
    ownerPanel.classList.add("hidden");
    return;
  }

  authGate.classList.add("hidden");
  setupAccountEmail.textContent = session.user.email || "Signed in";
  setupAvatar = normalizeAvatar(session.profile.avatar || createDefaultAvatar(session.user.email || session.user.uid));
  profileAvatar = normalizeAvatar(session.profile.avatar || createDefaultAvatar(session.user.email || session.user.uid));
  setAvatarControls(setupControls, setupAvatar);
  setAvatarControls(profileControls, profileAvatar);
  themeSelect.value = session.profile.theme || themeSelect.value;
  updateSetupAvatar();
  updateProfileAvatar();
  profileThemeValue.textContent = capitalize(session.profile.theme || themeSelect.value);

  if (!session.profile.username) {
    usernameSetupSection.classList.remove("hidden");
    accountProfileSection.classList.add("hidden");
    usernameInput.value = "";
    return;
  }

  usernameSetupSection.classList.add("hidden");
  accountProfileSection.classList.remove("hidden");
  hydrateProfileSection(session);
  void hydrateOwnerPanel(session);
}

function hydrateProfileSection(session) {
  profileHeadline.textContent = session.profile.username;
  profileSubline.textContent = session.backendMode === "local"
    ? "Your Vision account is saving on this browser now, including time, theme, username, and avatar."
    : "Your Vision account saves your time, theme, username, and avatar automatically.";
  profileUsername.textContent = session.profile.username;
  profileEmail.textContent = session.profile.email || session.user.email || "";
  profileTimePlayed.textContent = formatDuration(session.profile.totalTimeMs || 0);
  usernameCooldownCopy.textContent = getCooldownCopy(session.profile.usernameChangedAtMs || 0);
}

async function hydrateOwnerPanel(session) {
  if (session.profile.role !== "owner") {
    ownerPanel.classList.add("hidden");
    return;
  }

  ownerPanel.classList.remove("hidden");
  try {
    const count = await getOwnerUserCount();
    ownerUserCount.textContent = String(count);
  } catch (error) {
    ownerUserCount.textContent = "--";
  }
}

function renderBackendState() {
  const backendState = getBackendState();
  const showNotice = !backendState.ready || backendState.mode === "local";

  authBackendNotice.classList.toggle("hidden", !showNotice);
  authBackendNotice.innerHTML = showNotice
    ? `<h2>${backendState.ready ? "Local save mode is active" : "Account backend not connected yet"}</h2><p>${escapeHtmlText(backendState.message)}</p>`
    : "";

  googleSignInButton.disabled = !backendState.supportsGoogle;
  googleSignInButton.title = backendState.supportsGoogle ? "" : backendState.message;
  signInForm.querySelectorAll("input, button").forEach(control => {
    control.disabled = !backendState.ready;
  });
  signUpForm.querySelectorAll("input, button").forEach(control => {
    control.disabled = !backendState.ready;
  });
}

function buildAvatarEditor(controls, prefix, onChange) {
  controls.hairStyle.addEventListener("change", onChange);
  controls.outfitStyle.addEventListener("change", onChange);
  controls.accessory.addEventListener("change", onChange);

  buildSwatches(controls.skin, SKIN_SWATCHES, `${prefix}-skin`, onChange);
  buildSwatches(controls.hair, HAIR_SWATCHES, `${prefix}-hair`, onChange);
  buildSwatches(controls.outfit, OUTFIT_SWATCHES, `${prefix}-outfit`, onChange);
  buildSwatches(controls.accent, ACCENT_SWATCHES, `${prefix}-accent`, onChange);
}

function buildSwatches(container, colors, name, onChange) {
  container.innerHTML = colors.map(color => `
    <button class="swatch-button" type="button" data-swatch-name="${name}" data-color="${color}" aria-label="${color}" style="--swatch:${color};"></button>
  `).join("");

  container.addEventListener("click", event => {
    const button = event.target.closest(".swatch-button");
    if (!button) {
      return;
    }

    container.dataset.value = button.dataset.color;
    syncSwatchSelection(container);
    onChange();
  });

  container.dataset.value = colors[0];
  syncSwatchSelection(container);
}

function setAvatarControls(controls, avatar) {
  controls.hairStyle.value = avatar.hairStyle;
  controls.outfitStyle.value = avatar.outfitStyle;
  controls.accessory.value = avatar.accessory;
  controls.skin.dataset.value = avatar.skinTone;
  controls.hair.dataset.value = avatar.hairColor;
  controls.outfit.dataset.value = avatar.outfitColor;
  controls.accent.dataset.value = avatar.accentColor;
  syncSwatchSelection(controls.skin);
  syncSwatchSelection(controls.hair);
  syncSwatchSelection(controls.outfit);
  syncSwatchSelection(controls.accent);
}

function syncSwatchSelection(container) {
  const selected = container.dataset.value;
  container.querySelectorAll(".swatch-button").forEach(button => {
    const isActive = button.dataset.color === selected;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function updateSetupAvatar() {
  setupAvatar = normalizeAvatar({
    skinTone: setupControls.skin.dataset.value,
    hairColor: setupControls.hair.dataset.value,
    outfitColor: setupControls.outfit.dataset.value,
    accentColor: setupControls.accent.dataset.value,
    hairStyle: setupControls.hairStyle.value,
    outfitStyle: setupControls.outfitStyle.value,
    accessory: setupControls.accessory.value
  });
  renderAvatarCanvas(setupAvatarCanvas, setupAvatar);
}

function updateProfileAvatar() {
  profileAvatar = normalizeAvatar({
    skinTone: profileControls.skin.dataset.value,
    hairColor: profileControls.hair.dataset.value,
    outfitColor: profileControls.outfit.dataset.value,
    accentColor: profileControls.accent.dataset.value,
    hairStyle: profileControls.hairStyle.value,
    outfitStyle: profileControls.outfitStyle.value,
    accessory: profileControls.accessory.value
  });
  renderAvatarCanvas(profileAvatarCanvas, profileAvatar);
}

function runAction(action) {
  showStatus("Working...", false);
  return action().catch(error => {
    showStatus(error?.message || "Something went wrong.", true);
  });
}

function showStatus(message, isError) {
  accountStatusBlock.classList.remove("hidden");
  accountStatusBlock.innerHTML = `<h2>${isError ? "Account issue" : "Status"}</h2><p>${escapeHtmlText(message)}</p>`;
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

function getCooldownCopy(changedAtMs) {
  if (!changedAtMs) {
    return "You can change your username once every 30 days.";
  }

  const nextWindow = changedAtMs + (30 * 24 * 60 * 60 * 1000);
  const remaining = nextWindow - Date.now();
  if (remaining <= 0) {
    return "Your username can be changed now.";
  }

  const days = Math.ceil(remaining / (24 * 60 * 60 * 1000));
  return `You can change your username again in about ${days} day${days === 1 ? "" : "s"}.`;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function escapeHtmlText(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
