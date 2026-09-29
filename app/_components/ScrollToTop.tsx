"use client"; // Needs window: a scroll listener and window.scrollTo.

import { useEffect, useState } from "react";
import Fab from "@mui/material/Fab";
import styles from "./ScrollToTop.module.scss";

function prefersReducedMotion(): boolean {
	return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function ScrollToTop() {
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		const update = () => setVisible(window.scrollY > window.innerHeight);
		update();
		window.addEventListener("scroll", update, { passive: true });
		return () => window.removeEventListener("scroll", update);
	}, []);

	if (!visible) return null;

	return (
		<Fab
			size="small"
			color="primary"
			aria-label="Back to top"
			className={styles.button}
			onClick={() => window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" })}
		>
			<span aria-hidden="true" className={styles.glyph}>↑</span>
		</Fab>
	);
}
