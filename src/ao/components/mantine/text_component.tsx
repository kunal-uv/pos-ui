"use client";

import React from "react";
import { Text, TextProps } from "@mantine/core";
import { textColorPrimaryDark, textColorPrimaryLight, useThemeProvider } from "../../utils";

/** Props list of Mantine's Text component - https://mantine.dev/core/text/?t=props */
export interface TextComponentProps extends TextProps {
	bold?: boolean,
	text: string | undefined,
}

/** This is the Mantine Text component - https://mantine.dev/core/text/ */
export const TextComponent = (props: TextComponentProps) => {
	const { darkMode } = useThemeProvider();
	const {
		bold,
		text,
		...rest
	} = props;
	return (
		<Text
			{...rest}
			fw={rest.fw ?? (bold ? 700 : 0)}
			c={rest.c ? rest.c : darkMode ? textColorPrimaryDark : textColorPrimaryLight}
		>
			{text}
		</Text>
	);
};
