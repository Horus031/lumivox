export default function ConvergenceVisual() {
  return (
    <div
      aria-hidden="true"
      data-landing-motion="decorative"
      className="convergence-visual"
    >
      <div className="convergence-visual__halo" />
      <div className="convergence-visual__ring convergence-visual__ring--outer" />
      <div className="convergence-visual__ring convergence-visual__ring--inner" />
      <span className="convergence-visual__core" />
      <span className="convergence-visual__ray convergence-visual__ray--top" />
      <span className="convergence-visual__ray convergence-visual__ray--right" />
      <span className="convergence-visual__ray convergence-visual__ray--bottom" />
      <span className="convergence-visual__ray convergence-visual__ray--left" />
      <span className="convergence-visual__star convergence-visual__star--one" />
      <span className="convergence-visual__star convergence-visual__star--two" />
      <span className="convergence-visual__star convergence-visual__star--three" />
      <span className="convergence-visual__star convergence-visual__star--four" />
    </div>
  );
}
