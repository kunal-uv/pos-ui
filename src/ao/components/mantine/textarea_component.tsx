"use client";

import { Textarea, TextareaProps } from "@mantine/core";
import React from "react";
import { appColorRGBA, mantineInputVariant, mantineRadius, mantineSize } from "../../utils";

/** Props list of Mantine's Textarea component - https://mantine.dev/core/textarea/?t=props */
export interface TextAreaInputComponentProps extends TextareaProps {
	setValue: (value: string) => void;
}

/** This is the Mantine Textarea component - https://mantine.dev/core/textarea/ */
export const TextAreaInputComponent = (props: TextAreaInputComponentProps) => {
	const {
		setValue,
		...rest
	} = props;

	const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
		setValue(event.currentTarget.value);
	};

	return (
		<Textarea
			onChange={handleChange}
			{...rest}
			size={rest.size ?? mantineSize}
			color={rest.color ?? appColorRGBA}
			radius={rest.radius ?? mantineRadius}
			variant={rest.variant ?? mantineInputVariant}
		/>
	);
};
