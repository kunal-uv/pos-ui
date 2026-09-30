"use client";

import React from "react";
import { ModalComponent } from "../mantine";
import { WarrantyModel } from "../../models/warranty_modal";
import { currencySign } from "../../utils";

interface Props {
	isOpen: boolean;
	itemPrice: number;
	onClose: () => void;
	warrantiesList: Array<WarrantyModel>;
	selectedWarranty: { duration: string; price: number } | null;
	setSelectedWarranty: (warranty: {
		duration: string;
		price: number;
	}) => void;
	/** Takes the warranty back off this line. Supplied by the till, where the
	 *  cart row has no room for a second control beside the warranty chip. */
	onRemove?: () => void;
	/** Named on the subtitle, so the cashier can see which line they are on. */
	itemName?: string;
}

const money = (value: number | string | undefined | null): string =>
	`${currencySign} ${(Number(value ?? 0) || 0).toFixed(2)}`;

/**
 * Picking the extended warranty for one cart line.
 *
 * Every option is a row from the `warranty` table - there are three at the
 * moment (1, 2 and 3 year) and the till never hard-codes them, so adding a
 * fourth in settings puts a fourth row here with no code change.
 *
 * ! The price-band filter stays commented out rather than deleted. It hid every
 * ! option whenever an item fell outside the configured `min_price`/`max_price`
 * ! of all three, which reads as "this product cannot be covered" when what
 * ! actually happened is that nobody had set the bands. The band is shown on
 * ! each row instead, so the cashier can see the mismatch and act on it.
 */
const WarrantyModal = ({
	isOpen,
	onClose,
	itemPrice,
	selectedWarranty,
	setSelectedWarranty,
	warrantiesList,
	onRemove,
	itemName,
}: Props) => {
	const handleCardClick = (option: WarrantyModel) => {
		setSelectedWarranty({
			duration: option.warranty_title,
			price: Number(option.price),
		});
	};

	return (
		<ModalComponent
			opened={isOpen}
			onClose={onClose}
			size="lg"
			radius={22}
			title={
				<div className="flex flex-col gap-[3px]">
					<span className="text-[21px] font-extrabold tracking-[-0.02em] text-[#101614]">
						Extended warranty
					</span>
					<span className="text-[13.5px] text-[#6B7A74]">
						{itemName ||
							"Coverage after the manufacturer warranty ends"}
					</span>
				</div>
			}
		>
			<div className="flex flex-col gap-[10px] font-manrope">
				{warrantiesList.length === 0 && (
					<div className="rounded-[15px] border border-dashed border-[#DFE6E2] bg-[#FAFCFB] px-4 py-10 text-center text-[14px] text-[#8A968F]">
						No warranty assigned to this product covers{" "}
						{money(itemPrice)}. Check the product warranty selection
						and price bands in Settings.
					</div>
				)}

				<div className="grid gap-[10px] md:grid-cols-3">
					{warrantiesList.map((option) => {
						const on =
							selectedWarranty?.duration ===
							option.warranty_title;

						return (
							<button
								type="button"
								key={option.warranty_id}
								onClick={() => handleCardClick(option)}
								className={`flex items-center justify-between gap-[14px] rounded-[15px] border-[1.5px] p-4 text-left transition-colors ${
									on
										? "border-[#0F6B37] bg-[#F3F9F5]"
										: "border-[#E6EBE8] bg-white hover:border-[#0F6B37] hover:bg-[#F7FAF8]"
								}`}
							>
								<span className="flex min-w-0 flex-col items-start gap-[3px]">
									<span className="text-[17px] font-extrabold tracking-[-0.01em] text-[#101614]">
										{option.warranty_title}
									</span>
									<span className="text-left text-[13.5px] text-[#6B7A74]">
										{`Covers items ${money(option.min_price)} – ${money(option.max_price)}`}
									</span>
								</span>
								<span className="flex flex-none items-center gap-3">
									<span className="text-[20px] font-extrabold text-[#0F6B37]">
										{money(option.price)}
									</span>
									<span
										className={`grid h-[30px] w-[30px] place-items-center rounded-full text-[15px] font-extrabold ${
											on
												? "bg-[#0F6B37] text-white"
												: "bg-[#EDF1EF] text-transparent"
										}`}
									>
										✓
									</span>
								</span>
							</button>
						);
					})}
				</div>

				<div className="mt-1 flex gap-[10px]">
					{onRemove && selectedWarranty && (
						<button
							type="button"
							onClick={onRemove}
							className="h-[52px] flex-1 rounded-[13px] border border-[#DFE6E2] bg-white text-[14.5px] font-bold text-[#6B7A74] transition-colors hover:bg-[#F2F5F3]"
						>
							No warranty on this item
						</button>
					)}
					<button
						type="button"
						onClick={onClose}
						disabled={!selectedWarranty}
						className="h-[52px] flex-[2] rounded-[13px] bg-[#0F6B37] text-[16px] font-extrabold text-white transition-colors hover:bg-[#0A522A] disabled:bg-[#C9D3CE]"
					>
						Add Extended Warranty
					</button>
				</div>
			</div>
		</ModalComponent>
	);
};

export default WarrantyModal;
