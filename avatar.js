export const SKIN_SWATCHES = ["#f2d3b1", "#ddb18b", "#bf8a68", "#8f5b3f", "#6f4128"];
export const HAIR_SWATCHES = ["#161616", "#53311d", "#8d5524", "#d18f5b", "#f0d36d", "#8be0ff", "#ff6b8a"];
export const OUTFIT_SWATCHES = ["#ffffff", "#7f8ea3", "#3aa0ff", "#8a5cff", "#ff5555", "#4ad295", "#ffd166"];
export const ACCENT_SWATCHES = ["#f6f6f6", "#89f2ff", "#ff9bd1", "#ffe082", "#a8ff78", "#ff8a5b"];

export const DEFAULT_AVATAR = Object.freeze({
  skinTone: SKIN_SWATCHES[1],
  hairColor: HAIR_SWATCHES[0],
  outfitColor: OUTFIT_SWATCHES[2],
  accentColor: ACCENT_SWATCHES[1],
  hairStyle: "spikes",
  outfitStyle: "hoodie",
  accessory: "none"
});

export function createDefaultAvatar(seedText = "") {
  const hash = hashString(seedText || "vision");
  return {
    skinTone: SKIN_SWATCHES[hash % SKIN_SWATCHES.length],
    hairColor: HAIR_SWATCHES[(hash >> 3) % HAIR_SWATCHES.length],
    outfitColor: OUTFIT_SWATCHES[(hash >> 6) % OUTFIT_SWATCHES.length],
    accentColor: ACCENT_SWATCHES[(hash >> 9) % ACCENT_SWATCHES.length],
    hairStyle: ["spikes", "sweep", "hood", "buzz"][(hash >> 12) % 4],
    outfitStyle: ["hoodie", "armor", "tee", "jacket"][(hash >> 15) % 4],
    accessory: ["none", "visor", "headset", "bandana"][(hash >> 18) % 4]
  };
}

export function normalizeAvatar(rawAvatar = {}) {
  return {
    skinTone: SKIN_SWATCHES.includes(rawAvatar.skinTone) ? rawAvatar.skinTone : DEFAULT_AVATAR.skinTone,
    hairColor: HAIR_SWATCHES.includes(rawAvatar.hairColor) ? rawAvatar.hairColor : DEFAULT_AVATAR.hairColor,
    outfitColor: OUTFIT_SWATCHES.includes(rawAvatar.outfitColor) ? rawAvatar.outfitColor : DEFAULT_AVATAR.outfitColor,
    accentColor: ACCENT_SWATCHES.includes(rawAvatar.accentColor) ? rawAvatar.accentColor : DEFAULT_AVATAR.accentColor,
    hairStyle: ["spikes", "sweep", "hood", "buzz"].includes(rawAvatar.hairStyle) ? rawAvatar.hairStyle : DEFAULT_AVATAR.hairStyle,
    outfitStyle: ["hoodie", "armor", "tee", "jacket"].includes(rawAvatar.outfitStyle) ? rawAvatar.outfitStyle : DEFAULT_AVATAR.outfitStyle,
    accessory: ["none", "visor", "headset", "bandana"].includes(rawAvatar.accessory) ? rawAvatar.accessory : DEFAULT_AVATAR.accessory
  };
}

export function renderAvatarCanvas(canvas, avatarInput) {
  if (!canvas) {
    return;
  }

  const avatar = normalizeAvatar(avatarInput);
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  const width = canvas.width;
  const height = canvas.height;
  const pixels = 16;
  const scale = Math.floor(Math.min(width, height) / pixels);
  const offsetX = Math.floor((width - pixels * scale) / 2);
  const offsetY = Math.floor((height - pixels * scale) / 2);

  context.clearRect(0, 0, width, height);
  context.imageSmoothingEnabled = false;

  fillPixelRect(context, offsetX, offsetY, scale, 0, 0, 16, 16, "rgba(255,255,255,0.04)");
  fillPixelRect(context, offsetX, offsetY, scale, 4, 2, 8, 5, avatar.skinTone);
  fillPixelRect(context, offsetX, offsetY, scale, 5, 7, 6, 1, shadeColor(avatar.skinTone, -0.12));
  fillPixelRect(context, offsetX, offsetY, scale, 5, 4, 1, 1, "#111111");
  fillPixelRect(context, offsetX, offsetY, scale, 10, 4, 1, 1, "#111111");
  fillPixelRect(context, offsetX, offsetY, scale, 6, 5, 4, 1, "rgba(17,17,17,0.22)");
  fillPixelRect(context, offsetX, offsetY, scale, 6, 6, 4, 1, shadeColor(avatar.skinTone, -0.05));

  drawHair(context, offsetX, offsetY, scale, avatar);
  drawOutfit(context, offsetX, offsetY, scale, avatar);
  drawAccessory(context, offsetX, offsetY, scale, avatar);

  fillPixelRect(context, offsetX, offsetY, scale, 4, 12, 3, 3, shadeColor(avatar.outfitColor, -0.25));
  fillPixelRect(context, offsetX, offsetY, scale, 9, 12, 3, 3, shadeColor(avatar.outfitColor, -0.25));
}

function drawHair(context, offsetX, offsetY, scale, avatar) {
  const color = avatar.hairColor;

  if (avatar.hairStyle === "buzz") {
    fillPixelRect(context, offsetX, offsetY, scale, 4, 1, 8, 2, color);
    fillPixelRect(context, offsetX, offsetY, scale, 3, 3, 1, 2, color);
    fillPixelRect(context, offsetX, offsetY, scale, 12, 3, 1, 2, color);
    return;
  }

  if (avatar.hairStyle === "hood") {
    fillPixelRect(context, offsetX, offsetY, scale, 3, 1, 10, 2, shadeColor(avatar.outfitColor, -0.24));
    fillPixelRect(context, offsetX, offsetY, scale, 2, 3, 2, 5, shadeColor(avatar.outfitColor, -0.24));
    fillPixelRect(context, offsetX, offsetY, scale, 12, 3, 2, 5, shadeColor(avatar.outfitColor, -0.24));
    fillPixelRect(context, offsetX, offsetY, scale, 4, 1, 8, 1, color);
    return;
  }

  if (avatar.hairStyle === "sweep") {
    fillPixelRect(context, offsetX, offsetY, scale, 4, 1, 8, 2, color);
    fillPixelRect(context, offsetX, offsetY, scale, 3, 3, 7, 1, color);
    fillPixelRect(context, offsetX, offsetY, scale, 2, 4, 5, 1, color);
    fillPixelRect(context, offsetX, offsetY, scale, 11, 3, 1, 2, color);
    return;
  }

  fillPixelRect(context, offsetX, offsetY, scale, 4, 1, 8, 2, color);
  fillPixelRect(context, offsetX, offsetY, scale, 3, 3, 1, 2, color);
  fillPixelRect(context, offsetX, offsetY, scale, 12, 3, 1, 2, color);
  fillPixelRect(context, offsetX, offsetY, scale, 5, 0, 1, 1, color);
  fillPixelRect(context, offsetX, offsetY, scale, 7, 0, 1, 1, color);
  fillPixelRect(context, offsetX, offsetY, scale, 9, 0, 1, 1, color);
}

function drawOutfit(context, offsetX, offsetY, scale, avatar) {
  const color = avatar.outfitColor;
  const accent = avatar.accentColor;

  if (avatar.outfitStyle === "armor") {
    fillPixelRect(context, offsetX, offsetY, scale, 4, 8, 8, 4, shadeColor(color, -0.1));
    fillPixelRect(context, offsetX, offsetY, scale, 5, 9, 6, 2, color);
    fillPixelRect(context, offsetX, offsetY, scale, 7, 8, 2, 4, accent);
    return;
  }

  if (avatar.outfitStyle === "tee") {
    fillPixelRect(context, offsetX, offsetY, scale, 4, 8, 8, 4, color);
    fillPixelRect(context, offsetX, offsetY, scale, 6, 9, 4, 1, accent);
    return;
  }

  if (avatar.outfitStyle === "jacket") {
    fillPixelRect(context, offsetX, offsetY, scale, 4, 8, 8, 4, shadeColor(color, -0.08));
    fillPixelRect(context, offsetX, offsetY, scale, 7, 8, 2, 4, "#f6f6f6");
    fillPixelRect(context, offsetX, offsetY, scale, 5, 9, 2, 2, color);
    fillPixelRect(context, offsetX, offsetY, scale, 9, 9, 2, 2, color);
    return;
  }

  fillPixelRect(context, offsetX, offsetY, scale, 4, 8, 8, 4, color);
  fillPixelRect(context, offsetX, offsetY, scale, 6, 8, 4, 1, accent);
  fillPixelRect(context, offsetX, offsetY, scale, 6, 9, 1, 2, accent);
  fillPixelRect(context, offsetX, offsetY, scale, 9, 9, 1, 2, accent);
}

function drawAccessory(context, offsetX, offsetY, scale, avatar) {
  const color = avatar.accentColor;

  if (avatar.accessory === "visor") {
    fillPixelRect(context, offsetX, offsetY, scale, 4, 4, 8, 2, color);
    fillPixelRect(context, offsetX, offsetY, scale, 5, 5, 6, 1, shadeColor(color, -0.18));
    return;
  }

  if (avatar.accessory === "headset") {
    fillPixelRect(context, offsetX, offsetY, scale, 2, 4, 1, 3, color);
    fillPixelRect(context, offsetX, offsetY, scale, 13, 4, 1, 3, color);
    fillPixelRect(context, offsetX, offsetY, scale, 3, 3, 10, 1, shadeColor(color, -0.12));
    fillPixelRect(context, offsetX, offsetY, scale, 10, 7, 2, 1, color);
    return;
  }

  if (avatar.accessory === "bandana") {
    fillPixelRect(context, offsetX, offsetY, scale, 3, 4, 10, 1, color);
    fillPixelRect(context, offsetX, offsetY, scale, 11, 5, 2, 1, color);
  }
}

function fillPixelRect(context, offsetX, offsetY, scale, x, y, width, height, color) {
  context.fillStyle = color;
  context.fillRect(offsetX + x * scale, offsetY + y * scale, width * scale, height * scale);
}

function shadeColor(hexColor, shift) {
  const color = hexColor.replace("#", "");
  const red = clamp(Math.round(parseInt(color.slice(0, 2), 16) * (1 + shift)), 0, 255);
  const green = clamp(Math.round(parseInt(color.slice(2, 4), 16) * (1 + shift)), 0, 255);
  const blue = clamp(Math.round(parseInt(color.slice(4, 6), 16) * (1 + shift)), 0, 255);
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

function toHex(value) {
  return value.toString(16).padStart(2, "0");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hashString(value) {
  let hash = 0;
  for (const char of String(value)) {
    hash = ((hash << 5) - hash) + char.charCodeAt(0);
    hash |= 0;
  }
  return Math.abs(hash);
}
