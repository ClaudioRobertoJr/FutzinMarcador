"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// shadcn/ui
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";

type Side3 = "A" | "B" | "C";
type TeamSide = "A" | "B";
type TeamMode = "GOAL" | "SAVE" | "SUB";
type Pos = "GK" | "FIXO" | "ALA_E" | "ALA_D" | "PIVO";

type RosterRow = {
  player_id: string;
  side: Side3;
  state: "ON_COURT" | "BENCH";
  players: { name: string; type: "FIXO" | "COMPLETE"; preferred_pos: Pos | null } | null;
};

type StatRow = {
  match_id: string;
  player_id: string;
  goals: number;
  assists: number;
  saves: number;
};

type RecentEvent = {
  id: string;
  created_at: string;
  type: "GOAL" | "SAVE" | "SUB";
  side: TeamSide | null;
  player_id: string | null;
  assist_id: string | null;
  out_id: string | null;
  in_id: string | null;
  reverted: boolean | null;
};

const CARD_SURFACE =
  "border bg-card/70 backdrop-blur supports-[backdrop-filter]:bg-card/60 hover:bg-card hover:shadow-md transition";
const CARD_SURFACE_STATIC =
  "border bg-card/70 backdrop-blur supports-[backdrop-filter]:bg-card/60";

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function contrastText(hex: string) {
  try {
    const { r, g, b } = hexToRgb(hex);
    const L = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return L > 0.6 ? "#111827" : "#FFFFFF";
  } catch {
    return "#111827";
  }
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function statusLabel(s: string | null) {
  if (!s) return "";
  if (s === "IN_PROGRESS") return "Em andamento";
  if (s === "FINISHED") return "Finalizada";
  return s;
}

function StatMini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-muted/50 px-2 py-1">
      <div className="text-[10px] font-semibold text-muted-foreground">{label}</div>
      <div className="text-sm font-black tabular-nums">{value}</div>
    </div>
  );
}

export default function LiveMatchPage() {
  const { matchId } = useParams<{ matchId: string }>();

  // confirmação (modal)
  const [confirm, setConfirm] = useState<
    | null
    | { kind: "GOAL"; side: TeamSide; playerId: string; assistId: string | null }
    | { kind: "SAVE"; side: TeamSide; playerId: string }
    | { kind: "SUB"; side: TeamSide; outId: string; inId: string }
  >(null);

  // PIN
  const [groupId, setGroupId] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [canEdit, setCanEdit] = useState(false);

  // match info
  const [matchInfo, setMatchInfo] = useState<{ seq: number | null; status: string | null }>({
    seq: null,
    status: null,
  });

  // timer
  const [timerMs, setTimerMs] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);

  function fmt(ms: number) {
    const total = Math.floor(ms / 1000);
    const m = String(Math.floor(total / 60)).padStart(2, "0");
    const s = String(total % 60).padStart(2, "0");
    return `${m}:${s}`;
  }

  // score + roster + stats
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [stats, setStats] = useState<Record<string, StatRow>>({});

  // recent events + names
  const [recent, setRecent] = useState<RecentEvent[]>([]);
  const [nameById, setNameById] = useState<Record<string, string>>({});

  // meta
  const [meta, setMeta] = useState({
    teamA: "Time A",
    teamB: "Time B",
    wait: "Time C",
    colorA: "#FACC15",
    colorB: "#3B82F6",
    colorC: "#A3A3A3",
  });

  // UI
  const [mobileTab, setMobileTab] = useState<TeamSide>("A");
  const [showRotation, setShowRotation] = useState(false);

  const [modeA, setModeA] = useState<TeamMode>("GOAL");
  const [modeB, setModeB] = useState<TeamMode>("GOAL");

  // selections A
  const [scorerA, setScorerA] = useState("");
  const [assistA, setAssistA] = useState("");
  const [saveA, setSaveA] = useState("");
  const [subOutA, setSubOutA] = useState("");
  const [subInA, setSubInA] = useState("");

  // selections B
  const [scorerB, setScorerB] = useState("");
  const [assistB, setAssistB] = useState("");
  const [saveB, setSaveB] = useState("");
  const [subOutB, setSubOutB] = useState("");
  const [subInB, setSubInB] = useState("");

  // rotação (3 times)
  const [play1, setPlay1] = useState<Side3>("A");
  const [play2, setPlay2] = useState<Side3>("B");
  const [waiting, setWaiting] = useState<Side3>("C");

  const hasTeamC = useMemo(() => roster.some((r) => r.side === "C"), [roster]);

  const onCourtA = useMemo(
    () => roster.filter((r) => r.side === "A" && r.state === "ON_COURT"),
    [roster]
  );
  const onCourtB = useMemo(
    () => roster.filter((r) => r.side === "B" && r.state === "ON_COURT"),
    [roster]
  );
  const benchA = useMemo(() => roster.filter((r) => r.side === "A" && r.state === "BENCH"), [roster]);
  const benchB = useMemo(() => roster.filter((r) => r.side === "B" && r.state === "BENCH"), [roster]);

  function pinKey(gid: string) {
    return `pin:${gid}`;
  }

  async function ensureNames(ids: Array<string | null | undefined>) {
    const missing = ids.filter((x): x is string => !!x).filter((id) => !nameById[id]);
    if (missing.length === 0) return;

    const { data, error } = await supabase.from("players").select("id,name").in("id", missing);
    if (error) return;

    const map: Record<string, string> = {};
    (data ?? []).forEach((p: any) => (map[p.id] = p.name));
    setNameById((prev) => ({ ...prev, ...map }));
  }

  async function loadMatchMeta() {
    const { data, error } = await supabase
      .from("matches")
      .select(
        "seq,status,team_a_name,team_b_name,waiting_team_name,team_a_color,team_b_color,waiting_team_color"
      )
      .eq("id", matchId)
      .single();
    if (error) return;

    setMatchInfo({ seq: data.seq ?? null, status: data.status ?? null });

    setMeta({
      teamA: data.team_a_name ?? "Time A",
      teamB: data.team_b_name ?? "Time B",
      wait: data.waiting_team_name ?? "Time C",
      colorA: data.team_a_color ?? "#FACC15",
      colorB: data.team_b_color ?? "#3B82F6",
      colorC: data.waiting_team_color ?? "#A3A3A3",
    });
  }

  async function loadScore() {
    const { data, error } = await supabase
      .from("v_match_score")
      .select("score_a,score_b")
      .eq("match_id", matchId)
      .maybeSingle();
    if (error) return;
    setScoreA(data?.score_a ?? 0);
    setScoreB(data?.score_b ?? 0);
  }

  async function loadRoster() {
    const { data, error } = await supabase
      .from("match_roster")
      .select("player_id,side,state,players(name,type,preferred_pos)")
      .eq("match_id", matchId);

    if (!error && data) setRoster(data as any);
  }

  async function loadStats() {
    const { data, error } = await supabase
      .from("v_match_player_stats")
      .select("match_id,player_id,goals,assists,saves")
      .eq("match_id", matchId);

    if (error) return;

    const map: Record<string, StatRow> = {};
    (data ?? []).forEach((r: any) => (map[r.player_id] = r));
    setStats(map);
  }

  async function loadRecentEvents() {
    const { data, error } = await supabase.rpc("get_match_recent_events", {
      p_match_id: matchId,
      p_limit: 10,
    });
    if (error) return;

    const evs = (data ?? []) as any[];
    setRecent(evs as RecentEvent[]);

    const ids = new Set<string>();
    for (const e of evs) {
      if (e.player_id) ids.add(e.player_id);
      if (e.assist_id) ids.add(e.assist_id);
      if (e.out_id) ids.add(e.out_id);
      if (e.in_id) ids.add(e.in_id);
    }
    if (ids.size === 0) return;

    const { data: ps, error: ep } = await supabase.from("players").select("id,name").in("id", Array.from(ids));
    if (ep) return;

    const map: Record<string, string> = {};
    (ps ?? []).forEach((p: any) => (map[p.id] = p.name));
    setNameById((prev) => ({ ...prev, ...map }));
  }

  async function loadGroupAndValidatePin() {
    const { data: ma, error: ema } = await supabase.from("matches").select("meeting_id").eq("id", matchId).single();
    if (ema) return alert(ema.message);

    const { data: meet, error: em } = await supabase
      .from("meetings")
      .select("group_id")
      .eq("id", ma.meeting_id)
      .single();
    if (em) return alert(em.message);

    const gid = meet.group_id as string;
    setGroupId(gid);

    const saved = localStorage.getItem(pinKey(gid)) || "";
    setPinInput(saved);

    const { data: ok, error } = await supabase.rpc("check_edit_pin_for_group", {
      p_group_id: gid,
      p_pin: saved,
    });
    if (error) return alert(error.message);
    setCanEdit(!!ok);
  }

  async function unlockEdit() {
    if (!groupId) return;

    const { data: ok, error } = await supabase.rpc("check_edit_pin_for_group", {
      p_group_id: groupId,
      p_pin: pinInput,
    });
    if (error) return alert(error.message);

    if (ok) {
      localStorage.setItem(pinKey(groupId), pinInput);
      setCanEdit(true);
    } else {
      setCanEdit(false);
      alert("PIN incorreto.");
    }
  }

  function lockEdit() {
    if (!groupId) return;
    localStorage.removeItem(pinKey(groupId));
    setPinInput("");
    setCanEdit(false);
  }

  // --- actions ---
  async function addGoal(side: TeamSide, playerId: string, assistId?: string) {
    if (!canEdit) return;
    if (!playerId) return;

    const finalAssist = assistId && assistId !== playerId ? assistId : null;

    const { error } = await supabase.rpc("add_goal_event", {
      p_match_id: matchId,
      p_side: side,
      p_player_id: playerId,
      p_assist_id: finalAssist,
      p_pin: pinInput,
    });
    if (error) return alert(error.message);

    await loadScore();
    await loadStats();
    await loadRecentEvents();
  }

  async function addSave(side: TeamSide, playerId: string) {
    if (!canEdit) return;
    if (!playerId) return;

    const { error } = await supabase.rpc("add_save_event", {
      p_match_id: matchId,
      p_side: side,
      p_player_id: playerId,
      p_pin: pinInput,
    });
    if (error) return alert(error.message);

    await loadStats();
    await loadRecentEvents();
  }

  async function doSub(side: TeamSide, outId: string, inId: string) {
    if (!canEdit) return;
    if (!outId || !inId) return;

    const { error } = await supabase.rpc("add_sub_event", {
      p_match_id: matchId,
      p_side: side,
      p_out_id: outId,
      p_in_id: inId,
      p_pin: pinInput,
    });
    if (error) return alert(error.message);

    await loadRoster();
    await loadRecentEvents();
  }

  async function undoLast() {
    if (!canEdit) return;

    const { error } = await supabase.rpc("undo_last_event", {
      p_match_id: matchId,
      p_pin: pinInput,
    });
    if (error) return alert(error.message);

    await loadScore();
    await loadRoster();
    await loadStats();
    await loadRecentEvents();
  }

  async function nextRoundSameTeams() {
    if (!canEdit) return;

    const { data, error } = await supabase.rpc("finish_and_create_next_same_roster", {
      p_match_id: matchId,
      p_pin: pinInput,
    });
    if (error) return alert(error.message);

    window.location.href = `/match/${data}/live`;
  }

  async function nextRoundRotation() {
    if (!canEdit) return;

    if (play1 === play2 || play1 === waiting || play2 === waiting) {
      return alert("Joga 1, Joga 2 e Espera devem ser diferentes (A/B/C).");
    }

    const { data, error } = await supabase.rpc("finish_and_create_next_with_rotation", {
      p_match_id: matchId,
      p_next_waiting_side: waiting,
      p_playing_side_1: play1,
      p_playing_side_2: play2,
      p_pin: pinInput,
    });
    if (error) return alert(error.message);

    window.location.href = `/match/${data}/live`;
  }

  async function endThisMatch() {
    if (!canEdit) return;

    const { data, error } = await supabase.rpc("end_match", {
      p_match_id: matchId,
      p_pin: pinInput,
    });
    if (error) return alert(error.message);

    window.location.href = `/meeting/${data}`;
  }

  // manter seleções válidas
  useEffect(() => {
    const idsA = new Set(onCourtA.map((x) => x.player_id));
    const idsB = new Set(onCourtB.map((x) => x.player_id));
    const benchIdsA = new Set(benchA.map((x) => x.player_id));
    const benchIdsB = new Set(benchB.map((x) => x.player_id));

    if (scorerA && !idsA.has(scorerA)) setScorerA("");
    if (assistA && !idsA.has(assistA)) setAssistA("");
    if (saveA && !idsA.has(saveA)) setSaveA("");
    if (subOutA && !idsA.has(subOutA)) setSubOutA("");
    if (subInA && !benchIdsA.has(subInA)) setSubInA("");

    if (scorerB && !idsB.has(scorerB)) setScorerB("");
    if (assistB && !idsB.has(assistB)) setAssistB("");
    if (saveB && !idsB.has(saveB)) setSaveB("");
    if (subOutB && !idsB.has(subOutB)) setSubOutB("");
    if (subInB && !benchIdsB.has(subInB)) setSubInB("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster]);

  // timer
  useEffect(() => {
    if (!timerRunning) return;
    const t = setInterval(() => setTimerMs((v) => v + 250), 250);
    return () => clearInterval(t);
  }, [timerRunning]);

  // load + realtime
  useEffect(() => {
    loadRoster();
    loadScore();
    loadMatchMeta();
    loadGroupAndValidatePin();
    loadStats();
    loadRecentEvents();

    const ev = supabase
      .channel(`events:${matchId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events", filter: `match_id=eq.${matchId}` },
        async () => {
          await loadScore();
          await loadRoster();
          await loadStats();
          await loadRecentEvents();
        }
      )
      .subscribe();

    const matchCh = supabase
      .channel(`match:${matchId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${matchId}` },
        async () => {
          await loadMatchMeta();
        }
      )
      .subscribe();

    const rosterCh = supabase
      .channel(`roster:${matchId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "match_roster", filter: `match_id=eq.${matchId}` },
        async () => {
          await loadRoster();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ev);
      supabase.removeChannel(matchCh);
      supabase.removeChannel(rosterCh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  function renderEvent(e: RecentEvent) {
    const n = (id: string | null) => (id ? nameById[id] ?? id : "-");
    const badge = e.side ? `(${e.side})` : "";
    const undone = e.reverted ? " • desfeito" : "";

    if (e.type === "GOAL") {
      const assist = e.assist_id ? ` (assist ${n(e.assist_id)})` : "";
      return `${fmtTime(e.created_at)} • Gol ${badge} ${n(e.player_id)}${assist}${undone}`;
    }
    if (e.type === "SAVE") return `${fmtTime(e.created_at)} • Defesa ${badge} ${n(e.player_id)}${undone}`;
    if (e.type === "SUB")
      return `${fmtTime(e.created_at)} • Sub ${badge} sai ${n(e.out_id)} entra ${n(e.in_id)}${undone}`;
    return `${fmtTime(e.created_at)} • ${e.type}${undone}`;
  }

  const TeamPanel = ({
    side,
    title,
    color,
    mode,
    setMode,
    onCourt,
    bench,
    scorer,
    setScorer,
    assist,
    setAssist,
    saver,
    setSaver,
    subOut,
    setSubOut,
    subIn,
    setSubIn,
  }: {
    side: TeamSide;
    title: string;
    color: string;
    mode: TeamMode;
    setMode: (m: TeamMode) => void;
    onCourt: RosterRow[];
    bench: RosterRow[];
    scorer: string;
    setScorer: (v: string) => void;
    assist: string;
    setAssist: (v: string) => void;
    saver: string;
    setSaver: (v: string) => void;
    subOut: string;
    setSubOut: (v: string) => void;
    subIn: string;
    setSubIn: (v: string) => void;
  }) => {
    return (
      <Card className={CARD_SURFACE}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full border" style={{ background: color }} />
                <CardTitle className="text-lg">{title}</CardTitle>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Em quadra: {onCourt.length} · Banco: {bench.length}
              </div>
            </div>

            <Tabs value={mode} onValueChange={(v) => setMode(v as TeamMode)}>
              <TabsList>
                <TabsTrigger value="GOAL">Gol</TabsTrigger>
                <TabsTrigger value="SAVE">Defesa</TabsTrigger>
                <TabsTrigger value="SUB">Sub</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="space-y-2">
            <div className="text-xs font-black">EM QUADRA</div>
            <div className="flex flex-wrap gap-2">
              {onCourt.map((p) => {
                const name = p.players?.name ?? p.player_id;
                const selected =
                  (mode === "GOAL" && scorer === p.player_id) ||
                  (mode === "SAVE" && saver === p.player_id) ||
                  (mode === "SUB" && subOut === p.player_id);

                return (
                  <Button
                    key={p.player_id}
                    type="button"
                    variant={selected ? "default" : "outline"}
                    className="rounded-full"
                    onClick={() => {
                      if (mode === "GOAL") {
                        if (!scorer || scorer !== p.player_id) {
                          setScorer(p.player_id);
                          if (assist === p.player_id) setAssist("");
                          return;
                        }
                        setScorer("");
                        setAssist("");
                        return;
                      }
                      if (mode === "SAVE") {
                        setSaver(saver === p.player_id ? "" : p.player_id);
                        return;
                      }
                      if (mode === "SUB") {
                        setSubOut(subOut === p.player_id ? "" : p.player_id);
                        return;
                      }
                    }}
                  >
                    {name}
                  </Button>
                );
              })}
            </div>
          </div>

          {mode === "GOAL" && scorer && (
            <div className="space-y-2">
              <div className="text-xs font-black">ASSISTÊNCIA (opcional)</div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={!assist ? "default" : "outline"}
                  className="rounded-full"
                  onClick={() => setAssist("")}
                >
                  Sem assist
                </Button>

                {onCourt
                  .filter((p) => p.player_id !== scorer)
                  .map((p) => (
                    <Button
                      key={p.player_id}
                      type="button"
                      variant={assist === p.player_id ? "default" : "outline"}
                      className="rounded-full"
                      onClick={() => setAssist(assist === p.player_id ? "" : p.player_id)}
                    >
                      {p.players?.name ?? p.player_id}
                    </Button>
                  ))}
              </div>
            </div>
          )}

          {mode === "SUB" && (
            <div className="space-y-2">
              <div className="text-xs font-black">BANCO</div>
              <div className="flex flex-wrap gap-2">
                {bench.map((p) => (
                  <Button
                    key={p.player_id}
                    type="button"
                    variant={subIn === p.player_id ? "default" : "outline"}
                    className="rounded-full"
                    onClick={() => setSubIn(subIn === p.player_id ? "" : p.player_id)}
                  >
                    {p.players?.name ?? p.player_id}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <Separator />

          {mode === "GOAL" && (
            <Button
              className="w-full"
              disabled={!canEdit || !scorer}
              onClick={async () => {
                if (!scorer) return;
                await ensureNames([scorer, assist || null]);
                setConfirm({ kind: "GOAL", side, playerId: scorer, assistId: assist || null });
              }}
            >
              Registrar Gol ({side})
            </Button>
          )}

          {mode === "SAVE" && (
            <Button
              className="w-full"
              disabled={!canEdit || !saver}
              onClick={async () => {
                if (!saver) return;
                await ensureNames([saver]);
                setConfirm({ kind: "SAVE", side, playerId: saver });
              }}
            >
              Registrar Defesa ({side})
            </Button>
          )}

          {mode === "SUB" && (
            <Button
              className="w-full"
              disabled={!canEdit || !subOut || !subIn}
              onClick={async () => {
                await ensureNames([subOut, subIn]);
                setConfirm({ kind: "SUB", side, outId: subOut, inId: subIn });
              }}
            >
              Confirmar Sub ({side})
            </Button>
          )}

          {!canEdit && (
            <div className="text-xs text-muted-foreground">
              <Badge variant="secondary" className="mr-2">
                Somente leitura
              </Badge>
              Informe o PIN para editar.
            </div>
          )}

          <Separator />

          <div className="space-y-2">
            <div className="text-xs font-black">STATS (EM QUADRA)</div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {onCourt.map((p) => {
                const s = stats[p.player_id] ?? ({ goals: 0, assists: 0, saves: 0 } as any);
                const name = p.players?.name ?? p.player_id;

                return (
                  <Card key={p.player_id} className={CARD_SURFACE_STATIC}>
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-black leading-tight">{name}</div>
                        <Badge variant="secondary">{p.players?.preferred_pos ?? "-"}</Badge>
                      </div>

                      <div className="mt-2 flex gap-2">
                        <StatMini label="G" value={s.goals ?? 0} />
                        <StatMini label="A" value={s.assists ?? 0} />
                        <StatMini label="D" value={s.saves ?? 0} />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Header sticky */}
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 py-3 space-y-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs text-muted-foreground">
                Partida ao vivo
                {matchInfo.seq != null && (
                  <>
                    {" "}
                    • Rodada <b className="text-foreground">{matchInfo.seq}</b>
                  </>
                )}
                {matchInfo.status && (
                  <>
                    {" "}
                    • <b className="text-foreground">{statusLabel(matchInfo.status)}</b>
                  </>
                )}
              </div>

              <div className="text-3xl font-black tracking-tight">
                {meta.teamA} {scoreA} <span className="text-muted-foreground">x</span> {scoreB} {meta.teamB}
              </div>
            </div>

            <Card className={CARD_SURFACE_STATIC}>
              <CardContent className="p-2">
                <div className="flex items-center gap-2">
                  <div className="font-black tabular-nums">{fmt(timerMs)}</div>
                  <Button variant="outline" size="sm" onClick={() => setTimerRunning((v) => !v)}>
                    {timerRunning ? "Pausar" : "Iniciar"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setTimerMs(0)}>
                    Zerar
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={undoLast} disabled={!canEdit}>
                Desfazer
              </Button>

              <Button onClick={nextRoundSameTeams} disabled={!canEdit}>
                Próxima (mesmos)
              </Button>

              <Button variant="outline" onClick={endThisMatch} disabled={!canEdit}>
                Encerrar
              </Button>

              {hasTeamC && (
                <Button variant="outline" onClick={() => setShowRotation((v) => !v)}>
                  Rotação
                </Button>
              )}
            </div>
          </div>

          {/* PIN row */}
          <Card className={CARD_SURFACE_STATIC}>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="text-sm text-muted-foreground">
                  Edição: <b className="text-foreground">{canEdit ? "LIBERADA" : "SOMENTE LEITURA"}</b>
                </div>

                <Input
                  type="password"
                  className="w-44"
                  placeholder="PIN do grupo"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                />

                <Button onClick={unlockEdit}>Liberar</Button>
                <Button variant="outline" onClick={lockEdit}>
                  Bloquear
                </Button>

                <div className="ml-auto flex items-center gap-3 text-sm">
                  <a className="underline" href={`/match/${matchId}/setup`}>
                    Setup
                  </a>
                  <a className="underline" href={`/g/${groupId}`}>
                    Grupo
                  </a>
                  <a className="underline" href={`/`}>
                    Home
                  </a>
                </div>
              </div>

              <div className="mt-3 md:hidden">
                <Tabs value={mobileTab} onValueChange={(v) => setMobileTab(v as TeamSide)}>
                  <TabsList className="w-full">
                    <TabsTrigger className="flex-1" value="A">
                      {meta.teamA}
                    </TabsTrigger>
                    <TabsTrigger className="flex-1" value="B">
                      {meta.teamB}
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardContent>
          </Card>

          {/* Rotation panel */}
          {hasTeamC && showRotation && (
            <Card className={CARD_SURFACE}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Próxima rodada (3 times / rotação)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid md:grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Joga 1</div>
                    <select
                      className="h-10 w-full rounded-md border bg-background/70 px-3"
                      value={play1}
                      onChange={(e) => setPlay1(e.target.value as Side3)}
                    >
                      <option value="A">A</option>
                      <option value="B">B</option>
                      <option value="C">C</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Joga 2</div>
                    <select
                      className="h-10 w-full rounded-md border bg-background/70 px-3"
                      value={play2}
                      onChange={(e) => setPlay2(e.target.value as Side3)}
                    >
                      <option value="A">A</option>
                      <option value="B">B</option>
                      <option value="C">C</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Espera</div>
                    <select
                      className="h-10 w-full rounded-md border bg-background/70 px-3"
                      value={waiting}
                      onChange={(e) => setWaiting(e.target.value as Side3)}
                    >
                      <option value="A">A</option>
                      <option value="B">B</option>
                      <option value="C">C</option>
                    </select>
                  </div>
                </div>

                <Button className="w-full" onClick={nextRoundRotation} disabled={!canEdit}>
                  Encerrar 10min e iniciar próxima (rotação)
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Campo */}
      <div className="max-w-5xl mx-auto px-4 pt-4 space-y-3">
        <Card className={`${CARD_SURFACE_STATIC} overflow-hidden`}>
          <div className="relative grid grid-cols-2">
            <div style={{ background: meta.colorA, color: contrastText(meta.colorA) }} className="p-5">
              <div className="text-sm font-black opacity-90">Time A</div>
              <div className="text-2xl font-black leading-tight">{meta.teamA}</div>
              <div className="mt-2 text-5xl font-black tabular-nums">{scoreA}</div>
            </div>

            <div style={{ background: meta.colorB, color: contrastText(meta.colorB) }} className="p-5 text-right">
              <div className="text-sm font-black opacity-90">Time B</div>
              <div className="text-2xl font-black leading-tight">{meta.teamB}</div>
              <div className="mt-2 text-5xl font-black tabular-nums">{scoreB}</div>
            </div>

            <div className="pointer-events-none absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 bg-white/70" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white/70" />
          </div>
        </Card>

        {/* Últimos eventos */}
        <Card className={CARD_SURFACE}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">Últimos eventos</CardTitle>
              <Button variant="outline" size="sm" onClick={loadRecentEvents}>
                Atualizar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <div className="text-sm text-muted-foreground">Sem eventos ainda.</div>
            ) : (
              <ul className="space-y-1">
                {recent.map((e) => (
                  <li key={e.id} className="text-sm">
                    {renderEvent(e)}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Conteúdo */}
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {roster.length === 0 ? (
          <Card className={CARD_SURFACE}>
            <CardContent className="p-4">
              Sem escalação ainda. Abra:{" "}
              <a className="underline" href={`/match/${matchId}/setup`}>
                Setup da Partida
              </a>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            <div className={mobileTab === "A" ? "block" : "hidden md:block"}>
              <TeamPanel
                side="A"
                title={meta.teamA}
                color={meta.colorA}
                mode={modeA}
                setMode={setModeA}
                onCourt={onCourtA}
                bench={benchA}
                scorer={scorerA}
                setScorer={setScorerA}
                assist={assistA}
                setAssist={setAssistA}
                saver={saveA}
                setSaver={setSaveA}
                subOut={subOutA}
                setSubOut={setSubOutA}
                subIn={subInA}
                setSubIn={setSubInA}
              />
            </div>

            <div className={mobileTab === "B" ? "block" : "hidden md:block"}>
              <TeamPanel
                side="B"
                title={meta.teamB}
                color={meta.colorB}
                mode={modeB}
                setMode={setModeB}
                onCourt={onCourtB}
                bench={benchB}
                scorer={scorerB}
                setScorer={setScorerB}
                assist={assistB}
                setAssist={setAssistB}
                saver={saveB}
                setSaver={setSaveB}
                subOut={subOutB}
                setSubOut={setSubOutB}
                subIn={subInB}
                setSubIn={setSubInB}
              />
            </div>
          </div>
        )}
      </div>

      {/* Modal de confirmação */}
      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar</DialogTitle>
          </DialogHeader>

          <div className="text-sm">
            {confirm?.kind === "GOAL" && (
              <>
                Gol ({confirm.side}) de <b>{nameById[confirm.playerId] ?? confirm.playerId}</b>
                {confirm.assistId ? (
                  <>
                    {" "}
                    com assist de <b>{nameById[confirm.assistId] ?? confirm.assistId}</b>
                  </>
                ) : (
                  <> (sem assist)</>
                )}
              </>
            )}

            {confirm?.kind === "SAVE" && (
              <>
                Defesa ({confirm.side}) de <b>{nameById[confirm.playerId] ?? confirm.playerId}</b>
              </>
            )}

            {confirm?.kind === "SUB" && (
              <>
                Sub ({confirm.side}) sai <b>{nameById[confirm.outId] ?? confirm.outId}</b> entra{" "}
                <b>{nameById[confirm.inId] ?? confirm.inId}</b>
              </>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirm(null)}>
              Cancelar
            </Button>

            <Button
              className="flex-1"
              onClick={async () => {
                const c = confirm;
                setConfirm(null);
                if (!c) return;

                if (c.kind === "GOAL") await addGoal(c.side, c.playerId, c.assistId || undefined);
                if (c.kind === "SAVE") await addSave(c.side, c.playerId);
                if (c.kind === "SUB") await doSub(c.side, c.outId, c.inId);
              }}
            >
              Confirmar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}