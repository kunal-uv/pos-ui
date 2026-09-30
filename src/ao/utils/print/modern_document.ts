import { business, type BusinessConfig } from "../../constants/business_config";
import {
	type PrintDocumentMeta,
	type PrintLineItem,
	text,
} from "./print_shared";

const ACCENT = "#b52f3a";

/** Print-safe text: the supplied forms use ordinary ASCII hyphens. */
export const printText = (value: string | number | null | undefined): string =>
	text(
		value === null || value === undefined
			? value
			: String(value).replace(/[\u2010-\u2015\u2212]/g, "-"),
	);

export const printMoney = (
	value: number | string | null | undefined,
	config: BusinessConfig = business,
): string => {
	const amount = Math.abs(Number(value ?? 0)).toLocaleString("en-US", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});

	return `${Number(value ?? 0) < 0 ? "-" : ""}${config.currencySign} ${amount}`;
};

const addressLines = (value?: string): string[] =>
	String(value ?? "")
		.split(/\r?\n|,\s*/)
		.map((line) => line.trim())
		.filter(Boolean);

export const storeAddress = (config: BusinessConfig): string[] => [
	config.legalName,
	config.address.line1,
	...(config.address.line2 ? [config.address.line2] : []),
	`${config.address.city}, ${config.address.region} ${config.address.postalCode}`,
	`Phone: ${config.phone}`,
];

const wordmark = (config: BusinessConfig): string => {
	const name = config.legalName
		.replace(/\s+(LLC|Inc\.?|Ltd\.?)$/i, "")
		.trim()
		.toUpperCase();
	const words = name.split(/\s+/);
	const accent = words.pop() ?? "";

	return `<div class="modern-wordmark">${printText(words.join(" "))} <span>${printText(
		accent,
	)}</span></div>`;
};

export interface ModernHeaderOptions {
	title: string;
	meta: PrintDocumentMeta;
	dateLabel: string;
	dateValue?: string | null;
	config?: BusinessConfig;
	shipTo?: {
		label?: string;
		name?: string;
		lines?: string[];
	};
}

/**
 * ! Exported because a document can name a second invoice - an exchange
 * ! receipt says where the credit went - and the two numbers on one page
 * ! have to be written the same way.
 */
export const printInvoiceNumber = (
	value: string,
	config: BusinessConfig = business,
): string => {
	const raw = String(value ?? "").trim();

	if (!/^\d+$/.test(raw) || !/Appliance Outlet/i.test(config.legalName)) {
		return raw;
	}

	return `AO-INV-${raw.padStart(5, "0")}`;
};

const partyCard = (
	label: string,
	party: { name?: string; address?: string },
	lines?: string[],
): string => `
	<div class="modern-party">
		<div class="modern-party-label">${printText(label)}</div>
		${party.name ? `<div class="modern-party-name">${printText(party.name)}</div>` : ""}
		${(lines ?? addressLines(party.address))
			.map((line) => `<div>${printText(line)}</div>`)
			.join("")}
	</div>`;

export const modernHeader = (options: ModernHeaderOptions): string => {
	const config = options.config ?? business;
	const ship = options.shipTo ?? {};
	const number = printInvoiceNumber(options.meta.invoiceNumber, config);

	return `
	<header class="modern-header">
		<div>
			${wordmark(config)}
			<div class="modern-store-address">
				${storeAddress(config)
					.map((line) => `<div>${printText(line)}</div>`)
					.join("")}
			</div>
		</div>
		<div class="modern-document-heading">
			<h1>${printText(options.title)}</h1>
			<div>${printText(config.website)}</div>
			<div>${printText(config.email)}</div>
			<div class="modern-registration">${printText(config.registrationLabel)} ${printText(
				config.registrationNumber,
			)}</div>
		</div>
	</header>
	<div class="modern-meta">
		<div><strong>INVOICE #</strong> ${printText(number)} <strong>INVOICE DATE</strong> ${printText(
			options.meta.invoiceDate,
		)}</div>
		<div><strong>${printText(options.dateLabel)}</strong> ${printText(
			options.dateValue || "To be scheduled",
		)}</div>
	</div>
	<div class="modern-parties">
		${partyCard("SOLD TO", options.meta.soldTo)}
		${partyCard(
			ship.label ?? "SHIP TO",
			{
				name: ship.name ?? options.meta.shipTo.name,
				address: options.meta.shipTo.address,
			},
			ship.lines,
		)}
	</div>`;
};

const modelAndDetails = (
	item: PrintLineItem,
): { model: string; grade: string; details: string[] } => {
	const extras = item.extraLines ?? [];
	const gradeLine = extras.find((line) => /^Grade\s+/i.test(line));
	const grade = gradeLine?.replace(/^Grade\s+/i, "").trim() ?? "";
	const withoutGrade = extras.filter((line) => line !== gradeLine);
	const [model = "", ...details] = withoutGrade;

	return { model, grade, details };
};

const itemDescription = (item: PrintLineItem): string => {
	const { model, details } = modelAndDetails(item);
	const firstLine = model
		? `<strong>${printText(model)}</strong> - ${printText(item.description)}`
		: `<strong>${printText(item.description)}</strong>`;
	const metadata = [
		item.itemNumber ? `Serial ${item.itemNumber}` : "",
		...details,
	].filter(Boolean);

	return `${firstLine}${
		metadata.length
			? `<div class="modern-item-detail">${metadata
					.map((line) => printText(line))
					.join(" | ")}</div>`
			: ""
	}`;
};

export const modernInvoiceItems = (
	items: PrintLineItem[],
	config: BusinessConfig = business,
): string => {
	const rows = items.flatMap((item) => {
		const { grade } = modelAndDetails(item);
		const base = `<tr>
			<td class="qty">${printText(item.quantity)}</td>
			<td>${itemDescription(item)}</td>
			<td>${printText(item.itemNumber)}</td>
			<td class="center">${printText(grade || "-")}</td>
			<td class="money">${
				item.unitPrice === undefined
					? ""
					: printMoney(item.unitPrice, config)
			}</td>
			<td class="money">${
				item.amount === undefined ? "" : printMoney(item.amount, config)
			}</td>
		</tr>`;
		const warrantyRows = (item.extraAmounts ?? []).map(
			(amount) => `<tr>
			<td class="qty">1</td>
			<td><strong>Extended Warranty</strong><div class="modern-item-detail">Extended Warranty plan</div></td>
			<td>-</td><td class="center">-</td>
			<td class="money">${printMoney(amount, config)}</td>
			<td class="money">${printMoney(amount, config)}</td>
		</tr>`,
		);

		return [base, ...warrantyRows];
	});

	return `<table class="modern-items modern-invoice-items">
		<thead><tr><th>QTY</th><th>DESCRIPTION</th><th>ITEM #</th><th>GRADE</th><th>UNIT PRICE</th><th>AMOUNT</th></tr></thead>
		<tbody>${rows.join("")}</tbody>
	</table>`;
};

export const modernSlipItems = (
	items: PrintLineItem[],
	status: string,
	statusDetail?: string | null,
): string => `<table class="modern-items modern-slip-items">
	<thead><tr><th>QTY</th><th>DESCRIPTION</th><th>ITEM #</th><th>STATUS</th></tr></thead>
	<tbody>${items
		.map(
			(item) => `<tr>
			<td class="qty">${printText(item.quantity)}</td>
			<td>${itemDescription(item)}</td>
			<td>${printText(item.itemNumber)}</td>
			<td>${printText(status)}${
				statusDetail
					? `<div class="modern-item-detail">${printText(statusDetail)}</div>`
					: ""
			}</td>
		</tr>`,
		)
		.join("")}</tbody>
	</table>`;

/**
 * Instructions a driver or a counter hand works down, printed as numbered steps.
 *
 * ! One step per line, because that is how somebody dictating them talks and
 * ! how the person carrying a fridge up four steps reads them. A paragraph is
 * ! read once and half-remembered; a numbered list is checked off.
 *
 * ! A single line stays a sentence rather than becoming "1." on its own, which
 * ! reads like the start of a list somebody forgot to finish.
 */
export const instructionSteps = (
	value: string | null | undefined,
): string[] =>
	(value ?? "")
		.split(/\r?\n/)
		// Numbering is the document's job, so a "1." somebody typed is stripped
		// rather than printed as "1. 1.".
		.map((line) => line.trim().replace(/^(\d+[.)]|[-*•])\s*/, "").trim())
		.filter((line) => line !== "");

export const modernInstructions = (
	label: string,
	value: string | null | undefined,
): string => {
	const steps = instructionSteps(value);

	if (steps.length === 0) {
		return "";
	}

	if (steps.length === 1) {
		return `<div class="modern-agreement"><strong>${printText(label)}:</strong> ${printText(
			steps[0] ?? "",
		)}</div>`;
	}

	return `<div class="modern-agreement"><strong>${printText(label)}:</strong>
		<ol class="modern-steps">${steps
			.map((step) => `<li>${printText(step)}</li>`)
			.join("")}</ol></div>`;
};

export const modernReceiptSignature = (): string => `
	<div class="modern-receipt-lines">
		<div><span>PRINTED NAME</span></div>
		<div><span>CUSTOMER SIGNATURE</span></div>
		<div><span>DATE</span></div>
	</div>`;

export const modernStyles = (): string => `
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; }
body {
	font-family: Arial, Helvetica, sans-serif;
	font-size: 8.25pt;
	line-height: 1.35;
	color: #111;
	-webkit-print-color-adjust: exact;
	print-color-adjust: exact;
}
.modern-document { width: 100%; max-width: 7.35in; margin: 0 auto; }
.modern-header {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 0.35in;
	align-items: start;
	padding: 0.46in 0.11in 0.18in;
	border-bottom: 2px solid #111;
}
.modern-wordmark {
	font-size: 18pt;
	font-weight: 900;
	letter-spacing: 0.2px;
	line-height: 1;
	white-space: nowrap;
}
.modern-wordmark span { color: ${ACCENT}; }
.modern-store-address { margin-top: 7px; font-size: 7.6pt; line-height: 1.35; }
.modern-document-heading { text-align: right; font-size: 7.4pt; line-height: 1.45; }
.modern-document-heading h1 {
	margin: -2px 0 6px;
	font-size: 16pt;
	letter-spacing: 3.2px;
	line-height: 1;
}
.modern-registration { margin-top: 5px; font-weight: 700; }
.modern-meta {
	display: flex;
	justify-content: space-between;
	gap: 18px;
	padding: 16px 10px 15px;
	font-size: 8pt;
}
.modern-meta strong { margin-right: 3px; }
.modern-meta strong:not(:first-child) { margin-left: 11px; }
.modern-parties { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #9b9b9b; }
.modern-party { min-height: 0.72in; padding: 10px 12px; }
.modern-party + .modern-party { border-left: 1px solid #9b9b9b; }
.modern-party-label { margin-bottom: 3px; color: #666; font-size: 6.8pt; letter-spacing: 1.7px; font-weight: 700; }
.modern-party-name { font-weight: 700; }
.modern-items { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 8px; }
.modern-items thead { display: table-header-group; }
.modern-items th {
	padding: 8px 10px;
	background: #111;
	color: #fff;
	font-size: 7.2pt;
	letter-spacing: 1px;
	text-align: left;
}
.modern-items td { padding: 10px; border-bottom: 1px solid #dedede; vertical-align: top; }
.modern-items tr { break-inside: avoid; page-break-inside: avoid; }
.modern-items .qty, .modern-items .center { text-align: center; }
.modern-items .money { text-align: right; white-space: nowrap; }
.modern-item-detail { margin-top: 2px; color: #333; font-size: 6.8pt; line-height: 1.35; }
.modern-invoice-items th:nth-child(1) { width: 7%; }
.modern-invoice-items th:nth-child(2) { width: 46%; }
.modern-invoice-items th:nth-child(3) { width: 16%; }
.modern-invoice-items th:nth-child(4) { width: 8%; }
.modern-invoice-items th:nth-child(5) { width: 12%; text-align: right; }
.modern-invoice-items th:nth-child(6) { width: 11%; text-align: right; }
.modern-invoice-items td { padding-top: 6px; padding-bottom: 6px; }
.modern-slip-items th:nth-child(1) { width: 8%; }
.modern-slip-items th:nth-child(2) { width: 56%; }
.modern-slip-items th:nth-child(3) { width: 18%; }
.modern-slip-items th:nth-child(4) { width: 18%; }
.modern-balance { margin: 17px 10px 18px; text-align: right; color: ${ACCENT}; font-size: 10.5pt; font-weight: 800; }
.modern-divider { border-top: 1px solid #888; }
.modern-acknowledgement { padding: 9px 0 12px; font-size: 7.3pt; }
.modern-agreement { padding: 8px 0; border-top: 1px solid #888; border-bottom: 1px solid #888; font-size: 6.5pt; }
/* ! Steps sit inside the agreement band, so the list keeps that band's type
   size and only earns indentation and a little room between steps. */
.modern-steps { margin: 4px 0 0; padding-left: 16px; }
.modern-steps li { margin-top: 2px; }
.modern-receipt-lines { display: grid; grid-template-columns: 1.2fr 1.15fr 0.62fr; gap: 20px; margin: 34px 10px 16px; }
.modern-receipt-lines > div { height: 26px; border-top: 1px solid #111; }
.modern-receipt-lines span { display: block; padding-top: 4px; font-size: 6.6pt; letter-spacing: 1.1px; }
.modern-receipt-note { color: #777; font-size: 6.2pt; }
.modern-thank-you { margin-top: 8px; text-align: center; font-size: 8.8pt; font-weight: 800; letter-spacing: 1.8px; }
.modern-legal { font-size: 6.4pt; line-height: 1.35; }
.modern-legal + .modern-legal { margin-top: 7px; }
.modern-summary-area { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 36px; padding: 19px 10px 0; }
.modern-payment-title { font-size: 7pt; font-weight: 800; letter-spacing: 1px; }
.modern-payment-line { margin-top: 4px; font-size: 7.2pt; }
.modern-payment-registration { margin-top: 11px; font-weight: 700; }
.modern-totals { width: 100%; border-collapse: collapse; }
.modern-totals td { padding: 3px 0; }
.modern-totals td:last-child { width: 35%; text-align: right; white-space: nowrap; }
.modern-totals tr.emphasis td { padding-top: 4px; border-top: 1px solid #bcbcbc; font-weight: 800; }
/* A total with no rows above it keeps the weight and loses the rule -
   otherwise the border is a line ruled across an empty column. */
.modern-totals tr.emphasis.alone td { padding-top: 0; border-top: none; }
.modern-totals tr.negative { color: ${ACCENT}; }
.modern-invoice-terms {
	break-inside: avoid;
	page-break-inside: avoid;
	margin: 18px 10px 0;
	padding-top: 10px;
	border-top: 1px solid #888;
}
.modern-invoice-signature { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 22px; }
.modern-invoice-signature > div { min-height: 44px; border-top: 1px solid #111; padding-top: 4px; font-size: 6.5pt; letter-spacing: 0.8px; }
.modern-invoice-signature img { display: block; max-height: 36px; max-width: 100%; margin-top: -42px; }
.modern-survey { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #969696; margin-top: 8px; }
.modern-survey-panel { min-height: 1.35in; padding: 10px 11px; }
.modern-survey-panel + .modern-survey-panel { border-left: 1px solid #969696; }
.modern-section-label { color: #666; font-size: 6.8pt; letter-spacing: 1.4px; }
.modern-survey-row { margin-top: 5px; }
.modern-choice { display: inline-block; margin: 2px 3px 0 0; padding: 1px 7px; border: 1px solid #111; font-size: 6.7pt; }
.modern-choice.selected { background: #111; color: #fff; }
.modern-charge-table { width: 100%; margin-top: 3px; border-collapse: collapse; }
.modern-charge-table td { padding: 9px; border: 1px solid #969696; }
.modern-charge-table td:last-child { width: 33%; text-align: right; white-space: nowrap; }
.modern-removals { padding: 8px 0; border-top: 1px solid #888; border-bottom: 1px solid #888; font-size: 6.2pt; font-weight: 700; }
@page { size: letter; margin: 0.42in 0.55in 0.45in; }
@media print {
	body { padding: 0; }
	.modern-document { max-width: none; }
}
`;

export const modernDocumentShell = (
	title: string,
	body: string,
): string => `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>${printText(title)}</title>
	<style>${modernStyles()}</style>
</head>
<body><main class="modern-document">${body}</main></body>
</html>`;
