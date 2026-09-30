import { business, BusinessConfig } from "../../constants/business_config";
import { PrintDocumentMeta, PrintLineItem } from "./print_shared";
import {
	modernDocumentShell,
	modernHeader,
	modernInvoiceItems,
	printMoney,
	printText,
} from "./modern_document";
import type { BreakupRow } from "../breakup";

export interface PrintInvoiceTotals {
	delivery: number;
	removal: number;
	ehf?: number;
	warranty?: number;
	discount?: number;
	/** Value of the item handed back in an exchange, credited against the total. */
	exchangeCredit?: number;
	/** Items plus warranty, before tax. */
	subtotal: number;
	/**
	 * The breakup as the server computed it. When present it is the whole
	 * middle of the totals block and every field above is ignored, which is how
	 * the printed invoice, the cart and the Invoice Detail modal are guaranteed
	 * to agree (Rule E, A48, F-04).
	 */
	breakupRows?: BreakupRow[];
	/**
	 * Legacy tax buckets, used only when no `breakupRows` are supplied - an
	 * invoice reprinted from a row issued before the breakup existed. New
	 * documents must not set these.
	 */
	tax5?: number;
	tax7?: number;
	total: number;
	/** Amount already paid. */
	deposit: number;
	/** `total - deposit`. */
	balance: number;
	paymentMethod?: string;
	/**
	 * The tenders behind `deposit`, one per method (§7.5).
	 *
	 * ! Printed only when there is more than one. A single payment is already
	 * ! fully described by METHOD OF PAYMENT and DEPOSIT, and repeating it as a
	 * ! third line is the kind of redundancy that had BALANCE DUE and TOTAL
	 * ! printing the same figure twice under different names.
	 */
	payments?: Array<{ label: string; amount: number }>;
}

export interface PrintInvoiceInput {
	meta: PrintDocumentMeta;
	items: PrintLineItem[];
	totals: PrintInvoiceTotals;
	/** The order-level note taken at checkout (`invoice.delivery_note`). */
	note?: string | null;
	customerSignature?: string;
	config?: BusinessConfig;
}

interface TotalRow {
	label: string;
	value: number;
	/** Printed as a deduction. */
	negative?: boolean;
	/** Rate printed in its own narrow cell, as the tax rows do. */
	rate?: string | null;
	/** Shaded rows are the running totals, plain ones the charges above them. */
	shaded?: boolean;
}

/**
 * Rows the printed document does not repeat: it has its own TOTAL and DEPOSIT.
 *
 * ! `balance_due` joins them because it *is* this form's TOTAL. On a sale settled
 * ! partly by an exchange credit the two carry the same figure, and keeping both
 * ! printed "BALANCE DUE 1133.91" with "TOTAL 1133.91" on the very next line -
 * ! the same amount under two names, then twice more as DEPOSIT and BALANCE.
 * ! Dropping the row loses nothing: subtotal, tax and the credit still sit above
 * ! the TOTAL and still add up to it. Only a POS sale carrying a credit has this
 * ! row at all - a legacy invoice has no breakup and never reaches this branch.
 */
const PRINTED_SEPARATELY = new Set([
	"grand_total",
	"savings",
	"balance_due",
	/**
	 * ! `amount_paid` joins them because it *is* this form's DEPOSIT. Left in,
	 * ! a part-paid sale printed "PAID &minus;1000.00" in the body and "DEPOSIT
	 * ! 1000.00" four rows below it - the same money twice, once as a deduction
	 * ! and once as a payment. The per-method rows below say what it was made of.
	 */
	"amount_paid",
]);

/**
 * DEPOSIT, and what it was made of.
 *
 * ! One method needs no breakdown: METHOD OF PAYMENT already names it and
 * ! DEPOSIT already carries the figure. Two or more, and the customer's copy has
 * ! to be able to answer "how much of that went on the card" - which is the
 * ! question a split sale exists to create.
 */
const pushDeposit = (rows: TotalRow[], totals: PrintInvoiceTotals): void => {
	rows.push({ label: "DEPOSIT", value: totals.deposit, shaded: true });

	if ((totals.payments?.length ?? 0) < 2) return;

	(totals.payments ?? []).forEach((payment) => {
		rows.push({
			label: `PAID BY ${payment.label.toUpperCase()}`,
			value: payment.amount,
		});
	});
};

const buildTotalRows = (
	totals: PrintInvoiceTotals,
	config: BusinessConfig,
): TotalRow[] => {
	// ! The server's rows, in the server's order, with the server's labels -
	// ! including the tax label, which carries the rate actually charged. The
	// ! config-driven branch below is the legacy path and is used only for an
	// ! invoice printed from data that predates the breakup (see below).
	if (totals.breakupRows?.length) {
		/**
		 * ! MSRP and DISCOUNT print as one AMOUNT row: what the goods actually
		 * ! sell for. The pair said the same thing twice - a list price nobody
		 * ! is being charged, then the difference back off it - and a customer
		 * ! reading down the column had to do the subtraction to find the only
		 * ! figure that concerns them. Everything below is unchanged, so the
		 * ! column still adds to SUBTOTAL and to TOTAL.
		 */
		const msrp = totals.breakupRows.find((row) => row.key === "msrp");
		const discount = totals.breakupRows.find((row) => row.key === "discount");
		const rows: TotalRow[] = totals.breakupRows
			.filter((row) => !PRINTED_SEPARATELY.has(row.key))
			// The discount is folded into AMOUNT below, so it is not its own row.
			.filter((row) => !(msrp && row.key === "discount"))
			.map((row) =>
				row.key === "msrp"
					? {
							label: "AMOUNT",
							// MSRP less the saving, in cents, then to money once.
							value:
								(row.amount - Math.abs(discount?.amount ?? 0)) /
								100,
							shaded: false,
						}
					: {
							label: row.label.toUpperCase(),
							value: Math.abs(row.amount) / 100,
							negative: row.amount < 0,
							shaded: row.key === "subtotal" || row.key === "tax",
						},
			);

		rows.push({ label: "TOTAL", value: totals.total, shaded: true });
		pushDeposit(rows, totals);

		return rows;
	}

	// ! Untouched by the AMOUNT change above: this path never had an MSRP row
	// ! to fold a discount into. It serves invoices issued before the breakup
	// ! existed, and reshaping those would be rewriting history.
	const rows: TotalRow[] = [
		{ label: "DELIVERY", value: totals.delivery },
		{ label: "REMOVAL", value: totals.removal },
	];

	if (totals.ehf) rows.push({ label: "EHF", value: totals.ehf });
	if (totals.warranty) {
		rows.push({ label: "WARRANTY", value: totals.warranty });
	}
	if (totals.discount) {
		rows.push({
			label: "DISCOUNT",
			value: totals.discount,
			negative: true,
		});
	}
	if (totals.exchangeCredit) {
		rows.push({
			label: "EXCHANGE CREDIT",
			value: totals.exchangeCredit,
			negative: true,
		});
	}

	rows.push({ label: "SUBTOTAL", value: totals.subtotal, shaded: true });

	// ! Legacy path. Labels, rates and which buckets apply come from the active
	// ! business config, which is how an invoice could print "GST/HST 5%" beside
	// ! a cart that had applied 9.1% (D20, D30). Reached only when no breakup was
	// ! supplied - an invoice issued before the breakup existed.
	if (config.taxLabels.tax5) {
		rows.push({
			label: config.taxLabels.tax5,
			rate: config.taxRates.tax5,
			value: totals.tax5 ?? 0,
			shaded: true,
		});
	}
	if (config.taxLabels.tax7) {
		rows.push({
			label: config.taxLabels.tax7,
			rate: config.taxRates.tax7,
			value: totals.tax7 ?? 0,
			shaded: true,
		});
	}

	rows.push({ label: "TOTAL", value: totals.total, shaded: true });
	pushDeposit(rows, totals);

	return rows;
};

const displayTotalLabel = (row: TotalRow): string =>
	row.rate ? `${row.label} ${row.rate}` : row.label;

export const buildInvoiceHTML = (input: PrintInvoiceInput): string => {
	const config = input.config ?? business;
	const { meta, items, totals, note, customerSignature } = input;
	const totalRows = [
		...buildTotalRows(totals, config),
		{ label: "BALANCE", value: totals.balance, shaded: true },
	];
	const paymentLines = totals.payments?.length
		? totals.payments
		: totals.paymentMethod
			? [{ label: totals.paymentMethod, amount: totals.deposit }]
			: [];

	const body = `
	${modernHeader({
		title: "INVOICE",
		meta,
		dateLabel: "DELIVERY DATE",
		dateValue: meta.deliveryDate,
		config,
	})}
	${modernInvoiceItems(items, config)}
	<section class="modern-summary-area">
		<div>
			<div class="modern-payment-title">METHOD OF PAYMENT</div>
			${paymentLines
				.map(
					(payment) =>
						`<div class="modern-payment-line">${printText(
							payment.label,
						)} - ${printMoney(payment.amount, config)}</div>`,
				)
				.join("")}
			<div class="modern-payment-registration">${printText(
				config.registrationLabel,
			)} ${printText(config.registrationNumber)}</div>
		</div>
		<table class="modern-totals"><tbody>
			${totalRows
				.map(
					(row) => `<tr class="${
						row.negative ? "negative " : ""
					}${row.shaded ? "emphasis" : ""}">
						<td>${printText(displayTotalLabel(row))}</td>
						<td>${printMoney(row.negative ? -row.value : row.value, config)}</td>
					</tr>`,
				)
				.join("")}
		</tbody></table>
	</section>
	${
		note
			? `<div class="modern-agreement"><strong>NOTE:</strong> ${printText(
					note,
				)}</div>`
			: ""
	}
	<section class="modern-invoice-terms">
		<div class="modern-invoice-signature">
			<div>${printText(config.text.invoiceAgreement)}</div>
			<div>CUSTOMER SIGNATURE${
				customerSignature
					? `<img src="${printText(customerSignature)}" alt="" />`
					: ""
			}</div>
		</div>
		<div class="modern-thank-you">${printText(config.text.thankYou)}</div>
	</section>`;

	return modernDocumentShell("Invoice", body);
};
