import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import { ThemeProvider, CssBaseline, InitColorSchemeScript } from "@mui/material";
import theme from "@/app/_lib/theme";
import SiteHeader from "@/app/_components/SiteHeader";
import SiteFooter from "@/app/_components/SiteFooter";
import ScrollToTop from "@/app/_components/ScrollToTop";
import shell from "@/app/_styles/shell.module.scss";
import localFont from "next/font/local";

// Self-hosted, so a build never downloads fonts. Fetching them from Google at
// build time failed CI intermittently. Variable woff2, latin subset, from
// Google Fonts; SIL Open Font License, texts alongside in app/_fonts/.
const archivo = localFont({
	src: "./_fonts/archivo-latin.woff2",
	weight: "400 700",
	display: "swap",
	variable: "--font-archivo",
});

const inter = localFont({
	src: "./_fonts/inter-latin.woff2",
	weight: "400 600",
	display: "swap",
	variable: "--font-inter",
});

const jetbrainsMono = localFont({
	src: "./_fonts/jetbrains-mono-latin.woff2",
	weight: "400 500",
	display: "swap",
	variable: "--font-jetbrains-mono",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" className={`${archivo.variable} ${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
			<body className={shell.body}>
				<InitColorSchemeScript attribute="class" />
				<AppRouterCacheProvider options={{ enableCssLayer: true }}>
					<ThemeProvider theme={theme}>
						<CssBaseline />
						<SiteHeader />
						<div className={shell.content}>{children}</div>
						<SiteFooter />
						<ScrollToTop />
					</ThemeProvider>
				</AppRouterCacheProvider>
			</body>
		</html>
	);
}
