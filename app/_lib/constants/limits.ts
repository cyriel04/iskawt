// Numeric limits shared by the URL parser, the filter panel and the query layer.
// The caps mirror the URL shape documented in app/_lib/types.ts: above its cap
// a value is dropped, not clamped.

export const SEARCH_TEXT_MAX = 100; // characters (code points), not UTF-16 units
export const CREW_MAX = 999;
export const RATE_MAX = 999999; // whole pesos
export const PAGE_MAX = 999;

export const PAGE_SIZE = 12; // spaces per browse page

export const MAGIC_LINK_TTL_MINUTES = 15;
export const MAGIC_LINK_REQUESTS_PER_HOUR = 5; // per email address
