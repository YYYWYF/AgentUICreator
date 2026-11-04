import { clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
const merge = extendTailwindMerge({ prefix: "cui" });
export function cn(...inputs) { return merge(clsx(inputs)); }
//# sourceMappingURL=utils.js.map