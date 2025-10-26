import { apiConfig } from "@/config/api-config";

/**
 * Multi-Agent Truth Verification Service
 *
 * Orchestrates verification across multiple AI agents:
 * - Claude (Anthropic)
 * - Fetch.ai (Agentverse and ASI:ONE)
 * - Gemini (Google)
 * - Bright Data
 *
 * All agents route through Lava Gateway for consensus verification
 */

export interface VerificationAgent {
	name: string;
	verdict: "true" | "false" | "inconclusive";
	confidence: number;
	reasoning?: string;
}

export interface VerificationResult {
	statementId: string;
	isFalse: boolean;
	consensus: "verified_true" | "verified_false" | "inconclusive";
	correctInformation?: string;
	agents: VerificationAgent[];
	lavaGatewayConsensus: {
		verdict: "true" | "false" | "inconclusive";
		consensusScore: number;
	};
}

/**
 * Service for verifying declarative statements using multiple AI agents
 */
export class VerificationService {
	private static instance: VerificationService | null = null;

	private constructor() {}

	public static getInstance(): VerificationService {
		if (!VerificationService.instance) {
			VerificationService.instance = new VerificationService();
		}
		return VerificationService.instance;
	}

	/**
	 * Verify a declarative statement across all agents
	 */
	async verifyStatement(statement: string): Promise<VerificationResult> {
		const statementId = crypto.randomUUID();

		// Run all agent verifications in parallel
		const [claudeResult, fetchAIResult, geminiResult, brightDataResult] =
			await Promise.all([
				this.verifyWithClaude(statement),
				this.verifyWithFetchAI(statement),
				this.verifyWithGemini(statement),
				this.verifyWithBrightData(statement),
			]);

		const agents: VerificationAgent[] = [
			claudeResult,
			fetchAIResult,
			geminiResult,
			brightDataResult,
		];

		// Get consensus from Lava Gateway
		const lavaGatewayConsensus = await this.getLavaGatewayConsensus(agents);

		// Determine final verdict
		const isFalse = lavaGatewayConsensus.verdict === "false";
		const consensus =
			lavaGatewayConsensus.verdict === "true"
				? "verified_true"
				: lavaGatewayConsensus.verdict === "false"
					? "verified_false"
					: "inconclusive";

		// If statement is false, generate correct information
		const correctInformation = isFalse
			? await this.generateCorrectInformation(statement, agents)
			: undefined;

		return {
			statementId,
			isFalse,
			consensus,
			correctInformation,
			agents,
			lavaGatewayConsensus,
		};
	}

	/**
	 * Verify statement using Claude (Anthropic)
	 */
	private async verifyWithClaude(
		statement: string,
	): Promise<VerificationAgent> {
		if (!apiConfig.anthropic.apiKey) {
			return {
				name: "Claude (Anthropic)",
				verdict: "inconclusive",
				confidence: 0,
				reasoning: "API key not configured",
			};
		}

		try {
			const response = await fetch(
				`${apiConfig.anthropic.baseUrl}/v1/messages`,
				{
					method: "POST",
					headers: {
						"x-api-key": apiConfig.anthropic.apiKey,
						"anthropic-version": "2023-06-01",
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						model: apiConfig.anthropic.model,
						max_tokens: 1024,
						messages: [
							{
								role: "user",
								content: `You are a fact-checking expert. Analyze this statement and determine if it is factually TRUE or FALSE. If you cannot determine with confidence, respond INCONCLUSIVE.

Statement: "${statement}"

Respond in JSON format:
{
  "verdict": "true" | "false" | "inconclusive",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`,
							},
						],
					}),
				},
			);

			if (!response.ok) {
				throw new Error(`Claude API error: ${response.statusText}`);
			}

			const data = await response.json();
			const result = JSON.parse(data.content[0].text);

			return {
				name: "Claude (Anthropic)",
				verdict: result.verdict,
				confidence: result.confidence,
				reasoning: result.reasoning,
			};
		} catch (error) {
			console.error("Claude verification error:", error);
			return {
				name: "Claude (Anthropic)",
				verdict: "inconclusive",
				confidence: 0,
				reasoning: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
			};
		}
	}

	/**
	 * Verify statement using Fetch.ai (Agentverse and ASI:ONE)
	 */
	private async verifyWithFetchAI(
		statement: string,
	): Promise<VerificationAgent> {
		if (!apiConfig.fetchAI.apiKey) {
			return {
				name: "Fetch.ai",
				verdict: "inconclusive",
				confidence: 0,
				reasoning: "API key not configured",
			};
		}

		try {
			// Try Agentverse first
			const response = await fetch(
				`${apiConfig.fetchAI.agentverseUrl}/v1/verify`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${apiConfig.fetchAI.apiKey}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						statement,
						task: "fact_verification",
					}),
				},
			);

			if (!response.ok) {
				throw new Error(`Fetch.ai API error: ${response.statusText}`);
			}

			const data = await response.json();

			return {
				name: "Fetch.ai",
				verdict: data.verdict || "inconclusive",
				confidence: data.confidence || 0.8,
				reasoning: data.reasoning || "Fetch.ai agent verification",
			};
		} catch (error) {
			console.error("Fetch.ai verification error:", error);
			return {
				name: "Fetch.ai",
				verdict: "inconclusive",
				confidence: 0,
				reasoning: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
			};
		}
	}

	/**
	 * Verify statement using Gemini (Google)
	 */
	private async verifyWithGemini(
		statement: string,
	): Promise<VerificationAgent> {
		if (!apiConfig.gemini.apiKey) {
			return {
				name: "Gemini (Google)",
				verdict: "inconclusive",
				confidence: 0,
				reasoning: "API key not configured",
			};
		}

		try {
			const response = await fetch(
				`${apiConfig.gemini.baseUrl}/v1beta/models/${apiConfig.gemini.model}:generateContent?key=${apiConfig.gemini.apiKey}`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						contents: [
							{
								parts: [
									{
										text: `You are a fact-checking expert. Analyze this statement and determine if it is factually TRUE or FALSE. If you cannot determine with confidence, respond INCONCLUSIVE.

Statement: "${statement}"

Respond in JSON format:
{
  "verdict": "true" | "false" | "inconclusive",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`,
									},
								],
							},
						],
						generationConfig: {
							temperature: 0.1,
							maxOutputTokens: 1024,
						},
					}),
				},
			);

			if (!response.ok) {
				throw new Error(`Gemini API error: ${response.statusText}`);
			}

			const data = await response.json();
			const text = data.candidates[0].content.parts[0].text;
			const result = JSON.parse(text);

			return {
				name: "Gemini (Google)",
				verdict: result.verdict,
				confidence: result.confidence,
				reasoning: result.reasoning,
			};
		} catch (error) {
			console.error("Gemini verification error:", error);
			return {
				name: "Gemini (Google)",
				verdict: "inconclusive",
				confidence: 0,
				reasoning: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
			};
		}
	}

	/**
	 * Verify statement using Bright Data
	 */
	private async verifyWithBrightData(
		statement: string,
	): Promise<VerificationAgent> {
		if (!apiConfig.brightData.apiKey) {
			return {
				name: "Bright Data",
				verdict: "inconclusive",
				confidence: 0,
				reasoning: "API key not configured",
			};
		}

		try {
			// Use Bright Data's web scraping to search for factual information
			const response = await fetch(
				`${apiConfig.brightData.baseUrl}/v1/search`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${apiConfig.brightData.apiKey}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						query: statement,
						num_results: 5,
					}),
				},
			);

			if (!response.ok) {
				throw new Error(`Bright Data API error: ${response.statusText}`);
			}

			const data = await response.json();

			// Analyze search results to determine verdict
			// This is a simplified implementation
			const hasResults = data.results && data.results.length > 0;

			return {
				name: "Bright Data",
				verdict: hasResults ? "true" : "inconclusive",
				confidence: hasResults ? 0.75 : 0.3,
				reasoning: hasResults
					? "Found supporting web sources"
					: "No conclusive web sources found",
			};
		} catch (error) {
			console.error("Bright Data verification error:", error);
			return {
				name: "Bright Data",
				verdict: "inconclusive",
				confidence: 0,
				reasoning: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
			};
		}
	}

	/**
	 * Get consensus verdict from Lava Gateway
	 */
	private async getLavaGatewayConsensus(agents: VerificationAgent[]): Promise<{
		verdict: "true" | "false" | "inconclusive";
		consensusScore: number;
	}> {
		if (!apiConfig.lavaGateway.apiKey) {
			// Fallback to local consensus logic
			return this.calculateLocalConsensus(agents);
		}

		try {
			const response = await fetch(
				`${apiConfig.lavaGateway.baseUrl}/v1/consensus`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${apiConfig.lavaGateway.apiKey}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						agents: agents.map((a) => ({
							name: a.name,
							verdict: a.verdict,
							confidence: a.confidence,
						})),
					}),
				},
			);

			if (!response.ok) {
				throw new Error(`Lava Gateway error: ${response.statusText}`);
			}

			const data = await response.json();

			return {
				verdict: data.verdict,
				consensusScore: data.score,
			};
		} catch (error) {
			console.error("Lava Gateway consensus error:", error);
			// Fallback to local consensus
			return this.calculateLocalConsensus(agents);
		}
	}

	/**
	 * Calculate consensus locally (fallback when Lava Gateway unavailable)
	 */
	private calculateLocalConsensus(agents: VerificationAgent[]): {
		verdict: "true" | "false" | "inconclusive";
		consensusScore: number;
	} {
		const falseCount = agents.filter((a) => a.verdict === "false").length;
		const trueCount = agents.filter((a) => a.verdict === "true").length;
		const inconclusiveCount = agents.filter(
			(a) => a.verdict === "inconclusive",
		).length;

		const totalVotes = agents.length;
		const consensusThreshold = 0.6; // 60% agreement required

		let verdict: "true" | "false" | "inconclusive" = "inconclusive";
		let consensusScore = 0;

		if (falseCount / totalVotes >= consensusThreshold) {
			verdict = "false";
			consensusScore = falseCount / totalVotes;
		} else if (trueCount / totalVotes >= consensusThreshold) {
			verdict = "true";
			consensusScore = trueCount / totalVotes;
		} else {
			consensusScore =
				Math.max(falseCount, trueCount, inconclusiveCount) / totalVotes;
		}

		return { verdict, consensusScore };
	}

	/**
	 * Generate correct information for false statements
	 */
	private async generateCorrectInformation(
		falseStatement: string,
		agents: VerificationAgent[],
	): Promise<string> {
		// Aggregate reasoning from agents that marked it as false
		const falseReasonings = agents
			.filter((a) => a.verdict === "false")
			.map((a) => a.reasoning)
			.filter((r): r is string => !!r);

		if (falseReasonings.length === 0) {
			return "The statement has been determined to be false, but specific corrections are unavailable.";
		}

		// Use Claude to synthesize a correction if available
		if (apiConfig.anthropic.apiKey) {
			try {
				const response = await fetch(
					`${apiConfig.anthropic.baseUrl}/v1/messages`,
					{
						method: "POST",
						headers: {
							"x-api-key": apiConfig.anthropic.apiKey,
							"anthropic-version": "2023-06-01",
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							model: apiConfig.anthropic.model,
							max_tokens: 512,
							messages: [
								{
									role: "user",
									content: `This false statement was made: "${falseStatement}"

Multiple fact-checkers provided these explanations:
${falseReasonings.map((r, i) => `${i + 1}. ${r}`).join("\n")}

Provide a clear, concise correction (2-3 sentences max) that states the accurate information.`,
								},
							],
						}),
					},
				);

				if (response.ok) {
					const data = await response.json();
					return data.content[0].text;
				}
			} catch (error) {
				console.error("Error generating correction:", error);
			}
		}

		// Fallback: return the first reasoning
		return `Correction: ${falseReasonings[0]}`;
	}
}

export default VerificationService.getInstance();
