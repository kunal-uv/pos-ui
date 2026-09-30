import { business, BusinessConfig } from "../../constants/business_config";

/**
 * The printed documents reproduce the Appliance Outlet workbook, so every
 * measurement here is taken straight from the sheet export in
 * `public/Invoice`: an eight column grid 819 units wide, cell heights in the
 * same units and fonts in points.
 *
 * The grid is drawn at `SHEET_SCALE` so a sheet that is 8.5in wide in Google
 * Sheets fits between the printer margins of a letter page. Widths are emitted
 * as percentages, so only heights and font sizes carry the factor.
 */
const SHEET_SCALE = 0.9;

/** Column widths of the invoice grid, in workbook units. */
export const INVOICE_COLUMNS = [80, 72, 72, 217, 143, 81, 41, 113];
/** Delivery and pickup slips widen ITEM # at the expense of the money columns. */
export const SLIP_COLUMNS = [80, 72, 72, 217, 143, 78, 36, 122];

/** Workbook units → printed pixels. */
const px = (units: number): string => `${(units * SHEET_SCALE).toFixed(1)}px`;
/** Workbook points → printed points. */
const pt = (points: number): string => `${(points * SHEET_SCALE).toFixed(1)}pt`;

/** One row of the printed items table, already normalised by the caller. */
export interface PrintLineItem {
	quantity: number;
	/** Main description line — the item name. */
	description: string;
	/** Extra lines printed under the description, e.g. a short description. */
	extraLines?: string[];
	/** Printed in the ITEM # column — SKU, unit number or item id. */
	itemNumber?: string;
	unitPrice?: number;
	amount?: number;
	/** Printed in the AMOUNT column on its own line, e.g. a warranty charge. */
	extraAmounts?: number[];
}

export interface PrintParty {
	name?: string;
	phone?: string;
	address?: string;
}

export interface PrintDocumentMeta {
	invoiceNumber: string;
	/** Already formatted for printing. */
	invoiceDate: string;
	/** Left blank on the form when unknown — the driver writes it in. */
	deliveryDate?: string;
	soldTo: PrintParty;
	shipTo: PrintParty;
}

const escapeHtml = (value: string): string =>
	value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");

/** Values reaching these templates are user-entered, so escape before printing. */
export const text = (value: string | number | null | undefined): string =>
	value === null || value === undefined || value === "" ? "" : escapeHtml(String(value));

export const money = (
	value: number | string | null | undefined,
	config: BusinessConfig = business,
): string => `${config.currencySign}${Number(value ?? 0).toFixed(2)}`;

/**
 * Amounts inside the grid print bare, the way the workbook formats them — the
 * currency is stated by the business, not repeated on every line.
 */
export const figure = (value: number | string | null | undefined): string =>
	Number(value ?? 0).toFixed(2);

/*
 * ! Cell classes are written as `td.name` so they carry the same specificity as
 * ! the base `.sheet td` rule and win by coming later. Row rules only ever set
 * ! heights, which no cell class overrides.
 */
export const printStyles = (): string => `
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
	font-family: Arial, Helvetica, sans-serif;
	font-size: ${pt(10)};
	line-height: 1.2;
	color: #000;
	background: #fff;
	/* ! Row heights are fixed while widths are proportional, so the grid is
	 * ! held at its printed width - a wider window would stretch it out of
	 * ! shape and the lockup would collide with the document title. */
	max-width: 7.8in;
	margin: 0 auto;
	padding: 8px;
	-webkit-print-color-adjust: exact;
	print-color-adjust: exact;
}

/* The lockup overhangs the header cell, so the grid sits in a positioned box. */
.sheet-wrap { position: relative; width: 100%; }
.sheet { width: 100%; border-collapse: collapse; table-layout: fixed; }
.sheet td {
	border: 1px solid #000;
	padding: 0 3px;
	font-size: ${pt(10)};
	vertical-align: middle;
	overflow: hidden;
	word-wrap: break-word;
}
/* Rows printed below the ruled box carry no borders at all. */
tr.open td { border: 0; }

/* ── Header band ──────────────────────────────────────── */
/* ! A little taller than the workbook's 147, because the lockup file carries
 * ! transparent padding the sheet's cropped copy does not. */
tr.head-row td { height: ${px(162)}; }
td.head-address {
	border-right: 0;
	font-size: ${pt(12)};
	font-weight: bold;
	line-height: 1.32;
	vertical-align: bottom;
	padding-bottom: ${px(6)};
}
td.head-title {
	border-left: 0;
	text-align: center;
	vertical-align: bottom;
	padding-bottom: ${px(4)};
}
.doc-title {
	font-size: ${pt(26)};
	font-weight: bold;
	line-height: 1.05;
	white-space: nowrap;
}
.doc-number { font-size: ${pt(8)}; font-weight: bold; letter-spacing: 0.3px; }
.brand-lockup { position: absolute; top: 0; right: 2.8%; width: 59.5%; height: auto; }
/* Fallback lockup for a brand with no wordmark image. */
.brand-text { padding-bottom: ${px(6)}; }
.brand-text img {
	display: block;
	margin: 0 auto ${px(3)};
	height: ${px(40)};
	width: auto;
	object-fit: contain;
}
.brand-name {
	display: block;
	font-family: "Arial Black", "Helvetica Neue", Arial, sans-serif;
	font-size: ${pt(18)};
	font-weight: 900;
	letter-spacing: -0.5px;
	line-height: 1.05;
}
.brand-rule { border-top: 1px solid #000; margin: ${px(3)} 12% ${px(2)}; }
.brand-tagline { font-size: ${pt(8)}; font-weight: bold; letter-spacing: 0.4px; }

/* ── Dates and parties ────────────────────────────────── */
tr.meta-row td { height: ${px(39)}; }
td.meta-label, td.meta-value { font-weight: bold; }
td.meta-label.right { text-align: right; }
tr.party-head td { height: ${px(24)}; background: #f2f2f2; font-weight: bold; }
tr.party-line td { height: ${px(29)}; }

/* ── Items ────────────────────────────────────────────── */
tr.items-head td { height: ${px(23)}; background: #f2f2f2; font-weight: bold; text-align: center; }
tr.item-row td { height: ${px(29)}; }
.sheet tr.item-row td { vertical-align: bottom; }
/* The invoice sets its item rows in bold, the slips do not. */
.sheet.priced tr.item-row td { font-weight: bold; }
td.item-qty, td.item-num { text-align: center; }
td.item-money { text-align: right; }
.item-extra { display: block; font-weight: normal; font-size: ${pt(8)}; }

/* ── Invoice totals ───────────────────────────────────── */
tr.totals-row td { height: ${px(24)}; }
td.tot-label, td.tot-value, td.tot-rate { text-align: right; font-weight: bold; }
td.tot-rate { font-size: ${pt(9)}; }
td.shade { background: #f2f2f2; }
td.terms { font-size: ${pt(7)}; line-height: 1.22; text-align: left; }
td.pay-label { font-size: ${pt(12)}; font-weight: bold; vertical-align: bottom; }
td.pay-registration { text-align: right; font-weight: bold; vertical-align: bottom; }
tr.warranty-row td { height: ${px(49)}; }
td.warranty-note { text-align: center; font-size: ${pt(7)}; line-height: 1.25; }

/* ── Delivery checklist ───────────────────────────────── */
tr.check-row td { height: ${px(41)}; }
.sheet tr.check-row td { font-family: "Times New Roman", Times, serif; font-size: ${pt(16)}; }
.sheet tr.check-row td.check-charge { font-size: ${pt(14)}; }
.sheet tr.check-row td.check-answer,
.sheet tr.check-row td.check-choice { text-align: center; }
tr.removals-row td { height: ${px(41)}; }
td.removals {
	text-align: center;
	font-family: "Times New Roman", Times, serif;
	font-size: ${pt(11)};
}

/* ── Legal blocks ─────────────────────────────────────── */
td.legal {
	font-family: "Times New Roman", Times, serif;
	font-size: ${pt(12)};
	font-weight: bold;
	font-style: italic;
	line-height: 1.25;
}
td.legal.small { font-size: ${pt(10)}; }
td.legal.plain {
	font-weight: normal;
	font-style: normal;
	font-size: ${pt(10)};
	vertical-align: top;
	padding-top: ${px(8)};
}
td.legal.centered { text-align: center; }
tr.terms-row td { height: ${px(98)}; }
tr.ack-row td { height: ${px(43)}; }
tr.pickup-agreement-row td { height: ${px(46)}; }
td.pickup-agreement { text-align: center; font-weight: bold; font-size: ${pt(14)}; }
td.notice {
	font-family: "Times New Roman", Times, serif;
	font-weight: bold;
	font-style: italic;
	font-size: ${pt(12)};
	vertical-align: bottom;
	padding-left: ${px(20)};
	padding-top: ${px(14)};
}
td.agreement {
	font-family: "Times New Roman", Times, serif;
	font-size: ${pt(12)};
	vertical-align: bottom;
	padding-top: ${px(18)};
}
td.sign-cell {
	font-family: "Times New Roman", Times, serif;
	font-size: ${pt(12)};
	vertical-align: bottom;
	padding-top: ${px(18)};
}
td.sign-cell.right { text-align: right; padding-right: 6%; }
td.sign-cell img { display: block; height: ${px(44)}; width: auto; object-fit: contain; }
td.sign-cell.right img { margin-left: auto; }
td.thank-you { text-align: center; font-weight: bold; padding-top: ${px(20)}; }

@page { size: letter; margin: 0.35in; }
@media print { body { padding: 0; } }
`;

const addressLines = (config: BusinessConfig): string => {
	const { address } = config;
	const phone = `Phone: ${config.phone}${config.fax ? `  Fax: ${config.fax}` : ""}`;

	return [
		config.legalName,
		address.line1,
		address.line2,
		`${address.city}, ${address.region} ${address.postalCode}`,
		phone,
		config.website,
		config.email,
	]
		.filter(Boolean)
		.map((line) => `<div>${text(line as string)}</div>`)
		.join("");
};

/**
 * The brand lockup sits over the top-right of the header, exactly as the image
 * floats above the workbook grid. Brands without a lockup image fall back to
 * the mark and wordmark set in type, inside the header cell.
 */
const lockup = (config: BusinessConfig): string =>
	config.wordmarkPath
		? `<img class="brand-lockup" src="${text(config.wordmarkPath)}" alt="" onerror="this.style.display='none';" />`
		: "";

const brandText = (config: BusinessConfig): string => {
	if (config.wordmarkPath) return "";

	const mark = config.logoPath
		? `<img src="${text(config.logoPath)}" alt="" onerror="this.style.display='none';" />`
		: "";
	const name = config.legalName.replace(/\s+(LLC|Inc\.?|Ltd\.?)$/i, "").toUpperCase();

	return `
	<div class="brand-text">
		${mark}<span class="brand-name">${text(name)}</span>
		<div class="brand-rule"></div>
		<div class="brand-tagline">${text(config.tagline)}</div>
	</div>`;
};

/** Address block on the left, lockup and document title on the right. */
export const headerRow = (
	title: string,
	meta: PrintDocumentMeta,
	config: BusinessConfig = business,
): string => `
<tr class="head-row">
	<td class="head-address" colspan="4">${addressLines(config)}</td>
	<td class="head-title" colspan="4">
		${brandText(config)}
		<div class="doc-title">${text(title)}</div>
		${meta.invoiceNumber ? `<div class="doc-number">NO. ${text(meta.invoiceNumber)}</div>` : ""}
	</td>
</tr>`;

/**
 * ! The second label is a parameter because not every document that uses this
 * ! row is about a delivery. A return slip printing "DELIVERY DATE:" over the
 * ! date the goods came BACK reads as the day they went out - found by looking
 * ! at the rendered slip, not by any assertion.
 */
export const metaRow = (
	meta: PrintDocumentMeta,
	secondLabel = "DELIVERY DATE:",
): string => `
<tr class="meta-row">
	<td class="meta-label" colspan="2">INVOICE DATE:</td>
	<td class="meta-value" colspan="2">${text(meta.invoiceDate)}</td>
	<td class="meta-label right">${text(secondLabel)}</td>
	<td class="meta-value" colspan="3">${text(meta.deliveryDate)}</td>
</tr>`;

/** Name, phone and address go on the three ruled lines under each heading. */
const partyLine = (party: PrintParty, line: number): string =>
	text([party.name, party.phone, party.address][line]);

export const partiesRows = (meta: PrintDocumentMeta): string => `
<tr class="party-head">
	<td colspan="4">SOLD TO:</td>
	<td colspan="4">SHIP TO:</td>
</tr>
${[0, 1, 2]
	.map(
		(line) => `
<tr class="party-line">
	<td colspan="4">${partyLine(meta.soldTo, line)}</td>
	<td colspan="4">${partyLine(meta.shipTo, line)}</td>
</tr>`,
	)
	.join("")}`;

/**
 * Column headings. `withPricing` splits the right of the grid into UNIT COST
 * and AMOUNT for the invoice; the slips give that space to ITEM #.
 */
export const itemsHeadRow = (withPricing: boolean): string => `
<tr class="items-head">
	${
		withPricing
			? `<td>QUANTITY</td>
	<td colspan="3">DESCRIPTION</td>
	<td>ITEM #</td>
	<td colspan="2">UNIT COST</td>
	<td>AMOUNT</td>`
			: `<td>QUANTITY</td>
	<td colspan="4">DESCRIPTION</td>
	<td colspan="3">ITEM #</td>`
	}
</tr>`;

/**
 * Item lines, padded with blank rows so a short order still fills the form.
 * `minRows` is one short of the printed minimum on the invoice, where the last
 * ruled line is taken by the first totals row.
 */
export const itemRows = (
	items: PrintLineItem[],
	withPricing: boolean,
	minRows: number,
): string => {
	const rows = items.map((item) => {
		const extras = (item.extraLines ?? [])
			.map((line) => `<span class="item-extra">${text(line)}</span>`)
			.join("");
		const extraAmounts = (item.extraAmounts ?? [])
			.map((value) => `<span class="item-extra">${figure(value)}</span>`)
			.join("");
		const amounts = `${item.amount === undefined ? "" : figure(item.amount)}${extraAmounts}`;

		return withPricing
			? `
<tr class="item-row">
	<td class="item-qty">${text(item.quantity)}</td>
	<td colspan="3">${text(item.description)}${extras}</td>
	<td class="item-num">${text(item.itemNumber)}</td>
	<td class="item-money" colspan="2">${item.unitPrice === undefined ? "" : figure(item.unitPrice)}</td>
	<td class="item-money">${amounts}</td>
</tr>`
			: `
<tr class="item-row">
	<td class="item-qty">${text(item.quantity)}</td>
	<td colspan="4">${text(item.description)}${extras}</td>
	<td class="item-num" colspan="3">${text(item.itemNumber)}</td>
</tr>`;
	});

	const blanks = Array.from({ length: Math.max(0, minRows - items.length) }).map(() =>
		withPricing
			? `
<tr class="item-row">
	<td>&nbsp;</td><td colspan="3">&nbsp;</td><td>&nbsp;</td><td colspan="2">&nbsp;</td><td>&nbsp;</td>
</tr>`
			: `
<tr class="item-row">
	<td>&nbsp;</td><td colspan="4">&nbsp;</td><td colspan="3">&nbsp;</td>
</tr>`,
	);

	return [...rows, ...blanks].join("");
};

/** The captured signature, printed above the line the customer signs on. */
/**
 * A **blank** receipt block: printed name, signature and date lines, and the
 * words the customer is agreeing to (P27, A53, CHK-31).
 *
 * ! Deliberately takes no signature. A delivery or pickup slip is proof that the
 * ! customer received the goods, and it is signed at the door or at the counter
 * ! when they do. Printing the signature captured at the till would be printing
 * ! a receipt for something that has not happened yet - and it would be printed
 * ! evidence of a delivery nobody has made.
 */
export const receiptSignatureBlock = (
	options: { colspan: number; acknowledgement?: string },
): string => `
<td class="sign-cell receipt-sign" colspan="${options.colspan}">
	<div class="receipt-ack">${text(options.acknowledgement ?? "Received in good condition")}</div>
	<div class="receipt-lines">
		<span>Print name: ______________________________</span>
		<span>Signature: ______________________________</span>
		<span>Date: ______________</span>
	</div>
</td>`;

export const signatureCell = (
	signature: string | undefined,
	options: { colspan: number; align?: "left" | "right"; label?: string },
): string => `
<td class="sign-cell${options.align === "right" ? " right" : ""}" colspan="${options.colspan}">
	${signature ? `<img src="${text(signature)}" alt="" onerror="this.style.display='none';" />` : ""}
	${text(options.label ?? "Customer Signature:")}
</td>`;

/** Wraps the grid rows in the positioned box that carries the brand lockup. */
export const sheet = (
	rows: string,
	options: { columns: number[]; priced?: boolean; config?: BusinessConfig },
): string => {
	const config = options.config ?? business;
	const total = options.columns.reduce((sum, width) => sum + width, 0);
	const columns = options.columns
		.map((width) => `<col style="width:${((width / total) * 100).toFixed(3)}%;" />`)
		.join("");

	return `
<div class="sheet-wrap">
	${lockup(config)}
	<table class="sheet${options.priced ? " priced" : ""}">
		<colgroup>${columns}</colgroup>
		<tbody>${rows}</tbody>
	</table>
</div>`;
};

export const documentShell = (title: string, body: string): string => `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>${text(title)}</title>
	<style>${printStyles()}</style>
</head>
<body>${body}</body>
</html>`;

/**
 * Claims a tab for a document that is not ready yet.
 *
 * Browsers only honour `window.open` while a click is still being handled, so a
 * flow that has to build its document first (the sticker PDF) must take the tab
 * up front and fill it in once the work finishes.
 */
export const openPendingPrintTab = (title: string): Window | null => {
	const tab = window.open("", "_blank");

	if (!tab) return null;

	tab.document.write(
		`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><title>${text(title)}</title>` +
			"<style>body{margin:0;font-family:Arial,Helvetica,sans-serif;display:flex;" +
			"align-items:center;justify-content:center;height:100vh;color:#555}</style></head>" +
			"<body>Preparing document…</body></html>",
	);
	tab.document.close();

	return tab;
};

/**
 * Shows a generated PDF in an already-open tab and raises the print dialog.
 *
 * The file goes into an iframe rather than straight into the tab because a
 * top-level PDF viewer cannot be told to print from script; an iframe can.
 * Auto-print is best-effort - some browsers refuse it - so the page also carries
 * its own Print button.
 */
export const showPdfInPrintTab = (tab: Window, blob: Blob, title: string): void => {
	const url = URL.createObjectURL(blob);

	tab.document.open();
	tab.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<title>${text(title)}</title>
	<style>
		html, body { margin: 0; height: 100%; background: #525659; }
		iframe { display: block; border: 0; width: 100%; height: 100%; }
		#print-fallback {
			position: fixed; top: 16px; right: 16px; z-index: 1;
			padding: 8px 18px; border: 0; border-radius: 6px; cursor: pointer;
			font: 600 14px Arial, Helvetica, sans-serif; color: #fff;
			background: rgba(116, 105, 182, 1);
		}
	</style>
</head>
<body>
	<button id="print-fallback" type="button">Print</button>
	<iframe id="document" src="${url}" title="${text(title)}"></iframe>
	<script>
		var frame = document.getElementById("document");
		var print = function () {
			try {
				frame.contentWindow.focus();
				frame.contentWindow.print();
			} catch (error) {
				/* The viewer refused; the fallback button is still there. */
			}
		};
		frame.addEventListener("load", function () { setTimeout(print, 300); });
		document.getElementById("print-fallback").addEventListener("click", print);
		window.addEventListener("pagehide", function () { URL.revokeObjectURL("${url}"); });
	</script>
</body>
</html>`);
	tab.document.close();
};

/**
 * Opens the rendered document in a new window and sends it to the printer.
 *
 * ! **The window is closed by `afterprint`, never by the line after `print()`.**
 * ! `window.print()` does not block until the dialog is dismissed - in Chrome it
 * ! returns as soon as the dialog is raised - so closing on the next line tore
 * ! the window down underneath the dialog and the popup appeared to shut itself
 * ! the moment it opened.
 *
 * ! If `afterprint` never fires, the window is LEFT OPEN. A document still on
 * ! screen can be printed again from the browser's own menu; one that has
 * ! vanished cannot, and the operator has no idea whether it reached the
 * ! printer.
 */
export const openPrintWindow = (html: string): void => {
	const printWindow = window.open("", "_blank", "width=850,height=1000");

	if (!printWindow) {
		console.log("Unable to open a new window. Please disable your popup blocker and try again.");
		return;
	}

	printWindow.document.write(html);
	printWindow.document.close();

	const send = () => {
		try {
			printWindow.focus();
			printWindow.print();
		} catch {
			/* The window went away, or the browser refused. Nothing to undo. */
		}
	};

	printWindow.addEventListener("afterprint", () => printWindow.close());

	// ! `document.write` on a blank window can finish loading before this code
	// ! runs, and the old `onload =` assignment was simply never called when it
	// ! did - so nothing printed at all and the window sat there empty-handed.
	// ! The delay lets images and web fonts settle, as the PDF tab does.
	if (printWindow.document.readyState === "complete") {
		setTimeout(send, 300);
	} else {
		printWindow.addEventListener("load", () => setTimeout(send, 300));
	}
};
