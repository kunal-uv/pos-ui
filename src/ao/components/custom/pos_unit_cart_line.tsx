"use client";

import React, { useEffect, useState } from "react";
import {
	CurrencyInputComponent,
	ImageComponent,
	TooltipComponent,
} from "../mantine";
import { PopConfirmComponent } from "..";
import ShowNotification from "../mantine/show_notification";
import { currencySign, formatMinor, formatPrice, toMinor } from "../../utils";
import type { WarrantyModel } from "../../models/warranty_modal";
import {
	posGradeChip,
	posGradeChipFallback,
	posMoney,
	posMoneyFieldStyles,
} from "./pos_design";
import { PosCommissionHint } from "./pos_commission_hint";
import { PosMarkdownPriceSummary } from "./pos_markdown_price_summary";

/**
 * One custom accessory offered with a model - a wheel, a hook, a drawer.
 *
 * ! Defined inline on the Master Product, not picked from the catalogue: none of
 * ! these has a serialised inventory unit of its own, which is exactly what
 * ! separates an accessory from a second appliance sold alongside the first.
 */
export interface PosLineAddOn {
	add_on_id: string;
	name: string;
	price: string;
	inventory_tracked?: boolean;
	stock_quantity?: number;
}

/** The cover chosen for one machine, as the cart read returns it. */
export interface PosLineWarranty {
	warranty_id: string;
	warranty_title: string;
	price: string;
}

/** An exact stocked serial offered beneath this cart line. */
export interface PosSerializedAddOn {
	inventory_unit_id: string;
	serial: string;
	grade: string;
	grade_label: string;
	grade_price: string;
	status: string;
	selectable: boolean;
	selected_cart_line_id: string | null;
	product: {
		product_id: string;
		model_number: string;
		name: string;
	};
}

export interface PosCartLine {
	cart_draft_line_id: string;
	inventory_unit_id: string;
	serial: string;
	grade: string;
	grade_label: string;
	msrp: string | null;
	tag_price: string;
	grade_price: string;
	selling_price: string;
	/** The clearance that set the opening price, when one is live (§4.4). */
	markdown?: { name: string; ends_at: string; was: string } | null;
	condition_note: string | null;
	additional_note: string | null;
	extended_warranty: PosLineWarranty | null;
	/** Plans assigned to this model and valid for this line's current price band. */
	available_warranties?: WarrantyModel[];
	/** Everything this model may be fitted with. */
	available_add_ons?: PosLineAddOn[];
	/** The ticked ones, at the price they were ticked at. */
	selected_add_ons?: PosLineAddOn[];
	/** Exact serialized products configured as optional add-ons. */
	available_serial_add_ons?: PosSerializedAddOn[];
	/** Parent line id when this line itself is a serialized add-on. */
	add_on_for_line_id?: string | null;
	product: {
		product_id: string;
		model_number: string;
		name: string;
		images: string[];
	};
}

interface Props {
	line: PosCartLine;
	onPriceChange: (lineId: string, price: string) => void;
	onRemove: (lineId: string) => void;
	/** Opens the warranty picker for this line. */
	onWarranty: (lineId: string) => void;
	/** Opens the note form for this line. */
	onNote: (lineId: string) => void;
	/**
	 * Ticks or clears an accessory on this line.
	 *
	 * ! Handed the complete selection, not the one that changed. Two quick
	 * ! clicks at a counter race each other if the server has to apply "add this
	 * ! one" to whatever it currently holds.
	 */
	onAddOns: (
		lineId: string,
		selection: Array<{ add_on_id: string; price?: string; name?: string }>,
	) => void;
	onSerializedAddOn?: (
		lineId: string,
		addOn: PosSerializedAddOn,
		selected: boolean,
	) => void;
	disabled?: boolean;
	/**
	 * §3.2 gates 1 & 2. When false, the selling price cannot be taken below the
	 * grade price: the edit is refused at the field with a toast and the number
	 * snaps back. A manager has this; a salesperson does not.
	 */
	allowBelowList?: boolean;
}

/**
 * One machine in the cart (Mockup 9, POS-08 … POS-11, POS-15, POS-17).
 *
 * ! **No quantity.** Not a stepper, not a `× 1`, not a hidden field. The line is
 * ! one serial and the serial exists once (O11, trap T10). This is the single
 * ! visible difference from the card the item-based till drew here, and it is
 * ! the whole reason that till was replaced rather than restyled.
 *
 * ! The three reference prices are all shown at once (A20, A29): what the
 * ! manufacturer listed it at, what the sticker on the machine said, and what
 * ! the grade says it should go for. A salesperson negotiating without all three
 * ! is negotiating blind.
 *
 * ! Going **below** the grade price is allowed and flagged amber, never blocked
 * ! (POS-11, O6). The grade price is the commission baseline, not a floor - the
 * ! delta shown here is what Phase 2 pays on, and it is allowed to be negative.
 */
export const PosUnitCartLine = ({
	line,
	onPriceChange,
	onRemove,
	onWarranty,
	onNote,
	onAddOns,
	onSerializedAddOn,
	disabled,
	allowBelowList = true,
}: Props) => {
	const [price, setPrice] = useState(line.selling_price);

	useEffect(() => {
		setPrice(line.selling_price);
	}, [line.selling_price]);

	// Minor units on both sides, so the delta cannot inherit a float's rounding
	// error the way the old cart's arithmetic did (D31).
	const deltaMinor = toMinor(price) - toMinor(line.grade_price);
	const isBelow = deltaMinor < 0;
	const isAbove = deltaMinor > 0;
	const image = line.product.images?.[0];
	const warranty = line.extended_warranty;
	const offeredAddOns = line.available_add_ons ?? [];
	const tickedAddOns = line.selected_add_ons ?? [];
	const serializedAddOns = line.available_serial_add_ons ?? [];
	const isTicked = (addOnId: string) =>
		tickedAddOns.some((addOn) => addOn.add_on_id === addOnId);

	/**
	 * ! Sends the whole selection every time. The price travels with it so a
	 * ! figure the salesperson changed survives the next tick - re-sending only
	 * ! the id would quietly reset an agreed discount back to the Master
	 * ! Product's price.
	 */
	const toggleAddOn = (addOn: PosLineAddOn, ticked: boolean) => {
		const next = ticked
			? [...tickedAddOns, addOn]
			: tickedAddOns.filter(
					(entry) => entry.add_on_id !== addOn.add_on_id,
				);

		onAddOns(
			line.cart_draft_line_id,
			next.map((entry) => ({
				add_on_id: entry.add_on_id,
				price: entry.price,
				...(entry.add_on_id.startsWith("open-")
					? { name: entry.name }
					: {}),
			})),
		);
	};

	return (
		<div
			className={`overflow-hidden rounded-[16px] border bg-[#FCFDFC] ${
				isBelow
					? "border-[#E7D3AE] border-l-[3px] border-l-[#B76E00]"
					: "border-[#E6EBE8]"
			}`}
		>
			<div className="flex gap-3 px-3 pb-[10px] pt-3">
				<div className="h-14 w-14 flex-none overflow-hidden rounded-[11px] bg-[#F2F5F3] bg-[repeating-linear-gradient(135deg,#E7ECE9_0_6px,#F2F5F3_6px_12px)]">
					{image && (
						<ImageComponent
							src={image}
							alt={line.product.name}
							w={56}
							h={56}
							fit="contain"
							radius={11}
						/>
					)}
				</div>

				<div className="flex min-w-0 flex-1 flex-col gap-[3px]">
					<div className="flex items-start gap-2">
						<TooltipComponent
							multiline
							w={240}
							position="bottom-start"
							label={line.product.name}
						>
							<span className="min-w-0 flex-1">
								<span className="line-clamp-2 text-[13.5px] font-bold leading-[1.3] text-[#101614]">
									{line.product.name}
								</span>
							</span>
						</TooltipComponent>
						<span
							className={`flex-none rounded-[6px] border px-[5px] py-px text-[10.5px] font-extrabold ${
								posGradeChip[line.grade] ?? posGradeChipFallback
							}`}
						>
							{line.grade_label}
						</span>
					</div>

					{/* The serial is what the customer is actually buying, so it
					    is on the line and not behind a tooltip. */}
					<span className="font-plex-mono text-[11px] text-[#8A968F]">
						{`${line.serial} · ${line.product.model_number}`}
					</span>

					{/* POS-17. The reason this one is cheaper. */}
					{line.condition_note && (
						<span className="line-clamp-2 text-[11.5px] leading-[1.35] text-[#6B7A74]">
							{line.condition_note}
						</span>
					)}
				</div>

				<div className="flex flex-none flex-col items-end gap-[6px]">
					{/* D28: a price, so no spinner. Two decimals are fixed here
					    rather than optional - see D31. */}
					<div className="flex h-9 w-[108px] items-center gap-1 rounded-[9px] border border-[#DFE6E2] bg-white px-2 focus-within:border-[#0F6B37]">
						<span className="text-[14px] font-bold text-[#8A968F]">
							{currencySign}
						</span>
						<CurrencyInputComponent
							w={78}
							size="xs"
							variant="unstyled"
							prefix=""
							aria-label={`Selling price for ${line.serial}`}
							styles={posMoneyFieldStyles}
							// ! The line's own price, not the tag price. Bound to the tag
							// ! price this field showed a number the cart was not charging,
							// ! and - being controlled - swallowed every keystroke while
							// ! still patching the unseen figure on blur.
							value={price}
							disabled={disabled}
							setValue={(value: string | number) =>
								setPrice(String(value ?? ""))
							}
							onBlur={() => {
								if (price === line.selling_price) {
									return;
								}

								// §3.2 gates 1 & 2: a salesperson may price up
								// from the grade price but not under it. Stop it
								// at the field, say why, put the number back.
								if (
									!allowBelowList &&
									toMinor(price) <
										toMinor(line.grade_price)
								) {
									ShowNotification(
										`Selling below the ${line.grade_label} price (${formatPrice(
											line.grade_price,
										)}) needs a manager.`,
										"error",
									);
									setPrice(line.selling_price);

									return;
								}

								onPriceChange(
									line.cart_draft_line_id,
									price,
								);
							}}
						/>
					</div>
				</div>
			</div>

			{line.additional_note && (
				<div
					role="note"
					aria-label={`Saved note for ${line.serial}`}
					className="mx-3 mb-[10px] flex items-start gap-2 rounded-[10px] border border-[#D8E9DE] bg-[#F3F9F5] px-3 py-2"
				>
					<svg
						className="mt-[2px] flex-none"
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="#0F6B37"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
						aria-hidden
					>
						<path d="M4 5h16M4 11h16M4 17h9" />
					</svg>
					<div className="min-w-0 flex-1">
						<span className="block text-[11px] font-extrabold uppercase tracking-[0.04em] text-[#0F6B37]">
							Note
						</span>
						<p className="whitespace-pre-wrap break-words text-[12px] leading-[1.45] text-[#3F514A]">
							{line.additional_note}
						</p>
					</div>
				</div>
			)}

			{/* The three figures a salesperson negotiates between (A20, A29),
			    on their own row so the editable price above is never confused
			    with one of them - and the delta beneath them, where it has the
			    full width of the rail to say what it means. */}
			<div className="flex flex-col gap-[5px] border-t border-dashed border-[#E6EBE8] bg-white px-3 py-[7px]">
				<div className="flex flex-wrap items-center gap-x-[14px] gap-y-1 font-plex-mono text-[11px] text-[#8A968F]">
					<span>{`MSRP ${formatPrice(line.msrp)}`}</span>
					<span>{`Tag price on unit ${formatPrice(line.tag_price)}`}</span>
					<span>{`${line.grade_label} price ${formatPrice(line.grade_price)}`}</span>
				</div>

				{/* §4.4. The clearance that set this price, named on the line -
				    a marked-down machine that looks merely discounted is one
				    the salesperson talks back up to the tag price. */}
				{line.markdown && (
					<PosMarkdownPriceSummary
						name={line.markdown.name}
						previousPrice={line.markdown.was}
						markdownPrice={line.selling_price}
					/>
				)}

				{/* POS-10: the live delta, either way. */}
				{deltaMinor === 0 ? (
					<span className="text-[11.5px] text-[#8A968F]">
						{`At ${line.grade_label} price`}
					</span>
				) : (
					<span
						className={`text-[11.5px] font-bold leading-[1.35] ${
							isBelow ? "text-[#B76E00]" : "text-[#0F6B37]"
						}`}
					>
						{isAbove
							? `▲ ${currencySign}${formatMinor(deltaMinor)} above ${line.grade_label} price · commissionable overage`
							: `▼ ${currencySign}${formatMinor(Math.abs(deltaMinor))} below ${line.grade_label} price`}
					</span>
				)}

				{/* §15.1: what this deal earns the person at the till, now and at
				    the two prices they are negotiating between. */}
				<PosCommissionHint
					productId={line.product.product_id}
					grade={line.grade}
					listPrice={line.grade_price}
					tagPrice={line.tag_price}
					sellingPrice={price}
					hasExtendedWarranty={warranty !== null}
					accessoryCount={tickedAddOns.length}
				/>
			</div>

			{/* Two controls and a delete, on one row.

			    ! The bases are what decide whether it stays one row, and they
			    ! are sized against `posLayout.cartWidth` - at 404px the row has
			    ! 345px of content, so 104 + 132 + 36 + two 8px gaps leaves
			    ! 57px of slack. The previous 124 + 168 + 44 came to 352 and
			    ! wrapped the delete button onto a line of its own, which is
			    ! how this was found: by looking at the rendered cart, not at
			    ! an assertion.

			    ! Both text buttons now carry a flex-basis, `min-w-0` and a
			    ! truncating label. The warranty button was `flex-none` while this
			    ! one was `flex-1` off a zero basis - so the moment a plan was
			    ! chosen and its label grew from "Add warranty" to the plan name
			    ! and its price, the warranty button kept every pixel it asked for
			    ! and this one was squeezed down to its own padding. It did not
			    ! wrap and it did not shorten: it vanished. */}
			<div className="flex flex-wrap items-center gap-2 bg-white px-3 pb-[9px] pt-1">
				<button
					type="button"
					aria-label={`Note for ${line.serial}`}
					onClick={() => onNote(line.cart_draft_line_id)}
					title={
						line.additional_note
							? "Edit the note for this machine"
							: "Add a note about this machine"
					}
					className={`flex h-9 min-w-0 flex-1 basis-[104px] items-center gap-[6px] rounded-[9px] border px-[10px] text-[12.5px] font-bold ${
						line.additional_note
							? "border-[#0F6B37] bg-[#E7F2EB] text-[#0B4A2A]"
							: "border-[#DFE6E2] bg-white text-[#22302B] hover:bg-[#F2F5F3]"
					}`}
				>
					<svg
						className="flex-none"
						width="15"
						height="15"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
						aria-hidden
					>
						<path d="M4 5h16M4 11h16M4 17h9" />
					</svg>
					<span className="truncate">
						{line.additional_note ? "Note added" : "Add note"}
					</span>
				</button>

				<button
					type="button"
					aria-label={`Extended warranty for ${line.serial}`}
					onClick={() => onWarranty(line.cart_draft_line_id)}
					// The plan name and price in full, since the label truncates.
					title={
						warranty
							? `${warranty.warranty_title} · ${posMoney(warranty.price)}`
							: "Add an extended warranty to this machine"
					}
					className={`flex h-9 min-w-0 flex-1 basis-[132px] items-center gap-[6px] rounded-[9px] border px-[10px] text-[12.5px] font-bold ${
						warranty
							? "border-[#0F6B37] bg-[#E7F2EB] text-[#0B4A2A]"
							: "border-[#DFE6E2] bg-white text-[#22302B] hover:bg-[#F2F5F3]"
					}`}
				>
					<svg
						className="flex-none"
						width="15"
						height="15"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.1"
						strokeLinecap="round"
						strokeLinejoin="round"
						aria-hidden
					>
						<path d="M12 3l7 3v5.5c0 4.3-2.9 8-7 9.5-4.1-1.5-7-5.2-7-9.5V6l7-3z" />
					</svg>
					<span className="truncate">
						{warranty
							? `${warranty.warranty_title} · ${posMoney(warranty.price)}`
							: "Add warranty"}
					</span>
				</button>

				{/* CHK-02 / D22: one line, one delete. The only control used to
				    be "empty the whole cart". */}
				<PopConfirmComponent
					entityName="cart line"
					actionName="delete"
					disabled={disabled}
					onConfirm={() => onRemove(line.cart_draft_line_id)}
					trigger={
						<button
							type="button"
							title="Remove this line"
							aria-label={`Remove ${line.serial} from the order`}
							disabled={disabled}
							className="grid h-9 w-9 flex-none place-items-center rounded-[9px] border border-[#EFE4E4] bg-white transition-colors hover:bg-[#FDF6F6] disabled:opacity-50"
						>
							<svg
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="#B4322F"
								strokeWidth="2.1"
								strokeLinecap="round"
								aria-hidden
							>
								<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
							</svg>
						</button>
					}
				/>
			</div>

			{/*
			  ! Only drawn when the model actually offers something. An empty
			  ! "Add-ons" heading on every line is a promise the Master Product
			  ! never made.
			*/}
			{offeredAddOns.length > 0 && (
				<div
					role="group"
					aria-label={`Add-ons for ${line.serial}`}
					className="flex flex-col gap-[6px] border-t border-[#EEF2F0] px-[13px] py-[10px]"
				>
					<span className="text-[11px] font-extrabold uppercase tracking-[0.4px] text-[#6B7C74]">
						Add-ons
					</span>
					<div className="flex flex-wrap gap-x-4 gap-y-[6px]">
						{offeredAddOns.map((addOn) => {
							const ticked = isTicked(addOn.add_on_id);
							// The price the line carries, which may be what the
							// salesperson agreed rather than the model's own.
							const charged =
								tickedAddOns.find(
									(entry) =>
										entry.add_on_id === addOn.add_on_id,
								)?.price ?? addOn.price;
							const outOfStock =
								addOn.inventory_tracked &&
								(addOn.stock_quantity ?? 0) < 1 &&
								!ticked;

							return (
								<label
									key={addOn.add_on_id}
									className={`flex min-w-0 items-center gap-[7px] text-[13px] ${
										disabled
											? "cursor-not-allowed opacity-60"
											: "cursor-pointer"
									}`}
								>
									<input
										type="checkbox"
										checked={ticked}
										disabled={disabled || outOfStock}
										aria-label={`${addOn.name} for ${line.serial}`}
										onChange={(event) =>
											toggleAddOn(
												addOn,
												event.target.checked,
											)
										}
										className="h-[15px] w-[15px] flex-none accent-[#0F6B37]"
									/>
									<span
										className={`truncate ${
											ticked
												? "font-bold text-[#0B4A2A]"
												: "text-[#22302B]"
										}`}
									>
										{addOn.name}
									</span>
									{/* ! Free is stated, not left blank. A blank
									    beside a ticked box reads as a missing
									    price rather than a deliberate one. */}
									<span className="flex-none text-[12.5px] text-[#6B7C74]">
										{Number(charged) === 0
											? "Included"
											: posMoney(charged)}
										{outOfStock ? " · Out of stock" : ""}
									</span>
								</label>
							);
						})}
					</div>
				</div>
			)}

			{serializedAddOns.length > 0 && (
				<div
					role="group"
					aria-label={`Serialized product add-ons for ${line.serial}`}
					className="flex flex-col gap-[7px] border-t border-[#EEF2F0] px-[13px] py-[10px]"
				>
					<span className="text-[11px] font-extrabold uppercase tracking-[0.4px] text-[#6B7C74]">
						Product add-ons
					</span>
					<div className="flex flex-col gap-[6px]">
						{serializedAddOns.map((addOn) => {
							const selected = Boolean(
								addOn.selected_cart_line_id,
							);
							const unavailable = !addOn.selectable && !selected;

							return (
								<label
									key={addOn.inventory_unit_id}
									className={`flex min-w-0 items-start gap-[7px] rounded-[8px] px-1 py-[3px] text-[12.5px] ${
										disabled || unavailable
											? "cursor-not-allowed opacity-55"
											: "cursor-pointer hover:bg-[#F5F8F6]"
									}`}
								>
									<input
										type="checkbox"
										checked={selected}
										disabled={disabled || unavailable}
										onChange={(event) =>
											onSerializedAddOn?.(
												line.cart_draft_line_id,
												addOn,
												event.target.checked,
											)
										}
										className="mt-[2px] h-[15px] w-[15px] flex-none accent-[#0F6B37]"
									/>
									<span className="min-w-0 flex-1">
										<span
											className={`block truncate ${
												selected
													? "font-bold text-[#0B4A2A]"
													: "font-semibold text-[#22302B]"
											}`}
										>
											{addOn.product.name} ·{" "}
											{addOn.product.model_number}
										</span>
										<span className="block truncate text-[11.5px] text-[#7A8982]">
											Serial {addOn.serial} · Grade{" "}
											{addOn.grade}
											{unavailable
												? ` · ${addOn.status}`
												: ""}
										</span>
									</span>
									<span className="flex-none font-semibold text-[#22302B]">
										{posMoney(addOn.grade_price)}
									</span>
								</label>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
};

export default PosUnitCartLine;
