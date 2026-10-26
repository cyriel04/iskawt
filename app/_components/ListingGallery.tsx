"use client";

import { useRef, useState } from "react";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import PhotoFrame from "@/app/_components/PhotoFrame";
import type { PublicPhoto } from "@/app/_lib/types";
import styles from "./ListingGallery.module.scss";

// One big photo with up to two beside it. The order is a rotation of `photos`
// starting at the current index, so Next walks through every photo and wraps.
export default function ListingGallery({ photos, demo }: { photos: PublicPhoto[]; demo: boolean }) {
	const [index, setIndex] = useState(0);
	const bigRef = useRef<HTMLDivElement>(null);

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
				<div
					ref={bigRef}
					tabIndex={-1}
					role="group"
					aria-label={`Photo ${current + 1} of ${count}`}
					data-testid="gallery-big"
					className={styles.big}
				>
					<PhotoFrame
						shape="fill"
						photo={photos[current]}
						badge={badge}
						sizes="(min-width: 600px) 40vw, 100vw"
					/>
				</div>
				{smallOffsets.map((offset) => {
					const target = at(offset);
					return (
						<button
							key={photos[target].url}
							type="button"
							className={styles.small}
							aria-label={`Show photo ${target + 1}: ${photos[target].alt}`}
							onClick={() => {
								setIndex(target);
								// The clicked button is about to unmount; keep focus in the gallery.
								bigRef.current?.focus();
							}}
						>
							<PhotoFrame shape="fill" photo={photos[target]} sizes="(min-width: 600px) 20vw, 50vw" />
						</button>
					);
				})}
			</div>
			{count > 1 && (
				<div className={styles.controls}>
					<Button variant="outlined" aria-label="Previous photo" onClick={() => setIndex(at(count - 1))}>
						Previous
					</Button>
					<Typography variant="label" aria-live="polite">{`Photo ${current + 1} of ${count}`}</Typography>
					<Button variant="outlined" aria-label="Next photo" onClick={() => setIndex(at(1))}>
						Next
					</Button>
				</div>
			)}
		</section>
	);
}
