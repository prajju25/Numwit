import React from "react";
import PropTypes from "prop-types";
import { twMerge } from "tailwind-merge";

const TIMER_OPTIONS      = [{ value: 20, label: "20s" }, { value: 30, label: "30s" }, { value: 60, label: "60s" }];
const ELIM_OPTIONS       = [{ value: 3, label: "3 pts" }, { value: 5, label: "5 pts" }, { value: 7, label: "7 pts" }];
const MULTIPLIER_OPTIONS = [{ value: 0.6, label: "60%" }, { value: 0.8, label: "80%" }, { value: 0.9, label: "90%" }];

function OptionRow({ label, options, value, onChange }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-semibold text-white/60 w-28 shrink-0">{label}</span>
      <div className="flex gap-1">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={twMerge(
              "px-3 py-1.5 rounded-lg text-xs font-bold border transition-all duration-150",
              value === opt.value
                ? "bg-violet-600 text-white border-violet-500 shadow-sm shadow-violet-500/30"
                : "bg-white/5 text-white/50 border-white/10 hover:border-violet-500/40 hover:text-white/80"
            )}
          >
            {opt.label}
          </button>
        ))}
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
    <div className="border border-violet-500/25 rounded-xl p-4 space-y-3"
      style={{ background: "rgba(124,58,237,0.08)" }}>
      <p className="text-xs font-bold text-violet-400 uppercase tracking-widest">
        ⚙️ Game Settings <span className="text-violet-400/50 font-normal normal-case">(host only)</span>
      </p>

      <OptionRow label="Round timer"    options={TIMER_OPTIONS}      value={settings.timerDuration}        onChange={update("timerDuration")} />
      <OptionRow label="Elimination at" options={ELIM_OPTIONS}       value={settings.eliminationThreshold} onChange={update("eliminationThreshold")} />
      <OptionRow label="Target ="       options={MULTIPLIER_OPTIONS} value={settings.targetMultiplier}     onChange={update("targetMultiplier")} />

      {/* Duplicate rule toggle */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-white/60 w-28 shrink-0">Duplicate rule</span>
        <div className="flex gap-1">
          {[{ val: true, label: "On" }, { val: false, label: "Off" }].map(({ val, label }) => (
            <button
              key={label}
              type="button"
              onClick={() => update("duplicateRuleEnabled")(val)}
              className={twMerge(
                "px-3 py-1.5 rounded-lg text-xs font-bold border transition-all duration-150",
                settings.duplicateRuleEnabled === val
                  ? "bg-violet-600 text-white border-violet-500 shadow-sm shadow-violet-500/30"
                  : "bg-white/5 text-white/50 border-white/10 hover:border-violet-500/40 hover:text-white/80"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-white/30 leading-relaxed">
        Settings are locked once the game starts. Target = {(settings.targetMultiplier * 100).toFixed(0)}% of the average.
        {!settings.duplicateRuleEnabled && " Duplicate picks are allowed (Classic mode)."}
      </p>
    </div>
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
