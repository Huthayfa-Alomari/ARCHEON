export type StrategyKind =
  | "sma-cross"
  | "rsi-reversion"
  | "donchian-breakout"
  | "bollinger-reversion"
  | "ema-trend-pullback"
  | "atr-breakout"
  | "range-fade"
  | "ict-smc"
  | "hybrid-vote";

export type StrategySpec = {
  kind: StrategyKind;
  timeframe?: string;
  params: Record<string, number>;
  direction?: "long" | "short" | "both";
  stopLossPct?: number;
  takeProfitPct?: number;
  components?: StrategySpec[];
  voteThreshold?: number;
};

export type HypothesisStatus =
  | "proposed"
  | "testing"
  | "rejected"
  | "validated"
  | "paper"
  | "shadow"
  | "promoted"
  | "retired";

export type ResearchHypothesis = {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  claim: string;
  rationale: string;
  sourceRefs: string[];
  tags: string[];
  strategy: StrategySpec;
  status: HypothesisStatus;
  parentHypothesisId?: string;
  generation?: number;
  latestExperimentId?: string;
  evidenceScore?: number;
};

export type BacktestMetrics = {
  bars: number;
  trades: number;
  winRate: number;
  profitFactor: number;
  expectancyPct: number;
  totalReturnPct: number;
  annualizedReturnPct: number;
  sharpe: number;
  sortino: number;
  maxDrawdownPct: number;
  exposurePct: number;
  avgTradePct: number;
};

export type ValidationMetrics = {
  train: BacktestMetrics;
  test: BacktestMetrics;
  walkForwardMedianReturnPct: number;
  walkForwardPositiveFoldRate: number;
  bootstrapPositiveProbability: number;
  bootstrapReturnCi95: [number, number];
  robustnessScore: number;
  overfitGapPct?: number;
  costStressPassRate?: number;
  parameterStabilityScore?: number;
  passes: boolean;
  reasons: string[];
};

export type ResearchExperiment = {
  id: string;
  hypothesisId: string;
  createdAt: string;
  dataRef: string;
  symbol?: string;
  timeframe?: string;
  costs: { spreadBps: number; commissionBps: number; slippageBps: number };
  seed?: string;
  validation: ValidationMetrics;
  notes: string[];
};

export type PromotionStage = "validated" | "paper" | "shadow" | "promoted" | "retired";

export type PromotionRecord = {
  id: string;
  hypothesisId: string;
  from: HypothesisStatus;
  to: PromotionStage;
  createdAt: string;
  reason: string;
  actor: "jarvis" | "owner";
  evidence?: Record<string, number | string | boolean>;
};

export type CandidateBatch = {
  seed: string;
  generatedAt: string;
  candidates: ResearchHypothesis[];
};
