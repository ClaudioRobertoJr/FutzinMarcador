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
  goals_against: number;
  points: number;
};

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border px-2 py-2">
      <div className="text-[10px] font-semibold text-muted-foreground">{label}</div>
      <div className="text-sm font-black">{value}</div>
    </div>
  );
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

      let list = (data ?? []) as Row[];

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

      setRows(list);
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
      if ((b.points ?? 0) !== (a.points ?? 0)) return (b.points ?? 0) - (a.points ?? 0);
      if ((b.goals ?? 0) !== (a.goals ?? 0)) return (b.goals ?? 0) - (a.goals ?? 0);
      if ((b.assists ?? 0) !== (a.assists ?? 0)) return (b.assists ?? 0) - (a.assists ?? 0);
      return (b.saves ?? 0) - (a.saves ?? 0);
    });
  }, [rows]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 py-4 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs text-muted-foreground">Ranking</div>
              <div className="text-xl font-black">Pontos / Gols / Assists / Defesas</div>
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
                  <SelectTrigger>
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
                  {sorted.map((r, idx) => (
                    <Card key={r.player_id} className="border">
                      <CardContent className="p-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="font-black">
                            #{idx + 1} — {r.player_name}
                          </div>
                          <div className="font-black">{r.points} pts</div>
                        </div>

                        <div className="grid grid-cols-4 gap-2">
                          <StatBox label="Pts" value={r.points ?? 0} />
                          <StatBox label="Gols" value={r.goals ?? 0} />
                          <StatBox label="Ass" value={r.assists ?? 0} />
                          <StatBox label="Def" value={r.saves ?? 0} />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Desktop: tabela */}
                <div className="hidden md:block overflow-auto">
                  <table className="min-w-[760px] w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="py-2 pr-3">#</th>
                        <th className="py-2 pr-3">Jogador</th>
                        <th className="py-2 pr-3">Pontos</th>
                        <th className="py-2 pr-3">Gols</th>
                        <th className="py-2 pr-3">Assists</th>
                        <th className="py-2 pr-3">Defesas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((r, idx) => (
                        <tr key={r.player_id} className={cn("border-b", idx === 0 && "bg-muted/40")}>
                          <td className="py-2 pr-3 font-semibold">{idx + 1}</td>
                          <td className="py-2 pr-3 font-black">{r.player_name}</td>
                          <td className="py-2 pr-3 font-black">{r.points ?? 0}</td>
                          <td className="py-2 pr-3">{r.goals ?? 0}</td>
                          <td className="py-2 pr-3">{r.assists ?? 0}</td>
                          <td className="py-2 pr-3">{r.saves ?? 0}</td>
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