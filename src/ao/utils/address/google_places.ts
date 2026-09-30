import {
	ALLOWED_COUNTRIES,
	regionCode,
	type AddressSuggestion,
} from "./address_suggestion";

/** The browser key must be restricted to this app's HTTP referrers. */
export const googlePlacesApiKey = (): string =>
	String(
		process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ??
			process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY ??
			"",
	)
		.trim()
		.replace(/^(?:undefined|null)$/i, "");

export const googlePlacesEnabled = (): boolean =>
	googlePlacesApiKey().length > 0;

interface GoogleText {
	toString: () => string;
}

export interface GoogleAddressComponent {
	longText?: string;
	shortText?: string;
	types?: string[];
}

export interface GooglePlace {
	addressComponents?: GoogleAddressComponent[];
	formattedAddress?: string;
	fetchFields: (request: { fields: string[] }) => Promise<void>;
}

export interface GooglePlacePrediction {
	placeId: string;
	mainText?: GoogleText;
	secondaryText?: GoogleText;
	text: GoogleText;
	toPlace: () => GooglePlace;
}

interface GoogleAutocompleteSuggestion {
	placePrediction?: GooglePlacePrediction;
}

export interface GooglePlacesLibrary {
	AutocompleteSessionToken: new () => unknown;
	AutocompleteSuggestion: {
		fetchAutocompleteSuggestions: (request: {
			input: string;
			includedRegionCodes: string[];
			language: string;
			region: string;
			sessionToken: unknown;
		}) => Promise<{ suggestions: GoogleAutocompleteSuggestion[] }>;
	};
}

type GoogleMapsWindow = Window & {
	google?: {
		maps?: {
			importLibrary?: (name: string) => Promise<unknown>;
		};
	};
	__ncaGoogleMapsReady?: () => void;
};

const SCRIPT_ID = "nca-google-maps-javascript-api";
const READY_CALLBACK = "__ncaGoogleMapsReady";
const LOAD_TIMEOUT_MS = 15_000;
const SESSION_MAX_AGE_MS = 3 * 60 * 1000;
const SUGGESTION_LIMIT = 6;

let libraryPromise: Promise<GooglePlacesLibrary | null> | null = null;
let session: { token: unknown; startedAt: number } | null = null;
const predictions = new Map<string, GooglePlacePrediction>();

const importPlaces = async (
	scope: GoogleMapsWindow,
): Promise<GooglePlacesLibrary | null> => {
	const importer = scope.google?.maps?.importLibrary;

	if (!importer) return null;

	try {
		return (await importer("places")) as GooglePlacesLibrary;
	} catch {
		return null;
	}
};

/** Load the Places library once, however many address fields are mounted. */
export const loadGooglePlaces =
	async (): Promise<GooglePlacesLibrary | null> => {
		if (typeof window === "undefined" || !googlePlacesEnabled()) {
			return null;
		}

		const scope = window as GoogleMapsWindow;
		const available = await importPlaces(scope);

		if (available) return available;
		if (libraryPromise) return libraryPromise;

		libraryPromise = new Promise<GooglePlacesLibrary | null>((resolve) => {
			let settled = false;
			const finish = async () => {
				if (settled) return;
				settled = true;
				window.clearTimeout(timeout);
				delete scope.__ncaGoogleMapsReady;
				const library = await importPlaces(scope);

				resolve(library);
			};
			const fail = () => {
				if (settled) return;
				settled = true;
				window.clearTimeout(timeout);
				delete scope.__ncaGoogleMapsReady;
				resolve(null);
			};
			const timeout = window.setTimeout(fail, LOAD_TIMEOUT_MS);
			const existing = document.getElementById(
				SCRIPT_ID,
			) as HTMLScriptElement | null;

			scope.__ncaGoogleMapsReady = () => {
				finish().catch(fail);
			};

			if (existing) {
				existing.addEventListener("load", () => finish().catch(fail), {
					once: true,
				});
				existing.addEventListener("error", fail, { once: true });
				return;
			}

			const url = new URL("https://maps.googleapis.com/maps/api/js");

			url.searchParams.set("key", googlePlacesApiKey());
			url.searchParams.set("loading", "async");
			url.searchParams.set("libraries", "places");
			url.searchParams.set("v", "weekly");
			url.searchParams.set("language", "en");
			url.searchParams.set("region", "CA");
			url.searchParams.set("callback", READY_CALLBACK);

			const script = document.createElement("script");

			script.id = SCRIPT_ID;
			script.src = url.toString();
			script.async = true;
			script.defer = true;
			script.addEventListener("load", () => finish().catch(fail), {
				once: true,
			});
			script.addEventListener("error", fail, { once: true });
			document.head.append(script);
		});

		return libraryPromise;
	};

const sessionToken = (library: GooglePlacesLibrary): unknown => {
	if (!session || Date.now() - session.startedAt > SESSION_MAX_AGE_MS) {
		session = {
			token: new library.AutocompleteSessionToken(),
			startedAt: Date.now(),
		};
	}

	return session.token;
};

export interface GoogleSuggestionOptions {
	signal?: AbortSignal;
	/** Test seam; production always loads the real Google Places library. */
	library?: GooglePlacesLibrary;
}

/** Fetch lightweight predictions; address details are requested only on pick. */
export const fetchGoogleAddressSuggestions = async (
	query: string,
	options: GoogleSuggestionOptions = {},
): Promise<AddressSuggestion[]> => {
	const input = query.trim();

	if (input.length < 3 || options.signal?.aborted) return [];

	try {
		const library = options.library ?? (await loadGooglePlaces());

		if (!library || options.signal?.aborted) return [];

		const { suggestions } =
			await library.AutocompleteSuggestion.fetchAutocompleteSuggestions({
				input,
				includedRegionCodes: ALLOWED_COUNTRIES.map((code) =>
					code.toLowerCase(),
				),
				language: "en",
				region: "ca",
				sessionToken: sessionToken(library),
			});

		if (options.signal?.aborted) return [];
		predictions.clear();

		return suggestions
			.map<AddressSuggestion | null>(({ placePrediction }) => {
				if (!placePrediction?.placeId) return null;

				const id = `google:${placePrediction.placeId}`;
				const primary =
					placePrediction.mainText?.toString().trim() ||
					placePrediction.text.toString().trim();

				if (!primary) return null;

				predictions.set(id, placePrediction);

				return {
					id,
					primary,
					secondary:
						placePrediction.secondaryText?.toString().trim() ?? "",
					street: primary,
					city: "",
					region: "",
					postal: "",
					country: "",
					provider: "google" as const,
					placeId: placePrediction.placeId,
				};
			})
			.filter(
				(suggestion): suggestion is AddressSuggestion =>
					suggestion !== null,
			)
			.slice(0, SUGGESTION_LIMIT);
	} catch {
		return [];
	}
};

const component = (
	components: GoogleAddressComponent[],
	type: string,
): GoogleAddressComponent | undefined =>
	components.find((entry) => entry.types?.includes(type));

const longText = (components: GoogleAddressComponent[], type: string): string =>
	String(component(components, type)?.longText ?? "").trim();

const shortText = (
	components: GoogleAddressComponent[],
	type: string,
): string => String(component(components, type)?.shortText ?? "").trim();

/** Resolve one selected prediction into the fields the CRM stores. */
export const resolveGoogleAddressSuggestion = async (
	suggestion: AddressSuggestion,
): Promise<AddressSuggestion> => {
	if (suggestion.provider !== "google") return suggestion;

	const prediction = predictions.get(suggestion.id);

	if (!prediction) return suggestion;

	try {
		const place = prediction.toPlace();

		await place.fetchFields({
			fields: ["addressComponents", "formattedAddress"],
		});

		const components = place.addressComponents ?? [];
		const street =
			[
				longText(components, "street_number"),
				longText(components, "route"),
			]
				.filter(Boolean)
				.join(" ") || suggestion.street;
		const city =
			longText(components, "locality") ||
			longText(components, "postal_town") ||
			longText(components, "sublocality_level_1") ||
			longText(components, "administrative_area_level_2");
		const region =
			shortText(components, "administrative_area_level_1") ||
			regionCode(longText(components, "administrative_area_level_1"));
		const postalBase = longText(components, "postal_code");
		const postalSuffix = longText(components, "postal_code_suffix");
		const postal = [postalBase, postalSuffix].filter(Boolean).join("-");
		const country = shortText(components, "country").toUpperCase();

		return {
			...suggestion,
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
	} catch {
		return suggestion;
	} finally {
		predictions.delete(suggestion.id);
		// A details request concludes the billable autocomplete session.
		session = null;
	}
};
