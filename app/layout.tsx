import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import { ThemeProvider, CssBaseline, InitColorSchemeScript } from "@mui/material";
import theme from "@/app/_lib/theme";
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
			<body>
				<InitColorSchemeScript attribute="class" />
				<AppRouterCacheProvider>
					<ThemeProvider theme={theme}>
						<CssBaseline />
						{children}
					</ThemeProvider>
				</AppRouterCacheProvider>
			</body>
		</html>
	);
}
