"use client";

import React from "react";
import {
	DividerComponent,
	GroupComponent,
	StackComponent,
	TextComponent,
} from "..";
import { currencySign } from "../../utils";
import { BreakupRow, formatMinor } from "../../utils/breakup";

interface Props {
	rows: BreakupRow[];
	/** Rendered under the Grand Total, e.g. an exchange balance. */
	footer?: React.ReactNode;
	size?: "sm" | "md";
	/**
	 * Presentation only. `till` draws the same rows on the POS palette, at the
	 * sizes a screen read from two feet away needs.
	 *
	 * ! A variant, not a second component. The arithmetic is the server's and
	 * ! the row list is the server's; what varies here is type size and colour.
	 * ! Copying this renderer to restyle it is how three implementations came to
	 * ! disagree about one sale (D20, D21, D30).
	 */
	variant?: "default" | "till";
}

/**
 * The price breakup. One component, three places.
 *
 * The cart's View Price Breakup, the Invoice Detail modal and the printed
 * invoice all render this, from the same `rows` array (Rule E, A48). A live cart
 * gets the array from `POST /pricing/breakup`; an issued invoice gets it from
 * its own stored snapshot, which is how an old invoice still shows the EHF, GST
 * and PST rows it was actually charged (C-06, A33).
 *
 * ! It computes nothing. No sums, no tax, no rounding, no `.toFixed()` on a
 * ! number this component derived. It was three implementations disagreeing
 * ! about one sale that produced defects D20, D21 and D30, and the only durable
 * ! fix is that the renderer has nothing left to disagree about.
 *
 * ! Row order, labels and the tax rate all arrive from the server. Do not sort,
 * ! filter or relabel here. The order is fixed by §7.8 and the discount sits
 * ! above the subtotal on purpose.
 */
export const PriceBreakup = ({
	rows,
	footer,
	size = "sm",
	variant = "default",
}: Props) => {
	if (variant === "till") {
		return (
			<div className="flex flex-col gap-[6px]">
				{rows.map((row, index) => {
					const isSubtotal = row.emphasis === "subtotal";
					const isTotal = row.emphasis === "total";
					// A negative balance due means exchange credit remains after the
					// replacement sale. It is shown as credit available, not as an
					// amount the customer owes.
					const isNegative = row.amount < 0;
					const showNegativeSign =
						isNegative && row.key !== "balance_due";
					const money = `${showNegativeSign ? "- " : ""}${currencySign} ${formatMinor(Math.abs(row.amount))}`;

					return (
						<React.Fragment key={row.key}>
							{/* The subtotal is separated above and below (§7.8). */}
							{isSubtotal && index > 0 && (
								<div className="my-[3px] h-px bg-[#E6EBE8]" />
							)}

							{isTotal ? (
								<div className="flex items-baseline justify-between">
									<span className="text-[16px] font-extrabold tracking-[-0.01em] text-[#101614]">
										{row.label}
									</span>
									<span
										className={`text-[30px] font-extrabold tracking-[-0.03em] ${
											isNegative
												? "text-[#B4322F]"
												: "text-[#0F6B37]"
										}`}
									>
										{money}
									</span>
								</div>
							) : (
								<div className="flex justify-between text-[13.5px] text-[#6B7A74]">
									<span>{row.label}</span>
									<span
										className={`font-bold ${
											isNegative
												? "text-[#B4322F]"
												: "text-[#22302B]"
										}`}
									>
										{money}
									</span>
								</div>
							)}

							{isSubtotal && (
								<div className="my-[3px] h-px bg-[#E6EBE8]" />
							)}
						</React.Fragment>
					);
				})}

				{footer}
			</div>
		);
	}

	return (
	<StackComponent gap={6}>
		{rows.map((row, index) => {
			const isSubtotal = row.emphasis === "subtotal";
			const isTotal = row.emphasis === "total";
			// See the till renderer above: a negative balance is remaining
			// exchange credit, so its display must not look like a charge.
			const isNegative = row.amount < 0;
			const showNegativeSign =
				isNegative && row.key !== "balance_due";

			return (
				<React.Fragment key={row.key}>
					{/* The subtotal is separated above and below (§7.8). */}
					{isSubtotal && index > 0 && (
						<DividerComponent my={0} variant="dashed" p={0} py={0} />
					)}

					<GroupComponent justify="space-between">
						<TextComponent
							text={`${row.label}:`}
							bold
							size={isTotal ? undefined : size}
							c={isNegative ? "red" : isTotal ? "green" : undefined}
						/>
						<TextComponent
							text={`${showNegativeSign ? "- " : ""}${currencySign} ${formatMinor(Math.abs(row.amount))}`}
							bold
							size={isTotal ? undefined : size}
							c={isNegative ? "red" : isTotal ? "green" : undefined}
						/>
					</GroupComponent>

					{isSubtotal && (
						<DividerComponent my={0} variant="dashed" p={0} py={0} />
					)}
				</React.Fragment>
			);
		})}

		{footer}
	</StackComponent>
	);
};

export default PriceBreakup;
