"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface Props {
  active: boolean;
  color?: "indigo" | "green" | "zinc";
  bars?: number;
  analyser?: AnalyserNode | null;
}

export function AudioWaveform({ active, color = "indigo", bars = 20, analyser }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  const colorMap = {
    indigo: "#6366f1",
    green: "#10b981",
    zinc: "#52525b",
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const barW = Math.floor(w / (bars * 1.5));
      const gap = Math.floor(barW / 2);

      if (!active) {
        // Flat line when silent
        ctx.fillStyle = colorMap[color] + "40";
        for (let i = 0; i < bars; i++) {
          const x = i * (barW + gap);
          const barH = 3;
          ctx.fillRect(x, h / 2 - barH / 2, barW, barH);
        }
        return;
      }

      let dataArray: Uint8Array<ArrayBuffer> | null = null;

      if (analyser) {
        const bufLen = analyser.frequencyBinCount;
        dataArray = new Uint8Array(new ArrayBuffer(bufLen));
        analyser.getByteFrequencyData(dataArray);
      }

      ctx.fillStyle = colorMap[color];

      for (let i = 0; i < bars; i++) {
        let barH: number;

        if (dataArray) {
          // Use real audio data
          const dataIndex = Math.floor((i / bars) * dataArray.length);
          barH = (dataArray[dataIndex] / 255) * h * 0.9 + 4;
        } else {
          // CSS animation fallback — randomized sine wave
          const t = Date.now() / 200;
          barH = (Math.sin(t + i * 0.4) * 0.4 + 0.6) * h * 0.7 * Math.random() * 0.5 + h * 0.1;
        }

        const x = i * (barW + gap);
        const y = (h - barH) / 2;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(x, y, barW, barH);
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [active, color, bars, analyser]);

  return (
    <canvas
      ref={canvasRef}
      width={bars * 12}
      height={48}
      className="w-full h-12"
    />
  );
}
