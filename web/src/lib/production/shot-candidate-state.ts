import type { Shot } from "@/types/production";

export function staleApprovedCandidates(shot: Shot, status: Shot["status"] = "candidate-review"): Shot {
    if (!shot.approvedCandidateId) return shot;
    return {
        ...shot,
        approvedCandidateId: undefined,
        candidates: shot.candidates.map((item) => item.id === shot.approvedCandidateId ? { ...item, status: "stale" as const } : item),
        status,
    };
}
