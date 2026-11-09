import type { SavedQuestion } from "./surveyBuilderState";

export type SurveyScope = "담임용" | "수업용" | "업무용";

export type SurveyTemplate = { name: string; description: string; title: string; scopes: SurveyScope[]; questions: SavedQuestion[] };

const satisfaction = (text: string): SavedQuestion => ({ text, type: "척도", scaleSteps: 5, scaleMinLabel: "매우 아쉬움", scaleMaxLabel: "매우 만족" });

export const surveyTemplates: SurveyTemplate[] = [
  {
    name: "제출 서류 확인", description: "가정통신문·동의서 회신 상태를 확인합니다.", title: "제출 서류 확인", scopes: ["담임용"],
    questions: [{ text: "안내받은 서류를 제출했나요?", type: "단일 선택", options: ["제출함", "아직 제출하지 않음", "분실 또는 재발급 필요"] }],
  },
  {
    name: "학급 운영 의견", description: "청소·모둠·학급 행사 의견을 받습니다.", title: "학급 운영 의견 조사", scopes: ["담임용"],
    questions: [
      { text: "가장 먼저 바꾸고 싶은 것은?", type: "단일 선택", options: ["교실 환경", "청소 운영", "모둠 활동", "학급 행사"], allowOther: true },
      { text: "참여하고 싶은 활동을 모두 골라 주세요", type: "복수 선택", options: ["체험 활동", "모둠 활동", "진로 탐색"] },
      { text: "학급에 바라는 점을 자유롭게 적어 주세요", type: "서술", optional: true },
    ],
  },
  {
    name: "행사 참여 조사", description: "행사나 체험활동 참석 가능 여부를 확인합니다.", title: "행사 참여 가능 여부", scopes: ["담임용", "수업용"],
    questions: [
      { text: "해당 일정에 참여할 수 있나요?", type: "단일 선택", options: ["참여 가능", "조정 필요", "참여 어려움"] },
      { text: "조정이 필요하거나 어려운 까닭이 있다면 적어 주세요", type: "단답", optional: true },
    ],
  },
  {
    name: "수업 만족도", description: "척도로 수업·활동 만족도를 확인합니다.", title: "수업 만족도 조사", scopes: ["수업용"],
    questions: [satisfaction("이번 수업의 만족도는 어느 정도인가요?"), { text: "수업에서 좋았던 점이나 제안할 점을 적어 주세요", type: "서술", optional: true }],
  },
  {
    name: "학습 선호 조사", description: "학생의 학습 방식과 희망 활동을 확인합니다.", title: "학습 활동 선호 조사", scopes: ["수업용"],
    questions: [
      { text: "가장 좋아하는 학습 방식은?", type: "단일 선택", options: ["개별 활동", "짝 활동", "모둠 활동", "발표 활동"] },
      { text: "더 연습하고 싶은 영역을 골라 주세요(2개까지)", type: "복수 선택", options: ["개념 이해", "문제 풀이", "발표", "실습"], maxChoices: 2 },
    ],
  },
  {
    name: "교직원 안건 투표", description: "회의 안건에 대한 교직원 의견을 받습니다.", title: "교직원 회의 안건 의견", scopes: ["업무용"],
    questions: [
      { text: "제안한 안건에 동의하시나요?", type: "단일 선택", options: ["찬성", "반대", "보류"] },
      { text: "추가 의견을 적어 주세요", type: "서술", optional: true },
    ],
  },
  {
    name: "업무 만족도", description: "학교 업무와 지원에 대한 의견을 확인합니다.", title: "교직원 업무 만족도 조사", scopes: ["업무용"],
    questions: [
      satisfaction("현재 업무 환경에 만족하시나요?"),
      { text: "개선이 필요한 지원을 모두 골라 주세요", type: "복수 선택", options: ["업무 분장", "시설·환경", "연수", "소통"], allowOther: true },
      { text: "제안할 점을 적어 주세요", type: "서술", optional: true },
    ],
  },
];
