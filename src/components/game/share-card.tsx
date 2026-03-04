"use client";

import { useCallback, useRef, useEffect } from "react";

interface ShareCardProps {
  iq: number;
  percentile: number;
  level: number;
  milestone: string | null;
  onClose: () => void;
}

export function ShareCard({ iq, percentile, level, milestone, onClose }: ShareCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const drawCard = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = 1080;
    const h = 1080;
    canvas.width = w;
    canvas.height = h;

    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#0f0b2e");
    grad.addColorStop(0.5, "#1a1145");
    grad.addColorStop(1, "#0d1b3e");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "rgba(177, 78, 255, 0.08)";
    ctx.beginPath();
    ctx.arc(w * 0.3, h * 0.3, 300, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(67, 97, 238, 0.06)";
    ctx.beginPath();
    ctx.arc(w * 0.7, h * 0.7, 250, 0, Math.PI * 2);
    ctx.fill();

    ctx.textAlign = "center";

    ctx.font = "bold 48px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.fillText("PUZZLE IQ", w / 2, 160);

    ctx.font = "80px system-ui, sans-serif";
    ctx.fillText("🧠", w / 2, 300);

    ctx.font = "bold 180px system-ui, sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(String(iq), w / 2, 520);

    ctx.font = "bold 36px system-ui, sans-serif";
    ctx.fillStyle = "#B14EFF";
    ctx.fillText(`Top ${percentile}% of players`, w / 2, 590);

    if (milestone) {
      const badgeW = 320;
      const badgeH = 60;
      const badgeX = (w - badgeW) / 2;
      const badgeY = 630;
      ctx.fillStyle = "rgba(177, 78, 255, 0.15)";
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 30);
      ctx.fill();
      ctx.font = "bold 28px system-ui, sans-serif";
      ctx.fillStyle = "#B14EFF";
      ctx.fillText(milestone, w / 2, badgeY + 40);
    }

    ctx.font = "28px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillText(`Level ${level} completed`, w / 2, 760);

    ctx.strokeStyle = "rgba(177, 78, 255, 0.3)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(40, 40, w - 80, h - 80, 20);
    ctx.stroke();

    ctx.font = "24px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fillText("Can you beat my score?", w / 2, h - 100);
  }, [iq, percentile, level, milestone]);

  useEffect(() => { drawCard(); }, [drawCard]);

  const handleShare = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawCard();

    try {
      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob(res, "image/png"),
      );
      if (!blob) return;

      const file = new File([blob], "puzzle-iq-score.png", { type: "image/png" });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: "Puzzle IQ",
          text: `My Puzzle IQ: ${iq} (Top ${percentile}%)`,
          files: [file],
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "puzzle-iq-score.png";
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      /* user cancelled share */
    }
  }, [drawCard, iq, percentile]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative mx-4 flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-white/10 bg-[#1a1145] p-6">
        <h3 className="text-lg font-bold">Share Your Score</h3>
        <canvas
          ref={canvasRef}
          className="w-full max-w-[280px] rounded-xl"
          width={1080}
          height={1080}
        />
        <div className="flex w-full gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-medium transition-colors hover:bg-white/10"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleShare}
            className="flex-1 rounded-xl bg-purple-600 py-2.5 text-sm font-bold transition-colors hover:bg-purple-500"
          >
            Share Image
          </button>
        </div>
      </div>
    </div>
  );
}
