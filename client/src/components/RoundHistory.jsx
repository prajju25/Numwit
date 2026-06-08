import React from "react";
import PropTypes from "prop-types";
import { useNumwit } from "../contexts/NumwitRuleContext";
import { useUser } from "../contexts/UserContext";
import { useGame } from "../contexts/GameContext";

export default function RoundHistory() {
  const { history } = useNumwit();
  const { user } = useUser();
  const { players } = useGame();

  if (!history || history.length === 0) return null;

  const mySocketId = user?.socketId;

  return (
    <div className="w-full">
      <p className="section-heading">Round History</p>
      <div className="max-h-48 overflow-y-auto rounded-xl border border-white/10"
        style={{ background: "rgba(255,255,255,0.03)" }}>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/10">
              <th className="px-3 py-2 text-left label-muted">#</th>
              <th className="px-3 py-2 text-left label-muted">Target</th>
              <th className="px-3 py-2 text-left label-muted">All Picks</th>
              <th className="px-3 py-2 text-right label-muted">Winner</th>
            </tr>
          </thead>
          <tbody>
            {history.map((r, i) => {
              const mySubmission = r.submissions?.find((s) => s.socketId === mySocketId);
              const iWon = r.winnerIds?.includes(mySocketId);

              const winnerNames = (r.winnerIds || []).map((wid) => {
                const p = players?.find((pl) => pl.socketId === wid);
                return p ? `${p.avatar}${p.name}` : "?";
              }).join(", ");

              return (
                <tr key={i} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                  <td className="px-3 py-2 text-white/40 font-medium">{r.round}</td>
                  <td className="px-3 py-2 text-violet-400 font-mono font-semibold">
                    {r.target != null ? r.target.toFixed(1) : "—"}
                  </td>
                  {/* All players' picks for this round */}
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {(r.submissions || []).map((s) => {
                        const p = players?.find((pl) => pl.socketId === s.socketId);
                        const isMe = s.socketId === mySocketId;
                        const isWin = r.winnerIds?.includes(s.socketId);
                        const isInvalid = r.invalidSubmissions?.some((inv) => inv.socketId === s.socketId);
                        return (
                          <span
                            key={s.socketId}
                            title={p ? `${p.avatar} ${p.name}` : s.socketId}
                            className={[
                              "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-mono font-bold text-[10px] border",
                              isWin
                                ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                                : isInvalid
                                ? "bg-red-500/15 border-red-500/30 text-red-400 line-through"
                                : isMe
                                ? "bg-violet-500/20 border-violet-500/40 text-violet-300"
                                : "bg-white/5 border-white/10 text-white/50",
                            ].join(" ")}
                          >
                            {p ? p.avatar : "?"}{s.number}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td className={`px-3 py-2 text-right text-[10px] max-w-[96px] truncate ${iWon ? "text-emerald-400 font-semibold" : "text-white/40"}`}>
                    {winnerNames || "—"}
                    {(r.invalidSubmissions || []).length > 0 && (
                      <span
                        title="Won because duplicate numbers were eliminated"
                        className="ml-1 text-[8px] text-orange-400/70 font-normal align-middle"
                      >
                        (dup)
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

RoundHistory.propTypes = {};
