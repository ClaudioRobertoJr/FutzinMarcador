"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Medal, Trophy, ChevronLeft } from "lucide-react";

// shadcn/ui
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Period = "MONTH" | "QUARTER" | "YEAR";
type TypeFilter = "ALL" | "FIXO" | "COMPLETE";

type Row = {
  player_id: string;
  player_name: string;
  goals: number;
  assists: number;
  saves: number;
  hard_saves?: number; // DD
  goals_against?: number;
  points: number;
};

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function calcPoints(goals: number, assists: number, saves: number, hard_saves: number) {
  const pts = goals * 2 + assists * 1 + saves * 0.25 + hard_saves * 1;
  return Number(pts.toFixed(2));
}

function rankStyle(idx: number) {
  if (idx === 0)
    return {
      ring: "ring-2 ring-yellow-500/30",
      border: "border-yellow-400/70",
      bg: "bg-yellow-500/10",
      icon: <Trophy className="h-4 w-4 text-yellow-400" />,
      badge: "1º",
    };
  if (idx === 1)
    return {
      ring: "ring-2 ring-zinc-400/20",
      border: "border-zinc-300/40",
      bg: "bg-zinc-500/5",
      icon: <Medal className="h-4 w-4 text-zinc-200" />,
      badge: "2º",
    };
  if (idx === 2)
    return {
      ring: "ring-2 ring-amber-700/20",
      border: "border-amber-600/40",
      bg: "bg-amber-600/10",
      icon: <Medal className="h-4 w-4 text-amber-400" />,
      badge: "3º",
    };
  return {
    ring: "",
    border: "border",
    bg: "",
    icon: null as any,
    badge: `#${idx + 1}`,
  };
}

export default function RankingPage() {
  const params = useParams<{ groupId: string }>();
  const groupId = params.groupId;

  const [period, setPeriod] = useState<Period>("MONTH");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadRanking() {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_group_ranking_period", {
        p_group_id: groupId,
        p_period: period,
        p_ref: new Date().toISOString(),
      });

      if (error) return alert(error.message);

      let list = (data ?? []) as any[];

      // filtro por tipo (FIXO/COMPLETE)
      if (typeFilter !== "ALL") {
        const ids = list.map((r) => r.player_id);
        if (ids.length > 0) {
          const { data: ps, error: ep } = await supabase.from("players").select("id,type").in("id", ids);

          if (!ep && ps) {
            const typeById: Record<string, string> = {};
            (ps as any[]).forEach((p) => (typeById[p.id] = p.type));
            list = list.filter((r) => typeById[r.player_id] === typeFilter);
          }
        }
      }

      // Recalcula points no front (ignora points antigo da RPC)
      list = list.map((r: any) => {
        const goals = Number(r.goals ?? 0);
        const assists = Number(r.assists ?? 0);
        const saves = Number(r.saves ?? 0);
        const hard_saves = Number(r.hard_saves ?? 0);
        const goals_against = r.goals_against != null ? Number(r.goals_against) : undefined;

        return {
          ...r,
          goals,
          assists,
          saves,
          hard_saves,
          goals_against,
          points: calcPoints(goals, assists, saves, hard_saves),
        } as Row;
      });

      setRows(list as any);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRanking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, period, typeFilter]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goals !== a.goals) return b.goals - a.goals;
      if (b.assists !== a.assists) return b.assists - a.assists;
      if ((b.hard_saves ?? 0) !== (a.hard_saves ?? 0)) return (b.hard_saves ?? 0) - (a.hard_saves ?? 0);
      return b.saves - a.saves;
    });
  }, [rows]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 py-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <Link
                href={`/g/${groupId}`}
                className="shrink-0 flex items-center justify-center h-9 w-9 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                aria-label="Voltar ao grupo"
              >
                <ChevronLeft className="h-5 w-5" />
              </Link>
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">Ranking</div>
                <div className="text-xl font-black leading-tight">Pontos / Gols / Assists / Defesas / DD</div>
              </div>
            </div>
          </div>

          <Card className="p-3">
            {/* mobile: empilha (evita sobrepor) */}
            <div className="grid gap-3 md:grid-cols-2 items-start">
              <div className="space-y-2">
                <div className="text-sm font-semibold text-muted-foreground">Período</div>
                <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
                  {/* evita corte/overlap no mobile: scroll horizontal */}
                  <div className="-mx-1 overflow-x-auto">
                    <TabsList className="w-max min-w-full md:w-auto">
                      <TabsTrigger value="MONTH">Este mês</TabsTrigger>
                      <TabsTrigger value="QUARTER">Últimos 3 meses</TabsTrigger>
                      <TabsTrigger value="YEAR">Ano</TabsTrigger>
                    </TabsList>
                  </div>
                </Tabs>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-semibold text-muted-foreground">Tipo</div>
                <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todos</SelectItem>
                    <SelectItem value="FIXO">Somente Fixos</SelectItem>
                    <SelectItem value="COMPLETE">Somente Completes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-lg">Tabela</CardTitle>
              <Badge variant="outline">{loading ? "carregando..." : `${sorted.length} jogadores`}</Badge>
            </div>
          </CardHeader>

          <CardContent>
            {loading ? (
              <div className="text-sm text-muted-foreground">Carregando…</div>
            ) : sorted.length === 0 ? (
              <div className="text-sm text-muted-foreground">Sem dados ainda.</div>
            ) : (
              <>
                {/* Mobile: cards */}
                <div className="md:hidden space-y-2">
                  {sorted.map((r, idx) => {
                    const s = rankStyle(idx);

                    return (
                      <Card key={r.player_id} className={cn(s.border, s.bg, s.ring)}>
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                {/* posição + medalha */}
                                <div
                                  className={cn(
                                    "shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-black tabular-nums",
                                    idx === 0 && "border-yellow-400/70 text-yellow-300",
                                    idx === 1 && "border-zinc-300/40 text-zinc-200",
                                    idx === 2 && "border-amber-600/40 text-amber-300"
                                  )}
                                >
                                  {s.icon}
                                  {s.badge}
                                </div>

                                <div className={cn("font-black truncate", idx === 0 && "text-lg")}>{r.player_name}</div>

                                {idx === 0 && (
                                  <Badge variant="outline" className="border-yellow-400/70 text-yellow-400">
                                    MVP
                                  </Badge>
                                )}
                              </div>
                            </div>

                            <div className={cn("shrink-0 font-black tabular-nums", idx === 0 && "text-lg")}>
                              {r.points} pts
                            </div>
                          </div>

                          <div className="grid grid-cols-4 gap-2 text-sm">
                            <div className="rounded-lg border bg-muted/40 px-2 py-2 text-center">
                              <div className="text-[10px] font-semibold text-muted-foreground">G</div>
                              <div className="font-black tabular-nums">{r.goals ?? 0}</div>
                            </div>
                            <div className="rounded-lg border bg-muted/40 px-2 py-2 text-center">
                              <div className="text-[10px] font-semibold text-muted-foreground">A</div>
                              <div className="font-black tabular-nums">{r.assists ?? 0}</div>
                            </div>
                            <div className="rounded-lg border bg-muted/40 px-2 py-2 text-center">
                              <div className="text-[10px] font-semibold text-muted-foreground">D</div>
                              <div className="font-black tabular-nums">{r.saves ?? 0}</div>
                            </div>
                            <div className="rounded-lg border bg-muted/40 px-2 py-2 text-center">
                              <div className="text-[10px] font-semibold text-muted-foreground">DD</div>
                              <div className="font-black tabular-nums">{Number(r.hard_saves ?? 0)}</div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {/* Desktop: tabela */}
                <div className="hidden md:block overflow-auto">
                  <table className="min-w-[860px] w-full text-left border-collapse">
                    <thead>
                      <tr className="sticky top-0 z-10 border-b bg-background text-muted-foreground">
                        <th className="py-2 pr-3">#</th>
                        <th className="py-2 pr-3">Jogador</th>
                        <th className="py-2 pr-3">Pontos</th>
                        <th className="py-2 pr-3">Gols</th>
                        <th className="py-2 pr-3">Assists</th>
                        <th className="py-2 pr-3">Defesas</th>
                        <th className="py-2 pr-3">DD</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((r, idx) => (
                        <tr
                          key={r.player_id}
                          className={cn(
                            "border-b transition-colors hover:bg-muted/30",
                            idx === 0 && "bg-yellow-500/10"
                          )}
                        >
                          <td className="py-2 pr-3 font-semibold tabular-nums">{idx + 1}</td>
                          <td className="py-2 pr-3 font-black">{r.player_name}</td>
                          <td className="py-2 pr-3 font-black tabular-nums">{r.points ?? 0}</td>
                          <td className="py-2 pr-3 tabular-nums">{r.goals ?? 0}</td>
                          <td className="py-2 pr-3 tabular-nums">{r.assists ?? 0}</td>
                          <td className="py-2 pr-3 tabular-nums">{r.saves ?? 0}</td>
                          <td className="py-2 pr-3 tabular-nums">{Number(r.hard_saves ?? 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}