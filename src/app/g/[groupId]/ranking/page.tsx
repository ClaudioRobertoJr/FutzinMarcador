"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

// shadcn/ui
import { Button } from "@/components/ui/button";
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
  goals_against?: number; // pode vir, mas não entra no cálculo
  points: number; // recalculado no front
};

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function calcPoints(goals: number, assists: number, saves: number, hard_saves: number) {
  const pts = goals * 2 + assists * 1 + saves * 0.25 + hard_saves * 1;
  return Number(pts.toFixed(2));
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
          const { data: ps, error: ep } = await supabase
            .from("players")
            .select("id,type")
            .in("id", ids);

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
      if ((b.hard_saves ?? 0) !== (a.hard_saves ?? 0))
        return (b.hard_saves ?? 0) - (a.hard_saves ?? 0);
      return b.saves - a.saves;
    });
  }, [rows]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 py-4 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs text-muted-foreground">Ranking</div>
              <div className="text-xl font-black">Pontos / Gols / Assists / Defesas / DD</div>
            </div>

            <Button asChild variant="outline">
              <Link href={`/g/${groupId}`}>Voltar</Link>
            </Button>
          </div>

          <Card className="p-3">
            <div className="grid md:grid-cols-2 gap-3 items-start">
              <div className="space-y-2">
                <div className="text-sm font-semibold text-muted-foreground">Período</div>
                <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
                  <TabsList className="flex flex-wrap">
                    <TabsTrigger value="MONTH">Este mês</TabsTrigger>
                    <TabsTrigger value="QUARTER">Últimos 3 meses</TabsTrigger>
                    <TabsTrigger value="YEAR">Ano</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-semibold text-muted-foreground">Tipo</div>
                <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
                  {/* maior no mobile */}
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
              <Badge variant="outline">
                {loading ? "carregando..." : `${sorted.length} jogadores`}
              </Badge>
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
                    const isFirst = idx === 0;
                    return (
                      <Card
                        key={r.player_id}
                        className={cn(
                          "border",
                          isFirst && "border-yellow-400/80 shadow-sm"
                        )}
                      >
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                {/* posição com destaque */}
                                <div
                                  className={cn(
                                    "text-sm font-black tabular-nums",
                                    isFirst && "text-yellow-400"
                                  )}
                                >
                                  #{idx + 1}
                                </div>

                                <div className="font-black truncate">{r.player_name}</div>

                                {isFirst && (
                                  <Badge
                                    variant="outline"
                                    className="border-yellow-400/70 text-yellow-400"
                                  >
                                    🏆 MVP
                                  </Badge>
                                )}
                              </div>
                            </div>

                            <div className="shrink-0 font-black tabular-nums">
                              {r.points} pts
                            </div>
                          </div>

                          {/* layout compacto em linha única */}
                          <div className="text-sm text-muted-foreground">
                            <span className="font-semibold text-foreground">Gols:</span>{" "}
                            <span className="tabular-nums">{r.goals ?? 0}</span>{" "}
                            · <span className="font-semibold text-foreground">Ass:</span>{" "}
                            <span className="tabular-nums">{r.assists ?? 0}</span>{" "}
                            · <span className="font-semibold text-foreground">Def:</span>{" "}
                            <span className="tabular-nums">{r.saves ?? 0}</span>{" "}
                            · <span className="font-semibold text-foreground">DD:</span>{" "}
                            <span className="tabular-nums">{Number(r.hard_saves ?? 0)}</span>
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
                            "border-b",
                            idx === 0 && "bg-muted/40"
                          )}
                        >
                          <td className="py-2 pr-3 font-semibold">{idx + 1}</td>
                          <td className="py-2 pr-3 font-black">{r.player_name}</td>
                          <td className="py-2 pr-3 font-black">{r.points ?? 0}</td>
                          <td className="py-2 pr-3">{r.goals ?? 0}</td>
                          <td className="py-2 pr-3">{r.assists ?? 0}</td>
                          <td className="py-2 pr-3">{r.saves ?? 0}</td>
                          <td className="py-2 pr-3">{Number(r.hard_saves ?? 0)}</td>
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