"use client";

import React from "react";
import { Divider, DividerProps } from "@mantine/core";

/** Props list of Mantine's Divider component - https://mantine.dev/core/divider/?t=props */
export interface DividerComponentProps extends DividerProps {

}

/** This is the Mantine Divider component - https://mantine.dev/core/divider/ */
export const DividerComponent = (props: DividerComponentProps) =>
	<Divider
		{...props}
	>
		{props.children}
	</Divider>;
