import { visionFirebase } from "./firebase-config.js?v=20260520-vision-refresh";
import { createDefaultAvatar, normalizeAvatar } from "./avatar.js?v=20260520-vision-refresh";
import { applyTheme } from "./site.js?v=20260520-vision-refresh";

const REQUIRED_FIREBASE_KEYS = ["apiKey", "authDomain", "projectId", "appId"];
const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 24;
const USERNAME_CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
const TRACK_INTERVAL_MS = 15000;

let firebaseModuleCache = null;
let appInstance = null;
let authInstance = null;
let dbInstance = null;
let servicesPromise = null;
let sessionStarted = false;
let currentSession = {
  backendReady: false,
  backendMessage: "Accounts are disabled until Firebase is configured.",
  loading: false,
  user: null,
  profile: null
};

const sessionListeners = new Set();

export function getBackendState() {
  if (!visionFirebase.enabled) {
    return {
      ready: false,
      message: "Accounts, Google sign-in, and leaderboard sync need Firebase to be enabled in firebase-config.js."
    };
  }

  const missingKeys = REQUIRED_FIREBASE_KEYS.filter(key => !visionFirebase.firebaseConfig?.[key] || visionFirebase.firebaseConfig[key] === "REPLACE_ME");
  if (missingKeys.length) {
    return {
      ready: false,
      message: `Firebase is missing: ${missingKeys.join(", ")}.`
    };
  }

  return {
    ready: true,
    message: "Firebase ready."
  };
}

export function initAuthSession() {
  if (sessionStarted) {
    return;
  }

  sessionStarted = true;
  const backendState = getBackendState();

  if (!backendState.ready) {
    currentSession = {
      ...currentSession,
      backendReady: false,
      backendMessage: backendState.message,
      loading: false
    };
    emitSession();
    return;
  }

  currentSession = {
    ...currentSession,
    backendReady: true,
    backendMessage: backendState.message,
    loading: true
  };
  emitSession();
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
  const { auth, firebase } = await requireBackend();
  return firebase.createUserWithEmailAndPassword(auth, email.trim(), password);
}

export async function signInWithEmail(email, password) {
  const { auth, firebase } = await requireBackend();
  return firebase.signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function signInWithGoogle() {
  const { auth, firebase } = await requireBackend();
  const provider = new firebase.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  if (window.matchMedia?.("(max-width: 820px)")?.matches) {
    await firebase.signInWithRedirect(auth, provider);
    return null;
  }

  return firebase.signInWithPopup(auth, provider);
}

export async function signOutUser() {
  const { auth, firebase } = await requireBackend();
  return firebase.signOut(auth);
}

export async function saveProfileSetup(username, avatar, theme) {
  const { db, firebase } = await requireBackend();
  const session = requireSignedInSession();
  const profile = await claimUsername(db, firebase, session.user.uid, session.profile, username);
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
  const { db, firebase } = await requireBackend();
  const session = requireSignedInSession();
  const normalizedAvatar = normalizeAvatar(avatar);

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
  applyTheme(theme);

  if (!currentSession.user || !currentSession.backendReady) {
    return;
  }

  const { db, firebase } = await requireBackend();
  await firebase.updateDoc(firebase.doc(db, "users", currentSession.user.uid), {
    theme,
    updatedAt: firebase.serverTimestamp()
  });

  currentSession = {
    ...currentSession,
    profile: {
      ...currentSession.profile,
      theme
    }
  };
  emitSession();
}

export async function changeUsername(username) {
  const { db, firebase } = await requireBackend();
  const session = requireSignedInSession();
  const nextProfile = await claimUsername(db, firebase, session.user.uid, session.profile, username);
  currentSession = {
    ...currentSession,
    profile: nextProfile
  };
  emitSession();
  return nextProfile;
}

export async function getLeaderboardEntries(maxEntries = 50) {
  const { db, firebase } = await requireBackend();
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
      theme: data.theme || "noir"
    });
  });

  return records.slice(0, maxEntries);
}

export async function getOwnerUserCount() {
  const { db, firebase } = await requireBackend();
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
      currentSession = {
        ...currentSession,
        backendReady: true,
        loading: false,
        user: null,
        profile: null
      };
      emitSession();
      return;
    }

    const profile = await ensureUserProfile(db, firebase, user);
    currentSession = {
      ...currentSession,
      backendReady: true,
      loading: false,
      user,
      profile
    };

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
      theme: "noir",
      totalTimeMs: 0,
      role: "",
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
    theme: data.theme || "noir",
    totalTimeMs: Number(data.totalTimeMs || 0),
    role: data.role || "",
    createdAtMs: Number(data.createdAtMs || 0)
  };
}

async function claimUsername(db, firebase, uid, profile, rawUsername) {
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

    if (currentUsername && currentNormalized !== normalized && now - currentChangedAtMs < USERNAME_CHANGE_COOLDOWN_MS) {
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

async function requireBackend() {
  const backendState = getBackendState();
  if (!backendState.ready) {
    throw new Error(backendState.message);
  }

  return getFirebaseServices();
}

function requireSignedInSession() {
  if (!currentSession.user || !currentSession.profile) {
    throw new Error("You need to sign in first.");
  }

  return currentSession;
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

function emitSession() {
  sessionListeners.forEach(listener => listener(currentSession));
}
