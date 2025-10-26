import { Button } from "@/components/ui/button";
import { AlertCircle, Mic, MicOff } from "lucide-react";
import { useState } from "react";

interface VoiceInputButtonProps {
	onStart: () => void;
	onStop: () => void;
	isListening: boolean;
	error?: string | null;
}

/**
 * Simple activation button for voice input
 * Supports both single-user and multi-user modes
 */
export function VoiceInputButton({
	onStart,
	onStop,
	isListening,
	error,
}: VoiceInputButtonProps) {
	const [isHovered, setIsHovered] = useState(false);

	const handleClick = () => {
		if (isListening) {
			onStop();
		} else {
			onStart();
		}
	};

	const hasError = error !== null && error !== undefined;

	return (
		<div className="flex flex-col items-center gap-4">
			<Button
				size="icon"
				variant={hasError ? "outline" : isListening ? "destructive" : "default"}
				className="size-32 rounded-full transition-all duration-300 hover:scale-110"
				onClick={handleClick}
				onMouseEnter={() => setIsHovered(true)}
				onMouseLeave={() => setIsHovered(false)}
				disabled={hasError}
			>
				{hasError ? (
					<AlertCircle className="size-16 text-destructive" />
				) : isListening ? (
					<MicOff className="size-16" />
				) : (
					<Mic className="size-16" />
				)}
			</Button>

			<div className="text-center">
				<p className="text-lg font-semibold">
					{hasError
						? "Permission Error"
						: isListening
							? "Listening..."
							: "Start Session"}
				</p>
				<p className="text-sm text-muted-foreground">
					{hasError
						? "See instructions below"
						: isListening
							? "Click to stop voice input"
							: "Click to begin monitoring statements"}
				</p>
			</div>

			{isListening && !hasError && (
				<div className="flex items-center gap-2">
					<div className="size-2 rounded-full bg-red-500 animate-pulse" />
					<span className="text-sm text-muted-foreground">Recording</span>
				</div>
			)}
		</div>
	);
}
