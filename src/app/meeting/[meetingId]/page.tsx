"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Share2, ChevronRight } from "lucide-react";

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
  goals_against?: number;
  points: number;
};

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border px-3 py-2">
      <div className="text-[10px] font-semibold text-muted-foreground">{label}</div>
      <div className="text-lg font-black tabular-nums">{value}</div>
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

function ShareTop5CardCapture({
  top5,
  meetingStartsAt,
  meetingId,
}: {
  top5: PlayerStat[];
  meetingStartsAt: string | null;
  meetingId: string;
}) {
  const dateLabel = meetingStartsAt ? fmtDateTimeBR(meetingStartsAt) : `ID: ${meetingId}`;

  return (
    <div
      style={{
        width: 1080,
        height: 1080,
        padding: 44,
        borderRadius: 48,
        color: "#fff",
        background: "linear-gradient(135deg, #0b0b0b 0%, #141414 45%, #0b0b0b 100%)",
        border: "2px solid rgba(255,255,255,0.10)",
        boxSizing: "border-box",
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24 }}>
        <div>
          <div style={{ fontSize: 22, opacity: 0.85 }}>Futzin Marcador</div>
          <div style={{ fontSize: 64, fontWeight: 900, marginTop: 6, lineHeight: 1.05 }}>Top 5 do</div>
          <div style={{ fontSize: 64, fontWeight: 900, lineHeight: 1.05 }}>Jogo</div>
          <div style={{ fontSize: 28, opacity: 0.85, marginTop: 10 }}>{dateLabel}</div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 20, opacity: 0.85 }}>Critério</div>
          <div style={{ fontSize: 28, fontWeight: 800, opacity: 0.95, marginTop: 6 }}>G*2 + A*1 + D*0.25 +</div>
          <div style={{ fontSize: 28, fontWeight: 800, opacity: 0.95 }}>DD*1</div>
        </div>
      </div>

      <div
        style={{
          marginTop: 34,
          borderRadius: 28,
          border: "2px solid rgba(255,255,255,0.12)",
          overflow: "hidden",
          background: "rgba(255,255,255,0.04)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "80px 1fr 120px 220px",
            gap: 0,
            padding: "18px 22px",
            background: "rgba(255,255,255,0.08)",
            fontSize: 22,
            opacity: 0.9,
            fontWeight: 700,
          }}
        >
          <div>#</div>
          <div>Jogador</div>
          <div style={{ textAlign: "right" }}>Pts</div>
          <div style={{ textAlign: "right" }}>G / A / D / DD</div>
        </div>

        {top5.map((p, idx) => {
          const isMvp = idx === 0;
          const dd = Number(p.hard_saves ?? 0);

          return (
            <div
              key={p.player_id}
              style={{
                display: "grid",
                gridTemplateColumns: "80px 1fr 120px 220px",
                gap: 0,
                padding: "18px 22px",
                borderTop: "1px solid rgba(255,255,255,0.10)",
                background: isMvp ? "rgba(255,255,255,0.08)" : "transparent",
              }}
            >
              <div style={{ fontSize: 30, fontWeight: isMvp ? 900 : 700 }}>{idx + 1}</div>

              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 34, fontWeight: isMvp ? 900 : 800, lineHeight: 1.15 }}>
                  {p.player_name}
                  {isMvp ? " (MVP)" : ""}
                </div>
              </div>

              <div style={{ textAlign: "right", fontSize: 40, fontWeight: isMvp ? 900 : 800 }}>{p.points}</div>

              <div style={{ textAlign: "right", fontSize: 26, opacity: 0.95, fontWeight: 700 }}>
                {p.goals} / {p.assists} / {p.saves} / {dd}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 28, fontSize: 22, opacity: 0.85 }}>Compartilhe este card no WhatsApp como imagem.</div>
    </div>
  );
}

export default function MeetingPage() {
  const { meetingId } = useParams<{ meetingId: string }>();

  const [matches, setMatches] = useState<MeetingMatch[]>([]);
  const [stats, setStats] = useState<PlayerStat[]>([]);
  const [groupId, setGroupId] = useState<string>("");
  const [meetingStartsAt, setMeetingStartsAt] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const [matchMetaById, setMatchMetaById] = useState<Record<string, { colorA: string; colorB: string }>>({});

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
    const { data: ms, error: e1 } = await supabase.rpc("get_meeting_matches", { p_meeting_id: meetingId });
    if (e1) return alert(e1.message);
    setMatches((ms ?? []) as any);

    const matchIds = (ms ?? []).map((m: any) => m.match_id).filter(Boolean);
    if (matchIds.length) {
      const { data: metas, error: em } = await supabase
        .from("matches")
        .select("id,team_a_color,team_b_color")
        .in("id", matchIds);

      if (!em && metas) {
        const map: Record<string, { colorA: string; colorB: string }> = {};
        (metas as any[]).forEach((x) => {
          map[x.id] = {
            colorA: x.team_a_color ?? "#FACC15",
            colorB: x.team_b_color ?? "#3B82F6",
          };
        });
        setMatchMetaById(map);
      }
    }

    const { data: ps, error: e2 } = await supabase.rpc("get_meeting_player_stats", { p_meeting_id: meetingId });
    if (e2) return alert(e2.message);

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
    const hasGA2 = stats.some((s) => typeof s.goals_against === "number");
    const header = hasGA2
      ? ["Jogador", "Gols", "Assists", "Defesas", "DD", "GA", "Pontos"]
      : ["Jogador", "Gols", "Assists", "Defesas", "DD", "Pontos"];

    const rows = stats.map((s) => {
      const dd = Number(s.hard_saves ?? 0);
      const ga = Number(s.goals_against ?? 0);
      return hasGA2
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
    if (!top5.length) return;

    setSharing(true);
    try {
      const el = document.getElementById("share-top5-capture");
      if (!el) {
        alert("Card de captura não encontrado.");
        return;
      }

      const { toPng } = await import("html-to-image");

      const dataUrl = await toPng(el, {
        cacheBust: true,
        pixelRatio: 2,
        width: 1080,
        height: 1080,
      });

      const blob = await (await fetch(dataUrl)).blob();
      const fileName = `futzin_meeting_${meetingId}_top5.png`;
      const file = new File([blob], fileName, { type: "image/png" });

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
      <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur pt-[env(safe-area-inset-top)]">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs text-muted-foreground">Jogo</div>
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
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* MVP com contraste bom no dark: fundo amarelo + ring */}
        {mvp && (
          <Card className="border-yellow-400/60 bg-yellow-500/10 shadow-sm ring-1 ring-yellow-500/20">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-base flex items-center gap-2">
                  <span>🏆</span> Craque do dia (MVP)
                </CardTitle>
                <Badge variant="outline" className="border-yellow-400/70 text-yellow-400">
                  MVP
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-3">
              <div className="text-2xl font-black">{mvp.player_name}</div>

              {/* Stats em grid (não quebra feio no mobile) */}
              <div className={cn("grid gap-2", hasGA ? "grid-cols-3 sm:grid-cols-6" : "grid-cols-3 sm:grid-cols-5")}>
                <StatBox label="Pontos" value={mvp.points} />
                <StatBox label="Gols" value={mvp.goals} />
                <StatBox label="Assists" value={mvp.assists} />
                <StatBox label="Defesas" value={mvp.saves} />
                <StatBox label="DD" value={Number(mvp.hard_saves ?? 0)} />
                {typeof mvp.goals_against === "number" && <StatBox label="GA" value={mvp.goals_against ?? 0} />}
              </div>

              <div className="text-xs text-muted-foreground">Critério: points = (G*2) + (A*1) + (D*0.25) + (DD*1).</div>
            </CardContent>
          </Card>
        )}

        {/* Share destacado (ação importante) */}
        {top5.length > 0 && (
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-base">Compartilhar Top 5</CardTitle>
                <Badge variant="outline" className="text-muted-foreground">
                  PNG 1080×1080
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-3">
              <div className="text-sm text-muted-foreground">
                Gera uma imagem legível para WhatsApp e abre o compartilhamento no celular.
              </div>

              <Button size="lg" className="w-full min-h-[48px] gap-2" onClick={shareTop5PNG} disabled={sharing}>
                <Share2 className="h-4 w-4" />
                {sharing ? "Gerando..." : "Compartilhar PNG (Top 5)"}
              </Button>

              <div className="text-xs text-muted-foreground flex items-center gap-1">
                Dica: se o share do navegador não abrir, o app baixa a imagem automaticamente.
                <ChevronRight className="h-3 w-3" />
              </div>
            </CardContent>
          </Card>
        )}

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
              <div className="text-sm text-muted-foreground">Sem partidas neste Jogo.</div>
            ) : (
              <div className="space-y-2">
                {matches.map((m) => {
                  const metaColors = matchMetaById[m.match_id];
                  const colorA = metaColors?.colorA ?? "#FACC15";
                  const colorB = metaColors?.colorB ?? "#3B82F6";

                  return (
                    <Card key={m.match_id} className="border shadow-sm">
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="text-sm font-semibold text-muted-foreground">Rodada {m.seq}</div>
                          {statusBadge(m.status)}
                        </div>

                        <div className="text-lg font-black flex items-center gap-2 flex-wrap">
                          <span className="h-2.5 w-2.5 rounded-full border" style={{ background: colorA }} />
                          <span>{m.team_a_name}</span>
                          <span className="tabular-nums">{m.score_a}</span>
                          <span className="text-muted-foreground">x</span>
                          <span className="tabular-nums">{m.score_b}</span>
                          <span className="h-2.5 w-2.5 rounded-full border" style={{ background: colorB }} />
                          <span>{m.team_b_name}</span>
                        </div>

                        <div className="flex gap-3 text-xs text-muted-foreground">
                          <Link className="underline" href={`/match/${m.match_id}/postgame`}>
                            Pós-jogo
                          </Link>
                          <Link className="underline" href={`/match/${m.match_id}/live`}>
                            Live
                          </Link>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stats */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-lg">Stats da partida</CardTitle>
              <Badge variant="outline">{stats.length} jogador(es)</Badge>
            </div>
          </CardHeader>

          <CardContent>
            {stats.length === 0 ? (
              <div className="text-sm text-muted-foreground">Sem stats ainda.</div>
            ) : (
              <>
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

                        <div className={cn("grid gap-2", hasGA ? "grid-cols-3" : "grid-cols-3")}>
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

                {/* Desktop table com indicador de scroll */}
                <div className="hidden md:block relative">
                  {/* sombras laterais indicam scroll horizontal */}
                  <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-background to-transparent" />
                  <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent" />

                  <div className="overflow-x-auto">
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

                  <div className="mt-2 text-xs text-muted-foreground">Dica: role horizontalmente para ver todas as colunas.</div>
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

      {/* Card de captura OFFSCREEN (tamanho fixo para PNG legível) */}
      {top5.length > 0 && (
        <div style={{ position: "fixed", left: -10000, top: 0, width: 1080, height: 1080, zIndex: -1 }}>
          <div id="share-top5-capture">
            <ShareTop5CardCapture top5={top5} meetingStartsAt={meetingStartsAt} meetingId={meetingId} />
          </div>
        </div>
      )}
    </main>
  );
}