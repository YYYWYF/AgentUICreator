import { type IncomingMessage, type ServerResponse } from "node:http";
import { CreatorProcessManager } from "./CreatorProcessManager.js";
export declare function proxyCreatorRequest(request: IncomingMessage, response: ServerResponse, manager: CreatorProcessManager, path: "/creator" | "/creator-control" | "/runtime-diagnostics" | "/visual-observation"): Promise<void>;
//# sourceMappingURL=CreatorProxy.d.ts.map