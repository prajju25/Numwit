import React from "react";
import PropTypes from "prop-types";
import { twMerge } from "tailwind-merge";

const TIMER_OPTIONS      = [{ value: 20, label: "20s" }, { value: 30, label: "30s" }, { value: 60, label: "60s" }];
const ELIM_OPTIONS       = [{ value: 3, label: "3 pts" }, { value: 5, label: "5 pts" }, { value: 7, label: "7 pts" }];
const MULTIPLIER_OPTIONS = [{ value: 0.6, label: "60%" }, { value: 0.8, label: "80%" }, { value: 0.9, label: "90%" }];
const DUPLICATE_OPTIONS  = [{ value: true, label: "On" }, { value: false, label: "Off" }];

function OptionRow({ label, options, value, onChange }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-[#A3A8C7]">{label}</span>
      <div
        role="group"
        aria-label={label}
        className="grid gap-1 p-1 rounded-xl bg-black/25 border border-white/[0.07]"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={String(opt.value)}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(opt.value)}
              className={twMerge(
                "nums h-9 rounded-[9px] text-[13px] font-bold transition-all duration-150 active:scale-95",
                active
                  ? "bg-violet-600 text-white shadow-[0_4px_14px_-4px_rgba(124,58,237,0.8)]"
                  : "bg-transparent text-[#A3A8C7] hover:text-white hover:bg-white/5"
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

OptionRow.propTypes = {
  label: PropTypes.string.isRequired,
  options: PropTypes.array.isRequired,
  value: PropTypes.oneOfType([PropTypes.number, PropTypes.bool]).isRequired,
  onChange: PropTypes.func.isRequired,
};

export default function GameSettingsPanel({ settings, onChange }) {
  const update = (key) => (val) => onChange({ ...settings, [key]: val });

  return (
    <section className="glass-card rounded-[18px] p-4 flex flex-col gap-3.5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-base font-bold m-0">Game Settings</h2>
        <span className="text-[11px] text-[#8F95B8]">(host only)</span>
      </div>

      <OptionRow label="Round timer"    options={TIMER_OPTIONS}      value={settings.timerDuration}        onChange={update("timerDuration")} />
      <OptionRow label="Elimination at" options={ELIM_OPTIONS}       value={settings.eliminationThreshold} onChange={update("eliminationThreshold")} />
      <OptionRow label="Target ="       options={MULTIPLIER_OPTIONS} value={settings.targetMultiplier}     onChange={update("targetMultiplier")} />
      <OptionRow label="Duplicate rule" options={DUPLICATE_OPTIONS}  value={settings.duplicateRuleEnabled} onChange={update("duplicateRuleEnabled")} />

      <p className="text-[11px] text-[#8F95B8] leading-relaxed m-0">
        Settings are locked once the game starts. Target = {(settings.targetMultiplier * 100).toFixed(0)}% of the average.
        {!settings.duplicateRuleEnabled && " Duplicate picks are allowed (Classic mode)."}
      </p>
    </section>
  );
}

GameSettingsPanel.propTypes = {
  settings: PropTypes.shape({
    timerDuration: PropTypes.number,
    eliminationThreshold: PropTypes.number,
    targetMultiplier: PropTypes.number,
    duplicateRuleEnabled: PropTypes.bool,
  }).isRequired,
  onChange: PropTypes.func.isRequired,
};
