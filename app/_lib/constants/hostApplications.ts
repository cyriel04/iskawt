// Limits for host applications. Shared by the validator, the server and the form.
// The applicant's name reuses INQUIRY_NAME_MAX from inquiries.ts.

export const HOST_APPLICATIONS_PER_USER_PER_DAY = 5;
export const APPLICATION_AREA_MAX = 100;
export const APPLICATION_ADDRESS_MAX = 300;
export const APPLICATION_DESCRIPTION_MIN = 20;
export const APPLICATION_DESCRIPTION_MAX = 2000;
export const APPLICATION_RATE_MAX = 1_000_000;
