"use client";

import React from "react";
import { Checkbox, CheckboxProps } from "@mantine/core";

export interface CheckboxComponentProps extends CheckboxProps {
	onChecked: (val: boolean) => void;
	label?: React.ReactNode;
}

export const CheckboxComponent = ({ onChecked, label, ...rest }: CheckboxComponentProps) => (
	<Checkbox
		{...rest}
		label={label}
		onChange={(e) => onChecked(e.target.checked)}
	/>
);
