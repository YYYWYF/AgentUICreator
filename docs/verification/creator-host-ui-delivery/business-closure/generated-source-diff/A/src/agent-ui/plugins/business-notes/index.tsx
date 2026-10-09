import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { Button, Card, Input } from "../../../design-system";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { useAgentUILocale } from "../../agent-ui/i18n/useAgentUILocale";

import "./styles.css";

type BusinessNote = { id: number; text: string };

export function BusinessNotesPlugin(_props: UIPluginComponentProps) {
  const labels = useAgentUILocale("businessNotes");
  const [draft, setDraft] = useState("");
  const [notes, setNotes] = useState<BusinessNote[]>([]);
  const [error, setError] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const nextNoteId = useRef(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!helpOpen || dialog === null) return;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLButtonElement>("[data-business-notes-close]")?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [helpOpen]);

  useEffect(() => {
    if (helpOpen) return;
    const returnFocus = returnFocusRef.current;
    if (returnFocus === null) return;
    const frame = window.requestAnimationFrame(() => {
      if (!returnFocus.isConnected) return;
      returnFocus.focus();
      if (returnFocusRef.current === returnFocus) {
        returnFocusRef.current = null;
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [helpOpen]);

  const handleAddNote = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (text.length === 0) {
      setError(labels.blankNoteError);
      return;
    }

    setNotes((current) => [...current, { id: ++nextNoteId.current, text }]);
    setDraft("");
    setError("");
  };

  const openHelp = (event: MouseEvent<HTMLButtonElement>) => {
    returnFocusRef.current = event.currentTarget;
    setHelpOpen(true);
  };

  const closeHelp = () => {
    if (dialogRef.current?.open) dialogRef.current.close();
    setHelpOpen(false);
    
  };

  return (
    <section className="business-notes-plugin" data-ui-plugin="business-notes">
      <header className="business-notes-header">
        <h2 className="business-notes-title">{labels.title}</h2>
        <Button className="business-notes-help-button" onClick={openHelp} type="button">
          {labels.openHelp}
        </Button>
      </header>

      <Card className="business-notes-card">
        <form className="business-notes-form" onSubmit={handleAddNote}>
          <label className="business-notes-label" htmlFor="business-notes-input">
            {labels.inputLabel}
          </label>
          <Input
            aria-describedby={error ? "business-notes-error" : undefined}
            aria-invalid={error ? true : undefined}
            id="business-notes-input"
            onChange={(event) => {
              setDraft(event.target.value);
              if (error) setError("");
            }}
            placeholder={labels.inputPlaceholder}
            value={draft}
          />
          {error ? (
            <p className="business-notes-error" id="business-notes-error" role="alert">
              {error}
            </p>
          ) : null}
          <Button className="business-notes-add-button" type="submit">
            {labels.addNote}
          </Button>
        </form>
      </Card>

      {notes.length === 0 ? (
        <p className="business-notes-empty" role="status">{labels.emptyState}</p>
      ) : (
        <ul aria-label={labels.listLabel} className="business-notes-list" aria-live="polite">
          {notes.map((note) => (
            <li className="business-notes-item" key={note.id}>{note.text}</li>
          ))}
        </ul>
      )}

      {helpOpen ? (
        <dialog
          aria-describedby="business-notes-help-description"
          aria-labelledby="business-notes-help-title"
          className="business-notes-dialog"
          onKeyDownCapture={(event) => {
              if (event.key === "Escape") event.stopPropagation();
            }}
            onClose={() => {
            setHelpOpen(false);
            
          }}
          ref={dialogRef}
        >
          <div className="business-notes-dialog-content">
            <h2 id="business-notes-help-title">{labels.helpTitle}</h2>
            <p id="business-notes-help-description">{labels.helpDescription}</p>
            <Button data-business-notes-close onClick={closeHelp} type="button">
              {labels.closeHelp}
            </Button>
          </div>
        </dialog>
      ) : null}
    </section>
  );
}
