"use client";

import React from "react";
import { Modal, ModalProps } from "@mantine/core";
import { mantineRadius } from "../../utils";

/** Props list of Mantine's Modal component - https://mantine.dev/core/modal/?t=props */
export interface ModalComponentProps extends ModalProps {
}

/** This is the Mantine Modal component - https://mantine.dev/core/modal/ */
export const ModalComponent = (props: ModalComponentProps) => (
	<Modal centered radius={mantineRadius} {...props}>
		{props.children}
	</Modal>
);
