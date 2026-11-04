/** Measures newly observed data, not how many distinct questions were asked. No execution cap. */
export declare class EvidenceProgress {
    private readonly known;
    private readonly ranges;
    private revision;
    private unchangedReads;
    private recentReads;
    private lastReview;
    private reads;
    observe(name: string, input: any, result: any, revision: number): {
        newEvidence: boolean;
        unchangedReads: number;
        recovery?: {
            action: string;
            unchangedReads: number;
            revision: number;
            recentReads: number;
            repeatedReads: number;
            instruction: string;
        };
    };
}
//# sourceMappingURL=evidence-progress.d.ts.map