// src/components/Logo.tsx
import { type SVGProps } from "react";
import LogoSvg from "@/assets/creao_logo.svg?react";

interface LogoProps extends SVGProps<SVGSVGElement> {
	width?: number;
	height?: number;
}

export default function Logo({ width = 120, height = 28, ...props }: LogoProps) {
	return <LogoSvg width={width} height={height} {...props} />;
}
