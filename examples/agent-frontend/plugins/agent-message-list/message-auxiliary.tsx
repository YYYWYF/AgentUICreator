import { Spinner } from "../../agent-ui/primitives/spinner";

export function MessageEmptyState({ text }: { text: string }) {
  return (
    <div
      className="agent-message-list-empty"
      data-slot="agent-message-empty"
    >
      {text}
    </div>
  );
}

export function MessageLoadingState({ label }: { label: string }) {
  return (
    <div
      className="agent-message-list-state"
      data-slot="agent-message-loading"
      role="status"
    >
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

export function MessageErrorState({ message }: { message: string }) {
  return (
    <div
      className="agent-message-list-state agent-message-list-state--error"
      data-slot="agent-message-error"
      role="alert"
    >
      {message}
    </div>
  );
}
