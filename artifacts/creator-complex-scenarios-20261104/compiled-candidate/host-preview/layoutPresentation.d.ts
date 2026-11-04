import type { RuntimeObservationRequest } from "./protocol.js";
export interface RuntimePresentationNode {
    relation: "self" | "ancestor" | "descendant";
    depth: number;
    tag: string;
    classes: string[];
    slot?: string;
    sidebarMode?: string;
    state?: "expanded" | "collapsed" | "open" | "closed";
    expanded?: boolean;
    side?: "left" | "right" | "top" | "bottom";
    rect: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    styles: Record<string, string>;
}
export interface RuntimePresentation {
    status: "available" | "unavailable";
    reason?: string;
    truncated: boolean;
    regions: {
        kind: "layout" | "instance";
        id: string;
        nodes: RuntimePresentationNode[];
        truncated: boolean;
    }[];
}
/** Dev-only structural facts inside the published Agent root. No text, values,
 * arbitrary attributes, selectors from the Agent, stylesheet URLs or scripts. */
export declare function collectRuntimePresentation(root: HTMLElement | undefined, composition: any, request: RuntimeObservationRequest): RuntimePresentation;
//# sourceMappingURL=layoutPresentation.d.ts.map