"use client";

import { Tooltip, TooltipProps } from "@mantine/core";
import { mantineRadius } from "../../utils";

/** Props list of Mantine's Tooltip component - https://mantine.dev/core/tooltip/?t=props */
export interface TooltipComponentProps extends TooltipProps {
}

/** This is the Mantine Tooltip component - https://mantine.dev/core/tooltip/ */
export const TooltipComponent = (props: TooltipComponentProps) =>
	props.label ? (
		<Tooltip radius={mantineRadius} {...props}>
			<div>{props.children}</div>
		</Tooltip>
	) : (
		props.children
	);
