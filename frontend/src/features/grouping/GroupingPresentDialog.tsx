import * as Dialog from "@radix-ui/react-dialog";
import { memberLabel } from "./useGroupingPage";
import type { GroupingView } from "./GroupingPage";

/** 전자칠판 보기 창. */
export function GroupingPresentDialog({ view }: { view: GroupingView }) {
  const { draft, presentOpen, setPresentOpen, present, count } = view;
  return (
    <Dialog.Root open={presentOpen} onOpenChange={setPresentOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="grouping-present-overlay" />
        <Dialog.Content className="grouping-present" aria-describedby={undefined}>
          {draft && (
            <>
              <header>
                <Dialog.Title>{draft.title}</Dialog.Title>
                <Dialog.Close asChild>
                  <button type="button" className="grouping-present-close">
                    닫기 (Esc)
                  </button>
                </Dialog.Close>
              </header>
              <div className={`grouping-present-grid count-${Math.min(draft.groups.length, 10)}`}>
                {draft.groups.map((group, index) => (
                  <article key={index}>
                    <h3>{group.name}</h3>
                    <ul>
                      {group.members.map((member) => (
                        <li key={member.key}>
                          <b>{memberLabel(member)}</b>
                          {member.role && <span>{member.role}</span>}
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
