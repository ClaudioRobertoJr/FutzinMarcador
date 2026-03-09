"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { TrendingUp, Calendar, Star, ChevronRight } from "lucide-react";

// ─── tipos ────────────────────────────────────────────────────────────────────

type Pos = "GK" | "FIXO" | "ALA_E" | "ALA_D" | "PIVO";

type Player = {
  id: string;
  name: string;
  type: "FIXO" | "COMPLETE";
  preferred_pos: Pos | null;
  pace: number | null;
  shooting: number | null;
  passing: number | null;
  defending: number | null;
  physical: number | null;
};

type MeetingRow = {
  meeting_id: string;
  meeting_date: string;
  goals: number;
  assists: number;
  saves: number;
  hard_saves: number;
  goals_against: number;
  points: number;
  matches_played: number;
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function clamp99(n: number | null) {
  if (!n || Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(99, n));
}

function posLabel(p: Pos | null) {
  if (!p) return "—";
  const map: Record<string, string> = {
    GK: "Goleiro", FIXO: "Fixo", ALA_E: "Ala E", ALA_D: "Ala D", PIVO: "Pivô",
  };
  return map[p] ?? p;
}

// ─── Sparkline SVG ───────────────────────────────────────────────────────────

function Sparkline({ values, color = "#22c55e" }: { values: number[]; color?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const W = 100, H = 32, pad = 4;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (W - pad * 2);
    const y = H - pad - ((v / max) * (H - pad * 2));
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = pts[pts.length - 1].split(",");
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity="0.9"
      />
      <circle cx={last[0]} cy={last[1]} r="3" fill={color} />
    </svg>
  );
}

// ─── StatBar ─────────────────────────────────────────────────────────────────

function StatBar({ label, value, color = "bg-primary" }: {
  label: string; value: number; color?: string;
}) {
  const pct = Math.min(100, (value / 99) * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="font-semibold text-muted-foreground">{label}</span>
        <span className="font-black tabular-nums">{value}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-500", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── StatBox ─────────────────────────────────────────────────────────────────

function StatBox({ emoji, label, value, sub }: {
  emoji: string; label: string; value: string | number; sub?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border bg-muted/30 px-3 py-3 gap-0.5">
      <span className="text-base leading-none">{emoji}</span>
      <span className="text-xl font-black tabular-nums leading-tight">{value}</span>
      <span className="text-[10px] font-semibold text-muted-foreground text-center leading-none">{label}</span>
      {sub && <span className="text-[9px] text-muted-foreground/70 leading-none">{sub}</span>}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function PlayerHistoryPage() {
  const { groupId, playerId } = useParams<{ groupId: string; playerId: string }>();

  const [player, setPlayer] = useState<Player | null>(null);
  const [history, setHistory] = useState<MeetingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [{ data: p }, { data: h }] = await Promise.all([
          supabase
            .from("players")
            .select("id,name,type,preferred_pos,pace,shooting,passing,defending,physical")
            .eq("id", playerId)
            .single(),
          supabase.rpc("get_player_history", { p_player_id: playerId, p_limit: 20 }),
        ]);
        if (p) setPlayer(p as Player);
        if (h) setHistory(h as MeetingRow[]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [playerId]);

  const totals = useMemo(() => history.reduce(
    (acc, r) => ({
      goals:         acc.goals         + r.goals,
      assists:       acc.assists       + r.assists,
      saves:         acc.saves         + r.saves,
      hard_saves:    acc.hard_saves    + r.hard_saves,
      goals_against: acc.goals_against + r.goals_against,
      points:        acc.points        + Number(r.points),
      meetings:      acc.meetings      + 1,
      matches:       acc.matches       + r.matches_played,
    }),
    { goals: 0, assists: 0, saves: 0, hard_saves: 0, goals_against: 0, points: 0, meetings: 0, matches: 0 }
  ), [history]);

  const avgs = useMemo(() => {
    const n = totals.meetings || 1;
    return {
      goals:   (totals.goals   / n).toFixed(1),
      assists: (totals.assists / n).toFixed(1),
      saves:   (totals.saves   / n).toFixed(1),
      points:  (totals.points  / n).toFixed(1),
    };
  }, [totals]);

  // Sparklines em ordem cronológica
  const chrono      = useMemo(() => [...history].reverse(), [history]);
  const goalsLine   = chrono.map((r) => r.goals);
  const pointsLine  = chrono.map((r) => Number(r.points));

  const bestMeeting = useMemo(() => {
    if (!history.length) return null;
    return history.reduce((best, r) => Number(r.points) > Number(best.points) ? r : best, history[0]);
  }, [history]);

  const hasAttributes = player && (
    player.pace || player.shooting || player.passing || player.defending || player.physical
  );

  if (loading) {
    return (
      <main className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-muted-foreground text-sm animate-pulse">Carregando...</div>
      </main>
    );
  }

  if (!player) {
    return (
      <main className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Jogador não encontrado.</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">

      {/* ── Header sticky ── */}
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href={`/g/${groupId}`}
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0 text-sm"
            >
              ←
            </Link>
            <div className="min-w-0">
              <div className="font-black text-base leading-tight truncate">{player.name}</div>
              <div className="text-[11px] text-muted-foreground">
                {player.type === "FIXO" ? "Fixo" : "Complete"} · {posLabel(player.preferred_pos)}
              </div>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Badge variant="outline" className="text-xs">{totals.meetings} jogos</Badge>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">

        {/* ── Atributos ── */}
        {hasAttributes && (
          <Card className="border bg-card/70 backdrop-blur">
            <CardContent className="p-4 space-y-2.5">
              <div className="text-xs font-black text-muted-foreground uppercase tracking-wider mb-3">Atributos</div>
              <StatBar label="Velocidade" value={clamp99(player.pace)}     color="bg-yellow-400" />
              <StatBar label="Chute"      value={clamp99(player.shooting)} color="bg-orange-400" />
              <StatBar label="Passe"      value={clamp99(player.passing)}  color="bg-blue-400" />
              <StatBar label="Defesa"     value={clamp99(player.defending)}color="bg-green-400" />
              <StatBar label="Físico"     value={clamp99(player.physical)} color="bg-purple-400" />
            </CardContent>
          </Card>
        )}

        {history.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Nenhum jogo registrado ainda.
          </div>
        ) : (
          <>
            {/* ── Totais ── */}
            <div>
              <div className="text-xs font-black text-muted-foreground uppercase tracking-wider mb-2 px-1">
                Totais · {totals.matches} partidas
              </div>
              <div className="grid grid-cols-5 gap-2">
                <StatBox emoji="⚽" label="Gols"    value={totals.goals}      sub={`ø ${avgs.goals}`} />
                <StatBox emoji="🎯" label="Assists"  value={totals.assists}    sub={`ø ${avgs.assists}`} />
                <StatBox emoji="🧤" label="Defesas"  value={totals.saves}      sub={`ø ${avgs.saves}`} />
                <StatBox emoji="🧱" label="DD"       value={totals.hard_saves} />
                <StatBox emoji="★"  label="Pontos"   value={totals.points.toFixed(0)} sub={`ø ${avgs.points}`} />
              </div>
            </div>

            {/* ── Melhor jogo ── */}
            {bestMeeting && Number(bestMeeting.points) > 0 && (
              <Card className="border border-yellow-500/40 bg-yellow-500/5">
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />
                      <span className="text-xs font-bold text-yellow-500">Melhor jogo</span>
                    </div>
                    <div className="font-black">{fmtDate(bestMeeting.meeting_date)}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {bestMeeting.goals > 0 && `⚽ ${bestMeeting.goals}  `}
                      {bestMeeting.assists > 0 && `🎯 ${bestMeeting.assists}  `}
                      {bestMeeting.saves > 0 && `🧤 ${bestMeeting.saves}  `}
                      {bestMeeting.hard_saves > 0 && `🧱 ${bestMeeting.hard_saves}`}
                    </div>
                  </div>
                  <div className="text-3xl font-black text-yellow-400 tabular-nums shrink-0">
                    {Number(bestMeeting.points).toFixed(1)}
                    <span className="text-sm font-semibold text-yellow-500/70"> pts</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Evolução (sparklines) ── */}
            {chrono.length >= 3 && (
              <Card className="border bg-card/70 backdrop-blur">
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    Evolução (últimos {chrono.length} jogos)
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 grid grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <div className="text-xs text-muted-foreground font-semibold">Gols por jogo</div>
                    <Sparkline values={goalsLine} color="#facc15" />
                    <div className="text-[10px] text-muted-foreground">
                      max {Math.max(...goalsLine)} · mín {Math.min(...goalsLine)}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-xs text-muted-foreground font-semibold">Pontos por jogo</div>
                    <Sparkline values={pointsLine} color="#22c55e" />
                    <div className="text-[10px] text-muted-foreground">
                      max {Math.max(...pointsLine).toFixed(1)} · mín {Math.min(...pointsLine).toFixed(1)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Lista de jogo ── */}
            <Card className="border bg-card/70 backdrop-blur">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  Jogos
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {history.map((r) => {
                    const pts = Number(r.points);
                    const isBest = bestMeeting?.meeting_id === r.meeting_id && pts > 0;
                    return (
                      <Link
                        key={r.meeting_id}
                        href={`/meeting/${r.meeting_id}`}
                        className={cn(
                          "flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors",
                          isBest && "bg-yellow-500/5"
                        )}
                      >
                        {/* Data + detalhes */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-black">{fmtDate(r.meeting_date)}</span>
                            {isBest && (
                              <Star className="h-3 w-3 text-yellow-500 fill-yellow-500 shrink-0" />
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                            <span>{r.matches_played} {r.matches_played === 1 ? "partida" : "partidas"}</span>
                            {r.goals      > 0 && <span>⚽ {r.goals}</span>}
                            {r.assists    > 0 && <span>🎯 {r.assists}</span>}
                            {r.saves      > 0 && <span>🧤 {r.saves}</span>}
                            {r.hard_saves > 0 && <span>🧱 {r.hard_saves}</span>}
                          </div>
                        </div>

                        {/* Pontos + seta */}
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={cn(
                            "text-base font-black tabular-nums",
                            pts > 0 ? "text-primary" : "text-muted-foreground"
                          )}>
                            {pts > 0 ? pts.toFixed(1) : "—"}
                          </span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </>
        )}

      </div>
    </main>
  );
}
