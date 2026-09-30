"use client";

import { Button, ButtonProps } from "@mantine/core";
import React from "react";
import Link from "next/link";
import { appColorRGBA, mantineButtonHeight, mantineButtonSize, mantineRadius } from "../../utils";

/** Props list of Mantine's Button component - https://mantine.dev/core/button/?t=props */
export interface ButtonComponentProps extends ButtonProps {
	href?: string;
	title?: string;
	titleClassName?: string;
	onClick?: React.MouseEventHandler<HTMLButtonElement>;
}

/** This is the Mantine Button component - https://mantine.dev/core/button/ */
export const ButtonComponent = (props: ButtonComponentProps) => {
	const {
		href,
		title,
		titleClassName,
		onClick,
		...rest
	} = props;
	return (
		// @ts-ignore
		<Button
			{...rest}
			px={rest.px ?? 20}
			h={rest.h ?? mantineButtonHeight}
			size={rest.size ?? mantineButtonSize}
			color={rest.color ?? appColorRGBA}
			radius={rest.radius ?? mantineRadius}
			{...(href ? {
					component: Link,
					href,
				} :
				{ onClick })}
		>
			{rest.children ? (
				rest.children
			) : title ? (
				<p className={titleClassName}>{title}</p>
			) : (
				""
			)}
		</Button>
	);
};
