import { Middleware, type AbstractAgent, type RunAgentInput } from "@ag-ui/client";
import { EMPTY } from "rxjs";

/**
 * The native tool tracker can publish a
 * cancellation receipt after a run stops. Drop its obsolete
 * continuation at the existing agent middleware boundary, before any fetch.
 * No synthetic AG-UI events or second runtime are created.
 */
class CancelledToolContinuation extends Middleware {
  private currentTurn: string | undefined;
  private cancelledTurn: string | undefined;

  cancel(): void { this.cancelledTurn = this.currentTurn; }

  override run(input: RunAgentInput, next: AbstractAgent): ReturnType<AbstractAgent["run"]> {
    const turn = [...input.messages].reverse().find(message => message.role === "user")?.id;
    const explicitResume = "resume" in input || (
      typeof input.forwardedProps === "object" && input.forwardedProps !== null && "command" in input.forwardedProps
    );
    const isToolContinuation = input.messages.at(-1)?.role === "tool" && !explicitResume;
    if (this.cancelledTurn !== undefined && turn === this.cancelledTurn && isToolContinuation) return EMPTY;
    this.cancelledTurn = undefined;
    this.currentTurn = turn;
    return next.run(input);
  }
}

const installed = new WeakMap<AbstractAgent, CancelledToolContinuation>();
export function installCancelledToolContinuationGuard(agent: AbstractAgent): { cancel(): void } {
  let guard = installed.get(agent);
  if (!guard) { guard = new CancelledToolContinuation(); agent.use(guard); installed.set(agent, guard); }
  return guard;
}
