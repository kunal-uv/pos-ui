"use client";

import React, { useEffect, useRef, useState } from "react";
import type { PosAddress } from "./types";

interface GoogleText {
	toString: () => string;
}

interface GoogleAddressComponent {
	longText?: string;
	shortText?: string;
	types?: string[];
}

interface GooglePlace {
	addressComponents?: GoogleAddressComponent[];
	fetchFields: (request: { fields: string[] }) => Promise<void>;
}

interface GooglePrediction {
	placeId: string;
	mainText?: GoogleText;
	secondaryText?: GoogleText;
	text: GoogleText;
	toPlace: () => GooglePlace;
}

interface PlacesLibrary {
	AutocompleteSessionToken: new () => unknown;
	AutocompleteSuggestion: {
		fetchAutocompleteSuggestions: (request: {
			input: string;
			includedRegionCodes: string[];
			language: string;
			region: string;
			sessionToken: unknown;
		}) => Promise<{ suggestions: Array<{ placePrediction?: GooglePrediction }> }>;
	};
}

type MapsWindow = Window & {
	google?: { maps?: { importLibrary?: (name: string) => Promise<unknown> } };
	__sharedPosGoogleMapsReady?: () => void;
};

interface Suggestion {
	id: string;
	primary: string;
	secondary: string;
	prediction: GooglePrediction;
}

const SCRIPT_ID = "shared-pos-google-maps-api";
const READY_CALLBACK = "__sharedPosGoogleMapsReady";
let placesPromise: Promise<PlacesLibrary | null> | null = null;

const importPlaces = async (): Promise<PlacesLibrary | null> => {
	const importer = (window as MapsWindow).google?.maps?.importLibrary;
	if (!importer) return null;
	try {
		return (await importer("places")) as PlacesLibrary;
	} catch {
		return null;
	}
};

const loadPlaces = (apiKey: string): Promise<PlacesLibrary | null> => {
	if (!apiKey.trim() || typeof window === "undefined") return Promise.resolve(null);
	if (placesPromise) return placesPromise;
	placesPromise = (async () => {
		const ready = await importPlaces();
		if (ready) return ready;

		return new Promise<PlacesLibrary | null>((resolve) => {
			const scope = window as MapsWindow;
			let settled = false;
			let poll: number | undefined;
			const settle = (library: PlacesLibrary | null) => {
				if (settled) return;
				settled = true;
				window.clearTimeout(timeout);
				if (poll !== undefined) window.clearTimeout(poll);
				delete scope.__sharedPosGoogleMapsReady;
				resolve(library);
			};
			const finish = async () => {
				if (settled) return;
				const library = await importPlaces();
				if (library) settle(library);
				else poll = window.setTimeout(() => void finish(), 100);
			};
			const fail = () => {
				settle(null);
			};
			const timeout = window.setTimeout(fail, 15_000);
			scope.__sharedPosGoogleMapsReady = () => void finish();
			const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
			if (existing) {
				existing.addEventListener("load", () => void finish(), { once: true });
				existing.addEventListener("error", fail, { once: true });
				void finish();
				return;
			}

			const url = new URL("https://maps.googleapis.com/maps/api/js");
			url.searchParams.set("key", apiKey.trim());
			url.searchParams.set("loading", "async");
			url.searchParams.set("libraries", "places");
			url.searchParams.set("v", "weekly");
			url.searchParams.set("language", "en");
			url.searchParams.set("callback", READY_CALLBACK);
			const script = document.createElement("script");
			script.id = SCRIPT_ID;
			script.src = url.toString();
			script.async = true;
			script.defer = true;
			script.addEventListener("load", () => void finish(), { once: true });
			script.addEventListener("error", fail, { once: true });
			document.head.append(script);
		});
	})();
	void placesPromise.then((library) => {
		// A network/configuration failure must not poison the module forever. A
		// subsequent keystroke can retry after the key or connection is corrected.
		if (!library) placesPromise = null;
	});
	return placesPromise;
};

const component = (components: GoogleAddressComponent[], type: string) =>
	components.find((entry) => entry.types?.includes(type));
const longText = (components: GoogleAddressComponent[], type: string) =>
	String(component(components, type)?.longText ?? "").trim();
const shortText = (components: GoogleAddressComponent[], type: string) =>
	String(component(components, type)?.shortText ?? "").trim();

export const GoogleAddressInput = ({
	apiKey,
	address,
	onAddressChange,
	inputStyle,
	disabled,
}: {
	apiKey?: string;
	address: PosAddress;
	onAddressChange: (address: PosAddress) => void;
	inputStyle?: React.CSSProperties;
	disabled?: boolean;
}) => {
	const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
	const [active, setActive] = useState(-1);
	const [loading, setLoading] = useState(false);
	const [providerError, setProviderError] = useState<string | null>(null);
	const token = useRef<unknown>(null);
	const box = useRef<HTMLDivElement>(null);
	const pickedValue = useRef(address.line1);
	useEffect(() => {
		if (address.id) pickedValue.current = address.line1;
	}, [address.id, address.line1]);

	useEffect(() => {
		if (!apiKey || disabled || address.line1.trim().length < 3 || pickedValue.current === address.line1) {
			setSuggestions([]);
			setProviderError(null);
			return undefined;
		}
		const controller = new AbortController();
		const timer = window.setTimeout(async () => {
			setLoading(true);
			setProviderError(null);
			try {
				const library = await loadPlaces(apiKey);
				if (controller.signal.aborted) return;
				if (!library) {
					setProviderError("Google Places could not load. Check the key and allowed website domain.");
					return;
				}
				if (!token.current) token.current = new library.AutocompleteSessionToken();
				const result = await library.AutocompleteSuggestion.fetchAutocompleteSuggestions({
					input: address.line1.trim(),
					includedRegionCodes: ["ca", "us"],
					language: "en",
					region: address.countryCode.toLowerCase() === "us" ? "us" : "ca",
					sessionToken: token.current,
				});
				if (controller.signal.aborted) return;
				setSuggestions(result.suggestions.flatMap(({ placePrediction }) => placePrediction ? [{
					id: placePrediction.placeId,
					primary: placePrediction.mainText?.toString().trim() || placePrediction.text.toString().trim(),
					secondary: placePrediction.secondaryText?.toString().trim() ?? "",
					prediction: placePrediction,
				}] : []).slice(0, 6));
				setActive(-1);
			} catch (reason) {
				if (!controller.signal.aborted) {
					setSuggestions([]);
					setProviderError("Google could not verify this address. You can still enter it manually.");
					console.warn("Google Places autocomplete failed", reason);
				}
			} finally {
				if (!controller.signal.aborted) setLoading(false);
			}
		}, 250);
		return () => {
			window.clearTimeout(timer);
			controller.abort();
		};
	}, [address.countryCode, address.line1, apiKey, disabled]);

	useEffect(() => {
		if (suggestions.length === 0) return undefined;
		const close = (event: MouseEvent) => {
			if (!box.current?.contains(event.target as Node)) setSuggestions([]);
		};
		document.addEventListener("mousedown", close);
		return () => document.removeEventListener("mousedown", close);
	}, [suggestions.length]);

	const choose = async (suggestion: Suggestion) => {
		setSuggestions([]);
		setLoading(true);
		try {
			const place = suggestion.prediction.toPlace();
			await place.fetchFields({ fields: ["addressComponents"] });
			const parts = place.addressComponents ?? [];
			const countryCode = shortText(parts, "country").toUpperCase() || address.countryCode;
			const line1 = [longText(parts, "street_number"), longText(parts, "route")]
				.filter(Boolean).join(" ") || suggestion.primary;
			const next: PosAddress = {
				...address,
				id: undefined,
				line1,
				line2: "",
				city: longText(parts, "locality") || longText(parts, "postal_town") ||
					longText(parts, "sublocality_level_1") || longText(parts, "administrative_area_level_2"),
				state: shortText(parts, "administrative_area_level_1") || longText(parts, "administrative_area_level_1"),
				postalCode: [longText(parts, "postal_code"), longText(parts, "postal_code_suffix")]
					.filter(Boolean).join("-"),
				countryCode,
				country: longText(parts, "country") || (countryCode === "US" ? "United States" : "Canada"),
			};
			pickedValue.current = line1;
			token.current = null;
			onAddressChange(next);
		} catch (reason) {
			setProviderError("Google could not resolve that address. Please choose another result or enter it manually.");
			console.warn("Google Places address lookup failed", reason);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div ref={box} style={{ position: "relative" }}>
			<input
				style={inputStyle}
				placeholder="Street address"
				value={address.line1}
				disabled={disabled}
				autoComplete="off"
				onChange={(event) => {
					pickedValue.current = "";
					const replacingSavedAddress = Boolean(address.id);
					onAddressChange({
						...address,
						id: undefined,
						line1: event.target.value,
						...(replacingSavedAddress ? { city: "", state: "", postalCode: "", line2: "" } : {}),
					});
				}}
				onKeyDown={(event) => {
					if (suggestions.length === 0) return;
					if (event.key === "ArrowDown" || event.key === "ArrowUp") {
						event.preventDefault();
						const direction = event.key === "ArrowDown" ? 1 : -1;
						setActive((current) => (current + direction + suggestions.length) % suggestions.length);
					} else if (event.key === "Enter" && active >= 0) {
						event.preventDefault();
						void choose(suggestions[active]);
					} else if (event.key === "Escape") {
						setSuggestions([]);
					}
				}}
			/>
			{loading && <span style={{ position: "absolute", right: 11, top: 13, fontSize: 10, color: "#6b7280" }}>Checking…</span>}
			{providerError && (
				<div role="status" style={{ marginTop: 4, color: "#b42318", fontSize: 10.5 }}>{providerError}</div>
			)}
			{suggestions.length > 0 && (
				<div style={{
					position: "absolute", zIndex: 1000, left: 0, right: 0, top: "calc(100% + 4px)",
					maxHeight: 230, overflowY: "auto", background: "#fff", border: "1px solid #d7dedb",
					borderRadius: 10, boxShadow: "0 12px 30px rgba(17,24,39,.15)",
				}}>
					{suggestions.map((suggestion, index) => (
						<button key={suggestion.id} type="button" onClick={() => void choose(suggestion)}
							style={{
								display: "block", width: "100%", padding: "9px 11px", border: 0,
								borderBottom: "1px solid #edf0ee", textAlign: "left", cursor: "pointer",
								background: index === active ? "#eef8f2" : "#fff", color: "#18211d",
							}}>
							<strong style={{ display: "block", fontSize: 12.5 }}>{suggestion.primary}</strong>
							<span style={{ display: "block", marginTop: 2, fontSize: 11, color: "#68736d" }}>{suggestion.secondary}</span>
						</button>
					))}
					<div style={{ padding: "6px 11px", textAlign: "right", fontSize: 10, color: "#7a847f" }}>Google Maps</div>
				</div>
			)}
		</div>
	);
};
