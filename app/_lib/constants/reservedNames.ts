// Words a renter's typed name may not contain, so the name can't pass for
// Iskawt in a thread. Compared after the validator's normalising (lowercase,
// accents stripped, lookalikes mapped): see app/_lib/inquiryValidation.ts.

// Matched anywhere in the name, across word breaks: "i-s-k-a-w-t", "IskawtPH".
export const RESERVED_BRAND_WORDS = ["iskawt"] as const;

// Matched only as a whole word: "Team Iskawt" is caught, "Steam Films" is not.
export const RESERVED_ROLE_WORDS = ["support", "admin", "staff", "team", "official", "moderator"] as const;
