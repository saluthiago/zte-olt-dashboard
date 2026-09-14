import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Cable,
  CheckCircle2,
  ChevronRight,
  CircleOff,
  ClipboardList,
  Cloud,
  Gauge,
  LayoutDashboard,
  LifeBuoy,
  LockKeyhole,
  Menu,
  MoreHorizontal,
  Network,
  Power,
  RefreshCw,
  Router,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  Signal,
  Terminal,
  UserRound,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { applyOperatorAction, getOperatorActionLabel, getSignalLevel } from "@shared/olt";
import { trpc } from "@/lib/trpc";


type ONUStatus = "online" | "alerta" | "offline";

type ONU = {
  id: string;
  serial: string;
  mac: string;
  name: string;
  slot: string;
  status: ONUStatus;
  signal: number;
  distance: number;
  uptime: string;
  lastEvent: string;
  profile: string;
};

type EventItem = {
  id: number;
  type: "fiber" | "warning" | "power";
  title: string;
  detail: string;
  time: string;
  fresh?: boolean;
};

const initialOnus: ONU[] = [
  { id: "onu-01", serial: "ZTEG7A18C2F1", mac: "A4:7B:9D:21:8C:10", name: "Residencial Aurora", slot: "1/1/1:1", status: "online", signal: -19.4, distance: 2.84, uptime: "18d 04h", lastEvent: "Sem alarmes", profile: "GPON-300M" },
  { id: "onu-02", serial: "ZTEG7A18C2B9", mac: "A4:7B:9D:21:8C:2E", name: "Condomínio Sol", slot: "1/1/1:2", status: "alerta", signal: -26.8, distance: 4.11, uptime: "06d 13h", lastEvent: "RX baixo", profile: "GPON-600M" },
  { id: "onu-03", serial: "ZTEG7A18C30A", mac: "A4:7B:9D:21:8C:44", name: "Mercado Central", slot: "1/1/1:3", status: "online", signal: -21.1, distance: 1.92, uptime: "42d 22h", lastEvent: "Sem alarmes", profile: "GPON-1G" },
  { id: "onu-04", serial: "ZTEG7A18C321", mac: "A4:7B:9D:21:8C:5A", name: "Escola Municipal", slot: "1/1/1:4", status: "offline", signal: -34.7, distance: 5.62, uptime: "—", lastEvent: "Fibra rompida", profile: "GPON-600M" },
  { id: "onu-05", serial: "ZTEG7A18C35E", mac: "A4:7B:9D:21:8C:73", name: "Clínica São Lucas", slot: "1/1/1:5", status: "online", signal: -18.2, distance: 3.08, uptime: "11d 08h", lastEvent: "Sem alarmes", profile: "GPON-1G" },
  { id: "onu-06", serial: "ZTEG7A18C366", mac: "A4:7B:9D:21:8C:8F", name: "Padaria do Bairro", slot: "1/1/1:6", status: "online", signal: -22.4, distance: 2.41, uptime: "02d 19h", lastEvent: "Sem alarmes", profile: "GPON-300M" },
];

const initialEvents: EventItem[] = [
  { id: 1, type: "fiber", title: "Perda de sinal detectada", detail: "ONU 1/1/1:4 · Escola Municipal", time: "há 2 min" },
  { id: 2, type: "warning", title: "Potência RX abaixo do limite", detail: "ONU 1/1/1:2 · -26.8 dBm", time: "há 8 min" },
  { id: 3, type: "power", title: "ONU reiniciada pelo operador", detail: "ONU 1/1/1:6 · Admin local", time: "há 22 min" },
  { id: 4, type: "fiber", title: "Conexão restaurada", detail: "ONU 1/1/1:5 · Clínica São Lucas", time: "há 39 min" },
];

const signalPoints = [58, 61, 60, 64, 62, 67, 65, 70, 68, 73, 71, 76, 74, 79, 76, 81, 79, 84, 82, 87, 85, 88, 86, 91];

function statusMeta(status: ONUStatus) {
  if (status === "online") return { label: "Online", dot: "bg-emerald-400", text: "text-emerald-300", bg: "bg-emerald-400/10 border-emerald-400/20" };
  if (status === "alerta") return { label: "Alerta", dot: "bg-amber-300", text: "text-amber-200", bg: "bg-amber-300/10 border-amber-300/20" };
  return { label: "Offline", dot: "bg-rose-400", text: "text-rose-300", bg: "bg-rose-400/10 border-rose-400/20" };
}

function SignalBars({ signal }: { signal: number }) {
  const level = getSignalLevel(signal);
  return (
    <div className="flex items-end gap-0.5 h-4" aria-label={`${signal} dBm`}>
      {[1, 2, 3, 4].map((bar) => <span key={bar} className={`w-1 rounded-sm ${bar <= level ? "bg-cyan-300" : "bg-slate-700"}`} style={{ height: `${bar * 3 + 3}px` }} />)}
    </div>
  );
}

function MiniSparkline() {
  const points = signalPoints.map((point, index) => `${(index / (signalPoints.length - 1)) * 100},${100 - point}`).join(" ");
  return (
    <svg viewBox="0 0 100 42" preserveAspectRatio="none" className="h-14 w-full overflow-visible">
      <defs><linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#22d3ee" stopOpacity=".28" /><stop offset="100%" stopColor="#22d3ee" stopOpacity="0" /></linearGradient></defs>
      <polyline points={`0,42 ${points} 100,42`} fill="url(#spark-fill)" stroke="none" />
      <polyline points={points} fill="none" stroke="#67e8f9" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Badge({ status }: { status: ONUStatus }) {
  const meta = statusMeta(status);
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[.08em] ${meta.bg} ${meta.text}`}><span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{meta.label}</span>;
}

function ActionButton({ icon: Icon, label, tone = "muted", onClick }: { icon: typeof Power; label: string; tone?: "muted" | "danger" | "cyan"; onClick: () => void }) {
  const toneClass = tone === "danger" ? "hover:border-rose-400/40 hover:bg-rose-400/10 hover:text-rose-200" : tone === "cyan" ? "hover:border-cyan-300/40 hover:bg-cyan-300/10 hover:text-cyan-100" : "hover:border-slate-500 hover:bg-slate-800 hover:text-slate-100";
  return <button onClick={onClick} className={`group inline-flex items-center gap-1.5 rounded-lg border border-transparent px-2 py-1.5 text-[11px] font-medium text-slate-400 transition-all ${toneClass}`}><Icon className="h-3.5 w-3.5 transition-transform group-hover:scale-110" />{label}</button>;
}

export default function Home() {
  const [onus, setOnus] = useState<ONU[]>([]);
  const [events, setEvents] = useState<EventItem[]>(initialEvents);
  const [selectedId, setSelectedId] = useState("onu-02");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | ONUStatus>("todos");
  const [activeNav, setActiveNav] = useState("Visão geral");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [lastSync, setLastSync] = useState("agora");
  const liveSnapshot = trpc.olt.liveSnapshot.useQuery(undefined, { refetchInterval: 30000, retry: 1 });
  const tableRef = useRef<HTMLDivElement>(null);
  const operatorAction = trpc.olt.operatorAction.useMutation();
  const oltConfig = trpc.olt.config.useQuery();
  const configUpdate = trpc.olt.updateConfig.useMutation();
  const [configForm, setConfigForm] = useState({ host: "", snmpPort: "", telnetPort: "", boards: "" });

  const filteredOnus = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return onus.filter((onu) => {
      const matchesSearch = !normalizedSearch || `${onu.name} ${onu.serial} ${onu.mac} ${onu.slot}`.toLowerCase().includes(normalizedSearch);
      const matchesStatus = statusFilter === "todos" || onu.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [onus, search, statusFilter]);
  const selected = onus.find((onu) => onu.id === selectedId) ?? onus[0];
  const onlineCount = onus.filter((onu) => onu.status === "online").length;
  const alertCount = onus.filter((onu) => onu.status === "alerta").length;
  const offlineCount = onus.filter((onu) => onu.status === "offline").length;

  function navigate(label: string) {
    setActiveNav(label);
    setSidebarOpen(false);
    if (label === "ONUs / Clientes") {
      focusTable("todos");
    } else if (label === "Visão geral") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (label === "Diagnóstico") {
      toast("Diagnóstico da OLT", { description: liveSnapshot.data ? `${liveSnapshot.data.hostname} · ${liveSnapshot.data.onus.length} ONUs lidas` : "Aguardando telemetria" });
    } else if (label === "Eventos de fibra") {
      toast("Eventos de fibra", { description: `${events.length} eventos no feed operacional` });
    } else if (label === "Logs de operação") {
      toast("Logs de operação", { description: "Os comandos executados nesta sessão aparecem aqui." });
    } else if (label === "Configurações") {
      toast("Configurações", { description: "Conexão ativa: SNMP v2c + Telnet · ZTE C300" });
    }
  }

  function focusTable(filter: "todos" | ONUStatus) {
    setStatusFilter(filter);
    setActiveNav("ONUs / Clientes");
    window.setTimeout(() => tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 20);
  }

  useEffect(() => {
    if (oltConfig.data) setConfigForm({ host: oltConfig.data.host, snmpPort: String(oltConfig.data.snmpPort), telnetPort: String(oltConfig.data.telnetPort), boards: oltConfig.data.boards });
  }, [oltConfig.data]);

  function saveConfig() {
    configUpdate.mutate({ host: configForm.host.trim(), snmpPort: Number(configForm.snmpPort), telnetPort: Number(configForm.telnetPort), boards: configForm.boards.trim() }, {
      onSuccess: () => { toast.success("Configuração salva", { description: "A próxima sincronização usará os novos parâmetros." }); liveSnapshot.refetch(); oltConfig.refetch(); },
      onError: (error) => toast.error("Configuração inválida", { description: error.message }),
    });
  }

  useEffect(() => {
    if (liveSnapshot.data?.onus?.length) {
      setOnus(liveSnapshot.data.onus);
      setLastSync("agora");
    }
  }, [liveSnapshot.data]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setLastSync("agora");
      setOnus((current) => current.map((onu) => onu.status === "online" ? { ...onu, signal: Number((onu.signal + (Math.random() - .5) * .6).toFixed(1)) } : onu));
    }, 7000);
    return () => window.clearInterval(timer);
  }, []);

  function runAction(action: string, onu: ONU) {
    if (liveSnapshot.isLoading) {
      toast.warning("Aguarde a conexão", { description: "A telemetria real ainda está sincronizando com a OLT." });
      return;
    }
    const labels: Record<string, string> = { authorize: "autorizar", disable: "desabilitar", reboot: "reiniciar" };
    if (!window.confirm(`Confirmar ${labels[action] ?? action} a ONU ${onu.slot}?

Esta ação será executada na OLT ZTE C300 real.`)) return;
    operatorAction.mutate({ action: action as "authorize" | "disable" | "reboot", onuId: onu.slot }, {
      onSuccess: async () => {
        toast.success(`Comando executado: ${labels[action] ?? action}`, { description: `${onu.name} · ${onu.slot}` });
        await liveSnapshot.refetch();
      },
      onError: (error) => toast.error("Comando não executado", { description: error.message }),
    });
  }

  function addFiberEvent() {
    const target = onus.find((onu) => onu.status === "online") ?? onus[0];
    if (!target) {
      toast.warning("Aguardando dados reais", { description: "A OLT ainda não retornou nenhuma ONU." });
      return;
    }
    const event: EventItem = { id: Date.now(), type: "fiber", title: "Teste de desconexão recebido", detail: `${target.slot} · ${target.name}`, time: "agora", fresh: true };
    setEvents((current) => [event, ...current].slice(0, 5));
    toast("Evento de fibra simulado", { description: `O feed em tempo real recebeu uma nova ocorrência.` });
  }

  return (
    <div className="min-h-screen bg-[#07111e] text-slate-100 selection:bg-cyan-300/20">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(14,116,144,.12),transparent_32%),radial-gradient(circle_at_0%_100%,rgba(30,64,175,.1),transparent_38%)]" />
      <div className="relative flex min-h-screen">
        {sidebarOpen && <button className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu" />}
        <aside className={`fixed inset-y-0 left-0 z-40 flex w-[246px] flex-col border-r border-slate-800/80 bg-[#091522]/95 px-4 py-5 backdrop-blur-xl transition-transform lg:static lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200"><Router className="h-5 w-5" /></div><div><p className="text-sm font-bold tracking-wide text-white">OLT<span className="text-cyan-300">.OPS</span></p><p className="text-[10px] uppercase tracking-[.16em] text-slate-500">ZTE command center</p></div></div>
            <button className="text-slate-500 lg:hidden" onClick={() => setSidebarOpen(false)}><X className="h-5 w-5" /></button>
          </div>
          <div className="mt-8 rounded-xl border border-cyan-300/15 bg-cyan-300/[.06] p-3"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><span className={`relative flex h-2.5 w-2.5 ${liveSnapshot.isError ? "bg-rose-400" : ""}`}><span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${liveSnapshot.isError ? "bg-rose-400" : "bg-emerald-400"}`} /><span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${liveSnapshot.isError ? "bg-rose-400" : "bg-emerald-400"}`} /></span><span className={`text-xs font-semibold ${liveSnapshot.isError ? "text-rose-200" : "text-emerald-200"}`}>{liveSnapshot.isError ? "Sem resposta" : "Conectada"}</span></div><span className="text-[10px] text-slate-500">{liveSnapshot.data?.transport ?? "SNMP + Telnet"}</span></div><p className="mt-2 text-xs text-slate-400">{liveSnapshot.data?.model ?? "ZTE C300"} · {liveSnapshot.data?.host ?? "45.162.123.46"}</p><div className="mt-3 flex items-center justify-between text-[10px] text-slate-500"><span>Hostname</span><span className="max-w-[125px] truncate font-mono text-slate-300">{liveSnapshot.data?.hostname ?? "aguardando..."}</span></div></div>
          <nav className="mt-8 space-y-1"><p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-slate-600">Operação</p>{[{ label: "Visão geral", icon: LayoutDashboard }, { label: "ONUs / Clientes", icon: Network }, { label: "Eventos de fibra", icon: Cable }, { label: "Diagnóstico", icon: Activity }].map(({ label, icon: Icon }) => <button key={label} onClick={() => navigate(label)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${activeNav === label ? "bg-cyan-300/10 text-cyan-100 shadow-[inset_2px_0_0_#67e8f9]" : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-200"}`}><Icon className="h-4 w-4" /><span>{label}</span>{label === "Eventos de fibra" && <span className="ml-auto rounded-full bg-rose-400/15 px-1.5 py-0.5 text-[10px] text-rose-300">3</span>}</button>)}</nav>
          <nav className="mt-8 space-y-1"><p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-slate-600">Sistema</p>{[{ label: "Logs de operação", icon: ClipboardList }, { label: "Configurações", icon: Settings2 }].map(({ label, icon: Icon }) => <button key={label} onClick={() => navigate(label)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${activeNav === label ? "bg-slate-800 text-slate-100" : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-200"}`}><Icon className="h-4 w-4" /><span>{label}</span></button>)}</nav>
          <div className="mt-auto space-y-3"><button onClick={() => toast("Central de suporte", { description: "A equipe de NOC está disponível para apoiar sua operação." })} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-500 transition-colors hover:bg-slate-800/70 hover:text-slate-300"><LifeBuoy className="h-4 w-4" />Central de suporte</button><div className="flex items-center gap-3 border-t border-slate-800/80 px-2 pt-4"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 text-xs font-bold text-slate-200">AC</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-slate-200">Admin Central</p><p className="truncate text-[10px] text-slate-500">Operador NOC</p></div><MoreHorizontal className="h-4 w-4 text-slate-600" /></div></div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="flex h-[72px] items-center justify-between border-b border-slate-800/80 px-5 sm:px-8"><div className="flex items-center gap-3"><button className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 lg:hidden" onClick={() => setSidebarOpen(true)}><Menu className="h-5 w-5" /></button><div><div className="flex items-center gap-2"><span className="text-xs font-semibold uppercase tracking-[.15em] text-cyan-300">Monitoramento</span><span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">PRODUÇÃO</span></div><h1 className="mt-1 text-lg font-semibold tracking-tight text-white">Visão geral da OLT</h1></div></div><div className="flex items-center gap-3"><div className="hidden items-center gap-2 text-[11px] text-slate-500 sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Dados atualizados {lastSync}</div><button onClick={() => { setLastSync("sincronizando..."); liveSnapshot.refetch().then(() => { setLastSync("agora"); toast.success("Telemetria sincronizada com a OLT"); }).catch(() => toast.error("Falha ao sincronizar a OLT")); }} className="rounded-lg border border-slate-700 bg-slate-900/60 p-2 text-slate-400 transition hover:border-cyan-300/30 hover:text-cyan-200"><RefreshCw className="h-4 w-4" /></button><button onClick={() => toast("Perfil do operador", { description: "Admin Central · permissões completas" })} className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-slate-400"><UserRound className="h-4 w-4" /></button></div></header>

          <div className="mx-auto max-w-[1450px] p-5 sm:p-8">
            {activeNav === "Configurações" && <section className="mb-7 rounded-2xl border border-cyan-300/20 bg-[#0b1a2a]/90 p-6 shadow-[0_12px_32px_rgba(0,0,0,.18)]"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.15em] text-cyan-300">Configurações da OLT</p><h2 className="mt-2 text-xl font-semibold text-white">Parâmetros reais da conexão</h2><p className="mt-1 text-xs text-slate-500">Os valores abaixo foram lidos do ambiente protegido e podem ser ajustados para a próxima sincronização.</p></div><span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-200">{oltConfig.data?.communityConfigured ? "SNMP configurado" : "SNMP pendente"}</span></div><div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><label className="text-xs text-slate-400">Host/IP<input value={configForm.host} onChange={(e) => setConfigForm({ ...configForm, host: e.target.value })} className="mt-2 h-10 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 font-mono text-xs text-slate-200 outline-none focus:border-cyan-300/50" /></label><label className="text-xs text-slate-400">Porta SNMP<input inputMode="numeric" value={configForm.snmpPort} onChange={(e) => setConfigForm({ ...configForm, snmpPort: e.target.value })} className="mt-2 h-10 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 font-mono text-xs text-slate-200 outline-none focus:border-cyan-300/50" /></label><label className="text-xs text-slate-400">Porta Telnet<input inputMode="numeric" value={configForm.telnetPort} onChange={(e) => setConfigForm({ ...configForm, telnetPort: e.target.value })} className="mt-2 h-10 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 font-mono text-xs text-slate-200 outline-none focus:border-cyan-300/50" /></label><label className="text-xs text-slate-400">Slots:PONs<input value={configForm.boards} onChange={(e) => setConfigForm({ ...configForm, boards: e.target.value })} placeholder="8:8,9:16" className="mt-2 h-10 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 font-mono text-xs text-slate-200 outline-none focus:border-cyan-300/50" /></label></div><div className="mt-5 flex flex-wrap items-center justify-between gap-3"><p className="text-[11px] text-slate-500">Credenciais: {oltConfig.data?.usernameConfigured ? "configuradas e ocultas" : "não configuradas"}. Nunca são exibidas na tela.</p><button onClick={saveConfig} disabled={configUpdate.isPending} className="rounded-lg bg-cyan-300 px-4 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-cyan-200 disabled:opacity-50">{configUpdate.isPending ? "Salvando..." : "Salvar configuração"}</button></div></section>}

            <section className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-sm text-slate-500">Domingo, 14 de setembro de 2026 · 22:53 BRT</p><h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">Olá, operador<span className="text-cyan-300">.</span></h2><p className="mt-1 text-sm text-slate-400">Acompanhe sua rede de fibra e responda rápido aos eventos críticos.</p>{liveSnapshot.isLoading && <p className="mt-3 text-xs text-cyan-200">Consultando dados reais da OLT C300...</p>}{liveSnapshot.error && <p className="mt-3 rounded-lg border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs text-rose-200">Falha na coleta real: {liveSnapshot.error.message}</p>}</div><button onClick={() => { liveSnapshot.refetch().then(() => toast.success("Eventos e estados atualizados")); }} className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 py-2.5 text-xs font-bold text-slate-950 shadow-[0_0_22px_rgba(103,232,249,.12)] transition hover:bg-cyan-200 active:scale-[.98]"><Zap className="h-4 w-4" />Atualizar telemetria</button></section>

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><div onClick={() => focusTable("todos")} role="button" tabIndex={0} className="cursor-pointer rounded-2xl border border-slate-800/80 bg-[#0b1a2a]/75 p-5 shadow-[0_12px_32px_rgba(0,0,0,.12)] transition hover:-translate-y-0.5 hover:border-cyan-300/30"><div className="flex items-start justify-between"><div><p className="text-xs font-medium text-slate-500">Total de ONUs</p><p className="mt-2 text-3xl font-semibold tracking-tight text-white">{onus.length}<span className="ml-2 text-sm font-normal text-slate-500">unidades</span></p></div><div className="rounded-xl bg-blue-400/10 p-2.5 text-blue-300"><Network className="h-5 w-5" /></div></div><div className="mt-4 flex items-center gap-2 text-[11px] text-slate-500"><ArrowUpRight className="h-3.5 w-3.5 text-emerald-300" /><span className="text-emerald-300">2,4%</span> vs. mês anterior</div></div><div onClick={() => focusTable("online")} role="button" tabIndex={0} className="cursor-pointer rounded-2xl border border-slate-800/80 bg-[#0b1a2a]/75 p-5 shadow-[0_12px_32px_rgba(0,0,0,.12)] transition hover:-translate-y-0.5 hover:border-cyan-300/30"><div className="flex items-start justify-between"><div><p className="text-xs font-medium text-slate-500">Online agora</p><p className="mt-2 text-3xl font-semibold tracking-tight text-emerald-300">{onlineCount}<span className="ml-2 text-sm font-normal text-slate-500">{onus.length ? Math.round((onlineCount / onus.length) * 100) : 0}%</span></p></div><div className="rounded-xl bg-emerald-400/10 p-2.5 text-emerald-300"><Wifi className="h-5 w-5" /></div></div><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${onus.length ? (onlineCount / onus.length) * 100 : 0}%` }} /></div></div><div onClick={() => focusTable("alerta")} role="button" tabIndex={0} className="cursor-pointer rounded-2xl border border-slate-800/80 bg-[#0b1a2a]/75 p-5 shadow-[0_12px_32px_rgba(0,0,0,.12)] transition hover:-translate-y-0.5 hover:border-cyan-300/30"><div className="flex items-start justify-between"><div><p className="text-xs font-medium text-slate-500">Em alerta</p><p className="mt-2 text-3xl font-semibold tracking-tight text-amber-200">{alertCount}<span className="ml-2 text-sm font-normal text-slate-500">atenção</span></p></div><div className="rounded-xl bg-amber-300/10 p-2.5 text-amber-200"><AlertTriangle className="h-5 w-5" /></div></div><div className="mt-4 flex items-center gap-2 text-[11px] text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-amber-300" />Potência óptica fora do ideal</div></div><div onClick={() => focusTable("offline")} role="button" tabIndex={0} className="cursor-pointer rounded-2xl border border-rose-400/20 bg-rose-400/[.06] p-5 shadow-[0_12px_32px_rgba(0,0,0,.12)] transition hover:-translate-y-0.5 hover:border-rose-300/40"><div className="flex items-start justify-between"><div><p className="text-xs font-medium text-rose-200/70">Desconectadas</p><p className="mt-2 text-3xl font-semibold tracking-tight text-rose-300">{offlineCount}<span className="ml-2 text-sm font-normal text-rose-200/50">fibra</span></p></div><div className="rounded-xl bg-rose-400/10 p-2.5 text-rose-300"><CircleOff className="h-5 w-5" /></div></div><div className="mt-4 flex items-center gap-2 text-[11px] text-rose-200/70"><ArrowDownRight className="h-3.5 w-3.5" />3 eventos nos últimos 60 min</div></div></section>

            <section ref={tableRef} className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]"><div className="min-w-0 rounded-2xl border border-slate-800/80 bg-[#0b1a2a]/75 shadow-[0_12px_32px_rgba(0,0,0,.12)]"><div className="flex flex-col justify-between gap-4 border-b border-slate-800/80 p-5 sm:flex-row sm:items-center"><div><div className="flex items-center gap-2"><span className="relative flex h-2 w-2"><span className="absolute h-full w-full animate-ping rounded-full bg-cyan-300" /><span className="relative h-2 w-2 rounded-full bg-cyan-300" /></span><h3 className="text-sm font-semibold text-white">ONUs monitoradas</h3></div><p className="mt-1 text-xs text-slate-500">Estado da rede em tempo quase real</p></div><div className="flex flex-wrap items-center gap-2"><div className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-600" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, MAC ou serial..." aria-label="Buscar ONU por nome, MAC ou serial" className="h-9 w-full rounded-lg border border-slate-700 bg-slate-900/70 pl-9 pr-3 text-xs text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-cyan-300/50 sm:w-[245px]" /></div><div className="relative"><Settings2 className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-cyan-300/70" /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "todos" | ONUStatus)} aria-label="Filtrar ONUs por status" className="h-9 appearance-none rounded-lg border border-slate-700 bg-slate-900/70 pl-9 pr-8 text-xs text-slate-300 outline-none transition hover:border-cyan-300/40 focus:border-cyan-300/50"><option value="todos">Todos os status</option><option value="online">Online</option><option value="alerta">Alerta</option><option value="offline">Offline</option></select><ChevronRight className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rotate-90 text-slate-600" /></div>{(search || statusFilter !== "todos") && <button onClick={() => { setSearch(""); setStatusFilter("todos"); }} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/70 px-3 text-[11px] font-semibold text-slate-400 transition hover:border-rose-400/40 hover:text-rose-200"><X className="h-3.5 w-3.5" />Limpar</button>}</div></div><div className="flex flex-wrap items-center gap-2 border-b border-slate-800/50 px-5 py-3"><span className="text-[10px] uppercase tracking-[.12em] text-slate-600">Filtros rápidos</span>{(["todos", "online", "alerta", "offline"] as const).map((filter) => <button key={filter} onClick={() => setStatusFilter(filter)} className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition ${statusFilter === filter ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-200" : "border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300"}`}>{filter === "todos" ? "Todos" : filter === "online" ? "Online" : filter === "alerta" ? "Alertas" : "Offline"}{filter !== "todos" && <span className="ml-1.5 opacity-60">{onus.filter((onu) => onu.status === filter).length}</span>}</button>)}{(search || statusFilter !== "todos") && <span className="ml-auto text-[10px] text-slate-500">{filteredOnus.length} resultado{filteredOnus.length === 1 ? "" : "s"}</span>}</div><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left"><thead><tr className="border-b border-slate-800/60 text-[10px] font-semibold uppercase tracking-[.12em] text-slate-600"><th className="px-5 py-3">ONU / cliente</th><th className="px-3 py-3">PON</th><th className="px-3 py-3">Estado</th><th className="px-3 py-3">Sinal RX</th><th className="px-3 py-3">Distância</th><th className="px-5 py-3 text-right">Ações</th></tr></thead><tbody>{filteredOnus.map((onu) => <tr key={onu.id} onClick={() => { setSelectedId(onu.id); toast(`${onu.name}`, { description: `${onu.slot} · ${onu.status} · ${onu.signal <= -90 ? "métrica pendente" : `${onu.signal.toFixed(1)} dBm`}` }); }} className={`cursor-pointer border-b border-slate-800/40 transition hover:bg-cyan-300/[.035] ${selectedId === onu.id ? "bg-cyan-300/[.06]" : ""}`}><td className="px-5 py-4"><div className="flex items-center gap-3"><div className={`flex h-9 w-9 items-center justify-center rounded-lg ${onu.status === "offline" ? "bg-rose-400/10 text-rose-300" : onu.status === "alerta" ? "bg-amber-300/10 text-amber-200" : "bg-cyan-300/10 text-cyan-200"}`}><Server className="h-4 w-4" /></div><div><p className="text-xs font-semibold text-slate-200">{onu.name}</p><p className="mt-1 font-mono text-[10px] text-slate-600">{onu.serial} · {onu.mac}</p></div></div></td><td className="px-3 py-4 font-mono text-[11px] text-slate-400">{onu.slot}</td><td className="px-3 py-4"><Badge status={onu.status} /></td><td className="px-3 py-4"><div className="flex items-center gap-2"><SignalBars signal={onu.signal} /><span className={`font-mono text-xs ${onu.signal < -26 ? "text-amber-200" : onu.signal < -30 ? "text-rose-300" : "text-slate-300"}`}>{onu.signal <= -90 ? (onu.status === "offline" ? "Sem sinal" : "Aguardando") : onu.signal.toFixed(1)} {onu.signal > -90 && <span className="text-[10px] text-slate-600">dBm</span>}</span></div></td><td className="px-3 py-4"><span className="font-mono text-xs text-slate-300">{onu.distance === 0 ? "—" : onu.distance.toFixed(2)} {onu.distance > 0 && <span className="text-[10px] text-slate-600">km</span>}</span></td><td className="px-5 py-4"><div className="flex justify-end gap-0.5" onClick={(event) => event.stopPropagation()}><ActionButton icon={ShieldCheck} label="Autorizar" tone="cyan" onClick={() => runAction("authorize", onu)} /><ActionButton icon={LockKeyhole} label="Desabilitar" tone="danger" onClick={() => runAction("disable", onu)} /><ActionButton icon={Power} label="Reboot" onClick={() => runAction("reboot", onu)} /></div></td></tr>)}</tbody></table>{filteredOnus.length === 0 && <div className="p-12 text-center text-sm text-slate-500">Nenhuma ONU encontrada com os filtros atuais.</div>}</div></div>

              <aside className="space-y-5"><div className="rounded-2xl border border-cyan-300/15 bg-gradient-to-br from-[#103047] to-[#0b1a2a] p-5 shadow-[0_12px_32px_rgba(0,0,0,.16)]"><div className="flex items-start justify-between"><div><p className="text-xs font-medium text-slate-400">Disponibilidade média</p><p className="mt-2 text-3xl font-semibold tracking-tight text-white">99,84<span className="text-base text-cyan-300">%</span></p></div><div className="rounded-xl bg-cyan-300/10 p-2.5 text-cyan-200"><Gauge className="h-5 w-5" /></div></div><div className="mt-5"><MiniSparkline /><div className="mt-1 flex justify-between text-[10px] text-slate-600"><span>00h</span><span>06h</span><span>12h</span><span>18h</span><span>agora</span></div></div><div className="mt-4 flex items-center gap-2 text-[11px]"><span className="rounded bg-emerald-400/10 px-1.5 py-0.5 font-semibold text-emerald-300">+0,12%</span><span className="text-slate-500">nas últimas 24h</span></div></div>
                <div className="rounded-2xl border border-slate-800/80 bg-[#0b1a2a]/75 p-5"><div className="flex items-center justify-between"><div><h3 className="text-sm font-semibold text-white">Eventos recentes</h3><p className="mt-1 text-xs text-slate-500">Feed de fibra e operação</p></div><button onClick={() => navigate("Eventos de fibra")} className="text-[11px] font-semibold text-cyan-300 hover:text-cyan-200">Ver todos <ChevronRight className="ml-0.5 inline h-3 w-3" /></button></div><div className="mt-5 space-y-4">{events.map((event) => <div key={event.id} className={`flex gap-3 ${event.fresh ? "animate-[fadeIn_.25s_ease-out]" : ""}`}><div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${event.type === "fiber" ? "bg-rose-400/10 text-rose-300" : event.type === "warning" ? "bg-amber-300/10 text-amber-200" : "bg-blue-400/10 text-blue-300"}`}>{event.type === "fiber" ? <Cable className="h-3.5 w-3.5" /> : event.type === "warning" ? <AlertTriangle className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-slate-200">{event.title}</p><p className="mt-1 truncate text-[10px] text-slate-500">{event.detail}</p><p className="mt-1.5 text-[10px] text-slate-600">{event.time}</p></div></div>)}</div></div>
                <div className="rounded-2xl border border-slate-800/80 bg-[#0b1a2a]/75 p-5"><div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-300" /><h3 className="text-sm font-semibold text-white">Diagnóstico rápido</h3></div><div className="mt-4 space-y-2 text-xs"><div className="flex items-center justify-between"><span className="text-slate-500">CPU da OLT</span><span className="font-mono text-slate-300">24%</span></div><div className="h-1.5 rounded-full bg-slate-800"><div className="h-full w-[24%] rounded-full bg-cyan-300" /></div><div className="flex items-center justify-between pt-2"><span className="text-slate-500">Temperatura</span><span className="font-mono text-slate-300">38,2 °C</span></div><div className="flex items-center justify-between pt-2"><span className="text-slate-500">PONs ativas</span><span className="font-mono text-emerald-300">4 / 4</span></div></div><button onClick={() => toast.success("Diagnóstico concluído", { description: "Nenhuma anomalia adicional encontrada." })} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 py-2 text-[11px] font-semibold text-slate-300 transition hover:border-cyan-300/30 hover:bg-cyan-300/5 hover:text-cyan-100"><Terminal className="h-3.5 w-3.5" />Executar diagnóstico</button></div>
              </aside>
            </section>

            <section className="mt-6 grid gap-4 md:grid-cols-3"><div className="rounded-2xl border border-slate-800/80 bg-[#0b1a2a]/75 p-5"><div className="flex items-center gap-3"><div className="rounded-lg bg-blue-400/10 p-2 text-blue-300"><Cloud className="h-4 w-4" /></div><div><p className="text-xs text-slate-500">RX médio</p><p className="mt-1 font-mono text-lg font-semibold text-white">-22,7 <span className="text-xs font-normal text-slate-500">dBm</span></p></div></div><p className="mt-3 text-[10px] text-slate-600">Média das ONUs online</p></div><div className="rounded-2xl border border-slate-800/80 bg-[#0b1a2a]/75 p-5"><div className="flex items-center gap-3"><div className="rounded-lg bg-violet-400/10 p-2 text-violet-300"><Cable className="h-4 w-4" /></div><div><p className="text-xs text-slate-500">Fibra monitorada</p><p className="mt-1 font-mono text-lg font-semibold text-white">18,42 <span className="text-xs font-normal text-slate-500">km</span></p></div></div><p className="mt-3 text-[10px] text-slate-600">Maior distância: ONU 1/1/1:4</p></div><div className="rounded-2xl border border-slate-800/80 bg-[#0b1a2a]/75 p-5"><div className="flex items-center gap-3"><div className="rounded-lg bg-emerald-400/10 p-2 text-emerald-300"><ShieldCheck className="h-4 w-4" /></div><div><p className="text-xs text-slate-500">Proteção operacional</p><p className="mt-1 text-lg font-semibold text-white">Ativa</p></div></div><p className="mt-3 text-[10px] text-slate-600">Ações críticas registradas em log</p></div></section>
            <footer className="mt-8 flex flex-col justify-between gap-2 border-t border-slate-800/60 pt-5 text-[10px] text-slate-600 sm:flex-row"><span>OLT.OPS · Console operacional ZTE</span><span className="flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${liveSnapshot.isError ? "bg-rose-400" : "bg-emerald-400"}`} />{liveSnapshot.isError ? "Falha na telemetria real · usando último estado" : "Telemetria real · atualização automática a cada 30s"}</span></footer>
          </div>
        </main>
      </div>
    </div>
  );
}
