"use client";

import React, { useEffect, useState } from "react";
import {
	ButtonComponent,
	GroupComponent,
	ModalComponent,
	StackComponent,
	TextComponent,
} from "..";

interface Props {
	isOpen: boolean;
	onClose: () => void;
	onConfirm: () => void | Promise<void>;
}

/** A full-screen confirmation for an intentional user logout. */
export const LogoutConfirmDialog = ({
	isOpen,
	onClose,
	onConfirm,
}: Props) => {
	const [loggingOut, setLoggingOut] = useState(false);

	useEffect(() => {
		if (!isOpen) {
			setLoggingOut(false);
		}
	}, [isOpen]);

	const confirm = async () => {
		setLoggingOut(true);

		try {
			await onConfirm();
		} finally {
			setLoggingOut(false);
		}
	};

	return (
		<ModalComponent
			opened={isOpen}
			onClose={loggingOut ? () => undefined : onClose}
			closeOnClickOutside={!loggingOut}
			closeOnEscape={!loggingOut}
			size="sm"
			title="Log out?"
		>
			<StackComponent gap="md">
				<TextComponent text="Are you sure you want to log out of your account?" />
				<GroupComponent justify="end">
					<ButtonComponent
						variant="default"
						title="Cancel"
						disabled={loggingOut}
						onClick={onClose}
					/>
					<ButtonComponent
						color="red"
						title="Log out"
						loading={loggingOut}
						onClick={confirm}
					/>
				</GroupComponent>
			</StackComponent>
		</ModalComponent>
	);
};

export default LogoutConfirmDialog;
