"use client";

import { ActionIcon, ActionIconProps } from "@mantine/core";
import React from "react";
import Link from "next/link";
import {
	appColorRGBA,
	mantineActionIconSize,
	mantineActionIconVariant,
	mantineButtonHeight,
	mantineRadius,
} from "../../utils";

/** Props list of Mantine's Action Icon component - https://mantine.dev/core/action-icon/?t=props */
export interface ActionIconComponentProps extends ActionIconProps {
	href?: string
	onClick?: React.MouseEventHandler<HTMLButtonElement>,
}

/** This is the Mantine Action Icon component - https://mantine.dev/core/action-icon/ */
export const ActionIconComponent = (props: ActionIconComponentProps) =>
// @ts-ignore
	<ActionIcon
		{...props}
		h={props.h ?? mantineButtonHeight}
		w={props.h ?? mantineButtonHeight}
		color={props.color ?? appColorRGBA}
		radius={props.radius ?? mantineRadius}
		size={props.size ?? mantineActionIconSize}
		variant={props.variant ?? mantineActionIconVariant}
		{...(props.href ? {
				component: Link,
				href: props.href,
			} :
			{ onClick: props.onClick })}
	>
		{props.children}
	</ActionIcon>;
