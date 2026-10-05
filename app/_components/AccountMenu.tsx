"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { authClient } from "@/app/_lib/authClient";
import type { CurrentUser } from "@/app/_lib/types";
import styles from "./AccountMenu.module.scss";

// The signed-in user's own menu. Shows their name, or their email when they
// have none: this only ever renders for the person holding the session.
export default function AccountMenu({ user }: { user: CurrentUser }) {
	const router = useRouter();
	const menuId = useId();
	const [anchor, setAnchor] = useState<HTMLElement | null>(null);
	const label = user.name ?? user.email;

	async function signOut() {
		setAnchor(null);
		try {
			await authClient.signOut();
		} finally {
			// Re-read the session on the server either way, so the header shows
			// the truth rather than a menu for a session that may be gone.
			router.refresh();
		}
	}

	return (
		<>
			<Button
				aria-label={`Account: ${label}`}
				aria-haspopup="menu"
				aria-controls={anchor ? menuId : undefined}
				aria-expanded={anchor ? "true" : undefined}
				onClick={(e) => setAnchor(e.currentTarget)}
				className={styles.trigger}
			>
				<span className={styles.label}>{label}</span>
			</Button>
			<Menu id={menuId} anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
				<MenuItem onClick={() => void signOut().catch(() => {})} className={styles.item}>
					Sign out
				</MenuItem>
			</Menu>
		</>
	);
}
