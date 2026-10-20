import { Sparkles, Loader2 } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
export interface LiquidMetalButtonProps { label?: string; onClick?: () => void; viewMode?: "text" | "icon"; icon?: React.ReactNode; disabled?: boolean; loading?: boolean; className?: string; type?: "button" | "submit" | "reset"; }
export function LiquidMetalButton({ label = "Get Started", onClick, viewMode = "text", icon, disabled = false, loading = false, className = "", type = "button" }: LiquidMetalButtonProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const isIcon = viewMode === "icon";
  return (
    <button type={type} disabled={disabled || loading} onClick={onClick} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => { setIsHovered(false); setIsPressed(false); }} onMouseDown={() => setIsPressed(true)} onMouseUp={() => setIsPressed(false)} aria-label={label} className={`relative inline-flex items-center justify-center rounded-full p-[2px] transition-all duration-300 select-none ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${isPressed ? "scale-95" : isHovered ? "scale-[1.02]" : "scale-100"} ${className}`} style={{ minWidth: isIcon ? 46 : 148, height: 46, boxShadow: isHovered ? "0 0 20px rgba(53,214,228,0.32)" : "0 6px 16px rgba(0,0,0,0.4)" }}>
      <span className="absolute inset-0 rounded-full overflow-hidden"><span className="absolute -inset-[100%] animate-spin" style={{ animationDuration: isHovered ? "3s" : "6s", background: "conic-gradient(from 0deg, #131519, #35D6E4, #ffffff, #1A1D22, #22B4C2, #6FE7C8, #131519, #35D6E4)" }} /></span>
      <span className="relative z-10 flex items-center justify-center gap-2 w-full h-full rounded-full bg-gradient-to-b from-[#1A1D22] to-[#131519] px-5 text-[13.5px] font-semibold text-slate-100" style={{ fontFamily: "Space Grotesk, sans-serif" }}>{loading ? <Loader2 size={16} className="animate-spin text-[#35D6E4]" /> : isIcon ? (icon ?? <Sparkles size={16} className="text-[#35D6E4]" />) : <>{icon}<span className="whitespace-nowrap">{label}</span></>}</span>
    </button>
  );
}
