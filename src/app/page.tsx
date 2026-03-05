"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type GroupRow = {
  id: string;
  name: string | null;
  created_at: string;
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function InstallAppButton() {
  const [deferred, setDeferred] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [openIOS, setOpenIOS] = useState(false);

  useEffect(() => {
    const ua = window.navigator.userAgent.toLowerCase();
    const ios = /iphone|ipad|ipod/.test(ua);
    setIsIOS(ios);

    const standalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      (window.navigator as any).standalone === true;

    setIsStandalone(!!standalone);

    const handler = (e: any) => {
      e.preventDefault();
      setDeferred(e);
    };

    window.addEventListener("beforeinstallprompt", handler as any);
    return () => window.removeEventListener("beforeinstallprompt", handler as any);
  }, []);

  if (isStandalone) return null;
  if (!deferred && !isIOS) return null;

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        className="shrink-0 shadow-sm"
        onClick={async () => {
          if (deferred) {
            deferred.prompt();
            try {
              await deferred.userChoice;
            } finally {
              setDeferred(null);
            }
          } else {
            setOpenIOS(true);
          }
        }}
      >
        Instalar
      </Button>

      <Dialog open={openIOS} onOpenChange={setOpenIOS}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Instalar no iPhone</DialogTitle>
          </DialogHeader>
          <div className="text-sm space-y-2">
            <div>
              No Safari: toque em <b>Compartilhar</b> → <b>Adicionar à Tela de Início</b>.
            </div>
            <div className="text-muted-foreground">
              (No iOS não aparece o botão automático de instalar como no Android.)
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function HomePage() {
  const router = useRouter();

  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [newName, setNewName] = useState("");
  const [newPin, setNewPin] = useState("");

  async function loadGroups() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("groups")
        .select("id,name,created_at")
        .order("created_at", { ascending: false });

      if (error) return alert(error.message);
      setGroups((data ?? []) as any);
    } finally {
      setLoading(false);
    }
  }

  async function createGroup() {
    const name = newName.trim();
    const pin = newPin.trim();
    if (!name) return alert("Informe o nome do grupo.");
    if (pin.length < 4) return alert("PIN precisa ter pelo menos 4 dígitos.");

    const { data, error } = await supabase.rpc("create_group_with_pin", {
      p_name: name,
      p_pin: pin,
    });

    if (error) return alert(error.message);

    const gid = (data as any) as string;
    localStorage.setItem(`pin:${gid}`, pin);

    setNewName("");
    setNewPin("");
    await loadGroups();

    router.push(`/g/${gid}`);
  }

  useEffect(() => {
    loadGroups();
  }, []);

  const hasAny = useMemo(() => groups.length > 0, [groups]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-4 py-6 md:py-10 space-y-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <h1 className="text-3xl md:text-4xl font-black tracking-tight">⚽ Futzin</h1>
            <div className="text-sm text-muted-foreground">
              Crie grupos, compartilhe o Live e acompanhe o ranking da turma.
            </div>
          </div>

          <InstallAppButton />
        </div>

        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Criar novo grupo</CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* sem borda interna (evita “borda dentro de borda”) */}
            <div className="rounded-lg bg-muted/30 p-3">
              <div className="grid md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <div className="text-xs font-semibold text-muted-foreground mb-1">Nome do grupo</div>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Ex: Segunda & Quarta 19:30"
                  />
                </div>

                <div>
                  <div className="text-xs font-semibold text-muted-foreground mb-1">PIN (edição)</div>
                  <Input
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value)}
                    placeholder="Ex: 1234"
                    type="password"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* hierarquia: ação principal em destaque; feedback/hint separado */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <Button onClick={createGroup}>Criar grupo</Button>
              <div className="text-xs text-muted-foreground">
                O PIN fica salvo no seu navegador (localStorage) após criar.
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-lg">Meus grupos</CardTitle>

              <div className="flex items-center gap-2">
                {/* “Atualizar” vira ação secundária no cabeçalho */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={loadGroups}
                  disabled={loading}
                  className="gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Atualizar
                </Button>

                <Badge variant="outline">{loading ? "carregando..." : `${groups.length} grupos`}</Badge>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {!hasAny ? (
              <div className="text-sm text-muted-foreground">Nenhum grupo ainda. Crie o primeiro acima.</div>
            ) : (
              <div className="flex flex-col gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-3">
                {groups.map((g) => (
                  <Card
                    key={g.id}
                    className="group relative overflow-hidden border bg-card shadow-sm transition-all
                               hover:shadow-md hover:-translate-y-0.5 hover:border-primary/30
                               focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background"
                  >
                    <div className="absolute inset-y-0 left-0 w-1 bg-primary" />

                    <CardContent className="p-4 pl-5 space-y-3 transition-colors group-hover:bg-muted/20">
                      {/* área clicável com feedback (sem link aninhado) */}
                      <button
                        type="button"
                        className="w-full text-left rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => router.push(`/g/${g.id}`)}
                      >
                        <div className="space-y-1">
                          <div className="font-black text-lg leading-tight">
                            {g.name ?? "Grupo sem nome"}
                          </div>
                          <div className="text-xs text-muted-foreground">Criado em {fmtDate(g.created_at)}</div>
                        </div>
                      </button>

                      <div className="flex gap-2">
                        <Button asChild className="flex-1">
                          <Link href={`/g/${g.id}`}>Abrir</Link>
                        </Button>
                        <Button asChild variant="outline" className="flex-1">
                          <Link href={`/g/${g.id}/ranking`}>Ranking</Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="text-xs text-muted-foreground">
          Dica: para compartilhar com a turma, use o link do Live/Grupo. Quem não tiver PIN fica em modo leitura.
        </div>
      </div>
    </main>
  );
}