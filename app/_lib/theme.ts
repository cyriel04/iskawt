// Goes at app/_lib/theme.ts
//
// The ONLY place Iskawt's design tokens become code. Components read from the
// theme; they never hold a raw hex, a raw pixel gap, or a font stack.
//
// Fonts are self-hosted in app/_fonts/, loaded in app/layout.tsx with
// next/font/local, and exposed as CSS variables. This file references the
// variables rather than naming the fonts, so there is no layout shift on
// first paint.

"use client";

import { createTheme } from "@mui/material/styles";

// ---------------------------------------------------------------- augmentation
//
// MUI has no idea what "verified" or "dataLg" mean. These declarations teach
// TypeScript about the tokens we added, so theme.palette.verified.main and
// <Typography variant="dataLg"> both typecheck.

declare module "@mui/material/styles" {
	interface Palette {
		verified: Palette["primary"];
		hairline: string;
	}
	interface PaletteOptions {
		verified?: PaletteOptions["primary"];
		hairline?: string;
	}

	interface Theme {
		radius: { sm: number; md: number; lg: number };
	}
	interface ThemeOptions {
		radius?: { sm: number; md: number; lg: number };
	}

	interface TypographyVariants {
		displayLg: React.CSSProperties;
		displaySm: React.CSSProperties;
		bodyStrong: React.CSSProperties;
		label: React.CSSProperties;
		data: React.CSSProperties;
		dataLg: React.CSSProperties;
	}
	interface TypographyVariantsOptions {
		displayLg?: React.CSSProperties;
		displaySm?: React.CSSProperties;
		bodyStrong?: React.CSSProperties;
		label?: React.CSSProperties;
		data?: React.CSSProperties;
		dataLg?: React.CSSProperties;
	}
}

declare module "@mui/material/Typography" {
	interface TypographyPropsVariantOverrides {
		displayLg: true;
		displaySm: true;
		bodyStrong: true;
		label: true;
		data: true;
		dataLg: true;
		// variants we do not use, switched off so nobody reaches for them by habit
		h1: false;
		h2: false;
		h3: false;
		h4: false;
		h5: false;
		h6: false;
		subtitle1: false;
		subtitle2: false;
		body2: false;
		overline: false;
	}
}

// ---------------------------------------------------------------- families

const display = "var(--font-archivo), 'Helvetica Neue', Arial, sans-serif";
const sans = "var(--font-inter), system-ui, -apple-system, sans-serif";
const mono = "var(--font-jetbrains-mono), ui-monospace, SFMono-Regular, monospace";

// ---------------------------------------------------------------- theme

const theme = createTheme({
	// Emits CSS custom properties and switches schemes on a class, so dark mode
	// works without a re-render and without a flash of the wrong theme.
	cssVariables: { colorSchemeSelector: "class" },

	colorSchemes: {
		light: {
			palette: {
				mode: "light",
				background: { default: "#f7f3ec", paper: "#ffffff" }, // paper / card
				text: { primary: "#1b1915", secondary: "#5c554a" }, // ink / ink-muted
				divider: "#8e8578", // hairline
				hairline: "#8e8578",
				primary: { main: "#b8400d", contrastText: "#ffffff" }, // stamp
				verified: { main: "#2c6640", contrastText: "#ffffff" },
			},
		},
		dark: {
			palette: {
				mode: "dark",
				background: { default: "#161512", paper: "#201e1a" },
				text: { primary: "#f3eee5", secondary: "#a49c90" },
				divider: "#6b655a",
				hairline: "#6b655a",
				primary: { main: "#f0703a", contrastText: "#161512" },
				verified: { main: "#74c08e", contrastText: "#161512" },
			},
		},
	},

	// 4px base. theme.spacing(1) = 4px … theme.spacing(4) = 16px, which is the
	// space-3 token. Compose from the scale; a one-off 13px is a bug.
	spacing: 4,

	// radius-md is the default for anything MUI rounds on its own.
	shape: { borderRadius: 8 },

	// The full radius scale, for the cases that are not the default.
	radius: { sm: 4, md: 8, lg: 16 },

	typography: {
		fontFamily: sans,

		displayLg: { fontFamily: display, fontSize: 34, lineHeight: "36px", fontWeight: 600, letterSpacing: "-0.01em" },
		displaySm: { fontFamily: display, fontSize: 24, lineHeight: "28px", fontWeight: 600 },

		body1: { fontSize: 15, lineHeight: "23px", fontWeight: 400 },
		bodyStrong: { fontSize: 15, lineHeight: "23px", fontWeight: 600 },
		caption: { fontSize: 13, lineHeight: "19px", fontWeight: 400 },
		label: { fontSize: 12, lineHeight: "16px", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" },

		data: { fontFamily: mono, fontSize: 13, lineHeight: "20px", fontWeight: 400 },
		dataLg: { fontFamily: mono, fontSize: 18, lineHeight: "24px", fontWeight: 500 },

		button: { fontSize: 15, fontWeight: 600, textTransform: "none" },
	},

	components: {
		// Custom variants need an element mapping or they all render as <span>.
		MuiTypography: {
			defaultProps: {
				variantMapping: {
					displayLg: "h1",
					displaySm: "h2",
					body1: "p",
					bodyStrong: "p",
					caption: "p",
					label: "span",
					data: "span",
					dataLg: "span",
				},
			},
		},

		// Borders, never shadows. This is the brand, enforced once.
		MuiPaper: {
			defaultProps: { elevation: 0 },
			styleOverrides: {
				root: ({ theme }) => ({
					backgroundImage: "none",
					border: `1px solid ${theme.palette.divider}`,
					borderRadius: theme.radius.lg,
				}),
			},
		},

		MuiButton: {
			defaultProps: { disableElevation: true },
			styleOverrides: {
				root: ({ theme }) => ({
					borderRadius: theme.radius.md,
					minHeight: 44, // touch target
					paddingInline: theme.spacing(5),
				}),
			},
		},

		MuiChip: {
			styleOverrides: {
				root: ({ theme }) => ({ borderRadius: theme.radius.sm }),
			},
		},

		MuiOutlinedInput: {
			styleOverrides: {
				root: ({ theme }) => ({ borderRadius: theme.radius.md }),
			},
		},

		// Every icon-only button is a real button with a real accessible name.
		MuiIconButton: {
			styleOverrides: {
				root: { minWidth: 44, minHeight: 44 },
			},
		},
	},
});

export default theme;
