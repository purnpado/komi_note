export type StudentDetailNavigationRequest =
  | {
      destination: "출결 관리";
      date: string;
    }
  | {
      destination: "상담 기록";
      studentID: string;
    };
