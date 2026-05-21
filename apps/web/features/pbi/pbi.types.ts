export type PbiActionableInsight = {
  type: "positive" | "warning" | "neutral";
  title: string;
  body: string;
  linked_component: string;
};

export type PbiComponentExplanation = {
  key: string;
  title: string;
  score: number;
  level: "low" | "moderate" | "strong";
  message: string;
};

export type PbiExplanationPayload = {
  pbi_band: string;
  overall_summary: string;
  standard_pbi: number;
  personalized_pbi: number;
  strongest_component: string;
  weakest_component: string;
  component_explanations: PbiComponentExplanation[];
  actionable_insights: PbiActionableInsight[];
  explanation_version: string;
};