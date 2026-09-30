"use client";

import { useEffect, useRef } from "react";

export interface UseBarcodeScannerOptions {
	/** Called with the decoded barcode once a scan is recognised. */
	onScan: (code: string) => void;
	/** Set false to suspend listening (e.g. while a modal owns the screen). */
	enabled?: boolean;
	/** Shorter bursts are treated as stray typing, not a scan. */
	minLength?: number;
	/** A gap longer than this between two characters restarts the buffer.
	 *  HID scanners emit a whole barcode in a few milliseconds per character;
	 *  no human types this fast, which is what keeps manual input safe. */
	maxKeyIntervalMs?: number;
	/** Identical codes seen again inside this window are ignored. Long enough
	 *  to swallow a scanner double-fire, short enough that a deliberate second
	 *  scan of the same product still counts. */
	dedupeMs?: number;
}

const isEditableTarget = (target: EventTarget | null): boolean => {
	if (!(target instanceof HTMLElement)) return false;

	const { tagName } = target;

	return (
		tagName === "INPUT" ||
		tagName === "TEXTAREA" ||
		tagName === "SELECT" ||
		target.isContentEditable
	);
};

/**
 * Recognises USB / Bluetooth barcode scanners that behave as HID keyboards -
 * the standard "keyboard wedge" mode - with no vendor SDK and no extra
 * hardware permissions.
 *
 * The scanner types the barcode and sends Enter. We watch document-level
 * keydown events, buffer fast consecutive characters, and emit a scan when
 * Enter arrives on a long-enough burst.
 *
 * Keystrokes are only observed, never swallowed, and events originating inside
 * an input / textarea / contenteditable are skipped entirely, so typing in the
 * POS search box keeps working exactly as before.
 */
export const useBarcodeScanner = (options: UseBarcodeScannerOptions) => {
	const {
		onScan,
		enabled = true,
		minLength = 4,
		maxKeyIntervalMs = 50,
		dedupeMs = 300,
	} = options;

	// ! Held in a ref so a new callback identity never re-subscribes the
	// ! listener mid-scan and truncates the buffer.
	const onScanRef = useRef(onScan);
	onScanRef.current = onScan;

	const bufferRef = useRef<string>("");
	const lastKeyAtRef = useRef<number>(0);
	const lastScanRef = useRef<{ code: string; at: number }>({
		code: "",
		at: 0,
	});

	useEffect(() => {
		if (!enabled) return undefined;

		const handleKeyDown = (event: KeyboardEvent) => {
			if (isEditableTarget(event.target)) return;

			const now = Date.now();

			if (event.key === "Enter") {
				const code = bufferRef.current;
				bufferRef.current = "";

				if (code.length < minLength) return;

				const lastScan = lastScanRef.current;
				if (lastScan.code === code && now - lastScan.at < dedupeMs) {
					return;
				}

				lastScanRef.current = { code, at: now };
				onScanRef.current(code);
				return;
			}

			// ! Modifier and navigation keys carry no payload; ignoring them
			// ! without touching the buffer keeps Shift-typed characters intact.
			if (event.key.length !== 1) return;

			if (now - lastKeyAtRef.current > maxKeyIntervalMs) {
				bufferRef.current = "";
			}

			bufferRef.current += event.key;
			lastKeyAtRef.current = now;
		};

		document.addEventListener("keydown", handleKeyDown);

		return () => {
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [enabled, minLength, maxKeyIntervalMs, dedupeMs]);
};
