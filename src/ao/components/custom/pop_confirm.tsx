"use client";

import React, { forwardRef, useState } from "react";
import { Popover, PopoverProps, Switch } from "@mantine/core";
import { MdDeleteOutline } from "react-icons/md";
import { ActionIconComponent, ButtonComponent, GroupComponent, TextComponent } from "..";
import { mantineRadius } from "../../utils";

export enum PopConfirmType {
	// eslint-disable-next-line no-unused-vars
	switch = "switch",
	// eslint-disable-next-line no-unused-vars
	icon = "icon",
}

/** Props list of Mantine's Popover component - https://mantine.dev/core/popover/?t=props */
export interface PopConfirmComponentProps extends PopoverProps {
	onConfirm: () => void | Promise<void>,
	actionName: string,
	entityName: string,
	type?: PopConfirmType,
	isDisabled?: boolean,
	/** Keeps an existing delete button/icon while adding confirmation to it. */
	trigger?: React.ReactNode,
	/** Layout classes for the popover target when a trigger is positioned. */
	triggerClassName?: string,
	disabled?: boolean,
}

/** One confirmation popover for every destructive control in the application. */
export const PopConfirmComponent = (props: PopConfirmComponentProps) => {
	const {
		onConfirm,
		actionName,
		entityName,
		type = PopConfirmType.icon,
		isDisabled,
		trigger,
		triggerClassName,
		disabled,
		...rest
	} = props;
	const [opened, setOpened] = useState(false);
	const [loading, setLoading] = useState(false);
	const PopButton = forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>((buttonProps, ref) => (
		// eslint-disable-next-line jsx-a11y/click-events-have-key-events,jsx-a11y/no-static-element-interactions
		<div
			ref={ref}
			{...buttonProps}
			className={triggerClassName}
			onClick={(event) => {
				buttonProps.onClick?.(event);
				if (!disabled) {
					setOpened(true);
				}
			}}
		>
			{trigger ?? (type === PopConfirmType.switch ?
				<Switch
					checked={isDisabled}
				/> :
				<ActionIconComponent size="md" color="red" disabled={disabled}>
					<MdDeleteOutline size={18} />
				</ActionIconComponent>
			)}
		</div>
	));

	return (
		<Popover
			withArrow
			position="bottom"
			offset={8}
			shadow="md"
			width={250}
			opened={opened}
			onChange={setOpened}
			arrowPosition="center"
			radius={mantineRadius}
			{...rest}
		>
			<Popover.Target>
				<PopButton />
			</Popover.Target>

			<Popover.Dropdown>
				<TextComponent
					text={`Are you sure you want to ${actionName} this ${entityName}?`}
				/>
				<GroupComponent justify="end" mt={20} gap="sm">
					<ButtonComponent
						px={0}
						w={50}
						size="xs"
						color="gray"
						title="No"
						variant="subtle"
						onClick={() => setOpened(false)}
					/>
					<ButtonComponent
						px={0}
						w={50}
						size="xs"
						title="Yes"
						loading={loading}
						color={actionName === "delete" ? "red" : undefined}
						onClick={async () => {
							setLoading(true);
							try {
								await onConfirm();
								setOpened(false);
							} finally {
								setLoading(false);
							}
						}}
					/>
				</GroupComponent>
			</Popover.Dropdown>
		</Popover>
	);
};
