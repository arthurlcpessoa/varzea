// Atualização em tempo real para quem acompanha a partida (RF45, RNF11),
// via Server-Sent Events. Implementação em memória: suficiente para uma
// instância; com várias instâncias, troque por Redis pub/sub.

import type { Response } from "express";

const channels = new Map<string, Set<Response>>();

export function subscribe(channel: string, res: Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  res.write(": conectado\n\n");

  const set = channels.get(channel) ?? new Set();
  set.add(res);
  channels.set(channel, set);

  const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
  res.on("close", () => {
    clearInterval(ping);
    set.delete(res);
    if (set.size === 0) channels.delete(channel);
  });
}

export function publish(channel: string, event: string, data: unknown) {
  const set = channels.get(channel);
  if (!set) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) res.write(payload);
}

export const matchChannel = (matchId: string) => `match:${matchId}`;
