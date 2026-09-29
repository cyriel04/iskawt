import Image from "next/image";
import Typography from "@mui/material/Typography";
import type { PublicPhoto } from "@/app/_lib/types";
import styles from "./PhotoFrame.module.scss";

// `unoptimized` until we decide where host photos are hosted — optimized
// next/image needs that origin listed in next.config.ts remotePatterns.
export default function PhotoFrame({ photo, sizes }: { photo: PublicPhoto | null; sizes: string }) {
	return (
		<div className={styles.frame}>
			{photo ? (
				<Image src={photo.url} alt={photo.alt} fill sizes={sizes} unoptimized />
			) : (
				<div className={styles.empty}>
					<Typography variant="label" color="text.secondary">
						No photos yet
					</Typography>
				</div>
			)}
		</div>
	);
}
