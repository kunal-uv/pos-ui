import { business, BusinessConfig } from "../../constants/business_config";
import { PrintDocumentMeta, PrintLineItem } from "./print_shared";
import {
	modernDocumentShell,
	modernHeader,
	modernInstructions,
	modernReceiptSignature,
	modernSlipItems,
	printMoney,
	printText,
	storeAddress,
} from "./modern_document";

/** What was agreed at the till about the collection itself. */
export interface PrintPickupDetails {
	pickupDate?: string | null;
	pickupInstructions?: string | null;
	/**
	 * §12.2's pickup confirmation code. Printed so the customer can show it at
	 * the counter; asked for at release when the owner has switched it on.
	 */
	pickupCode?: string | null;
}

export interface PrintPickupInput {
	meta: PrintDocumentMeta;
	items: PrintLineItem[];
	details?: PrintPickupDetails;
	/** Amount still due when the customer arrives to collect the order. */
	balance?: number;
	/**
	 * ! Removed. A slip prints a BLANK signature block and is signed on receipt
	 * ! (P27, A53, CHK-31). It used to accept the signature captured at the
	 * ! till, which printed a receipt for a delivery nobody had made yet.
	 */
	config?: BusinessConfig;
}

export const buildPickupSlipHTML = (input: PrintPickupInput): string => {
	const config = input.config ?? business;
	const { meta, items } = input;
	const details = input.details ?? {};
	const collectedAt = storeAddress(config).slice(1, -1).join(", ");
	const body = `
	${modernHeader({
		title: "PICKUP SLIP",
		meta,
		dateLabel: "PICKUP DATE",
		dateValue: details.pickupDate,
		config,
		shipTo: {
			label: "SHIP TO",
			name: "CUSTOMER PICKUP",
			lines: [`Collected in store at ${collectedAt}.`],
		},
	})}
	${modernSlipItems(
		items,
		"Awaiting Pickup",
		details.pickupDate || "To be scheduled",
	)}
	<div class="modern-balance">BALANCE OWING: ${printMoney(input.balance ?? 0, config)}</div>
	${
		details.pickupCode
			? `<div class="modern-agreement"><strong>PICKUP CODE: ${printText(
					details.pickupCode,
				)}</strong> - show this code when you collect. Keep it private: it releases your order.</div>`
			: ""
	}
	${modernInstructions("PICKUP INSTRUCTIONS", details.pickupInstructions)}
	<div class="modern-agreement">${printText(config.text.pickupAgreement)}</div>
	<div class="modern-acknowledgement">${printText(
		config.text.pickupAcknowledgement,
	)}</div>
	${modernReceiptSignature()}
	<div class="modern-receipt-note">This slip is signed at the point of pickup. The signature captured at the point of sale is not reproduced here.</div>
	<div class="modern-thank-you">${printText(config.text.thankYou)}</div>`;

	return modernDocumentShell("Pickup Slip", body);
};
