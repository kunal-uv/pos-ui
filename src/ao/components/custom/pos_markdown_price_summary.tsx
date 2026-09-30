"use client";

import React from "react";
import { posMoney } from "./pos_design";
import { toMinor } from "../../utils";

interface Props {
	name: string;
	previousPrice: string;
	markdownPrice: string;
}

/**
 * Makes every POS markdown explain the complete price change. A promotion name
 * and a crossed-out price alone left the salesperson to calculate the discount
 * (and wonder which green price was final), so both the unit picker and cart use
 * this one summary.
 */
export const PosMarkdownPriceSummary = ({
	name,
	previousPrice,
	markdownPrice,
}: Props) => {
	const previousMinor = toMinor(previousPrice);
	const markdownMinor = toMinor(markdownPrice);
	const percentOff =
		previousMinor > 0
			? (Math.max(0, previousMinor - markdownMinor) / previousMinor) * 100
			: 0;

	return (
		<span className="w-fit rounded-[6px] bg-[#FBEED2] px-[7px] py-[3px] text-[11px] font-bold leading-[1.45] text-[#7A5410]">
			{name}
			{" · "}
			<span className="whitespace-nowrap">
				Previous price {posMoney(previousPrice)}
			</span>
			{" · "}
			<span className="whitespace-nowrap">{percentOff.toFixed(2)}% off</span>
			{" · "}
			<span className="whitespace-nowrap">
				Markdown price {posMoney(markdownPrice)}
			</span>
		</span>
	);
};
