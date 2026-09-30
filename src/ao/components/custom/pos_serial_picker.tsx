"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderComponent, ModalComponent } from "../mantine";
import ShowNotification from "../mantine/show_notification";
import { formatPrice, getProductUnitsApi, logoutUser } from "../../utils";
import {
	posGradeChip,
	posGradeChipFallback,
	posMoney,
} from "./pos_design";
import { PosMarkdownPriceSummary } from "./pos_markdown_price_summary";

export interface PickerUnit {
	inventory_unit_id: string;
	serial: string;
	grade: string;
	grade_label: string;
	grade_price: string;
	tag_price: string;
	effective_price: string;
	markdown: { name: string; ends_at: string; was: string } | null;
	msrp: string | null;
	condition_note: string | null;
	location: string | null;
}

interface Props {
	isOpen: boolean;
	onClose: () => void;
	productId: string | null;
	productName: string;
	/** Called with the chosen machine. The caller puts it in the cart. */
	onChoose: (unit: PickerUnit) => void;
	/** True while a unit is on its way to the cart, so the list stops taking taps. */
	busy?: boolean;
}

/**
 * Which of these machines is the customer buying (Mockup 14 note 2, POS-03,
 * POS-05, POS-17).
 *
 * ! This modal is the whole of "tiles aggregate, units sell". A tile is four
 * ! fridges of one model at four prices; the thing that goes in the cart is one
 * ! of them, and the customer is entitled to know which. Adding "a fridge" and
 * ! letting the system pick is how the Grade A machine leaves at the Grade C
 * ! price.
 *
 * ! The condition note is shown, not hidden behind a hover. "Why is this one a
 * ! hundred dollars less" is the question every second-hand sale turns on, and
 * ! the answer being on screen is what lets the cheaper machine sell itself.
 */
export const PosSerialPicker = ({
	isOpen,
	onClose,
	productId,
	productName,
	onChoose,
	busy,
}: Props) => {
	const router = useRouter();
	const [units, setUnits] = useState<PickerUnit[]>([]);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (!isOpen || !productId) {
			return;
		}

		setLoading(true);

		getProductUnitsApi(
			productId,
			(data: { units: PickerUnit[] }) => {
				setUnits(data.units ?? []);
				setLoading(false);
			},
			(message: string) => {
				ShowNotification(message, "error");
				setLoading(false);
			},
			() => logoutUser(router),
		).then();
	}, [isOpen, productId, router]);

	return (
		<ModalComponent
			opened={isOpen}
			onClose={onClose}
			size="lg"
			radius={22}
			title={
				<div className="flex flex-col gap-[3px]">
					<span className="text-[21px] font-extrabold tracking-[-0.02em] text-[#101614]">
						Choose a unit
					</span>
					<span className="text-[13.5px] text-[#6B7A74]">
						{productName}
					</span>
				</div>
			}
		>
			<div className="flex flex-col gap-[10px] font-manrope">
				{loading ? (
					<div className="grid place-items-center py-14">
						<LoaderComponent />
					</div>
				) : units.length === 0 ? (
					<div className="rounded-[15px] border border-dashed border-[#DFE6E2] bg-[#FAFCFB] px-4 py-10 text-center text-[14px] text-[#8A968F]">
						Nothing on the floor for this model right now.
					</div>
				) : (
					// Cheapest first: the customer who asked for the cheapest is
					// the common case, and a list ordered by serial number is
					// ordered by nothing anybody cares about.
					units.map((unit) => (
						<div
							key={unit.inventory_unit_id}
							className="flex items-start gap-[14px] rounded-[15px] border-[1.5px] border-[#E6EBE8] bg-white p-4"
						>
							<div className="flex min-w-0 flex-1 flex-col gap-[5px]">
								<div className="flex flex-wrap items-center gap-2">
									<span className="font-plex-mono text-[15px] font-extrabold tracking-[-0.01em] text-[#101614]">
										{unit.serial}
									</span>
									<span
										className={`rounded-[7px] border px-[7px] py-[2px] text-[11px] font-extrabold ${
											posGradeChip[unit.grade] ??
											posGradeChipFallback
										}`}
									>
										{unit.grade_label}
									</span>
									{unit.location && (
										<span className="rounded-[7px] bg-[#F2F5F3] px-[7px] py-[2px] text-[11.5px] font-semibold text-[#6B7A74]">
											{unit.location}
										</span>
									)}
								</div>

								{/* POS-17. The reason this one is cheaper. */}
								{unit.condition_note && (
									<span className="text-[13.5px] leading-[1.4] text-[#6B7A74]">
										{unit.condition_note}
									</span>
								)}

								{/* The three figures a salesperson negotiates
								    between (A20, A29). */}
								<div className="flex flex-wrap gap-x-[14px] gap-y-1 font-plex-mono text-[11.5px] text-[#8A968F]">
									<span>{`MSRP ${formatPrice(unit.msrp)}`}</span>
									<span
										className={
											unit.markdown
												? "line-through"
												: undefined
										}
									>
										{`Tag ${formatPrice(unit.tag_price)}`}
									</span>
								</div>
								{unit.markdown && (
									<PosMarkdownPriceSummary
										name={unit.markdown.name}
										previousPrice={unit.markdown.was}
										markdownPrice={unit.effective_price}
									/>
								)}
							</div>

							<div className="flex flex-none flex-col items-end gap-[9px]">
								<span className="text-[20px] font-extrabold tracking-[-0.02em] text-[#0F6B37]">
									{posMoney(unit.effective_price)}
								</span>
								<button
									type="button"
									disabled={busy}
									onClick={() => onChoose(unit)}
									className="flex h-[46px] items-center gap-[7px] rounded-[12px] bg-[#0F6B37] px-5 text-[15px] font-bold text-white transition hover:bg-[#0A522A] active:scale-[.97] disabled:bg-[#C9D3CE]"
								>
									<svg
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2.6"
										strokeLinecap="round"
										aria-hidden
									>
										<path d="M12 5v14M5 12h14" />
									</svg>
									Add
								</button>
							</div>
						</div>
					))
				)}
			</div>
		</ModalComponent>
	);
};

export default PosSerialPicker;
