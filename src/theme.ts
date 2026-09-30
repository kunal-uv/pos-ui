/**
 * Tokens for the till screen, ported from the Appliance Outlet POS design.
 *
 * The POS is the one screen in these apps that is looked at from two feet away
 * by somebody standing up, so it does not share a dashboard's palette or its
 * control sizes. Keeping the values in one module means a colour never gets
 * typed twice with a digit out of place.
 *
 * Every platform gets the same layout and the same control sizes; only the
 * accent family changes. That is deliberate - an operator moved between two of
 * these tills should not have to relearn where anything is, and a per-platform
 * layout is how two tills drift into two different products.
 *
 * ! Inline styles, not Tailwind. This package is dropped into admin panels that
 * ! do not share a Tailwind config, and a class name that is never generated
 * ! collapses the panel silently.
 */

export interface PosTheme {
	/** Page ground behind the panels. */
	bg: string;
	surface: string;
	/** Raised-but-quiet surface: header buttons, inputs, empty slots. */
	surfaceAlt: string;
	surfaceMuted: string;
	border: string;
	borderSoft: string;
	ink: string;
	inkSoft: string;
	muted: string;
	mutedLight: string;
	/** The brand colour everything actionable is drawn in. */
	accent: string;
	accentHover: string;
	accentDeep: string;
	accentSoft: string;
	accentTint: string;
	accentOutline: string;
	danger: string;
	dangerBorder: string;
	dangerBg: string;
	/** Shadow under the pinned checkout button, tinted to the accent. */
	accentShadow: string;
}

/**
 * The fixed measurements the layout is built from; everything else is fluid.
 * Between them they decide how many product tiles fit, which on a 1366×768 till
 * is the difference between two and eight.
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
	tileGap: 10,
} as const;

export const posTileColumns = `repeat(auto-fill,minmax(${posLayout.tileMinWidth}px,1fr))`;

/** Small numerals - serials, counts, SKUs - read better spaced evenly. */
export const monoFont = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
export const uiFont = '"Plus Jakarta Sans", Inter, system-ui, -apple-system, sans-serif';

const neutral = {
	bg: "#EDF1EF",
	surface: "#FFFFFF",
	surfaceAlt: "#F7FAF8",
	surfaceMuted: "#F2F5F3",
	border: "#DFE6E2",
	borderSoft: "#E6EBE8",
	ink: "#101614",
	inkSoft: "#22302B",
	muted: "#6B7A74",
	mutedLight: "#8A968F",
	danger: "#B4322F",
	dangerBorder: "#F0DCDC",
	dangerBg: "#FDF6F6",
};

/** Rent Buddyz: teal on a cool neutral ground (tailwind.config.ts `teal`). */
export const rentBuddyzTheme: PosTheme = {
	...neutral,
	bg: "#EEF2F1",
	surfaceAlt: "#F6FAFA",
	surfaceMuted: "#F1F5F4",
	border: "#DDE5E4",
	borderSoft: "#E5EBEA",
	ink: "#131f28",
	inkSoft: "#1c2d39",
	muted: "#6B7A78",
	mutedLight: "#8A9694",
	accent: "#299c8e",
	accentHover: "#238377",
	accentDeep: "#1e7a6e",
	accentSoft: "#e6f6f4",
	accentTint: "#f2fbfa",
	accentOutline: "#d0eeea",
	accentShadow: "rgba(41,156,142,.26)",
};

/** Appliance Outlet: the original till green. */
export const applianceOutletTheme: PosTheme = {
	...neutral,
	accent: "#0F6B37",
	accentHover: "#0A522A",
	accentDeep: "#0B4A2A",
	accentSoft: "#E7F2EB",
	accentTint: "#F3F9F5",
	accentOutline: "#B9CEC2",
	accentShadow: "rgba(15,107,55,.26)",
};

export const themeForTenant = (tenant: string): PosTheme =>
	tenant === "appliance-outlet" ? applianceOutletTheme : rentBuddyzTheme;

/**
 * Builds a theme around one accent colour, for a platform that has not been
 * given its own preset yet. Kept so `accentColor` on its own still themes the
 * whole till rather than only the buttons it used to reach.
 */
export const themeFromAccent = (accent: string, base: PosTheme = rentBuddyzTheme): PosTheme => ({
	...base,
	accent,
	accentHover: shade(accent, -0.16),
	accentDeep: shade(accent, -0.28),
	accentSoft: mix(accent, "#FFFFFF", 0.88),
	accentTint: mix(accent, "#FFFFFF", 0.95),
	accentOutline: mix(accent, "#FFFFFF", 0.7),
	accentShadow: `${rgba(accent, 0.26)}`,
});

const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

const parse = (hex: string): [number, number, number] => {
	const value = hex.replace("#", "");
	const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
	return [
		Number.parseInt(full.slice(0, 2), 16) || 0,
		Number.parseInt(full.slice(2, 4), 16) || 0,
		Number.parseInt(full.slice(4, 6), 16) || 0,
	];
};

const toHex = ([r, g, b]: [number, number, number]) =>
	`#${[r, g, b].map((c) => clamp(c).toString(16).padStart(2, "0")).join("")}`;

/** Negative `amount` darkens, positive lightens. */
function shade(hex: string, amount: number): string {
	const [r, g, b] = parse(hex);
	const target = amount < 0 ? 0 : 255;
	const ratio = Math.abs(amount);
	return toHex([
		r + (target - r) * ratio,
		g + (target - g) * ratio,
		b + (target - b) * ratio,
	]);
}

function mix(hex: string, towards: string, ratio: number): string {
	const [r, g, b] = parse(hex);
	const [r2, g2, b2] = parse(towards);
	return toHex([r + (r2 - r) * ratio, g + (g2 - g) * ratio, b + (b2 - b) * ratio]);
}

function rgba(hex: string, alpha: number): string {
	const [r, g, b] = parse(hex);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * The A-D grade chip, drawn identically wherever a grade appears.
 *
 * Both platforms speak the same four letters - Appliance Outlet stores the
 * grade directly, Rent Buddyz derives it from a unit's condition - so one map
 * serves both. A customer is shown the grade twice during one sale, and a
 * Grade B that is blue in the picker and grey on the ticket reads as two
 * different machines.
 *
 * ! Not tinted to the accent. A grade is a fact about the goods, not a brand
 * ! colour, and four shades of one hue cannot be told apart at arm's length.
 */
export const gradeChip: Record<string, { border: string; background: string; color: string }> = {
	A: { border: "#BFE3CD", background: "#E7F2EB", color: "#0B4A2A" },
	B: { border: "#C6DCEF", background: "#EAF3FA", color: "#14507D" },
	C: { border: "#EFDFBC", background: "#FBF3E3", color: "#7A5310" },
	D: { border: "#DFE6E2", background: "#F2F5F3", color: "#4A5852" },
};

export const gradeChipFallback = { border: "#E2DCEF", background: "#F2EEFA", color: "#4A3C7A" };

/** Best first, so a picker sorted by grade reads top-down. */
export const gradeRank = (grade: string | null | undefined): number =>
	({ A: 1, B: 2, C: 3, D: 4 }[String(grade ?? "")] ?? 9);

/** `1 item` / `4 items`, so the label never reads "1 items". */
export const itemsLabel = (count: number): string =>
	`${count} ${count === 1 ? "item" : "items"}`;

/** Initials for the operator avatar, at most two letters. */
export const initials = (name: string | null | undefined): string =>
	(name ?? "")
		.split(" ")
		.filter(Boolean)
		.map((part) => part[0])
		.slice(0, 2)
		.join("")
		.toUpperCase() || "?";
