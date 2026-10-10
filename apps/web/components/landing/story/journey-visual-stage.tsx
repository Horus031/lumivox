export function JourneyIllustration({ step }: { step: string }) {
  if (step === "focus") {
    return (
      <div className="journey-focus__ring">
        <div className="journey-focus__inner">
          <span className="journey-focus__time">25:00</span>
          <span className="journey-focus__label">FOCUS</span>
        </div>
      </div>
    );
  }

  if (step === "patterns") {
    return (
      <svg viewBox="0 0 560 320" className="journey-patterns__graph">
        <path
          className="journey-patterns__gridline"
          d="M40 80 H520 M40 160 H520 M40 240 H520"
        />
        <path
          className="journey-patterns__signal"
          d="M40 245 C80 245 100 240 130 215 S180 215 220 180 S275 180 310 140 S375 150 410 105 S475 110 520 65"
        />
        <circle className="journey-patterns__point" cx="130" cy="215" r="4" />
        <circle className="journey-patterns__point" cx="310" cy="140" r="4" />
        <circle className="journey-patterns__point" cx="520" cy="65" r="5" />
      </svg>
    );
  }

  return (
    <div className="journey-capture">
      <svg viewBox="0 0 560 320" className="journey-capture__connections">
        <path d="M280 64 V128 M280 128 H112 V224 M280 128 V224 M280 128 H448 V224" />
      </svg>
      <div className="journey-capture__goal">
        <span className="journey-node-dot" />
      </div>
      <div className="journey-capture__task journey-capture__task--one" />
      <div className="journey-capture__task journey-capture__task--two" />
      <div className="journey-capture__task journey-capture__task--three" />
    </div>
  );
}

export default function JourneyVisualStage() {
  return (
    <div
      aria-hidden="true"
      className="journey-stage learning-journey__stage-desktop"
    >
      <div className="journey-stage__field" />

      <div className="journey-stage__progress">
        <span />
      </div>

      <div className="journey-scene journey-scene--capture">
        <JourneyIllustration step="capture" />
      </div>

      <div className="journey-scene journey-scene--focus">
        <JourneyIllustration step="focus" />
      </div>

      <div className="journey-scene journey-scene--patterns">
        <JourneyIllustration step="patterns" />
      </div>
    </div>
  );
}
