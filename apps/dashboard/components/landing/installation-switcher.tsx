"use client";

import { useState } from "react";

import {
  INSTALL_GUIDES,
  installCommandText,
  type InstallGuideKey,
} from "@/lib/install-commands";

export function InstallationSwitcher() {
  const [selected, setSelected] = useState<InstallGuideKey>("macos");
  const guide = INSTALL_GUIDES[selected];
  const command = installCommandText(selected);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mx-auto flex w-fit gap-2 rounded-full border border-white/10 bg-white/[0.04] p-1 backdrop-blur-xl">
        {(Object.keys(INSTALL_GUIDES) as InstallGuideKey[]).map((key) => {
          const active = selected === key;

          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelected(key)}
              className={[
                "rounded-full px-5 py-2 text-sm font-medium transition",
                active
                  ? "bg-cyan-300 text-[#020817] shadow-ocean"
                  : "text-slate-300 hover:bg-white/[0.06] hover:text-white",
              ].join(" ")}
            >
              {INSTALL_GUIDES[key].label}
            </button>
          );
        })}
      </div>

      <div
        key={selected}
        className="mt-6 animate-fade-up overflow-hidden rounded-3xl border border-white/10 bg-[#030B16]/90 shadow-ocean-soft backdrop-blur-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-red-400" />
            <span className="h-3 w-3 rounded-full bg-yellow-400" />
            <span className="h-3 w-3 rounded-full bg-emerald-400" />
          </div>

          <div className="group relative">
            <span className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-medium text-cyan-100">
              {guide.shell}
            </span>

            <span className="pointer-events-none absolute right-0 top-full z-50 mt-3 w-72 rounded-2xl border border-white/10 bg-[#06111F] px-4 py-3 text-left text-xs leading-5 text-slate-300 opacity-0 shadow-ocean-soft transition group-hover:opacity-100">
              {guide.note}
            </span>
          </div>
        </div>

        <pre className="overflow-x-auto p-6 text-left font-mono text-sm leading-7 text-cyan-50">
          <code>
            {command.split("\n").map((line, index) => (
              <span key={`${line}-${index}`} className="block">
                {line ? (
                  <>
                    <span className="select-none text-cyan-400">$ </span>
                    {line}
                  </>
                ) : (
                  <span>&nbsp;</span>
                )}
              </span>
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
}
