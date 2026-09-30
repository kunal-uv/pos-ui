/**
 * Phone numbers and postal codes on the admin side.
 *
 * ! Deliberately a copy of the rules in the API's `src/utils/phone` and
 * ! `src/utils/postal`, not a second opinion. The form validates as the operator
 * ! types so a mistake is caught at the field rather than on submit; the server
 * ! validates because a rule that only exists in a form is not a rule. If either
 * ! set changes, both change - they are short enough that sharing them across
 * ! two repositories would cost more than it saves.
 */

const DIGITS_ONLY = /[^0-9]/g;
const TEN_DIGITS = /^[0-9]{10}$/;

/** Canada excludes D, F, I, O, Q and U entirely, and W and Z as the first letter. */
const CANADIAN =
	/^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ ]?\d[ABCEGHJ-NPRSTV-Z]\d$/i;
const CANADIAN_SHAPE = /^[A-Z]\d[A-Z]\d[A-Z]\d?$/i;
const INTERNATIONAL =
	/^(?=.*\d)(?=.*[A-Z])[A-Z0-9](?:[A-Z0-9 -]{1,10}[A-Z0-9])$/i;

export const POSTAL_FORMAT_MESSAGE =
	"Enter a valid postal / ZIP code, such as A1A 1A1, 12345, 12345-6789, or 110001";

export const normalisePhone = (raw: string): string =>
	(raw ?? "").replace(DIGITS_ONLY, "");

export const isValidPhone = (raw: string): boolean =>
	TEN_DIGITS.test(normalisePhone(raw));

/**
 * `8947865838` becomes `(894) 786-5838`.
 *
 * Anything that is not ten digits comes back untouched: a legacy nine-digit
 * record should look wrong on screen, not be reformatted into looking right.
 */
export const formatPhone = (raw: string | null | undefined): string => {
	if (!raw) {
		return "";
	}

	const digits = normalisePhone(raw);

	if (!TEN_DIGITS.test(digits)) {
		return raw;
	}

	return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
};

/** Accept Canadian, US and controlled international postal codes, matching the API. */
export const isValidPostal = (raw: string): boolean => {
	const value = (raw ?? "")
		.trim()
		.toUpperCase()
		.replace(/[‐-―−]/g, "-");
	const compact = value.replace(/[\s-]+/g, "");

	if (CANADIAN_SHAPE.test(compact)) {
		return CANADIAN.test(compact);
	}

	if (/^\d+$/.test(compact)) {
		return [5, 6, 9].includes(compact.length);
	}

	return INTERNATIONAL.test(value);
};

/** Store Canadian codes uppercase with one space; preserve ZIP+4 hyphens. */
export const normalisePostal = (raw: string): string => {
	const prepared = (raw ?? "")
		.trim()
		.toUpperCase()
		.replace(/[‐-―−]/g, "-");
	const value = prepared.replace(/[\s-]+/g, "");

	if (/^\d{9}$/.test(value)) {
		return `${value.slice(0, 5)}-${value.slice(5)}`;
	}

	if (/^\d{5,6}$/.test(value)) {
		return value;
	}

	if (value.length === 6 && CANADIAN.test(value)) {
		return `${value.slice(0, 3)} ${value.slice(3)}`;
	}

	return prepared.replace(/\s+/g, " ");
};
