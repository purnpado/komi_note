export namespace main {

	export class AcademicChange {
	    id: string;
	    name: string;
	    status: string;
	    processedDate: string;
	    studentId?: string;
	    number?: number;

	    static createFrom(source: any = {}) {
	        return new AcademicChange(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.status = source["status"];
	        this.processedDate = source["processedDate"];
	        this.studentId = source["studentId"];
	        this.number = source["number"];
	    }
	}
	export class Student {
	    id: string;
	    number: number;
	    studentId: string;
	    name: string;
	    gender: string;
	    birthDate: string;
	    address: string;
	    studentPhone: string;
	    fatherName: string;
	    fatherPhone: string;
	    motherName: string;
	    motherPhone: string;
	    guardianName: string;
	    guardianRelationship: string;
	    guardianPhone: string;
	    documentGuardian: string;
	    transferInDate: string;
	    careerHope: string;
	    note: string;
	    hasPhoto: boolean;

	    static createFrom(source: any = {}) {
	        return new Student(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.number = source["number"];
	        this.studentId = source["studentId"];
	        this.name = source["name"];
	        this.gender = source["gender"];
	        this.birthDate = source["birthDate"];
	        this.address = source["address"];
	        this.studentPhone = source["studentPhone"];
	        this.fatherName = source["fatherName"];
	        this.fatherPhone = source["fatherPhone"];
	        this.motherName = source["motherName"];
	        this.motherPhone = source["motherPhone"];
	        this.guardianName = source["guardianName"];
	        this.guardianRelationship = source["guardianRelationship"];
	        this.guardianPhone = source["guardianPhone"];
	        this.documentGuardian = source["documentGuardian"];
	        this.transferInDate = source["transferInDate"];
	        this.careerHope = source["careerHope"];
	        this.note = source["note"] || "";
	        this.hasPhoto = source["hasPhoto"];
	    }
	}
	export class AgeGroup {
	    age: number;
	    count: number;
	    students: Student[];

	    static createFrom(source: any = {}) {
	        return new AgeGroup(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.age = source["age"];
	        this.count = source["count"];
	        this.students = this.convertValues(source["students"], Student);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AppState {
	    needsSetup: boolean;
	    locked: boolean;
	    hasPin: boolean;
	    pinLocked: boolean;
	    pinAttempts: number;
	    maxPinAttempts: number;
	    pinNotice?: string;

	    static createFrom(source: any = {}) {
	        return new AppState(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.needsSetup = source["needsSetup"];
	        this.locked = source["locked"];
	        this.hasPin = source["hasPin"];
	        this.pinLocked = source["pinLocked"];
	        this.pinAttempts = source["pinAttempts"];
	        this.maxPinAttempts = source["maxPinAttempts"];
	        this.pinNotice = source["pinNotice"];
	    }
	}
	export class AssessmentHistory {
	    id: string;
	    type: string;
	    studentId: string;
	    domainId?: string;
	    detail: string;
	    createdAt: string;

	    static createFrom(source: any = {}) {
	        return new AssessmentHistory(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.type = source["type"];
	        this.studentId = source["studentId"];
	        this.domainId = source["domainId"];
	        this.detail = source["detail"];
	        this.createdAt = source["createdAt"];
	    }
	}
	export class AssessmentObjection {
	    id: string;
	    studentId: string;
	    domainId: string;
	    content: string;
	    status: string;
	    answer: string;
	    submittedAt: string;
	    answeredAt: string;

	    static createFrom(source: any = {}) {
	        return new AssessmentObjection(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.studentId = source["studentId"];
	        this.domainId = source["domainId"];
	        this.content = source["content"];
	        this.status = source["status"];
	        this.answer = source["answer"];
	        this.submittedAt = source["submittedAt"];
	        this.answeredAt = source["answeredAt"];
	    }
	}
	export class AssessmentCriterionScore {
	    criterionId: string;
	    score?: number;
	    reason: string;

	    static createFrom(source: any = {}) {
	        return new AssessmentCriterionScore(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.criterionId = source["criterionId"];
	        this.score = source["score"];
	        this.reason = source["reason"];
	    }
	}
	export class AssessmentDomainScore {
	    domainId: string;
	    importedScore?: number;
	    criteria: AssessmentCriterionScore[];

	    static createFrom(source: any = {}) {
	        return new AssessmentDomainScore(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.domainId = source["domainId"];
	        this.importedScore = source["importedScore"];
	        this.criteria = this.convertValues(source["criteria"], AssessmentCriterionScore);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AssessmentScore {
	    studentId: string;
	    domains: AssessmentDomainScore[];
	    note: string;
	    deduction: string;
	    updatedAt: string;

	    static createFrom(source: any = {}) {
	        return new AssessmentScore(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.studentId = source["studentId"];
	        this.domains = this.convertValues(source["domains"], AssessmentDomainScore);
	        this.note = source["note"];
	        this.deduction = source["deduction"];
	        this.updatedAt = source["updatedAt"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AssessmentCriterion {
	    id: string;
	    name: string;
	    maxScore: number;
	    note: string;

	    static createFrom(source: any = {}) {
	        return new AssessmentCriterion(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.maxScore = source["maxScore"];
	        this.note = source["note"];
	    }
	}
	export class AssessmentDomain {
	    id: string;
	    name: string;
	    maxScore: number;
	    criteria: AssessmentCriterion[];

	    static createFrom(source: any = {}) {
	        return new AssessmentDomain(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.maxScore = source["maxScore"];
	        this.criteria = this.convertValues(source["criteria"], AssessmentCriterion);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AssessmentStudent {
	    id: string;
	    number: string;
	    name: string;
	    status: string;
	    transferIn?: string;
	    skippedDomains?: string[];

	    static createFrom(source: any = {}) {
	        return new AssessmentStudent(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.number = source["number"];
	        this.name = source["name"];
	        this.status = source["status"];
	        this.transferIn = source["transferIn"];
	        this.skippedDomains = source["skippedDomains"];
	    }
	}
	export class Assessment {
	    id: string;
	    title: string;
	    subject: string;
	    className: string;
	    schoolYear?: string;
	    semester?: string;
	    grade?: string;
	    classroom?: string;
	    students: AssessmentStudent[];
	    domains: AssessmentDomain[];
	    scores: AssessmentScore[];
	    objections: AssessmentObjection[];
	    history: AssessmentHistory[];
	    createdAt: string;
	    updatedAt: string;

	    static createFrom(source: any = {}) {
	        return new Assessment(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.subject = source["subject"];
	        this.className = source["className"];
	        this.schoolYear = source["schoolYear"];
	        this.semester = source["semester"];
	        this.grade = source["grade"];
	        this.classroom = source["classroom"];
	        this.students = this.convertValues(source["students"], AssessmentStudent);
	        this.domains = this.convertValues(source["domains"], AssessmentDomain);
	        this.scores = this.convertValues(source["scores"], AssessmentScore);
	        this.objections = this.convertValues(source["objections"], AssessmentObjection);
	        this.history = this.convertValues(source["history"], AssessmentHistory);
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}





	export class AssessmentImportPreview {
	    fileName: string;
	    subject: string;
	    className: string;
	    filenameSubject?: string;
	    assessment: Assessment;
	    warnings?: string[];

	    static createFrom(source: any = {}) {
	        return new AssessmentImportPreview(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.fileName = source["fileName"];
	        this.subject = source["subject"];
	        this.className = source["className"];
	        this.filenameSubject = source["filenameSubject"];
	        this.assessment = this.convertValues(source["assessment"], Assessment);
	        this.warnings = source["warnings"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}


	export class AssessmentSessionInfo {
	    assessmentId: string;
	    domainId: string;
	    domainName: string;
	    title: string;
	    running: boolean;
	    studentUrl: string;
	    boardUrl: string;
	    shortCode: string;
	    qrCodeDataUrl: string;
	    verifiedCount: number;
	    completedCount: number;
	    objectionCount: number;
	    notice: string;
	    mode: string;
	    participants?: { studentId: string; number: string; name: string; status: string }[];

	    static createFrom(source: any = {}) {
	        return new AssessmentSessionInfo(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.assessmentId = source["assessmentId"];
	        this.domainId = source["domainId"];
	        this.domainName = source["domainName"];
	        this.title = source["title"];
	        this.running = source["running"];
	        this.studentUrl = source["studentUrl"];
	        this.boardUrl = source["boardUrl"];
	        this.shortCode = source["shortCode"];
	        this.qrCodeDataUrl = source["qrCodeDataUrl"];
	        this.verifiedCount = source["verifiedCount"];
	        this.completedCount = source["completedCount"];
	        this.objectionCount = source["objectionCount"];
	        this.notice = source["notice"];
	        this.mode = source["mode"];
	        this.participants = source["participants"];
	    }
	}

	export class AttendanceEntry {
	    studentId: string;
	    status: string;
	    reasonCategory: string;
	    reason: string;
	    period: string;
	    startDate: string;
	    endDate: string;
	    schoolDays: number;
	    departedName?: string;
	    departedNumber?: number;

	    static createFrom(source: any = {}) {
	        return new AttendanceEntry(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.studentId = source["studentId"];
	        this.status = source["status"];
	        this.reasonCategory = source["reasonCategory"];
	        this.reason = source["reason"];
	        this.period = source["period"];
	        this.startDate = source["startDate"];
	        this.endDate = source["endDate"];
	        this.schoolDays = source["schoolDays"];
	        this.departedName = source["departedName"];
	        this.departedNumber = source["departedNumber"];
	    }
	}
	export class AttendanceDay {
	    date: string;
	    entries: AttendanceEntry[];
	    savedAt: string;

	    static createFrom(source: any = {}) {
	        return new AttendanceDay(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.date = source["date"];
	        this.entries = this.convertValues(source["entries"], AttendanceEntry);
	        this.savedAt = source["savedAt"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AttendanceDocumentPeriod {
	    entry: AttendanceEntry;
	    startDate: string;
	    endDate: string;
	    schoolDays: number;

	    static createFrom(source: any = {}) {
	        return new AttendanceDocumentPeriod(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.entry = this.convertValues(source["entry"], AttendanceEntry);
	        this.startDate = source["startDate"];
	        this.endDate = source["endDate"];
	        this.schoolDays = source["schoolDays"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

	export class AttendanceFieldPoint {
	    id: string;
	    field: string;
	    x: number;
	    y: number;
	    width: number;
	    height: number;
	    fontSize: number;
	    format: string;

	    static createFrom(source: any = {}) {
	        return new AttendanceFieldPoint(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.field = source["field"];
	        this.x = source["x"];
	        this.y = source["y"];
	        this.width = source["width"];
	        this.height = source["height"];
	        this.fontSize = source["fontSize"];
	        this.format = source["format"];
	    }
	}
	export class AttendanceHWPXExportResult {
	    path: string;
	    unresolved: string[];

	    static createFrom(source: any = {}) {
	        return new AttendanceHWPXExportResult(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.unresolved = source["unresolved"];
	    }
	}
	export class AttendanceTemplate {
	    id: string;
	    name: string;
	    fileName: string;
	    format: string;
	    statuses: string[];
	    previewData: string;
	    mappings: AttendanceFieldPoint[];
	    customValues: Record<string, string>;
	    createdAt: string;

	    static createFrom(source: any = {}) {
	        return new AttendanceTemplate(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.fileName = source["fileName"];
	        this.format = source["format"];
	        this.statuses = source["statuses"];
	        this.previewData = source["previewData"];
	        this.mappings = this.convertValues(source["mappings"], AttendanceFieldPoint);
	        this.customValues = source["customValues"];
	        this.createdAt = source["createdAt"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ClassConfig {
	    schoolName: string;
	    schoolYear: string;
	    teacherRole: string;
	    grade: string;
	    classNumber: string;
	    teacherLabel: string;
	    teacherName?: string;
	    teachingSubject: string;
	    teachingClasses: string[];
	    theme: string;
	    autoLockMinutes: number;
	    experienceLearningUnit: string;
	    experienceLearningYearLimit: number;
	    semester1StartDate: string;
	    semester1EndDate: string;
	    semester1ExperienceLimit: number;
	    semester2StartDate: string;
	    semester2EndDate: string;
	    semester2ExperienceLimit: number;
	    holidays?: { date: string; name: string }[];
	    hiddenMenus?: string[];
	    termsVersion: string;
	    termsAcceptedAt: string;

	    static createFrom(source: any = {}) {
	        return new ClassConfig(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.schoolName = source["schoolName"];
	        this.schoolYear = source["schoolYear"];
	        this.teacherRole = source["teacherRole"];
	        this.grade = source["grade"];
	        this.classNumber = source["classNumber"];
	        this.teacherLabel = source["teacherLabel"];
	        this.teacherName = source["teacherName"];
	        this.teachingSubject = source["teachingSubject"];
	        this.teachingClasses = source["teachingClasses"];
	        this.theme = source["theme"];
	        this.autoLockMinutes = source["autoLockMinutes"];
	        this.experienceLearningUnit = source["experienceLearningUnit"];
	        this.experienceLearningYearLimit = source["experienceLearningYearLimit"];
	        this.semester1StartDate = source["semester1StartDate"];
	        this.semester1EndDate = source["semester1EndDate"];
	        this.semester1ExperienceLimit = source["semester1ExperienceLimit"];
	        this.semester2StartDate = source["semester2StartDate"];
	        this.semester2EndDate = source["semester2EndDate"];
	        this.semester2ExperienceLimit = source["semester2ExperienceLimit"];
	        this.holidays = source["holidays"];
	        this.hiddenMenus = source["hiddenMenus"];
	        this.termsVersion = source["termsVersion"];
	        this.termsAcceptedAt = source["termsAcceptedAt"];
	    }
	}
	export class CleaningAssignment {
	    studentId: string;
	    zoneId: string;
	    note: string;

	    static createFrom(source: any = {}) {
	        return new CleaningAssignment(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.studentId = source["studentId"];
	        this.zoneId = source["zoneId"];
	        this.note = source["note"];
	    }
	}
	export class CleaningZone {
	    id: string;
	    name: string;
	    requiredCount: number;
	    day: string;
	    note: string;

	    static createFrom(source: any = {}) {
	        return new CleaningZone(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.requiredCount = source["requiredCount"];
	        this.day = source["day"];
	        this.note = source["note"];
	    }
	}
	export class CleaningPlan {
	    id: string;
	    title: string;
	    periodType: string;
	    startDate: string;
	    endDate: string;
	    createdAt: string;
	    zones: CleaningZone[];
	    assignments: CleaningAssignment[];

	    static createFrom(source: any = {}) {
	        return new CleaningPlan(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.periodType = source["periodType"];
	        this.startDate = source["startDate"];
	        this.endDate = source["endDate"];
	        this.createdAt = source["createdAt"];
	        this.zones = this.convertValues(source["zones"], CleaningZone);
	        this.assignments = this.convertValues(source["assignments"], CleaningAssignment);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

	// 상담 기록을 고치기 전 값.
	export class ConsultationRevision {
	    editedAt: string;
	    date: string;
	    type: string;
	    content: string;
	    followUpDate: string;

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.editedAt = source["editedAt"] || "";
	        this.date = source["date"] || "";
	        this.type = source["type"] || "";
	        this.content = source["content"] || "";
	        this.followUpDate = source["followUpDate"] || "";
	    }
	}
	export class Consultation {
	    id: string;
	    studentId: string;
	    parentId: string;
	    rootId: string;
	    date: string;
	    type: string;
	    content: string;
	    followUpDate: string;
	    followUpDone: boolean;
	    manualDone: boolean;
	    recordedAt: string;
	    updatedAt: string;
	    revisions: ConsultationRevision[];

	    static createFrom(source: any = {}) {
	        return new Consultation(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.studentId = source["studentId"];
	        this.parentId = source["parentId"];
	        this.rootId = source["rootId"];
	        this.date = source["date"];
	        this.type = source["type"];
	        this.content = source["content"];
	        this.followUpDate = source["followUpDate"];
	        this.followUpDone = source["followUpDone"];
	        this.manualDone = Boolean(source["manualDone"]);
	        this.recordedAt = source["recordedAt"];
	        this.updatedAt = source["updatedAt"] || "";
	        this.revisions = (source["revisions"] || []).map((item: any) => new ConsultationRevision(item));
	    }
	}
	export class CourseRosterChange {
	    action: string;
	    at: string;
	    previousNumber?: string;
	    number?: string;

	    static createFrom(source: any = {}) {
	        return new CourseRosterChange(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.action = source["action"];
	        this.at = source["at"];
	        this.previousNumber = source["previousNumber"];
	        this.number = source["number"];
	    }
	}
	export class CourseRosterStudent {
	    number: string;
	    name: string;
	    status?: string;

	    static createFrom(source: any = {}) {
	        return new CourseRosterStudent(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.number = source["number"];
	        this.name = source["name"];
	        this.status = source["status"];
	    }
	}
	export class CourseRoster {
	    id: string;
	    schoolYear: string;
	    grade: string;
	    className: string;
	    students: CourseRosterStudent[];
	    changes?: CourseRosterChange[];

	    static createFrom(source: any = {}) {
	        return new CourseRoster(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.schoolYear = source["schoolYear"];
	        this.grade = source["grade"];
	        this.className = source["className"];
	        this.students = this.convertValues(source["students"], CourseRosterStudent);
	        this.changes = this.convertValues(source["changes"], CourseRosterChange);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

	export class CourseRosterPreview {
	    status: string;
	    message: string;
	    added: string[];
	    missing: string[];

	    static createFrom(source: any = {}) {
	        return new CourseRosterPreview(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.message = source["message"];
	        this.added = source["added"];
	        this.missing = source["missing"];
	    }
	}

	export class GenderCount {
	    gender: string;
	    count: number;

	    static createFrom(source: any = {}) {
	        return new GenderCount(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.gender = source["gender"];
	        this.count = source["count"];
	    }
	}
	export class ParticipationSafetyState {
	    active: boolean;
	    paused: boolean;

	    static createFrom(source: any = {}) {
	        return new ParticipationSafetyState(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.active = source["active"];
	        this.paused = source["paused"];
	    }
	}
	export class RosterImportResult {
	    added: number;
	    updated: number;
	    total: number;
	    warnings: string[];

	    static createFrom(source: any = {}) {
	        return new RosterImportResult(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.added = source["added"];
	        this.updated = source["updated"];
	        this.total = source["total"];
	        this.warnings = source["warnings"];
	    }
	}
	export class RosterPreview {
	    headers: string[];
	    students: Student[];
	    warnings: string[];

	    static createFrom(source: any = {}) {
	        return new RosterPreview(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.headers = source["headers"];
	        this.students = this.convertValues(source["students"], Student);
	        this.warnings = source["warnings"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SeatingSeat {
	    id: string;
	    row: number;
	    column: number;
	    x: number;
	    y: number;
	    label: string;
	    studentId: string;

	    static createFrom(source: any = {}) {
	        return new SeatingSeat(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.row = source["row"];
	        this.column = source["column"];
	        this.x = source["x"];
	        this.y = source["y"];
	        this.label = source["label"];
	        this.studentId = source["studentId"];
	    }
	}
	export class RestoreResult {
	    config: ClassConfig;
	    recoveryMismatch: boolean;
	    studentCount: number;
	    attachmentsRestored?: number;
	    attachmentsFailed?: number;

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.config = new ClassConfig(source["config"] || {});
	        this.recoveryMismatch = source["recoveryMismatch"];
	        this.studentCount = source["studentCount"];
	        this.attachmentsRestored = source["attachmentsRestored"];
	        this.attachmentsFailed = source["attachmentsFailed"];
	    }
	}
	export class SeatingChange {
	    at: string;
	    summary: string;

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.at = source["at"];
	        this.summary = source["summary"];
	    }
	}
	export class SeatingPlan {
	    id: string;
	    title: string;
	    createdAt: string;
	    rows: number;
	    columns: number;
	    layoutMode: string;
	    deskPosition: string;
	    placementMode: string;
	    drawMethod: string;
	    competitionMethod: string;
	    preventPreviousSeat: boolean;
	    preventPreviousPartner: boolean;
	    fixedStudentIds: string[];
	    participationMode: string;
	    sessionState: string;
	    currentRound: number;
	    seats: SeatingSeat[];
	    changes?: SeatingChange[];

	    static createFrom(source: any = {}) {
	        return new SeatingPlan(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.createdAt = source["createdAt"];
	        this.rows = source["rows"];
	        this.columns = source["columns"];
	        this.layoutMode = source["layoutMode"];
	        this.deskPosition = source["deskPosition"];
	        this.placementMode = source["placementMode"];
	        this.drawMethod = source["drawMethod"];
	        this.competitionMethod = source["competitionMethod"];
	        this.preventPreviousSeat = source["preventPreviousSeat"];
	        this.preventPreviousPartner = source["preventPreviousPartner"];
	        this.fixedStudentIds = source["fixedStudentIds"];
	        this.participationMode = source["participationMode"];
	        this.sessionState = source["sessionState"];
	        this.currentRound = source["currentRound"];
	        this.seats = this.convertValues(source["seats"], SeatingSeat);
	        this.changes = source["changes"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

	export class SeatingSessionInfo {
	    planId: string;
	    running: boolean;
	    studentUrl: string;
	    boardUrl: string;
	    qrCodeDataUrl: string;
	    participantCnt: number;
	    ladderSelectedCnt: number;
	    phase: string;
	    currentNickname: string;
	    notice: string;
	    drawMethod: string;
	    preferenceLimit: number;
	    submittedCnt: number;
	    contestCnt: number;
	    competitionMethod: string;
	    currentPreferencePriority: number;
	    currentContestSeat: string;
	    currentContestCandidates: string[];
	    paused: boolean;
	    errorMessage: string;
	    rosterCnt: number;
	    partialClosed: boolean;
	    namesRevealed: boolean;

	    static createFrom(source: any = {}) {
	        return new SeatingSessionInfo(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.planId = source["planId"];
	        this.running = source["running"];
	        this.studentUrl = source["studentUrl"];
	        this.boardUrl = source["boardUrl"];
	        this.qrCodeDataUrl = source["qrCodeDataUrl"];
	        this.participantCnt = source["participantCnt"];
	        this.ladderSelectedCnt = source["ladderSelectedCnt"];
	        this.phase = source["phase"];
	        this.currentNickname = source["currentNickname"];
	        this.notice = source["notice"];
	        this.drawMethod = source["drawMethod"];
	        this.preferenceLimit = source["preferenceLimit"];
	        this.submittedCnt = source["submittedCnt"];
	        this.contestCnt = source["contestCnt"];
	        this.competitionMethod = source["competitionMethod"];
	        this.currentPreferencePriority = source["currentPreferencePriority"];
	        this.currentContestSeat = source["currentContestSeat"];
	        this.currentContestCandidates = source["currentContestCandidates"];
	        this.paused = source["paused"];
	        this.errorMessage = source["errorMessage"];
	        this.rosterCnt = source["rosterCnt"];
	        this.partialClosed = source["partialClosed"];
	        this.namesRevealed = source["namesRevealed"];
	    }
	}
	export class SessionResult {
	    config: ClassConfig;

	    static createFrom(source: any = {}) {
	        return new SessionResult(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.config = this.convertValues(source["config"], ClassConfig);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SetupRequest {
	    config: ClassConfig;
	    masterPassword: string;
	    recoveryPassword: string;
	    recoveryFilePath: string;

	    static createFrom(source: any = {}) {
	        return new SetupRequest(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.config = this.convertValues(source["config"], ClassConfig);
	        this.masterPassword = source["masterPassword"];
	        this.recoveryPassword = source["recoveryPassword"];
	        this.recoveryFilePath = source["recoveryFilePath"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

	export class StudentStats {
	    baseDate: string;
	    total: number;
	    genderCounts: GenderCount[];
	    ageGroups: AgeGroup[];

	    static createFrom(source: any = {}) {
	        return new StudentStats(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.baseDate = source["baseDate"];
	        this.total = source["total"];
	        this.genderCounts = this.convertValues(source["genderCounts"], GenderCount);
	        this.ageGroups = this.convertValues(source["ageGroups"], AgeGroup);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SubmissionStatus {
	    studentId: string;
	    status: string;
	    note: string;
	    updatedAt: string;

	    static createFrom(source: any = {}) {
	        return new SubmissionStatus(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.studentId = source["studentId"];
	        this.status = source["status"];
	        this.note = source["note"];
	        this.updatedAt = source["updatedAt"];
	    }
	}
	export class SubmissionDocument {
	    id: string;
	    title: string;
	    dueDate: string;
	    note: string;
	    statuses: SubmissionStatus[];
	    createdAt: string;
	    updatedAt: string;

	    static createFrom(source: any = {}) {
	        return new SubmissionDocument(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.dueDate = source["dueDate"];
	        this.note = source["note"];
	        this.statuses = this.convertValues(source["statuses"], SubmissionStatus);
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

	export class SurveyResponse {
	    studentId: string;
	    respondentName: string;
	    answers: Record<string, string>;
	    multiAnswers: Record<string, Array<string>>;
	    submittedAt: string;

	    static createFrom(source: any = {}) {
	        return new SurveyResponse(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.studentId = source["studentId"];
	        this.respondentName = source["respondentName"];
	        this.answers = source["answers"];
	        this.multiAnswers = source["multiAnswers"];
	        this.submittedAt = source["submittedAt"];
	    }
	}
	export class SurveyQuestion {
	    id: string;
	    text: string;
	    type: string;
	    options: string[];
	    description?: string;
	    optional?: boolean;
	    allowOther?: boolean;
	    maxChoices?: number;
	    scaleSteps?: number;
	    scaleMinLabel?: string;
	    scaleMaxLabel?: string;
	    imageId?: string;
	    optionImages?: string[];

	    static createFrom(source: any = {}) {
	        return new SurveyQuestion(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.text = source["text"];
	        this.type = source["type"];
	        this.options = source["options"];
	        this.description = source["description"];
	        this.optional = source["optional"];
	        this.allowOther = source["allowOther"];
	        this.maxChoices = source["maxChoices"];
	        this.scaleSteps = source["scaleSteps"];
	        this.scaleMinLabel = source["scaleMinLabel"];
	        this.scaleMaxLabel = source["scaleMaxLabel"];
	        this.imageId = source["imageId"];
	        this.optionImages = source["optionImages"];
	    }
	}
	export class Survey {
	    id: string;
	    title: string;
	    audience: string;
	    scope: string;
	    staffIdentityMode: string;
	    anonymous: boolean;
	    status: string;
	    expectedParticipants: number;
	    description?: string;
	    targetRosterId?: string;
	    questions: SurveyQuestion[];
	    responses: SurveyResponse[];
	    createdAt: string;
	    updatedAt: string;

	    static createFrom(source: any = {}) {
	        return new Survey(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.audience = source["audience"];
	        this.scope = source["scope"];
	        this.staffIdentityMode = source["staffIdentityMode"];
	        this.anonymous = source["anonymous"];
	        this.status = source["status"];
	        this.expectedParticipants = source["expectedParticipants"];
	        this.description = source["description"];
	        this.targetRosterId = source["targetRosterId"];
	        this.questions = this.convertValues(source["questions"], SurveyQuestion);
	        this.responses = this.convertValues(source["responses"], SurveyResponse);
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}


	export class SurveySessionInfo {
	    surveyId: string;
	    title: string;
	    running: boolean;
	    started: boolean;
	    closed: boolean;
	    publicResults: boolean;
	    studentUrl: string;
	    shortCode: string;
	    boardUrl: string;
	    qrCodeDataUrl: string;
	    participantCnt: number;
	    expectedParticipants: number;
	    responseCnt: number;
	    notice: string;
	    participants?: SurveyParticipantStatus[];

	    static createFrom(source: any = {}) {
	        return new SurveySessionInfo(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.surveyId = source["surveyId"];
	        this.title = source["title"];
	        this.running = source["running"];
	        this.started = source["started"];
	        this.closed = source["closed"];
	        this.publicResults = source["publicResults"];
	        this.studentUrl = source["studentUrl"];
	        this.shortCode = source["shortCode"];
	        this.boardUrl = source["boardUrl"];
	        this.qrCodeDataUrl = source["qrCodeDataUrl"];
	        this.participantCnt = source["participantCnt"];
	        this.expectedParticipants = source["expectedParticipants"];
	        this.responseCnt = source["responseCnt"];
	        this.notice = source["notice"];
	        this.participants = source["participants"];
	    }
	}
	export class SurveyParticipantStatus {
	    id: string;
	    number: string;
	    name: string;
	    joined: boolean;
	    responded: boolean;

	    static createFrom(source: any = {}) {
	        return new SurveyParticipantStatus(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.number = source["number"];
	        this.name = source["name"];
	        this.joined = source["joined"];
	        this.responded = source["responded"];
	    }
	}
	export class UpdateInfo {
	    currentVersion: string;
	    latestVersion: string;
	    downloadURL: string;
	    sha256: string;
	    publishedAt: string;
	    notes: string;
	    available: boolean;
	    message: string;

	    static createFrom(source: any = {}) {
	        return new UpdateInfo(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.currentVersion = source["currentVersion"];
	        this.latestVersion = source["latestVersion"];
	        this.downloadURL = source["downloadURL"];
	        this.sha256 = source["sha256"];
	        this.publishedAt = source["publishedAt"];
	        this.notes = source["notes"];
	        this.available = source["available"];
	        this.message = source["message"];
	    }
	}

	// 시간표: 학생 정보 없이 과목·반·교시 시각만 담는다.
	export class TimetableBellRule {
	    firstStart: string;
	    lessonMinutes: number;
	    breakMinutes: number;
	    lunchAfter: number;
	    lunchMinutes: number;
	    periodCount: number;

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.firstStart = source["firstStart"] || "";
	        this.lessonMinutes = source["lessonMinutes"] || 0;
	        this.breakMinutes = source["breakMinutes"] || 0;
	        this.lunchAfter = source["lunchAfter"] || 0;
	        this.lunchMinutes = source["lunchMinutes"] || 0;
	        this.periodCount = source["periodCount"] || 0;
	    }
	}
	export class TimetablePeriod {
	    number: number;
	    start: string;
	    end: string;

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.number = source["number"] || 0;
	        this.start = source["start"] || "";
	        this.end = source["end"] || "";
	    }
	}
	export class TimetableCell {
	    day: number;
	    period: number;
	    subject: string;
	    className: string;
	    room: string;
	    note: string;
	    courseRosterId: string;

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.day = source["day"] || 0;
	        this.period = source["period"] || 0;
	        this.subject = source["subject"] || "";
	        this.className = source["className"] || "";
	        this.room = source["room"] || "";
	        this.note = source["note"] || "";
	        this.courseRosterId = source["courseRosterId"] || "";
	    }
	}
	export class Timetable {
	    id: string;
	    kind: string;
	    schoolYear: string;
	    semester: string;
	    cells: TimetableCell[];

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"] || "";
	        this.kind = source["kind"] || "";
	        this.schoolYear = source["schoolYear"] || "";
	        this.semester = source["semester"] || "";
	        this.cells = (source["cells"] || []).map((item: any) => new TimetableCell(item));
	    }
	}
	export class TimetableChange {
	    id: string;
	    date: string;
	    period: number;
	    kind: string;
	    target: string;
	    subject: string;
	    className: string;
	    room: string;
	    note: string;
	    courseRosterId: string;

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"] || "";
	        this.date = source["date"] || "";
	        this.period = source["period"] || 0;
	        this.kind = source["kind"] || "";
	        this.target = source["target"] || "";
	        this.subject = source["subject"] || "";
	        this.className = source["className"] || "";
	        this.room = source["room"] || "";
	        this.note = source["note"] || "";
	        this.courseRosterId = source["courseRosterId"] || "";
	    }
	}
	export class TimetableBook {
	    rule: TimetableBellRule;
	    periods: TimetablePeriod[];
	    activeSchoolYear: string;
	    activeSemester: string;
	    timetables: Timetable[];
	    changes: TimetableChange[];
	    updatedAt: string;

	    static createFrom(source: any = {}) {
	        return new TimetableBook(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.rule = new TimetableBellRule(source["rule"] || {});
	        this.periods = (source["periods"] || []).map((item: any) => new TimetablePeriod(item));
	        this.activeSchoolYear = source["activeSchoolYear"] || "";
	        this.activeSemester = source["activeSemester"] || "";
	        this.timetables = (source["timetables"] || []).map((item: any) => new Timetable(item));
	        this.changes = (source["changes"] || []).map((item: any) => new TimetableChange(item));
	        this.updatedAt = source["updatedAt"] || "";
	    }
	}

	// 모둠 편성: 번호·이름과 학생을 가리키는 값만 담는다(성적·연락처 없음).
	export class GroupMember {
	    key: string;
	    number: string;
	    name: string;
	    role: string;

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"] || "";
	        this.number = source["number"] || "";
	        this.name = source["name"] || "";
	        this.role = source["role"] || "";
	    }
	}
	export class Group {
	    name: string;
	    members: GroupMember[];

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"] || "";
	        this.members = (source["members"] || []).map((item: any) => new GroupMember(item));
	    }
	}
	export class GroupPlan {
	    id: string;
	    title: string;
	    sourceKind: string;
	    sourceId: string;
	    sourceLabel: string;
	    roles: string[];
	    groups: Group[];
	    excluded: GroupMember[];
	    createdAt: string;
	    updatedAt: string;

	    static createFrom(source: any = {}) {
	        return new GroupPlan(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"] || "";
	        this.title = source["title"] || "";
	        this.sourceKind = source["sourceKind"] || "";
	        this.sourceId = source["sourceId"] || "";
	        this.sourceLabel = source["sourceLabel"] || "";
	        this.roles = [...(source["roles"] || [])];
	        this.groups = (source["groups"] || []).map((item: any) => new Group(item));
	        this.excluded = (source["excluded"] || []).map((item: any) => new GroupMember(item));
	        this.createdAt = source["createdAt"] || "";
	        this.updatedAt = source["updatedAt"] || "";
	    }
	}
	export class GroupPair {
	    a: string;
	    b: string;

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.a = source["a"] || "";
	        this.b = source["b"] || "";
	    }
	}
	export class GroupRules {
	    sourceKind: string;
	    sourceId: string;
	    separate: GroupPair[];
	    together: GroupPair[];
	    avoidRepeat: boolean;
	    rolesTemplate: string;

	    static createFrom(source: any = {}) {
	        return new GroupRules(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sourceKind = source["sourceKind"] || "";
	        this.sourceId = source["sourceId"] || "";
	        this.separate = (source["separate"] || []).map((item: any) => new GroupPair(item));
	        this.together = (source["together"] || []).map((item: any) => new GroupPair(item));
	        this.avoidRepeat = Boolean(source["avoidRepeat"]);
	        this.rolesTemplate = source["rolesTemplate"] || "";
	    }
	}
	export class GroupingBook {
	    plans: GroupPlan[];
	    rules: GroupRules[];

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.plans = (source["plans"] || []).map((item: any) => new GroupPlan(item));
	        this.rules = (source["rules"] || []).map((item: any) => new GroupRules(item));
	    }
	}

	// 학생 참여형 모둠 편성(지망 배정) 회차. 교사 화면 전용이며 지망 내용은 담지 않는다.
	export class GroupSessionRequest {
	    sourceKind: string;
	    sourceId: string;
	    sourceLabel: string;
	    groupNames: string[];
	    preferenceLimit: number;
	    submitSeconds: number;
	    excludedKeys: string[];
	    mode: string;
	    voteSeconds: number;
	    turnSeconds: number;
	    leaderPublic: boolean;

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sourceKind = source["sourceKind"] || "";
	        this.sourceId = source["sourceId"] || "";
	        this.sourceLabel = source["sourceLabel"] || "";
	        this.groupNames = [...(source["groupNames"] || [])];
	        this.preferenceLimit = source["preferenceLimit"] || 0;
	        this.submitSeconds = source["submitSeconds"] || 0;
	        this.excludedKeys = [...(source["excludedKeys"] || [])];
	        this.mode = source["mode"] || "";
	        this.voteSeconds = source["voteSeconds"] || 0;
	        this.turnSeconds = source["turnSeconds"] || 0;
	        this.leaderPublic = Boolean(source["leaderPublic"]);
	    }
	}
	export class GroupSessionParticipant {
	    key: string;
	    number: string;
	    name: string;
	    nickname: string;
	    joined: boolean;
	    submitted: boolean;

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"] || "";
	        this.number = source["number"] || "";
	        this.name = source["name"] || "";
	        this.nickname = source["nickname"] || "";
	        this.joined = Boolean(source["joined"]);
	        this.submitted = Boolean(source["submitted"]);
	    }
	}
	export class GroupSessionRoundGroup {
	    applicants: number;
	    accepted: string[];

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.applicants = source["applicants"] || 0;
	        this.accepted = [...(source["accepted"] || [])];
	    }
	}
	export class GroupSessionRound {
	    label: string;
	    groups: GroupSessionRoundGroup[];

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.label = source["label"] || "";
	        this.groups = (source["groups"] || []).map((item: any) => new GroupSessionRoundGroup(item));
	    }
	}
	export class GroupSessionResultMember {
	    key: string;
	    number: string;
	    name: string;
	    nickname: string;

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"] || "";
	        this.number = source["number"] || "";
	        this.name = source["name"] || "";
	        this.nickname = source["nickname"] || "";
	    }
	}
	export class GroupSessionResultGroup {
	    name: string;
	    members: GroupSessionResultMember[];

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"] || "";
	        this.members = (source["members"] || []).map((item: any) => new GroupSessionResultMember(item));
	    }
	}
	export class GroupSessionVoteCount {
	    key: string;
	    count: number;

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"] || "";
	        this.count = source["count"] || 0;
	    }
	}
	export class GroupSessionPick {
	    round: number;
	    group: number;
	    key: string;
	    card: number;
	    auto: boolean;

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.round = source["round"] || 0;
	        this.group = source["group"] || 0;
	        this.key = source["key"] || "";
	        this.card = source["card"] || 0;
	        this.auto = Boolean(source["auto"]);
	    }
	}
	export class GroupSessionInfo {
	    running: boolean;
	    phase: string;
	    sourceKind: string;
	    sourceId: string;
	    sourceLabel: string;
	    studentUrl: string;
	    qrCodeDataUrl: string;
	    groupNames: string[];
	    capacities: number[];
	    preferenceLimit: number;
	    submitSeconds: number;
	    remainingSeconds: number;
	    paused: boolean;
	    total: number;
	    joined: number;
	    submitted: number;
	    participants: GroupSessionParticipant[];
	    rounds: GroupSessionRound[];
	    revealed: number;
	    namesRevealed: boolean;
	    result: GroupSessionResultGroup[];
	    mode: string;
	    voteSeconds: number;
	    turnSeconds: number;
	    voted: number;
	    voteCounts: GroupSessionVoteCount[];
	    suggested: string[];
	    leaders: string[];
	    pots: string[][];
	    draftRound: number;
	    turnGroup: number;
	    cardsLeft: number;
	    turnRemaining: number;
	    picks: GroupSessionPick[];
	    leaderPublic: boolean;

	    static createFrom(source: any = {}) {
	        return new GroupSessionInfo(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.running = Boolean(source["running"]);
	        this.phase = source["phase"] || "";
	        this.sourceKind = source["sourceKind"] || "";
	        this.sourceId = source["sourceId"] || "";
	        this.sourceLabel = source["sourceLabel"] || "";
	        this.studentUrl = source["studentUrl"] || "";
	        this.qrCodeDataUrl = source["qrCodeDataUrl"] || "";
	        this.groupNames = [...(source["groupNames"] || [])];
	        this.capacities = [...(source["capacities"] || [])];
	        this.preferenceLimit = source["preferenceLimit"] || 0;
	        this.submitSeconds = source["submitSeconds"] || 0;
	        this.remainingSeconds = source["remainingSeconds"] || 0;
	        this.paused = Boolean(source["paused"]);
	        this.total = source["total"] || 0;
	        this.joined = source["joined"] || 0;
	        this.submitted = source["submitted"] || 0;
	        this.participants = (source["participants"] || []).map((item: any) => new GroupSessionParticipant(item));
	        this.rounds = (source["rounds"] || []).map((item: any) => new GroupSessionRound(item));
	        this.revealed = source["revealed"] || 0;
	        this.namesRevealed = Boolean(source["namesRevealed"]);
	        this.result = (source["result"] || []).map((item: any) => new GroupSessionResultGroup(item));
	        this.mode = source["mode"] || "preference";
	        this.voteSeconds = source["voteSeconds"] || 0;
	        this.turnSeconds = source["turnSeconds"] || 0;
	        this.voted = source["voted"] || 0;
	        this.voteCounts = (source["voteCounts"] || []).map((item: any) => new GroupSessionVoteCount(item));
	        this.suggested = [...(source["suggested"] || [])];
	        this.leaders = [...(source["leaders"] || [])];
	        this.pots = (source["pots"] || []).map((pot: any) => [...(pot || [])]);
	        this.draftRound = source["draftRound"] || 0;
	        this.turnGroup = typeof source["turnGroup"] === "number" ? source["turnGroup"] : -1;
	        this.cardsLeft = source["cardsLeft"] || 0;
	        this.turnRemaining = source["turnRemaining"] || 0;
	        this.picks = (source["picks"] || []).map((item: any) => new GroupSessionPick(item));
	        this.leaderPublic = Boolean(source["leaderPublic"]);
	    }
	}

	// 학교생활기록(교과세특·창체·행동특성·자유학기제). 모두 암호화 보관함에만 저장한다.
	export class RecordMemo {
	    id: string;
	    text: string;
	    createdAt: string;

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"] || "";
	        this.text = source["text"] || "";
	        this.createdAt = source["createdAt"] || "";
	    }
	}
	export class RecordEntry {
	    id: string;
	    schoolYear: string;
	    area: string;
	    targetKind: string;
	    targetId: string;
	    subject: string;
	    studentKey: string;
	    memos: RecordMemo[];
	    text: string;
	    reviewed: boolean;
	    createdAt: string;
	    updatedAt: string;

	    static createFrom(source: any = {}) {
	        return new RecordEntry(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"] || "";
	        this.schoolYear = source["schoolYear"] || "";
	        this.area = source["area"] || "";
	        this.targetKind = source["targetKind"] || "";
	        this.targetId = source["targetId"] || "";
	        this.subject = source["subject"] || "";
	        this.studentKey = source["studentKey"] || "";
	        this.memos = (source["memos"] || []).map((item: any) => new RecordMemo(item));
	        this.text = source["text"] || "";
	        this.reviewed = Boolean(source["reviewed"]);
	        this.createdAt = source["createdAt"] || "";
	        this.updatedAt = source["updatedAt"] || "";
	    }
	}
	export class RecordMember {
	    grade: string;
	    className: string;
	    number: string;
	    name: string;

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.grade = source["grade"] || "";
	        this.className = source["className"] || "";
	        this.number = source["number"] || "";
	        this.name = source["name"] || "";
	    }
	}
	export class RecordActivityList {
	    id: string;
	    schoolYear: string;
	    name: string;
	    members: RecordMember[];
	    createdAt: string;
	    updatedAt: string;

	    static createFrom(source: any = {}) {
	        return new RecordActivityList(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"] || "";
	        this.schoolYear = source["schoolYear"] || "";
	        this.name = source["name"] || "";
	        this.members = (source["members"] || []).map((item: any) => new RecordMember(item));
	        this.createdAt = source["createdAt"] || "";
	        this.updatedAt = source["updatedAt"] || "";
	    }
	}
	// 문장 보관함의 문장. 학생 ID·이름·번호·반은 담지 않는다.
	export class RecordPhrase {
	    id: string;
	    text: string;
	    area: string;
	    subject: string;
	    tags: string[];
	    createdAt: string;
	    updatedAt: string;

	    static createFrom(source: any = {}) {
	        return new RecordPhrase(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"] || "";
	        this.text = source["text"] || "";
	        this.area = source["area"] || "";
	        this.subject = source["subject"] || "";
	        this.tags = [...(source["tags"] || [])];
	        this.createdAt = source["createdAt"] || "";
	        this.updatedAt = source["updatedAt"] || "";
	    }
	}
	export class RecordPhraseBulkResult {
	    added: number;
	    skipped: number;

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.added = Number(source["added"] || 0);
	        this.skipped = Number(source["skipped"] || 0);
	    }
	}
	export class RecordBook {
	    entries: RecordEntry[];
	    lists: RecordActivityList[];
	    limits: Record<string, number>;
	    phrases: RecordPhrase[];

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.entries = (source["entries"] || []).map((item: any) => new RecordEntry(item));
	        this.lists = (source["lists"] || []).map((item: any) => new RecordActivityList(item));
	        this.limits = { ...(source["limits"] || {}) };
	        this.phrases = (source["phrases"] || []).map((item: any) => new RecordPhrase(item));
	    }
	}

}
