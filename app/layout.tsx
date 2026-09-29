import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import { ThemeProvider, CssBaseline, InitColorSchemeScript } from "@mui/material";
import theme from "@/app/_lib/theme";
import SiteHeader from "@/app/_components/SiteHeader";
import SiteFooter from "@/app/_components/SiteFooter";
import ScrollToTop from "@/app/_components/ScrollToTop";
import shell from "@/app/_styles/shell.module.scss";
import { Archivo, Inter, JetBrains_Mono } from "next/font/google";

const archivo = Archivo({
	subsets: ["latin"],
	weight: ["400", "600", "700"],
	variable: "--font-archivo",
});

const inter = Inter({
	subsets: ["latin"],
	weight: ["400", "500", "600"],
	variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
	subsets: ["latin"],
	weight: ["400", "500"],
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
