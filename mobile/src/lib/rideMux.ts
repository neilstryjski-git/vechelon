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
// A new mux is made whenever one of the underlying channels is replaced (reconnect, role
// change). The hooks then re-run their [channel] effects and bind again. Underlying channels
// that did NOT change must not end up with two copies of a handler, so each underlying
// (channel, event) pair gets ONE real listener, which calls the handlers of whichever mux
// bound to it most recently.
import type { RealtimeChannel } from '@supabase/supabase-js';

import { listenKinds, type ChannelKind } from './channelLayout';

type Handler = (message: { event?: string; payload?: unknown; [k: string]: unknown }) => void;
interface Slot {
  owner: object | null;
  handlers: Handler[];
}
const slots = new WeakMap<RealtimeChannel, Map<string, Slot>>();

function bind(ch: RealtimeChannel, event: string, owner: object, handler: Handler): void {
  let byEvent = slots.get(ch);
  if (!byEvent) {
    byEvent = new Map();
    slots.set(ch, byEvent);
  }
  let slot = byEvent.get(event);
  if (!slot) {
    const made: Slot = { owner: null, handlers: [] };
    slot = made;
    byEvent.set(event, made);
    ch.on('broadcast', { event }, (message) => {
      for (const h of made.handlers.slice()) h(message as Parameters<Handler>[0]);
    });
  }
  if (slot.owner !== owner) {
    slot.owner = owner;
    slot.handlers = [];
  }
  slot.handlers.push(handler);
}

export type RideChannels = Partial<Record<ChannelKind, RealtimeChannel | null>>;

export interface RideMux {
  on(type: 'broadcast', filter: { event: string }, handler: Handler): RideMux;
  send(message: Parameters<RealtimeChannel['send']>[0]): ReturnType<RealtimeChannel['send']>;
}

// Null until the `all` channel exists: every hook treats a null channel as "not connected".
export function makeRideMux(channels: RideChannels): RideMux | null {
  const all = channels.all ?? null;
  if (!all) return null;
  const mux: RideMux = {
    on(_type, filter, handler) {
      for (const kind of listenKinds(filter.event)) {
        const ch = channels[kind];
        if (ch) bind(ch, filter.event, mux, handler);
      }
      return mux;
    },
    send(message) {
      return all.send(message);
    },
  };
  return mux;
}
