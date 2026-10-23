import { LiquidMetalButton } from "./liquid-metal-button";

export default function LiquidMetalButtonDemo() {
  return (
    <div className="flex flex-col items-center justify-center gap-8 p-8 bg-surface text-text rounded-xl border border-line">
      <div className="flex items-center gap-8">
        <LiquidMetalButton label="Get Started" />
        <LiquidMetalButton viewMode="icon" />
      </div>
    </div>
  );
}
