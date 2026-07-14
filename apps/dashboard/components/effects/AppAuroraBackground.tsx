"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";

const SoftAurora = dynamic(() => import("./SoftAurora"), {
  ssr: false,
}) as ComponentType<{
  speed?: number;
  scale?: number;
  brightness?: number;
  color1?: string;
  color2?: string;
  noiseFrequency?: number;
  noiseAmplitude?: number;
  bandHeight?: number;
  bandSpread?: number;
  octaveDecay?: number;
  layerOffset?: number;
  colorSpeed?: number;
  enableMouseInteraction?: boolean;
  mouseInfluence?: number;
}>;

export function AppAuroraBackground() {
  const pathname = usePathname();
  const isHomePage = pathname === "/";

  return (
    <div
      className={`gf-app-aurora ${
        isHomePage ? "gf-app-aurora-home" : "gf-app-aurora-soft"
      }`}
      aria-hidden="true"
    >
      <SoftAurora
        speed={isHomePage ? 0.6 : 0.48}
        scale={isHomePage ? 1.5 : 1.7}
        brightness={isHomePage ? 1 : 1.18}
        color1="#0890f2"
        color2="#1f54dc"
        noiseFrequency={isHomePage ? 2.5 : 2.15}
        noiseAmplitude={isHomePage ? 1 : 1.15}
        bandHeight={isHomePage ? 0.5 : 0.52}
        bandSpread={isHomePage ? 1 : 1.18}
        octaveDecay={0.1}
        layerOffset={0}
        colorSpeed={isHomePage ? 1 : 0.85}
        enableMouseInteraction
        mouseInfluence={isHomePage ? 0.25 : 0.18}
      />
    </div>
  );
}