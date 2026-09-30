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
} from "./modern_document";

/**
 * The survey taken at the till, as the slip prints it.
 *
 * ! Every field is optional and an unanswered one prints the blank box the
 * ! driver has always filled in by hand. Capturing at the counter is an
 * ! improvement on that, not a replacement for it - a sale where nobody asked
 * ! must still produce a usable slip.
 */
export interface PrintFulfilmentDetails {
	deliveryDate?: string | null;
	deliveryInstructions?: string | null;
	/** Exact stair counts, so the crew can plan before arrival. */
	stepsOutside?: number | null;
	stepsInside?: number | null;
	entranceDoor?: "single" | "double" | null;
	entranceLevel?: "ground" | "upstairs" | "basement" | null;
	hosesBought?: boolean | null;
	doorRemoval?: boolean | null;
	dryerVent?: boolean | null;
}

export interface PrintDeliveryInput {
	meta: PrintDocumentMeta;
	items: PrintLineItem[];
	details?: PrintFulfilmentDetails;
	/** Amount the driver must collect before releasing the order. */
	balance?: number;
	/**
	 * ! Removed. A slip prints a BLANK signature block and is signed on receipt
	 * ! (P27, A53, CHK-31). It used to accept the signature captured at the
	 * ! till, which printed a receipt for a delivery nobody had made yet.
	 */
	config?: BusinessConfig;
}

const choice = (label: string, selected: boolean): string =>
	`<span class="modern-choice${selected ? " selected" : ""}">${printText(label)}</span>`;

const yesNo = (answer: boolean | null | undefined): string =>
	`${choice("Yes", answer === true)}${choice("No", answer === false)}`;

const stepCount = (count: number | null | undefined): string =>
	count === null || count === undefined
		? "<span class=\"modern-fill-line\"></span>"
		: `<strong>${printText(String(count))}</strong>`;

export const buildDeliverySlipHTML = (input: PrintDeliveryInput): string => {
	const config = input.config ?? business;
	const { meta, items } = input;
	// Absent survey answers print the blank form, exactly as before.
	const details = input.details ?? {};
	const body = `
	${modernHeader({
		title: "DELIVERY SLIP",
		meta,
		dateLabel: "DELIVERED DATE",
		dateValue: details.deliveryDate,
		config,
	})}
	${modernSlipItems(
		items,
		"Scheduled",
		details.deliveryDate || "To be scheduled",
	)}
	<div class="modern-balance">BALANCE OWING: ${printMoney(input.balance ?? 0, config)}</div>
	<section class="modern-survey">
		<div class="modern-survey-panel">
			<div class="modern-section-label">SITE SURVEY</div>
			<div class="modern-survey-row">Steps Outside Home: ${stepCount(details.stepsOutside)}</div>
			<div class="modern-survey-row">Steps Inside Home: ${stepCount(details.stepsInside)}</div>
			<div class="modern-survey-row">Entrance Door: ${choice(
				"Single",
				details.entranceDoor === "single",
			)}${choice("Double", details.entranceDoor === "double")}</div>
			<div class="modern-survey-row">${choice(
				"Ground Level",
				details.entranceLevel === "ground",
			)}${choice("Upstairs", details.entranceLevel === "upstairs")}${choice(
				"Basement",
				details.entranceLevel === "basement",
			)}</div>
		</div>
		<div class="modern-survey-panel">
			<div class="modern-section-label">CHARGEABLE OPTIONS</div>
			<table class="modern-charge-table"><tbody>
				<tr><td>HOSES BOUGHT (${printMoney(config.fees.hoses, config)})</td><td>${yesNo(
					details.hosesBought,
				)}</td></tr>
				<tr><td>DOOR REMOVAL (${printMoney(
					config.fees.doorRemoval,
					config,
				)})</td><td>${yesNo(details.doorRemoval)}</td></tr>
				<tr><td>DRYER VENT (${printMoney(config.fees.dryerVent, config)})</td><td>${yesNo(
					details.dryerVent,
				)}</td></tr>
			</tbody></table>
		</div>
	</section>
	<div class="modern-removals">${printText(config.text.removals)}</div>
	${modernInstructions("DELIVERY INSTRUCTIONS", details.deliveryInstructions)}
	<div class="modern-legal">${printText(config.text.deliverySlipTerms)}</div>
	<div class="modern-acknowledgement">${printText(
		config.text.deliveryAcknowledgement,
	)}</div>
	${modernReceiptSignature()}`;

	return modernDocumentShell("Delivery Slip", body);
};
