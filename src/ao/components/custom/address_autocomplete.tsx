"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TextInputComponent } from "../mantine";
import {
	fetchAddressSuggestions,
	resolveAddressSuggestion,
	suggestionsEnabled,
	type AddressSuggestion,
} from "../../utils/address";

/** Long enough that the operator has stopped typing, short enough to feel live. */
const DEBOUNCE_MS = 250;
const LIST_MAX_HEIGHT = 268;
const LIST_MIN_HEIGHT = 120;
const LIST_GAP = 4;
const VIEWPORT_MARGIN = 12;

interface UseSuggestionsInput {
	value: string;
	onPick: (suggestion: AddressSuggestion) => void;
	enabled?: boolean;
	disabled?: boolean;
	/**
	 * The value the field starts with before the operator touches it.
	 *
	 * ! When editing an existing record the address field is pre-filled.
	 * ! Without this, the hook treats the pre-filled text as a fresh
	 * ! keystroke, fetches suggestions immediately on mount, and
	 * ! `positionList` runs while the Mantine modal is still animating
	 * ! in - so `boxRef.current` has no usable dimensions, `listStyle`
	 * ! stays null, and the portal never renders for *any* subsequent
	 * ! typing either. Seeding `justPicked` with the initial value
	 * ! suppresses that spurious fetch; once the operator changes the
	 * ! field, the guard clears and autocomplete works normally.
	 */
	initialValue?: string;
	suggest?: (
		query: string,
		options: { signal?: AbortSignal },
	) => Promise<AddressSuggestion[]>;
	resolve?: (suggestion: AddressSuggestion) => Promise<AddressSuggestion>;
}

/**
 * Everything an address field does that is not drawing an input.
 *
 * ! A hook rather than one component, because this CRM has two input styles -
 * ! the till's raw `<input>` and the dashboard's Mantine `TextInput` - and a
 * ! component that owned the input could only ever serve one of them. Both
 * ! renderings below share this, so the debounce, the abort, the keyboard rules
 * ! and the reopen guard exist once.
 */
const useAddressSuggestions = ({
	value,
	onPick,
	enabled,
	disabled,
	initialValue,
	suggest,
	resolve,
}: UseSuggestionsInput) => {
	const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
	const [open, setOpen] = useState(false);
	const [active, setActive] = useState(-1);
	const [loading, setLoading] = useState(false);
	const [listStyle, setListStyle] = useState<React.CSSProperties | null>(
		null,
	);

	const boxRef = useRef<HTMLDivElement>(null);
	const listRef = useRef<HTMLUListElement>(null);
	/**
	 * ! The text the last accepted suggestion put in the field. Without it,
	 * ! choosing a row writes the street into `value`, which looks to the effect
	 * ! below exactly like the operator typing it - so the dropdown reopens over
	 * ! the City field the moment it closes.
	 */
	// ! Pre-seed with the initial value so a pre-filled field (edit mode)
	// ! does not auto-fetch suggestions before the operator touches it.
	const justPicked = useRef<string | null>(initialValue?.trim() || null);
	const valueRef = useRef(value);
	const choosing = useRef(false);

	valueRef.current = value;

	const on = enabled ?? suggestionsEnabled();
	const ask = suggest ?? fetchAddressSuggestions;
	const resolvePick = resolve ?? resolveAddressSuggestion;

	useEffect(() => {
		if (!on || disabled || value.trim().length < 3) {
			setSuggestions([]);
			setOpen(false);
			setActive(-1);
			setLoading(false);
			return undefined;
		}

		if (justPicked.current !== null && justPicked.current === value) {
			return undefined;
		}

		justPicked.current = null;

		const controller = new AbortController();
		const timer = setTimeout(() => {
			setLoading(true);

			ask(value, { signal: controller.signal })
				.then((rows) => {
					if (controller.signal.aborted) return;

					setSuggestions(rows);
					setActive(-1);
					setOpen(rows.length > 0);
				})
				.catch(() => {
					if (controller.signal.aborted) return;
					setSuggestions([]);
					setOpen(false);
				})
				.finally(() => {
					if (!controller.signal.aborted) setLoading(false);
				});
		}, DEBOUNCE_MS);

		return () => {
			clearTimeout(timer);
			controller.abort();
		};
		// ! `ask` is deliberately not a dependency. It is stable for the life of
		// ! the field, and including it re-runs the effect on every render of a
		// ! parent that passes an inline function - which for a debounced fetch
		// ! means a request per render rather than per pause in typing.
	}, [value, on, disabled]);

	const positionList = useCallback(() => {
		const bounds = boxRef.current?.getBoundingClientRect();

		if (!bounds) return;

		const below = window.innerHeight - bounds.bottom - VIEWPORT_MARGIN;
		const above = bounds.top - VIEWPORT_MARGIN;
		const opensAbove = below < LIST_MIN_HEIGHT && above > below;
		const available = Math.max(
			LIST_MIN_HEIGHT,
			(opensAbove ? above : below) - LIST_GAP,
		);

		setListStyle({
			position: "fixed",
			left: bounds.left,
			width: bounds.width,
			top: opensAbove ? undefined : bounds.bottom + LIST_GAP,
			bottom: opensAbove
				? window.innerHeight - bounds.top + LIST_GAP
				: undefined,
			maxHeight: Math.min(LIST_MAX_HEIGHT, available),
			zIndex: 10000,
		});
	}, []);

	/**
	 * ! Mantine's modal content scrolls with `overflow-y: auto`. An absolutely
	 * ! positioned list inside it is therefore clipped even with a large z-index.
	 * ! The list is portalled to the document body and kept anchored to the field.
	 */
	useEffect(() => {
		if (!open) {
			setListStyle(null);
			return undefined;
		}

		positionList();
		window.addEventListener("resize", positionList);
		document.addEventListener("scroll", positionList, true);

		return () => {
			window.removeEventListener("resize", positionList);
			document.removeEventListener("scroll", positionList, true);
		};
	}, [open, positionList, suggestions.length]);

	// ! A click anywhere else is a dismissal. Without this the list stays over
	// ! the City field the operator has just moved to.
	useEffect(() => {
		if (!open) return undefined;

		const away = (event: MouseEvent) => {
			const target = event.target as Node;

			if (
				!boxRef.current?.contains(target) &&
				!listRef.current?.contains(target)
			) {
				setOpen(false);
			}
		};

		document.addEventListener("mousedown", away);

		return () => document.removeEventListener("mousedown", away);
	}, [open]);

	const choose = useCallback(
		async (suggestion: AddressSuggestion) => {
			if (choosing.current) return;

			choosing.current = true;
			const valueWhenChosen = valueRef.current;
			setOpen(false);
			setSuggestions([]);
			setActive(-1);
			setLoading(true);

			try {
				const resolved = await resolvePick(suggestion);

				// Do not overwrite somebody who continued typing while Google was
				// returning the selected place's address components.
				if (valueRef.current !== valueWhenChosen) return;

				justPicked.current = resolved.street;
				onPick(resolved);
			} finally {
				choosing.current = false;
				setLoading(false);
			}
		},
		[onPick, resolvePick],
	);

	const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
		if (!open || suggestions.length === 0) return;

		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();

			const step = event.key === "ArrowDown" ? 1 : -1;

			setActive((current) => {
				const next = current + step;

				if (next < 0) return suggestions.length - 1;
				if (next >= suggestions.length) return 0;

				return next;
			});

			return;
		}

		/**
		 * ! Enter only commits a row the operator has actually moved onto. In the
		 * ! POS this field sits in a modal whose Continue button is the usual
		 * ! target of Enter, and swallowing it to apply a highlighted-by-default
		 * ! first row would put an address nobody chose on the invoice.
		 */
		if (event.key === "Enter" && active >= 0) {
			event.preventDefault();
			choose(suggestions[active]);

			return;
		}

		if (event.key === "Escape") {
			event.preventDefault();
			setOpen(false);
		}
	};

	const onFocus = () => {
		if (suggestions.length > 0) setOpen(true);
	};

	return {
		on,
		open,
		active,
		loading,
		listStyle,
		suggestions,
		boxRef,
		listRef,
		choose,
		setActive,
		onKeyDown,
		onFocus,
	};
};

interface ListProps {
	id?: string;
	listRef?: React.RefObject<HTMLUListElement>;
	suggestions: AddressSuggestion[];
	active: number;
	onHover: (index: number) => void;
	onChoose: (suggestion: AddressSuggestion) => void;
	style?: React.CSSProperties;
}

/** The dropdown, in the till's palette so it belongs to the screen it covers. */
const SuggestionList = ({
	id,
	listRef,
	suggestions,
	active,
	onHover,
	onChoose,
	style,
}: ListProps) => (
	<ul
		ref={listRef}
		id={id}
		role="listbox"
		aria-label="Address suggestions"
		style={style}
		className="m-0 list-none overflow-y-auto rounded-[12px] border border-[#DFE6E2] bg-white p-[4px] shadow-[0_10px_28px_rgba(16,22,20,.14)]"
	>
		{suggestions.map((suggestion, index) => (
			<li key={suggestion.id} role="none">
				<button
					type="button"
					role="option"
					aria-selected={index === active}
					// ! `mouseDown`, not `click`: the input's blur fires first on
					// ! a click and can unmount the row before the click lands.
					onMouseDown={(event) => {
						event.preventDefault();
						onChoose(suggestion);
					}}
					onMouseEnter={() => onHover(index)}
					className={`flex w-full flex-col items-start gap-[1px] rounded-[9px] px-[10px] py-[7px] text-left transition-colors ${
						index === active
							? "bg-[#E7F2EB]"
							: "bg-transparent hover:bg-[#F2F5F3]"
					}`}
				>
					<span className="text-[13.5px] font-bold leading-[1.25] text-[#101614]">
						{suggestion.primary}
					</span>
					{suggestion.secondary && (
						<span className="text-[11.5px] leading-[1.25] text-[#6B7A74]">
							{suggestion.secondary}
						</span>
					)}
				</button>
			</li>
		))}

		{/* ! Named, because a shop hands this list to a customer to confirm and
		    the source of the data is part of the answer when one is wrong. */}
		<li
			role="none"
			className="px-[10px] pb-[3px] pt-[5px] text-right font-plex-mono text-[9.5px] tracking-[0.04em] text-[#8A968F]"
		>
			{suggestions.some(
				(suggestion) => suggestion.provider === "google",
			) ? (
				<span translate="no">Google Maps</span>
			) : (
				"SUGGESTIONS · CANADA AND THE US"
			)}
		</li>
	</ul>
);

const SuggestionPortal = (props: ListProps & { open: boolean }) => {
	const { open, ...listProps } = props;

	if (!open || !listProps.style || typeof document === "undefined") {
		return null;
	}

	return createPortal(<SuggestionList {...listProps} />, document.body);
};

interface CommonProps extends UseSuggestionsInput {
	onChange: (value: string) => void;
	placeholder?: string;
	id?: string;
}

interface InputProps extends CommonProps {
	className?: string;
	style?: React.CSSProperties;
	"aria-label"?: string;
}

/**
 * A street field that offers the rest of the address.
 *
 * ! It is an input first and an autocomplete second. With no provider
 * ! configured it renders a plain `<input>` with the caller's own classes and
 * ! makes no network call - byte for byte the behaviour these forms had before
 * ! it existed - so the feature ships without waiting on an account, and an
 * ! outage costs the till nothing but the dropdown.
 *
 * ! Typing is never blocked or rewritten. Every keystroke goes straight to
 * ! `onChange`; suggestions arrive beside the field and are applied only when
 * ! the operator chooses one. A geocoder that guesses wrong at a counter is a
 * ! wrong address on a delivery van.
 */
export const AddressAutocomplete = ({
	value,
	onChange,
	onPick,
	className,
	style,
	placeholder,
	"aria-label": ariaLabel,
	id,
	disabled,
	initialValue,
	suggest,
	resolve,
	enabled,
}: InputProps) => {
	const list = useAddressSuggestions({
		value,
		onPick,
		enabled,
		disabled,
		initialValue,
		suggest,
		resolve,
	});

	const input = (
		<input
			id={id}
			className={className}
			style={style}
			placeholder={placeholder}
			aria-label={ariaLabel}
			disabled={disabled}
			value={value}
			onChange={(event) => onChange(event.currentTarget.value)}
			{...(list.on
				? {
						role: "combobox",
						"aria-expanded": list.open,
						"aria-autocomplete": "list" as const,
						"aria-controls": id ? `${id}-suggestions` : undefined,
						autoComplete: "off",
						onKeyDown: list.onKeyDown,
						onFocus: list.onFocus,
					}
				: {})}
		/>
	);

	if (!list.on) return input;

	return (
		<div ref={list.boxRef} className="relative">
			{input}

			{/* ! A quiet mark rather than a spinner over the field: the operator
			    is still typing, and something moving under the cursor reads as
			    the field fighting them. */}
			{list.loading && !list.open && (
				<span
					aria-hidden
					className="pointer-events-none absolute right-[14px] top-1/2 -translate-y-1/2 font-plex-mono text-[10.5px] tracking-[0.06em] text-[#8A968F]"
				>
					…
				</span>
			)}

			<SuggestionPortal
				open={list.open && list.suggestions.length > 0}
				id={id ? `${id}-suggestions` : undefined}
				listRef={list.listRef}
				suggestions={list.suggestions}
				active={list.active}
				onHover={list.setActive}
				onChoose={list.choose}
				style={list.listStyle ?? undefined}
			/>
		</div>
	);
};

interface FieldProps extends CommonProps {
	label: string;
	error?: string;
}

/**
 * The same field for the dashboard, wrapped around Mantine's `TextInput`.
 *
 * ! The Customers page is not the till and does not use the till's palette. A
 * ! raw input with POS classes in the middle of a Mantine form is the one thing
 * ! this must not do, so the input stays `TextInputComponent` and only the
 * ! dropdown is shared.
 */
export const AddressAutocompleteField = ({
	value,
	onChange,
	onPick,
	label,
	error,
	placeholder,
	id,
	disabled,
	initialValue,
	suggest,
	resolve,
	enabled,
}: FieldProps) => {
	const list = useAddressSuggestions({
		value,
		onPick,
		enabled,
		disabled,
		initialValue,
		suggest,
		resolve,
	});

	const field = (
		<TextInputComponent
			id={id}
			label={label}
			value={value}
			setValue={onChange}
			placeholder={placeholder}
			disabled={disabled}
			error={error}
			{...(list.on
				? {
						autoComplete: "off",
						onKeyDown: list.onKeyDown,
						onFocus: list.onFocus,
					}
				: {})}
		/>
	);

	if (!list.on) return field;

	return (
		<div ref={list.boxRef} className="relative">
			{field}

			<SuggestionPortal
				open={list.open && list.suggestions.length > 0}
				id={id ? `${id}-suggestions` : undefined}
				listRef={list.listRef}
				suggestions={list.suggestions}
				active={list.active}
				onHover={list.setActive}
				onChoose={list.choose}
				style={list.listStyle ?? undefined}
			/>
		</div>
	);
};

export default AddressAutocomplete;
