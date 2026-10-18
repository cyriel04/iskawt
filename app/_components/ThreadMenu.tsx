import { useId, useState, type Ref } from "react";
import Button from "@mui/material/Button";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import styles from "./ThreadMenu.module.scss";

type Props = {
	counterpartName: string;
	blockedByMe: boolean;
	disabled: boolean;
	triggerRef: Ref<HTMLButtonElement>;
	onReport: () => void;
	onBlock: () => void;
	onUnblock: () => void;
};

// The thread's "More" menu: report, block or unblock. Choosing an item hands
// focus to whatever the caller opens next (a confirmation, a dialog), so the
// menu restores focus to its trigger only when dismissed.
export default function ThreadMenu({ counterpartName, blockedByMe, disabled, triggerRef, onReport, onBlock, onUnblock }: Props) {
	const menuId = useId();
	const [anchor, setAnchor] = useState<HTMLElement | null>(null);

	const dismiss = () => {
		anchor?.focus();
		setAnchor(null);
	};
	const choose = (action: () => void) => () => {
		setAnchor(null);
		action();
	};

	return (
		<>
			<Button
				ref={triggerRef}
				variant="outlined"
				aria-haspopup="menu"
				aria-controls={anchor ? menuId : undefined}
				aria-expanded={anchor ? "true" : undefined}
				disabled={disabled}
				onClick={(e) => setAnchor(e.currentTarget)}
				className={styles.trigger}
			>
				More
			</Button>
			<Menu id={menuId} anchorEl={anchor} open={anchor !== null} onClose={dismiss} disableRestoreFocus>
				<MenuItem onClick={choose(onReport)} className={styles.item}>
					Report conversation
				</MenuItem>
				{blockedByMe ? (
					<MenuItem onClick={choose(onUnblock)} className={styles.item}>
						Unblock {counterpartName}
					</MenuItem>
				) : (
					<MenuItem onClick={choose(onBlock)} className={styles.item}>
						Block {counterpartName}
					</MenuItem>
				)}
			</Menu>
		</>
	);
}
