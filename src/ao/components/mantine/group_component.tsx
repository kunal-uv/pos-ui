"use client";

import React from "react";
import { Group, GroupProps } from "@mantine/core";

/** Props list of Mantine's Group component - https://mantine.dev/core/group/?t=props */
export interface GroupComponentProps extends GroupProps {

}

/** This is the Mantine Group component - https://mantine.dev/core/group/ */
export const GroupComponent = (props: GroupComponentProps) =>
	<Group
		{...props}
	>
		{props.children}
	</Group>;
