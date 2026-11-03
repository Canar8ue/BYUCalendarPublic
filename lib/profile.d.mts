import type {CampusEvent} from '../app/types';

export type TasteProfile = {interests: string[]; categories: string[]; details: string[]; updatedAt?: string};
export type ChatAnswer = {question: string; key: string; options: string[]; free?: string};
export type ChatStep = {done: false; question: string; key: string; options: string[]; multiple: boolean} | {done: true; summary: string};
export type ActivityRow = {kind: string; value: string; score: number; updatedAt?: string};
export type Pick = {id: string; score: number; reasons: string[]};

export const PROFILE_CATEGORIES: string[];
export const PROFILE_INTERESTS: string[];
export const PROFILE_DETAILS: string[];
export const CHAT_MAX_STEPS: number;
export const ACTIVITY_WEIGHTS: Record<string, number>;
export const ACTIVITY_HALF_LIFE_MS: number;
export const RECOMMENDATION_BASE_SCORE: number;

export function buildChatPrompt(answers: ChatAnswer[], now?: Date): {role: string; content: string}[];
export function interpretChatStep(text: string | null | undefined): ChatStep | null;
export function canonicalAnswer(value: unknown): string;
export function canonicalFreeText(value: unknown): string[];
export function profileFromAnswers(answers: ChatAnswer[]): TasteProfile;
export function profileEmpty(profile: unknown): boolean;
export function mergeProfiles(existing: TasteProfile | null | undefined, update: TasteProfile | null | undefined): TasteProfile;
export function decayedScore(score: number, updatedAt: string, now?: number | Date): number;
export function nextActivityScore(score: number, updatedAt: string, weight: number, now?: number | Date): number;
export function scoreEvent(event: CampusEvent, input?: {profile?: TasteProfile | null; activity?: Map<string, number>; savedIds?: string[]; now?: Date}): {score: number; reasons: string[]} | null;
export function recommendEvents(events: CampusEvent[], input?: {profile?: TasteProfile | null; activityRows?: ActivityRow[]; savedIds?: string[]; now?: Date; limit?: number; threshold?: number}): Pick[];
