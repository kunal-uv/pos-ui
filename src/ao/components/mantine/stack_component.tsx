"use client";

import React from "react";
import { Stack, StackProps } from "@mantine/core";

/** Props list of Mantine's Stack component - https://mantine.dev/core/stack/?t=props */
export interface StackComponentProps extends StackProps {

}

/** This is the Mantine Stack component - https://mantine.dev/core/stack/ */
export const StackComponent = (props: StackComponentProps) =>
	<Stack
		{...props}
	>
		{props.children}
	</Stack>;
