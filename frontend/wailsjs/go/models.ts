export namespace main {

	export class AcademicChange {
	    id: string;
	    name: string;
	    status: string;
	    processedDate: string;

	    static createFrom(source: any = {}) {
	        return new AcademicChange(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.status = source["status"];
	        this.processedDate = source["processedDate"];
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

	    static createFrom(source: any = {}) {
	        return new AssessmentStudent(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.number = source["number"];
	        this.name = source["name"];
	        this.status = source["status"];
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
	    recordedAt: string;

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
	        this.recordedAt = source["recordedAt"];
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

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.config = new ClassConfig(source["config"] || {});
	        this.recoveryMismatch = source["recoveryMismatch"];
	        this.studentCount = source["studentCount"];
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

	    static createFrom(source: any = {}) {
	        return new SurveyQuestion(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.text = source["text"];
	        this.type = source["type"];
	        this.options = source["options"];
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

}

