"use client";

import { Select, SelectProps } from "@mantine/core";
import React from "react";
import { mantineInputVariant, mantineRadius, mantineSize } from "../../utils";
import { ComboBoxProps, GroupedComboBoxProps } from "../../types";

/** Props list of Mantine's Select component - https://mantine.dev/core/select/?t=props */
export interface SelectComponentProps extends SelectProps {
	setOption?: (option: ComboBoxProps) => void;
	setValue?: (val: string) => void;
	data: ComboBoxProps[] | GroupedComboBoxProps[]; // or GroupedComboBoxProps[] if your data is grouped
}

/** This is the Mantine Select component - https://mantine.dev/core/select/ */
export const SelectComponent = (props: SelectComponentProps) => {
	const { setOption, setValue, comboboxProps, ...rest } = props;

	const handleChange = (value: string | null) => {
		const option = (props.data as Array<ComboBoxProps>).find(
			(entry) => entry.value === value,
		);

		if (option) {
			if (setValue) {
				setValue(option.value);
			}
			if (setOption) {
				setOption(option);
			}
		}
	};

	return (
		<Select
			onChange={handleChange}
			{...rest}
			size={rest.size ?? mantineSize}
			radius={rest.radius ?? mantineRadius}
			variant={rest.variant ?? mantineInputVariant}
			allowDeselect={rest.allowDeselect ?? false}
			// ! D32. The POS payment dropdown opened over the cart panel and the
			// ! first cart line and was read as covering them rather than sitting
			// ! above them. This is the same treatment D4 needed on the sort
			// ! popover, and it is set here rather than at that one call site so
			// ! every Select in the CRM gets it:
			// !
			// ! - the background is stated, not inherited, so nothing shows
			// !   through the options. It is the CSS variable rather than
			// !   `getSurfaceColor` on purpose: a Select appears on nearly every
			// !   screen, and reading the theme through Recoil here would put a
			// !   subscription on all of them to pick a colour Mantine already
			// !   knows;
			// ! - a shadow, so the panel reads as a layer;
			// ! - rendered in a portal at the same z-index the sort popover uses,
			// !   so the two can never stack against each other;
			// ! - `flip` and `shift`, so a field near the bottom of a panel opens
			// !   upwards instead of off the edge.
			comboboxProps={{
				withinPortal: true,
				shadow: "md",
				zIndex: 400,
				middlewares: { flip: true, shift: true },
				...comboboxProps,
			}}
			styles={{
				dropdown: {
					backgroundColor: "var(--mantine-color-body)",
					opacity: 1,
				},
				...rest.styles,
			}}
		>
			{rest.children}
		</Select>
	);
};
