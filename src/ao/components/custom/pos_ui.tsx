"use client";

import React from "react";
import { ModalComponent } from "../mantine";
import { posColor } from "./pos_design";

/**
 * The till's own control set.
 *
 * The POS is looked at from two feet away by somebody standing up, so its
 * modals do not inherit the dashboard's Mantine chrome - they are drawn from
 * `pos_design`'s palette at the till's sizes. Those sizes were being re-typed as
 * raw hex in every component that needed them, which is how one modal ended up a
 * shade off from the screen behind it.
 *
 * ! Colours come from `posColor` through the `style` prop rather than Tailwind
 * ! arbitrary values, because a Tailwind class can only hold a literal and a
 * ! literal is the thing that drifts. Layout stays in Tailwind, where it reads
 * ! better and cannot be typed wrong in a way that matters.
 */

interface PosModalProps {
	opened: boolean;
	onClose: () => void;
	title: React.ReactNode;
	/** The line under the title - which machine, which customer, which order. */
	subtitle?: React.ReactNode;
	size?: string | number;
	children: React.ReactNode;
}

export const PosModal = (props: PosModalProps) => {
	const { opened, onClose, title, subtitle, size = "lg", children } = props;

	return (
		<ModalComponent
			opened={opened}
			onClose={onClose}
			size={size}
			radius={22}
			title={
				<div className="flex flex-col gap-[3px]">
					<span
						className="text-[21px] font-extrabold tracking-[-0.02em]"
						style={{ color: posColor.ink }}
					>
						{title}
					</span>
					{subtitle && (
						<span
							className="text-[13.5px]"
							style={{ color: posColor.muted }}
						>
							{subtitle}
						</span>
					)}
				</div>
			}
		>
			<div className="flex flex-col gap-[14px] font-manrope">
				{children}
			</div>
		</ModalComponent>
	);
};

type PosButtonVariant = "primary" | "secondary" | "danger" | "ghost";

interface PosButtonProps
	extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
	variant?: PosButtonVariant;
	/** Fills the row it sits in. Used for the one action a screen is about. */
	block?: boolean;
	leftIcon?: React.ReactNode;
	children: React.ReactNode;
}

/**
 * ! 46px tall, everywhere. The till is a touch target before it is a form, and a
 * ! 32px button is a mis-tap during a queue.
 */
export const PosButton = (props: PosButtonProps) => {
	const {
		variant = "primary",
		block = false,
		leftIcon,
		children,
		disabled,
		...rest
	} = props;

	const palette: Record<PosButtonVariant, React.CSSProperties> = {
		primary: { background: posColor.green, color: "#FFFFFF" },
		secondary: {
			background: posColor.surfaceAlt,
			color: posColor.inkSoft,
			border: `1.5px solid ${posColor.border}`,
		},
		danger: {
			background: posColor.dangerBg,
			color: posColor.danger,
			border: `1.5px solid ${posColor.dangerBorder}`,
		},
		ghost: { background: "transparent", color: posColor.green },
	};

	return (
		<button
			type="button"
			disabled={disabled}
			style={{
				...palette[variant],
				...(disabled ? { background: "#C9D3CE", color: "#FFFFFF" } : {}),
			}}
			className={`flex h-[46px] items-center justify-center gap-[7px] rounded-[12px] px-5 text-[15px] font-bold transition active:scale-[.97] disabled:cursor-not-allowed ${
				block ? "w-full" : ""
			}`}
			{...rest}
		>
			{leftIcon}
			{children}
		</button>
	);
};

/** The rounded panel every list row and grouped section sits on. */
export const PosCard = (props: {
	children: React.ReactNode;
	tone?: "plain" | "tint" | "muted";
	className?: string;
}) => {
	const { children, tone = "plain", className = "" } = props;

	const background =
		tone === "tint"
			? posColor.greenTint
			: tone === "muted"
				? posColor.surfaceMuted
				: posColor.surface;

	return (
		<div
			style={{
				background,
				border: `1.5px solid ${tone === "tint" ? posColor.outline : posColor.borderSoft}`,
			}}
			className={`rounded-[15px] p-4 ${className}`}
		>
			{children}
		</div>
	);
};

/** The small upper-case heading above a group of fields. */
export const PosSectionLabel = (props: { children: React.ReactNode }) => (
	<span
		className="text-[11.5px] font-extrabold uppercase tracking-[0.08em]"
		style={{ color: posColor.mutedLight }}
	>
		{props.children}
	</span>
);

/**
 * A labelled field in the till's shape.
 *
 * The asterisk is drawn here rather than left to each caller, so "required"
 * looks the same on every screen and a field that is required cannot be drawn
 * as though it is not.
 */
export const PosField = (props: {
	label: React.ReactNode;
	required?: boolean;
	/** Shown under the control, in red. */
	error?: string | null;
	/** Shown under the control when there is no error. */
	hint?: React.ReactNode;
	children: React.ReactNode;
	className?: string;
}) => {
	const { label, required, error, hint, children, className = "" } = props;

	return (
		<label className={`flex flex-col gap-[6px] ${className}`}>
			<span
				className="text-[11.5px] font-extrabold uppercase tracking-[0.08em]"
				style={{ color: posColor.mutedLight }}
			>
				{label}
				{required && <span style={{ color: posColor.danger }}> *</span>}
			</span>
			{children}
			{error ? (
				<span
					className="text-[12.5px]"
					style={{ color: posColor.danger }}
				>
					{error}
				</span>
			) : (
				hint && (
					<span
						className="text-[12.5px]"
						style={{ color: posColor.muted }}
					>
						{hint}
					</span>
				)
			)}
		</label>
	);
};

/** The bare input the till uses inside a `PosField`. */
/**
 * The till input's own look, exported so anything that has to render an input
 * this component cannot own - an address field with a suggestion dropdown
 * around it - still looks like every other field beside it.
 *
 * ! Exported rather than copied. A second hand-written copy of these values is
 * ! how one field ends up 46px and its neighbour 44.
 */
export const posInputStyle = (invalid?: boolean): React.CSSProperties => ({
	background: posColor.surfaceAlt,
	border: `1.5px solid ${invalid ? posColor.dangerBorder : posColor.border}`,
	color: posColor.ink,
});

// ! No `w-full`. `PosInput` never had one and the fields it sits in size it
// ! themselves; adding one here would quietly re-lay-out every form in the till.
export const posInputClass =
	"h-[46px] rounded-[12px] px-[14px] text-[15px] font-semibold outline-none transition focus:border-[#0F6B37]";

export const PosInput = (
	props: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean },
) => {
	const { invalid, ...rest } = props;

	return (
		<input
			style={posInputStyle(invalid)}
			className={posInputClass}
			{...rest}
		/>
	);
};

/**
 * The checkout footer's pair of buttons, which are taller than the 46px control
 * used elsewhere and grow to fill the row.
 *
 * ! Exported as class strings rather than components because both are laid out
 * ! by their flex weight - the primary takes twice the width of the secondary -
 * ! and a component that hides `flex-[2]` from the row it sits in is a component
 * ! that has to grow a prop for it.
 *
 * ! The hex is written out rather than interpolated from `posColor`. Tailwind
 * ! reads these classes out of the source with a regex at build time, so a class
 * ! assembled from a template literal is a class that is never generated and a
 * ! button that renders unstyled. The values are `posColor.green`,
 * ! `greenHover`, `border`, `surface`, `inkSoft` and `surfaceMuted`; keep them
 * ! in step by hand, which is the price Tailwind charges for arbitrary values.
 */
export const posFooterButton = {
	primary:
		"flex h-[52px] flex-[2] items-center justify-center gap-2 rounded-[13px] px-5 text-[16px] font-extrabold text-white transition-colors bg-[#0F6B37] hover:bg-[#0A522A] disabled:bg-[#C9D3CE]",
	secondary:
		"flex h-[52px] flex-1 items-center justify-center gap-2 rounded-[13px] border px-5 text-[14.5px] font-bold transition-colors border-[#DFE6E2] bg-[#FFFFFF] text-[#22302B] hover:bg-[#F2F5F3] disabled:opacity-50",
} as const;

/** Nothing here yet, said in the till's voice rather than Mantine's. */
export const PosEmptyState = (props: { children: React.ReactNode }) => (
	<div
		style={{
			borderColor: posColor.border,
			background: posColor.greenTint,
			color: posColor.mutedLight,
		}}
		className="rounded-[15px] border border-dashed px-4 py-10 text-center text-[14px]"
	>
		{props.children}
	</div>
);

/**
 * A choice the operator taps, drawn as a card rather than a radio.
 *
 * Used by the shipping step (§7.6), where the three options carry a line of
 * explanation each and a bare radio would leave that text unattached to
 * anything tappable.
 */
export const PosChoiceCard = (props: {
	selected: boolean;
	disabled?: boolean;
	title: React.ReactNode;
	description?: React.ReactNode;
	badge?: React.ReactNode;
	onSelect: () => void;
}) => {
	const { selected, disabled, title, description, badge, onSelect } = props;

	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onSelect}
			style={{
				background: selected ? posColor.greenSoft : posColor.surface,
				border: `1.5px solid ${selected ? posColor.green : posColor.borderSoft}`,
				opacity: disabled ? 0.55 : 1,
			}}
			className="flex w-full items-start gap-3 rounded-[15px] p-4 text-left transition disabled:cursor-not-allowed"
		>
			<span
				style={{
					borderColor: selected ? posColor.green : posColor.outline,
					background: selected ? posColor.green : "transparent",
				}}
				className="mt-[3px] grid h-[18px] w-[18px] flex-none place-items-center rounded-full border-[2px]"
			>
				{selected && (
					<span className="h-[6px] w-[6px] rounded-full bg-white" />
				)}
			</span>

			<span className="flex min-w-0 flex-1 flex-col gap-[3px]">
				<span className="flex flex-wrap items-center gap-2">
					<span
						className="text-[15px] font-bold"
						style={{ color: posColor.ink }}
					>
						{title}
					</span>
					{badge}
				</span>
				{description && (
					<span
						className="text-[13px] leading-[1.4]"
						style={{ color: posColor.muted }}
					>
						{description}
					</span>
				)}
			</span>
		</button>
	);
};

/** The green NEW pill the mockups put beside a newly added option. */
export const PosNewBadge = () => (
	<span
		style={{
			background: posColor.greenSoft,
			color: posColor.greenDeep,
			border: `1px solid ${posColor.outline}`,
		}}
		className="rounded-[7px] px-[7px] py-[2px] text-[10.5px] font-extrabold uppercase tracking-[0.06em]"
	>
		New
	</span>
);
