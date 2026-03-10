"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, ChevronUp, ChevronLeft, Search, Users, CheckSquare, Square } from "lucide-react";

import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

// ─── tipos ────────────────────────────────────────────────────────────────────

type Side = "A" | "B" | "C" | null;

interface AttendanceEntry {
  player_id: string;
  name: string;
  type: "FIXO" | "COMPLETE";
  present: boolean;
  side: Side;
}

// ─── TeamMetaCard ─────────────────────────────────────────────────────────────

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
  title, badge, name, setName, color, setColor,
  canEdit, disabled, isOpen, onToggle, onUseFirst,
}: TeamMetaCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="h-3 w-3 rounded-full border shrink-0" style={{ background: color }} />
            <CardTitle className="text-sm truncate">{title}</CardTitle>
            <Badge variant="outline" className="text-xs truncate max-w-[100px]">{badge}</Badge>
          </div>
          <Button variant="ghost" size="sm" className="h-8 shrink-0 md:hidden" onClick={onToggle} type="button">
            <span className="text-xs">{isOpen ? "Fechar" : "Editar"}</span>
            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>

      <CardContent className={cn("space-y-3", "md:block", isOpen ? "block" : "hidden md:block")}>
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground">Nome</div>
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit || !!disabled} />
        </div>
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">Cor</div>
          <input
            type="color" value={color} onChange={(e) => setColor(e.target.value)}
            disabled={!canEdit || !!disabled}
            className="h-11 w-16 rounded-md border bg-transparent"
          />
        </div>
        <Button variant="outline" onClick={onUseFirst} type="button"
          disabled={!canEdit || !!disabled} className="w-full h-11">
          Usar 1º jogador
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── SideSelector ─────────────────────────────────────────────────────────────

const SIDE_OPTIONS: { value: Side; label: string }[] = [
  { value: null, label: "—" },
  { value: "A",  label: "A" },
  { value: "B",  label: "B" },
  { value: "C",  label: "C" },
];

function SideSelector({
  value, onChange, disabled, colorA, colorB, colorC,
}: {
  value: Side; onChange: (s: Side) => void; disabled?: boolean;
  colorA: string; colorB: string; colorC: string;
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
            value === opt.value ? "ring-2 ring-offset-1 ring-foreground/40 scale-105" : "opacity-50 hover:opacity-80"
          )}
          style={{
            background: opt.value ? colorFor(opt.value) : "transparent",
            color: opt.value ? "#fff" : undefined,
            textShadow: opt.value ? "0 1px 2px rgba(0,0,0,0.5)" : undefined,
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function MatchSetupPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const router = useRouter();

  const [groupId, setGroupId] = useState<string>("");
  const [attendance, setAttendance] = useState<AttendanceEntry[]>([]);

  // PIN
  const [pinInput, setPinInput] = useState("");
  const [canEdit, setCanEdit] = useState(false);

  // Meta editável
  const [nameA, setNameA] = useState("Time A");
  const [nameB, setNameB] = useState("Time B");
  const [nameC, setNameC] = useState("Time C");
  const [colorA, setColorA] = useState("#FACC15");
  const [colorB, setColorB] = useState("#3B82F6");
  const [colorC, setColorC] = useState("#A3A3A3");

  // UI
  const [tab, setTab] = useState<"presenca" | "A" | "B" | "C">("presenca");
  const [query, setQuery] = useState("");
  const [metaOpen, setMetaOpen] = useState<{ A: boolean; B: boolean; C: boolean }>({ A: false, B: false, C: false });

  // ─── PIN ──────────────────────────────────────────────────────────────────

  function pinKey(gid: string) { return `pin:${gid}`; }

  async function validatePin(pin: string): Promise<boolean> {
    const { data: ok, error } = await supabase.rpc("check_edit_pin_for_match", {
      p_match_id: matchId,
      p_pin: pin,
    });
    if (error) { alert(error.message); return false; }
    return !!ok;
  }

  async function unlockEdit() {
    if (!groupId) return;
    const ok = await validatePin(pinInput);
    if (ok) { localStorage.setItem(pinKey(groupId), pinInput); setCanEdit(true); }
    else { setCanEdit(false); alert("PIN incorreto."); }
  }

  function lockEdit() {
    if (!groupId) return;
    localStorage.removeItem(pinKey(groupId));
    setPinInput("");
    setCanEdit(false);
  }

  // ─── Carregamento ─────────────────────────────────────────────────────────

  async function loadBase() {
    const { data: ma, error: ema } = await supabase
      .from("matches")
      .select("meeting_id,team_a_name,team_b_name,waiting_team_name,team_a_color,team_b_color,waiting_team_color")
      .eq("id", matchId)
      .single();

    if (ema) return alert(ema.message);

    setNameA(ma.team_a_name ?? "Time A");
    setNameB(ma.team_b_name ?? "Time B");
    setNameC(ma.waiting_team_name ?? "Time C");
    setColorA(ma.team_a_color ?? "#FACC15");
    setColorB(ma.team_b_color ?? "#3B82F6");
    setColorC(ma.waiting_team_color ?? "#A3A3A3");

    const { data: meet, error: em } = await supabase
      .from("meetings").select("group_id").eq("id", ma.meeting_id).single();
    if (em) return alert(em.message);

    const gid = meet.group_id as string;
    setGroupId(gid);

    const savedPin = localStorage.getItem(pinKey(gid)) || "";
    if (savedPin) {
      setPinInput(savedPin);
      const ok = await validatePin(savedPin);
      setCanEdit(ok);
    }

    // Jogadores ativos do grupo
    const { data: ps, error: ep } = await supabase
      .from("players")
      .select("id,name,type")
      .eq("group_id", gid)
      .eq("active", true)
      .order("name", { ascending: true });
    if (ep) return alert(ep.message);

    // Roster existente (se já salvo)
    const { data: r } = await supabase
      .from("match_roster")
      .select("player_id,side")
      .eq("match_id", matchId);

    const rosterMap: Record<string, "A" | "B" | "C"> = {};
    if (r) {
      for (const x of r as any[]) rosterMap[x.player_id] = x.side;
    }

    const hasRoster = Object.keys(rosterMap).length > 0;

    const entries: AttendanceEntry[] = ((ps ?? []) as any[]).map((p) => {
      const existing = rosterMap[p.id];
      return {
        player_id: p.id,
        name: p.name,
        type: p.type,
        present: !!existing || (!hasRoster && p.type === "FIXO"),
        side: existing ?? null,
      };
    });

    setAttendance(entries);
  }

  useEffect(() => {
    loadBase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  // ─── Helpers attendance ───────────────────────────────────────────────────

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

  function selectAll(type: "FIXO" | "COMPLETE" | "all") {
    if (!canEdit) return;
    setAttendance((prev) =>
      prev.map((e) => (type === "all" || e.type === type ? { ...e, present: true } : e))
    );
  }

  function clearAll() {
    if (!canEdit) return;
    setAttendance((prev) => prev.map((e) => ({ ...e, present: false, side: null })));
  }

  // ─── Nomes dos times ──────────────────────────────────────────────────────

  function useFirstName(side: "A" | "B" | "C") {
    const first = attendance.find((e) => e.present && e.side === side);
    if (!first) return;
    if (side === "A") setNameA(first.name);
    if (side === "B") setNameB(first.name);
    if (side === "C") setNameC(first.name);
  }

  // ─── Derivados ────────────────────────────────────────────────────────────

  const present   = useMemo(() => attendance.filter((e) => e.present), [attendance]);
  const presentA  = useMemo(() => present.filter((e) => e.side === "A"), [present]);
  const presentB  = useMemo(() => present.filter((e) => e.side === "B"), [present]);
  const presentC  = useMemo(() => present.filter((e) => e.side === "C"), [present]);
  const noSide    = useMemo(() => present.filter((e) => e.side === null), [present]);
  const hasC      = presentC.length > 0;

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

  // ─── Salvar (função comum) ────────────────────────────────────────────────

  async function persist(): Promise<boolean> {
    if (!canEdit) { alert("Somente leitura. Informe o PIN para editar."); return false; }
    if (presentA.length === 0 || presentB.length === 0) {
      alert("Coloque pelo menos 1 jogador no Time A e no Time B.");
      return false;
    }
    if (noSide.length > 0) {
      alert(`${noSide.length} jogador(es) sem time: ${noSide.map((e) => e.name).join(", ")}`);
      return false;
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
    if (emeta) { alert(emeta.message); return false; }

    const payload = present.map((e) => ({
      player_id: e.player_id,
      side: e.side as "A" | "B" | "C",
    }));

    const { error } = await supabase.rpc("set_match_roster", {
      p_match_id: matchId,
      p_items: payload,
      p_pin: pinInput,
    });
    if (error) { alert(error.message); return false; }

    return true;
  }

  async function saveAndLive() {
    const ok = await persist();
    if (ok) router.push(`/match/${matchId}/live`);
  }

  async function saveAndPostgame() {
    const ok = await persist();
    if (ok) router.push(`/match/${matchId}/postgame`);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur pt-[env(safe-area-inset-top)]">
        <div className="max-w-5xl mx-auto px-4 py-4 space-y-3">
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
                <div className="text-xs text-muted-foreground">Setup</div>
                <div className="text-xl font-black leading-tight">Presença e times</div>
              </div>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href={`/match/${matchId}/live`}>Live</Link>
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
                <span className="h-2 w-2 rounded-full mr-1 inline-block" style={{ background: colorA }} />
                {nameA} ({presentA.length})
              </TabsTrigger>
              <TabsTrigger value="B">
                <span className="h-2 w-2 rounded-full mr-1 inline-block" style={{ background: colorB }} />
                {nameB} ({presentB.length})
              </TabsTrigger>
              <TabsTrigger value="C">
                <span className="h-2 w-2 rounded-full mr-1 inline-block" style={{ background: colorC }} />
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
              Edição: <b className="text-foreground">{canEdit ? "LIBERADA" : "SOMENTE LEITURA"}</b>
            </div>
            <Input
              type="password" className="w-40" placeholder="PIN"
              value={pinInput} onChange={(e) => setPinInput(e.target.value)}
            />
            <Button onClick={unlockEdit} type="button" className="h-11">Liberar</Button>
            <Button variant="outline" onClick={lockEdit} type="button" className="h-11">Bloquear</Button>
          </div>
        </Card>

        {/* Aba Presença */}
        {tab === "presenca" && (
          <>
            <Card className="p-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-muted-foreground">Marcar:</span>
                <Button size="sm" variant="outline" onClick={() => selectAll("FIXO")} disabled={!canEdit} className="h-9">
                  <Users className="h-3 w-3 mr-1" /> Todos os Fixos
                </Button>
                <Button size="sm" variant="outline" onClick={() => selectAll("all")} disabled={!canEdit} className="h-9">
                  <CheckSquare className="h-3 w-3 mr-1" /> Todos
                </Button>
                <Button size="sm" variant="outline" onClick={clearAll} disabled={!canEdit} className="h-9">
                  <Square className="h-3 w-3 mr-1" /> Limpar
                </Button>
                <div className="ml-auto text-xs text-muted-foreground">{present.length} presente(s)</div>
              </div>
            </Card>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-9" placeholder="Buscar jogador..."
                value={query} onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Jogadores</CardTitle>
                <p className="text-xs text-muted-foreground">Marque quem está presente e escolha o time de cada um</p>
              </CardHeader>
              <CardContent className="space-y-1 p-3">
                {filteredAttendance.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Nenhum jogador encontrado.</div>
                ) : (
                  <div className="space-y-1">
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
                        <div className="min-w-0">
                          <div className="font-semibold truncate text-sm">{e.name}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {e.type === "FIXO" ? "Fixo" : "Complete"}
                          </div>
                        </div>

                        <button
                          type="button" disabled={!canEdit} onClick={() => togglePresent(e.player_id)}
                          className={cn(
                            "h-9 w-9 rounded-lg border flex items-center justify-center transition-colors",
                            e.present ? "bg-primary text-primary-foreground border-primary" : "bg-transparent"
                          )}
                        >
                          {e.present ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                        </button>

                        <SideSelector
                          value={e.present ? e.side : null}
                          onChange={(side) => setSide(e.player_id, side)}
                          disabled={!canEdit}
                          colorA={colorA} colorB={colorB} colorC={colorC}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {noSide.length > 0 && (
              <Card className="p-3 border-amber-500/50 bg-amber-500/10">
                <div className="text-sm text-amber-700 dark:text-amber-400 font-semibold">
                  {noSide.length} jogador(es) sem time:
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {noSide.map((e) => e.name).join(", ")}
                </div>
              </Card>
            )}
          </>
        )}

        {/* Abas dos times (A, B, C) — apenas lista, sem quadra/banco */}
        {(tab === "A" || tab === "B" || tab === "C") && (
          <>
            <div className="grid md:grid-cols-3 gap-3">
              <TeamMetaCard
                title="Time A" badge={nameA} name={nameA} setName={setNameA}
                color={colorA} setColor={setColorA} canEdit={canEdit}
                isOpen={metaOpen.A} onToggle={() => setMetaOpen((s) => ({ ...s, A: !s.A }))}
                onUseFirst={() => useFirstName("A")}
              />
              <TeamMetaCard
                title="Time B" badge={nameB} name={nameB} setName={setNameB}
                color={colorB} setColor={setColorB} canEdit={canEdit}
                isOpen={metaOpen.B} onToggle={() => setMetaOpen((s) => ({ ...s, B: !s.B }))}
                onUseFirst={() => useFirstName("B")}
              />
              <TeamMetaCard
                title="Time C (espera)" badge={hasC ? nameC : "sem jogadores"}
                name={nameC} setName={setNameC} color={colorC} setColor={setColorC}
                canEdit={canEdit} disabled={!hasC}
                isOpen={metaOpen.C} onToggle={() => setMetaOpen((s) => ({ ...s, C: !s.C }))}
                onUseFirst={() => useFirstName("C")}
              />
            </div>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2 min-w-0">
                    <span className="h-3 w-3 rounded-full border" style={{ background: teamColor(tab as "A" | "B" | "C") }} />
                    <span className="truncate">{teamLabel(tab as "A" | "B" | "C")}</span>
                  </CardTitle>
                  <Badge variant="outline">{currentTeamEntries().length} jogador(es)</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {currentTeamEntries().length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    Nenhum jogador neste time. Vá na aba{" "}
                    <button type="button" className="underline" onClick={() => setTab("presenca")}>
                      Presença
                    </button>{" "}
                    para adicionar.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {currentTeamEntries().map((e) => (
                      <div
                        key={e.player_id}
                        className="rounded-xl border p-3 flex items-center justify-between gap-3"
                      >
                        <div className="font-semibold leading-tight truncate" title={e.name}>
                          {e.name}
                        </div>
                        <SideSelector
                          value={e.side}
                          onChange={(side) => setSide(e.player_id, side)}
                          disabled={!canEdit}
                          colorA={colorA} colorB={colorB} colorC={colorC}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* Botões de ação */}
        <div className="sticky bottom-4 flex gap-2 justify-end flex-wrap">
          <Button onClick={saveAndLive} disabled={!canEdit} variant="outline" className="h-12 px-6 text-sm font-bold shadow-lg">
            Salvar e ir ao Live
          </Button>
          <Button onClick={saveAndPostgame} disabled={!canEdit} className="h-12 px-8 text-base font-black shadow-lg">
            Salvar e Pós-jogo →
          </Button>
        </div>
      </div>
    </main>
  );
}
