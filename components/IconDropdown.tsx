import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { retryLightLogo, getLogoUrl } from "../utils/nhlUtils";

export type Option = { value: string; label: string; teams?: string[] };

export const parseTeamsFromText = (text: string): string[] => {
  const raw = (text || "").trim();
  const abbrMatches = raw.match(/\b[A-Z]{2,4}\b/g) || [];
  const cleaned = abbrMatches
    .map((s) => s.toUpperCase())
    .filter((s) => s !== "OT" && s !== "VS" && s !== "V");
  if (cleaned.length >= 2) return cleaned.slice(0, 2);
  if (cleaned.length === 1) return cleaned;
  return [];
};

export const PortalMenu: React.FC<{
  open: boolean;
  anchorEl: HTMLElement | null;
  width?: number;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ open, anchorEl, onClose, children }) => {
  const [pos, setPos] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 280,
  });
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || !anchorEl) return;

    const calc = () => {
      const r = anchorEl.getBoundingClientRect();
      setPos({
        top: r.bottom + 8,
        left: r.left,
        width: Math.max(220, r.width),
      });
    };

    calc();
    window.addEventListener("scroll", calc, true);
    window.addEventListener("resize", calc);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current && menuRef.current.contains(t)) return;
      if (anchorEl && anchorEl.contains(t)) return;
      onClose();
    };
    window.addEventListener("mousedown", onDown);

    return () => {
      window.removeEventListener("scroll", calc, true);
      window.removeEventListener("resize", calc);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open, anchorEl, onClose]);

  if (!open || !anchorEl) return null;

  return createPortal(
    <div
      ref={menuRef}
      style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 999999 }}
      className="max-h-80 overflow-auto rounded-xl border border-white/10 bg-slate-950/95 backdrop-blur-xl shadow-2xl"
    >
      {children}
    </div>,
    document.body
  );
};

export const IconDropdown: React.FC<{
  placeholder: string;
  options: Option[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}> = ({ placeholder, options, value, onChange, disabled }) => {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  const selected = options.find((o) => o.value === value) || null;
  const selectedTeams = useMemo(() => {
    if (!selected) return [];
    const teams = selected.teams?.length ? selected.teams : parseTeamsFromText(selected.label);
    return (teams || []).slice(0, 2);
  }, [selected]);

  return (
    <div className="flex-1">
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((s) => !s)}
        className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg border text-[11px] font-black ${
          disabled
            ? "bg-white/5 border-white/10 text-slate-600 cursor-not-allowed"
            : "bg-slate-900/40 border-white/10 text-slate-200 hover:bg-slate-900/60"
        }`}
      >
        <span className="min-w-0 flex items-center gap-2 truncate">
          {selected ? (
            <>
              {selectedTeams.length > 0 ? (
                <span className="flex -space-x-2 shrink-0">
                  {selectedTeams.map((abbr, i) => (
                    <img
                      key={`sel-${selected.value}-${abbr}-${i}`}
                      src={getLogoUrl(abbr)}
                      className="w-5 h-5 object-contain bg-slate-900 rounded-full p-0.5 border border-slate-700"
                      alt={abbr}
                      loading="lazy"
                      decoding="async"
                      onError={(e) => { if (!retryLightLogo(e.currentTarget)) { e.currentTarget.style.display = "none"; } }}
                      style={{ zIndex: 10 - i }}
                    />
                  ))}
                </span>
              ) : (
                <span className="w-5 h-5 rounded-full bg-white/5 border border-white/10 shrink-0" />
              )}

              <span className="truncate">{selected.label}</span>
            </>
          ) : (
            <span className="text-slate-400 truncate">{placeholder}</span>
          )}
        </span>

        <i className={`fas ${open ? "fa-chevron-up" : "fa-chevron-down"} text-slate-500`} />
      </button>

      <PortalMenu open={open} anchorEl={btnRef.current} onClose={() => setOpen(false)}>
        <div className="p-2 space-y-1">
          {options.length === 0 && (
            <div className="px-3 py-2 text-[11px] text-slate-500">Sem opções.</div>
          )}

          {options.map((o) => {
            const teams = o.teams?.length ? o.teams : parseTeamsFromText(o.label);
            return (
              <button
                type="button"
                key={o.value}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 border border-transparent hover:border-white/10 text-left"
              >
                {teams.length > 0 ? (
                  <div className="flex -space-x-2">
                    {teams.slice(0, 2).map((abbr, i) => (
                      <img
                        key={`${o.value}-${abbr}-${i}`}
                        src={getLogoUrl(abbr)}
                        className="w-6 h-6 object-contain bg-slate-900 rounded-full p-0.5 border border-slate-700"
                        alt={abbr}
                        loading="lazy"
                        decoding="async"
                        onError={(e) => { if (!retryLightLogo(e.currentTarget)) { e.currentTarget.style.display = "none"; } }}
                        style={{ zIndex: 10 - i }}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="w-6 h-6 rounded-full bg-white/5 border border-white/10" />
                )}

                <div className="min-w-0">
                  <div className="text-[11px] font-black text-slate-200 truncate">{o.label}</div>
                </div>
              </button>
            );
          })}
        </div>
      </PortalMenu>
    </div>
  );
};


export default IconDropdown;
