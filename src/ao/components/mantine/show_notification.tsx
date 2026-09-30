"use client";

import { FaCheckCircle } from "react-icons/fa";
import React from "react";
import { notifications } from "@mantine/notifications";
import { MdCancel } from "react-icons/md";
import { rem } from "@mantine/core";

const ShowNotification = (msg: string, type: string) => {
	notifications.show({
		withCloseButton: true,
		autoClose: 5000,
		message: msg,
		color: type === "success" ? "green" : "red",
		icon: type === "success" ? <FaCheckCircle style={{ width: rem(20), height: rem(20) }} /> : <MdCancel style={{ width: rem(20), height: rem(20) }} />,
		className: "my-notification-class",
	});
};

export default ShowNotification;
