"use client";

import { FileInput, FileInputProps } from "@mantine/core";
import { forwardRef, useEffect } from "react";

/** Props list of Mantine's TextInput component - https://mantine.dev/core/file-input/?t=props */

export interface FileInputComponentProps extends FileInputProps {}

/** This is the Mantine FileInput component - https://mantine.dev/core/file-input/ */
export const FileInputComponent = forwardRef<
	HTMLButtonElement,
	FileInputComponentProps
>((props, ref) => {
	useEffect(() => {
		console.log(ref);
	}, [ref]);

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const { files } = e.target;
		if (files && files.length > 0) {
			if (props.multiple) {
				props.onChange?.(Array.from(files) as any); // Cast to any to handle multiple files
			} else {
				props.onChange?.(files[0] as any); // Cast to any to handle a single file
			}
		} else {
			props.onChange?.(null);
		}
	};

	return (
		<FileInput
			clearable
			accept="image/png,image/jpeg"
			label={props.label}
			placeholder={props.placeholder}
			onChange={(e) => console.log(e)}
			ref={ref}
			{...props}
		/>
	);
});
