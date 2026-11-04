import { type HostPreviewSession } from "./protocol.js";
/** Each iframe load / selected thread gets its own port and immutable workspace identity. */
export declare function connectCreatorHostPreview(frame: HTMLIFrameElement, session: Omit<HostPreviewSession, "creatorOrigin">): () => void;
/** The dock is inside the Host, so its connection travels to the parent. */
export declare function connectCreatorDockHost(session: Omit<HostPreviewSession, "creatorOrigin">): () => void;
//# sourceMappingURL=hostPreviewWorkbench.d.ts.map