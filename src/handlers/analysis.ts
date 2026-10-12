/**
 * Analysis Handler
 * Manages financial analysis requests and results
 */

import type {
  CloudflareEnv,
  AnalysisRequest,
  FinancialSnapshot,
} from "../lib/types";
import { buildResponse, buildErrorResponse, parseJSON, log, generateToken } from "../lib/utils";
import { AppErrorClass } from "../lib/utils";
import AIProviderManager from "../lib/ai-providers";

/**
 * Handle analysis requests
 * POST /api/analysis/run - Start new analysis
 * GET /api/analysis/:analysisId - Get analysis result
 * POST /api/analysis/auto - Trigger automatic analysis
 */
export async function handleAnalysis(
  request: Request,
  env: CloudflareEnv
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method.toUpperCase();

    log("info", "Analysis request", {
      method,
      pathname,
    });

    if (pathname === "/api/analysis/run" && method === "POST") {
      // Start new analysis
      const body = await request.text();
      const analysisRequest = parseJSON<{
        userId: string;
        type: "spending" | "savings" | "goals" | "health" | "forecast";
        snapshot: FinancialSnapshot;
      }>(body);
      return await startAnalysis(analysisRequest, env);
    } else if (
      pathname.startsWith("/api/analysis/") &&
      pathname !== "/api/analysis/run" &&
      pathname !== "/api/analysis/auto" &&
      method === "GET"
    ) {
      // Get analysis result
      const analysisId = pathname.split("/").pop();
      return await getAnalysis(analysisId || "", env);
    } else if (pathname === "/api/analysis/auto" && method === "POST") {
      // Trigger automatic analysis
      const body = await request.text();
      const autoRequest = parseJSON<{
        userId: string;
        snapshot: FinancialSnapshot;
      }>(body);
      return await runAutoAnalysis(autoRequest, env);
    } else {
      throw new AppErrorClass(
        "INVALID_ENDPOINT",
        "Invalid analysis endpoint",
        404
      );
    }
  } catch (error) {
    log("error", "Analysis handler error", { error });
    return buildErrorResponse(error);
  }
}

/**
 * Start a new financial analysis
 */
async function startAnalysis(
  request:
    | {
        userId: string;
        type: "spending" | "savings" | "goals" | "health" | "forecast";
        snapshot: FinancialSnapshot;
      }
    | undefined,
  _env: CloudflareEnv
): Promise<Response> {
  try {
    if (!request || !request.userId || !request.type || !request.snapshot) {
      throw new AppErrorClass(
        "INVALID_REQUEST",
        "userId, type, and snapshot are required",
        400
      );
    }

    const analysisId = generateToken(16);
    const now = new Date().toISOString();

    const analysis: AnalysisRequest = {
      id: analysisId,
      userId: request.userId,
      type: request.type,
      status: "pending",
      requestedAt: now,
    };

    log("info", "Analysis started", {
      analysisId,
      userId: request.userId,
      type: request.type,
    });

    // TODO: Store analysis request in R2 or KV
    // Run analysis in background
    runAnalysisInBackground(analysisId, request, _env);

    return buildResponse(analysis, 202);
  } catch (error) {
    log("error", "Start analysis error", { error });
    throw error;
  }
}

/**
 * Get analysis result
 */
async function getAnalysis(analysisId: string, _env: CloudflareEnv): Promise<Response> {
  try {
    // TODO: Retrieve analysis from R2 or KV storage
    const analysis: AnalysisRequest = {
      id: analysisId,
      userId: "user123",
      type: "spending",
      status: "completed",
      requestedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      result:
        "Your spending analysis shows consistent patterns...",
    };

    return buildResponse(analysis, 200);
  } catch (error) {
    log("error", "Get analysis error", { analysisId, error });
    throw error;
  }
}

/**
 * Run automatic analysis on financial snapshot
 */
async function runAutoAnalysis(
  request:
    | {
        userId: string;
        snapshot: FinancialSnapshot;
      }
    | undefined,
  env: CloudflareEnv
): Promise<Response> {
  try {
    if (!request || !request.userId || !request.snapshot) {
      throw new AppErrorClass(
        "INVALID_REQUEST",
        "userId and snapshot are required",
        400
      );
    }

    const analysisId = generateToken(16);
    const aiManager = new AIProviderManager(env);

    // Build prompt from snapshot
    const prompt = aiManager.buildFinancialAnalysisPrompt(request.snapshot);

    // Run analysis with AI
    const aiResponse = await aiManager.chat(
      [
        {
          role: "user",
          content: prompt,
        },
      ],
      undefined,
      "You are a financial analyst. Provide detailed analysis of the user's financial situation."
    );

    const analysis: AnalysisRequest = {
      id: analysisId,
      userId: request.userId,
      type: "health",
      status: "completed",
      requestedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      result: aiResponse.content,
    };

    log("info", "Auto analysis completed", {
      analysisId,
      userId: request.userId,
      provider: aiResponse.provider,
      cost: aiResponse.cost,
    });

    return buildResponse(analysis, 200);
  } catch (error) {
    log("error", "Auto analysis error", { error });
    throw error;
  }
}

/**
 * Run analysis in the background
 * In a real implementation, this would be queued and processed asynchronously
 */
async function runAnalysisInBackground(
  analysisId: string,
  request: {
    userId: string;
    type: "spending" | "savings" | "goals" | "health" | "forecast";
    snapshot: FinancialSnapshot;
  },
  env: CloudflareEnv
): Promise<void> {
  try {
    const aiManager = new AIProviderManager(env);

    // Build analysis prompt based on type
    let prompt = "";
    switch (request.type) {
      case "spending":
        prompt = buildSpendingAnalysisPrompt(request.snapshot);
        break;
      case "savings":
        prompt = buildSavingsAnalysisPrompt(request.snapshot);
        break;
      case "goals":
        prompt = buildGoalsAnalysisPrompt(request.snapshot);
        break;
      case "health":
        prompt = aiManager.buildFinancialAnalysisPrompt(request.snapshot);
        break;
      case "forecast":
        prompt = buildForecastPrompt(request.snapshot);
        break;
    }

    // Run AI analysis
    await aiManager.chat([
      {
        role: "user",
        content: prompt,
      },
    ]);

    // TODO: Store result in R2/KV

    log("info", "Background analysis completed", {
      analysisId,
      userId: request.userId,
      type: request.type,
    });
  } catch (error) {
    log("error", "Background analysis error", { analysisId, error });
  }
}

/**
 * Build spending analysis prompt
 */
function buildSpendingAnalysisPrompt(snapshot: FinancialSnapshot): string {
  return `Analyze the following spending data and provide insights:

Total Monthly Expenses: $${snapshot.monthlyExpenses}
Recent Transactions:
${snapshot.recentTransactions
  .map((t) => `- ${t.date}: ${t.description} (${t.category}) $${t.amount}`)
  .join("\n")}

Provide:
1. Key spending patterns
2. Categories with highest spending
3. Comparison to average
4. Recommendations to reduce expenses`;
}

/**
 * Build savings analysis prompt
 */
function buildSavingsAnalysisPrompt(snapshot: FinancialSnapshot): string {
  return `Analyze the following savings data:

Monthly Income: $${snapshot.monthlyIncome}
Monthly Expenses: $${snapshot.monthlyExpenses}
Monthly Savings: $${snapshot.monthlyIncome - snapshot.monthlyExpenses}
Savings Rate: ${(snapshot.savingsRate * 100).toFixed(1)}%
Total Saved: $${snapshot.totalAssets - snapshot.totalLiabilities}

Provide:
1. Current savings effectiveness
2. Comparison to standard benchmarks (20% savings rate)
3. Time to reach goals at current rate
4. Ways to increase savings`;
}

/**
 * Build goals analysis prompt
 */
function buildGoalsAnalysisPrompt(snapshot: FinancialSnapshot): string {
  return `Analyze progress toward financial goals:

Goals:
${snapshot.goals
  .map(
    (g) =>
      `- ${g.name}: $${g.currentAmount} / $${g.targetAmount} (${(
        (g.currentAmount / g.targetAmount) *
        100
      ).toFixed(1)}% complete) - Due ${g.deadline}`
  )
  .join("\n")}

Monthly Savings Available: $${snapshot.monthlyIncome - snapshot.monthlyExpenses}

Provide:
1. Which goals are on track
2. Which goals need acceleration
3. Realistic timeline for each goal
4. Allocation strategy for monthly savings`;
}

/**
 * Build financial forecast prompt
 */
function buildForecastPrompt(snapshot: FinancialSnapshot): string {
  return `Create a 12-month financial forecast:

Current Net Worth: $${snapshot.netWorth}
Monthly Income: $${snapshot.monthlyIncome}
Monthly Expenses: $${snapshot.monthlyExpenses}
Monthly Savings: $${snapshot.monthlyIncome - snapshot.monthlyExpenses}

Goals:
${snapshot.goals.map((g) => `- ${g.name}: $${g.targetAmount} by ${g.deadline}`).join("\n")}

Provide:
1. Projected net worth in 3, 6, and 12 months
2. Which goals will be achieved
3. Key assumptions in forecast
4. Risk factors to monitor`;
}
