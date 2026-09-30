import { formatDateShort } from "../config";
import type { PrintReturnInput } from "./return_template";
import type { BreakupRow } from "../breakup";
import type {
	PrintDocumentMeta,
	PrintLineItem,
	PrintParty,
} from "./print_shared";
import type { PrintInvoiceTotals } from "./invoice_template";

/**
 * A serialised sale, on its way to the printed documents.
 *
 * ! **The Appliance Outlet workbook format, not a template rendered by the
 * ! server.** `buildInvoiceHTML`, `buildDeliverySlipHTML` and
 * ! `buildPickupSlipHTML` reproduce the forms the business actually hands
 * ! customers; the `document_template` route renders whatever HTML is seeded in
 * ! the table, which is a generic starting layout. Nothing was wrong with the
 * ! branded builders - they had simply never been wired to a sale that carries
 * ! `sale_line` rows instead of `invoice_item`s, so the till printed the generic
 * ! one and the delivery and pickup slips had no live caller at all.
 *
 * ! Shaped to match what `GET /report` and `POST /pos/checkout` both return, so
 * ! one mapper feeds the post-checkout modal and a reprint from Reports. Two
 * ! mappers is how the same invoice comes out differently depending on which
 * ! screen printed it.
 */
/** One accessory fitted to a machine, as frozen onto the sale line. */
export interface PosDocumentAddOn {
	add_on_id?: string;
	name?: string;
	price?: string | number;
}

export interface PosDocumentLine {
	is_reversal?: boolean;
	/** Which return wrote this reversal. Absent on a sold line. */
	sale_return_id?: string | number | null;
	selected_upsell_add_ons?: PosDocumentAddOn[] | null;
	actual_sale_price?: string | number;
	extended_warranty_price?: string | number;
	grade_at_sale?: string;
	/** How this unit left the shop. Absent on sales that predate per-line
	 *  fulfilment, which is why the filter below treats it as "either". */
	fulfilment?: "delivery" | "pickup" | null;
	unit?: { serial?: string } | null;
	product?: { name?: string; model_number?: string } | null;
}

/**
 * One return event on an invoice, as `GET /report` sends it.
 *
 * ! `charges` and `return_lines` carry the figures **frozen when the return
 * ! was authorised** - not the prospective `return_quote` that rides on each
 * ! sold line. The fee is a setting somebody can edit, so a receipt reprinted
 * ! next month has to show what the customer was actually told.
 */
export interface PosDocumentSaleReturn {
	sale_return_id?: string | number;
	reason?: string | null;
	refund_amount?: string | number | null;
	refund_method?: string | null;
	refunded_at?: string | Date | null;
	created_at?: string | Date | null;
	charges?: Array<{
		type?: string;
		note?: string | null;
		basis?: string | number | null;
		amount?: string | number | null;
		tax_withheld?: string | number | null;
	}> | null;
	return_lines?: Array<{
		sale_line_id?: string | number;
		expected_serial?: string;
		released_at?: string | Date | null;
		refund_due?: string | number | null;
	}> | null;
}

export interface PosDocumentInvoice {
	invoice_id: string;
	sold_time?: string | Date | null;
	created_at?: string | Date | null;
	payment_type?: string | null;
	total_payable_amount?: string | number | null;
	exchange_credit?: string | number | null;
	signature_data?: string | null;
	customer?: {
		name?: string;
		phone?: string;
		address?: string;
		full_address?: string;
	} | null;
	ship_street?: string | null;
	ship_city?: string | null;
	ship_region?: string | null;
	ship_postal?: string | null;
	sale_lines?: PosDocumentLine[] | null;
	sale_returns?: PosDocumentSaleReturn[] | null;
	is_returned?: boolean | null;
	is_exchanged?: boolean | null;
	/** Set on the invoice being returned, naming the replacement sale. */
	exchanged_invoice_id?: string | number | null;

	/** The fulfilment survey taken at the till, stamped on the invoice. */
	delivery_date?: string | Date | null;
	pickup_date?: string | Date | null;
	delivery_instructions?: string | null;
	pickup_instructions?: string | null;
	/** The order-level note taken at checkout - prints on the invoice. */
	delivery_note?: string | null;
	/** §12.2: the six digits the customer shows at the counter. */
	pickup_code?: string | null;
	steps_outside?: number | null;
	steps_inside?: number | null;
	entrance_door?: "single" | "double" | null;
	entrance_level?: "ground" | "upstairs" | "basement" | null;
	hoses_bought?: boolean | null;
	door_removal?: boolean | null;
	dryer_vent?: boolean | null;
	/**
	 * What was actually tendered, a row per method (§7.5).
	 *
	 * ! `payment_type` above holds only the LARGEST of these - the honest single
	 * ! answer for a report that groups on one column, and a lie on a printed
	 * ! invoice, where it said "Cash" for a sale settled $400 cash and $600 by
	 * ! card. Absent on every sale issued before split payments existed, which
	 * ! is why every reader below treats an empty list as "one method, in full".
	 */
	payments?: Array<{
		payment_type?: string | null;
		amount?: string | number | null;
	}> | null;
	breakup_snapshot?: {
		rows?: BreakupRow[];
		totals?: {
			balance_due?: number;
			grand_total?: number;
			exchange_credit?: number;
			amount_paid?: number;
		};
	} | null;
}

/**
 * How each payment method is written on a customer-facing document.
 *
 * ! The enum values are what the database stores, and `certified_check` is not
 * ! a thing to print on an invoice somebody is handed at a counter.
 */
export const POS_PAYMENT_LABELS: Record<string, string> = {
	cash: "Cash",
	debit: "Debit",
	credit: "Credit",
	zelle: "Zelle",
	certified_check: "Certified Cheque / Draft",
};

/**
 * ! Falls back to the value tidied up rather than to an empty cell, so a method
 * ! added to the enum later prints as "Gift Card" instead of vanishing off the
 * ! document that records it.
 */
export const posPaymentLabel = (type: string | null | undefined): string => {
	const key = String(type ?? "").trim();

	if (!key) return "";

	return (
		POS_PAYMENT_LABELS[key] ??
		key
			.split("_")
			.filter(Boolean)
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(" ")
	);
};

const money = (value: string | number | null | undefined): number =>
	value === null || value === undefined || value === "" ? 0 : Number(value);

/**
 * The ship-to address as it was stamped on the invoice (P19, A46).
 *
 * ! Not the customer's current address. Editing a customer must never change
 * ! where an already-issued invoice says the machine went.
 */
const shipAddress = (invoice: PosDocumentInvoice): string =>
	[
		invoice.ship_street,
		invoice.ship_city,
		[invoice.ship_region, invoice.ship_postal].filter(Boolean).join(" "),
	]
		.filter((part) => Boolean(part && String(part).trim()))
		.join(", ");

const party = (invoice: PosDocumentInvoice, address: string): PrintParty => ({
	name: invoice.customer?.name,
	phone: invoice.customer?.phone,
	address,
});

export const posPrintMeta = (
	invoice: PosDocumentInvoice,
): PrintDocumentMeta => {
	const billing =
		invoice.customer?.full_address ?? invoice.customer?.address ?? "";
	const shipping = shipAddress(invoice) || billing;

	return {
		invoiceNumber: invoice.invoice_id,
		invoiceDate: formatDateShort(
			invoice.sold_time ?? invoice.created_at ?? new Date(),
		),
		/**
		 * ! The invoice header has a DELIVERY DATE box and this was never
		 * ! filled, so every invoice printed "To be scheduled" - including the
		 * ! ones where the date had just been agreed at the counter. The date is
		 * ! taken before checkout now, so it is a fact by the time anything is
		 * ! printed. Still null for a pickup or a sale nobody scheduled, and the
		 * ! header falls back to "To be scheduled" for exactly those.
		 */
		...(invoice.delivery_date
			? { deliveryDate: formatDateShort(invoice.delivery_date) }
			: {}),
		soldTo: party(invoice, billing),
		shipTo: party(invoice, shipping),
	};
};

/**
 * One printed line per machine.
 *
 * ! `quantity` is 1 and always will be - a line is a single physical unit (O11,
 * ! trap T10). The serial goes in the ITEM # column, because that is the number
 * ! a customer or a driver can check against the machine in front of them; an
 * ! internal line id matches nothing they can see.
 *
 * ! Reversals are left out. A return writes a second line carrying the negative
 * ! of the first, and an invoice reprint has to show what was sold - the credit
 * ! note is a separate document, not a line on this one.
 */
export const posPrintItems = (
	invoice: PosDocumentInvoice,
	{
		includeGrade = true,
		only,
		onlyReversals = false,
		saleReturnId,
	}: {
		includeGrade?: boolean;
		/**
		 * Keep only the units leaving this way.
		 *
		 * ! What a slip is for. A delivery slip listing the machine the customer
		 * ! already carried out is how the wrong one gets loaded on the van, and
		 * ! a pickup slip listing a delivery has the counter hunting for stock
		 * ! that is not there.
		 *
		 * ! A line with no fulfilment recorded appears on BOTH. Those are sales
		 * ! from before the split, where the order had one method and every line
		 * ! belonged to whichever slip was printed; dropping them would silently
		 * ! empty the slips for every historical order.
		 */
		only?: "delivery" | "pickup";
		/**
		 * Keep ONLY the reversal lines - what came back.
		 *
		 * ! The exact opposite of every other document, and only the return
		 * ! slip wants it. A return writes a second line carrying the negative
		 * ! of the one it undoes; an invoice or a delivery slip has to show
		 * ! what was SOLD, so they drop those lines. A return slip has to show
		 * ! what was RETURNED, so it keeps nothing else.
		 */
		onlyReversals?: boolean;
		/**
		 * Narrow those reversals to a single return.
		 *
		 * ! An invoice can carry several - the fridge back in August, the
		 * ! dryer in September. A receipt for one of them listing both is a
		 * ! receipt for a refund nobody paid.
		 */
		saleReturnId?: string | number | null;
	} = {},
): PrintLineItem[] =>
	(invoice.sale_lines ?? [])
		.filter((line) =>
			onlyReversals ? line.is_reversal : !line.is_reversal,
		)
		.filter(
			(line) =>
				!saleReturnId ||
				String(line.sale_return_id ?? "") === String(saleReturnId),
		)
		.filter((line) => !only || !line.fulfilment || line.fulfilment === only)
		.flatMap((line) => {
			/**
			 * ! Absolute. A reversal stores the negative of the line it undoes,
			 * ! and a return slip reading "-1,499.00" beside a fridge looks like
			 * ! money owed rather than a machine handed back.
			 */
			const signed = (value: number): number =>
				onlyReversals ? Math.abs(value) : value;
			const warranty = signed(money(line.extended_warranty_price));
			const price = signed(money(line.actual_sale_price));

			const machine: PrintLineItem = {
				quantity: 1,
				description: line.product?.name ?? "",
				extraLines: [
					line.product?.model_number,
					includeGrade && line.grade_at_sale
						? `Grade ${line.grade_at_sale}`
						: "",
				].filter((part): part is string => Boolean(part)),
				itemNumber: line.unit?.serial,
				unitPrice: price,
				amount: price,
				...(warranty > 0 ? { extraAmounts: [warranty] } : {}),
			};
			const accessories: PrintLineItem[] = (
				line.selected_upsell_add_ons ?? []
			)
				.filter((addOn) => Boolean(addOn?.name))
				.map((addOn) => {
					const charged = signed(money(addOn.price));

					return {
						quantity: 1,
						description: `+ ${addOn.name}`,
						unitPrice: charged,
						amount: charged,
					};
				});

			return [machine, ...accessories];
		});

/**
 * The fulfilment survey, in the shape the two slips take it.
 *
 * ! One reader, so the delivery slip and the pickup slip can never disagree
 * ! about what was agreed. Dates are rendered here rather than in the
 * ! templates: they arrive as `YYYY-MM-DD` from Postgres `DATE` columns and
 * ! must not be pushed through a timezone on the way to paper, where "delivered
 * ! Thursday" printing as Wednesday is a wasted van.
 */
export const posPrintFulfilment = (invoice: PosDocumentInvoice) => {
	const day = (value: string | Date | null | undefined): string | null => {
		if (!value) return null;

		const iso =
			typeof value === "string"
				? value
				: value.toISOString().slice(0, 10);

		return formatDateShort(`${iso.slice(0, 10)}T00:00:00`);
	};

	return {
		deliveryDate: day(invoice.delivery_date),
		pickupDate: day(invoice.pickup_date),
		deliveryInstructions: invoice.delivery_instructions ?? null,
		pickupInstructions: invoice.pickup_instructions ?? null,
		pickupCode: invoice.pickup_code ?? null,
		stepsOutside: invoice.steps_outside ?? null,
		stepsInside: invoice.steps_inside ?? null,
		entranceDoor: invoice.entrance_door ?? null,
		entranceLevel: invoice.entrance_level ?? null,
		hosesBought: invoice.hoses_bought ?? null,
		doorRemoval: invoice.door_removal ?? null,
		dryerVent: invoice.dryer_vent ?? null,
	};
};

/**
 * ! `breakupRows` carries the whole middle of the totals block, and the template
 * ! was written to prefer it (Rule E, A48, F-04). Passing the stored snapshot
 * ! means the printed invoice, the cart and the Invoice Detail modal cannot
 * ! disagree, and an invoice issued while EHF or a different tax rate applied
 * ! still prints the rows it was actually charged.
 *
 * ! The legacy `tax5` / `tax7` buckets are deliberately not set. A new document
 * ! that filled them would be inventing tax lines the sale never had.
 */
export const posPrintTotals = (
	invoice: PosDocumentInvoice,
): PrintInvoiceTotals => {
	const rows = invoice.breakup_snapshot?.rows;
	const totals = invoice.breakup_snapshot?.totals;

	/**
	 * The tenders, in the order they were taken, each with a printable label.
	 *
	 * ! Zero-amount rows are dropped. A tender row with no money against it is
	 * ! a half-filled box the operator abandoned, not a payment, and printing
	 * ! "Zelle 0.00" on an invoice invites the question of what went wrong.
	 */
	const payments = (invoice.payments ?? [])
		.map((payment) => ({
			label: posPaymentLabel(payment.payment_type),
			amount: money(payment.amount),
		}))
		.filter((payment) => payment.amount > 0);

	/**
	 * ! `undefined`, not `0`, when nothing was recorded. Zero is a real answer -
	 * ! a sale where money is owed and none has been taken - and it has to stay
	 * ! distinguishable from the legacy sales that carry no payment rows at all
	 * ! and mean "paid in full at the counter".
	 */
	const amountPaid = totals?.amount_paid;
	/**
	 * ! The snapshot first, `total_payable_amount` only as a fallback. Those two
	 * ! should always agree - checkout writes the column from the snapshot - but
	 * ! the rows printed above this figure come from the snapshot, so reading the
	 * ! total from anywhere else is how a form ends up showing a TOTAL that
	 * ! contradicts its own SUBTOTAL and SALES TAX lines. Caught by looking at a
	 * ! rendered invoice, not by a test: both numbers were individually
	 * ! plausible.
	 */
	/**
	 * ! With tenders recorded, `balance_due` is what is left AFTER them, so
	 * ! using it as this form's TOTAL printed 688.91 for a $1,688.91 sale -
	 * ! directly contradicting the SUBTOTAL, DELIVERY and SALES TAX lines
	 * ! immediately above it, which still added to the real figure. The form
	 * ! has its own DEPOSIT and BALANCE cells for the rest of that story, and
	 * ! they are filled below.
	 */
	const snapshotTotal =
		amountPaid === undefined
			? (totals?.balance_due ?? totals?.grand_total)
			: (totals?.grand_total ?? 0) - (totals?.exchange_credit ?? 0);
	const netPayable =
		snapshotTotal === undefined
			? money(invoice.total_payable_amount)
			: snapshotTotal / 100;
	// A negative net payable is unused exchange credit. The customer paid
	// nothing for this replacement, so the invoice carries zero Total/Deposit
	// and shows the remaining credit in Balance.
	const payable = Math.max(netPayable, 0);
	const balanceCredit = Math.max(-netPayable, 0);
	const rowAmount = (key: string): number => {
		const row = rows?.find((entry) => entry.key === key);

		return row ? Math.abs(row.amount) / 100 : 0;
	};

	return {
		// Superseded by `breakupRows` when the snapshot is present, and kept
		// filled for a sale that somehow has none.
		delivery: rowAmount("delivery"),
		removal: rowAmount("removal"),
		warranty: rowAmount("warranty"),
		discount: rowAmount("discount"),
		exchangeCredit: money(invoice.exchange_credit),
		subtotal: rowAmount("subtotal"),
		...(rows && rows.length > 0 ? { breakupRows: rows } : {}),
		total: payable,
		/**
		 * ! With tenders recorded, these are the two figures that say whether
		 * ! the customer still owes anything - and before this they could not.
		 * ! DEPOSIT was set to the full payable and BALANCE to zero, so an
		 * ! invoice for a sale part-paid at the till told the customer, in the
		 * ! shop's own field names, that nothing was outstanding.
		 *
		 * ! Without them, the legacy meaning is unchanged: no payment rows means
		 * ! paid in full at the counter, which is how every sale worked before
		 * ! split payments and how one still works from an older till.
		 */
		...(amountPaid === undefined
			? // A positive payable is paid in full at the till; a negative one
				// was fully covered by the exchange credit and leaves the unused
				// credit here.
				{ deposit: payable, balance: balanceCredit }
			: {
					deposit: amountPaid / 100,
					balance: (totals?.balance_due ?? 0) / 100 + balanceCredit,
				}),
		...(payments.length > 0 ? { payments } : {}),
		/**
		 * ! Every method, not the largest one. `invoice.payment_type` is a single
		 * ! column and cannot describe a split; on the document that carries the
		 * ! customer's copy of what happened, naming one of two methods is simply
		 * ! wrong. Distinct, because two cash tenders are still "Cash".
		 */
		...(payments.length > 0
			? {
					paymentMethod: payments
						.map((payment) => payment.label)
						.filter(
							(label, index, all) => all.indexOf(label) === index,
						)
						.join(" + "),
				}
			: invoice.payment_type
				? { paymentMethod: posPaymentLabel(invoice.payment_type) }
				: {}),
	};
};

/**
 * An invoice and one of its returns, as the receipt wants them.
 *
 * ! One mapper, so the Reports row and the Returns queue print the same paper.
 * ! Two mappers is how the same return comes out differently depending on which
 * ! screen printed it, and that was the whole lesson of the invoice format.
 *
 * ! The return is chosen by id where the caller knows it, and otherwise is the
 * ! LAST one on the invoice - the most recent, which is what somebody pressing
 * ! Print on a row is asking for. An invoice with one return, which is nearly
 * ! all of them, is the same either way.
 */
export const posReturnDocument = (
	invoice: PosDocumentInvoice,
	saleReturnId?: string | number | null,
): PrintReturnInput => {
	const returns = invoice.sale_returns ?? [];
	const chosen =
		(saleReturnId
			? returns.find(
					(entry) =>
						String(entry.sale_return_id ?? "") ===
						String(saleReturnId),
				)
			: undefined) ?? returns[returns.length - 1];
	const id = chosen?.sale_return_id ?? saleReturnId ?? null;
	const returned = posPrintItems(invoice, {
		onlyReversals: true,
		saleReturnId: id,
	});
	/**
	 * ! Falls back to the sale's own lines. A return recorded before reversals
	 * ! carried enough to print from would otherwise produce a receipt with an
	 * ! empty grid, which tells the customer nothing about what they handed
	 * ! over.
	 */
	const items = returned.length > 0 ? returned : posPrintItems(invoice);
	const fee = (chosen?.charges ?? []).find(
		(charge) => charge.type === "restocking_fee",
	);
	const named = (chosen?.charges ?? []).find(
		(charge) => charge.type === "custom_charge",
	);
	/**
	 * ! Read off the data, not passed in by whichever button was pressed. An
	 * ! exchange downloaded from the returns column and one printed from the
	 * ! row are the same event, so they must come out as the same document.
	 */
	const exchange =
		chosen?.refund_method === "exchange" || Boolean(invoice.is_exchanged);

	return {
		meta: posPrintMeta(invoice),
		items,
		kind: exchange ? "exchange" : "return",
		...(exchange && invoice.exchanged_invoice_id
			? { creditedTo: String(invoice.exchanged_invoice_id) }
			: {}),
		reason: chosen?.reason ?? null,
		returnDate: chosen?.refunded_at
			? formatDateShort(chosen.refunded_at)
			: chosen?.created_at
				? formatDateShort(chosen.created_at)
				: null,
		/**
		 * ! What the slip shows its working with. Without it the receipt cannot
		 * ! reconcile - `refundReconciles` needs `soldFor` and `paid` - so it
		 * ! falls back to printing the total alone and the customer sees a
		 * ! refund with no explanation of the fee or the tax withheld.
		 */
		refund: {
			soldFor: fee?.basis ?? null,
			fee: fee?.amount ?? null,
			taxWithheld: fee?.tax_withheld ?? null,
			customCharge: named?.amount ?? null,
			customChargeNote: named?.note ?? null,
			paid: chosen?.refund_amount ?? null,
			method:
				chosen?.refund_method && chosen.refund_method !== "none"
					? chosen.refund_method
					: null,
		},
	};
};
