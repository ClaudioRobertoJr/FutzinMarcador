"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  Search,
  Users,
  CheckSquare,
  Square,
} from "lucide-react";

import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

// ─── tipos ───────────────────────────────────────────────────────────────────

interface MatchInfo {
  meeting_id: string;
  on_court: number;
  team_a_name: string;
  team_b_name: string;
  waiting_team_name: string;
  team_a_color: string;
  team_b_color: string;
  waiting_team_color: string;
}

interface Player {
  id: string;
  name: string;
  type: "FIXO" | "COMPLETE";
}

type Side = "A" | "B" | "C" | null; // null = presente mas sem time ainda

interface AttendanceEntry {
  player_id: string;
  name: string;
  type: "FIXO" | "COMPLETE";
  present: boolean;
  side: Side;
  state: "ON_COURT" | "BENCH";
}

// ─── componente TeamMetaCard ──────────────────────────────────────────────────

interface TeamMetaCardProps {
  title: string;
  badge: string;
  name: string;
  setName: (v: string) => void;
  color: string;
  setColor: (v: string) => void;
  canEdit: boolean;
  disabled?: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onUseFirst: () => void;
}

function TeamMetaCard({
  title,
  badge,
  name,
  setName,
  color,
  setColor,
  canEdit,
  disabled,
  isOpen,
  onToggle,
  onUseFirst,
}: TeamMetaCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="h-3 w-3 rounded-full border shrink-0" style={{ background: color }} />
            <CardTitle className="text-sm truncate">{title}</CardTitle>
            <Badge variant="outline" className="text-xs truncate max-w-[100px]">
              {badge}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 md:hidden"
            onClick={onToggle}
            type="button"
          >
            <span className="text-xs">{isOpen ? "Fechar" : "Editar"}</span>
            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>

      <CardContent className={cn("space-y-3", "md:block", isOpen ? "block" : "hidden md:block")}>
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground">Nome</div>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!canEdit || !!disabled}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">Cor</div>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            disabled={!canEdit || !!disabled}
            className="h-11 w-16 rounded-md border bg-transparent"
          />
        </div>

        <Button
          variant="outline"
          onClick={onUseFirst}
          type="button"
          disabled={!canEdit || !!disabled}
          className="w-full h-11"
        >
          Usar 1º jogador
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── badge de lado ────────────────────────────────────────────────────────────

const SIDE_OPTIONS: { value: Side; label: string }[] = [
  { value: null, label: "—" },
  { value: "A", label: "A" },
  { value: "B", label: "B" },
  { value: "C", label: "C" },
];

function SideSelector({
  value,
  onChange,
  disabled,
  colorA,
  colorB,
  colorC,
}: {
  value: Side;
  onChange: (s: Side) => void;
  disabled?: boolean;
  colorA: string;
  colorB: string;
  colorC: string;
}) {
  function colorFor(s: Side) {
    if (s === "A") return colorA;
    if (s === "B") return colorB;
    if (s === "C") return colorC;
    return "transparent";
  }

  return (
    <div className="flex items-center gap-1">
      {SIDE_OPTIONS.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className={cn(
            "h-9 w-9 rounded-lg border text-xs font-black transition-all",
            value === opt.value
              ? "ring-2 ring-offset-1 ring-foreground/40 scale-105"
              : "opacity-50 hover:opacity-80"
          )}
          style={{
            background: opt.value ? colorFor(opt.value) : "transparent",
            color: opt.value ? "#fff" : undefined,
            textShadow: opt.value ? "0 1px 2px rgba(0,0,0,0.5)" : undefined,
          }}
          title={opt.value ? `Time ${opt.value}` : "Sem time"}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─── página principal ─────────────────────────────────────────────────────────

export default function MatchSetupPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const router = useRouter();

  const [match, setMatch] = useState<MatchInfo | null>(null);
  const [groupId, setGroupId] = useState<string>("");

  // attendance: todos os jogadores do grupo com presença e side
  const [attendance, setAttendance] = useState<AttendanceEntry[]>([]);

  // PIN
  const [pinInput, setPinInput] = useState("");
  const [canEdit, setCanEdit] = useState(false);

  // meta editável
  const [nameA, setNameA] = useState("Time A");
  const [nameB, setNameB] = useState("Time B");
  const [nameC, setNameC] = useState("Time C");
  const [colorA, setColorA] = useState("#FACC15");
  const [colorB, setColorB] = useState("#3B82F6");
  const [colorC, setColorC] = useState("#A3A3A3");

  // UX
  const [tab, setTab] = useState<"presenca" | "A" | "B" | "C">("presenca");
  const [query, setQuery] = useState("");
  const [metaOpen, setMetaOpen] = useState<{ A: boolean; B: boolean; C: boolean }>({
    A: false,
    B: false,
    C: false,
  });

  // ─── helpers PIN ───────────────────────────────────────────────────────────

  function pinKey(gid: string) {
    return `pin:${gid}`;
  }

  async function validatePinForGroup(gid: string, pin: string): Promise<boolean> {
    const { data: ok, error } = await supabase.rpc("check_edit_pin_for_group", {
      p_group_id: gid,
      p_pin: pin,
    });
    if (error) {
      alert(error.message);
      return false;
    }
    return !ok;
  }

  async function unlockEdit() {
    if (!groupId) return;
    const ok = await validatePinForGroup(groupId, pinInput);
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

  // ─── carregamento ──────────────────────────────────────────────────────────

  async function loadBase() {
    const { data: ma, error: ema } = await supabase
      .from("matches")
      .select(
        "meeting_id,on_court,team_a_name,team_b_name,waiting_team_name,team_a_color,team_b_color,waiting_team_color"
      )
      .eq("id", matchId)
      .single();

    if (ema) return alert(ema.message);

    setMatch(ma as any);
    setNameA(ma.team_a_name ?? "Time A");
    setNameB(ma.team_b_name ?? "Time B");
    setNameC(ma.waiting_team_name ?? "Time C");
    setColorA(ma.team_a_color ?? "#FACC15");
    setColorB(ma.team_b_color ?? "#3B82F6");
    setColorC(ma.waiting_team_color ?? "#A3A3A3");

    const { data: meet, error: em } = await supabase
      .from("meetings")
      .select("group_id")
      .eq("id", ma.meeting_id)
      .single();

    if (em) return alert(em.message);

    const gid = meet.group_id as string;
    setGroupId(gid);

    const savedPin = localStorage.getItem(pinKey(gid)) || "";
    setPinInput(savedPin);
    const ok = await validatePinForGroup(gid, savedPin);
    setCanEdit(ok);

    // Carrega todos os jogadores ativos do grupo
    const { data: ps, error: ep } = await supabase
      .from("players")
      .select("id,name,type")
      .eq("group_id", gid)
      .eq("active", true)
      .order("name", { ascending: true });

    if (ep) return alert(ep.message);
    const allPlayers: Player[] = (ps as any) ?? [];

    // Carrega roster existente (se já tiver sido salvo antes)
    const { data: r, error: er } = await supabase
      .from("match_roster")
      .select("player_id,side,state,players(name)")
      .eq("match_id", matchId);

    const rosterMap: Record<string, { side: "A" | "B" | "C"; state: "ON_COURT" | "BENCH" }> = {};
    if (!er && r) {
      for (const x of r as any[]) {
        rosterMap[x.player_id] = { side: x.side, state: x.state };
      }
    }

    // Monta attendance: jogadores que já estavam no roster ficam presentes com side
    const entries: AttendanceEntry[] = allPlayers.map((p) => {
      const existing = rosterMap[p.id];
      return {
        player_id: p.id,
        name: p.name,
        type: p.type,
        present: !!existing,
        side: existing ? (existing.side as Side) : null,
        state: existing ? existing.state : "BENCH",
      };
    });

    // Fixos ficam pré-selecionados como presentes se não houver roster ainda
    const hasRoster = Object.keys(rosterMap).length > 0;
    if (!hasRoster) {
      setAttendance(
        entries.map((e) => ({
          ...e,
          present: e.type === "FIXO",
        }))
      );
    } else {
      setAttendance(entries);
    }
  }

  useEffect(() => {
    loadBase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  // ─── helpers attendance ────────────────────────────────────────────────────

  function togglePresent(playerId: string) {
    if (!canEdit) return;
    setAttendance((prev) =>
      prev.map((e) =>
        e.player_id === playerId
          ? { ...e, present: !e.present, side: !e.present ? e.side : null }
          : e
      )
    );
  }

  function setSide(playerId: string, side: Side) {
    if (!canEdit) return;
    setAttendance((prev) =>
      prev.map((e) => (e.player_id === playerId ? { ...e, side, present: true } : e))
    );
  }

  function setState(playerId: string, nextState: "ON_COURT" | "BENCH") {
    if (!canEdit) return;
    if (!match) return;

    setAttendance((prev) => {
      const item = prev.find((e) => e.player_id === playerId);
      if (!item || item.side === "C" || item.state === nextState) return prev;

      const limit = match.on_court;
      const currentOn = prev.filter(
        (e) => e.side === item.side && e.state === "ON_COURT"
      ).length;

      if (nextState === "ON_COURT" && currentOn >= limit) {
        alert(`Máximo em quadra por time: ${limit}`);
        return prev;
      }

      return prev.map((e) =>
        e.player_id === playerId ? { ...e, state: nextState } : e
      );
    });
  }

  function selectAll(type: "FIXO" | "COMPLETE" | "all") {
    if (!canEdit) return;
    setAttendance((prev) =>
      prev.map((e) =>
        type === "all" || e.type === type ? { ...e, present: true } : e
      )
    );
  }

  function clearAll() {
    if (!canEdit) return;
    setAttendance((prev) => prev.map((e) => ({ ...e, present: false, side: null })));
  }

  function autoSetOnCourt() {
    if (!canEdit || !match) return;
    setAttendance((prev) =>
      prev.map((e) => {
        if (!e.present || e.side === null || e.side === "C") {
          return { ...e, state: "BENCH" };
        }
        const sameTeamPresent = prev.filter(
          (x) => x.present && x.side === e.side
        );
        const idx = sameTeamPresent.findIndex((x) => x.player_id === e.player_id);
        return { ...e, state: idx < match.on_court ? "ON_COURT" : "BENCH" };
      })
    );
  }

  // ─── nomes dos times ───────────────────────────────────────────────────────

  function useFirstName(side: "A" | "B" | "C") {
    const first = attendance.find((e) => e.present && e.side === side);
    if (!first) return;
    if (side === "A") setNameA(first.name);
    if (side === "B") setNameB(first.name);
    if (side === "C") setNameC(first.name);
  }

  // ─── derivados ─────────────────────────────────────────────────────────────

  const present = useMemo(() => attendance.filter((e) => e.present), [attendance]);
  const presentA = useMemo(() => present.filter((e) => e.side === "A"), [present]);
  const presentB = useMemo(() => present.filter((e) => e.side === "B"), [present]);
  const presentC = useMemo(() => present.filter((e) => e.side === "C"), [present]);
  const noSide = useMemo(() => present.filter((e) => e.side === null), [present]);

  const hasC = presentC.length > 0;

  const filteredAttendance = useMemo(() => {
    const q = query.trim().toLowerCase();
    return attendance.filter((e) => (q ? e.name.toLowerCase().includes(q) : true));
  }, [attendance, query]);

  function teamLabel(s: "A" | "B" | "C") {
    if (s === "A") return nameA;
    if (s === "B") return nameB;
    return nameC;
  }

  function teamColor(s: "A" | "B" | "C") {
    if (s === "A") return colorA;
    if (s === "B") return colorB;
    return colorC;
  }

  function currentTeamEntries() {
    if (tab === "A") return presentA;
    if (tab === "B") return presentB;
    if (tab === "C") return presentC;
    return [];
  }

  // ─── salvar ────────────────────────────────────────────────────────────────

  async function saveAll() {
    if (!canEdit) return alert("Somente leitura. Informe o PIN para editar.");
    if (presentA.length === 0 || presentB.length === 0) {
      return alert("Coloque pelo menos 1 jogador no Time A e no Time B.");
    }
    if (noSide.length > 0) {
      return alert(
        `${noSide.length} jogador(es) presente(s) sem time definido: ${noSide.map((e) => e.name).join(", ")}`
      );
    }

    const { error: emeta } = await supabase.rpc("update_match_meta", {
      p_match_id: matchId,
      p_team_a_name: nameA,
      p_team_b_name: nameB,
      p_waiting_team_name: hasC ? nameC : "Time C",
      p_team_a_color: colorA,
      p_team_b_color: colorB,
      p_waiting_team_color: colorC,
      p_pin: pinInput,
    });
    if (emeta) return alert(emeta.message);

    const payload = present.map((e) => ({
      player_id: e.player_id,
      side: e.side as "A" | "B" | "C",
      state: e.side === "C" ? "BENCH" : e.state,
    }));

    const { error } = await supabase.rpc("set_match_roster", {
      p_match_id: matchId,
      p_items: payload,
      p_pin: pinInput,
    });
    if (error) return alert(error.message);

    router.push(`/match/${matchId}/live`);
  }

  // ─── render ────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur pt-[env(safe-area-inset-top)]">
        <div className="max-w-5xl mx-auto px-4 py-4 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs text-muted-foreground">Setup</div>
              <div className="text-xl font-black">Presença e escalação</div>
              {match && (
                <div className="text-xs text-muted-foreground mt-1">
                  Em quadra por time: <b className="text-foreground">{match.on_court}</b>
                </div>
              )}
            </div>
            <Button asChild variant="outline">
              <Link href={`/match/${matchId}/live`}>Voltar ao live</Link>
            </Button>
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList className="w-full md:w-auto">
              <TabsTrigger value="presenca">
                Presença
                {noSide.length > 0 && (
                  <Badge variant="destructive" className="ml-1 text-[10px] h-4 px-1">
                    {noSide.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="A">
                <span
                  className="h-2 w-2 rounded-full mr-1 inline-block"
                  style={{ background: colorA }}
                />
                {nameA} ({presentA.length})
              </TabsTrigger>
              <TabsTrigger value="B">
                <span
                  className="h-2 w-2 rounded-full mr-1 inline-block"
                  style={{ background: colorB }}
                />
                {nameB} ({presentB.length})
              </TabsTrigger>
              <TabsTrigger value="C">
                <span
                  className="h-2 w-2 rounded-full mr-1 inline-block"
                  style={{ background: colorC }}
                />
                {nameC} ({presentC.length})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* PIN */}
        <Card className="p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-sm text-muted-foreground">
              Edição:{" "}
              <b className="text-foreground">{canEdit ? "LIBERADA" : "SOMENTE LEITURA"}</b>
            </div>
            <Input
              type="password"
              className="w-40"
              placeholder="PIN"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
            />
            <Button onClick={unlockEdit} type="button" className="h-11">
              Liberar
            </Button>
            <Button variant="outline" onClick={lockEdit} type="button" className="h-11">
              Bloquear
            </Button>
          </div>
        </Card>

        {/* Aba Presença */}
        {tab === "presenca" && (
          <>
            {/* Ações rápidas */}
            <Card className="p-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-muted-foreground">Marcar:</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => selectAll("FIXO")}
                  disabled={!canEdit}
                  className="h-9"
                >
                  <Users className="h-3 w-3 mr-1" />
                  Todos os Fixos
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => selectAll("all")}
                  disabled={!canEdit}
                  className="h-9"
                >
                  <CheckSquare className="h-3 w-3 mr-1" />
                  Todos
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={clearAll}
                  disabled={!canEdit}
                  className="h-9"
                >
                  <Square className="h-3 w-3 mr-1" />
                  Limpar
                </Button>
                <div className="ml-auto text-xs text-muted-foreground">
                  {present.length} presente(s)
                </div>
              </div>
            </Card>

            {/* Busca */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-9"
                placeholder="Buscar jogador..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            {/* Lista de jogadores */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Jogadores</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Marque presença e escolha o time de cada jogador
                </p>
              </CardHeader>
              <CardContent className="space-y-1 p-3">
                {filteredAttendance.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Nenhum jogador encontrado.</div>
                ) : (
                  <div className="space-y-1">
                    {/* cabeçalho */}
                    <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-2 pb-1 text-xs font-semibold text-muted-foreground">
                      <span>Jogador</span>
                      <span className="text-center">Presente</span>
                      <span className="text-center w-[148px]">Time</span>
                    </div>

                    {filteredAttendance.map((e) => (
                      <div
                        key={e.player_id}
                        className={cn(
                          "grid grid-cols-[1fr_auto_auto] gap-3 items-center rounded-lg px-2 py-2 transition-colors",
                          e.present ? "bg-muted/40" : "opacity-60 hover:opacity-80"
                        )}
                      >
                        {/* Nome + tipo */}
                        <div className="min-w-0">
                          <div className="font-semibold truncate text-sm">{e.name}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {e.type === "FIXO" ? "Fixo" : "Complete"}
                          </div>
                        </div>

                        {/* Toggle presença */}
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => togglePresent(e.player_id)}
                          className={cn(
                            "h-9 w-9 rounded-lg border flex items-center justify-center transition-colors",
                            e.present
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-transparent"
                          )}
                          aria-label={e.present ? "Desmarcar presença" : "Marcar presença"}
                        >
                          {e.present ? (
                            <CheckSquare className="h-4 w-4" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </button>

                        {/* Selector de time */}
                        <SideSelector
                          value={e.present ? e.side : null}
                          onChange={(side) =>
                            e.present
                              ? setSide(e.player_id, side)
                              : setSide(e.player_id, side) // ao escolher time já marca presença
                          }
                          disabled={!canEdit}
                          colorA={colorA}
                          colorB={colorB}
                          colorC={colorC}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Alerta sem time */}
            {noSide.length > 0 && (
              <Card className="p-3 border-amber-500/50 bg-amber-500/10">
                <div className="text-sm text-amber-700 dark:text-amber-400 font-semibold">
                  {noSide.length} jogador(es) presente(s) sem time:
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {noSide.map((e) => e.name).join(", ")}
                </div>
              </Card>
            )}
          </>
        )}

        {/* Abas dos times (A, B, C) — quadra/banco */}
        {(tab === "A" || tab === "B" || tab === "C") && (
          <>
            {/* Meta times */}
            <div className="grid md:grid-cols-3 gap-3">
              <TeamMetaCard
                title="Time A"
                badge={nameA}
                name={nameA}
                setName={setNameA}
                color={colorA}
                setColor={setColorA}
                canEdit={canEdit}
                isOpen={metaOpen.A}
                onToggle={() => setMetaOpen((s) => ({ ...s, A: !s.A }))}
                onUseFirst={() => useFirstName("A")}
              />
              <TeamMetaCard
                title="Time B"
                badge={nameB}
                name={nameB}
                setName={setNameB}
                color={colorB}
                setColor={setColorB}
                canEdit={canEdit}
                isOpen={metaOpen.B}
                onToggle={() => setMetaOpen((s) => ({ ...s, B: !s.B }))}
                onUseFirst={() => useFirstName("B")}
              />
              <TeamMetaCard
                title="Time C (espera)"
                badge={hasC ? nameC : "sem jogadores"}
                name={nameC}
                setName={setNameC}
                color={colorC}
                setColor={setColorC}
                canEdit={canEdit}
                disabled={!hasC}
                isOpen={metaOpen.C}
                onToggle={() => setMetaOpen((s) => ({ ...s, C: !s.C }))}
                onUseFirst={() => useFirstName("C")}
              />
            </div>

            {/* Auto set */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={autoSetOnCourt}
                disabled={!canEdit}
                type="button"
                className="h-11"
              >
                Auto distribuir Quadra/Banco
              </Button>
            </div>

            {/* Lista do time atual */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2 min-w-0">
                    <span
                      className="h-3 w-3 rounded-full border"
                      style={{ background: teamColor(tab as "A" | "B" | "C") }}
                    />
                    <span className="truncate">{teamLabel(tab as "A" | "B" | "C")}</span>
                  </CardTitle>
                  <Badge variant="outline">{currentTeamEntries().length} jogador(es)</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {currentTeamEntries().length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    Nenhum jogador neste time. Vá na aba{" "}
                    <button
                      type="button"
                      className="underline"
                      onClick={() => setTab("presenca")}
                    >
                      Presença
                    </button>{" "}
                    para adicionar.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {currentTeamEntries().map((e) => (
                      <div
                        key={e.player_id}
                        className="rounded-xl border p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                      >
                        <div
                          className="font-semibold leading-tight truncate"
                          title={e.name}
                        >
                          {e.name}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                          {tab !== "C" ? (
                            <>
                              <Button
                                type="button"
                                className="h-11"
                                variant={e.state === "ON_COURT" ? "default" : "outline"}
                                onClick={() => setState(e.player_id, "ON_COURT")}
                                disabled={!canEdit}
                              >
                                QUADRA
                              </Button>
                              <Button
                                type="button"
                                className="h-11"
                                variant={e.state === "BENCH" ? "default" : "outline"}
                                onClick={() => setState(e.player_id, "BENCH")}
                                disabled={!canEdit}
                              >
                                BANCO
                              </Button>
                            </>
                          ) : (
                            <Badge variant="secondary" className="h-11 px-3 flex items-center">
                              Sempre banco
                            </Badge>
                          )}

                          {/* Mover para outro time */}
                          <SideSelector
                            value={e.side}
                            onChange={(side) => setSide(e.player_id, side)}
                            disabled={!canEdit}
                            colorA={colorA}
                            colorB={colorB}
                            colorC={colorC}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* Botão salvar (sempre visível) */}
        <div className="sticky bottom-4 flex justify-end">
          <Button
            onClick={saveAll}
            disabled={!canEdit}
            className="h-12 px-8 text-base font-black shadow-lg"
          >
            Salvar e ir ao Live →
          </Button>
        </div>
      </div>
    </main>
  );
}