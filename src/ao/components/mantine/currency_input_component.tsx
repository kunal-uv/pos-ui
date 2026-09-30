"use client";

import { NumberInput, NumberInputProps } from "@mantine/core";
import React from "react";
import {
	appColorRGBA,
	currencySign,
	mantineInputVariant,
	mantineRadius,
	mantineSize,
} from "../../utils";

/** Props list of Mantine's NumberInput component - https://mantine.dev/core/number-input/?t=props */
export interface CurrencyInputComponentProps extends NumberInputProps {
	setValue: (value: string | number) => void;
}

/**
 * A money field (defect D28).
 *
 * ! **No spinner.** `NumberInputComponent` is Mantine's `NumberInput` with its
 * ! increment and decrement controls left on, which is right for a quantity and
 * ! wrong for a price: the up arrow next to Delivery Charges moves the figure by
 * ! a whole dollar on a mis-click, and nothing on screen says by how much. Every
 * ! money field in the CRM goes through this component instead.
 *
 * ! **Two decimals, always.** `fixedDecimalScale` is what stops `199.99` being
 * ! displayed and re-read as `199` - the display half of defect D31. The stored
 * ! value is still whatever the caller holds; this only fixes what is rendered
 * ! and what a keystroke can produce.
 *
 * The currency prefix defaults to the configured sign, so a caller states the
 * label and the value and nothing else.
 */
export const CurrencyInputComponent = (props: CurrencyInputComponentProps) => {
	const { setValue, ...rest } = props;

	const handleChange = (value: string | number) => {
		setValue(value);
	};

	return (
		<NumberInput
			onChange={handleChange}
			{...rest}
			hideControls
			// A price is never negative unless the caller says otherwise - the
			// exchange balance on the legacy till is the one place it can be.
			//
			// ! `min` alone is not enough. Mantine clamps to `min` on blur, so a
			// ! typed `-5` still reaches `setValue` as -5 and is only corrected
			// ! when focus leaves - and anything reading the value in between
			// ! reads a negative price. `allowNegative={false}` refuses the
			// ! minus sign at the keystroke instead.
			allowNegative={rest.allowNegative ?? false}
			min={rest.min ?? (rest.allowNegative ? undefined : 0)}
			decimalScale={rest.decimalScale ?? 2}
			fixedDecimalScale={rest.fixedDecimalScale ?? true}
			thousandSeparator={rest.thousandSeparator ?? ","}
			prefix={rest.prefix ?? `${currencySign} `}
			size={rest.size ?? mantineSize}
			color={rest.color ?? appColorRGBA}
			radius={rest.radius ?? mantineRadius}
			variant={rest.variant ?? mantineInputVariant}
		/>
	);
};
