/**
 * Shim for AO's `constants/business_config`.
 *
 * The types are AO's, verbatim. The data is not: `business` is whatever brand
 * the host registered through `setPosPlatform`, so the till and every printed
 * document carry the host's name, address, logo and terms.
 */

import { onPosPlatform } from "../platform";

export interface BusinessAddress {
	line1: string;
	line2?: string;
	city: string;
	region: string;
	postalCode: string;
}

/** Service charges printed on the delivery slip and quoted in the legal text. */
export interface BusinessFees {
	/** Charged when fridge doors or the house door must come off for a delivery. */
	doorRemoval: number;
	/** Washer hoses supplied at delivery. */
	hoses: number;
	dryerVent: number;
	/** Hauling away / relocating a fridge or a stacked pair. */
	fridgeRemoval: number;
	/** Hauling away / relocating anything else. */
	otherRemoval: number;
}

/** Every block of fixed wording printed on the documents. */
export interface BusinessDocumentText {
	/** Sales terms shown beside the invoice totals. One entry per paragraph. */
	salesTerms: string[];
	/** Warranty small print, last row inside the invoice border. */
	warranty: string;
	/** Storage notice printed under the invoice. */
	storage: string;
	/** Delivery permission paragraph on the invoice. */
	invoiceDeliveryTerms: string;
	/** Delivery permission paragraph on the delivery slip (covers removals too). */
	deliverySlipTerms: string;
	/** Line the customer signs against on the invoice. */
	invoiceAgreement: string;
	/** Line the customer signs against on the pickup slip. */
	pickupAgreement: string;
	deliveryAcknowledgement: string;
	pickupAcknowledgement: string;
	/** Removal / relocation pricing line on the delivery slip. */
	removals: string;
	thankYou: string;
}

export interface BusinessConfig {
	/** Shown in the browser tab and the app shell. */
	appName: string;
	/** Full registered name, printed in the document header and legal text. */
	legalName: string;
	/** Abbreviation used inside the legal text, e.g. "NCAI". */
	shortName: string;
	/** Strapline under the wordmark. */
	tagline: string;
	/** Public path of the square logo mark - app chrome, document headers - or
	 *  an empty string to show no mark. */
	logoPath: string;
	/**
	 * Public path of the browser-tab icon. Kept apart from `logoPath` because
	 * the mark is transparent line art: it vanishes against a dark tab strip,
	 * and a favicon takes no CSS, so the white plate has to be baked into the
	 * file. Empty falls back to `logoPath`.
	 */
	faviconPath: string;
	/** Public path of the full lockup (mark, wordmark and strapline in one
	 *  image). Used where the whole brand block is wanted, such as the top of a
	 *  price sticker. Empty means "compose it from `logoPath` and the text". */
	wordmarkPath: string;
	address: BusinessAddress;
	phone: string;
	fax?: string;
	website: string;
	email: string;
	/** Tax-registration label printed with the number, e.g. "GST#" or "UBI #". */
	registrationLabel: string;
	registrationNumber: string;
	currencySign: string;
	/**
	 * Labels for the two tax buckets the checkout API returns. Set a label to
	 * `null` when the business does not levy that tax — the row is then skipped.
	 */
	taxLabels: { tax5: string | null; tax7: string | null };
	/**
	 * Rates shown beside those labels. The printed invoice gives the rate its
	 * own narrow cell, so it is kept apart from the label.
	 */
	taxRates: { tax5: string | null; tax7: string | null };
	/** Item rows always drawn, so a short order still fills the printed form. */
	minItemRows: number;
	fees: BusinessFees;
	text: BusinessDocumentText;
}

/** The host's brand. A live binding: reassigned when the platform registers. */
export let business: BusinessConfig = undefined as unknown as BusinessConfig;

onPosPlatform((platform) => {
	business = platform.business;
});

/** `13533 78 Avenue, Surrey, BC V3W 0A8` */
export const businessAddressLine = (address: BusinessAddress = business.address): string =>
	[address.line1, address.line2, `${address.city}, ${address.region} ${address.postalCode}`]
		.filter(Boolean)
		.join(", ");
