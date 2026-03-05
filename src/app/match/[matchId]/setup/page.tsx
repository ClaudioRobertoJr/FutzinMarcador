"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

// shadcn/ui
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type Player = { id: string; name: string; type: "FIXO" | "COMPLETE" };

type MatchInfo = {
  meeting_id: string;
  on_court: number;
  team_a_name: string;
  team_b_name: string;
  waiting_team_name: string | null;
  team_a_color: string;
  team_b_color: string;
  waiting_team_color: string;
};

type Pick = {
  player_id: string;
  name: string;
  side: "A" | "B" | "C";
  state: "ON_COURT" | "BENCH";
};

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function MatchSetupPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const router = useRouter();

  const [match, setMatch] = useState<MatchInfo | null>(null);
  const [groupId, setGroupId] = useState<string>("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [picks, setPicks] = useState<Pick[]>([]);

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
  const [tab, setTab] = useState<"A" | "B" | "C">("A");
  const [query, setQuery] = useState("");

  function pinKey(gid: string) {
    return `pin:${gid}`;
  }

  async function validatePinForGroup(gid: string, pin: string) {
    const { data: ok, error } = await supabase.rpc("check_edit_pin_for_group", {
      p_group_id: gid,
      p_pin: pin,
    });
    if (error) {
      alert(error.message);
      return false;
    }
    return !!ok;
  }

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

    const { data: ps, error: ep } = await supabase
      .from("players")
      .select("id,name,type")
      .eq("group_id", gid)
      .eq("active", true)
      .order("created_at", { ascending: false });

    if (ep) return alert(ep.message);
    setPlayers(ps as any);

    const { data: r, error: er } = await supabase
      .from("match_roster")
      .select("player_id,side,state,players(name)")
      .eq("match_id", matchId);

    if (!er && r && r.length) {
      setPicks(
        (r as any).map((x: any) => ({
          player_id: x.player_id,
          name: x.players?.name ?? x.player_id,
          side: x.side as "A" | "B" | "C",
          state: x.state as "ON_COURT" | "BENCH",
        }))
      );
    } else {
      setPicks([]);
    }
  }

  useEffect(() => {
    loadBase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

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

  const usedIds = useMemo(() => new Set(picks.map((p) => p.player_id)), [picks]);

  const picksA = useMemo(() => picks.filter((p) => p.side === "A"), [picks]);
  const picksB = useMemo(() => picks.filter((p) => p.side === "B"), [picks]);
  const picksC = useMemo(() => picks.filter((p) => p.side === "C"), [picks]);

  const hasC = picksC.length > 0;

  const filteredAvailable = useMemo(() => {
    const q = query.trim().toLowerCase();
    return players
      .filter((p) => !usedIds.has(p.id))
      .filter((p) => (q ? p.name.toLowerCase().includes(q) : true))
      .slice(0, 60);
  }, [players, usedIds, query]);

  function addTo(side: "A" | "B" | "C", playerId: string) {
    if (!canEdit) return;
    if (!playerId) return;
    if (usedIds.has(playerId)) return;

    const pl = players.find((p) => p.id === playerId);
    if (!pl) return;

    setPicks((prev) => [...prev, { player_id: pl.id, name: pl.name, side, state: "BENCH" }]);
  }

  function removePick(playerId: string) {
    if (!canEdit) return;
    setPicks((prev) => prev.filter((p) => p.player_id !== playerId));
  }

  function toggleState(playerId: string) {
    if (!canEdit) return;
    if (!match) return;

    setPicks((prev) => {
      const item = prev.find((p) => p.player_id === playerId);
      if (!item) return prev;
      if (item.side === "C") return prev; // C sempre banco

      const limit = match.on_court;

      const currentOn =
        item.side === "A"
          ? prev.filter((p) => p.side === "A" && p.state === "ON_COURT").length
          : prev.filter((p) => p.side === "B" && p.state === "ON_COURT").length;

      const nextState = item.state === "ON_COURT" ? "BENCH" : "ON_COURT";

      if (nextState === "ON_COURT" && currentOn >= limit) {
        alert(`Máximo em quadra por time: ${limit}`);
        return prev;
      }

      return prev.map((p) => (p.player_id === playerId ? { ...p, state: nextState } : p));
    });
  }

  function useFirstName(side: "A" | "B" | "C") {
    const list = side === "A" ? picksA : side === "B" ? picksB : picksC;
    if (!list.length) return;
    const first = list[0].name;
    if (side === "A") setNameA(first);
    if (side === "B") setNameB(first);
    if (side === "C") setNameC(first);
  }

  function autoSetOnCourt() {
    if (!canEdit) return;
    if (!match) return;

    const setSide = (arr: Pick[]): Pick[] =>
      arr.map((p, i) => ({
        ...p,
        state: (i < match.on_court ? "ON_COURT" : "BENCH") as Pick["state"],
      }));

    const setSideC = (arr: Pick[]): Pick[] =>
      arr.map((p) => ({
        ...p,
        state: "BENCH" as Pick["state"],
      }));

    setPicks([...setSide(picksA), ...setSide(picksB), ...setSideC(picksC)]);
  }

  async function saveAll() {
    if (!canEdit) return alert("Somente leitura. Informe o PIN para editar.");

    if (picksA.length === 0 || picksB.length === 0) {
      return alert("Coloque pelo menos 1 jogador no A e no B.");
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

    const fixed = picks.map((p) => (p.side === "C" ? { ...p, state: "BENCH" } : p));
    const payload = fixed.map((p) => ({ player_id: p.player_id, side: p.side, state: p.state }));

    const { error } = await supabase.rpc("set_match_roster", {
      p_match_id: matchId,
      p_items: payload,
      p_pin: pinInput,
    });
    if (error) return alert(error.message);

    router.push(`/match/${matchId}/live`);
  }

  const currentTeam = tab === "A" ? picksA : tab === "B" ? picksB : picksC;

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

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Sticky só do topo (compacto) */}
      <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur pt-[env(safe-area-inset-top)]">
        <div className="max-w-5xl mx-auto px-4 py-4 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs text-muted-foreground">Setup</div>
              <div className="text-xl font-black">Times, cores e escalação</div>
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
              <TabsTrigger value="A">Time A</TabsTrigger>
              <TabsTrigger value="B">Time B</TabsTrigger>
              <TabsTrigger value="C">Time C</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* PIN (fora do sticky) */}
        <Card className="p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-sm text-muted-foreground">
              Edição: <b className="text-foreground">{canEdit ? "LIBERADA" : "SOMENTE LEITURA"}</b>
            </div>

            <Input
              type="password"
              className="w-40"
              placeholder="PIN"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
            />
            <Button onClick={unlockEdit} type="button">
              Liberar
            </Button>
            <Button variant="outline" onClick={lockEdit} type="button">
              Bloquear
            </Button>

            {!canEdit && (
              <Badge variant="outline" className="text-muted-foreground">
                Somente leitura
              </Badge>
            )}
          </div>
        </Card>

        {/* Meta times (fora do sticky) */}
        <div className="grid md:grid-cols-3 gap-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="h-3 w-3 rounded-full border" style={{ background: colorA }} />
                Time A
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input value={nameA} onChange={(e) => setNameA(e.target.value)} disabled={!canEdit} />
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">Cor</div>
                <input type="color" value={colorA} onChange={(e) => setColorA(e.target.value)} disabled={!canEdit} />
              </div>
              <Button variant="outline" onClick={() => useFirstName("A")} type="button" disabled={!canEdit}>
                Usar 1º jogador
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="h-3 w-3 rounded-full border" style={{ background: colorB }} />
                Time B
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input value={nameB} onChange={(e) => setNameB(e.target.value)} disabled={!canEdit} />
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">Cor</div>
                <input type="color" value={colorB} onChange={(e) => setColorB(e.target.value)} disabled={!canEdit} />
              </div>
              <Button variant="outline" onClick={() => useFirstName("B")} type="button" disabled={!canEdit}>
                Usar 1º jogador
              </Button>
            </CardContent>
          </Card>

          <Card className={cn(!hasC && "opacity-60")}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="h-3 w-3 rounded-full border" style={{ background: colorC }} />
                Time C (espera)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input value={nameC} onChange={(e) => setNameC(e.target.value)} disabled={!canEdit || !hasC} />
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">Cor</div>
                <input
                  type="color"
                  value={colorC}
                  onChange={(e) => setColorC(e.target.value)}
                  disabled={!canEdit || !hasC}
                />
              </div>
              <Button variant="outline" onClick={() => useFirstName("C")} type="button" disabled={!canEdit || !hasC}>
                Usar 1º jogador
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Lista do time */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="h-3 w-3 rounded-full border" style={{ background: teamColor(tab) }} />
                {teamLabel(tab)}
              </CardTitle>
              <Badge variant="outline">{currentTeam.length} jogador(es)</Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-3">
            {currentTeam.length === 0 ? (
              <div className="text-sm text-muted-foreground">Sem jogadores neste time.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {currentTeam.map((p) => (
                  <div key={p.player_id} className="rounded-2xl border px-3 py-2 flex items-center gap-2">
                    <div className="font-semibold">{p.name}</div>

                    {tab !== "C" && (
                      <Button
                        variant={p.state === "ON_COURT" ? "default" : "outline"}
                        size="sm"
                        onClick={() => toggleState(p.player_id)}
                        type="button"
                        disabled={!canEdit}
                      >
                        {p.state === "ON_COURT" ? "QUADRA" : "BANCO"}
                      </Button>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removePick(p.player_id)}
                      type="button"
                      disabled={!canEdit}
                    >
                      Remover
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {tab === "C" && <div className="text-xs text-muted-foreground">Time C fica sempre no banco nesta rodada.</div>}
          </CardContent>
        </Card>

        {/* Adicionar jogador */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Adicionar jogador</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Buscar…" value={query} onChange={(e) => setQuery(e.target.value)} />

            {filteredAvailable.length === 0 ? (
              <div className="text-sm text-muted-foreground">Sem disponíveis.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {filteredAvailable.map((p) => (
                  <Button
                    key={p.id}
                    variant="outline"
                    className="rounded-full"
                    onClick={() => addTo(tab, p.id)}
                    disabled={!canEdit}
                    type="button"
                  >
                    <span className="font-semibold">{p.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">({p.type})</span>
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 h-12" onClick={autoSetOnCourt} disabled={!canEdit} type="button">
            Auto: primeiros em quadra
          </Button>
          <Button className="flex-1 h-12" onClick={saveAll} disabled={!canEdit} type="button">
            Salvar e ir pro Live
          </Button>
        </div>
      </div>
    </main>
  );
}