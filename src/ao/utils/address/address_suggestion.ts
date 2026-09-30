/**
 * Turning a geocoder's answer into the four fields this CRM stores.
 *
 * ! Everything here is pure. The provider's JSON goes in, `AddressSuggestion`
 * ! comes out, and no part of it fetches, times or renders anything - which is
 * ! what makes it testable against recorded fixtures rather than against a live
 * ! third-party service that may be slow, rate limited or down.
 *
 * ! The transport is `fetch_address_suggestions.ts`, deliberately kept to a
 * ! dozen lines, so swapping provider - or putting one behind `nca-crm-api` if
 * ! CORS ever refuses the browser call - touches one file and none of the forms.
 */

/** What a form needs to fill itself in. Every field is already trimmed. */
export interface AddressSuggestion {
	/** Stable within one result set; used as the React key and for dedupe. */
	id: string;
	/** The bold line in the dropdown: "40 Oak Avenue". */
	primary: string;
	/** The quiet line under it: "Surrey, BC V3W 0A8". */
	secondary: string;
	/** Address Line 1 / the Street field. */
	street: string;
	city: string;
	/** Two-letter code - "BC", "WA" - because that is what the forms hold. */
	region: string;
	/** Postal code or ZIP. May be empty; not every point has one. */
	postal: string;
	/** "CA" or "US". Kept so a caller can refuse a country later. */
	country: string;
	/** Present only while a Google prediction is waiting to be resolved. */
	provider?: "google";
	/** Google Place ID. It is safe to retain and avoids parsing display text. */
	placeId?: string;
}

/**
 * Provinces, territories and states by full name.
 *
 * ! The forms hold "BC", not "British Columbia" - every address already on file
 * ! is written that way, and a State column with both spellings in it is a
 * ! column nothing can group on. Geocoders answer with the full name, so this
 * ! is the translation.
 *
 * ! Keyed lower case and matched lower case: providers disagree about casing
 * ! and about "Québec" vs "Quebec", which is why both spellings are here.
 */
const REGION_CODES: Record<string, string> = {
	// Canada
	alberta: "AB",
	"british columbia": "BC",
	"colombie-britannique": "BC",
	manitoba: "MB",
	"new brunswick": "NB",
	"nouveau-brunswick": "NB",
	"newfoundland and labrador": "NL",
	"northwest territories": "NT",
	"nova scotia": "NS",
	"nouvelle-écosse": "NS",
	nunavut: "NU",
	ontario: "ON",
	"prince edward island": "PE",
	quebec: "QC",
	québec: "QC",
	saskatchewan: "SK",
	yukon: "YT",
	// United States
	alabama: "AL",
	alaska: "AK",
	arizona: "AZ",
	arkansas: "AR",
	california: "CA",
	colorado: "CO",
	connecticut: "CT",
	delaware: "DE",
	"district of columbia": "DC",
	florida: "FL",
	georgia: "GA",
	hawaii: "HI",
	idaho: "ID",
	illinois: "IL",
	indiana: "IN",
	iowa: "IA",
	kansas: "KS",
	kentucky: "KY",
	louisiana: "LA",
	maine: "ME",
	maryland: "MD",
	massachusetts: "MA",
	michigan: "MI",
	minnesota: "MN",
	mississippi: "MS",
	missouri: "MO",
	montana: "MT",
	nebraska: "NE",
	nevada: "NV",
	"new hampshire": "NH",
	"new jersey": "NJ",
	"new mexico": "NM",
	"new york": "NY",
	"north carolina": "NC",
	"north dakota": "ND",
	ohio: "OH",
	oklahoma: "OK",
	oregon: "OR",
	pennsylvania: "PA",
	"rhode island": "RI",
	"south carolina": "SC",
	"south dakota": "SD",
	tennessee: "TN",
	texas: "TX",
	utah: "UT",
	vermont: "VT",
	virginia: "VA",
	washington: "WA",
	"west virginia": "WV",
	wisconsin: "WI",
	wyoming: "WY",
};

/**
 * The two-letter code for a province or state.
 *
 * ! An unknown name is returned as it stands rather than blanked. A geocoder
 * ! that starts answering with a region this map has never seen should put
 * ! something in the field the operator can correct, not nothing.
 */
export const regionCode = (name: string | null | undefined): string => {
	const trimmed = String(name ?? "").trim();

	if (!trimmed) return "";
	// Already a code, whatever case it arrived in.
	if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();

	return REGION_CODES[trimmed.toLowerCase()] ?? trimmed;
};

/** The countries this shop delivers to (asked 2026-08-27). */
export const ALLOWED_COUNTRIES = ["CA", "US"] as const;

/**
 * One feature as Photon returns it, of which this reads a part.
 *
 * ! Every field optional, including ones the docs describe as always present.
 * ! This is a third-party payload arriving in a till mid-sale: a missing key
 * ! must narrow the suggestion, never throw inside a keystroke handler.
 */
export interface GeocoderFeature {
	properties?: {
		osm_id?: number | string;
		osm_type?: string;
		name?: string;
		housenumber?: string;
		street?: string;
		postcode?: string;
		city?: string;
		district?: string;
		county?: string;
		state?: string;
		country?: string;
		countrycode?: string;
		type?: string;
	} | null;
}

export interface GeocoderResponse {
	features?: GeocoderFeature[] | null;
}

const text = (value: unknown): string => String(value ?? "").trim();

/**
 * The street line: number and street when there is one, otherwise the place's
 * own name.
 *
 * ! "40 Oak Avenue" beats "Oak Avenue" by exactly the part a driver needs. A
 * ! point with no street at all - a named building, a park - keeps its name so
 * ! the suggestion is still recognisable rather than blank.
 */
const streetLine = (properties: NonNullable<GeocoderFeature["properties"]>) => {
	const street = text(properties.street);
	const number = text(properties.housenumber);
	const composed = [number, street].filter(Boolean).join(" ");

	return composed || text(properties.name);
};

/**
 * ! `city` is missing on plenty of rural and suburban points, where the
 * ! settlement is carried as a district or a county instead. Falling through
 * ! them fills the field with something true far more often than it leaves it
 * ! empty, and the operator can still correct it.
 */
const cityLine = (properties: NonNullable<GeocoderFeature["properties"]>) =>
	text(properties.city) ||
	text(properties.district) ||
	text(properties.county);

/**
 * Every usable suggestion in a provider response, best first.
 *
 * ! Three filters, in this order, and each earns its place:
 * !
 * !   1. Countries the shop does not deliver to. A search for "Main Street"
 * !      otherwise answers with four continents.
 * !   2. Points with no street line at all, which cannot fill an address field.
 * !   3. Duplicates. Providers routinely return the same address as several OSM
 * !      objects - a node and a way for one building - and a dropdown offering
 * !      "40 Oak Avenue" three times looks broken.
 *
 * ! Then addresses with a house number sort above those without, because a
 * ! street on its own is the weaker answer and the list is short.
 */
export const toSuggestions = (
	response: GeocoderResponse | null | undefined,
	allowed: readonly string[] = ALLOWED_COUNTRIES,
): AddressSuggestion[] => {
	const countries = new Set(allowed.map((code) => code.toUpperCase()));
	const seen = new Set<string>();
	const numbered: AddressSuggestion[] = [];
	const rest: AddressSuggestion[] = [];

	(response?.features ?? []).forEach((feature, index) => {
		const properties = feature?.properties;

		if (!properties) return;

		const country = text(properties.countrycode).toUpperCase();

		if (countries.size > 0 && !countries.has(country)) return;

		const street = streetLine(properties);

		if (!street) return;

		const city = cityLine(properties);
		const region = regionCode(properties.state);
		const postal = text(properties.postcode);

		const key = [street, city, region, postal].join("|").toLowerCase();

		if (seen.has(key)) return;

		seen.add(key);

		const suggestion: AddressSuggestion = {
			// ! The composed key, not `osm_id`: two providers may not have one,
			// ! and it is only ever a React key and a dedupe handle.
			id: `${index}:${key}`,
			primary: street,
			secondary: [city, [region, postal].filter(Boolean).join(" ")]
				.filter(Boolean)
				.join(", "),
			street,
			city,
			region,
			postal,
			country,
		};

		if (text(properties.housenumber)) {
			numbered.push(suggestion);
		} else {
			rest.push(suggestion);
		}
	});

	return [...numbered, ...rest];
};
