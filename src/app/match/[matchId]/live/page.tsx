"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// ─── tipos ────────────────────────────────────────────────────────────────────

type TeamSide = "A" | "B";
type Side3 = "A" | "B" | "C";
type TeamMode = "GOAL" | "SAVE" | "SAVE_HARD" | "SUB";

type RosterRow = {
  player_id: string;
  side: string;
  state: string;
  players?: { name: string; type: string; preferred_pos: string | null } | null;
};

type StatRow = {
  player_id: string;
  goals: number;
  assists: number;
  saves: number;
  hard_saves: number;
};

type RecentEvent = {
  id: string;
  type: string;
  side: string | null;
  player_id: string | null;
  assist_id: string | null;
  out_id: string | null;
  in_id: string | null;
  created_at: string;
  reverted: boolean;
};

// ─── constantes visuais ───────────────────────────────────────────────────────

const CARD_SURFACE =
  "border bg-card/70 backdrop-blur supports-[backdrop-filter]:bg-card/60";

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

function fmtMs(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function statusLabel(s: string | null) {
  if (!s) return "";
  if (s === "IN_PROGRESS") return "Em andamento";
  if (s === "FINISHED") return "Finalizada";
  return s;
}

// ─── StatMini ─────────────────────────────────────────────────────────────────

function StatMini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-muted/50 px-2 py-1">
      <div className="text-[10px] font-semibold text-muted-foreground">{label}</div>
      <div className="text-sm font-black tabular-nums">{value}</div>
    </div>
  );
}

// ─── Toast com botão de Desfazer ──────────────────────────────────────────────
// CORREÇÃO: toast agora exibe botão de desfazer imediatamente após um gol,
// dando 5s para o usuário cancelar sem precisar procurar o botão na tela.

function Toast({
  msg,
  onDone,
  onUndo,
}: {
  msg: string;
  onDone: () => void;
  onUndo?: (() => Promise<void>) | null;
}) {
  const [undoing, setUndoing] = useState(false);

  useEffect(() => {
    if (undoing) return; // se vai desfazer, não auto-fecha
    // CORREÇÃO: aumentado para 5s quando tem undo disponível, 2.4s sem undo
    const t = setTimeout(onDone, onUndo ? 5000 : 2400);
    return () => clearTimeout(t);
  }, [onDone, onUndo, undoing]);

  async function handleUndo() {
    if (!onUndo) return;
    setUndoing(true);
    await onUndo();
    onDone();
  }

  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="rounded-2xl border bg-card px-4 py-3 shadow-xl text-sm font-semibold flex items-center gap-3">
        <span className="text-base">⚽</span>
        <span>{msg}</span>
        {onUndo && !undoing && (
          <button
            onClick={handleUndo}
            className="ml-1 rounded-lg bg-destructive/10 text-destructive px-3 py-1 text-xs font-bold hover:bg-destructive/20 transition-colors"
          >
            Desfazer
          </button>
        )}
        {undoing && <span className="text-xs text-muted-foreground">Desfazendo...</span>}
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function LiveMatchPage() {
  const { matchId } = useParams<{ matchId: string }>();

  // ── confirmação (modal apenas para SUB) ──
  // CORREÇÃO: removido SAVE e SAVE_HARD do modal — registram direto como o GOL
  const [confirm, setConfirm] = useState<
    | null
    | { kind: "SUB"; side: TeamSide; outId: string; inId: string }
  >(null);

  // ── toast com suporte a undo ──
  const [toast, setToast] = useState<{ msg: string; undoFn?: (() => Promise<void>) | null } | null>(null);
  const showToast = useCallback(
    (msg: string, undoFn?: (() => Promise<void>) | null) => setToast({ msg, undoFn }),
    []
  );

  // ── PIN ──
  const [groupId, setGroupId] = useState("");
  const [pinInput, setPinInput] = useState("");
  // CORREÇÃO: canEdit inicia true se houver PIN no localStorage (otimista)
  // e é corrigido após validação assíncrona, evitando flash de botões desabilitados
  const [canEdit, setCanEdit] = useState(false);

  // ── match info ──
  const [matchInfo, setMatchInfo] = useState<{ seq: number | null; status: string | null }>({
    seq: null,
    status: null,
  });

  // ── timer persistido ──
  // CORREÇÃO: timer agora sincroniza com o banco via set_match_timer,
  // permitindo que outros dispositivos vejam o mesmo timer
  const [timerOriginMs, setTimerOriginMs] = useState<number | null>(null);
  const [timerAccMs, setTimerAccMs] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [displayMs, setDisplayMs] = useState(0);
  const timerKey = `timer:${matchId}`;
  // ref para evitar sincronizar com o banco em loop quando chega update via realtime
  const timerSyncInProgress = useRef(false);

  // ── score + roster + stats ──
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [stats, setStats] = useState<Record<string, StatRow>>({});

  // ── events + names ──
  const [recent, setRecent] = useState<RecentEvent[]>([]);
  const [nameById, setNameById] = useState<Record<string, string>>({});

  // ── meta ──
  const [meta, setMeta] = useState({
    teamA: "Time A",
    teamB: "Time B",
    wait: "Time C",
    colorA: "#FACC15",
    colorB: "#3B82F6",
    colorC: "#A3A3A3",
  });

  // ── UI ──
  const [mobileTab, setMobileTab] = useState<TeamSide>("A");
  const [showRotation, setShowRotation] = useState(false);
  const [modeA, setModeA] = useState<TeamMode>("GOAL");
  const [modeB, setModeB] = useState<TeamMode>("GOAL");

  // ── selections A ──
  const [scorerA, setScorerA] = useState("");
  const [assistA, setAssistA] = useState("");
  const [saveA, setSaveA] = useState("");
  const [subOutA, setSubOutA] = useState("");
  const [subInA, setSubInA] = useState("");

  // ── selections B ──
  const [scorerB, setScorerB] = useState("");
  const [assistB, setAssistB] = useState("");
  const [saveB, setSaveB] = useState("");
  const [subOutB, setSubOutB] = useState("");
  const [subInB, setSubInB] = useState("");

  // ── rotação ──
  const [play1, setPlay1] = useState<Side3>("A");
  const [play2, setPlay2] = useState<Side3>("B");
  const [waiting, setWaiting] = useState<Side3>("C");

  // ── derivados roster ──
  const hasTeamC = useMemo(() => roster.some((r) => r.side === "C"), [roster]);
  const onCourtA = useMemo(() => roster.filter((r) => r.side === "A" && r.state === "ON_COURT"), [roster]);
  const onCourtB = useMemo(() => roster.filter((r) => r.side === "B" && r.state === "ON_COURT"), [roster]);
  const benchA = useMemo(() => roster.filter((r) => r.side === "A" && r.state === "BENCH"), [roster]);
  const benchB = useMemo(() => roster.filter((r) => r.side === "B" && r.state === "BENCH"), [roster]);

  const allRoster = useMemo(() => roster.filter((r) => r.side === "A" || r.side === "B"), [roster]);
  const topScorers = useMemo(() => {
    return allRoster
      .map((r) => {
        const s = stats[r.player_id] ?? { goals: 0, assists: 0, saves: 0, hard_saves: 0 };
        return {
          player_id: r.player_id,
          name: r.players?.name ?? r.player_id,
          side: r.side,
          goals: s.goals ?? 0,
          assists: s.assists ?? 0,
          saves: s.saves ?? 0,
          hard_saves: s.hard_saves ?? 0,
        };
      })
      .filter((p) => p.goals > 0 || p.assists > 0 || p.saves > 0 || p.hard_saves > 0)
      .sort((a, b) => b.goals - a.goals || b.assists - a.assists);
  }, [allRoster, stats]);

  const winner = useMemo(() => {
    if (scoreA > scoreB) return "A";
    if (scoreB > scoreA) return "B";
    return null;
  }, [scoreA, scoreB]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Timer — localStorage + sincronização com banco
  // ─────────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    // 1) tenta carregar do banco primeiro (para suporte multi-device)
    async function loadTimerFromDB() {
      const { data, error } = await supabase
        .from("matches")
        .select("timer_acc_ms,timer_started_at")
        .eq("id", matchId)
        .single();

      if (!error && data) {
        const accMs = data.timer_acc_ms ?? 0;
        const startedAt = data.timer_started_at ? new Date(data.timer_started_at).getTime() : null;
        const running = startedAt !== null;

        setTimerAccMs(accMs);
        setTimerOriginMs(startedAt);
        setTimerRunning(running);
        // atualiza localStorage como cache local
        persistTimerLocal(accMs, startedAt, running);
        return;
      }

      // 2) fallback: localStorage se banco falhar
      try {
        const saved = localStorage.getItem(timerKey);
        if (saved) {
          const { acc, origin, running } = JSON.parse(saved);
          setTimerAccMs(acc ?? 0);
          setTimerOriginMs(origin ?? null);
          setTimerRunning(!!running);
        }
      } catch {}
    }

    loadTimerFromDB();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  function persistTimerLocal(acc: number, origin: number | null, running: boolean) {
    try {
      localStorage.setItem(timerKey, JSON.stringify({ acc, origin, running }));
    } catch {}
  }

  async function persistTimer(acc: number, origin: number | null, running: boolean) {
    persistTimerLocal(acc, origin, running);
    // sincroniza com banco se tiver PIN (somente editor pode mudar timer)
    if (!canEdit || !pinInput) return;
    timerSyncInProgress.current = true;
    try {
      await supabase.rpc("set_match_timer", {
        p_match_id: matchId,
        p_acc_ms: acc,
        p_started_at: origin ? new Date(origin).toISOString() : null,
        p_pin: pinInput,
      });
    } catch {}
    timerSyncInProgress.current = false;
  }

  // Display tick
  useEffect(() => {
    const tick = () => {
      if (timerRunning && timerOriginMs !== null) {
        setDisplayMs(timerAccMs + (Date.now() - timerOriginMs));
      } else {
        setDisplayMs(timerAccMs);
      }
    };
    tick();
    if (!timerRunning) return;
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [timerRunning, timerOriginMs, timerAccMs]);

  async function handleTimerToggle() {
    if (timerRunning) {
      const elapsed = timerOriginMs !== null ? Date.now() - timerOriginMs : 0;
      const newAcc = timerAccMs + elapsed;
      setTimerAccMs(newAcc);
      setTimerOriginMs(null);
      setTimerRunning(false);
      await persistTimer(newAcc, null, false);
    } else {
      const origin = Date.now();
      setTimerOriginMs(origin);
      setTimerRunning(true);
      await persistTimer(timerAccMs, origin, true);
    }
  }

  async function handleTimerReset() {
    setTimerAccMs(0);
    setTimerOriginMs(null);
    setTimerRunning(false);
    setDisplayMs(0);
    await persistTimer(0, null, false);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PIN
  // ─────────────────────────────────────────────────────────────────────────────

  function pinKey(gid: string) {
    return `pin:${gid}`;
  }

  async function unlockEdit() {
    if (!groupId) return;
    const { data: ok, error } = await supabase.rpc("check_edit_pin_for_group", {
      p_group_id: groupId,
      p_pin: pinInput,
    });
    // CORREÇÃO: usa showToast em vez de alert() nativo (quebra PWA no iOS)
    if (error) return showToast("Erro ao validar PIN");
    if (ok) {
      localStorage.setItem(pinKey(groupId), pinInput);
      setCanEdit(true);
    } else {
      setCanEdit(false);
      showToast("PIN incorreto ❌");
    }
  }

  function lockEdit() {
    if (!groupId) return;
    localStorage.removeItem(pinKey(groupId));
    setPinInput("");
    setCanEdit(false);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Loaders
  // ─────────────────────────────────────────────────────────────────────────────

  async function loadMatchMeta() {
    const { data, error } = await supabase
      .from("matches")
      .select("seq,status,team_a_name,team_b_name,waiting_team_name,team_a_color,team_b_color,waiting_team_color")
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
      .select("match_id,player_id,goals,assists,saves,hard_saves")
      .eq("match_id", matchId);
    if (error) return;
    const map: Record<string, StatRow> = {};
    (data ?? []).forEach((r: any) => (map[r.player_id] = r));
    setStats(map);
  }

  async function loadRecentEvents() {
    const { data, error } = await supabase.rpc("get_match_recent_events", {
      p_match_id: matchId,
      p_limit: 30,
    });
    if (error) return;

    const evs = (data ?? []) as any[];
    setRecent(evs as RecentEvent[]);

    // CORREÇÃO: só busca nomes que ainda não estão no cache
    const ids = new Set<string>();
    for (const e of evs) {
      if (e.player_id && !nameById[e.player_id]) ids.add(e.player_id);
      if (e.assist_id && !nameById[e.assist_id]) ids.add(e.assist_id);
      if (e.out_id && !nameById[e.out_id]) ids.add(e.out_id);
      if (e.in_id && !nameById[e.in_id]) ids.add(e.in_id);
    }
    if (ids.size === 0) return;

    const { data: ps, error: ep } = await supabase.from("players").select("id,name").in("id", Array.from(ids));
    if (ep) return;
    const map: Record<string, string> = {};
    (ps ?? []).forEach((p: any) => (map[p.id] = p.name));
    setNameById((prev) => ({ ...prev, ...map }));
  }

  // CORREÇÃO: loadGroupAndValidatePin agora inicia canEdit=true otimisticamente
  // se houver PIN salvo, e corrige após validação assíncrona
  async function loadGroupAndValidatePin() {
    const { data: ma, error: ema } = await supabase
      .from("matches")
      .select("meeting_id")
      .eq("id", matchId)
      .single();
    if (ema) return;

    const { data: meet, error: em } = await supabase
      .from("meetings")
      .select("group_id")
      .eq("id", ma.meeting_id)
      .single();
    if (em) return;

    const gid = meet.group_id as string;
    setGroupId(gid);

    const saved = localStorage.getItem(pinKey(gid)) || "";
    setPinInput(saved);

    // otimista: assume válido enquanto valida
    if (saved) setCanEdit(true);

    const { data: ok } = await supabase.rpc("check_edit_pin_for_group", {
      p_group_id: gid,
      p_pin: saved,
    });
    setCanEdit(!!ok);
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

  // ─────────────────────────────────────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────────────────────────────────────

  async function addGoal(side: TeamSide, playerId: string, assistId?: string) {
    if (!canEdit || !playerId) return;
    const finalAssist = assistId && assistId !== playerId ? assistId : null;
    const { error } = await supabase.rpc("add_goal_event", {
      p_match_id: matchId,
      p_side: side,
      p_player_id: playerId,
      p_assist_id: finalAssist,
      p_pin: pinInput,
    });
    // CORREÇÃO: usa toast em vez de alert()
    if (error) return showToast(`Erro: ${error.message}`);

    await Promise.all([loadScore(), loadStats(), loadRecentEvents()]);

    const name = nameById[playerId] ?? playerId;

    // CORREÇÃO: passa undoFn direto no toast — botão de desfazer aparece por 5s
    showToast(`Gol de ${name}! ⚽`, async () => {
      await undoLast();
    });

    if (side === "A") { setScorerA(""); setAssistA(""); }
    else { setScorerB(""); setAssistB(""); }
  }

  async function addSave(side: TeamSide, playerId: string) {
    if (!canEdit || !playerId) return;
    const { error } = await supabase.rpc("add_save_event", {
      p_match_id: matchId,
      p_side: side,
      p_player_id: playerId,
      p_pin: pinInput,
    });
    if (error) return showToast(`Erro: ${error.message}`);
    await Promise.all([loadStats(), loadRecentEvents()]);
    const name = nameById[playerId] ?? playerId;
    showToast(`Defesa de ${name}! 🧤`);
    if (side === "A") setSaveA(""); else setSaveB("");
  }

  async function addHardSave(side: TeamSide, playerId: string) {
    if (!canEdit || !playerId) return;
    const { error } = await supabase.rpc("add_hard_save_event", {
      p_match_id: matchId,
      p_side: side,
      p_player_id: playerId,
      p_pin: pinInput,
    });
    if (error) return showToast(`Erro: ${error.message}`);
    await Promise.all([loadStats(), loadRecentEvents()]);
    const name = nameById[playerId] ?? playerId;
    showToast(`Defesa difícil de ${name}! 🧱`);
    if (side === "A") setSaveA(""); else setSaveB("");
  }

  async function doSub(side: TeamSide, outId: string, inId: string) {
    if (!canEdit || !outId || !inId) return;
    const { error } = await supabase.rpc("add_sub_event", {
      p_match_id: matchId,
      p_side: side,
      p_out_id: outId,
      p_in_id: inId,
      p_pin: pinInput,
    });
    if (error) return showToast(`Erro: ${error.message}`);
    await Promise.all([loadRoster(), loadRecentEvents()]);
    if (side === "A") { setSubOutA(""); setSubInA(""); }
    else { setSubOutB(""); setSubInB(""); }
  }

  async function undoLast() {
    if (!canEdit) return;
    const { error } = await supabase.rpc("undo_last_event", {
      p_match_id: matchId,
      p_pin: pinInput,
    });
    if (error) return showToast(`Erro: ${error.message}`);
    await Promise.all([loadScore(), loadRoster(), loadStats(), loadRecentEvents()]);
    showToast("Último evento desfeito ↩️");
  }

  async function nextRoundSameTeams() {
    if (!canEdit) return;
    const { data, error } = await supabase.rpc("finish_and_create_next_same_roster", {
      p_match_id: matchId,
      p_pin: pinInput,
    });
    if (error) return showToast(`Erro: ${error.message}`);
    window.location.href = `/match/${data}/live`;
  }

  async function nextRoundRotation() {
    if (!canEdit) return;
    if (play1 === play2 || play1 === waiting || play2 === waiting) {
      return showToast("Joga 1, Joga 2 e Espera devem ser diferentes (A/B/C).");
    }
    const { data, error } = await supabase.rpc("finish_and_create_next_with_rotation", {
      p_match_id: matchId,
      p_next_waiting_side: waiting,
      p_playing_side_1: play1,
      p_playing_side_2: play2,
      p_pin: pinInput,
    });
    if (error) return showToast(`Erro: ${error.message}`);
    window.location.href = `/match/${data}/live`;
  }

  async function endThisMatch() {
    if (!canEdit) return;
    const { data, error } = await supabase.rpc("end_match", {
      p_match_id: matchId,
      p_pin: pinInput,
    });
    if (error) return showToast(`Erro: ${error.message}`);
    window.location.href = `/meeting/${data}`;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Effects
  // ─────────────────────────────────────────────────────────────────────────────

  // limpa seleções inválidas ao mudar roster
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

  // load inicial + realtime
  useEffect(() => {
    loadRoster();
    loadScore();
    loadMatchMeta();
    loadGroupAndValidatePin();
    loadStats();
    loadRecentEvents();

    const evCh = supabase
      .channel(`events:${matchId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "events", filter: `match_id=eq.${matchId}` },
        async () => { await Promise.all([loadScore(), loadRoster(), loadStats(), loadRecentEvents()]); })
      .subscribe();

    const matchCh = supabase
      .channel(`match:${matchId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${matchId}` },
        async () => {
          await loadMatchMeta();
          // CORREÇÃO: atualiza timer de outros devices via realtime,
          // mas ignora updates causados pelo próprio device para evitar loop
          if (!timerSyncInProgress.current) {
            const { data } = await supabase
              .from("matches")
              .select("timer_acc_ms,timer_started_at")
              .eq("id", matchId)
              .single();
            if (data) {
              const accMs = data.timer_acc_ms ?? 0;
              const startedAt = data.timer_started_at ? new Date(data.timer_started_at).getTime() : null;
              setTimerAccMs(accMs);
              setTimerOriginMs(startedAt);
              setTimerRunning(startedAt !== null);
            }
          }
        })
      .subscribe();

    const rosterCh = supabase
      .channel(`roster:${matchId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "match_roster", filter: `match_id=eq.${matchId}` },
        async () => { await loadRoster(); })
      .subscribe();

    return () => {
      supabase.removeChannel(evCh);
      supabase.removeChannel(matchCh);
      supabase.removeChannel(rosterCh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────────────────────────

  function renderEvent(e: RecentEvent) {
    const n = (id: string | null) => (id ? nameById[id] ?? id : "-");
    const badge = e.side ? `(${e.side})` : "";
    const undone = e.reverted ? " · desfeito" : "";
    const time = fmtTime(e.created_at);

    if (e.type === "GOAL") {
      const assist = e.assist_id ? ` + ${n(e.assist_id)}` : "";
      return (
        <span className={e.reverted ? "line-through opacity-50" : ""}>
          <span className="mr-1">⚽</span>
          <b>{n(e.player_id)}</b>{assist} {badge}{" "}
          <span className="text-muted-foreground text-[10px]">{time}{undone}</span>
        </span>
      );
    }
    if (e.type === "SAVE") return (
      <span className={e.reverted ? "line-through opacity-50" : ""}>
        <span className="mr-1">🧤</span>
        <b>{n(e.player_id)}</b> {badge}{" "}
        <span className="text-muted-foreground text-[10px]">{time}{undone}</span>
      </span>
    );
    if (e.type === "SAVE_HARD") return (
      <span className={e.reverted ? "line-through opacity-50" : ""}>
        <span className="mr-1">🧱</span>
        <b>{n(e.player_id)}</b> {badge}{" "}
        <span className="text-muted-foreground text-[10px]">{time}{undone}</span>
      </span>
    );
    if (e.type === "SUB") return (
      <span className={e.reverted ? "line-through opacity-50" : ""}>
        <span className="mr-1">🔄</span>
        {n(e.out_id)} → <b>{n(e.in_id)}</b> {badge}{" "}
        <span className="text-muted-foreground text-[10px]">{time}{undone}</span>
      </span>
    );
    return <span>{time} · {e.type}{undone}</span>;
  }

  const playerBtnBase = "rounded-full min-h-[44px] px-4 justify-start";
  const playerBtnSelected =
    "bg-primary text-primary-foreground border-primary ring-2 ring-primary ring-offset-2 ring-offset-background shadow-sm";
  const playerBtnUnselected = "bg-background/60 hover:bg-muted/50";

  // ─────────────────────────────────────────────────────────────────────────────
  // TeamPanel — CORREÇÃO: Defesa e Defesa Difícil registram sem modal (igual ao Gol)
  // ─────────────────────────────────────────────────────────────────────────────

  const TeamPanel = ({
    side, title, color, mode, setMode,
    onCourt, bench,
    scorer, setScorer, assist, setAssist,
    saver, setSaver,
    subOut, setSubOut, subIn, setSubIn,
  }: {
    side: TeamSide; title: string; color: string;
    mode: TeamMode; setMode: (m: TeamMode) => void;
    onCourt: RosterRow[]; bench: RosterRow[];
    scorer: string; setScorer: (v: string) => void;
    assist: string; setAssist: (v: string) => void;
    saver: string; setSaver: (v: string) => void;
    subOut: string; setSubOut: (v: string) => void;
    subIn: string; setSubIn: (v: string) => void;
  }) => {
    const allTeamRoster = useMemo(
      () => roster.filter((r) => r.side === side),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [side, roster]
    );

    return (
      <Card className={CARD_SURFACE}>
        <CardHeader className="pb-3">
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full border" style={{ background: color }} />
                  <CardTitle className="text-lg truncate">{title}</CardTitle>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Em quadra: {onCourt.length} · Banco: {bench.length}
                </div>
              </div>
            </div>

            <Tabs value={mode} onValueChange={(v) => setMode(v as TeamMode)}>
              <div className="-mx-1 overflow-x-auto">
                <TabsList className="w-max min-w-full md:w-auto">
                  <TabsTrigger value="GOAL">Gol</TabsTrigger>
                  <TabsTrigger value="SAVE">
                    <span className="min-[360px]:inline hidden">Defesa</span>
                    <span className="min-[360px]:hidden inline">Def</span>
                  </TabsTrigger>
                  <TabsTrigger value="SAVE_HARD">
                    <span className="min-[360px]:inline hidden">Difícil</span>
                    <span className="min-[360px]:hidden inline">Dif</span>
                  </TabsTrigger>
                  <TabsTrigger value="SUB">Sub</TabsTrigger>
                </TabsList>
              </div>
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
                  ((mode === "SAVE" || mode === "SAVE_HARD") && saver === p.player_id) ||
                  (mode === "SUB" && subOut === p.player_id);

                return (
                  <Button
                    key={p.player_id}
                    type="button"
                    variant="outline"
                    aria-pressed={selected}
                    className={cn(playerBtnBase, selected ? playerBtnSelected : playerBtnUnselected)}
                    onClick={() => {
                      if (mode === "GOAL") {
                        if (!scorer || scorer !== p.player_id) {
                          setScorer(p.player_id);
                          if (assist === p.player_id) setAssist("");
                          return;
                        }
                        setScorer(""); setAssist(""); return;
                      }
                      if (mode === "SAVE" || mode === "SAVE_HARD") {
                        setSaver(saver === p.player_id ? "" : p.player_id); return;
                      }
                      if (mode === "SUB") {
                        setSubOut(subOut === p.player_id ? "" : p.player_id); return;
                      }
                    }}
                  >
                    <span className="truncate max-w-[220px]">{name}</span>
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Assist — só aparece no modo GOL quando já tem marcador */}
          {mode === "GOAL" && scorer && (
            <div className="space-y-2">
              <div className="text-xs font-black text-muted-foreground">ASSISTÊNCIA (opcional)</div>
              <div className="flex flex-wrap gap-2">
                {onCourt
                  .filter((p) => p.player_id !== scorer)
                  .map((p) => {
                    const name = p.players?.name ?? p.player_id;
                    const selected = assist === p.player_id;
                    return (
                      <Button
                        key={p.player_id}
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-pressed={selected}
                        className={cn(
                          "rounded-full min-h-[36px] px-3",
                          selected ? playerBtnSelected : playerBtnUnselected
                        )}
                        onClick={() => setAssist(selected ? "" : p.player_id)}
                      >
                        <span className="truncate max-w-[180px]">{name}</span>
                      </Button>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Sub — entrada (banco) */}
          {mode === "SUB" && subOut && (
            <div className="space-y-2">
              <div className="text-xs font-black">ENTRA (BANCO)</div>
              <div className="flex flex-wrap gap-2">
                {bench.map((p) => {
                  const name = p.players?.name ?? p.player_id;
                  const selected = subIn === p.player_id;
                  return (
                    <Button
                      key={p.player_id}
                      type="button"
                      variant="outline"
                      aria-pressed={selected}
                      className={cn(playerBtnBase, selected ? playerBtnSelected : playerBtnUnselected)}
                      onClick={() => setSubIn(selected ? "" : p.player_id)}
                    >
                      <span className="truncate max-w-[220px]">{p.players?.name ?? p.player_id}</span>
                    </Button>
                  );
                })}
              </div>
            </div>
          )}

          <Separator />

          {/* Botões de registro — CORREÇÃO: SAVE e SAVE_HARD agora são diretos, sem modal */}
          {mode === "GOAL" && (
            <Button
              className="w-full min-h-[44px]"
              disabled={!canEdit || !scorer}
              onClick={async () => {
                if (!scorer) return;
                await ensureNames([scorer, assist || null]);
                await addGoal(side, scorer, assist || undefined);
              }}
            >
              ⚽ Registrar Gol ({side})
            </Button>
          )}

          {mode === "SAVE" && (
            <Button
              className="w-full min-h-[44px]"
              disabled={!canEdit || !saver}
              onClick={async () => {
                if (!saver) return;
                await ensureNames([saver]);
                await addSave(side, saver);
              }}
            >
              🧤 Registrar Defesa ({side})
            </Button>
          )}

          {mode === "SAVE_HARD" && (
            <Button
              className="w-full min-h-[44px]"
              disabled={!canEdit || !saver}
              onClick={async () => {
                if (!saver) return;
                await ensureNames([saver]);
                await addHardSave(side, saver);
              }}
            >
              🧱 Registrar Defesa Difícil ({side})
            </Button>
          )}

          {mode === "SUB" && (
            <Button
              className="w-full min-h-[44px]"
              disabled={!canEdit || !subOut || !subIn}
              onClick={async () => {
                await ensureNames([subOut, subIn]);
                setConfirm({ kind: "SUB", side, outId: subOut, inId: subIn });
              }}
            >
              🔄 Confirmar Sub ({side})
            </Button>
          )}

          {!canEdit && (
            <div className="text-xs text-muted-foreground">
              <Badge variant="secondary" className="mr-2">Somente leitura</Badge>
              Informe o PIN para editar.
            </div>
          )}

          <Separator />

          {/* Stats do time */}
          <div className="space-y-2">
            <div className="text-xs font-black">STATS DO TIME</div>
            <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-2">
              {allTeamRoster.map((p) => {
                const s = stats[p.player_id] ?? { goals: 0, assists: 0, saves: 0, hard_saves: 0 };
                const name = p.players?.name ?? p.player_id;
                return (
                  <div key={p.player_id} className="rounded-xl border bg-muted/30 px-3 py-2">
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-xs font-black truncate">{name}</span>
                      {p.state === "BENCH" && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0">banco</Badge>
                      )}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {(s.goals ?? 0) > 0 && <StatMini label="G" value={s.goals ?? 0} />}
                      {(s.assists ?? 0) > 0 && <StatMini label="A" value={s.assists ?? 0} />}
                      {(s.saves ?? 0) > 0 && <StatMini label="D" value={s.saves ?? 0} />}
                      {(s.hard_saves ?? 0) > 0 && <StatMini label="DD" value={s.hard_saves ?? 0} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  const teamAColor = meta.colorA;
  const teamBColor = meta.colorB;

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* ── Header ── */}
      <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur pt-[env(safe-area-inset-top)]">
        <div className="max-w-5xl mx-auto px-4 py-3 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <a href={`/match/${matchId}/setup`} className="text-muted-foreground hover:text-foreground text-sm shrink-0">
                ← Setup
              </a>
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">
                  {matchInfo.seq ? `Partida ${matchInfo.seq}` : "Partida"} · {statusLabel(matchInfo.status)}
                </div>
                <div className="font-black truncate text-sm">
                  {meta.teamA} vs {meta.teamB}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Timer */}
              <div className="flex items-center gap-1 rounded-xl border bg-muted/50 px-2 py-1">
                <span className="text-sm font-black tabular-nums">{fmtMs(displayMs)}</span>
                <button
                  onClick={handleTimerToggle}
                  disabled={!canEdit}
                  className="rounded px-1 py-0.5 text-xs hover:bg-muted disabled:opacity-40"
                >
                  {timerRunning ? "⏸" : "▶"}
                </button>
                <button
                  onClick={handleTimerReset}
                  disabled={!canEdit}
                  className="rounded px-1 py-0.5 text-xs hover:bg-muted disabled:opacity-40"
                >
                  ↺
                </button>
              </div>

              {/* PIN */}
              <div className="flex items-center gap-1">
                <Input
                  type="password"
                  placeholder="PIN"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && unlockEdit()}
                  className="w-20 h-8 text-xs"
                />
                <Button
                  size="sm"
                  variant={canEdit ? "default" : "outline"}
                  className="h-8 text-xs px-2"
                  onClick={canEdit ? lockEdit : unlockEdit}
                >
                  {canEdit ? "🔓" : "🔒"}
                </Button>
              </div>
            </div>
          </div>

          {/* Tabs mobile A/B */}
          <div className="flex md:hidden">
            <Tabs value={mobileTab} onValueChange={(v) => setMobileTab(v as TeamSide)} className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="A" className="flex-1">
                  <span className="h-2 w-2 rounded-full mr-1" style={{ background: teamAColor }} />
                  {meta.teamA}
                </TabsTrigger>
                <TabsTrigger value="B" className="flex-1">
                  <span className="h-2 w-2 rounded-full mr-1" style={{ background: teamBColor }} />
                  {meta.teamB}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      </div>

      {/* ── Placar ── */}
      <div className="max-w-5xl mx-auto px-4 pt-4">
        <Card
          className="overflow-hidden relative"
          style={{
            background: `linear-gradient(135deg, ${teamAColor}22 0%, transparent 50%, ${teamBColor}22 100%)`,
          }}
        >
          <div className="grid grid-cols-2 divide-x">
            <div className="flex flex-col items-center py-6 px-4">
              <div
                className="text-xs font-black mb-2 truncate max-w-full"
                style={{ color: contrastText(teamAColor) === "#111827" ? teamAColor : "inherit" }}
              >
                {meta.teamA}
              </div>
              <div className={cn("font-black tabular-nums", winner === "A" ? "text-6xl" : "text-5xl")}>
                {scoreA}
              </div>
              {winner === "A" && <div className="text-xs font-black mt-1 opacity-80">▲ VENCENDO</div>}
            </div>
            <div className="flex flex-col items-center py-6 px-4">
              <div
                className="text-xs font-black mb-2 truncate max-w-full"
                style={{ color: contrastText(teamBColor) === "#111827" ? teamBColor : "inherit" }}
              >
                {meta.teamB}
              </div>
              <div className={cn("font-black tabular-nums", winner === "B" ? "text-6xl" : "text-5xl")}>
                {scoreB}
              </div>
              {winner === "B" && <div className="text-xs font-black mt-1 opacity-80">▲ VENCENDO</div>}
            </div>
            <div className="pointer-events-none absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-white/70" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white/70" />
          </div>
        </Card>

        {/* ── Mini-ranking ── */}
        {topScorers.length > 0 && (
          <Card className={cn(CARD_SURFACE, "mt-4")}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Destaques da partida</CardTitle>
            </CardHeader>
            <CardContent className="pb-3">
              <div className="space-y-1">
                {topScorers.slice(0, 5).map((p, i) => (
                  <div key={p.player_id} className="flex items-center gap-3 text-sm">
                    <span className="text-muted-foreground w-4 tabular-nums">{i + 1}</span>
                    <div className="h-2 w-2 rounded-full shrink-0" style={{ background: p.side === "A" ? meta.colorA : meta.colorB }} />
                    <span className="font-black truncate flex-1">{p.name}</span>
                    <div className="flex gap-2 shrink-0">
                      {p.goals > 0 && <span className="text-xs">⚽ {p.goals}</span>}
                      {p.assists > 0 && <span className="text-xs text-muted-foreground">A {p.assists}</span>}
                      {(p.saves + p.hard_saves) > 0 && (
                        <span className="text-xs text-muted-foreground">🧤 {p.saves + p.hard_saves}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Log de eventos ── */}
        <Card className={cn(CARD_SURFACE, "mt-4")}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">Log de eventos</CardTitle>
              <div className="flex gap-2">
                {/* CORREÇÃO: botão de desfazer permanente também disponível no log */}
                <Button
                  variant="destructive"
                  size="sm"
                  className="min-h-[36px]"
                  disabled={!canEdit || recent.filter((e) => !e.reverted).length === 0}
                  onClick={undoLast}
                  type="button"
                >
                  ↩ Desfazer
                </Button>
                <Button variant="outline" size="sm" className="min-h-[36px]" onClick={loadRecentEvents} type="button">
                  Atualizar
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="min-h-[120px] max-h-[30vh] overflow-y-auto pr-1">
              {recent.length === 0 ? (
                <div className="text-sm text-muted-foreground">Sem eventos ainda.</div>
              ) : (
                <ul className="space-y-1">
                  {recent.map((e) => (
                    <li key={e.id} className="text-sm">{renderEvent(e)}</li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Times ── */}
      <div className="max-w-5xl mx-auto px-4 py-4 space-y-4">
        {roster.length === 0 ? (
          <Card className={CARD_SURFACE}>
            <CardContent className="p-4">
              Sem escalação ainda. Abra:{" "}
              <a className="underline" href={`/match/${matchId}/setup`}>Setup da Partida</a>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            <div className={mobileTab === "A" ? "block" : "hidden md:block"}>
              <TeamPanel
                side="A" title={meta.teamA} color={meta.colorA}
                mode={modeA} setMode={setModeA}
                onCourt={onCourtA} bench={benchA}
                scorer={scorerA} setScorer={setScorerA}
                assist={assistA} setAssist={setAssistA}
                saver={saveA} setSaver={setSaveA}
                subOut={subOutA} setSubOut={setSubOutA}
                subIn={subInA} setSubIn={setSubInA}
              />
            </div>
            <div className={mobileTab === "B" ? "block" : "hidden md:block"}>
              <TeamPanel
                side="B" title={meta.teamB} color={meta.colorB}
                mode={modeB} setMode={setModeB}
                onCourt={onCourtB} bench={benchB}
                scorer={scorerB} setScorer={setScorerB}
                assist={assistB} setAssist={setAssistB}
                saver={saveB} setSaver={setSaveB}
                subOut={subOutB} setSubOut={setSubOutB}
                subIn={subInB} setSubIn={setSubInB}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Rodada seguinte / Encerrar ── */}
      {canEdit && (
        <div className="max-w-5xl mx-auto px-4 pb-8 space-y-4">
          <Separator />

          <div className="space-y-3">
            <div className="text-sm font-black">PRÓXIMA RODADA</div>

            <Button className="w-full min-h-[44px]" variant="outline" onClick={nextRoundSameTeams}>
              🔁 Próxima rodada (mesmos times)
            </Button>

            {hasTeamC && (
              <Card className="p-4 space-y-3">
                <div className="text-sm font-black">COM ROTAÇÃO (Time C entra)</div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {(["play1", "play2", "waiting"] as const).map((field) => {
                    const val = field === "play1" ? play1 : field === "play2" ? play2 : waiting;
                    const setVal = field === "play1" ? setPlay1 : field === "play2" ? setPlay2 : setWaiting;
                    const label = field === "play1" ? "Joga 1" : field === "play2" ? "Joga 2" : "Espera";
                    return (
                      <div key={field} className="space-y-1">
                        <div className="font-semibold text-muted-foreground">{label}</div>
                        <div className="flex flex-col gap-1">
                          {(["A", "B", "C"] as Side3[]).map((s) => (
                            <button
                              key={s}
                              onClick={() => setVal(s)}
                              className={cn(
                                "rounded-lg border px-2 py-1 text-xs font-bold transition-colors",
                                val === s ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                              )}
                            >
                              {s === "A" ? meta.teamA : s === "B" ? meta.teamB : meta.wait}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <Button className="w-full min-h-[44px]" onClick={nextRoundRotation}>
                  🔄 Próxima rodada com rotação
                </Button>
              </Card>
            )}

            <Button className="w-full min-h-[44px]" variant="destructive" onClick={endThisMatch}>
              🏁 Encerrar encontro
            </Button>
          </div>
        </div>
      )}

      {/* ── Modal confirmação — somente SUB ── */}
      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Substituição</DialogTitle>
          </DialogHeader>
          <div className="text-sm">
            {confirm?.kind === "SUB" && (
              <>
                Sub ({confirm.side}) · sai{" "}
                <b>{nameById[confirm.outId] ?? confirm.outId}</b> · entra{" "}
                <b>{nameById[confirm.inId] ?? confirm.inId}</b>
              </>
            )}
          </div>
          <div className="flex gap-2 mt-2">
            <Button
              className="flex-1"
              onClick={async () => {
                if (!confirm) return;
                await doSub(confirm.side, confirm.outId, confirm.inId);
                setConfirm(null);
              }}
            >
              Confirmar
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setConfirm(null)}>
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Toast ── */}
      {toast && (
        <Toast
          msg={toast.msg}
          onUndo={toast.undoFn}
          onDone={() => setToast(null)}
        />
      )}
    </main>
  );
}