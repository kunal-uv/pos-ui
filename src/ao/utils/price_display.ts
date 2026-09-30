import { currencySign } from "./config";

/**
 * How an unset price is written, everywhere it appears.
 *
 * ! A model that is not offered at Grade D has no Grade D price. That is not
 * ! zero, not a hyphen and not an empty cell - each of those reads as "free",
 * ! "unknown" or "we forgot". The em dash says "not offered", and it says it the
 * ! same way in the table, the form, the detail panel and anything printed.
 * ! (S1-03.)
 */
export const EMPTY_PRICE = "—";

/**
 * A price for display. `null`, `undefined` and an empty string are all "not
 * offered"; a real 0 is a real 0 and prints as one.
 */
export const formatPrice = (
	value: string | number | null | undefined,
	options: { withSign?: boolean } = {},
): string => {
	if (value === null || value === undefined || value === "") {
		return EMPTY_PRICE;
	}

	const amount = Number(value);

	if (Number.isNaN(amount)) {
		return EMPTY_PRICE;
	}

	const formatted = amount.toFixed(2);

	return options.withSign === false
		? formatted
		: `${currencySign}${formatted}`;
};

/** True when there is no price at all, as opposed to a price of zero. */
export const isPriceUnset = (
	value: string | number | null | undefined,
): boolean => value === null || value === undefined || value === "";
