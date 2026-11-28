/*
 * Desktop stand-in for the web app's server actions (src/app/actions.ts).
 * Same names and signatures, so the shared components work unchanged; each call goes to
 * the Rust side, which writes local SQLite and queues the change for sync.
 *
 * Phase 1: not wired up yet.
 */
import type { LinkLookup, NewProblemInput, ProblemUpdate, TabSync } from "../../../src/app/actions";
import type { Status } from "../../../src/db/schema";
import type { FetchResult } from "../../../src/lib/leetcode";

export type { LinkLookup, NewProblemInput, ProblemUpdate, SnippetInput, TabSync } from "../../../src/app/actions";

const todo = (name: string) => () => Promise.reject(new Error(`${name}: not available in the desktop app yet`));

export const createTopic: (formData: FormData) => Promise<void> = todo("createTopic");
export const updateTopic: (formData: FormData) => Promise<void> = todo("updateTopic");
export const deleteTopic: (formData: FormData) => Promise<void> = todo("deleteTopic");
export const createPattern: (topicId: number, name: string) => Promise<void> = todo("createPattern");
export const renamePattern: (id: number, name: string) => Promise<void> = todo("renamePattern");
export const deletePattern: (id: number) => Promise<void> = todo("deletePattern");
export const shiftPattern: (id: number, dir: -1 | 1) => Promise<void> = todo("shiftPattern");
export const lookupProblemLink: (url: string) => Promise<LinkLookup> = todo("lookupProblemLink");
export const createProblem: (input: NewProblemInput) => Promise<{ id: number }> = todo("createProblem");
export const updateProblem: (id: number, patch: Partial<ProblemUpdate>, tabs: TabSync) => Promise<void> = todo("updateProblem");
export const setStatus: (id: number, status: Status) => Promise<void> = todo("setStatus");
export const setStarred: (id: number, starred: boolean) => Promise<void> = todo("setStarred");
export const fetchDescription: (id: number, force?: boolean) => Promise<FetchResult> = todo("fetchDescription");
export const markViewed: (id: number) => Promise<void> = todo("markViewed");
export const moveProblem: (id: number, patternId: number | null, beforeId: number | null) => Promise<void> = todo("moveProblem");
export const deleteProblem: (formData: FormData) => Promise<void> = todo("deleteProblem");
export const deleteProblemById: (id: number) => Promise<void> = todo("deleteProblemById");
