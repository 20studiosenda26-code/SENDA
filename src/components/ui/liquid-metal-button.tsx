const liquidMetalFragmentShader = "";
class ShaderMount {
  el: HTMLElement | null;
  constructor(el: HTMLElement | null, _s?: any, _u?: any, _w?: any, speed = 0.6) {
    this.el = el;
    if (el) {
      el.style.background = "conic-gradient(from 0deg, #131519, #35D6E4, #ffffff, #1A1D22, #22B4C2, #6FE7C8, #131519, #35D6E4)";
      el.style.backgroundSize = "200% 200%";
    }
  }
  setSpeed(_v: number) {}
  destroy() {}
}
import { Loader2, Sparkles, type LucideIcon } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";

export type SendaButtonVariant = "cyan" | "mint" | "amber";

export interface LiquidMetalButtonProps {
  label?: string;
  onClick?: () => void;
  viewMode?: "text" | "icon";
  variant?: SendaButtonVariant;
  icon?: LucideIcon;
  showIconInTextMode?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  fullWidth?: boolean;
  width?: number;
  height?: number;
  className?: string;
  title?: string;
}

const VARIANT_CONFIG: Record<
  SendaButtonVariant,
  {
    accent: string;
    accentStrong: string;
    accentDim: string;
    rippleColor: string;
    glowColor: string;
    shiftRed: number;
    shiftBlue: number;
    hueFilter: string;
  }
> = {
  cyan: {
    accent: "#35D6E4",
    accentStrong: "#22B4C2",
    accentDim: "#0F2E33",
    rippleColor: "rgba(53, 214, 228, 0.45)",
    glowColor: "rgba(53, 214, 228, 0.32)",
    shiftRed: 0.05,
    shiftBlue: 0.45,
    hueFilter: "hue-rotate(-8deg) saturate(1.25)",
  },
  mint: {
    accent: "#6FE7C8",
    accentStrong: "#4CC9A8",
    accentDim: "#112E28",
    rippleColor: "rgba(111, 231, 200, 0.45)",
    glowColor: "rgba(111, 231, 200, 0.28)",
    shiftRed: 0.04,
    shiftBlue: 0.32,
    hueFilter: "hue-rotate(-38deg) saturate(1.2)",
  },
  amber: {
    accent: "#FFC857",
    accentStrong: "#E6AD39",
    accentDim: "#33260F",
    rippleColor: "rgba(255, 200, 87, 0.45)",
    glowColor: "rgba(255, 200, 87, 0.28)",
    shiftRed: 0.45,
    shiftBlue: 0.05,
    hueFilter: "hue-rotate(145deg) saturate(1.3)",
  },
};

export function LiquidMetalButton({
  label = "Get Started",
  onClick,
  viewMode = "text",
  variant = "cyan",
  icon: IconComponent = Sparkles,
  showIconInTextMode = true,
  loading = false,
  loadingLabel,
  disabled = false,
  type = "button",
  fullWidth = false,
  width: customWidth,
  height: customHeight,
  className = "",
  title,
}: LiquidMetalButtonProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [measuredWidth, setMeasuredWidth] = useState<number>(320);
  const [ripples, setRipples] = useState<
    Array<{ x: number; y: number; id: number }>
  >([]);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const shaderRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shaderMount = useRef<any>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rippleId = useRef(0);

  const isInteractive = !disabled && !loading;
  const palette = VARIANT_CONFIG[variant];

  useEffect(() => {
    if (!fullWidth || !wrapperRef.current) return;
    const updateWidth = () => {
      if (wrapperRef.current) {
        const w = wrapperRef.current.getBoundingClientRect().width;
        if (w > 0) setMeasuredWidth(Math.round(w));
      }
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, [fullWidth]);

  const dimensions = useMemo(() => {
    const h = customHeight || (viewMode === "icon" ? 42 : 44);
    if (viewMode === "icon") {
      const w = customWidth || 42;
      return {
        width: w,
        height: h,
        innerWidth: w - 4,
        innerHeight: h - 4,
        shaderWidth: w,
        shaderHeight: h,
      };
    }

    const w = fullWidth
      ? measuredWidth
      : customWidth
        ? customWidth
        : Math.max(142, Math.round(label.length * 8.4 + (showIconInTextMode ? 52 : 34)));

    return {
      width: w,
      height: h,
      innerWidth: w - 4,
      innerHeight: h - 4,
      shaderWidth: w,
      shaderHeight: h,
    };
  }, [viewMode, fullWidth, measuredWidth, customWidth, customHeight, label, showIconInTextMode]);

  useEffect(() => {
    const styleId = "shader-canvas-style-exploded";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        .shader-container-exploded canvas {
          width: 100% !important;
          height: 100% !important;
          display: block !important;
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          border-radius: 100px !important;
        }
        @keyframes ripple-animation {
          0% {
            transform: translate(-50%, -50%) scale(0);
            opacity: 0.65;
          }
          100% {
            transform: translate(-50%, -50%) scale(4);
            opacity: 0;
          }
        }
      `;
      document.head.appendChild(style);
    }

    const loadShader = async () => {
      try {
        if (shaderRef.current) {
          if (shaderMount.current?.destroy) {
            shaderMount.current.destroy();
          }

          shaderMount.current = new ShaderMount(
            shaderRef.current,
            liquidMetalFragmentShader,
            {
              u_repetition: 4,
              u_softness: 0.5,
              u_shiftRed: palette.shiftRed,
              u_shiftBlue: palette.shiftBlue,
              u_distortion: 0,
              u_contour: 0,
              u_angle: 45,
              u_scale: 8,
              u_shape: 1,
              u_offsetX: 0.1,
              u_offsetY: -0.1,
            },
            undefined,
            disabled ? 0.15 : loading ? 1.5 : 0.6
          );
        }
      } catch (error) {
        console.error("[SENDA] Failed to load shader:", error);
      }
    };

    loadShader();

    return () => {
      if (shaderMount.current?.destroy) {
        shaderMount.current.destroy();
        shaderMount.current = null;
      }
    };
  }, [palette.shiftRed, palette.shiftBlue, disabled, loading]);

  const handleMouseEnter = () => {
    if (!isInteractive) return;
    setIsHovered(true);
    shaderMount.current?.setSpeed?.(1.1);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setIsPressed(false);
    if (!isInteractive) return;
    shaderMount.current?.setSpeed?.(0.6);
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!isInteractive) return;

    if (shaderMount.current?.setSpeed) {
      shaderMount.current.setSpeed(2.4);
      setTimeout(() => {
        if (isHovered) {
          shaderMount.current?.setSpeed?.(1.1);
        } else {
          shaderMount.current?.setSpeed?.(0.6);
        }
      }, 300);
    }

    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const ripple = { x, y, id: rippleId.current++ };

      setRipples((prev) => [...prev, ripple]);
      setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== ripple.id));
      }, 600);
    }

    onClick?.();
  };

  return (
    <div
      ref={wrapperRef}
      className={`relative select-none ${fullWidth ? "block w-full" : "inline-block"} ${
        disabled ? "opacity-50 cursor-not-allowed" : ""
      } ${className}`}
      title={title || label}
    >
      <div
        style={{
          perspective: "1000px",
          perspectiveOrigin: "50% 50%",
        }}
      >
        <div
          style={{
            position: "relative",
            width: `${dimensions.width}px`,
            height: `${dimensions.height}px`,
            transformStyle: "preserve-3d",
            transition:
              "all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1), width 0.25s ease, height 0.25s ease",
            transform: "none",
          }}
        >
          {/* Z-30: Label & Icon */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: `${dimensions.width}px`,
              height: `${dimensions.height}px`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              transformStyle: "preserve-3d",
              transition:
                "all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1), width 0.25s ease, height 0.25s ease, gap 0.4s ease",
              transform: "translateZ(20px)",
              zIndex: 30,
              pointerEvents: "none",
            }}
          >
            {loading ? (
              <Loader2
                size={16}
                className="animate-spin"
                style={{
                  color: palette.accent,
                  filter: `drop-shadow(0px 0px 6px ${palette.glowColor})`,
                }}
              />
            ) : (
              (viewMode === "icon" || showIconInTextMode) && (
                <IconComponent
                  size={16}
                  style={{
                    color: isHovered ? palette.accent : palette.accentStrong,
                    filter: isHovered
                      ? `drop-shadow(0px 0px 6px ${palette.glowColor})`
                      : "drop-shadow(0px 1px 2px rgba(0, 0, 0, 0.5))",
                    transition: "all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
                    transform: isHovered ? "scale(1.08)" : "scale(1)",
                  }}
                />
              )
            )}
            {viewMode === "text" && (
              <span
                style={{
                  fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                  fontSize: "14px",
                  color: isHovered ? palette.accent : "var(--text, #F1F5F9)",
                  fontWeight: 600,
                  letterSpacing: "0.015em",
                  textShadow: isHovered
                    ? `0px 0px 12px ${palette.glowColor}`
                    : "0px 1px 2px rgba(0, 0, 0, 0.45)",
                  transition: "all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
                  transform: "scale(1)",
                  whiteSpace: "nowrap",
                }}
              >
                {loading ? loadingLabel || label : label}
              </span>
            )}
          </div>

          {/* Z-20: Inner Pill Surface (--surface-2 / --surface) */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: `${dimensions.width}px`,
              height: `${dimensions.height}px`,
              transformStyle: "preserve-3d",
              transition:
                "all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1), width 0.25s ease, height 0.25s ease",
              transform: `translateZ(10px) ${
                isPressed
                  ? "translateY(1px) scale(0.98)"
                  : "translateY(0) scale(1)"
              }`,
              zIndex: 20,
            }}
          >
            <div
              style={{
                width: `${dimensions.innerWidth}px`,
                height: `${dimensions.innerHeight}px`,
                margin: "2px",
                borderRadius: "100px",
                background: isHovered
                  ? "linear-gradient(180deg, var(--surface-3, #22262D) 0%, var(--surface, #131519) 100%)"
                  : "linear-gradient(180deg, var(--surface-2, #1A1D22) 0%, var(--surface, #131519) 100%)",
                boxShadow: isPressed
                  ? "inset 0px 2px 4px rgba(0, 0, 0, 0.5), inset 0px 1px 2px rgba(0, 0, 0, 0.35)"
                  : isHovered
                    ? `inset 0px 0px 12px ${palette.accentDim}`
                    : "none",
                transition:
                  "all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1), width 0.25s ease, height 0.25s ease, box-shadow 0.15s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            />
          </div>

          {/* Z-10: Liquid Metal Ring */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: `${dimensions.width}px`,
              height: `${dimensions.height}px`,
              transformStyle: "preserve-3d",
              transition:
                "all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1), width 0.25s ease, height 0.25s ease",
              transform: `translateZ(0px) ${
                isPressed
                  ? "translateY(1px) scale(0.98)"
                  : "translateY(0) scale(1)"
              }`,
              zIndex: 10,
            }}
          >
            <div
              style={{
                height: `${dimensions.height}px`,
                width: `${dimensions.width}px`,
                borderRadius: "100px",
                boxShadow: isPressed
                  ? "0px 0px 0px 1px rgba(0, 0, 0, 0.5), 0px 1px 2px 0px rgba(0, 0, 0, 0.3)"
                  : isHovered
                    ? `0px 0px 0px 1px rgba(53, 214, 228, 0.35), 0px 0px 18px 0px ${palette.glowColor}, 0px 8px 12px 0px rgba(0, 0, 0, 0.25)`
                    : "0px 0px 0px 1px rgba(0, 0, 0, 0.3), 0px 12px 14px -4px rgba(0, 0, 0, 0.25), 0px 2px 5px 0px rgba(0, 0, 0, 0.15)",
                transition:
                  "all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1), width 0.25s ease, height 0.25s ease, box-shadow 0.15s cubic-bezier(0.4, 0, 0.2, 1)",
                background: "rgb(0 0 0 / 0)",
              }}
            >
              <div
                ref={shaderRef}
                className="shader-container-exploded"
                style={{
                  borderRadius: "100px",
                  overflow: "hidden",
                  position: "relative",
                  width: `${dimensions.shaderWidth}px`,
                  maxWidth: `${dimensions.shaderWidth}px`,
                  height: `${dimensions.shaderHeight}px`,
                  filter: palette.hueFilter,
                  transition: "width 0.25s ease, height 0.25s ease",
                }}
              />
            </div>
          </div>

          {/* Z-40: Button Hitbox & Brand Ripples */}
          <button
            ref={buttonRef}
            type={type}
            disabled={!isInteractive}
            onClick={handleClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onMouseDown={() => isInteractive && setIsPressed(true)}
            onMouseUp={() => setIsPressed(false)}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: `${dimensions.width}px`,
              height: `${dimensions.height}px`,
              background: "transparent",
              border: "none",
              cursor: isInteractive ? "pointer" : "not-allowed",
              outline: "none",
              zIndex: 40,
              transformStyle: "preserve-3d",
              transform: "translateZ(25px)",
              transition:
                "all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1), width 0.25s ease, height 0.25s ease",
              overflow: "hidden",
              borderRadius: "100px",
            }}
            aria-label={label}
          >
            {ripples.map((ripple) => (
              <span
                key={ripple.id}
                style={{
                  position: "absolute",
                  left: `${ripple.x}px`,
                  top: `${ripple.y}px`,
                  width: "20px",
                  height: "20px",
                  borderRadius: "50%",
                  background: `radial-gradient(circle, ${palette.rippleColor} 0%, rgba(53, 214, 228, 0) 70%)`,
                  pointerEvents: "none",
                  animation: "ripple-animation 0.6s ease-out",
                }}
              />
            ))}
          </button>
        </div>
      </div>
    </div>
  );
}
