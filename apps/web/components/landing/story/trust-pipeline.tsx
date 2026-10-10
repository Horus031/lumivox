import { BrainCircuit, Database, ShieldCheck, UserRound } from "lucide-react";

const stages = [
  { key: "data", icon: Database },
  { key: "model", icon: BrainCircuit },
  { key: "control", icon: UserRound },
] as const;

export default function TrustPipeline() {
  return (
    <div aria-hidden="true" className="trust-pipeline">
      {stages.map(({ key, icon: Icon }, index) => (
        <div key={key} className="trust-pipeline__stage">
          <span className="trust-pipeline__node">
            <Icon />
          </span>
          <span className="trust-pipeline__label">
            {String(index + 1).padStart(2, "0")}
          </span>
        </div>
      ))}
      <div className="trust-pipeline__line" />
      <ShieldCheck className="trust-pipeline__shield" />
    </div>
  );
}
