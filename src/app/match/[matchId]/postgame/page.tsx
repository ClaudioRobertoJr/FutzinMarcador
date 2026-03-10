"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { KeyRound, Minus, Plus, Save, SkipForward, Flag, ChevronLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// ─── tipos ────────────────────────────────────────────────────────────────────

type StatKey = "goals" | "assists" | "saves" | "hard_saves";

type PlayerEntry = {
  player_id: string;
  name: string;
  side: "A" | "B" | "C";
  goals: number;
  assists: number;
  saves: number;
  hard_saves: number;
};

type MatchMeta = {
  meeting_id: string;
  seq: number;
  status: string | null;
  team_a_name: string;
  team_b_name: string;
  waiting_team_name: string;
  team_a_color: string;
  team_b_color: string;
  waiting_team_color: string;
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
  } catch {
    return "#FFFFFF";
  }
}

const STAT_LABELS: Record<StatKey, string> = {
  goals: "G",
  assists: "A",
  saves: "D",
  hard_saves: "DD",
};

const STAT_FULL: Record<StatKey, string> = {
  goals: "Gols",
  assists: "Assistências",
  saves: "Defesas",
  hard_saves: "Defesas Difíceis",
};

// ─── Componente StatCounter ───────────────────────────────────────────────────

function StatCounter({
  label,
  value,
  onDec,
  onInc,
  disabled,
}: {
  label: string;
  value: number;
  onDec: () => void;
  onInc: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[10px] font-bold text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={disabled || value === 0}
          onClick={onDec}
          className={cn(
            "h-9 w-9 rounded-xl border flex items-center justify-center transition-colors",
            "bg-muted/50 hover:bg-muted active:scale-95",
            (disabled || value === 0) && "opacity-30 cursor-not-allowed"
          )}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="w-8 text-center text-base font-black tabular-nums">{value}</span>
        <button
          type="button"
          disabled={disabled}
          onClick={onInc}
          className={cn(
            "h-9 w-9 rounded-xl border flex items-center justify-center transition-colors",
            "bg-muted/50 hover:bg-muted active:scale-95",
            disabled && "opacity-30 cursor-not-allowed"
          )}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Componente PlayerRow ─────────────────────────────────────────────────────

function PlayerRow({
  player,
  canEdit,
  onAdjust,
}: {
  player: PlayerEntry;
  canEdit: boolean;
  onAdjust: (playerId: string, stat: StatKey, delta: number) => void;
}) {
  const pts =
    player.goals * 2 +
    player.assists * 1 +
    player.saves * 0.25 +
    player.hard_saves * 1;

  const hasStats =
    player.goals > 0 ||
    player.assists > 0 ||
    player.saves > 0 ||
    player.hard_saves > 0;

  return (
    <div
      className={cn(
        "rounded-xl border p-3 transition-colors",
        hasStats ? "bg-muted/30" : "bg-transparent"
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="font-bold text-sm truncate">{player.name}</span>
        {hasStats && (
          <Badge variant="outline" className="shrink-0 text-xs font-black tabular-nums">
            {pts % 1 === 0 ? pts : pts.toFixed(2)} pts
          </Badge>
        )}
      </div>

      <div className="flex gap-3 flex-wrap">
        {(["goals", "assists", "saves", "hard_saves"] as StatKey[]).map((stat) => (
          <StatCounter
            key={stat}
            label={STAT_LABELS[stat]}
            value={player[stat]}
            onDec={() => onAdjust(player.player_id, stat, -1)}
            onInc={() => onAdjust(player.player_id, stat, 1)}
            disabled={!canEdit}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Seção por time ───────────────────────────────────────────────────────────

function TeamSection({
  name,
  color,
  players,
  scoreLabel,
  canEdit,
  onAdjust,
}: {
  name: string;
  color: string;
  players: PlayerEntry[];
  scoreLabel: string;
  canEdit: boolean;
  onAdjust: (playerId: string, stat: StatKey, delta: number) => void;
}) {
  if (players.length === 0) return null;

  const textColor = contrastText(color);

  return (
    <Card className="overflow-hidden">
      <div
        className="px-4 py-3 flex items-center justify-between gap-2"
        style={{ background: color, color: textColor }}
      >
        <div className="font-black text-base">{name}</div>
        <div
          className="text-2xl font-black tabular-nums rounded-lg px-3 py-0.5"
          style={{ background: "rgba(0,0,0,0.2)" }}
        >
          {scoreLabel}
        </div>
      </div>

      <CardContent className="p-3 space-y-2">
        {players.map((p) => (
          <PlayerRow key={p.player_id} player={p} canEdit={canEdit} onAdjust={onAdjust} />
        ))}
      </CardContent>
    </Card>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function PostGamePage() {
  const { matchId } = useParams<{ matchId: string }>();

  const [meta, setMeta] = useState<MatchMeta | null>(null);
  const [players, setPlayers] = useState<PlayerEntry[]>([]);
  const [groupId, setGroupId] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [finishing, setFinishing] = useState(false);

  function pinKey(gid: string) {
    return `pin:${gid}`;
  }

  async function validatePin(pin: string): Promise<boolean> {
    const { data: ok, error } = await supabase.rpc("check_edit_pin_for_match", {
      p_match_id: matchId,
      p_pin: pin,
    });
    if (error) return false;
    return !!ok;
  }

  async function loadData() {
    const { data: ma, error: ema } = await supabase
      .from("matches")
      .select(
        "meeting_id,seq,status,team_a_name,team_b_name,waiting_team_name,team_a_color,team_b_color,waiting_team_color"
      )
      .eq("id", matchId)
      .single();

    if (ema) {
      alert(ema.message);
      return;
    }

    setMeta(ma as MatchMeta);

    const { data: meet } = await supabase
      .from("meetings")
      .select("group_id")
      .eq("id", ma.meeting_id)
      .single();

    const gid = meet?.group_id as string;
    setGroupId(gid);

    const savedPin = localStorage.getItem(pinKey(gid)) || "";
    if (savedPin) {
      setPinInput(savedPin);
      const ok = await validatePin(savedPin);
      setCanEdit(ok);
    }

    const { data: roster, error: er } = await supabase
      .from("match_roster")
      .select("player_id,side,players(name)")
      .eq("match_id", matchId);

    if (er) {
      alert(er.message);
      return;
    }

    const { data: existingStats } = await supabase
      .from("match_stats")
      .select("player_id,goals,assists,saves,hard_saves")
      .eq("match_id", matchId);

    const statsMap: Record<string, { goals: number; assists: number; saves: number; hard_saves: number }> = {};
    for (const s of existingStats ?? []) {
      statsMap[(s as any).player_id] = {
        goals: (s as any).goals ?? 0,
        assists: (s as any).assists ?? 0,
        saves: (s as any).saves ?? 0,
        hard_saves: (s as any).hard_saves ?? 0,
      };
    }

    const entries: PlayerEntry[] = (roster as any[])
      .filter((r) => r.side === "A" || r.side === "B" || r.side === "C")
      .map((r) => ({
        player_id: r.player_id,
        name: r.players?.name ?? r.player_id,
        side: r.side as "A" | "B" | "C",
        goals: statsMap[r.player_id]?.goals ?? 0,
        assists: statsMap[r.player_id]?.assists ?? 0,
        saves: statsMap[r.player_id]?.saves ?? 0,
        hard_saves: statsMap[r.player_id]?.hard_saves ?? 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    setPlayers(entries);
  }

  async function unlockEdit() {
    const ok = await validatePin(pinInput);
    if (ok) {
      localStorage.setItem(pinKey(groupId), pinInput);
      setCanEdit(true);
      setPinOpen(false);
    } else {
      alert("PIN incorreto.");
    }
  }

  function lockEdit() {
    localStorage.removeItem(pinKey(groupId));
    setPinInput("");
    setCanEdit(false);
    setPinOpen(false);
  }

  function adjustStat(playerId: string, stat: StatKey, delta: number) {
    if (!canEdit) return;
    setPlayers((prev) =>
      prev.map((p) =>
        p.player_id === playerId ? { ...p, [stat]: Math.max(0, p[stat] + delta) } : p
      )
    );
    setSaved(false);
  }

  async function doSave(): Promise<boolean> {
    if (!canEdit) {
      alert("Informe o PIN para salvar.");
      return false;
    }
    setSaving(true);
    try {
      for (const p of players) {
        const { error } = await supabase.from("match_stats").upsert(
          {
            match_id: matchId,
            player_id: p.player_id,
            goals: p.goals,
            assists: p.assists,
            saves: p.saves,
            hard_saves: p.hard_saves,
          },
          { onConflict: "match_id,player_id" }
        );
        if (error) {
          alert(`Erro ao salvar ${p.name}: ${error.message}`);
          return false;
        }
      }

      const scoreA = players.filter((p) => p.side === "A").reduce((sum, p) => sum + p.goals, 0);
      const scoreB = players.filter((p) => p.side === "B").reduce((sum, p) => sum + p.goals, 0);

      await supabase
        .from("matches")
        .update({ score_a: scoreA, score_b: scoreB })
        .eq("id", matchId);

      setSaved(true);
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    await doSave();
  }

  async function handleNextRound() {
    setFinishing(true);
    try {
      const ok = await doSave();
      if (!ok) return;

      const { data, error } = await supabase.rpc("finish_and_create_next_same_roster", {
        p_match_id: matchId,
        p_pin: pinInput,
      });
      if (error) {
        alert(error.message);
        return;
      }
      window.location.href = `/match/${data}/postgame`;
    } finally {
      setFinishing(false);
    }
  }

  async function handleEndMeeting() {
    if (!confirm("Finalizar o jogo? Isso encerrará todas as rodadas.")) return;
    setFinishing(true);
    try {
      const ok = await doSave();
      if (!ok) return;

      const { data, error } = await supabase.rpc("end_match", {
        p_match_id: matchId,
        p_pin: pinInput,
      });
      if (error) {
        alert(error.message);
        return;
      }
      window.location.href = `/meeting/${data}`;
    } finally {
      setFinishing(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  const teamA = players.filter((p) => p.side === "A");
  const teamB = players.filter((p) => p.side === "B");
  const teamC = players.filter((p) => p.side === "C");

  const scoreA = teamA.reduce((sum, p) => sum + p.goals, 0);
  const scoreB = teamB.reduce((sum, p) => sum + p.goals, 0);

  const totalStats = players.reduce(
    (acc, p) => ({
      goals: acc.goals + p.goals,
      assists: acc.assists + p.assists,
      saves: acc.saves + p.saves,
      hard_saves: acc.hard_saves + p.hard_saves,
    }),
    { goals: 0, assists: 0, saves: 0, hard_saves: 0 }
  );

  const isFinished = meta?.status === "FINISHED";

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur pt-[env(safe-area-inset-top)]">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {groupId && (
                <Link
                  href={`/g/${groupId}`}
                  className="shrink-0 flex items-center justify-center h-9 w-9 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  aria-label="Voltar ao grupo"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Link>
              )}
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">Pós-jogo</div>
                <div className="text-xl font-black leading-tight">
                  Rodada {meta?.seq ?? "—"}
                </div>
                {meta && (
                  <div className="text-xs text-muted-foreground">
                    {meta.team_a_name} {scoreA} × {scoreB} {meta.team_b_name}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isFinished && (
                <Badge variant="outline" className="text-muted-foreground">
                  Finalizada
                </Badge>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPinOpen(true)}
                className="gap-1.5 h-9"
              >
                <KeyRound className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">PIN</span>
                <Badge
                  variant={canEdit ? "secondary" : "outline"}
                  className="text-[10px] px-1.5 h-4"
                >
                  {canEdit ? "OK" : "—"}
                </Badge>
              </Button>
            </div>
          </div>

          {/* Nav links */}
          <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
            {groupId && (
              <Link href={`/g/${groupId}`} className="underline">
                Grupo
              </Link>
            )}
            {meta?.meeting_id && (
              <Link href={`/meeting/${meta.meeting_id}`} className="underline">
                Resumo do jogo
              </Link>
            )}
            <Link href={`/match/${matchId}/setup`} className="underline">
              Setup
            </Link>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4 pb-36">

        {/* Legenda */}
        <Card className="p-3">
          <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
            {(Object.entries(STAT_FULL) as [StatKey, string][]).map(([key, label]) => (
              <span key={key}>
                <b className="text-foreground">{STAT_LABELS[key]}</b> = {label}
              </span>
            ))}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Pontos = G×2 + A×1 + D×0.25 + DD×1
          </div>
        </Card>

        {/* Time A */}
        <TeamSection
          name={meta?.team_a_name ?? "Time A"}
          color={meta?.team_a_color ?? "#FACC15"}
          players={teamA}
          scoreLabel={String(scoreA)}
          canEdit={canEdit && !isFinished}
          onAdjust={adjustStat}
        />

        {/* Time B */}
        <TeamSection
          name={meta?.team_b_name ?? "Time B"}
          color={meta?.team_b_color ?? "#3B82F6"}
          players={teamB}
          scoreLabel={String(scoreB)}
          canEdit={canEdit && !isFinished}
          onAdjust={adjustStat}
        />

        {/* Time C (espera) */}
        {teamC.length > 0 && (
          <TeamSection
            name={meta?.waiting_team_name ?? "Time C"}
            color={meta?.waiting_team_color ?? "#A3A3A3"}
            players={teamC}
            scoreLabel="—"
            canEdit={canEdit && !isFinished}
            onAdjust={adjustStat}
          />
        )}

        {/* Totais */}
        {players.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Totais da rodada</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-2 text-center">
                {(["goals", "assists", "saves", "hard_saves"] as StatKey[]).map((stat) => (
                  <div key={stat} className="rounded-xl border bg-muted/30 px-2 py-2">
                    <div className="text-[10px] font-semibold text-muted-foreground">{STAT_LABELS[stat]}</div>
                    <div className="text-xl font-black tabular-nums">{totalStats[stat]}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {players.length === 0 && (
          <Card className="p-6 text-center text-muted-foreground">
            <div className="text-sm">Nenhum jogador no roster.</div>
            <div className="text-xs mt-1">
              Volte ao{" "}
              <Link href={`/match/${matchId}/setup`} className="underline">
                Setup
              </Link>{" "}
              para adicionar jogadores.
            </div>
          </Card>
        )}
      </div>

      {/* Ações fixas no bottom */}
      {!isFinished && (
        <div className="fixed bottom-0 left-0 right-0 z-20 border-t bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
          <div className="max-w-2xl mx-auto px-4 py-3 space-y-2">
            {/* Status save */}
            {saved && (
              <div className="text-xs text-center text-muted-foreground">
                Stats salvos com sucesso.
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                className="h-12 gap-1.5 text-sm"
                onClick={handleSave}
                disabled={saving || finishing || !canEdit}
              >
                <Save className="h-4 w-4" />
                {saving ? "Salvando..." : "Salvar"}
              </Button>

              <Button
                variant="outline"
                className="h-12 gap-1.5 text-sm"
                onClick={handleNextRound}
                disabled={saving || finishing || !canEdit}
              >
                <SkipForward className="h-4 w-4" />
                {finishing ? "..." : "Próxima"}
              </Button>

              <Button
                className="h-12 gap-1.5 text-sm"
                onClick={handleEndMeeting}
                disabled={saving || finishing || !canEdit}
              >
                <Flag className="h-4 w-4" />
                {finishing ? "..." : "Finalizar"}
              </Button>
            </div>

            {!canEdit && (
              <div className="text-xs text-center text-muted-foreground">
                Informe o PIN para editar →{" "}
                <button className="underline" onClick={() => setPinOpen(true)}>
                  Abrir PIN
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Botão voltar quando finalizado */}
      {isFinished && meta?.meeting_id && (
        <div className="fixed bottom-0 left-0 right-0 z-20 border-t bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
          <div className="max-w-2xl mx-auto px-4 py-3">
            <Button asChild className="w-full h-12">
              <Link href={`/meeting/${meta.meeting_id}`}>Ver resumo do jogo</Link>
            </Button>
          </div>
        </div>
      )}

      {/* Dialog PIN */}
      <Dialog open={pinOpen} onOpenChange={setPinOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>PIN de edição</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Edição:{" "}
              <b className="text-foreground">{canEdit ? "Liberada" : "Bloqueada"}</b>
            </div>
            <Input
              type="password"
              placeholder="Digite o PIN"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && unlockEdit()}
            />
            <div className="flex gap-2">
              <Button onClick={unlockEdit} className="flex-1">
                Liberar
              </Button>
              <Button variant="outline" onClick={lockEdit} className="flex-1">
                Bloquear
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
