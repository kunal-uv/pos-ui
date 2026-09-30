"use client";

import React, { useEffect, useState } from "react";
import { formatPrice, previewCommissionApi } from "../../utils";

/**
 * §15.1: "Live 'what you'll earn' display while pricing a deal, including staged
 * commission drops as price approaches List."
 *
 * ! Asked of the server, not worked out here. The server answers with the same
 * ! function that writes the ledger at checkout, so the figure on the till is the
 * ! figure on the statement - a second copy of the rules in the browser would be
 * ! right until the first rate change.
 *
 * ! Always the signed-in person's own earnings; the endpoint takes no user id.
 *
 * ! Silent when it cannot answer. A hint that fails is left out, never shown as
 * ! $0.00, and never signs anybody out of a sale in progress.
 */

interface Props {
	productId: string;
	grade: string;
	/** The grade price - the commission baseline the ledger calls List. */
	listPrice: string;
	tagPrice: string;
	sellingPrice: string;
	hasExtendedWarranty: boolean;
	accessoryCount: number;
	/** How long the price must sit still before asking, in ms. */
	debounceMs?: number;
}

interface Preview {
	now: { total: string };
	at_tag: { total: string };
	at_list: { total: string };
	stage: { position: number; rate_multiplier: number; configured: boolean };
}

export const PosCommissionHint = ({
	productId,
	grade,
	listPrice,
	tagPrice,
	sellingPrice,
	hasExtendedWarranty,
	accessoryCount,
	debounceMs = 400,
}: Props) => {
	const [preview, setPreview] = useState<Preview | null>(null);

	useEffect(() => {
		const price = Number(sellingPrice);

		if (!Number.isFinite(price) || price < 0 || sellingPrice.trim() === "") {
			setPreview(null);

			return;
		}

		let live = true;

		// ! Debounced: a salesperson types a price a digit at a time, and every
		// ! digit is not a question worth a round trip.
		const timer = setTimeout(() => {
			previewCommissionApi(
				{
					product_id: productId,
					grade,
					list_price: listPrice,
					tag_price: tagPrice,
					selling_price: price,
					has_extended_warranty: hasExtendedWarranty,
					accessory_count: accessoryCount,
				},
				(data: Preview) => {
					if (live) setPreview(data);
				},
				() => {
					if (live) setPreview(null);
				},
				() => {},
			);
		}, debounceMs);

		return () => {
			live = false;
			clearTimeout(timer);
		};
	}, [productId, grade, listPrice, tagPrice, sellingPrice, hasExtendedWarranty, accessoryCount, debounceMs]);

	if (!preview) return null;

	const reduced = preview.stage.configured && preview.stage.rate_multiplier < 1;

	return (
		<span
			role="status"
			aria-label="What you'll earn on this machine"
			className="flex flex-wrap items-center gap-x-[10px] gap-y-[2px] text-[11.5px] leading-[1.35] text-[#3F514A]"
		>
			<span className="font-bold text-[#0B4A2A]">{`You earn ${formatPrice(preview.now.total)}`}</span>
			<span className="text-[#8A968F]">{`at Tag ${formatPrice(preview.at_tag.total)}`}</span>
			<span className="text-[#8A968F]">{`at List ${formatPrice(preview.at_list.total)}`}</span>
			{/* ! Only when a drop is actually configured and biting. With no
			    stages the rate is full everywhere, and saying "reduced" would be
			    inventing a rule the owner has not given. */}
			{reduced && (
				<span className="font-bold text-[#B76E00]">
					{`Rate at ${Math.round(preview.stage.rate_multiplier * 100)}% this close to List`}
				</span>
			)}
		</span>
	);
};

export default PosCommissionHint;
