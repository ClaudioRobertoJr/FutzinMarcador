"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { KeyRound, Undo2, SkipForward, Flag, ClipboardList } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// ─── tipos ────────────────────────────────────────────────────────────────────

type TeamSide = "A" | "B";

type RosterRow = {
  player_id: string;
  side: string;
  players?: { name: string } | null;
};

type StatRow = {
  player_id: string;
  goals: number;
  assists: number;
};

type RecentEvent = {
  id: string;
  type: string;
  side: string | null;
  player_id: string | null;
  assist_id: string | null;
  created_at: string;
  reverted: boolean;
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

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
  } catch { return "#FFFFFF"; }
}

function fmtMs(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function LiveMatchPage() {
  const { matchId } = useParams<{ matchId: string }>();

  // PIN
  const [groupId, setGroupId]     = useState("");
  const [pinInput, setPinInput]   = useState("");
  const [canEdit, setCanEdit]     = useState(false);
  const [pinOpen, setPinOpen]     = useState(false);

  // Match meta
  const [matchInfo, setMatchInfo] = useState<{ seq: number | null; status: string | null }>({ seq: null, status: null });
  const [meta, setMeta] = useState({
    teamA: "Time A", teamB: "Time B", wait: "Time C",
    colorA: "#FACC15", colorB: "#3B82F6", colorC: "#A3A3A3",
  });

  // Score
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);

  // Roster e stats
  const [roster, setRoster]   = useState<RosterRow[]>([]);
  const [stats, setStats]     = useState<Record<string, StatRow>>({});
  const [recent, setRecent]   = useState<RecentEvent[]>([]);
  const [nameById, setNameById] = useState<Record<string, string>>({});

  // UI
  const [mobileTab, setMobileTab]   = useState<TeamSide>("A");
  const [scorerId, setScorerId]     = useState<string | null>(null); // passo 1: quem marcou
  const [scorerSide, setScorerSide] = useState<TeamSide>("A");
  const [assistDialog, setAssistDialog] = useState(false);           // passo 2: quem assistiu
  const [saving, setSaving]         = useState(false);
  const [toast, setToast]           = useState<string | null>(null);

  // Timer
  const [timerAccMs, setTimerAccMs]       = useState(0);
  const [timerOriginMs, setTimerOriginMs] = useState<number | null>(null);
  const [timerRunning, setTimerRunning]   = useState(false);
  const [displayMs, setDisplayMs]         = useState(0);
  const timerSyncRef = useRef(false);

  // ─── PIN ─────────────────────────────────────────────────────────────────

  function pinKey(gid: string) { return `pin:${gid}`; }

  async function validatePin(pin: string): Promise<boolean> {
    const { data: ok } = await supabase.rpc("check_edit_pin_for_match", { p_match_id: matchId, p_pin: pin });
    return !!ok;
  }

  async function unlockEdit() {
    const ok = await validatePin(pinInput);
    if (ok) { localStorage.setItem(pinKey(groupId), pinInput); setCanEdit(true); setPinOpen(false); }
    else alert("PIN incorreto.");
  }

  function lockEdit() {
    localStorage.removeItem(pinKey(groupId));
    setPinInput(""); setCanEdit(false); setPinOpen(false);
  }

  // ─── Timer ───────────────────────────────────────────────────────────────

  useEffect(() => {
    async function loadTimer() {
      const { data } = await supabase.from("matches")
        .select("timer_acc_ms,timer_started_at").eq("id", matchId).single();
      if (data) {
        const acc = data.timer_acc_ms ?? 0;
        const startedAt = data.timer_started_at ? new Date(data.timer_started_at).getTime() : null;
        setTimerAccMs(acc);
        setTimerOriginMs(startedAt);
        setTimerRunning(startedAt !== null);
      }
    }
    loadTimer();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  useEffect(() => {
    if (!timerRunning || timerOriginMs === null) { setDisplayMs(timerAccMs); return; }
    const tick = () => setDisplayMs(timerAccMs + (Date.now() - timerOriginMs));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [timerRunning, timerOriginMs, timerAccMs]);

  async function syncTimer(acc: number, startedAt: number | null) {
    if (timerSyncRef.current || !canEdit) return;
    timerSyncRef.current = true;
    try {
      await supabase.rpc("set_match_timer", {
        p_match_id: matchId,
        p_acc_ms: acc,
        p_started_at: startedAt ? new Date(startedAt).toISOString() : null,
        p_pin: pinInput,
      });
    } finally { timerSyncRef.current = false; }
  }

  function startTimer() {
    if (!canEdit || timerRunning) return;
    const now = Date.now();
    setTimerOriginMs(now); setTimerRunning(true);
    syncTimer(timerAccMs, now);
  }

  function pauseTimer() {
    if (!canEdit || !timerRunning || timerOriginMs === null) return;
    const acc = timerAccMs + (Date.now() - timerOriginMs);
    setTimerAccMs(acc); setTimerOriginMs(null); setTimerRunning(false);
    syncTimer(acc, null);
  }

  function resetTimer() {
    if (!canEdit) return;
    setTimerAccMs(0); setTimerOriginMs(null); setTimerRunning(false); setDisplayMs(0);
    syncTimer(0, null);
  }

  // ─── Carregamento ─────────────────────────────────────────────────────────

  async function loadMatch() {
    const { data: ma } = await supabase
      .from("matches")
      .select("seq,status,score_a,score_b,team_a_name,team_b_name,waiting_team_name,team_a_color,team_b_color,waiting_team_color,meeting_id")
      .eq("id", matchId).single();

    if (!ma) return;

    setMatchInfo({ seq: ma.seq, status: ma.status });
    setScoreA(ma.score_a ?? 0);
    setScoreB(ma.score_b ?? 0);
    setMeta({
      teamA: ma.team_a_name, teamB: ma.team_b_name, wait: ma.waiting_team_name,
      colorA: ma.team_a_color, colorB: ma.team_b_color, colorC: ma.waiting_team_color,
    });

    const { data: meet } = await supabase.from("meetings").select("group_id").eq("id", ma.meeting_id).single();
    if (meet?.group_id) {
      const gid = meet.group_id as string;
      setGroupId(gid);
      const savedPin = localStorage.getItem(pinKey(gid)) || "";
      if (savedPin) {
        setPinInput(savedPin);
        const ok = await validatePin(savedPin);
        setCanEdit(ok);
      }
    }

    // Roster
    const { data: r } = await supabase
      .from("match_roster")
      .select("player_id,side,players(name)")
      .eq("match_id", matchId);

    if (r) {
      setRoster(r as any);
      const nm: Record<string, string> = {};
      (r as any[]).forEach((x) => { if (x.players?.name) nm[x.player_id] = x.players.name; });
      setNameById(nm);
    }

    // Stats
    const { data: st } = await supabase
      .from("match_stats")
      .select("player_id,goals,assists")
      .eq("match_id", matchId);

    if (st) {
      const map: Record<string, StatRow> = {};
      (st as any[]).forEach((s) => { map[s.player_id] = { player_id: s.player_id, goals: s.goals ?? 0, assists: s.assists ?? 0 }; });
      setStats(map);
    }
  }

  const loadEvents = useCallback(async () => {
    const { data } = await supabase.rpc("get_match_recent_events", { p_match_id: matchId, p_limit: 8 });
    if (data) setRecent(data as RecentEvent[]);
  }, [matchId]);

  useEffect(() => {
    loadMatch();
    loadEvents();
    const id = setInterval(loadEvents, 6000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  // ─── Derivados ────────────────────────────────────────────────────────────

  const rosterA = useMemo(() => roster.filter((r) => r.side === "A"), [roster]);
  const rosterB = useMemo(() => roster.filter((r) => r.side === "B"), [roster]);

  // ─── Marcar gol — passo 1: selecionar goleador ───────────────────────────

  function selectScorer(playerId: string, side: TeamSide) {
    if (!canEdit) { setPinOpen(true); return; }
    setScorerId(playerId);
    setScorerSide(side);
    setAssistDialog(true);
  }

  // ─── Marcar gol — passo 2: confirmar com ou sem assistência ─────────────

  async function confirmGoal(assistId: string | null) {
    if (!scorerId) return;
    setSaving(true);
    setAssistDialog(false);
    try {
      const { error } = await supabase.rpc("add_goal_event", {
        p_match_id: matchId,
        p_player_id: scorerId,
        p_assist_id: assistId,
        p_side: scorerSide,
        p_pin: pinInput,
      });
      if (error) { alert(error.message); return; }

      // Atualizar score local
      if (scorerSide === "A") setScoreA((v) => v + 1);
      else setScoreB((v) => v + 1);

      // Atualizar stats local
      setStats((prev) => {
        const next = { ...prev };
        // goleador
        next[scorerId!] = { player_id: scorerId!, goals: (prev[scorerId!]?.goals ?? 0) + 1, assists: prev[scorerId!]?.assists ?? 0 };
        // assistente
        if (assistId) {
          next[assistId] = { player_id: assistId, goals: prev[assistId]?.goals ?? 0, assists: (prev[assistId]?.assists ?? 0) + 1 };
        }
        return next;
      });

      const scorer = nameById[scorerId] ?? "?";
      const assist = assistId ? nameById[assistId] : null;
      showToast(assist ? `Gol de ${scorer} (assist: ${assist})` : `Gol de ${scorer}`);
      await loadEvents();
    } finally {
      setSaving(false);
      setScorerId(null);
    }
  }

  // ─── Desfazer ─────────────────────────────────────────────────────────────

  async function undoLast() {
    if (!canEdit) return;
    const { error } = await supabase.rpc("undo_last_event", { p_match_id: matchId, p_pin: pinInput });
    if (error) { alert(error.message); return; }
    showToast("Último gol desfeito");
    await loadMatch();
    await loadEvents();
  }

  // ─── Próxima rodada / Finalizar ───────────────────────────────────────────

  async function nextRound() {
    if (!canEdit) return;
    const { data, error } = await supabase.rpc("finish_and_create_next_same_roster", { p_match_id: matchId, p_pin: pinInput });
    if (error) { alert(error.message); return; }
    window.location.href = `/match/${data}/live`;
  }

  async function endMeeting() {
    if (!canEdit) return;
    if (!confirm("Finalizar o jogo?")) return;
    const { data, error } = await supabase.rpc("end_match", { p_match_id: matchId, p_pin: pinInput });
    if (error) { alert(error.message); return; }
    window.location.href = `/meeting/${data}`;
  }

  // ─── Toast ────────────────────────────────────────────────────────────────

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  // ─── Render helpers ───────────────────────────────────────────────────────

  const isFinished = matchInfo.status === "FINISHED";

  function PlayerButton({ p, side }: { p: RosterRow; side: TeamSide }) {
    const s = stats[p.player_id];
    const name = p.players?.name ?? p.player_id;
    const color = side === "A" ? meta.colorA : meta.colorB;
    const textColor = contrastText(color);
    return (
      <button
        type="button"
        disabled={!canEdit || saving || isFinished}
        onClick={() => selectScorer(p.player_id, side)}
        className={cn(
          "rounded-xl border p-3 text-left transition-all active:scale-95",
          "flex items-center justify-between gap-2",
          (!canEdit || isFinished) ? "opacity-60" : "hover:ring-2 hover:ring-offset-1 hover:ring-foreground/20"
        )}
        style={{ borderColor: `${color}60`, background: `${color}15` }}
      >
        <div className="min-w-0">
          <div className="font-bold text-sm truncate">{name}</div>
          {(s?.goals || s?.assists) ? (
            <div className="text-xs text-muted-foreground mt-0.5">
              {s.goals > 0 && <span>⚽ {s.goals} </span>}
              {s.assists > 0 && <span>🎯 {s.assists}</span>}
            </div>
          ) : null}
        </div>
        <div
          className="text-xs font-black px-2 py-1 rounded-lg shrink-0"
          style={{ background: color, color: textColor }}
        >
          +GOL
        </div>
      </button>
    );
  }

  function TeamPanel({ side }: { side: TeamSide }) {
    const players = side === "A" ? rosterA : rosterB;
    const color   = side === "A" ? meta.colorA : meta.colorB;
    const name    = side === "A" ? meta.teamA  : meta.teamB;
    const score   = side === "A" ? scoreA      : scoreB;
    const textColor = contrastText(color);

    return (
      <div className="space-y-2">
        <div
          className="rounded-xl px-4 py-2 flex items-center justify-between"
          style={{ background: color, color: textColor }}
        >
          <span className="font-black">{name}</span>
          <span className="text-3xl font-black tabular-nums">{score}</span>
        </div>

        {players.length === 0 ? (
          <div className="text-sm text-muted-foreground p-3">
            Sem jogadores. Configure o{" "}
            <Link href={`/match/${matchId}/setup`} className="underline">Setup</Link>.
          </div>
        ) : (
          <div className="space-y-1.5">
            {players.map((p) => <PlayerButton key={p.player_id} p={p} side={side} />)}
          </div>
        )}
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const assistCandidates = useMemo(() => {
    if (!scorerId || !assistDialog) return [];
    const side = scorerSide;
    return roster.filter((r) => r.side === side && r.player_id !== scorerId);
  }, [scorerId, scorerSide, roster, assistDialog]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur pt-[env(safe-area-inset-top)]">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs text-muted-foreground">Rodada {matchInfo.seq ?? "—"}</div>
              <div className="text-2xl font-black tabular-nums">
                {scoreA} <span className="text-muted-foreground text-lg">×</span> {scoreB}
              </div>
            </div>

            {/* Timer */}
            <div className="flex items-center gap-2">
              <div className="text-xl font-black tabular-nums font-mono">{fmtMs(displayMs)}</div>
              <div className="flex gap-1">
                {!timerRunning
                  ? <Button size="sm" variant="outline" className="h-8 text-xs" onClick={startTimer} disabled={!canEdit || isFinished}>▶</Button>
                  : <Button size="sm" variant="outline" className="h-8 text-xs" onClick={pauseTimer} disabled={!canEdit}>⏸</Button>
                }
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={resetTimer} disabled={!canEdit}>↺</Button>
              </div>
            </div>

            <Button variant="outline" size="sm" className="gap-1.5 h-9 shrink-0" onClick={() => setPinOpen(true)}>
              <KeyRound className="h-3.5 w-3.5" />
              <Badge variant={canEdit ? "secondary" : "outline"} className="text-[10px] px-1.5 h-4">
                {canEdit ? "OK" : "—"}
              </Badge>
            </Button>
          </div>

          {/* Nav links */}
          <div className="flex gap-1.5 mt-1.5 flex-wrap">
            {groupId && (
              <Button asChild variant="ghost" size="sm" className="h-7 text-xs px-2 text-muted-foreground">
                <Link href={`/g/${groupId}`}>← Grupo</Link>
              </Button>
            )}
            <Button asChild variant="ghost" size="sm" className="h-7 text-xs px-2 text-muted-foreground">
              <Link href={`/match/${matchId}/setup`}>Setup</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="h-7 text-xs px-2 text-muted-foreground">
              <Link href={`/match/${matchId}/postgame`}>Pós-jogo</Link>
            </Button>
            {isFinished && <Badge variant="outline" className="h-7 text-[10px] px-2 flex items-center">Finalizada</Badge>}
          </div>

          {/* Tabs mobile */}
          <div className="mt-2 md:hidden">
            <Tabs value={mobileTab} onValueChange={(v) => setMobileTab(v as TeamSide)}>
              <TabsList className="w-full">
                <TabsTrigger value="A" className="flex-1">
                  <span className="h-2 w-2 rounded-full mr-1" style={{ background: meta.colorA }} />
                  {meta.teamA} ({scoreA})
                </TabsTrigger>
                <TabsTrigger value="B" className="flex-1">
                  <span className="h-2 w-2 rounded-full mr-1" style={{ background: meta.colorB }} />
                  {meta.teamB} ({scoreB})
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-4 pb-32">
        {/* Desktop: dois times lado a lado */}
        <div className="hidden md:grid md:grid-cols-2 gap-4">
          <TeamPanel side="A" />
          <TeamPanel side="B" />
        </div>

        {/* Mobile: tabs */}
        <div className="md:hidden">
          {mobileTab === "A" ? <TeamPanel side="A" /> : <TeamPanel side="B" />}
        </div>

        {/* Eventos recentes */}
        {recent.filter((e) => !e.reverted).length > 0 && (
          <Card className="mt-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-1.5">
                <ClipboardList className="h-4 w-4" />
                Gols registrados
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-1">
              {recent.filter((e) => !e.reverted).map((ev) => {
                const scorer = ev.player_id ? (nameById[ev.player_id] ?? ev.player_id) : "?";
                const assist = ev.assist_id ? (nameById[ev.assist_id] ?? ev.assist_id) : null;
                const color  = ev.side === "A" ? meta.colorA : ev.side === "B" ? meta.colorB : meta.colorC;
                return (
                  <div key={ev.id} className="flex items-center gap-2 text-sm">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
                    <span className="font-semibold">{scorer}</span>
                    {assist && <span className="text-muted-foreground text-xs">assist: {assist}</span>}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Bottom bar */}
      {!isFinished && (
        <div className="fixed bottom-0 left-0 right-0 z-20 border-t bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
          <div className="max-w-3xl mx-auto px-4 py-3 flex gap-2 flex-wrap">
            <Button variant="outline" className="h-11 gap-1.5 flex-1 min-w-[100px]" onClick={undoLast} disabled={!canEdit || saving}>
              <Undo2 className="h-4 w-4" />
              Desfazer
            </Button>
            <Button variant="outline" className="h-11 gap-1.5 flex-1 min-w-[100px]" onClick={nextRound} disabled={!canEdit || saving}>
              <SkipForward className="h-4 w-4" />
              Próxima
            </Button>
            <Button className="h-11 gap-1.5 flex-1 min-w-[100px]" onClick={endMeeting} disabled={!canEdit || saving}>
              <Flag className="h-4 w-4" />
              Finalizar
            </Button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 pointer-events-none">
          <div className="rounded-2xl border bg-card px-4 py-3 shadow-xl text-sm font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-4">
            <span>⚽</span>
            <span>{toast}</span>
          </div>
        </div>
      )}

      {/* Dialog: selecionar assistente */}
      <Dialog open={assistDialog} onOpenChange={(v) => { if (!v) { setAssistDialog(false); setScorerId(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Gol de <b>{scorerId ? (nameById[scorerId] ?? "?") : "?"}</b> — quem assistiu?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Button className="w-full h-12 text-base" onClick={() => confirmGoal(null)} disabled={saving}>
              Sem assistência
            </Button>
            {assistCandidates.length > 0 && (
              <>
                <div className="text-xs text-center text-muted-foreground">ou escolha o assistente:</div>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {assistCandidates.map((p) => (
                    <Button
                      key={p.player_id}
                      variant="outline"
                      className="w-full h-11 justify-start"
                      onClick={() => confirmGoal(p.player_id)}
                      disabled={saving}
                    >
                      {p.players?.name ?? p.player_id}
                    </Button>
                  ))}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog PIN */}
      <Dialog open={pinOpen} onOpenChange={setPinOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>PIN de edição</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Edição: <b className="text-foreground">{canEdit ? "Liberada" : "Bloqueada"}</b>
            </div>
            <Input
              type="password" placeholder="Digite o PIN" value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && unlockEdit()}
            />
            <div className="flex gap-2">
              <Button onClick={unlockEdit} className="flex-1">Liberar</Button>
              <Button variant="outline" onClick={lockEdit} className="flex-1">Bloquear</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
