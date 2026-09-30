import {
	toSuggestions,
	type AddressSuggestion,
	type GeocoderResponse,
} from "./address_suggestion";
import {
	fetchGoogleAddressSuggestions,
	googlePlacesEnabled,
	resolveGoogleAddressSuggestion,
} from "./google_places";

/**
 * Where address suggestions come from.
 *
 * ! Configured, not hard coded, and **off unless set**. With no value the
 * ! address fields behave exactly as they did before this existed - a plain
 * ! input, no network call, no dropdown - so the feature can ship ahead of any
 * ! decision about a provider or an account.
 *
 * ! The default in `.env.example` is Photon, an open geocoder over OpenStreetMap
 * ! that needs no key, no signup and no card, which is what the client asked
 * ! for (2026-08-27). Its public instance is fair-use: read the current terms
 * ! before relying on it for a shop's daily traffic, and self-host if they have
 * ! tightened. Swapping to a keyed provider - Geoapify, LocationIQ, Google - is
 * ! this URL plus a different mapper, and touches no form.
 */
export const suggestUrl = (): string =>
	String(process.env.NEXT_PUBLIC_ADDRESS_SUGGEST_URL ?? "").trim();

/** Whether the address fields should offer suggestions at all. */
export const suggestionsEnabled = (): boolean =>
	googlePlacesEnabled() || suggestUrl().length > 0;

/**
 * Bias suggestions toward the shop rather than toward the whole continent.
 *
 * ! Surrey, BC. A search for "Main" from a till in Surrey should not open with
 * ! Main Street, Houston. Optional on the provider's side - a provider that
 * ! ignores these parameters simply returns unbiased results rather than
 * ! failing - which is why they are sent unconditionally.
 */
const NEAR = { lat: "49.1913", lon: "-122.8490" } as const;

/** How many rows the dropdown will ever show. */
export const SUGGESTION_LIMIT = 6;

export interface SuggestOptions {
	/** Aborts the request when the operator types again. */
	signal?: AbortSignal;
	/** Overridden in tests; defaults to the configured provider. */
	url?: string;
	/** Overridden in tests. */
	fetcher?: typeof fetch;
}

/**
 * Ask the provider what the operator might mean.
 *
 * ! Never throws and never rejects. This runs on a keystroke inside a modal
 * ! that is mid-sale; a geocoder that is slow, rate limited, unreachable or
 * ! answering with HTML must cost the operator nothing but the absence of a
 * ! dropdown. Every failure path returns an empty list.
 *
 * ! An abort is not a failure - it is the normal outcome of typing the next
 * ! character - so it returns empty just the same, and the caller ignores the
 * ! result of a request it has already replaced.
 */
export const fetchAddressSuggestions = async (
	query: string,
	options: SuggestOptions = {},
): Promise<AddressSuggestion[]> => {
	const trimmed = query.trim();

	if (trimmed.length < 3) return [];

	// An explicit URL is the provider seam used by tests and self-hosted Photon.
	// Otherwise Google is primary, with the configured URL as a quiet fallback.
	if (options.url === undefined && googlePlacesEnabled()) {
		const google = await fetchGoogleAddressSuggestions(trimmed, {
			...(options.signal ? { signal: options.signal } : {}),
		});

		if (google.length > 0 || options.signal?.aborted) return google;
	}

	const base = options.url ?? suggestUrl();

	if (!base) return [];

	const request = options.fetcher ?? fetch;

	try {
		const url = new URL(base);

		url.searchParams.set("q", trimmed);
		url.searchParams.set("limit", String(SUGGESTION_LIMIT));
		url.searchParams.set("lang", "en");
		url.searchParams.set("lat", NEAR.lat);
		url.searchParams.set("lon", NEAR.lon);

		const response = await request(url.toString(), {
			headers: { Accept: "application/json" },
			...(options.signal ? { signal: options.signal } : {}),
		});

		if (!response.ok) return [];

		const body = (await response.json()) as GeocoderResponse;

		return toSuggestions(body);
	} catch {
		// ! Swallowed on purpose, including an abort. See the note above.
		return [];
	}
};

/** Details are already present for Photon; Google resolves them on selection. */
export const resolveAddressSuggestion = (
	suggestion: AddressSuggestion,
): Promise<AddressSuggestion> => resolveGoogleAddressSuggestion(suggestion);
