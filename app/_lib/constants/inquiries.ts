// Limits for inquiries and messages. Shared by the validator, the server and
// the forms. crewSize reuses CREW_MAX from limits.ts.

export const INQUIRY_NAME_MAX = 100;
export const INQUIRY_COMPANY_MAX = 100;
export const INQUIRY_BUDGET_NOTE_MAX = 500;
export const MESSAGE_BODY_MAX = 4000;
export const INQUIRY_DURATION_HOURS_MAX = 24;
export const SHOOT_DATE_MAX_DAYS_AHEAD = 365;
export const INQUIRIES_PER_USER_PER_DAY = 10;
export const MESSAGES_PER_USER_PER_HOUR = 60;
export const NOTIFY_COOLDOWN_MINUTES = 10;
export const THREAD_POLL_SECONDS = 15;
export const INBOX_PREVIEW_CHARS = 140;
export const INBOX_PAGE_SIZE = 50;
