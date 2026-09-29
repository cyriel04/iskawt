import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import { ThemeProvider, CssBaseline } from "@mui/material";
import theme from "@/app/_lib/theme";

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<body>
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
