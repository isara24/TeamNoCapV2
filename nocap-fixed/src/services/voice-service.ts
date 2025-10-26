import { apiConfig } from "@/config/api-config";

/**
 * Voice Input/Output Service
 *
 * Handles:
 * - Voice input capture via Vapi
 * - Speech-to-text transcription
 * - Text-to-speech via FishAudio and ElevenLabs
 * - Statement type classification (declarative vs opinion/question)
 */

export type StatementType = "declarative" | "opinion" | "question" | "other";

export type PermissionStatus = "granted" | "denied" | "prompt" | "unknown";

export interface TranscriptionResult {
	text: string;
	speaker_id: string;
	timestamp: string;
	statementType: StatementType;
	confidence: number;
}

export interface PermissionError extends Error {
	permissionStatus: PermissionStatus;
}

interface VapiCall {
	id: string;
	status: "active" | "ended";
}

/**
 * Service for voice input capture and output
 */
export class VoiceService {
	private static instance: VoiceService | null = null;
	private isListening = false;
	private onTranscriptionCallback?: (result: TranscriptionResult) => void;
	private vapiCall: VapiCall | null = null;
	private webSocket: WebSocket | null = null;
	private mediaRecorder: MediaRecorder | null = null;
	private audioStream: MediaStream | null = null;

	private constructor() {}

	public static getInstance(): VoiceService {
		if (!VoiceService.instance) {
			VoiceService.instance = new VoiceService();
		}
		return VoiceService.instance;
	}

	/**
	 * Check microphone permission status
	 */
	async checkMicrophonePermission(): Promise<PermissionStatus> {
		try {
			// Check if permissions API is available
			if (!navigator.permissions) {
				return "unknown";
			}

			const result = await navigator.permissions.query({
				name: "microphone" as PermissionName,
			});

			return result.state as PermissionStatus;
		} catch (error) {
			console.warn("Could not check microphone permission:", error);
			return "unknown";
		}
	}

	/**
	 * Request microphone permission explicitly
	 */
	async requestMicrophonePermission(): Promise<boolean> {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: true,
			});
			// Stop the stream immediately, we just wanted to trigger the permission
			for (const track of stream.getTracks()) {
				track.stop();
			}
			return true;
		} catch (error) {
			const permissionError = error as PermissionError;
			console.error("Microphone permission denied:", permissionError);
			return false;
		}
	}

	/**
	 * Start voice input capture using Vapi
	 */
	async startListening(
		callback: (result: TranscriptionResult) => void,
	): Promise<void> {
		this.isListening = true;
		this.onTranscriptionCallback = callback;

		try {
			// Check if API key is configured
			if (!apiConfig.vapi.apiKey) {
				console.warn(
					"Vapi API key not configured, using browser audio fallback",
				);
				await this.startBrowserAudioCapture();
				return;
			}

			// Initialize Vapi session
			await this.initializeVapiSession();
		} catch (error) {
			console.error("Failed to start Vapi session:", error);
			// Fallback to browser audio
			await this.startBrowserAudioCapture();
		}
	}

	/**
	 * Initialize Vapi session with WebSocket connection
	 */
	private async initializeVapiSession(): Promise<void> {
		const response = await fetch(`${apiConfig.vapi.baseUrl}/v1/calls`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiConfig.vapi.apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				assistant: apiConfig.vapi.assistantId
					? { id: apiConfig.vapi.assistantId }
					: {
							model: {
								provider: "openai",
								model: "gpt-4",
								messages: [
									{
										role: "system",
										content:
											"You are a transcription assistant. Transcribe speech accurately and identify speakers.",
									},
								],
							},
							voice: {
								provider: "11labs",
								voiceId: "premade-voice-1",
							},
						},
				transcriber: {
					provider: "deepgram",
					model: "nova-2",
					language: "en",
				},
			}),
		});

		if (!response.ok) {
			throw new Error(`Vapi API error: ${response.statusText}`);
		}

		this.vapiCall = await response.json();

		// Connect to Vapi WebSocket for real-time transcription
		this.connectVapiWebSocket();

		console.log("Vapi session started:", this.vapiCall?.id);
	}

	/**
	 * Connect to Vapi WebSocket for real-time transcription events
	 */
	private connectVapiWebSocket(): void {
		if (!this.vapiCall) return;

		const wsUrl = `${apiConfig.vapi.baseUrl.replace("https://", "wss://")}/v1/calls/${this.vapiCall.id}/stream`;

		this.webSocket = new WebSocket(wsUrl);

		this.webSocket.onmessage = (event) => {
			const data = JSON.parse(event.data);

			// Handle transcription events
			if (data.type === "transcript" && data.transcript) {
				this.handleTranscription(data.transcript, data.speaker || "user-1");
			}
		};

		this.webSocket.onerror = (error) => {
			console.error("Vapi WebSocket error:", error);
		};

		this.webSocket.onclose = () => {
			console.log("Vapi WebSocket closed");
		};
	}

	/**
	 * Fallback: Use browser MediaRecorder API for audio capture
	 */
	private async startBrowserAudioCapture(): Promise<void> {
		try {
			this.audioStream = await navigator.mediaDevices.getUserMedia({
				audio: true,
			});

			this.mediaRecorder = new MediaRecorder(this.audioStream);

			this.mediaRecorder.ondataavailable = (event) => {
				// In a real implementation, send chunks to a transcription service
				console.log("Audio chunk captured:", event.data.size, "bytes");
			};

			this.mediaRecorder.start(1000); // Capture in 1-second chunks

			console.log("Browser audio capture started");
		} catch (error) {
			const permissionError = error as PermissionError;

			// Determine permission status from the actual getUserMedia error
			if (error instanceof DOMException) {
				if (error.name === "NotAllowedError") {
					permissionError.permissionStatus = "denied";
					permissionError.message =
						"Microphone access denied. Please allow microphone access in your browser settings.";
				} else if (error.name === "NotFoundError") {
					permissionError.permissionStatus = "denied";
					permissionError.message =
						"No microphone found. Please connect a microphone and try again.";
				} else if (error.name === "NotReadableError") {
					permissionError.permissionStatus = "denied";
					permissionError.message =
						"Microphone is being used by another application. Please close other apps and try again.";
				} else {
					permissionError.permissionStatus = "unknown";
					permissionError.message = `Microphone error: ${error.message}`;
				}
			} else {
				// Fallback: check permission status via API
				const status = await this.checkMicrophonePermission();
				permissionError.permissionStatus = status;
			}

			console.error("Failed to access microphone:", permissionError);
			throw permissionError;
		}
	}

	/**
	 * Process transcription and classify statement type
	 */
	private handleTranscription(text: string, speakerId: string): void {
		const statementType = this.classifyStatementType(text);

		const result: TranscriptionResult = {
			text,
			speaker_id: speakerId,
			timestamp: new Date().toISOString(),
			statementType,
			confidence: 0.9, // Vapi provides high-quality transcription
		};

		this.onTranscriptionCallback?.(result);
	}

	/**
	 * Stop voice input capture
	 */
	async stopListening(): Promise<void> {
		this.isListening = false;
		this.onTranscriptionCallback = undefined;

		// Clean up Vapi session
		if (this.vapiCall && apiConfig.vapi.apiKey) {
			try {
				await fetch(
					`${apiConfig.vapi.baseUrl}/v1/calls/${this.vapiCall.id}/end`,
					{
						method: "POST",
						headers: {
							Authorization: `Bearer ${apiConfig.vapi.apiKey}`,
						},
					},
				);
			} catch (error) {
				console.error("Failed to end Vapi call:", error);
			}
			this.vapiCall = null;
		}

		// Clean up WebSocket
		if (this.webSocket) {
			this.webSocket.close();
			this.webSocket = null;
		}

		// Clean up browser audio
		if (this.mediaRecorder) {
			this.mediaRecorder.stop();
			this.mediaRecorder = null;
		}

		if (this.audioStream) {
			for (const track of this.audioStream.getTracks()) {
				track.stop();
			}
			this.audioStream = null;
		}

		console.log("Voice input stopped");
	}

	/**
	 * Check if currently listening
	 */
	isActive(): boolean {
		return this.isListening;
	}

	/**
	 * Classify statement type
	 */
	classifyStatementType(text: string): StatementType {
		const normalized = text.trim().toLowerCase();

		// Check for question patterns
		if (
			normalized.endsWith("?") ||
			normalized.startsWith("how ") ||
			normalized.startsWith("what ") ||
			normalized.startsWith("when ") ||
			normalized.startsWith("where ") ||
			normalized.startsWith("who ") ||
			normalized.startsWith("why ") ||
			normalized.startsWith("is ") ||
			normalized.startsWith("are ") ||
			normalized.startsWith("can ") ||
			normalized.startsWith("could ") ||
			normalized.startsWith("would ") ||
			normalized.startsWith("should ")
		) {
			return "question";
		}

		// Check for opinion patterns
		if (
			normalized.includes("i think") ||
			normalized.includes("i believe") ||
			normalized.includes("in my opinion") ||
			normalized.includes("i feel") ||
			normalized.includes("i prefer") ||
			normalized.startsWith("i like") ||
			normalized.startsWith("i dislike") ||
			normalized.includes("should be") ||
			normalized.includes("ought to")
		) {
			return "opinion";
		}

		// Check for declarative patterns (factual statements)
		if (
			normalized.startsWith("the ") ||
			normalized.startsWith("it is") ||
			normalized.startsWith("this is") ||
			normalized.startsWith("that is") ||
			normalized.includes(" is ") ||
			normalized.includes(" are ") ||
			normalized.includes(" was ") ||
			normalized.includes(" were ") ||
			/\d/.test(normalized) // Contains numbers (often facts)
		) {
			return "declarative";
		}

		return "other";
	}

	/**
	 * Speak text using text-to-speech
	 */
	async speak(
		text: string,
		provider: "fishaudio" | "elevenlabs" = "fishaudio",
	): Promise<void> {
		try {
			if (provider === "fishaudio" && apiConfig.fishAudio.apiKey) {
				await this.speakWithFishAudio(text);
			} else if (provider === "elevenlabs" && apiConfig.elevenLabs.apiKey) {
				await this.speakWithElevenLabs(text);
			} else {
				// Fallback to browser speech synthesis
				await this.speakWithBrowser(text);
			}
		} catch (error) {
			console.error(`TTS error with ${provider}:`, error);
			// Fallback to browser speech
			await this.speakWithBrowser(text);
		}
	}

	/**
	 * Speak using FishAudio API
	 */
	private async speakWithFishAudio(text: string): Promise<void> {
		const response = await fetch(`${apiConfig.fishAudio.baseUrl}/v1/tts`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiConfig.fishAudio.apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				text,
				voice: "default",
				format: "mp3",
			}),
		});

		if (!response.ok) {
			throw new Error(`FishAudio API error: ${response.statusText}`);
		}

		const audioBlob = await response.blob();
		await this.playAudioBlob(audioBlob);
	}

	/**
	 * Speak using ElevenLabs API
	 */
	private async speakWithElevenLabs(text: string): Promise<void> {
		const voiceId = apiConfig.elevenLabs.voiceId || "21m00Tcm4TlvDq8ikWAM"; // Default voice

		const response = await fetch(
			`${apiConfig.elevenLabs.baseUrl}/v1/text-to-speech/${voiceId}`,
			{
				method: "POST",
				headers: {
					"xi-api-key": apiConfig.elevenLabs.apiKey,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					text,
					model_id: "eleven_monolingual_v1",
					voice_settings: {
						stability: 0.5,
						similarity_boost: 0.75,
					},
				}),
			},
		);

		if (!response.ok) {
			throw new Error(`ElevenLabs API error: ${response.statusText}`);
		}

		const audioBlob = await response.blob();
		await this.playAudioBlob(audioBlob);
	}

	/**
	 * Fallback: Use browser SpeechSynthesis API
	 */
	private async speakWithBrowser(text: string): Promise<void> {
		return new Promise((resolve) => {
			const utterance = new SpeechSynthesisUtterance(text);
			utterance.onend = () => resolve();
			utterance.onerror = () => resolve(); // Resolve even on error
			window.speechSynthesis.speak(utterance);
		});
	}

	/**
	 * Play audio blob through browser
	 */
	private async playAudioBlob(blob: Blob): Promise<void> {
		return new Promise((resolve, reject) => {
			const audio = new Audio(URL.createObjectURL(blob));
			audio.onended = () => {
				URL.revokeObjectURL(audio.src);
				resolve();
			};
			audio.onerror = (error) => {
				URL.revokeObjectURL(audio.src);
				reject(error);
			};
			audio.play().catch(reject);
		});
	}

	/**
	 * Generate subtitles for spoken text (using Groq)
	 */
	async generateSubtitles(text: string): Promise<string> {
		// In a real implementation, this would call Groq API for subtitle generation
		return text;
	}
}

export default VoiceService.getInstance();
