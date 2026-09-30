import { business, type BusinessConfig } from "../../constants";
import {
	modernDocumentShell,
	modernHeader,
	modernInvoiceItems,
	modernReceiptSignature,
	printInvoiceNumber,
	printMoney,
	printText,
} from "./modern_document";
import type {
	PrintDocumentMeta,
	PrintLineItem,
} from "./print_shared";

/**
 * The money, as the return actually settled it.
 *
 * ! Every figure here is the **stored** one - what the return was quoted when it
 * ! was authorised and what the charge row actually withheld - never a fresh
 * ! calculation. The fee is a setting somebody can edit, and a receipt reprinted
 * ! next month must still show what the customer was told and paid, not what the
 * ! same return would cost today.
 */
export interface PrintReturnRefund {
	/** What the returned machines sold for, before anything is withheld. */
	soldFor?: number | string | null;
	/** The flat fee the shop retains, charged once for the whole return. */
	fee?: number | string | null;
	/** The returned lines' share of the tax the original invoice charged. */
	taxWithheld?: number | string | null;
	/**
	 * A charge the counter named - a missing shelf, a scored door.
	 *
	 * ! Its own row, not folded into the fee. The fee is the policy's figure
	 * ! and this one is a person's; a customer reading the receipt is owed
	 * ! the difference between "this is what we always keep" and "this is
	 * ! what we kept from you, and why".
	 */
	customCharge?: number | string | null;
	customChargeNote?: string | null;
	/** What actually went back to the customer. */
	paid?: number | string | null;
	/** cash, card, store credit, exchange - or nothing, for a no-refund close. */
	method?: string | null;
}

export interface PrintReturnInput {
	meta: PrintDocumentMeta;
	items: PrintLineItem[];
	config?: BusinessConfig;
	/** Printed above the summary when the return recorded one. */
	reason?: string | null;
	/** The date the goods came back. Blank prints the form's own placeholder. */
	returnDate?: string | null;
	refund?: PrintReturnRefund;
	/**
	 * Which of the two this is.
	 *
	 * ! An exchange **is** a return - the same reversals, the same charge row,
	 * ! the same frozen figures - followed by a credited replacement sale. It
	 * ! gets the same document rather than a second one built beside it, which
	 * ! is how the old download slip came to be a layout of its own.
	 */
	kind?: "return" | "exchange";
	/** The replacement invoice an exchange credit was spent on. */
	creditedTo?: string | null;
}

const amount = (value: number | string | null | undefined): number | null =>
	value === null || value === undefined || value === ""
		? null
		: Number(value);

/**
 * Whether the parts add up to the whole, to the cent.
 *
 * ! A breakdown that does not reconcile is worse than no breakdown: the customer
 * ! subtracts the two printed deductions, gets a different answer from the total
 * ! beneath them, and the receipt has argued with itself. It happens honestly -
 * ! a machine released at the door leaves the return, and its share of a fee
 * ! charged once for the whole authorisation goes with it - so the document
 * ! checks rather than assumes, and prints only the paid figure when it cannot
 * ! show the working.
 */
export const refundReconciles = (refund: PrintReturnRefund): boolean => {
	const soldFor = amount(refund.soldFor);
	const fee = amount(refund.fee) ?? 0;
	const withheld = amount(refund.taxWithheld) ?? 0;
	const named = amount(refund.customCharge) ?? 0;
	const paid = amount(refund.paid);

	if (soldFor === null || paid === null) return false;
	if (![soldFor, fee, withheld, named, paid].every(Number.isFinite)) return false;

	// ! Compared in cents. 1199 - 107.91 - 20 is 1071.0900000000001 in binary
	// ! floating point, and a receipt must not decline to show its working over
	// ! a rounding artefact eleven decimal places down.
	return Math.round((soldFor - fee - withheld - named - paid) * 100) === 0;
};

/**
 * How the money went back, as a person would write it.
 *
 * ! The stored values are enum members - `store_credit` prints with the
 * ! underscore still in it, which is a database column showing through onto a
 * ! customer's receipt. Found by rendering the page and reading it, not by any
 * ! assertion: every fixture happened to use `cash`.
 */
export const methodLabel = (method: string | null | undefined): string => {
	const clean = String(method ?? "")
		.trim()
		.replace(/_/g, " ");

	if (!clean || clean === "none") return "No refund";

	return clean.charAt(0).toUpperCase() + clean.slice(1);
};

interface TotalRow {
	label: string;
	value: number;
	negative?: boolean;
	emphasis?: boolean;
	/** The only row in the block, so it keeps the weight and loses the rule. */
	alone?: boolean;
}

const totalRows = (refund: PrintReturnRefund): TotalRow[] => {
	const paid = amount(refund.paid) ?? 0;

	/**
	 * ! Still the total, but with nothing above it to be ruled off from. The
	 * ! emphasis rule draws a border along the top, and on a lone row that
	 * ! border is a line ruled across an empty column separating nothing -
	 * ! which is exactly what it looked like on the rendered page.
	 */
	if (!refundReconciles(refund)) {
		return [{ label: "REFUND", value: paid, emphasis: true, alone: true }];
	}

	return [
		{ label: "RETURNED VALUE", value: amount(refund.soldFor) ?? 0 },
		{
			label: "RESTOCKING FEE RETAINED",
			value: amount(refund.fee) ?? 0,
			negative: true,
		},
		// ! Labelled with what it was for, because "custom charge" explains
		// ! nothing to the person being charged.
		...((amount(refund.customCharge) ?? 0) > 0
			? [
					{
						label: (
							refund.customChargeNote || "Charge"
						).toUpperCase(),
						value: amount(refund.customCharge) ?? 0,
						negative: true,
					},
				]
			: []),
		/*
		 * ! Last of the deductions, because it is worked out from the rows
		 * ! above it: the fee and the charge come off, and tax is withheld on
		 * ! what is left. Printed in that order so the customer can follow the
		 * ! arithmetic down the column.
		 */
		{
			label: "TAX WITHHELD",
			value: amount(refund.taxWithheld) ?? 0,
			negative: true,
		},
		{ label: "REFUND", value: paid, emphasis: true },
	];
};

/**
 * The Appliance Outlet return receipt.
 *
 * ! Built on `modern_document`, the same shell the invoice, delivery slip and
 * ! pickup slip were rebuilt on - one letterhead, one meta row, one
 * ! sold-to/ship-to pair, one item grid, one totals block. It was the last
 * ! document still on the older `print_shared` sheet, which is why a return
 * ! printed in a layout nobody recognised beside the invoice it reverses.
 *
 * ! It takes the **invoice** grid rather than the slip grid, deliberately. The
 * ! slip grid has a STATUS column and no money; this document exists to tell a
 * ! customer what they are getting back, so the amounts belong on it and the
 * ! status is already the word at the top of the page.
 *
 * ! What the delivery slip has between the grid and the signature is the
 * ! DELIVERY SURVEY - steps outside, hoses bought, entrance door, dryer vent.
 * ! None of it means anything for goods coming back, so this goes from the
 * ! grid to the money, then straight to the acknowledgement.
 *
 * ! The acknowledgement is the delivery slip's own wording, deliberately
 * ! (decided 2026-08-26). It is a sentence about receiving the goods listed
 * ! above, and on this document the person signing is confirming the machines
 * ! written on it are the ones that changed hands.
 */
export const buildReturnSlipHTML = (input: PrintReturnInput): string => {
	const config = input.config ?? business;
	const { meta, items } = input;
	const refund = input.refund ?? {};
	const rows = totalRows(refund);
	const exchange = input.kind === "exchange";

	const body = `
	${modernHeader({
		title: exchange ? "EXCHANGE RECEIPT" : "RETURN RECEIPT",
		meta,
		dateLabel: exchange ? "EXCHANGE DATE" : "RETURN DATE",
		dateValue: input.returnDate,
		config,
	})}
	${modernInvoiceItems(items, config)}
	<section class="modern-summary-area">
		<div>
			<div class="modern-payment-title">METHOD OF REFUND</div>
			<div class="modern-payment-line">${printText(methodLabel(refund.method))}</div>
			${
				/* ! Only when the return recorded one. An always-present empty
				   row pushes the acknowledgement and the signature down the
				   page on every receipt with nothing extra to say - the same
				   rule the pickup slip uses for its collection details. */
				input.reason
					? `<div class="modern-payment-line"><strong>REASON FOR ${
							exchange ? "EXCHANGE" : "RETURN"
						}</strong></div>
			<div class="modern-payment-line">${printText(input.reason)}</div>`
					: ""
			}
			${
				/* ! Where the credit went. Without it an exchange receipt says
				   money left the drawer and never says it came back as a
				   machine, which is the whole shape of an exchange. */
				input.creditedTo
					? `<div class="modern-payment-line"><strong>CREDITED TO</strong></div>
			<div class="modern-payment-line">Invoice ${printText(
				printInvoiceNumber(String(input.creditedTo), config),
			)}</div>`
					: ""
			}
			<div class="modern-payment-registration">${printText(
				config.registrationLabel,
			)} ${printText(config.registrationNumber)}</div>
		</div>
		<table class="modern-totals"><tbody>
			${rows
				.map(
					(row) => `<tr class="${row.negative ? "negative " : ""}${
						row.emphasis ? "emphasis" : ""
					}${row.alone ? " alone" : ""}">
						<td>${printText(row.label)}</td>
						<td>${printMoney(row.negative ? -row.value : row.value, config)}</td>
					</tr>`,
				)
				.join("")}
		</tbody></table>
	</section>
	<div class="modern-acknowledgement">${printText(
		config.text.deliveryAcknowledgement,
	)}</div>
	${
		/* ! Blank, always. Like the delivery and pickup slips, this is signed
		   when the goods actually change hands, never pre-signed at the
		   counter (P27, A53, CHK-31). */ ""
	}
	${modernReceiptSignature()}
	<div class="modern-thank-you">${printText(config.text.thankYou)}</div>`;

	return modernDocumentShell(
		exchange ? "Exchange Receipt" : "Return Receipt",
		body,
	);
};
