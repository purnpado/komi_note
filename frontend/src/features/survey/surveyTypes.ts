import type { SavedQuestion, SurveyResponseLike } from "./surveyBuilderState";
import type { SurveyScope } from "./surveyTemplates";

export type SurveyItem = {
  id: string;
  title: string;
  description?: string;
  anonymous: boolean;
  status: string;
  audience?: "학생" | "교직원";
  scope?: SurveyScope;
  staffIdentityMode?: "익명" | "이름 입력" | "";
  expectedParticipants?: number;
  targetRosterId?: string;
  questions: SavedQuestion[];
  responses: SurveyResponseLike[];
};

export type ParticipantStatus = { id: string; number: string; name: string; joined: boolean; responded: boolean };

export type SurveySession = {
  surveyId: string;
  title: string;
  running: boolean;
  started?: boolean;
  closed?: boolean;
  publicResults?: boolean;
  studentUrl: string;
  shortCode?: string;
  boardUrl: string;
  qrCodeDataUrl: string;
  participantCnt: number;
  expectedParticipants?: number;
  responseCnt: number;
  notice: string;
  participants?: ParticipantStatus[];
};
