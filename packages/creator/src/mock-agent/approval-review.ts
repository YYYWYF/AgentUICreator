import { z } from "zod";

const reviewSchema = z.object({
  action_requests: z.array(z.object({ name: z.string(), args: z.record(z.string(), z.unknown()) })).min(1),
  review_configs: z.array(z.object({ action_name: z.string(), allowed_decisions: z.array(z.string()) })),
});
const commandSchema = z.object({
  decisions: z.array(z.object({ type: z.enum(["approve", "reject"]) })).min(1),
});

export type MockApprovalReview = z.infer<typeof reviewSchema>;

export function parseMockApprovalReview(value: unknown): MockApprovalReview | undefined {
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return undefined; }
  }
  const parsed = reviewSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function parseMockApprovalDecisions(value: unknown): Array<{ type: "approve" | "reject" }> | undefined {
  const parsed = commandSchema.safeParse(value);
  return parsed.success ? parsed.data.decisions : undefined;
}

export function matchesMockApprovalReview(value: unknown, review: MockApprovalReview): boolean {
  const decisions = parseMockApprovalDecisions(value);
  return decisions !== undefined && decisions.length === review.action_requests.length &&
    review.action_requests.every((action, index) => review.review_configs.some(config =>
      config.action_name === action.name && config.allowed_decisions.includes(decisions[index]!.type)));
}
