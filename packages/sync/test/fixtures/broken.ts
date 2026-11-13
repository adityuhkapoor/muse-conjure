// Deliberately broken variants. The sync properties must catch every one of them; see
// test/fixtures.test.ts. Do not use outside tests.

import type { Entry } from "@muse/protocol";
import { ReplicaCore } from "../../src/replica.ts";
import { Sequencer } from "../../src/sequencer.ts";
import type { Variant } from "../sim.ts";

/** Forgets pending actions whenever a confirmed entry arrives: shows confirmed state only. */
class NoReplayReplica<S> extends ReplicaCore<S> {
  protected override replay(): S {
    return this.confirmed;
  }
}

/** Applies entries in arrival order instead of buffering until the gap fills. */
class ArrivalOrderReplica<S> extends ReplicaCore<S> {
  protected override accept(e: Entry) {
    if (e.seq <= this.head) return;
    this.confirmed = this.apply(this.confirmed, e.action, { seq: e.seq, user: e.user, time: e.time, seed: e.seed });
    this.head = e.seq;
    if (e.client === this.client) {
      const i = this.pending.findIndex((p) => p.cseq === e.cseq);
      if (i >= 0) this.pending.splice(i, 1);
    }
    this.setState(this.replay());
  }
}

/** Notes a new epoch but keeps its confirmed state, head and pending queue. */
class IgnoresEpochReplica<S> extends ReplicaCore<S> {
  protected override reset() {}
}

/** Never resends after store_failed or a reconnect: pending actions wait forever. */
class NoResendReplica<S> extends ReplicaCore<S> {
  protected override resend() {}
}

/** Assigns a new seq to every act, resends included. */
class NoDedupeSequencer extends Sequencer {
  protected override findDuplicate(): number | undefined {
    return undefined;
  }
}

export const noReplay: Variant = {
  name: "replica without pending replay",
  replica: (r, t, o) => new NoReplayReplica(r, t, o),
  sequencer: (o) => new Sequencer(o),
};

export const arrivalOrder: Variant = {
  name: "replica without gap buffering",
  replica: (r, t, o) => new ArrivalOrderReplica(r, t, o),
  sequencer: (o) => new Sequencer(o),
};

export const noDedupe: Variant = {
  name: "sequencer without dedupe",
  replica: (r, t, o) => new ReplicaCore(r, t, o),
  sequencer: (o) => new NoDedupeSequencer(o),
};

export const ignoresEpoch: Variant = {
  name: "replica that ignores a new epoch",
  replica: (r, t, o) => new IgnoresEpochReplica(r, t, o),
  sequencer: (o) => new Sequencer(o),
};

export const noResend: Variant = {
  name: "replica without resend",
  replica: (r, t, o) => new NoResendReplica(r, t, o),
  sequencer: (o) => new Sequencer(o),
};
