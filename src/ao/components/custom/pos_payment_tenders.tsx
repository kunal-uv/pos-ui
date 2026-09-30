"use client";

import React from "react";

export interface Tender {
	payment_type: string;
	amount: string;
}

export interface PaymentTypeOption {
	id: string;
	value: string;
	label: string;
}

interface Props {
	tenders: Tender[];
	onChange: (next: Tender[]) => void;
	paymentTypes: PaymentTypeOption[];
	/** The sale's grand total, in minor units. */
	grandTotalMinor: number;
	/** Where the balance gets collected, for the red box's wording. */
	anyDelivered?: boolean;
	anyCollected?: boolean;
}

/**
 * Minor units from whatever the operator has typed so far.
 *
 * ! A half-typed "1." or an empty box is a normal state mid-keystroke, so this
 * ! answers zero rather than NaN. Amounts are held as strings for the same
 * ! reason: coercing every change to a number turns "" into 0 and fights the
 * ! cursor.
 */
export const tenderMinor = (amount: string): number => {
	const parsed = Number(amount);

	return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) : 0;
};

export const tendersPaidMinor = (tenders: Tender[]): number =>
	tenders.reduce((sum, tender) => sum + tenderMinor(tender.amount), 0);

/**
 * The single method that best describes a split sale: the one the most money
 * went through.
 *
 * ! Deliberately the same rule as the API's `dominantPaymentType`, because both
 * ! answer the same question and the answers have to match. `invoice.payment_type`
 * ! is one column that every report groups on, and the server recomputes it from
 * ! the tenders at checkout - so a till that guessed differently would show one
 * ! method on screen and file another.
 *
 * ! Largest wins, not first: $200 card and $800 cash is a cash sale to anyone
 * ! reading a summary, and taking the first row would make it depend on the
 * ! order somebody happened to key them in.
 */
export const dominantTenderType = (tenders: Tender[]): string => {
	const byType = new Map<string, number>();

	// ! A half-filled row is a normal state mid-keystroke, not a payment.
	tenders.forEach((tender) => {
		const minor = tenderMinor(tender.amount);

		if (tender.payment_type && minor > 0) {
			byType.set(
				tender.payment_type,
				(byType.get(tender.payment_type) ?? 0) + minor,
			);
		}
	});

	let best = "";
	let bestMinor = 0;

	// ! `forEach`, not `for…of`. This repo targets ES5 without
	// ! `downlevelIteration`, so iterating a Map directly does not compile.
	byType.forEach((minor, type) => {
		if (minor > bestMinor) {
			best = type;
			bestMinor = minor;
		}
	});

	return best;
};

/** Only the rows that are actually a payment, in the shape the server takes. */
export const tenderPayload = (tenders: Tender[]) =>
	tenders
		.filter(
			(tender) => tender.payment_type && tenderMinor(tender.amount) > 0,
		)
		.map((tender) => ({
			payment_type: tender.payment_type,
			amount: (tenderMinor(tender.amount) / 100).toFixed(2),
		}));

const asMoney = (value: number) =>
	`$${(value / 100).toLocaleString("en-US", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`;

/**
 * Several tenders on one sale (§7.5).
 *
 * ! $200 card, $200 cash, and whatever is left settled on delivery. One payment
 * ! type could not describe that, which is why this exists at all.
 *
 * ! Extracted from the checkout flow so it can be tested on its own. It shipped
 * ! with a bug no test could have caught in place - the flow's payment step is
 * ! four screens deep and nothing rendered it.
 */
export const PosPaymentTenders = ({
	tenders,
	onChange,
	paymentTypes,
	grandTotalMinor,
	anyDelivered = false,
	anyCollected = false,
}: Props) => {
	const paidMinor = tendersPaidMinor(tenders);

	// ! Never below zero on screen. Over-tendering is change from the drawer,
	// ! not a debt the shop has taken on.
	const outstandingMinor = Math.max(grandTotalMinor - paidMinor, 0);
	const changeMinor = Math.max(paidMinor - grandTotalMinor, 0);

	const replace = (index: number, patch: Partial<Tender>) =>
		onChange(
			tenders.map((row, at) =>
				at === index ? { ...row, ...patch } : row,
			),
		);

	return (
		<>
			<div className="flex flex-col gap-[8px]">
				<div className="flex items-center justify-between">
					<span className="text-[11.5px] font-bold tracking-[0.08em] text-[#8A968F]">
						PAYMENTS TAKEN
					</span>
					<span className="text-[12.5px] text-[#6B7770]">
						Amount due {asMoney(grandTotalMinor)}
					</span>
				</div>

				{tenders.map((tender, index) => (
					<div key={index} className="flex items-center gap-[7px]">
						<select
							aria-label="Payment method"
							value={tender.payment_type}
							onChange={(event) => {
								/**
								 * ! Read BEFORE the updater runs. React nulls
								 * ! `currentTarget` once the handler returns, and
								 * ! a state updater is called after that - so
								 * ! reading it inside threw "Cannot read
								 * ! properties of null" on the first keystroke.
								 */
								const chosen = event.currentTarget.value;

								replace(index, { payment_type: chosen });
							}}
							className="h-[44px] flex-1 rounded-[11px] border-[1.5px] border-[#DFE6E2] bg-white px-3 text-[13.5px] font-semibold text-[#22302B]"
						>
							{paymentTypes.map((option) => (
								<option key={option.id} value={option.value}>
									{option.label}
								</option>
							))}
						</select>
						<input
							aria-label="Amount"
							inputMode="decimal"
							placeholder="0.00"
							value={tender.amount}
							onChange={(event) => {
								const typed = event.currentTarget.value;

								replace(index, { amount: typed });
							}}
							className="h-[44px] w-[120px] rounded-[11px] border-[1.5px] border-[#DFE6E2] bg-white px-3 text-right text-[13.5px] font-bold text-[#22302B]"
						/>
						<button
							type="button"
							aria-label="Remove payment"
							onClick={() =>
								onChange(
									tenders.filter((_row, at) => at !== index),
								)
							}
							className="h-[44px] w-[44px] rounded-[11px] border-[1.5px] border-[#DFE6E2] bg-white text-[16px] font-bold text-[#8A968F] hover:border-[#B4322F] hover:text-[#B4322F]"
						>
							×
						</button>
					</div>
				))}

				<button
					type="button"
					onClick={() =>
						onChange([
							...tenders,
							{
								payment_type: paymentTypes[0]?.value ?? "cash",
								// Offers the rest of the bill, which is what the
								// next tender usually is.
								amount:
									outstandingMinor > 0
										? (outstandingMinor / 100).toFixed(2)
										: "",
							},
						])
					}
					className="h-[44px] rounded-[11px] border-[1.5px] border-dashed border-[#BFCBC4] bg-white text-[13.5px] font-semibold text-[#3C4A42] hover:border-[#0F6B37] hover:text-[#0F6B37]"
				>
					+ Add a payment
				</button>
			</div>

			{/* ! The outstanding figure in red, and only when money is actually
			    ! owed. A red box on a settled sale is a box the counter learns
			    ! to ignore. */}
			{tenders.length > 0 && outstandingMinor > 0 && (
				<div
					role="status"
					className="flex items-center justify-between rounded-[13px] border-[1.5px] border-[#E5A3A1] bg-[#FDF3F3] px-4 py-3"
				>
					<span className="text-[13.5px] font-bold text-[#8E2422]">
						Balance owing
						{anyDelivered
							? " — collect on delivery"
							: anyCollected
								? " — collect on pickup"
								: ""}
					</span>
					<span className="text-[19px] font-extrabold text-[#B4322F]">
						{asMoney(outstandingMinor)}
					</span>
				</div>
			)}

			{changeMinor > 0 && (
				<div className="flex items-center justify-between rounded-[13px] border border-[#BFE3CD] bg-[#F3F9F5] px-4 py-3">
					<span className="text-[13.5px] font-bold text-[#0B4A2A]">
						Change due
					</span>
					<span className="text-[17px] font-extrabold text-[#0B4A2A]">
						{asMoney(changeMinor)}
					</span>
				</div>
			)}
		</>
	);
};

export default PosPaymentTenders;
