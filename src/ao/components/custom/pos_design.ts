/**
 * Tokens for the till screen, taken from the Appliance Outlet POS design.
 *
 * The POS is the one screen in the app that is looked at from two feet away by
 * somebody standing up, so it does not share the dashboard's palette or its
 * control sizes. Keeping the values in one module means a colour never gets
 * typed twice with a digit out of place, and the few places that have to build
 * a style string at runtime (selected/unselected states) read the same names as
 * the markup around them.
 */
export const posColor = {
	/** Page ground behind the panels. */
	bg: "#EDF1EF",
	surface: "#FFFFFF",
	/** Raised-but-quiet surface: header buttons, inputs, empty slots. */
	surfaceAlt: "#F7FAF8",
	surfaceMuted: "#F2F5F3",
	border: "#DFE6E2",
	borderSoft: "#E6EBE8",
	ink: "#101614",
	inkSoft: "#22302B",
	muted: "#6B7A74",
	mutedLight: "#8A968F",
	/** The brand green everything actionable is drawn in. */
	green: "#0F6B37",
	greenHover: "#0A522A",
	greenDeep: "#0B4A2A",
	greenSoft: "#E7F2EB",
	greenTint: "#F3F9F5",
	danger: "#B4322F",
	dangerBorder: "#F0DCDC",
	dangerBg: "#FDF6F6",
	outline: "#B9CEC2",
} as const;

/**
 * The four fixed measurements the layout is built from; everything else is
 * fluid. Between them they decide how many product tiles fit on the screen,
 * which on a 1366×768 till is the difference between two and eight.
 *
 * ! These are read at runtime through inline styles rather than written into
 * ! Tailwind classes. `w-[${posLayout.cartWidth}px]` looks tidier and does not
 * ! work: Tailwind scans source text for whole class names, so an interpolated
 * ! one is never generated and the panel silently collapses to its content.
 *
 * ! Until now this object existed and nothing read it - every number was typed
 * ! again as a literal in each component. `pos_layout.test.ts` now fails if that
 * ! starts happening again.
 */
export const posLayout = {
	headerHeight: 56,
	categoryRailWidth: 168,
	cartWidth: 404,
	/**
	 * The narrowest a tile may be before the grid drops a column. Columns are
	 * `minmax(tileMinWidth, 1fr)`, so tiles always fill the row - this only
	 * decides how many of them there are.
	 */
	tileMinWidth: 184,
	/** Between tiles, and between the grid's own blocks. */
	tileGap: 10,
} as const;

/**
 * The product grid's columns, as a `grid-template-columns` value.
 *
 * ! Built here so the number of tiles per row is decided by `tileMinWidth`
 * ! alone, in one place, rather than by an arbitrary value buried in a class
 * ! string that Tailwind would have to be told about separately.
 */
export const posTileColumns = `repeat(auto-fill,minmax(${posLayout.tileMinWidth}px,1fr))`;

/**
 * The grade chip, A to D, drawn identically on the tile, in the serial picker
 * and on the cart line.
 *
 * ! One map, because a customer is shown the grade in three places during one
 * ! sale and a Grade B that is blue on the tile and grey in the cart reads as
 * ! two different machines. Not Mantine's `color` prop: these sit on the till's
 * ! own palette, not the dashboard's.
 */
export const posGradeChip: Record<string, string> = {
	A: "border-[#BFE3CD] bg-[#E7F2EB] text-[#0B4A2A]",
	B: "border-[#C6DCEF] bg-[#EAF3FA] text-[#14507D]",
	C: "border-[#EFDFBC] bg-[#FBF3E3] text-[#7A5310]",
	D: "border-[#DFE6E2] bg-[#F2F5F3] text-[#4A5852]",
};

/** The fallback for a grade the settings have added since this map was written. */
export const posGradeChipFallback = posGradeChip.D;

/**
 * The money field inside a cart line or a charge row: the design's pill, with
 * the CRM's own currency input (no spinner, two decimals) inside it (D28).
 */
export const posMoneyFieldStyles = {
	input: {
		textAlign: "right" as const,
		fontWeight: 700,
		fontSize: 15,
		padding: 0,
		minHeight: 0,
		height: 26,
		color: posColor.ink,
	},
};

/**
 * A short amount, written the way the till writes it everywhere.
 *
 * ! Not `formatPrice`. That one answers "not offered" with an em dash, which is
 * ! right for a catalogue row and wrong for a running total - a subtotal of
 * ! nothing is `$0.00`, not a dash.
 */
export const posMoney = (value: string | number | null | undefined): string => {
	const amount = Number(value ?? 0);

	return `$${(Number.isNaN(amount) ? 0 : amount).toLocaleString("en-US", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`;
};

/** `1 item` / `4 items`, so the label never reads "1 items". */
export const posItemsLabel = (count: number): string =>
	`${count} ${count === 1 ? "item" : "items"}`;

/** Initials for the customer avatar, at most two letters. */
export const posInitials = (name: string | undefined | null): string =>
	(name ?? "")
		.split(" ")
		.filter(Boolean)
		.map((part) => part[0])
		.slice(0, 2)
		.join("")
		.toUpperCase() || "?";
