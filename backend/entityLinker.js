// backend/entityLinker.js

import { getCategoryFor } from "./entityClassifier.js";

/**
 * LINK WEIGHT TABLE
 * Higher weight = stronger / more meaningful relationship.
 * Used to style edges in the frontend (thicker = stronger).
 *
 * Format: { [typeA]: { [typeB]: weight } }
 * Symmetric — only define one direction.
 */
export const LINK_WEIGHTS = {
  name: {
    phone:          10,
    email:          10,
    google_account: 9,
    facebook:       8,
    instagram:      8,
    telegram:       8,
    twitter_x:      7,
    linkedin:       9,
    national_id:    10,
    address:        8,
    device_id:      7,
    crypto_btc:     6,
    crypto_eth:     6,
    ip_address:     5,
  },
  phone: {
    email:          8,
    telegram:       9,
    whatsapp:       9,
    national_id:    8,
    upi:            7,
    address:        6,
  },
  email: {
    google_account: 9,
    facebook:       7,
    linkedin:       7,
    paypal:         8,
    domain:         6,
  },
  google_account: {
    youtube:        9,
    google_drive:   9,
    google_maps:    7,
  },
  crypto_btc: {
    crypto_eth:     7,
    paypal:         5,
    bank_account:   5,
  },
  ip_address: {
    device_id:      8,
    domain:         7,
    url:            6,
  },
  facebook: {
    instagram:      8,
    whatsapp:       8,
  },
  steam: {
    discord:        7,
    epic_games:     6,
  },
};

/**
 * LINK LABEL TABLE
 * Human-readable labels for edges based on type pair.
 */
export const LINK_LABELS = {
  "name-phone":             "has number",
  "name-email":             "has email",
  "name-address":           "lives at",
  "name-national_id":       "identified by",
  "name-facebook":          "has profile",
  "email-google_account":   "is google account",
  "phone-telegram":         "registered on Telegram",
  "phone-whatsapp":         "registered on WhatsApp",
  "ip_address-device_id":   "used by device",
  "crypto_btc-crypto_eth":  "same wallet cluster",
  "facebook-instagram":     "same Meta identity",
  "facebook-whatsapp":      "same Meta identity",
  "google_account-youtube": "linked channel",
};

/**
 * Get edge metadata for a pair of entity types.
 * Returns { weight, label, category }.
 */
export function getLinkMeta(typeA, typeB) {
  const key1 = `${typeA}-${typeB}`;
  const key2 = `${typeB}-${typeA}`;

  const weight =
    LINK_WEIGHTS[typeA]?.[typeB] ||
    LINK_WEIGHTS[typeB]?.[typeA] ||
    3; // default low-weight link

  const label =
    LINK_LABELS[key1] ||
    LINK_LABELS[key2] ||
    "linked to";

  const catA = getCategoryFor(typeA);
  const catB = getCategoryFor(typeB);

  let category = "generic";
  if (typeA === typeB) category = "same_type";
  else if (catA === "identity" && catB === "identity") category = "identity_cluster";
  else if (catA === "social" || catB === "social") category = "social_cluster";
  else if (catA === "finance" || catB === "finance") category = "finance_cluster";

  return { weight, label, category };
}

/**
 * Given a list of values from the same source row,
 * produce the optimal set of edges (not all-to-all, only meaningful ones).
 *
 * Strategy:
 * 1. Classify all values
 * 2. Find the "anchor" entity (highest priority type — name > phone > email > ...)
 * 3. Link the anchor to all others
 * 4. Link same-category entities to each other too
 */
export function buildLinksFromRow(values, classifyFn) {
  if (!values || values.length < 2) return [];

  const entities = values.map((v) => ({
    value: v,
    type: classifyFn(v),
  }));

  // Priority order for anchors
  const ANCHOR_PRIORITY = [
    "name", "phone", "email", "google_account", "national_id",
    "facebook", "instagram", "telegram", "crypto_btc", "crypto_eth",
    "ip_address", "domain", "unknown",
  ];

  const anchorType = ANCHOR_PRIORITY.find((t) =>
    entities.some((e) => e.type === t)
  );
  const anchor = entities.find((e) => e.type === anchorType) || entities[0];

  // Use a Map keyed by canonical edge key to deduplicate
  const linksMap = new Map();

  const addLink = (a, b) => {
    if (a.value === b.value) return;
    const key =
      a.value < b.value
        ? `${a.value}~~${b.value}`
        : `${b.value}~~${a.value}`;
    if (!linksMap.has(key)) {
      linksMap.set(key, { from: a, to: b, key });
    }
  };

  // Anchor → all others
  for (const e of entities) {
    if (e !== anchor) addLink(anchor, e);
  }

  // Same-category cross-links (e.g. multiple social accounts → link them too)
  const byCategory = {};
  for (const e of entities) {
    const cat = getCategoryFor(e.type);
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(e);
  }
  for (const members of Object.values(byCategory)) {
    if (members.length >= 2) {
      for (let i = 0; i < members.length - 1; i++) {
        addLink(members[i], members[i + 1]);
      }
    }
  }

  return Array.from(linksMap.values());
}
