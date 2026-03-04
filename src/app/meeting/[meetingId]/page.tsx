"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

// shadcn/ui
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

type MeetingMatch = {
  match_id: string;
  seq: number;
  status: string | null;
  team_a_name: string;
  team_b_name: string;
  minutes: number;
  started_at: string | null;
  ended_at: string | null;
  score_a: number;
  score_b: number;
};

type PlayerStat = {
  player_id: string;
  player_name: string;
  goals: number;
  assists: number;
  saves: number;
  goals_against?: number; // novo (opcional)
  points: number;
};

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border px-3 py-2">
      <div className="text-[10px] font-semibold text-muted-foreground">{label}</div>
      <div className="text-lg font-black">{value}</div>
    </div>
  );
}

function statusBadge(s: string | null) {
  if (s === "IN_PROGRESS") return <Badge variant="outline">Em andamento</Badge>;
  if (s === "FINISHED") return <Badge variant="outline">Finalizada</Badge>;
  return s ? <Badge variant="outline">{s}</Badge> : null;
}

export default function MeetingPage() {
  const { meetingId } = useParams<{ meetingId: string }>();

  const [matches, setMatches] = useState<MeetingMatch[]>([]);
  const [stats, setStats] = useState<PlayerStat[]>([]);
  const [groupId, setGroupId] = useState<string>("");

  async function loadGroupId() {
    const { data, error } = await supabase
      .from("meetings")
      .select("group_id")
      .eq("id", meetingId)
      .single();

    if (!error && data?.group_id) setGroupId(data.group_id);
  }

  async function loadSummary() {
    const { data: ms, error: e1 } = await supabase.rpc("get_meeting_matches", {
      p_meeting_id: meetingId,
    });
    if (e1) return alert(e1.message);
    setMatches((ms ?? []) as any);

    const { data: ps, error: e2 } = await supabase.rpc("get_meeting_player_stats", {
      p_meeting_id: meetingId,
    });
    if (e2) return alert(e2.message);
    setStats((ps ?? []) as any);
  }

  const mvp = useMemo(() => (stats.length ? stats[0] : null), [stats]);

  function exportCSV() {
    // inclui GA se existir
    const hasGA = stats.some((s) => typeof s.goals_against === "number");

    const header = hasGA
      ? ["Jogador", "Gols", "Assists", "Defesas", "GA", "Pontos"]
      : ["Jogador", "Gols", "Assists", "Defesas", "Pontos"];

    const rows = stats.map((s) =>
      hasGA
        ? [s.player_name, s.goals, s.assists, s.saves, s.goals_against ?? 0, s.points]
        : [s.player_name, s.goals, s.assists, s.saves, s.points]
    );

    const csv = [header, ...rows]
      .map((r) => r.map((x) => `"${String(x).replaceAll('"', '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `meeting_${meetingId}_stats.csv`;
    a.click();

    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    loadGroupId();
    loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  const hasGA = useMemo(() => stats.some((s) => typeof s.goals_against === "number"), [stats]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 py-4 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs text-muted-foreground">Encontro</div>
              <div className="text-xl font-black">Resumo</div>
            </div>

            <div className="flex gap-2 flex-wrap">
              {groupId && (
                <Button asChild variant="outline">
                  <Link href={`/g/${groupId}`}>Grupo</Link>
                </Button>
              )}
              <Button asChild variant="outline">
                <Link href="/">Home</Link>
              </Button>
              <Button onClick={exportCSV} disabled={stats.length === 0}>
                Exportar CSV
              </Button>
            </div>
          </div>

          {mvp && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Craque do dia (MVP)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-2xl font-black">{mvp.player_name}</div>

                <div className="flex gap-2 flex-wrap">
                  <StatBox label="Pontos" value={mvp.points} />
                  <StatBox label="Gols" value={mvp.goals} />
                  <StatBox label="Assists" value={mvp.assists} />
                  <StatBox label="Defesas" value={mvp.saves} />
                  {typeof mvp.goals_against === "number" && (
                    <StatBox label="GA" value={mvp.goals_against ?? 0} />
                  )}
                </div>

                <div className="text-xs text-muted-foreground">
                  Critério: pontos (G*3 + A*2 + D*1 − GA*1), depois gols/assists/defesas.
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* Rodadas */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-lg">Rodadas</CardTitle>
              <Badge variant="outline">{matches.length} rodada(s)</Badge>
            </div>
          </CardHeader>

          <CardContent>
            {matches.length === 0 ? (
              <div className="text-sm text-muted-foreground">Sem partidas neste encontro.</div>
            ) : (
              <div className="space-y-2">
                {matches.map((m) => (
                  <Card key={m.match_id} className="border">
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="text-sm font-semibold text-muted-foreground">
                          Rodada {m.seq}
                        </div>
                        {statusBadge(m.status)}
                      </div>

                      <div className="text-lg font-black">
                        {m.team_a_name} {m.score_a}{" "}
                        <span className="text-muted-foreground">x</span>{" "}
                        {m.score_b} {m.team_b_name}
                      </div>

                      <div className="text-xs text-muted-foreground">
                        <Link className="underline" href={`/match/${m.match_id}/live`}>
                          Abrir Live
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stats */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-lg">Stats do encontro</CardTitle>
              <Badge variant="outline">{stats.length} jogador(es)</Badge>
            </div>
          </CardHeader>

          <CardContent>
            {stats.length === 0 ? (
              <div className="text-sm text-muted-foreground">Sem stats ainda.</div>
            ) : (
              <>
                {/* Mobile: cards */}
                <div className="md:hidden space-y-2">
                  {stats.map((s, idx) => (
                    <Card key={s.player_id} className="border">
                      <CardContent className="p-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="font-black">
                            #{idx + 1} — {s.player_name}
                          </div>
                          <div className="font-black">{s.points} pts</div>
                        </div>

                        <div className={cn("grid gap-2", hasGA ? "grid-cols-5" : "grid-cols-4")}>
                          <StatBox label="G" value={s.goals} />
                          <StatBox label="A" value={s.assists} />
                          <StatBox label="D" value={s.saves} />
                          {hasGA && <StatBox label="GA" value={s.goals_against ?? 0} />}
                          <StatBox label="Pts" value={s.points} />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Desktop: tabela */}
                <div className="hidden md:block overflow-auto">
                  <table className="min-w-[820px] w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="py-2 pr-3">#</th>
                        <th className="py-2 pr-3">Jogador</th>
                        <th className="py-2 pr-3">Gols</th>
                        <th className="py-2 pr-3">Assists</th>
                        <th className="py-2 pr-3">Defesas</th>
                        {hasGA && <th className="py-2 pr-3">GA</th>}
                        <th className="py-2 pr-3">Pontos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.map((s, idx) => (
                        <tr key={s.player_id} className={cn("border-b", idx === 0 && "bg-muted/40")}>
                          <td className="py-2 pr-3 font-semibold">{idx + 1}</td>
                          <td className="py-2 pr-3 font-black">{s.player_name}</td>
                          <td className="py-2 pr-3">{s.goals}</td>
                          <td className="py-2 pr-3">{s.assists}</td>
                          <td className="py-2 pr-3">{s.saves}</td>
                          {hasGA && <td className="py-2 pr-3">{s.goals_against ?? 0}</td>}
                          <td className="py-2 pr-3 font-black">{s.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <Separator className="my-4" />

                <div className="text-xs text-muted-foreground">
                  Dica: use “Exportar CSV” para mandar no grupo ou guardar histórico.
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}