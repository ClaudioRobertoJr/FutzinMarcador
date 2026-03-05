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
  hard_saves?: number; // DD
  goals_against?: number; // pode existir, mas não entra no cálculo
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

function calcPoints(goals: number, assists: number, saves: number, hard_saves: number) {
  const pts = goals * 2 + assists * 1 + saves * 0.25 + hard_saves * 1;
  return Number(pts.toFixed(2));
}

function fmtDateTimeBR(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

export default function MeetingPage() {
  const { meetingId } = useParams<{ meetingId: string }>();

  const [matches, setMatches] = useState<MeetingMatch[]>([]);
  const [stats, setStats] = useState<PlayerStat[]>([]);
  const [groupId, setGroupId] = useState<string>("");
  const [meetingStartsAt, setMeetingStartsAt] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  async function loadGroupId() {
    const { data, error } = await supabase
      .from("meetings")
      .select("group_id, starts_at")
      .eq("id", meetingId)
      .single();

    if (!error && data?.group_id) setGroupId(data.group_id);
    if (!error && data?.starts_at) setMeetingStartsAt(data.starts_at);
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

    // normaliza + recalcula (se a RPC já vier certo, continua ok)
    let list = (ps ?? []) as any[];

    list = list.map((s: any) => {
      const goals = Number(s.goals ?? 0);
      const assists = Number(s.assists ?? 0);
      const saves = Number(s.saves ?? 0);
      const hard_saves = Number(s.hard_saves ?? 0);
      const goals_against = s.goals_against != null ? Number(s.goals_against) : undefined;

      return {
        ...s,
        goals,
        assists,
        saves,
        hard_saves,
        goals_against,
        points: Number(s.points ?? calcPoints(goals, assists, saves, hard_saves)),
      } as PlayerStat;
    });

    list.sort((a: PlayerStat, b: PlayerStat) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goals !== a.goals) return b.goals - a.goals;
      if (b.assists !== a.assists) return b.assists - a.assists;
      if ((b.hard_saves ?? 0) !== (a.hard_saves ?? 0)) return (b.hard_saves ?? 0) - (a.hard_saves ?? 0);
      if (b.saves !== a.saves) return b.saves - a.saves;
      return (a.player_name ?? "").localeCompare(b.player_name ?? "");
    });

    setStats(list as any);
  }

  const mvp = useMemo(() => (stats.length ? stats[0] : null), [stats]);
  const top5 = useMemo(() => stats.slice(0, 5), [stats]);

  function exportCSV() {
    const hasGA = stats.some((s) => typeof s.goals_against === "number");
    const header = hasGA
      ? ["Jogador", "Gols", "Assists", "Defesas", "DD", "GA", "Pontos"]
      : ["Jogador", "Gols", "Assists", "Defesas", "DD", "Pontos"];

    const rows = stats.map((s) => {
      const dd = Number(s.hard_saves ?? 0);
      const ga = Number(s.goals_against ?? 0);
      return hasGA
        ? [s.player_name, s.goals, s.assists, s.saves, dd, ga, s.points]
        : [s.player_name, s.goals, s.assists, s.saves, dd, s.points];
    });

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

  async function shareTop5PNG() {
    if (sharing) return;
    setSharing(true);
    try {
      const el = document.getElementById("share-top5");
      if (!el) {
        alert("Card de compartilhamento não encontrado.");
        return;
      }

      // precisa: npm i html-to-image
      const { toPng } = await import("html-to-image");

      const dataUrl = await toPng(el, {
        cacheBust: true,
        pixelRatio: 2,
        // mantém o fundo do card na imagem
        backgroundColor: "#0b0b0b",
      });

      const blob = await (await fetch(dataUrl)).blob();
      const fileName = `futzin_meeting_${meetingId}_top5.png`;
      const file = new File([blob], fileName, { type: "image/png" });

      // Share (mobile) -> WhatsApp aparece no menu
      const canShareFiles =
        typeof navigator !== "undefined" &&
        "share" in navigator &&
        // @ts-ignore
        (!navigator.canShare || navigator.canShare({ files: [file] }));

      if (canShareFiles) {
        // @ts-ignore
        await navigator.share({
          files: [file],
          title: "Futzin Marcador",
          text: "Resumo Top 5",
        });
        return;
      }

      // fallback: download
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = fileName;
      a.click();
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setSharing(false);
    }
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
              {meetingStartsAt && (
                <div className="text-xs text-muted-foreground mt-1">Data: {fmtDateTimeBR(meetingStartsAt)}</div>
              )}
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
                  <StatBox label="DD" value={Number(mvp.hard_saves ?? 0)} />
                  {typeof mvp.goals_against === "number" && <StatBox label="GA" value={mvp.goals_against ?? 0} />}
                </div>

                <div className="text-xs text-muted-foreground">
                  Critério: points = (G*2) + (A*1) + (D*0.25) + (DD*1).
                </div>
              </CardContent>
            </Card>
          )}

          {/* Card que vira imagem */}
          {top5.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-base">Resumo para compartilhar (Top 5)</CardTitle>
                  <Button onClick={shareTop5PNG} disabled={sharing}>
                    {sharing ? "Gerando..." : "Compartilhar PNG (Top 5)"}
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                {/* ESTE BLOCO É O QUE VIRA PNG */}
                <div
                  id="share-top5"
                  className="rounded-2xl border p-4"
                  style={{
                    background: "#0b0b0b",
                    color: "white",
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs opacity-80">Futzin Marcador</div>
                      <div className="text-lg font-black">Top 5 do Encontro</div>
                      <div className="text-xs opacity-80">
                        {meetingStartsAt ? fmtDateTimeBR(meetingStartsAt) : `ID: ${meetingId}`}
                      </div>
                    </div>
                    <div className="text-xs opacity-80 text-right">
                      <div>Critério</div>
                      <div className="font-semibold">G*2 + A*1 + D*0.25 + DD*1</div>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-white/15 overflow-hidden">
                    <div className="grid grid-cols-[32px_1fr_64px_40px_40px_40px_40px] gap-0 text-[11px] bg-white/10 px-2 py-2">
                      <div className="opacity-80">#</div>
                      <div className="opacity-80">Jogador</div>
                      <div className="opacity-80 text-right">Pts</div>
                      <div className="opacity-80 text-right">G</div>
                      <div className="opacity-80 text-right">A</div>
                      <div className="opacity-80 text-right">D</div>
                      <div className="opacity-80 text-right">DD</div>
                    </div>

                    {top5.map((p, idx) => {
                      const isMvp = idx === 0;
                      return (
                        <div
                          key={p.player_id}
                          className={cn(
                            "grid grid-cols-[32px_1fr_64px_40px_40px_40px_40px] gap-0 px-2 py-2 border-t border-white/10",
                            isMvp && "bg-white/10"
                          )}
                        >
                          <div className={cn("text-[12px]", isMvp && "font-black")}>{idx + 1}</div>
                          <div className={cn("text-[12px] truncate", isMvp && "font-black")}>
                            {p.player_name} {isMvp ? " (MVP)" : ""}
                          </div>
                          <div className={cn("text-right text-[12px]", isMvp && "font-black")}>{p.points}</div>
                          <div className="text-right text-[12px]">{p.goals}</div>
                          <div className="text-right text-[12px]">{p.assists}</div>
                          <div className="text-right text-[12px]">{p.saves}</div>
                          <div className="text-right text-[12px]">{Number(p.hard_saves ?? 0)}</div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-3 text-[11px] opacity-80">
                    Compartilhe este card no WhatsApp como imagem.
                  </div>
                </div>

                <div className="text-xs text-muted-foreground">
                  No celular, use “Compartilhar PNG (Top 5)” e selecione WhatsApp.
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
                        <div className="text-sm font-semibold text-muted-foreground">Rodada {m.seq}</div>
                        {statusBadge(m.status)}
                      </div>

                      <div className="text-lg font-black">
                        {m.team_a_name} {m.score_a} <span className="text-muted-foreground">x</span> {m.score_b}{" "}
                        {m.team_b_name}
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

                        <div className={cn("grid gap-2", hasGA ? "grid-cols-6" : "grid-cols-5")}>
                          <StatBox label="G" value={s.goals} />
                          <StatBox label="A" value={s.assists} />
                          <StatBox label="D" value={s.saves} />
                          <StatBox label="DD" value={Number(s.hard_saves ?? 0)} />
                          {hasGA && <StatBox label="GA" value={s.goals_against ?? 0} />}
                          <StatBox label="Pts" value={s.points} />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Desktop: tabela */}
                <div className="hidden md:block overflow-auto">
                  <table className="min-w-[920px] w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="py-2 pr-3">#</th>
                        <th className="py-2 pr-3">Jogador</th>
                        <th className="py-2 pr-3">Gols</th>
                        <th className="py-2 pr-3">Assists</th>
                        <th className="py-2 pr-3">Defesas</th>
                        <th className="py-2 pr-3">DD</th>
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
                          <td className="py-2 pr-3">{Number(s.hard_saves ?? 0)}</td>
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