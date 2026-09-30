"use client";

import React from "react";
import { ImageComponent, TooltipComponent } from "../mantine";
import { formatPrice } from "../../utils";
import {
	posGradeChip,
	posGradeChipFallback,
	posMoney,
} from "./pos_design";

export interface PosTile {
	product_id: string;
	model_number: string;
	name: string;
	brand: string | null;
	images: string[];
	msrp: string | null;
	/**
	 * Units that can actually be sold. Excludes migration placeholders.
	 *
	 * ! Zero is what "out of stock" means here. Whether the last one sold this
	 * ! morning or the ones on the floor are still on placeholder serials, the
	 * ! answer the customer gets is the same one.
	 */
	available_count: number;
	/**
	 * Units held here still waiting for a real serial (MIG-04 / O20).
	 *
	 * ! Sent by the API and deliberately not drawn. Mid-sale, *why* a machine
	 * ! cannot be sold is not the salesperson's problem to solve at the counter -
	 * ! it belongs to whoever is running the walk-through, on Inventory.
	 */
	awaiting_serial_count?: number;
	from_price: string | null;
	grade_chips: {
		code: string;
		label: string;
		count: number;
		price: string | null;
	}[];
}

interface Props {
	tile: PosTile;
	onChooseUnit: (tile: PosTile) => void;
}

/**
 * One model on the POS grid (Mockup 14 notes 1–2, POS-05).
 *
 * ! **There is no quantity stepper, and there is no "Add" button** (POS-15,
 * ! O11, trap T10). A tile is four fridges of one model at four prices; there is
 * ! nothing here to add. `Choose unit` opens the picker, and the picker adds a
 * ! machine. A stepper on this card would be a stepper on an object that exists
 * ! four times over at four different prices - which is exactly what the card
 * ! the item-based till drew in this slot had, and why it went.
 *
 * ! `from $…` is the cheapest available unit, with MSRP struck through beside
 * ! it. Both come from the server, which counted the units; nothing here totals
 * ! anything.
 */
export const PosUnitTile = ({ tile, onChooseUnit }: Props) => {
	const image = tile.images?.[0];
	const hasDiscount =
		tile.msrp !== null && Number(tile.msrp) > Number(tile.from_price ?? 0);

	/**
	 * ! Nothing here can be sold, and the tile says so in the plainest word the
	 * ! floor has for it. The grid used to count migration placeholders as stock,
	 * ! draw a grade chip for them and open an empty picker; a model with nothing
	 * ! left, meanwhile, simply vanished, so "do we have one of these" had no
	 * ! answer at all. The model stays - it is the price and the picker that are
	 * ! withheld, and the server sorts it below everything sellable.
	 */
	const outOfStock = tile.available_count === 0;

	return (
		<article className="flex flex-col gap-2 rounded-[14px] border border-[#E6EBE8] bg-white p-[10px] shadow-[0_1px_2px_rgba(16,22,20,.04)]">
			{/* P30: product images retained, unchanged. */}
			<div className="relative grid h-[92px] place-items-center overflow-hidden rounded-[10px] bg-[#F2F5F3] bg-[repeating-linear-gradient(135deg,#E7ECE9_0_8px,#F2F5F3_8px_16px)]">
				{image ? (
					<ImageComponent
						src={image}
						alt={tile.name}
						h={92}
						w="100%"
						fit="contain"
						radius={10}
					/>
				) : (
					<span className="font-plex-mono text-[9.5px] tracking-[0.04em] text-[#93A09A]">
						no image
					</span>
				)}

				{/* The count is on the image because it is the first thing that
				    decides whether this tile is worth tapping at all - and when
				    the answer is "it is not", that is what it says instead. */}
				{outOfStock ? (
					<span className="absolute right-[6px] top-[6px] rounded-[6px] bg-[#EDF1EF] px-[6px] py-[1px] font-plex-mono text-[10px] font-bold text-[#6B7A74] shadow-[0_1px_2px_rgba(16,22,20,.08)]">
						Out of stock
					</span>
				) : (
					<span className="absolute right-[6px] top-[6px] rounded-[6px] bg-white/92 px-[6px] py-[1px] font-plex-mono text-[10px] font-bold text-[#22302B] shadow-[0_1px_2px_rgba(16,22,20,.08)]">
						{`${tile.available_count} on floor`}
					</span>
				)}
			</div>

			{/* D15: two-line clamp with the full name on hover, rather than a
			    name truncated mid-word with no way to read it. */}
			<div className="flex flex-col gap-[2px]">
				<TooltipComponent
					multiline
					w={260}
					position="bottom-start"
					label={tile.name}
				>
					<span>
						<h3 className="m-0 line-clamp-2 text-[13px] font-bold leading-[1.25] tracking-[-0.01em] text-[#101614]">
							{tile.name}
						</h3>
					</span>
				</TooltipComponent>
				<span className="font-plex-mono text-[10px] text-[#8A968F]">
					{tile.model_number}
				</span>
			</div>

			{/* One chip per grade with stock behind it, so a salesperson asked
			    for "the cheapest one" can see whether that means Grade D before
			    opening anything. */}
			{tile.grade_chips.length > 0 && (
				<div className="flex flex-wrap gap-[4px]">
					{tile.grade_chips.map((chip) => (
						<span
							key={chip.code}
							title={`${chip.label} — ${chip.count} available`}
							className={`rounded-[6px] border px-[5px] py-px font-plex-mono text-[10px] font-bold ${
								posGradeChip[chip.code] ?? posGradeChipFallback
							}`}
						>
							{`${chip.code}×${chip.count}`}
						</span>
					))}
				</div>
			)}

			<div className="mt-auto flex flex-col gap-[7px]">
				{/* ! No "from —" on a model with nothing to sell. A price is a
				    thing a customer can be told, and there is no machine behind
				    this one to quote it on. */}
				{!outOfStock && (
					<div className="flex flex-col leading-[1.1]">
						{hasDiscount && (
							<span className="text-[11px] text-[#9AA5A0] line-through">
								{formatPrice(tile.msrp)}
							</span>
						)}
						<span className="flex items-baseline gap-[5px]">
							<span className="text-[10.5px] font-semibold text-[#8A968F]">
								from
							</span>
							<span className="text-[17px] font-extrabold tracking-[-0.02em] text-[#0F6B37]">
								{posMoney(tile.from_price)}
							</span>
						</span>
					</div>
				)}

				<button
					type="button"
					disabled={outOfStock}
					onClick={() => onChooseUnit(tile)}
					className={`flex h-[34px] w-full items-center justify-center gap-[6px] rounded-[10px] text-[13px] font-bold transition ${
						outOfStock
							? "cursor-not-allowed border border-[#E6EBE8] bg-[#F2F5F3] text-[#93A09A]"
							: "bg-[#0F6B37] text-white hover:bg-[#0A522A] active:scale-[.97]"
					}`}
				>
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.3"
						strokeLinecap="round"
						strokeLinejoin="round"
						aria-hidden
					>
						<path d="M4 7h10M4 12h16M4 17h7" />
						<circle cx="18" cy="7" r="2.2" />
					</svg>
					{outOfStock ? "Out of stock" : "Choose unit"}
				</button>
			</div>
		</article>
	);
};

export default PosUnitTile;
