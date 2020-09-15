// @flow

import type { Node } from "react";
import type { UploadOptions } from "@rpldy/shared";

export type ButtonProps = {|
    className?: string,
    id?: string,
    children?: Node,
    text?: string,
    extraProps?: Object,
    onClick?: EventHandler
|};

export type UploadButtonProps = {|
    ...UploadOptions,
	...ButtonProps,
|};
