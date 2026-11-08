// 모둠 편성 계산 함수입니다. 화면과 분리해 자동 검사합니다.
// 학생은 key(담임 학급은 학생 ID, 수업 명렬은 "번호|이름")·번호·이름만 다룹니다.

export type Pupil = { key: string; number: string; name: string };
export type Member = Pupil & { role: string };
export type GroupDraft = { name: string; members: Member[] };
export type Pair = { a: string; b: string };
export type Rng = () => number;

// 기본 난수는 브라우저 암호 난수를 쓴다(추첨 공정성). 검사에서는 시드 난수를 넣는다.
export const cryptoRandom: Rng = () => {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] / 2 ** 32;
};

export function seededRandom(seed: number): Rng {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: T[], random: Rng): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const pick = Math.floor(random() * (index + 1));
    [result[index], result[pick]] = [result[pick], result[index]];
  }
  return result;
}

export function courseKey(number: string, name: string) {
  return `${String(number).trim()}|${String(name).trim()}`;
}

export function pairKey(a: string, b: string) {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

// groupCount는 "모둠당 N명"이면 학생 수를 N으로 나눠 가장 가까운 모둠 수를, "N개 모둠"이면 그대로(학생 수 이하) 돌려줍니다.
export function groupCount(total: number, mode: "size" | "count", value: number) {
  if (total <= 0 || !Number.isFinite(value) || value < 1) return 0;
  if (mode === "count") return Math.min(Math.floor(value), total);
  return Math.max(1, Math.min(total, Math.round(total / Math.floor(value))));
}

// capacities는 인원 차이가 1명 이하가 되도록 모둠별 정원을 나눕니다.
export function capacities(total: number, count: number) {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  return Array.from({ length: count }, (_, index) => base + (index < total % count ? 1 : 0));
}

// pairsInPlan은 지난 편성에서 같은 모둠이었던 두 학생 목록입니다(겹침 줄이기용).
export function pairsInPlan(groups: { members: { key: string }[] }[]) {
  const pairs = new Set<string>();
  for (const group of groups) {
    for (let i = 0; i < group.members.length; i++) {
      for (let j = i + 1; j < group.members.length; j++) pairs.add(pairKey(group.members[i].key, group.members[j].key));
    }
  }
  return pairs;
}

export type Evaluation = {
  separateBroken: Pair[];
  togetherBroken: Pair[];
  repeats: number;
  spread: number;
  score: number;
};

// evaluate는 지금 모둠이 조건을 얼마나 지키는지 계산합니다(옮기기·맞바꾸기 뒤 경고에도 사용).
export function evaluate(groups: { members: { key: string }[] }[], separate: Pair[], together: Pair[], previous: Set<string>): Evaluation {
  const where = new Map<string, number>();
  groups.forEach((group, index) => group.members.forEach((member) => where.set(member.key, index)));
  const present = (pair: Pair) => where.has(pair.a) && where.has(pair.b);
  const separateBroken = separate.filter((pair) => present(pair) && where.get(pair.a) === where.get(pair.b));
  const togetherBroken = together.filter((pair) => present(pair) && where.get(pair.a) !== where.get(pair.b));
  let repeats = 0;
  for (const key of pairsInPlan(groups)) if (previous.has(key)) repeats++;
  const sizes = groups.map((group) => group.members.length);
  const spread = sizes.length ? Math.max(...sizes) - Math.min(...sizes) : 0;
  const score = separateBroken.length * 1000 + togetherBroken.length * 1000 + Math.max(0, spread - 1) * 500 + repeats * 10;
  return { separateBroken, togetherBroken, repeats, spread, score };
}

// 함께 넣을 학생끼리 묶음(unit)을 만든다.
function units(pupils: Pupil[], together: Pair[]) {
  const parent = new Map(pupils.map((pupil) => [pupil.key, pupil.key]));
  const find = (key: string): string => {
    const up = parent.get(key)!;
    if (up === key) return key;
    const root = find(up);
    parent.set(key, root);
    return root;
  };
  for (const pair of together) {
    if (parent.has(pair.a) && parent.has(pair.b)) parent.set(find(pair.a), find(pair.b));
  }
  const groups = new Map<string, Pupil[]>();
  for (const pupil of pupils) {
    const root = find(pupil.key);
    groups.set(root, [...(groups.get(root) || []), pupil]);
  }
  return [...groups.values()];
}

export type MakeOptions = {
  count: number;
  separate: Pair[];
  together: Pair[];
  previous: Set<string>;
  random?: Rng;
  attempts?: number;
};

// makeGroups는 여러 번 무작위로 나눠 본 뒤 조건을 가장 잘 지키는 편성을 고릅니다.
// 조건을 모두 지킬 수 없으면 가장 덜 어긴 편성을 돌려주고, 화면이 evaluate로 경고를 보여 줍니다.
export function makeGroups(pupils: Pupil[], options: MakeOptions): Pupil[][] {
  const random = options.random || cryptoRandom;
  const count = Math.min(options.count, pupils.length);
  if (count <= 0) return [];
  const caps = capacities(pupils.length, count);
  const separate = new Set(options.separate.map((pair) => pairKey(pair.a, pair.b)));
  const attempts = options.attempts ?? 300;
  let best: Pupil[][] = [];
  let bestScore = Infinity;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const order = shuffle(units(pupils, options.together), random).sort((a, b) => b.length - a.length);
    const groups: Pupil[][] = Array.from({ length: count }, () => []);
    const capOrder = shuffle(caps, random);
    for (const unit of order) {
      let choice = -1;
      let choiceCost = Infinity;
      for (const index of shuffle([...groups.keys()], random)) {
        const group = groups[index];
        let cost = 0;
        const over = group.length + unit.length - capOrder[index];
        if (over > 0) cost += over * 500;
        for (const member of unit) {
          for (const other of group) {
            const key = pairKey(member.key, other.key);
            if (separate.has(key)) cost += 1000;
            if (options.previous.has(key)) cost += 10;
          }
        }
        if (cost < choiceCost) {
          choiceCost = cost;
          choice = index;
        }
      }
      groups[choice].push(...unit);
    }
    const score = evaluate(groups.map((members) => ({ members })), options.separate, options.together, options.previous).score;
    if (score < bestScore) {
      bestScore = score;
      best = groups;
      if (score === 0) break;
    }
  }
  return best;
}

// assignRoles는 모둠마다 역할을 무작위로 나눠 줍니다(학생이 역할보다 많으면 나머지는 빈칸).
export function assignRoles(groups: Pupil[][], roles: string[], random: Rng = cryptoRandom): Member[][] {
  return groups.map((group) => {
    const order = shuffle(group, random);
    const roleOf = new Map(order.map((pupil, index) => [pupil.key, roles[index] || ""]));
    return group.map((pupil) => ({ ...pupil, role: roleOf.get(pupil.key) || "" }));
  });
}

export function parseRoles(text: string) {
  return [...new Set(text.split(/[,，·\n]/).map((role) => role.trim()).filter(Boolean))].slice(0, 8);
}

// moveMember는 학생을 다른 모둠으로 옮깁니다.
export function moveMember(groups: GroupDraft[], key: string, target: number): GroupDraft[] {
  const member = groups.flatMap((group) => group.members).find((item) => item.key === key);
  if (!member || target < 0 || target >= groups.length) return groups;
  return groups.map((group, index) => {
    const members = group.members.filter((item) => item.key !== key);
    return { ...group, members: index === target ? [...members, member] : members };
  });
}

// swapMembers는 두 학생의 자리를 맞바꿉니다(역할은 자리에 남음).
export function swapMembers(groups: GroupDraft[], first: string, second: string): GroupDraft[] {
  const find = (key: string) => {
    for (const [g, group] of groups.entries()) {
      const m = group.members.findIndex((item) => item.key === key);
      if (m >= 0) return [g, m] as const;
    }
    return null;
  };
  const a = find(first);
  const b = find(second);
  if (!a || !b || first === second) return groups;
  const next = groups.map((group) => ({ ...group, members: [...group.members] }));
  const memberA = next[a[0]].members[a[1]];
  const memberB = next[b[0]].members[b[1]];
  next[a[0]].members[a[1]] = { ...memberB, role: memberA.role };
  next[b[0]].members[b[1]] = { ...memberA, role: memberB.role };
  return next;
}

export function defaultGroupNames(count: number) {
  return Array.from({ length: count }, (_, index) => `${index + 1}모둠`);
}
