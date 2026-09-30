"use client";

import React from "react";
import { Loader, LoaderProps } from "@mantine/core";
import { mantineButtonLoaderSize } from "../../utils";

/** Props list of Mantine's Loader component - https://mantine.dev/core/loader/?t=props */
export interface LoaderComponentProps extends LoaderProps {

}

/** This is the Mantine Loader component - https://mantine.dev/core/loader/ */
export const LoaderComponent = (props: LoaderComponentProps) =>
	<Loader
		{...props}
		size={props.size ?? mantineButtonLoaderSize}
	>
		{props.children}
	</Loader>;
