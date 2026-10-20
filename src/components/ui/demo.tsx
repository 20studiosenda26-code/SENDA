import { LiquidMetalButton } from "./liquid-metal-button";
export default function LiquidMetalButtonDemo() {
  return (
    <div className="flex items-center gap-6 p-8 bg-[#131519] rounded-xl">
      <LiquidMetalButton label="Explorar SENDA" />
      <LiquidMetalButton viewMode="icon" label="Accion" />
    </div>
  );
}
