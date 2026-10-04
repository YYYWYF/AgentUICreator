# Composer adapter contract

For a project-owned Composer view, use `useConversationComposer()` from
   `@agent-ui/react` in that adapter. It exposes the active Thread's draft,
   attachments, running/disabled state, and send/cancel/add/remove actions;
   it does not create another Runtime. Connect only capabilities already enabled
   in the project. A component's attachment callback can open a local file input
   and pass selected files to `addAttachment`; honor `attachmentsEnabled` and
   `attachmentAccept`. Keep the component implementation unchanged.
   The public hook returns `text: string`,
   `attachments: readonly { id: string; name: string }[]`,
   `attachmentAccept: string`, `attachmentsEnabled: boolean`,
   `isRunning: boolean`, `disabled: boolean`, `canSend: boolean`,
   `canCancel: boolean`, `setText(text): void`, `send(): void`,
   `cancel(): void`, `addAttachment(file: File): Promise<void>`, and
   `removeAttachment(id: string): Promise<void>`. Check `canSend` and
   `canCancel` before dispatch. This contract is exported at the package root;
   project filesystem tools cannot inspect `node_modules`. Replace the
   existing occupant of the semantic `composer` child Slot so that only one
   active input remains.
   Map every relevant callback exposed by the reused component, including
   attachment removal; a visible control with an undefined callback is not
   preserved behavior. The current canonical Composer's attachment picker
   permits multiple files: keep `multiple` on a replacement file input and
   pass every selected file to `addAttachment`. Show the add control only when
   `attachmentsEnabled` is true. Match the prior Composer's send conditions.
   If the component disables its own
   Send control for empty text but the active Composer can send attachments
   alone, render the public `ConversationComposerSend` only for that case;
   never insert placeholder text into the draft to force the component button.
   If that control adds a label, use the Agent UI conversation locale namespace
   and declare `AGENT_UI_LOCALE_SERVICE` in the Plugin definition.
   Static validation cannot establish these interaction claims.
