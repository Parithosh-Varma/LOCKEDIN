import { useEffect, useState } from "react";
import { apiClient } from "../lib/api";
import { Card, CardHeader, EmptyState, StatusBadge } from "../components/ui";
import { IconSend } from "../lib/icons";

export default function Telegram() {
  const [status, setStatus] = useState<any>(null);
  const [chatId, setChatId] = useState("");
  const [code, setCode] = useState("");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiClient.telegramStatus().then(setStatus).catch(() => undefined);
  }, []);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);
    try {
      const res = await apiClient.telegramConnect(chatId.trim(), code.trim());
      setResult(res);
      apiClient.telegramStatus().then(setStatus).catch(() => undefined);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const linked = status?.linked;
  const linkedChat = status?.linkedChatId;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">TELEGRAM · NUCLEAR ACCOUNTABILITY MODE</h1>
        <p className="text-sm text-muted-foreground">The bot that nags you, bullies you, and celebrates you. No excuses survive it.</p>
      </div>

      <Card className="space-y-4">
        <CardHeader title="Bot status" right={<StatusBadge label={linked ? "Linked" : "Not linked"} ok={linked} />} />
        <div className="text-sm text-muted-foreground">
          @lockedinvarmaBot — <span className="font-mono">8649824558</span>
        </div>
        {linked && linkedChat && (
          <div className="text-sm text-muted-foreground">Linked to chat <span className="font-mono">{linkedChat}</span></div>
        )}
      </Card>

      <Card>
        <CardHeader title={linked ? "Relink / connect another chat" : "Connect your Telegram"} subtitle="Open Telegram, start a chat with @lockedinvarmaBot, and send the bot your 6-digit code." />
        <form onSubmit={connect} className="space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="label">Your chat ID (optional)</label>
              <input className="input" value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="e.g. 7587094510" />
            </div>
            <div className="space-y-1">
              <label className="label">Verification code</label>
              <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code from bot" required />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {result?.ok && <p className="text-sm text-emerald-600">Connected! The bot will now start holding you accountable.</p>}
          <button type="submit" className="btn-primary"><IconSend className="w-4 h-4" /> Verify & connect</button>
        </form>
      </Card>

      <Card>
        <CardHeader title="What the bot does" />
        <ul className="space-y-2 text-sm text-muted-foreground list-disc pl-5">
          <li>Sends session reminders and escalates the pressure every few minutes until you start.</li>
          <li>Bullies you with strict messages when you're avoiding study.</li>
          <li>Celebrates you when you finish a session.</li>
          <li>Sends daily (9:30 PM) and weekly (Sunday) performance reports.</li>
          <li>Commands: /start /status /today /streak /progress /goal /test /settings /pause /resume</li>
        </ul>
      </Card>
    </div>
  );
}