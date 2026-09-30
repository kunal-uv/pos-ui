"use client";

import React from "react";
import { Title, TitleProps } from "@mantine/core";
import { mantineH2Size, textColorPrimaryDark, textColorPrimaryLight, useThemeProvider } from "../../utils";

/** Props list of Mantine's Title component - https://mantine.dev/core/title/?t=props */
export interface TitleComponentProps extends TitleProps {
	bold?: boolean,
	title: string,
}

/** This is the Mantine Title component - https://mantine.dev/core/title/ */
export const TitleComponent = (props: TitleComponentProps) => {
	const { darkMode } = useThemeProvider();
	const {
		bold,
		title,
		...rest
	} = props;
	return (
		<Title
			{...rest}
			order={props.order ?? 2}
			size={props.size ?? mantineH2Size}
			fw={props.fw ? props.fw : bold ? 700 : 0}
			c={props.c ? props.c : darkMode ? textColorPrimaryDark : textColorPrimaryLight}
		>
			{title}
		</Title>
	);
};
