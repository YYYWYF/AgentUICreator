import { useEffect, useRef } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { usePluginService } from "../../runtime/plugins";
import { DEMO_FORM_SERVICE, DEMO_FORM_FIELDS, type DemoFormValues, type DemoFormService, type DemoFormSubmitResult } from "../../services/demo-form";
import { useAgentUILocale } from "../../agent-ui/i18n/useAgentUILocale";
import "./styles.css";
export function FrontendToolFormDemoPlugin() {
  const service = usePluginService<DemoFormService>(DEMO_FORM_SERVICE);
  const locale = useAgentUILocale("frontendTools");
  const form = useForm<DemoFormValues>({ defaultValues: service?.getSnapshot().values ?? { firstName: "", lastName: "", email: "", projectIdea: "" } });
  const element = useRef<HTMLFormElement>(null);
  const pending = useRef<((result: DemoFormSubmitResult) => void) | undefined>(undefined);
  const submitting = useRef(false);
  const { register, handleSubmit, watch, getValues, setValue, reset, formState } = form;
  const onSubmit = handleSubmit(values => {
    service?.recordSubmission(values);
    pending.current?.({ success: true, values: { ...values } });
    pending.current = undefined;
  }, () => {
    pending.current?.({ success: false, message: locale.formInvalid });
    pending.current = undefined;
  });
  useEffect(() => {
    if (!service) return;
    const detach = service.attach({
      setField(name, value) { setValue(name, value, { shouldDirty: true, shouldValidate: true }); },
      reset() { reset({ firstName: "", lastName: "", email: "", projectIdea: "" }); },
      async submit() {
        if (submitting.current) return { success: false, message: locale.formBusy };
        const node = element.current;
        if (!node) return { success: false, message: locale.formUnavailable };
        submitting.current = true;
        try {
          return await new Promise<DemoFormSubmitResult>(resolve => {
            pending.current = resolve;
            try { node.requestSubmit(); } catch (error) { pending.current = undefined; throw error; }
          });
        } finally { submitting.current = false; }
      },
    });
    service.publish(getValues());
    const subscription = watch(() => service.publish(getValues()));
    return () => {
      detach(); subscription.unsubscribe();
      pending.current?.({ success: false, message: locale.formUnavailable }); pending.current = undefined;
    };
  }, [service, getValues, setValue, reset, watch, locale]);
  return <FormProvider {...form}><form ref={element} noValidate className="frontend-tool-form" onSubmit={onSubmit}>
    <h2>{locale.formTitle}</h2>
    {DEMO_FORM_FIELDS.map(name => <label key={name}>{locale[name]}
      {name === "projectIdea" ? <textarea {...register(name)} /> : <input type={name === "email" ? "email" : "text"} {...register(name, {
        ...(name === "firstName" || name === "email" ? { required: locale.formRequired } : {}),
        ...(name === "email" ? { pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: locale.formInvalid } } : {}),
      })} />}
      {formState.errors[name] ? <span role="alert">{formState.errors[name]?.message}</span> : null}
    </label>)}
    <div><button type="button" onClick={() => reset({ firstName: "", lastName: "", email: "", projectIdea: "" })}>{locale.resetForm}</button>
    <button type="submit" disabled={formState.isSubmitting}>{locale.submitForm}</button></div>
    {formState.isSubmitSuccessful ? <p role="status">{locale.formSubmitted}</p> : null}
  </form></FormProvider>;
}
