"use client";

import { TextInput, TextInputProps } from "@mantine/core";
import React from "react";
import { appColorRGBA, mantineInputVariant, mantineRadius, mantineSize } from "../../utils";

/** Props list of Mantine's TextInput component - https://mantine.dev/core/text-input/?t=props */
export interface TextInputComponentProps extends TextInputProps {
	setValue: (value: string) => void;
}

/** This is the Mantine TextInput component - https://mantine.dev/core/text-input/ */
export const TextInputComponent = (props: TextInputComponentProps) => {
	const {
		setValue,
		...rest
	} = props;

	const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		setValue(event.target.value);
	};

	return (
		<TextInput
			onChange={handleChange}
			{...rest}
			size={rest.size ?? mantineSize}
			c={rest.c}
			color={rest.color ?? appColorRGBA}
			radius={rest.radius ?? mantineRadius}
			variant={rest.variant ?? mantineInputVariant}
		/>
	);
};
