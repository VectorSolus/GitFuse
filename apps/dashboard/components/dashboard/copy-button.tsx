"use client";

import ClickSpark from "../ClickSpark";
import { Copy } from "lucide-react";

export function CopyButton({ text }: { text: string }) {
  return (
    <ClickSpark sparkColor="#0067FB" sparkSize={5} sparkRadius={15} sparkCount={8} duration={400}>
      <button
        onClick={() => navigator.clipboard.writeText(text)}
        className="p-1.5 text-text-3 hover:text-ocean hover:bg-ocean/10 rounded-md transition-colors border border-transparent hover:border-ocean/20"
        aria-label={`Copy ${text}`}
      >
        <Copy className="w-4 h-4" />
      </button>
    </ClickSpark>
  );
}
