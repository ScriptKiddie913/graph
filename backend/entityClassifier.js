// backend/entityClassifier.js
// Deterministic entity type classifier — no ML, pure regex + heuristics

export const ENTITY_TYPES = {
  // Identity
  name:           "name",
  phone:          "phone",
  email:          "email",
  national_id:    "national_id",
  ip_address:     "ip_address",
  device_id:      "device_id",

  // Accounts — Social
  facebook:       "facebook",
  instagram:      "instagram",
  twitter_x:      "twitter_x",
  telegram:       "telegram",
  linkedin:       "linkedin",
  tiktok:         "tiktok",
  snapchat:       "snapchat",
  youtube:        "youtube",
  reddit:         "reddit",
  pinterest:      "pinterest",
  discord:        "discord",
  whatsapp:       "whatsapp",
  viber:          "viber",
  line:           "line",

  // Accounts — Streaming / Entertainment
  spotify:        "spotify",
  netflix:        "netflix",
  apple_music:    "apple_music",
  youtube_music:  "youtube_music",
  twitch:         "twitch",
  steam:          "steam",
  epic_games:     "epic_games",
  xbox:           "xbox",
  playstation:    "playstation",

  // Accounts — Finance / Crypto
  crypto_btc:     "crypto_btc",
  crypto_eth:     "crypto_eth",
  crypto_other:   "crypto_other",
  paypal:         "paypal",
  bank_account:   "bank_account",
  upi:            "upi",

  // Accounts — Google Ecosystem
  google_account: "google_account",
  google_maps:    "google_maps",
  google_drive:   "google_drive",

  // Location
  address:        "address",
  city:           "city",
  country:        "country",
  coordinates:    "coordinates",
  postcode:       "postcode",

  // Web
  domain:         "domain",
  url:            "url",
  username:       "username",
  password:       "password",

  // Misc
  date:           "date",
  vehicle_plate:  "vehicle_plate",
  unknown:        "unknown",
};

// Priority-ordered rules. First match wins.
const RULES = [
  // ── Web Accounts ─────────────────────────────────────────────────────────
  {
    type: "facebook",
    test: (v) =>
      /(?:facebook\.com|fb\.com)\/[\w.]+/i.test(v) ||
      /^fb:[\w.]+$/i.test(v),
  },
  {
    type: "instagram",
    test: (v) =>
      /(?:instagram\.com|instagr\.am)\/[\w.]+/i.test(v) ||
      /^ig:[\w.]+$/i.test(v),
  },
  {
    type: "twitter_x",
    test: (v) =>
      /(?:twitter\.com|x\.com)\/[\w]+/i.test(v) ||
      /^(?:tw|twitter):[\w]+$/i.test(v),
  },
  {
    type: "telegram",
    test: (v) =>
      /(?:t\.me|telegram\.me)\/[\w]+/i.test(v) ||
      /^tg:[\w]+$/i.test(v),
  },
  {
    type: "linkedin",
    test: (v) => /linkedin\.com\/in\/[\w-]+/i.test(v),
  },
  {
    type: "tiktok",
    test: (v) =>
      /tiktok\.com\/@[\w.]+/i.test(v) ||
      /^tt:[\w.]+$/i.test(v),
  },
  {
    type: "snapchat",
    test: (v) =>
      /snapchat\.com\/add\/[\w.]+/i.test(v) ||
      /^sc:[\w.]+$/i.test(v),
  },
  {
    type: "reddit",
    test: (v) => /reddit\.com\/u\/[\w-]+/i.test(v),
  },
  {
    type: "pinterest",
    test: (v) => /pinterest\.com\/[\w]+/i.test(v),
  },
  {
    type: "discord",
    test: (v) =>
      /discord\.gg\/[\w]+/i.test(v) ||
      /^[\w]{2,32}#\d{4}$/.test(v),
  },
  {
    type: "viber",
    test: (v) => /viber:\/\//i.test(v) || /viber\.com\/[\w]+/i.test(v),
  },
  {
    type: "line",
    test: (v) => /line\.me\/[\w]+/i.test(v),
  },
  {
    type: "spotify",
    test: (v) =>
      /open\.spotify\.com\/(user|artist|track|album)\/[\w]+/i.test(v) ||
      /^spotify:[\w:]+$/.test(v),
  },
  {
    type: "netflix",
    test: (v) => /netflix\.com\/[\w/]+/i.test(v),
  },
  {
    type: "apple_music",
    test: (v) => /music\.apple\.com\/[\w/]+/i.test(v),
  },
  {
    type: "youtube_music",
    test: (v) => /music\.youtube\.com\/[\w/]+/i.test(v),
  },
  {
    type: "twitch",
    test: (v) => /twitch\.tv\/[\w]+/i.test(v),
  },
  {
    type: "steam",
    test: (v) =>
      /steamcommunity\.com\/(?:id|profiles)\/[\w]+/i.test(v) ||
      /^7656\d{13}$/.test(v),
  },
  {
    type: "epic_games",
    test: (v) => /epicgames\.com\/[\w/]+/i.test(v) || /^eg:[\w]+$/i.test(v),
  },
  {
    type: "xbox",
    test: (v) => /xbox\.com\/[\w/]+/i.test(v) || /^xbl:[\w]+$/i.test(v),
  },
  {
    type: "playstation",
    test: (v) => /playstation\.com\/[\w/]+/i.test(v) || /^psn:[\w]+$/i.test(v),
  },
  {
    type: "google_account",
    test: (v) => /@gmail\.com$/i.test(v) || /^gid:\d+$/.test(v),
  },
  {
    type: "youtube",
    test: (v) =>
      /youtube\.com\/(channel|c|@)\/[\w-]+/i.test(v) ||
      /youtu\.be\/[\w-]+/i.test(v),
  },
  {
    type: "google_maps",
    test: (v) =>
      /maps\.google\.com|goo\.gl\/maps|maps\.app\.goo\.gl/i.test(v),
  },
  {
    type: "google_drive",
    test: (v) => /drive\.google\.com\/[\w/]+/i.test(v),
  },

  // ── Crypto ───────────────────────────────────────────────────────────────
  {
    type: "crypto_btc",
    test: (v) =>
      /^(1|3)[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(v) ||
      /^bc1[a-zA-HJ-NP-Z0-9]{6,87}$/.test(v),
  },
  {
    type: "crypto_eth",
    test: (v) => /^0x[a-fA-F0-9]{40}$/.test(v),
  },
  {
    type: "crypto_other",
    test: (v) =>
      /^T[a-km-zA-HJ-NP-Z1-9]{33}$/.test(v) ||
      /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v),
  },

  // ── Finance ──────────────────────────────────────────────────────────────
  {
    type: "bank_account",
    test: (v) => /^[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7,}([A-Z0-9]?){0,16}$/.test(v),
  },
  {
    type: "upi",
    test: (v) => /^[\w.\-]+@[\w]+$/.test(v) && !v.includes(".com"),
  },
  {
    type: "paypal",
    test: (v) => /paypal\.me\/[\w]+/i.test(v),
  },

  // ── Identity & Contact ───────────────────────────────────────────────────
  {
    type: "email",
    // Note: google_account rule above catches @gmail.com first
    test: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v),
  },
  {
    type: "phone",
    test: (v) => /^\+?[\d]{7,15}$/.test(v),
  },
  {
    type: "ip_address",
    test: (v) =>
      /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(v) ||
      /^([a-f0-9:]+:+)+[a-f0-9]+$/i.test(v),
  },
  {
    type: "device_id",
    test: (v) =>
      /^\d{15,17}$/.test(v) ||
      /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(v),
  },
  {
    type: "national_id",
    test: (v) =>
      /^\d{12}$/.test(v) ||
      /^\d{3}-\d{2}-\d{4}$/.test(v) ||
      /^[A-Z]{1}\d{7}$/.test(v),
  },
  {
    type: "coordinates",
    test: (v) => /^-?\d{1,3}\.\d+,\s*-?\d{1,3}\.\d+$/.test(v),
  },
  {
    type: "postcode",
    test: (v) =>
      /^\d{5}(-\d{4})?$/.test(v) ||
      /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i.test(v) ||
      /^\d{6}$/.test(v),
  },
  {
    type: "vehicle_plate",
    test: (v) => /^[A-Z]{2}\s?\d{1,2}\s?[A-Z]{1,2}\s?\d{4}$/i.test(v),
  },
  {
    type: "date",
    test: (v) =>
      /^\d{4}-\d{2}-\d{2}$/.test(v) ||
      /^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(v),
  },

  // ── Web ──────────────────────────────────────────────────────────────────
  {
    type: "url",
    test: (v) => /^https?:\/\/.+/i.test(v),
  },
  {
    type: "domain",
    test: (v) =>
      /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(v) && !v.includes("/"),
  },
  {
    type: "username",
    test: (v) => /^@[\w.]+$/.test(v),
  },

  // ── Name heuristic (last resort before unknown) ───────────────────────────
  {
    type: "name",
    // 2-5 words, each capitalized, letters only (covers unicode names too)
    test: (v) =>
      /^[^\d@#]{2,}(\s[^\d@#]{2,}){1,4}$/.test(v) &&
      !/https?:/.test(v) &&
      v.split(" ").length >= 2 &&
      v.split(" ").length <= 5,
  },
];

/**
 * Classify a single normalized value string.
 * Returns one of the ENTITY_TYPES keys.
 */
export function classifyEntity(value) {
  if (!value) return "unknown";
  const v = String(value).trim();
  for (const rule of RULES) {
    try {
      if (rule.test(v)) return rule.type;
    } catch {
      continue;
    }
  }
  return "unknown";
}

/**
 * Classify and return enriched entity object.
 */
export function enrichEntity(value) {
  const type = classifyEntity(value);
  return {
    value,
    type,
    category: getCategoryFor(type),
    icon: ENTITY_ICONS[type] || "⬡",
    color: ENTITY_COLORS[type] || "#7b6fff",
  };
}

// Visual config used by both backend (API response) and frontend (node styling)
export const ENTITY_COLORS = {
  name:           "#00d4ff",
  phone:          "#00ff9d",
  email:          "#ff9d00",
  google_account: "#ea4335",
  facebook:       "#1877f2",
  instagram:      "#e1306c",
  twitter_x:      "#000000",
  telegram:       "#2aabee",
  linkedin:       "#0077b5",
  tiktok:         "#ff0050",
  snapchat:       "#fffc00",
  discord:        "#5865f2",
  spotify:        "#1db954",
  twitch:         "#9146ff",
  steam:          "#1b2838",
  crypto_btc:     "#f7931a",
  crypto_eth:     "#627eea",
  crypto_other:   "#e84142",
  paypal:         "#003087",
  bank_account:   "#00b894",
  upi:            "#6c5ce7",
  ip_address:     "#fd79a8",
  device_id:      "#636e72",
  national_id:    "#e17055",
  url:            "#74b9ff",
  domain:         "#a29bfe",
  address:        "#55efc4",
  unknown:        "#7b6fff",
};

export const ENTITY_ICONS = {
  name:           "👤",
  phone:          "📱",
  email:          "✉️",
  google_account: "🔴",
  facebook:       "📘",
  instagram:      "📸",
  twitter_x:      "🐦",
  telegram:       "✈️",
  linkedin:       "💼",
  tiktok:         "🎵",
  snapchat:       "👻",
  discord:        "🎮",
  spotify:        "🎧",
  twitch:         "🟣",
  steam:          "🎮",
  crypto_btc:     "₿",
  crypto_eth:     "⟠",
  crypto_other:   "🪙",
  paypal:         "💰",
  bank_account:   "🏦",
  upi:            "💳",
  ip_address:     "🌐",
  device_id:      "📟",
  national_id:    "🪪",
  url:            "🔗",
  domain:         "🌍",
  address:        "📍",
  coordinates:    "🗺️",
  unknown:        "⬡",
};

export function getCategoryFor(type) {
  const map = {
    name: "identity", phone: "identity", email: "identity",
    national_id: "identity", device_id: "identity",
    facebook: "social", instagram: "social", twitter_x: "social",
    telegram: "social", linkedin: "social", tiktok: "social",
    snapchat: "social", discord: "social", whatsapp: "social",
    reddit: "social", pinterest: "social", viber: "social", line: "social",
    youtube: "streaming", spotify: "streaming", twitch: "streaming",
    netflix: "streaming", apple_music: "streaming", youtube_music: "streaming",
    steam: "gaming", epic_games: "gaming", xbox: "gaming", playstation: "gaming",
    crypto_btc: "finance", crypto_eth: "finance", crypto_other: "finance",
    paypal: "finance", bank_account: "finance", upi: "finance",
    google_account: "google", google_maps: "google", google_drive: "google",
    ip_address: "network", domain: "network", url: "network",
    address: "location", city: "location", country: "location",
    coordinates: "location", postcode: "location",
  };
  return map[type] || "other";
}
