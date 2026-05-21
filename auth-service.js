import { visionFirebase } from "./firebase-config.js?v=20260520-auth-live";
import { createDefaultAvatar, normalizeAvatar } from "./avatar.js?v=20260520-auth-live";
import { applyTheme } from "./site.js?v=20260520-auth-live";

const REQUIRED_FIREBASE_KEYS = ["apiKey", "authDomain", "projectId", "appId"];
const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 24;
const USERNAME_CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
const TRACK_INTERVAL_MS = 15000;
const DEFAULT_THEME = "noir";
const LOCAL_STORAGE_KEYS = {
  users: "vision3.localUsers.v1",
  session: "vision3.localSession.v1"
};
const LOCAL_PASSWORD_NAMESPACE = "vision3.local-auth";
const LOCAL_MODE_MESSAGE = "Local account mode is live on this browser. Email, password, avatars, themes, and leaderboard time save here now. Google sign-in still needs a real Firebase project.";

let firebaseModuleCache = null;
let appInstance = null;
let authInstance = null;
let dbInstance = null;
let servicesPromise = null;
let sessionStarted = false;
let localSessionSyncBound = false;
let currentSession = createSessionSnapshot();

const sessionListeners = new Set();

export function getBackendState() {
  if (!visionFirebase.enabled) {
    return {
      ready: true,
      mode: "local",
      supportsGoogle: false,
      message: LOCAL_MODE_MESSAGE
    };
  }

  const missingKeys = REQUIRED_FIREBASE_KEYS.filter(key => !visionFirebase.firebaseConfig?.[key] || visionFirebase.firebaseConfig[key] === "REPLACE_ME");
  if (missingKeys.length) {
    return {
      ready: false,
      mode: "firebase",
      supportsGoogle: false,
      message: `Firebase is missing: ${missingKeys.join(", ")}.`
    };
  }

  return {
    ready: true,
    mode: "firebase",
    supportsGoogle: true,
    message: "Firebase account mode is live."
  };
}

export function initAuthSession() {
  if (sessionStarted) {
    return;
  }

  sessionStarted = true;
  const backendState = getBackendState();

  currentSession = createSessionSnapshot({
    backendReady: backendState.ready,
    backendMode: backendState.mode,
    backendMessage: backendState.message,
    loading: backendState.ready && backendState.mode === "firebase"
  });
  emitSession();

  if (!backendState.ready) {
    currentSession = createSessionSnapshot({
      backendReady: false,
      backendMode: backendState.mode,
      backendMessage: backendState.message,
      loading: false
    });
    emitSession();
    return;
  }

  if (backendState.mode === "local") {
    bindLocalSessionSync();
    syncLocalSession();
    return;
  }

  void startSessionWatcher();
}

export function subscribeToSession(listener) {
  sessionListeners.add(listener);
  listener(currentSession);
  return () => {
    sessionListeners.delete(listener);
  };
}

export async function signUpWithEmail(email, password) {
  const backendState = requireReadyBackend();
  if (backendState.mode === "local") {
    return signUpWithEmailLocal(email, password);
  }

  const { auth, firebase } = await requireFirebaseBackend();
  return firebase.createUserWithEmailAndPassword(auth, sanitizeEmail(email), password);
}

export async function signInWithEmail(email, password) {
  const backendState = requireReadyBackend();
  if (backendState.mode === "local") {
    return signInWithEmailLocal(email, password);
  }

  const { auth, firebase } = await requireFirebaseBackend();
  return firebase.signInWithEmailAndPassword(auth, sanitizeEmail(email), password);
}

export async function signInWithGoogle() {
  const backendState = requireReadyBackend();
  if (backendState.mode !== "firebase") {
    throw new Error("Google sign-in needs Firebase to be connected first.");
  }

  const { auth, firebase } = await requireFirebaseBackend();
  const provider = new firebase.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  if (window.matchMedia?.("(max-width: 820px)")?.matches) {
    await firebase.signInWithRedirect(auth, provider);
    return null;
  }

  return firebase.signInWithPopup(auth, provider);
}

export async function signOutUser() {
  const backendState = getBackendState();

  if (!backendState.ready) {
    currentSession = createSessionSnapshot({
      backendReady: false,
      backendMode: backendState.mode,
      backendMessage: backendState.message
    });
    emitSession();
    return;
  }

  if (backendState.mode === "local") {
    clearLocalSession();
    applyLocalSessionRecord(null);
    return;
  }

  const { auth, firebase } = await requireFirebaseBackend();
  return firebase.signOut(auth);
}

export async function saveProfileSetup(username, avatar, theme) {
  const backendState = requireReadyBackend();
  const session = requireSignedInSession();

  if (backendState.mode === "local") {
    const nextRecord = mutateLocalUser(session.user.uid, (record, context) => {
      const usernameFields = buildUsernameFields(record, username, context.users, context.index, context.now);
      return {
        ...record,
        ...usernameFields,
        avatar: normalizeAvatar(avatar),
        theme: sanitizeTheme(theme),
        lastActiveAtMs: context.now
      };
    });

    applyTheme(nextRecord.theme);
    return currentSession.profile;
  }

  const { db, firebase } = await requireFirebaseBackend();
  const profile = await claimUsernameInFirebase(db, firebase, session.user.uid, session.profile, username);
  await firebase.updateDoc(firebase.doc(db, "users", session.user.uid), {
    avatar: normalizeAvatar(avatar),
    theme,
    updatedAt: firebase.serverTimestamp()
  });

  const nextProfile = {
    ...profile,
    avatar: normalizeAvatar(avatar),
    theme
  };

  currentSession = {
    ...currentSession,
    profile: nextProfile
  };
  applyTheme(theme);
  emitSession();
  return nextProfile;
}

export async function saveAvatar(avatar) {
  const backendState = requireReadyBackend();
  const session = requireSignedInSession();
  const normalizedAvatar = normalizeAvatar(avatar);

  if (backendState.mode === "local") {
    mutateLocalUser(session.user.uid, (record, context) => ({
      ...record,
      avatar: normalizedAvatar,
      lastActiveAtMs: context.now
    }));
    return currentSession.profile;
  }

  const { db, firebase } = await requireFirebaseBackend();
  await firebase.updateDoc(firebase.doc(db, "users", session.user.uid), {
    avatar: normalizedAvatar,
    updatedAt: firebase.serverTimestamp()
  });

  currentSession = {
    ...currentSession,
    profile: {
      ...currentSession.profile,
      avatar: normalizedAvatar
    }
  };
  emitSession();
  return currentSession.profile;
}

export async function saveThemePreference(theme) {
  const nextTheme = sanitizeTheme(theme);
  applyTheme(nextTheme);

  if (!currentSession.user || !currentSession.backendReady) {
    return;
  }

  if (currentSession.backendMode === "local") {
    mutateLocalUser(currentSession.user.uid, (record, context) => ({
      ...record,
      theme: nextTheme,
      lastActiveAtMs: context.now
    }));
    return;
  }

  const { db, firebase } = await requireFirebaseBackend();
  await firebase.updateDoc(firebase.doc(db, "users", currentSession.user.uid), {
    theme: nextTheme,
    updatedAt: firebase.serverTimestamp()
  });

  currentSession = {
    ...currentSession,
    profile: {
      ...currentSession.profile,
      theme: nextTheme
    }
  };
  emitSession();
}

export async function changeUsername(username) {
  const backendState = requireReadyBackend();
  const session = requireSignedInSession();

  if (backendState.mode === "local") {
    mutateLocalUser(session.user.uid, (record, context) => ({
      ...record,
      ...buildUsernameFields(record, username, context.users, context.index, context.now),
      lastActiveAtMs: context.now
    }));
    return currentSession.profile;
  }

  const { db, firebase } = await requireFirebaseBackend();
  const nextProfile = await claimUsernameInFirebase(db, firebase, session.user.uid, session.profile, username);
  currentSession = {
    ...currentSession,
    profile: nextProfile
  };
  emitSession();
  return nextProfile;
}

export async function getLeaderboardEntries(maxEntries = 50) {
  const backendState = requireReadyBackend();

  if (backendState.mode === "local") {
    return readLocalUsers()
      .filter(record => record.username)
      .sort((left, right) => {
        const timeDifference = Number(right.totalTimeMs || 0) - Number(left.totalTimeMs || 0);
        if (timeDifference !== 0) {
          return timeDifference;
        }
        return String(left.username).localeCompare(String(right.username));
      })
      .slice(0, maxEntries)
      .map(record => ({
        uid: record.uid,
        username: record.username,
        totalTimeMs: Number(record.totalTimeMs || 0),
        avatar: normalizeAvatar(record.avatar),
        role: record.role || "",
        theme: record.theme || DEFAULT_THEME
      }));
  }

  const { db, firebase } = await requireFirebaseBackend();
  const records = [];
  const snapshot = await firebase.getDocs(
    firebase.query(
      firebase.collection(db, "users"),
      firebase.orderBy("totalTimeMs", "desc"),
      firebase.limit(Math.max(maxEntries, 50))
    )
  );

  snapshot.forEach(documentSnapshot => {
    const data = documentSnapshot.data();
    if (!data?.username) {
      return;
    }

    records.push({
      uid: documentSnapshot.id,
      username: data.username,
      totalTimeMs: Number(data.totalTimeMs || 0),
      avatar: normalizeAvatar(data.avatar),
      role: data.role || "",
      theme: data.theme || DEFAULT_THEME
    });
  });

  return records.slice(0, maxEntries);
}

export async function getOwnerUserCount() {
  const backendState = requireReadyBackend();
  if (backendState.mode === "local") {
    return readLocalUsers().length;
  }

  const { db, firebase } = await requireFirebaseBackend();
  const snapshot = await firebase.getDocs(firebase.query(firebase.collection(db, "users"), firebase.limit(500)));
  return snapshot.size;
}

export function startPlaytimeTracker() {
  let visible = document.visibilityState === "visible";
  let lastTick = visible ? Date.now() : 0;
  let pendingMs = 0;

  const intervalId = window.setInterval(() => {
    if (!visible) {
      return;
    }

    const now = Date.now();
    pendingMs += now - lastTick;
    lastTick = now;
    void flushPending(false);
  }, TRACK_INTERVAL_MS);

  function handleVisibility() {
    if (document.visibilityState === "visible") {
      visible = true;
      lastTick = Date.now();
      return;
    }

    if (visible) {
      pendingMs += Date.now() - lastTick;
    }
    visible = false;
    void flushPending(true);
  }

  async function flushPending(force) {
    if (!currentSession.backendReady || !currentSession.user || pendingMs < (force ? 1000 : TRACK_INTERVAL_MS)) {
      return;
    }

    const delta = Math.max(0, Math.round(pendingMs));
    pendingMs = 0;

    try {
      if (currentSession.backendMode === "local") {
        mutateLocalUser(currentSession.user.uid, (record, context) => ({
          ...record,
          totalTimeMs: Number(record.totalTimeMs || 0) + delta,
          lastActiveAtMs: context.now
        }));
        return;
      }

      const { db, firebase } = await getFirebaseServices();
      await firebase.updateDoc(firebase.doc(db, "users", currentSession.user.uid), {
        totalTimeMs: firebase.increment(delta),
        lastActiveAt: firebase.serverTimestamp(),
        updatedAt: firebase.serverTimestamp()
      });

      currentSession = {
        ...currentSession,
        profile: {
          ...currentSession.profile,
          totalTimeMs: Number(currentSession.profile?.totalTimeMs || 0) + delta
        }
      };
      emitSession();
    } catch (error) {
      pendingMs += delta;
      void error;
    }
  }

  document.addEventListener("visibilitychange", handleVisibility);
  window.addEventListener("pagehide", handleVisibility);

  return () => {
    window.clearInterval(intervalId);
    document.removeEventListener("visibilitychange", handleVisibility);
    window.removeEventListener("pagehide", handleVisibility);
    if (visible) {
      pendingMs += Date.now() - lastTick;
    }
    void flushPending(true);
  };
}

async function startSessionWatcher() {
  const { auth, db, firebase } = await getFirebaseServices();

  try {
    await firebase.getRedirectResult(auth);
  } catch (error) {
    void error;
  }

  firebase.onAuthStateChanged(auth, async user => {
    if (!user) {
      currentSession = createSessionSnapshot({
        backendReady: true,
        backendMode: "firebase",
        backendMessage: "Firebase account mode is live.",
        loading: false,
        user: null,
        profile: null
      });
      emitSession();
      return;
    }

    const profile = await ensureUserProfile(db, firebase, user);
    currentSession = createSessionSnapshot({
      backendReady: true,
      backendMode: "firebase",
      backendMessage: "Firebase account mode is live.",
      loading: false,
      user,
      profile
    });

    if (profile.theme) {
      applyTheme(profile.theme);
    }

    emitSession();
  });
}

async function loadFirebaseModules() {
  if (firebaseModuleCache) {
    return firebaseModuleCache;
  }

  const [appModule, authModule, firestoreModule] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js"),
    import("https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js")
  ]);

  firebaseModuleCache = {
    ...appModule,
    ...authModule,
    ...firestoreModule
  };
  return firebaseModuleCache;
}

async function getFirebaseServices() {
  if (appInstance && authInstance && dbInstance) {
    return {
      app: appInstance,
      auth: authInstance,
      db: dbInstance,
      firebase: firebaseModuleCache
    };
  }

  if (!servicesPromise) {
    servicesPromise = (async () => {
      const firebase = await loadFirebaseModules();
      appInstance = firebase.initializeApp(visionFirebase.firebaseConfig);
      authInstance = firebase.getAuth(appInstance);
      dbInstance = firebase.getFirestore(appInstance);

      return {
        app: appInstance,
        auth: authInstance,
        db: dbInstance,
        firebase
      };
    })();
  }

  return servicesPromise;
}

async function ensureUserProfile(db, firebase, user) {
  const userRef = firebase.doc(db, "users", user.uid);
  const snapshot = await firebase.getDoc(userRef);

  if (!snapshot.exists()) {
    const newProfile = {
      uid: user.uid,
      email: user.email || "",
      username: "",
      usernameNormalized: "",
      usernameChangedAtMs: 0,
      avatar: createDefaultAvatar(user.email || user.uid),
      theme: DEFAULT_THEME,
      totalTimeMs: 0,
      role: resolveOwnerRole(user.email || ""),
      createdAtMs: Date.now()
    };

    await firebase.setDoc(userRef, {
      ...newProfile,
      createdAt: firebase.serverTimestamp(),
      updatedAt: firebase.serverTimestamp(),
      lastActiveAt: firebase.serverTimestamp()
    });

    return newProfile;
  }

  const data = snapshot.data();
  return {
    uid: user.uid,
    email: data.email || user.email || "",
    username: data.username || "",
    usernameNormalized: data.usernameNormalized || "",
    usernameChangedAtMs: Number(data.usernameChangedAtMs || 0),
    avatar: normalizeAvatar(data.avatar || createDefaultAvatar(user.email || user.uid)),
    theme: data.theme || DEFAULT_THEME,
    totalTimeMs: Number(data.totalTimeMs || 0),
    role: resolveOwnerRole(data.email || user.email || "", data.role || ""),
    createdAtMs: Number(data.createdAtMs || 0)
  };
}

async function claimUsernameInFirebase(db, firebase, uid, profile, rawUsername) {
  const username = sanitizeUsername(rawUsername);
  const normalized = username.toLowerCase();
  const now = Date.now();
  const userRef = firebase.doc(db, "users", uid);
  const usernameRef = firebase.doc(db, "usernames", normalized);

  return firebase.runTransaction(db, async transaction => {
    const userSnapshot = await transaction.get(userRef);
    if (!userSnapshot.exists()) {
      throw new Error("Your profile is missing. Sign in again.");
    }

    const userData = userSnapshot.data();
    const currentNormalized = userData.usernameNormalized || "";
    const currentUsername = userData.username || "";
    const currentChangedAtMs = Number(userData.usernameChangedAtMs || 0);

    if (currentNormalized === normalized) {
      return {
        ...profile,
        username: currentUsername || username,
        usernameNormalized: normalized,
        usernameChangedAtMs: currentChangedAtMs
      };
    }

    if (currentUsername && now - currentChangedAtMs < USERNAME_CHANGE_COOLDOWN_MS) {
      throw new Error("You can only change your username once every 30 days.");
    }

    const usernameSnapshot = await transaction.get(usernameRef);
    if (usernameSnapshot.exists() && usernameSnapshot.data().uid !== uid) {
      throw new Error("That username is already taken.");
    }

    if (currentNormalized && currentNormalized !== normalized) {
      transaction.delete(firebase.doc(db, "usernames", currentNormalized));
    }

    transaction.set(usernameRef, {
      uid,
      username,
      updatedAtMs: now
    });

    transaction.update(userRef, {
      username,
      usernameNormalized: normalized,
      usernameChangedAtMs: now,
      updatedAt: firebase.serverTimestamp(),
      updatedAtMs: now
    });

    return {
      ...profile,
      username,
      usernameNormalized: normalized,
      usernameChangedAtMs: now
    };
  });
}

async function requireFirebaseBackend() {
  const backendState = requireReadyBackend();
  if (backendState.mode !== "firebase") {
    throw new Error("Firebase is not connected for this project.");
  }

  return getFirebaseServices();
}

function requireReadyBackend() {
  const backendState = getBackendState();
  if (!backendState.ready) {
    throw new Error(backendState.message);
  }

  return backendState;
}

function requireSignedInSession() {
  if (!currentSession.user || !currentSession.profile) {
    throw new Error("You need to sign in first.");
  }

  return currentSession;
}

function bindLocalSessionSync() {
  if (localSessionSyncBound) {
    return;
  }

  localSessionSyncBound = true;
  window.addEventListener("storage", event => {
    if (event.key === LOCAL_STORAGE_KEYS.users || event.key === LOCAL_STORAGE_KEYS.session) {
      syncLocalSession();
    }
  });
}

function syncLocalSession() {
  const sessionToken = readLocalSessionToken();
  if (!sessionToken?.uid) {
    applyLocalSessionRecord(null);
    return;
  }

  const record = readLocalUsers().find(user => user.uid === sessionToken.uid);
  if (!record) {
    clearLocalSession();
    applyLocalSessionRecord(null);
    return;
  }

  applyLocalSessionRecord(record);
}

async function signUpWithEmailLocal(email, password) {
  const normalizedEmail = sanitizeEmail(email);
  validatePassword(password);
  const users = readLocalUsers();

  if (users.some(user => user.emailNormalized === normalizedEmail)) {
    throw new Error("An account with that email already exists.");
  }

  const now = Date.now();
  const record = normalizeLocalUserRecord({
    uid: createLocalUid(),
    email: normalizedEmail,
    emailNormalized: normalizedEmail,
    passwordHash: await hashPassword(normalizedEmail, password),
    username: "",
    usernameNormalized: "",
    usernameChangedAtMs: 0,
    avatar: createDefaultAvatar(normalizedEmail),
    theme: document.body?.dataset?.theme || DEFAULT_THEME,
    totalTimeMs: 0,
    role: resolveOwnerRole(normalizedEmail),
    createdAtMs: now,
    updatedAtMs: now,
    lastActiveAtMs: now
  });

  users.push(record);
  writeLocalUsers(users);
  writeLocalSessionToken(record.uid);
  applyLocalSessionRecord(record);
  return currentSession;
}

async function signInWithEmailLocal(email, password) {
  const normalizedEmail = sanitizeEmail(email);
  const users = readLocalUsers();
  const index = users.findIndex(user => user.emailNormalized === normalizedEmail);

  if (index === -1) {
    throw new Error("No account matched that email.");
  }

  const record = users[index];
  const passwordHash = await hashPassword(normalizedEmail, password);
  if (record.passwordHash !== passwordHash) {
    throw new Error("That password did not match.");
  }

  const nextRecord = normalizeLocalUserRecord({
    ...record,
    role: resolveOwnerRole(record.email, record.role),
    lastActiveAtMs: Date.now(),
    updatedAtMs: Date.now()
  });

  users[index] = nextRecord;
  writeLocalUsers(users);
  writeLocalSessionToken(nextRecord.uid);
  applyLocalSessionRecord(nextRecord);
  return currentSession;
}

function mutateLocalUser(uid, mutator) {
  const users = readLocalUsers();
  const index = users.findIndex(user => user.uid === uid);
  if (index === -1) {
    throw new Error("Your account could not be found. Sign in again.");
  }

  const now = Date.now();
  const currentRecord = normalizeLocalUserRecord(users[index]);
  const nextDraft = mutator(
    {
      ...currentRecord,
      avatar: normalizeAvatar(currentRecord.avatar)
    },
    {
      users,
      index,
      now
    }
  );

  const nextRecord = normalizeLocalUserRecord({
    ...currentRecord,
    ...nextDraft,
    passwordHash: currentRecord.passwordHash,
    email: currentRecord.email,
    emailNormalized: currentRecord.emailNormalized,
    role: resolveOwnerRole(currentRecord.email, nextDraft?.role || currentRecord.role),
    updatedAtMs: now
  });

  users[index] = nextRecord;
  writeLocalUsers(users);
  writeLocalSessionToken(nextRecord.uid);
  applyLocalSessionRecord(nextRecord);
  return nextRecord;
}

function applyLocalSessionRecord(record) {
  const backendState = getBackendState();
  currentSession = createSessionSnapshot({
    backendReady: backendState.ready,
    backendMode: "local",
    backendMessage: backendState.message,
    loading: false,
    user: record ? toSessionUser(record) : null,
    profile: record ? toSessionProfile(record) : null
  });

  if (record?.theme && document.body?.dataset?.theme !== record.theme) {
    applyTheme(record.theme);
  }

  emitSession();
}

function readLocalUsers() {
  const value = readStoredJson(LOCAL_STORAGE_KEYS.users, []);
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(record => normalizeLocalUserRecord(record)).filter(record => record.uid && record.emailNormalized);
}

function writeLocalUsers(users) {
  writeStoredJson(LOCAL_STORAGE_KEYS.users, users.map(record => normalizeLocalUserRecord(record)));
}

function readLocalSessionToken() {
  const value = readStoredJson(LOCAL_STORAGE_KEYS.session, null);
  return value && typeof value === "object" ? value : null;
}

function writeLocalSessionToken(uid) {
  writeStoredJson(LOCAL_STORAGE_KEYS.session, {
    uid,
    updatedAtMs: Date.now()
  });
}

function clearLocalSession() {
  localStorage.removeItem(LOCAL_STORAGE_KEYS.session);
}

function normalizeLocalUserRecord(record) {
  const email = sanitizeEmail(record?.email || "");
  const uid = String(record?.uid || "");
  const role = resolveOwnerRole(email, String(record?.role || ""));
  return {
    uid,
    email,
    emailNormalized: email,
    passwordHash: String(record?.passwordHash || ""),
    username: String(record?.username || ""),
    usernameNormalized: String(record?.usernameNormalized || ""),
    usernameChangedAtMs: Number(record?.usernameChangedAtMs || 0),
    avatar: normalizeAvatar(record?.avatar || createDefaultAvatar(email || uid || "vision")),
    theme: sanitizeTheme(record?.theme || DEFAULT_THEME),
    totalTimeMs: Number(record?.totalTimeMs || 0),
    role,
    createdAtMs: Number(record?.createdAtMs || Date.now()),
    updatedAtMs: Number(record?.updatedAtMs || Date.now()),
    lastActiveAtMs: Number(record?.lastActiveAtMs || 0)
  };
}

function toSessionUser(record) {
  return {
    uid: record.uid,
    email: record.email,
    providerId: "local"
  };
}

function toSessionProfile(record) {
  return {
    uid: record.uid,
    email: record.email,
    username: record.username || "",
    usernameNormalized: record.usernameNormalized || "",
    usernameChangedAtMs: Number(record.usernameChangedAtMs || 0),
    avatar: normalizeAvatar(record.avatar),
    theme: sanitizeTheme(record.theme),
    totalTimeMs: Number(record.totalTimeMs || 0),
    role: record.role || "",
    createdAtMs: Number(record.createdAtMs || 0)
  };
}

function buildUsernameFields(record, rawUsername, users, index, now) {
  const username = sanitizeUsername(rawUsername);
  const normalized = username.toLowerCase();
  const currentNormalized = record.usernameNormalized || "";
  const currentChangedAtMs = Number(record.usernameChangedAtMs || 0);

  if (currentNormalized === normalized) {
    return {
      username: record.username || username,
      usernameNormalized: normalized,
      usernameChangedAtMs: currentChangedAtMs
    };
  }

  if (record.username && now - currentChangedAtMs < USERNAME_CHANGE_COOLDOWN_MS) {
    throw new Error("You can only change your username once every 30 days.");
  }

  const isTaken = users.some((user, userIndex) => userIndex !== index && user.usernameNormalized === normalized);
  if (isTaken) {
    throw new Error("That username is already taken.");
  }

  return {
    username,
    usernameNormalized: normalized,
    usernameChangedAtMs: now
  };
}

function sanitizeUsername(value) {
  const username = String(value || "").trim().replace(/\s+/g, " ");
  if (username.length < USERNAME_MIN_LENGTH || username.length > USERNAME_MAX_LENGTH) {
    throw new Error(`Usernames must be ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} characters.`);
  }

  if (!/^[A-Za-z0-9 _.-]+$/.test(username)) {
    throw new Error("Use letters, numbers, spaces, dots, dashes, or underscores only.");
  }

  return username;
}

function sanitizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!email) {
    return "";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }

  return email;
}

function sanitizeTheme(value) {
  return String(value || "").trim() || DEFAULT_THEME;
}

function validatePassword(password) {
  if (String(password || "").length < 6) {
    throw new Error("Passwords must be at least 6 characters.");
  }
}

function resolveOwnerRole(email, currentRole = "") {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const ownerEmails = Array.isArray(visionFirebase.ownerEmails)
    ? visionFirebase.ownerEmails.map(entry => String(entry || "").trim().toLowerCase()).filter(Boolean)
    : [];

  if (ownerEmails.includes(normalizedEmail)) {
    return "owner";
  }

  return currentRole === "owner" ? "owner" : "";
}

function createSessionSnapshot(overrides = {}) {
  const backendState = getBackendState();
  return {
    backendReady: backendState.ready,
    backendMode: backendState.mode,
    backendMessage: backendState.message,
    loading: false,
    user: null,
    profile: null,
    ...overrides
  };
}

function createLocalUid() {
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function hashPassword(email, password) {
  const cryptoApi = globalThis.crypto;
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const input = `${LOCAL_PASSWORD_NAMESPACE}:${normalizedEmail}:${String(password || "")}`;

  if (!cryptoApi?.subtle) {
    return `plain:${btoa(input)}`;
  }

  const bytes = new TextEncoder().encode(input);
  const digest = await cryptoApi.subtle.digest("SHA-256", bytes);
  return bytesToHex(new Uint8Array(digest));
}

function bytesToHex(bytes) {
  return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
}

function readStoredJson(key, fallbackValue) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallbackValue;
  } catch (error) {
    return fallbackValue;
  }
}

function writeStoredJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function emitSession() {
  sessionListeners.forEach(listener => listener(currentSession));
}
