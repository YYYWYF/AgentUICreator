import { useRef, useState } from "react";
import { useConversationCanAnswerToolCall, type ConversationToolCallProps } from "@za38.03/agent-ui-plugins";
import { USER_DETAIL_FIELDS, parseUserDetailsResult, type UserDetails } from "../../../agent-contract/human-tools/collect-user-details";
import { useAgentUILocale } from "../../i18n/useAgentUILocale";
import "./collect-user-details.css";

export function CollectUserDetailsToolUI(props: ConversationToolCallProps) {
  const labels = useAgentUILocale("frontendTools");
  const canAnswer = useConversationCanAnswerToolCall();
  const [values, setValues] = useState<UserDetails>({ firstName: "", lastName: "", email: "", projectIdea: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submitting = useRef(false);
  const result = parseUserDetailsResult(props.result);
  const waiting = props.result === undefined && props.status.type === "requires-action" && canAnswer && typeof props.addResult === "function";
  if (props.result !== undefined && !result) return <p>{labels.formUnavailable}</p>;
  if (!waiting) return <section className="human-details-form" data-agent-ui-owned="">
    <h3>{labels.formTitle}</h3>
    {result ? <><p role="status">{labels.formSubmitted}</p><dl>
      {USER_DETAIL_FIELDS.map(name => <div key={name}><dt>{labels[name]}</dt><dd>{result.values[name]}</dd></div>)}
    </dl></> : <p role="status">{busy || props.status.type === "running" ? labels.formBusy : labels.formUnavailable}</p>}
  </section>;
  const submit = async () => {
    if (submitting.current) return;
    const payload = parseUserDetailsResult({ values: {
      ...values, firstName: values.firstName.trim(), lastName: values.lastName.trim(), email: values.email.trim(),
    } });
    if (!payload) { setError(labels.formInvalid); return; }
    submitting.current = true;
    setBusy(true); setError(undefined);
    try { props.addResult!(payload); }
    catch { setError(labels.formUnavailable); submitting.current = false; setBusy(false); }
  };
  return <form className="human-details-form" data-agent-ui-owned="" noValidate onSubmit={event => { event.preventDefault(); void submit(); }}>
    <h3>{labels.formTitle}</h3>
    <fieldset disabled={busy}>
      {USER_DETAIL_FIELDS.map(name => <label key={name}>{labels[name]}
        {name === "projectIdea" ? <textarea name={name} value={values[name]} maxLength={4000}
          onChange={event => setValues(current => ({ ...current, [name]: event.target.value }))} />
          : <input name={name} type={name === "email" ? "email" : "text"} value={values[name]} maxLength={4000}
              required={name === "firstName" || name === "email"} autoComplete={name === "firstName" ? "given-name" : name === "lastName" ? "family-name" : "email"}
              onChange={event => setValues(current => ({ ...current, [name]: event.target.value }))} />}
      </label>)}
    </fieldset>
    {error ? <p role="alert">{error}</p> : null}
    <button type="submit" disabled={busy}>{busy ? labels.formBusy : labels.submitForm}</button>
  </form>;
}
