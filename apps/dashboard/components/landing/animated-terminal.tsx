"use client";

import { motion } from "framer-motion";

const lines = [
  "$ gitfuse sync",
  "> Bundling commits for relay...",
  "> Encrypted 3 commits (SHA: 4f9c...)",
  "> Relay accepted bundle.",
  "",
  "$ gitfuse pull --device laptop-2",
  "> Fetching bundle from relay...",
  "> Decrypting...",
  "> Replaying 3 commits.",
  "✔ Sync complete."
];

export function AnimatedTerminal() {
  return (
    <div className="w-full max-w-[640px] mx-auto bg-surface rounded-xl shadow-2xl border border-surface-2 overflow-hidden mt-12 text-left">
      <div className="flex items-center px-4 py-2 bg-[#0A1E3D] border-b border-[#0A1E3D] space-x-2">
        <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
        <div className="w-3 h-3 rounded-full bg-amber-500/80"></div>
        <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
      </div>
      <div className="p-6 font-mono text-sm sm:text-base leading-relaxed text-[#12B8DE]">
        {lines.map((line, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.4, duration: 0.3 }}
            className="min-h-[1.5rem]"
          >
            {line}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
