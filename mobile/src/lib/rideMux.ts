// W193 — one object the ride hooks can treat as "the ride channel", backed by the role-scoped
// channels underneath. The hooks (useFleetPositions, useBeacons, useBreadcrumb, the ride-end
// watch, RideControls) keep calling `.on('broadcast', { event }, handler)` and `.send(...)`;
// this routes each to the right topic per channelLayout.ts.
//
//   .on(pos)            → bound on every position-carrying channel this device has joined
//   .on(anything else)  → bound on the `all` channel
//   .send(...)          → sent on the `all` channel (beacon raise / cancel, ride ended).
//                         Positions and departures never go through here: they are REST
//                         sends (backgroundLocation.restBroadcast).
//
// IDENTITY. A mux lives exactly as long as its `all` channel, as the single ride channel did
// before W193: the hooks reset their state and bind again only when `all` is replaced. When
// `lead`, `crew` or `sos` is replaced (its own reconnect, a role change) the SAME mux is told
// through attach(), and binds the handlers it already holds onto the new channel. So one
// topic reconnecting never blanks the map. A mux whose `all` channel was replaced is
// disposed: its handlers go quiet even on a lead / crew / sos channel that outlived it.
//
// `listenKinds` is passed in (not imported) so this file has no runtime import and can be
// loaded by the unit tests as it is.
import type { RealtimeChannel } from '@supabase/supabase-js';

import type { ChannelKind } from './channelLayout';

type Message = { event?: string; payload?: unknown; [k: string]: unknown };
type Handler = (message: Message) => void;
type Channel = Pick<RealtimeChannel, 'on' | 'send'>;

export type SideChannels = Partial<Record<Exclude<ChannelKind, 'all'>, Channel | null>>;

export interface RideMux {
  on(type: 'broadcast', filter: { event: string }, handler: Handler): RideMux;
  send(message: Parameters<RealtimeChannel['send']>[0]): ReturnType<RealtimeChannel['send']>;
  attach(channels: SideChannels): void;
  activate(): void;
  dispose(): void;
}

// Null until the `all` channel exists: every hook treats a null channel as "not connected".
export function makeRideMux(
  all: Channel | null,
  listenKinds: (event: string) => readonly ChannelKind[],
): RideMux | null {
  if (!all) return null;
  let disposed = false;
  const registry: { event: string; handler: Handler }[] = [];
  // Per attached channel: its kind, and how far down the registry it has been bound.
  const attached = new Map<Channel, { kind: ChannelKind; bound: number }>([[all, { kind: 'all', bound: 0 }]]);

  const sync = () => {
    for (const [ch, state] of attached) {
      for (let i = state.bound; i < registry.length; i += 1) {
        const { event, handler } = registry[i];
        if (!listenKinds(event).includes(state.kind)) continue;
        (ch.on as (t: 'broadcast', f: { event: string }, cb: Handler) => unknown)('broadcast', { event }, (m) => {
          if (!disposed) handler(m);
        });
      }
      state.bound = registry.length;
    }
  };

  const mux: RideMux = {
    on(_type, filter, handler) {
      registry.push({ event: filter.event, handler });
      sync();
      return mux;
    },
    send(message) {
      return all.send(message);
    },
    attach(channels) {
      const now = new Set<Channel>([all]);
      for (const kind of ['lead', 'crew', 'sos'] as const) {
        const ch = channels[kind];
        if (!ch) continue;
        now.add(ch);
        if (!attached.has(ch)) attached.set(ch, { kind, bound: 0 });
      }
      // A replaced channel has been removed from the client by its hook; just forget it.
      for (const ch of [...attached.keys()]) if (!now.has(ch)) attached.delete(ch);
      sync();
    },
    // activate / dispose are an effect's body and cleanup: a cleanup followed by a re-run
    // with the same mux (strict effects) must leave it live.
    activate() {
      disposed = false;
    },
    dispose() {
      disposed = true;
    },
  };
  return mux;
}
