"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { KeyRound, Pencil, UserX, ArrowLeftRight } from "lucide-react";

// shadcn/ui
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// ─── tipos ────────────────────────────────────────────────────────────────────

type Pos = "GK" | "FIXO" | "ALA_E" | "ALA_D" | "PIVO";

type Player = {
  id: string;
  name: string;
  type: "FIXO" | "COMPLETE";
  preferred_pos: Pos | null;
  pace: number | null;
  shooting: number | null;
  passing: number | null;
  defending: number | null;
  physical: number | null;
};

type LastMatch = {
  id: string;
  meeting_id: string;
  status: string;
  seq: number;
  team_a_name: string;
  team_b_name: string;
  started_at: string;
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function clamp99(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(99, n));
}

function typeLabel(t: Player["type"]) {
  return t === "FIXO" ? "Fixo" : "Complete";
}

function posLabel(p: Pos | null) {
  if (!p) return "sem posição";
  const map: Record<string, string> = {
    GK: "Goleiro (GK)",
    FIXO: "Fixo",
    ALA_E: "Ala E",
    ALA_D: "Ala D",
    PIVO: "Pivô",
  };
  return map[p] ?? p;
}

function StatPill({ label, value }: { label: string; value: number }) {
  const v = clamp99(value);
  return (
    <div className="w-[68px] rounded-xl border bg-muted/50 px-2 py-1">
      <div className="text-[10px] font-semibold text-muted-foreground text-center">{label}</div>
      <div className="text-sm font-black tabular-nums text-center">{v}</div>
      <div className="mt-1 w-full bg-muted rounded-full h-1 overflow-hidden">
        <div className="h-1 bg-primary" style={{ width: `${(v / 99) * 100}%` }} />
      </div>
    </div>
  );
}

// ─── PlayerCard ───────────────────────────────────────────────────────────────

function PlayerCard({
  p,
  groupId,  
  canEdit,
  pinInput,
  onSaved,
}: {
  p: Player;
  groupId: string; 
  canEdit: boolean;
  pinInput: string;
  onSaved: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  // card stats
  const [editName, setEditName] = useState(p.name);
  const [pos, setPos] = useState<Pos | "">(p.preferred_pos ?? "");
  const [pace, setPace] = useState<number>(p.pace ?? 50);
  const [sho, setSho] = useState<number>(p.shooting ?? 50);
  const [pas, setPas] = useState<number>(p.passing ?? 50);
  const [def, setDef] = useState<number>(p.defending ?? 50);
  const [phy, setPhy] = useState<number>(p.physical ?? 50);

  useEffect(() => {
    setEditName(p.name);
    setPos(p.preferred_pos ?? "");
    setPace(p.pace ?? 50);
    setSho(p.shooting ?? 50);
    setPas(p.passing ?? 50);
    setDef(p.defending ?? 50);
    setPhy(p.physical ?? 50);
  }, [p]);

  // Salva nome + stats + posição
  async function save() {
    if (!canEdit) return;

    const newName = editName.trim();
    if (!newName) return alert("Nome não pode ser vazio.");

    // Renomear se mudou
    if (newName !== p.name) {
      const { error } = await supabase.rpc("rename_player", {
        p_player_id: p.id,
        p_name: newName,
        p_pin: pinInput,
      });
      if (error) return alert(error.message);
    }

    // Atualizar card
    const { error } = await supabase.rpc("update_player_card", {
      p_player_id: p.id,
      p_preferred_pos: pos || null,
      p_pace: clamp99(pace),
      p_shooting: clamp99(sho),
      p_passing: clamp99(pas),
      p_defending: clamp99(def),
      p_physical: clamp99(phy),
      p_pin: pinInput,
    });
    if (error) return alert(error.message);

    setOpen(false);
    await onSaved();
  }

  // Alterna tipo FIXO ↔ COMPLETE
  async function toggleType() {
    if (!canEdit) return;
    const newType = p.type === "FIXO" ? "COMPLETE" : "FIXO";
    const { error } = await supabase.rpc("set_player_type", {
      p_player_id: p.id,
      p_type: newType,
      p_pin: pinInput,
    });
    if (error) return alert(error.message);
    await onSaved();
  }

  // Inativar jogador
  async function deactivate() {
    if (!canEdit) return;
    if (!confirm(`Inativar "${p.name}"? Ele não aparecerá mais nas listas.`)) return;
    const { error } = await supabase.rpc("set_player_active", {
      p_player_id: p.id,
      p_active: false,
      p_pin: pinInput,
    });
    if (error) return alert(error.message);
    await onSaved();
  }

  return (
    <Card className="h-full border bg-card/70 backdrop-blur supports-[backdrop-filter]:bg-card/60 hover:bg-card hover:shadow-md transition">
      <CardContent className={(open ? "p-4 space-y-3" : "p-3 space-y-2") + " h-full flex flex-col"}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-lg font-black leading-tight truncate" title={p.name}>
              {p.name}
            </div>
            <div className="text-xs font-semibold text-muted-foreground truncate">
              {typeLabel(p.type)} • {posLabel(p.preferred_pos)}
            </div>
          </div>

          <div className="flex gap-1.5 shrink-0">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="h-9 px-2 text-muted-foreground hover:text-foreground"
              title="Ver histórico"
            >
              <Link href={`/g/${groupId}/player/${p.id}`}>📊</Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 shrink-0"
              disabled={!canEdit}
              onClick={() => setOpen((v) => !v)}
              type="button"
            >
              {open ? "Fechar" : "Editar"}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <StatPill label="VEL" value={p.pace ?? 50} />
          <StatPill label="CHU" value={p.shooting ?? 50} />
          <StatPill label="PAS" value={p.passing ?? 50} />
          <StatPill label="DEF" value={p.defending ?? 50} />
          <StatPill label="FIS" value={p.physical ?? 50} />
        </div>

        {open && (
          <>
            <Separator />

            {/* Editar nome */}
            <div className="space-y-1">
              <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                <Pencil className="h-3 w-3" />
                Nome
              </div>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                disabled={!canEdit}
                placeholder="Nome do jogador"
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              {/* Posição */}
              <div className="space-y-1">
                <div className="text-xs font-semibold text-muted-foreground">Posição</div>
                <Select
                  value={pos || "__none__"}
                  onValueChange={(v) => setPos(v === "__none__" ? "" : (v as Pos))}
                  disabled={!canEdit}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="(sem)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">(sem)</SelectItem>
                    <SelectItem value="GK">Goleiro (GK)</SelectItem>
                    <SelectItem value="FIXO">Fixo</SelectItem>
                    <SelectItem value="ALA_E">Ala E</SelectItem>
                    <SelectItem value="ALA_D">Ala D</SelectItem>
                    <SelectItem value="PIVO">Pivô</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Tipo (toggle) */}
              <div className="space-y-1">
                <div className="text-xs font-semibold text-muted-foreground">Tipo</div>
                <Button
                  variant="outline"
                  type="button"
                  className="w-full h-10 justify-between"
                  disabled={!canEdit}
                  onClick={toggleType}
                >
                  <span>{typeLabel(p.type)}</span>
                  <ArrowLeftRight className="h-3 w-3 text-muted-foreground" />
                </Button>
              </div>
            </div>

            {/* Stats */}
            <div className="text-xs font-semibold text-muted-foreground">
              Atributos — VEL / CHU / PAS / DEF / FIS
            </div>
            <div className="grid grid-cols-5 gap-2">
              {[
                [pace, setPace],
                [sho, setSho],
                [pas, setPas],
                [def, setDef],
                [phy, setPhy],
              ].map(([val, setter], i) => (
                <Input
                  key={i}
                  className="text-center tabular-nums"
                  type="number"
                  min={0}
                  max={99}
                  value={val as number}
                  onChange={(e) => (setter as (n: number) => void)(+e.target.value)}
                  disabled={!canEdit}
                />
              ))}
            </div>

            {/* Ações */}
            <div className="flex gap-2 flex-wrap pt-1">
              <Button className="flex-1" onClick={save} disabled={!canEdit} type="button">
                Salvar
              </Button>
              <Button
                variant="destructive"
                className="h-10"
                onClick={deactivate}
                disabled={!canEdit}
                type="button"
                title="Inativar jogador"
              >
                <UserX className="h-4 w-4 mr-1" />
                Inativar
              </Button>
            </div>

            <p className="text-[10px] text-muted-foreground">
              Inativar remove o jogador das listas (não apaga histórico).
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function GroupPage() {
  const { groupId } = useParams<{ groupId: string }>();

  const [players, setPlayers] = useState<Player[]>([]);
  const [playerName, setPlayerName] = useState("");
  const [playerType, setPlayerType] = useState<"FIXO" | "COMPLETE">("FIXO");
  const [playerPos, setPlayerPos] = useState<Pos | "">("");

  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [lastMatch, setLastMatch] = useState<LastMatch | null>(null);

  // PIN
  const [pinInput, setPinInput] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);

  // UI
  const [listTab, setListTab] = useState<"FIXO" | "COMPLETE">("FIXO");

  function pinKey(gid: string) {
    return `pin:${gid}`;
  }

  async function validatePin(pin: string) {
    const { data: ok, error } = await supabase.rpc("check_edit_pin_for_group", {
      p_group_id: groupId,
      p_pin: pin,
    });
    if (error) {
      alert(error.message);
      return false;
    }
    return !!ok; // true = PIN válido
  }

  async function loadPinState() {
    const saved = localStorage.getItem(pinKey(groupId)) || "";
    setPinInput(saved);
    const ok = await validatePin(saved);
    setCanEdit(ok);
  }

  async function unlockEdit() {
    const ok = await validatePin(pinInput);
    if (ok) {
      localStorage.setItem(pinKey(groupId), pinInput);
      setCanEdit(true);
      setPinOpen(false);
    } else {
      setCanEdit(false);
      alert("PIN incorreto.");
    }
  }

  function lockEdit() {
    localStorage.removeItem(pinKey(groupId));
    setPinInput("");
    setCanEdit(false);
    setPinOpen(false);
  }

  async function loadPlayers() {
    const { data, error } = await supabase
      .from("players")
      .select("id,name,type,preferred_pos,pace,shooting,passing,defending,physical")
      .eq("group_id", groupId)
      .eq("active", true)
      .order("name", { ascending: true });

    if (error) return alert(error.message);
    setPlayers((data ?? []) as Player[]);
  }

  async function loadLastMatch() {
    const { data, error } = await supabase
      .from("matches")
      .select("id,meeting_id,status,seq,team_a_name,team_b_name,started_at,meetings!inner(group_id)")
      .eq("meetings.group_id", groupId)
      .eq("status", "IN_PROGRESS")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return;

    if (data?.id) {
      const row: any = data;
      setLastMatch({
        id: row.id,
        meeting_id: row.meeting_id,
        status: row.status,
        seq: row.seq,
        team_a_name: row.team_a_name,
        team_b_name: row.team_b_name,
        started_at: row.started_at,
      });
      setMeetingId(row.meeting_id);
      setMatchId(row.id);
    }
  }

  async function addPlayer() {
    if (!canEdit) return alert("Somente leitura. Informe o PIN para editar.");

    const n = playerName.trim();
    if (!n) return;

    const { data: newId, error: e1 } = await supabase.rpc("create_player", {
      p_group_id: groupId,
      p_name: n,
      p_type: playerType,
      p_pin: pinInput,
    });
    if (e1) return alert(e1.message);

    const { error: e2 } = await supabase.rpc("update_player_card", {
      p_player_id: newId,
      p_preferred_pos: playerPos || null,
      p_pace: 50,
      p_shooting: 50,
      p_passing: 50,
      p_defending: 50,
      p_physical: 50,
      p_pin: pinInput,
    });
    if (e2) return alert(e2.message);

    setPlayerName("");
    setPlayerPos("");
    await loadPlayers();
  }

  async function createMeetingAndMatch() {
    if (!canEdit) return alert("Somente leitura. Informe o PIN para editar.");

    const { data, error } = await supabase.rpc("create_meeting_and_match", {
      p_group_id: groupId,
      p_starts_at: new Date().toISOString(),
      p_minutes: 10,
      p_on_court: 5,
      p_team_a_name: "Time A",
      p_team_b_name: "Time B",
      p_pin: pinInput,
    });
    if (error) return alert(error.message);

    const row: any = Array.isArray(data) ? data[0] : data;
    setMeetingId(row.meeting_id);
    setMatchId(row.match_id);

    await loadLastMatch();
  }

  useEffect(() => {
    loadPlayers();
    loadPinState();
    loadLastMatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const fixes = useMemo(() => players.filter((p) => p.type === "FIXO"), [players]);
  const completes = useMemo(() => players.filter((p) => p.type === "COMPLETE"), [players]);
  const list = listTab === "FIXO" ? fixes : completes;

  const tabHint =
    listTab === "FIXO"
      ? "Fixos: jogadores do grupo (normalmente sempre disponíveis)."
      : "Completes: reservas/convidados (entram quando faltar).";

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Header sticky */}
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">Grupo</div>
              <div className="flex items-center gap-2">
                <div className="text-xl font-black leading-tight truncate">Painel</div>
                <Badge variant={canEdit ? "secondary" : "outline"}>
                  {canEdit ? "Edição liberada" : "Somente leitura"}
                </Badge>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setPinOpen(true)}
              className="gap-2 h-9 shrink-0"
            >
              <KeyRound className="h-4 w-4" />
              <span className="hidden sm:inline">PIN</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Dialog PIN */}
      <Dialog open={pinOpen} onOpenChange={setPinOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>PIN de edição</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Edição:{" "}
              <b className="text-foreground">{canEdit ? "Edição liberada" : "Somente leitura"}</b>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-semibold text-muted-foreground">PIN</div>
              <Input
                type="password"
                placeholder="Digite o PIN"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button onClick={unlockEdit} className="flex-1">
                Liberar edição
              </Button>
              <Button variant="outline" onClick={lockEdit} className="flex-1">
                Bloquear
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              Dica: após liberar, o PIN fica salvo no seu navegador (localStorage).
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* Seção Partida */}
        <Card className="border bg-card/70 backdrop-blur supports-[backdrop-filter]:bg-card/60">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-lg">Partida</CardTitle>
              <Badge variant="outline">
                {lastMatch ? "em andamento" : "nenhuma em andamento"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {lastMatch ? (
              <div className="text-sm">
                Em andamento: <b>{lastMatch.team_a_name}</b> vs <b>{lastMatch.team_b_name}</b>{" "}
                (Rodada {lastMatch.seq})
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                Nenhuma partida em andamento. Crie um jogo para começar.
              </div>
            )}

            <div className="grid md:grid-cols-3 gap-2">
              <Button className="h-12" onClick={createMeetingAndMatch} disabled={!canEdit}>
                Criar partida
              </Button>
              <Button asChild variant="outline" className="h-12" disabled={!matchId}>
                <Link href={matchId ? `/match/${matchId}/setup` : "#"} aria-disabled={!matchId}>
                  Setup da partida
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-12" disabled={!matchId}>
                <Link href={matchId ? `/match/${matchId}/live` : "#"} aria-disabled={!matchId}>
                  Abrir ao vivo
                </Link>
              </Button>
            </div>

            {meetingId && (
              <div className="text-sm">
                <Link className="underline" href={`/meeting/${meetingId}`}>
                  Ver resumo do jogo (craque do dia)
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Seção Jogadores */}
        <Card className="border bg-card/70 backdrop-blur supports-[backdrop-filter]:bg-card/60">
          <CardHeader className="pb-3 space-y-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle className="text-lg">Jogadores</CardTitle>
              <Tabs value={listTab} onValueChange={(v) => setListTab(v as any)}>
                <TabsList>
                  <TabsTrigger value="FIXO">Fixos ({fixes.length})</TabsTrigger>
                  <TabsTrigger value="COMPLETE">Completes ({completes.length})</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="text-xs text-muted-foreground">{tabHint}</div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Adicionar jogador */}
            <div className="grid md:grid-cols-4 gap-2">
              <div className="md:col-span-2">
                <div className="text-xs font-semibold text-muted-foreground mb-1">
                  Nome do jogador
                </div>
                <Input
                  placeholder="Ex: Renan"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addPlayer()}
                />
              </div>

              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1">Tipo</div>
                <Select value={playerType} onValueChange={(v) => setPlayerType(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIXO">Fixo</SelectItem>
                    <SelectItem value="COMPLETE">Complete</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1">Posição</div>
                <Select
                  value={playerPos || "__none__"}
                  onValueChange={(v) => setPlayerPos(v === "__none__" ? "" : (v as Pos))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="(sem)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">(sem)</SelectItem>
                    <SelectItem value="GK">Goleiro (GK)</SelectItem>
                    <SelectItem value="FIXO">Fixo</SelectItem>
                    <SelectItem value="ALA_E">Ala E</SelectItem>
                    <SelectItem value="ALA_D">Ala D</SelectItem>
                    <SelectItem value="PIVO">Pivô</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button onClick={addPlayer} disabled={!canEdit}>
                Adicionar jogador
              </Button>
              {!canEdit && (
                <Badge variant="secondary" className="text-muted-foreground">
                  Somente leitura (informe o PIN)
                </Badge>
              )}
            </div>

            <Separator />

            {list.length === 0 ? (
              <div className="text-sm text-muted-foreground">Sem jogadores.</div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {list.map((p) => (
                  <PlayerCard
                    key={p.id}
                    p={p}
                     groupId={groupId}
                    canEdit={canEdit}
                    pinInput={pinInput}
                    onSaved={loadPlayers}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}