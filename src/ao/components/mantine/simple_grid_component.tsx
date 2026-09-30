"use client";

import React from "react";
import { SimpleGrid, SimpleGridProps } from "@mantine/core";

/** Props list of Mantine's SimpleGrid component - https://mantine.dev/core/simple-grid/?t=props */
export interface SimpleGridComponentProps extends SimpleGridProps {

}

/** This is the Mantine SimpleGrid component - https://mantine.dev/simple-grid/group/ */
export const SimpleGridComponent = (props: SimpleGridComponentProps) =>
	<SimpleGrid
		{...props}
	>
		{props.children}
	</SimpleGrid>;
