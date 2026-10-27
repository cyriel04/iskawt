"use client";

import { useState } from "react";
import Typography from "@mui/material/Typography";
import PhotoFrame from "@/app/_components/PhotoFrame";
import type { PublicPhoto } from "@/app/_lib/types";
import styles from "./ListingGallery.module.scss";

function Chevron({ direction }: { direction: "left" | "right" }) {
	return (
		<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
			<path d={direction === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
		</svg>
	);
}

// One big photo with up to two beside it. The order is a rotation of `photos`
// starting at the current index, so Next walks through every photo and wraps.
export default function ListingGallery({ photos, demo }: { photos: PublicPhoto[]; demo: boolean }) {
	const [index, setIndex] = useState(0);

	if (photos.length === 0) {
		return <PhotoFrame shape="gallery" photo={null} sizes="100vw" />;
	}

	const count = photos.length;
	// Clamp, so a shorter photos array can never point past the end.
	const current = index % count;
	const at = (offset: number) => (current + offset) % count;
	const badge = demo ? (count === 1 ? "Demo photo · not a real space" : "Demo photos · not a real space") : undefined;
	const smallOffsets = [1, 2].filter((offset) => offset < count);

	return (
		<section aria-label="Photos" className={styles.gallery}>
			<div className={[styles.grid, styles[`small${smallOffsets.length}`]].filter(Boolean).join(" ")}>
				<div data-testid="gallery-big" className={styles.big}>
					<PhotoFrame
						shape="fill"
						photo={photos[current]}
						badge={badge}
						sizes="(min-width: 600px) 40vw, 100vw"
					/>
					{count > 1 && (
						<>
							<button
								type="button"
								className={`${styles.arrow} ${styles.prev}`}
								aria-label="Previous photo"
								onClick={() => setIndex(at(count - 1))}
							>
								<Chevron direction="left" />
							</button>
							<button
								type="button"
								className={`${styles.arrow} ${styles.next}`}
								aria-label="Next photo"
								onClick={() => setIndex(at(1))}
							>
								<Chevron direction="right" />
							</button>
							<Typography variant="label" className={styles.counter} aria-live="polite">
								<span aria-hidden="true">{`${current + 1} / ${count}`}</span>
								<span className={styles.srOnly}>{`Photo ${current + 1} of ${count}`}</span>
							</Typography>
						</>
					)}
				</div>
				{smallOffsets.map((offset) => {
					const target = at(offset);
					return (
						<div key={photos[target].url} data-testid="gallery-small" className={styles.small}>
							<PhotoFrame shape="fill" photo={photos[target]} sizes="(min-width: 600px) 20vw, 50vw" />
						</div>
					);
				})}
			</div>
		</section>
	);
}
