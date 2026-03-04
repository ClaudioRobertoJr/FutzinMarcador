"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

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

function clamp99(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(99, n));
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-muted/50 px-2 py-1">
      <div className="text-[10px] font-semibold text-muted-foreground">{label}</div>
      <div className="text-sm font-black tabular-nums">{value}</div>
    </div>
  );
}

function PlayerCard({
  p,
  canEdit,
  pinInput,
  onSaved,
}: {
  p: Player;
  canEdit: boolean;
  pinInput: string;
  onSaved: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  const [pos, setPos] = useState<Pos | "">(p.preferred_pos ?? "");
  const [pace, setPace] = useState<number>(p.pace ?? 50);
  const [sho, setSho] = useState<number>(p.shooting ?? 50);
  const [pas, setPas] = useState<number>(p.passing ?? 50);
  const [def, setDef] = useState<number>(p.defending ?? 50);
  const [phy, setPhy] = useState<number>(p.physical ?? 50);

  useEffect(() => {
    setPos(p.preferred_pos ?? "");
    setPace(p.pace ?? 50);
    setSho(p.shooting ?? 50);
    setPas(p.passing ?? 50);
    setDef(p.defending ?? 50);
    setPhy(p.physical ?? 50);
  }, [p]);

  async function save() {
    if (!canEdit) return;

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

  return (
    <Card className="border bg-card/70 backdrop-blur supports-[backdrop-filter]:bg-card/60 hover:bg-card hover:shadow-md transition">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-black leading-tight">{p.name}</div>
            <div className="text-xs font-semibold text-muted-foreground">
              {p.type} • {p.preferred_pos ?? "sem posição"}
            </div>
          </div>

          <Button
            variant="outline"
            disabled={!canEdit}
            onClick={() => setOpen((v) => !v)}
            type="button"
          >
            {open ? "Fechar" : "Editar"}
          </Button>
        </div>

        <div className="grid grid-cols-5 gap-2">
          <StatPill label="VEL" value={p.pace ?? 50} />
          <StatPill label="CHU" value={p.shooting ?? 50} />
          <StatPill label="PAS" value={p.passing ?? 50} />
          <StatPill label="DEF" value={p.defending ?? 50} />
          <StatPill label="FIS" value={p.physical ?? 50} />
        </div>

        {open && (
          <>
            <Separator />

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="text-xs font-semibold text-muted-foreground">Posição</div>
                <Select
                  value={pos || "__none__"}
                  onValueChange={(v) => setPos((v === "__none__" ? "" : (v as Pos)) as any)}
                  disabled={!canEdit}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="(sem)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">(sem)</SelectItem>
                    <SelectItem value="GK">GK</SelectItem>
                    <SelectItem value="FIXO">FIXO</SelectItem>
                    <SelectItem value="ALA_E">ALA_E</SelectItem>
                    <SelectItem value="ALA_D">ALA_D</SelectItem>
                    <SelectItem value="PIVO">PIVO</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="text-xs text-muted-foreground leading-relaxed">
                Dica: mantenha 50 como padrão e ajuste só o que for realmente visível em quadra.
              </div>
            </div>

            <div className="grid grid-cols-5 gap-2">
              <Input
                className="text-center tabular-nums"
                type="number"
                min={0}
                max={99}
                value={pace}
                onChange={(e) => setPace(+e.target.value)}
                disabled={!canEdit}
              />
              <Input
                className="text-center tabular-nums"
                type="number"
                min={0}
                max={99}
                value={sho}
                onChange={(e) => setSho(+e.target.value)}
                disabled={!canEdit}
              />
              <Input
                className="text-center tabular-nums"
                type="number"
                min={0}
                max={99}
                value={pas}
                onChange={(e) => setPas(+e.target.value)}
                disabled={!canEdit}
              />
              <Input
                className="text-center tabular-nums"
                type="number"
                min={0}
                max={99}
                value={def}
                onChange={(e) => setDef(+e.target.value)}
                disabled={!canEdit}
              />
              <Input
                className="text-center tabular-nums"
                type="number"
                min={0}
                max={99}
                value={phy}
                onChange={(e) => setPhy(+e.target.value)}
                disabled={!canEdit}
              />
            </div>

            <div className="grid grid-cols-5 gap-2 text-[10px] font-semibold text-muted-foreground">
              <div>VEL</div>
              <div>CHU</div>
              <div>PAS</div>
              <div>DEF</div>
              <div>FIS</div>
            </div>

            <Button className="w-full" onClick={save} disabled={!canEdit} type="button">
              Salvar card do jogador
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

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
    return !!ok;
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
    } else {
      setCanEdit(false);
      alert("PIN incorreto.");
    }
  }

  function lockEdit() {
    localStorage.removeItem(pinKey(groupId));
    setPinInput("");
    setCanEdit(false);
  }

  async function loadPlayers() {
    const { data, error } = await supabase
      .from("players")
      .select("id,name,type,preferred_pos,pace,shooting,passing,defending,physical")
      .eq("group_id", groupId)
      .eq("active", true)
      .order("created_at", { ascending: false });

    if (error) return alert(error.message);
    setPlayers((data ?? []) as Player[]);
  }

  async function loadLastMatch() {
    const { data, error } = await supabase
      .from("matches")
      .select(
        "id,meeting_id,status,seq,team_a_name,team_b_name,started_at,meetings!inner(group_id)"
      )
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

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 py-4 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs text-muted-foreground">Grupo</div>
              <div className="text-xl font-black">Painel</div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button asChild variant="outline">
                <Link href={`/g/${groupId}/ranking`}>Ranking</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/">Voltar</Link>
              </Button>
            </div>
          </div>

          <Card className="border bg-card/70 backdrop-blur supports-[backdrop-filter]:bg-card/60">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="text-sm text-muted-foreground">
                  Edição:{" "}
                  <b className="text-foreground">
                    {canEdit ? "LIBERADA" : "SOMENTE LEITURA"}
                  </b>
                </div>

                <Input
                  type="password"
                  className="w-40"
                  placeholder="PIN do grupo"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                />

                <Button onClick={unlockEdit}>Liberar</Button>
                <Button variant="outline" onClick={lockEdit}>
                  Bloquear
                </Button>
              </div>
            </CardContent>
          </Card>

          {lastMatch && (
            <Card className="border bg-card/70 backdrop-blur supports-[backdrop-filter]:bg-card/60">
              <CardContent className="p-3 flex items-center justify-between flex-wrap gap-2">
                <div className="text-sm">
                  Última partida em andamento: <b>{lastMatch.team_a_name}</b> vs{" "}
                  <b>{lastMatch.team_b_name}</b> (Rodada {lastMatch.seq})
                </div>
                <div className="flex gap-2">
                  <Button asChild variant="outline">
                    <Link href={`/match/${lastMatch.id}/setup`}>Setup</Link>
                  </Button>
                  <Button asChild>
                    <Link href={`/match/${lastMatch.id}/live`}>Retomar ao vivo</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid md:grid-cols-3 gap-2">
            <Button className="h-12" onClick={createMeetingAndMatch} disabled={!canEdit}>
              Criar encontro + partida
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
                Ver resumo do encontro (craque do dia)
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <Card className="border bg-card/70 backdrop-blur supports-[backdrop-filter]:bg-card/60">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle className="text-lg">Jogadores</CardTitle>

              <Tabs value={listTab} onValueChange={(v) => setListTab(v as any)}>
                <TabsList>
                  <TabsTrigger value="FIXO">Fixos ({fixes.length})</TabsTrigger>
                  <TabsTrigger value="COMPLETE">Completes ({completes.length})</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-4 gap-2">
              <div className="md:col-span-2">
                <div className="text-xs font-semibold text-muted-foreground mb-1">
                  Nome do jogador
                </div>
                <Input
                  placeholder="Ex: Renan"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                />
              </div>

              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1">Tipo</div>
                <Select value={playerType} onValueChange={(v) => setPlayerType(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIXO">FIXO</SelectItem>
                    <SelectItem value="COMPLETE">COMPLETE</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1">Posição</div>
                <Select
                  value={playerPos || "__none__"}
                  onValueChange={(v) => setPlayerPos((v === "__none__" ? "" : (v as Pos)) as any)}
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

            {list.length === 0 ? (
              <div className="text-sm text-muted-foreground">Sem jogadores.</div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {list.map((p) => (
                  <PlayerCard
                    key={p.id}
                    p={p}
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