/**
 * The breakup as the API returns it, and the only formatter for it.
 *
 * Amounts are integer minor units end to end (defect D31). Nothing on this side
 * adds, taxes or rounds them - the server did that once, and this file turns the
 * result into a string.
 */

export type BreakupRowKey =
	| "msrp"
	| "discount"
	| "warranty"
	| "ehf"
	| "delivery"
	| "removal"
	| "relocation"
	| "subtotal"
	| "tax"
	| "grand_total"
	/**
	 * An exchange, on the replacement sale (§9.2).
	 *
	 * ! Both rows appear only when there is a credit, and the `total` emphasis
	 * ! moves from the grand total onto the balance when they do - the largest
	 * ! figure on screen has to be the one being asked for.
	 */
	| "exchange_credit"
	| "amount_paid"
	| "balance_due"
	| "savings";

export interface BreakupRow {
	key: BreakupRowKey;
	/** Already carries the tax rate where the row is the tax line (A49). */
	label: string;
	/** Minor units. Negative on the discount row. */
	amount: number;
	emphasis?: "subtotal" | "total";
}

export interface BreakupTotals {
	msrp: number;
	discount: number;
	warranty: number;
	ehf: number;
	delivery: number;
	removal: number;
	relocation: number;
	subtotal: number;
	tax: number;
	grand_total: number;
	savings: number | null;
	exchange_credit: number;
	/** The grand total less any exchange credit: what is left to collect. */
	/** What has actually been tendered against the sale so far. */
	amount_paid: number;
	balance_due: number;
}

export interface Breakup {
	rows: BreakupRow[];
	totals: BreakupTotals;
	tax_rate: number;
}

/**
 * Minor units to the two-decimal string every surface prints.
 *
 * ! Always two places. The live build printed `$199.99` on one line and
 * ! `$199 x 1` on the next for the same item, because one path formatted and the
 * ! other did not (D31).
 */
export const formatMinor = (minor: number): string => {
	const negative = minor < 0;
	const digits = Math.abs(Math.trunc(minor)).toString().padStart(3, "0");

	return `${negative ? "-" : ""}${digits.slice(0, -2)}.${digits.slice(-2)}`;
};

/**
 * A displayed price to minor units, for building a request.
 *
 * String arithmetic rather than `* 100`, for the same reason the API does it
 * that way: `199.99 * 100` is `19998.999999999996` and flooring it loses a cent.
 */
export const toMinor = (value: string | number | null | undefined): number => {
	if (value === null || value === undefined || value === "") {
		return 0;
	}

	const raw =
		typeof value === "number" ? value.toFixed(10) : String(value).trim();
	const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(raw);

	if (!match) {
		return 0;
	}

	const [, sign, whole = "0", fractionRaw = ""] = match;
	const fraction = fractionRaw.padEnd(3, "0");
	const cents = Number(whole) * 100 + Number(fraction.slice(0, 2));
	const rounded = Number(fraction[2] ?? "0") >= 5 ? cents + 1 : cents;

	return sign === "-" ? -rounded : rounded;
};
