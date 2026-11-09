import { main as models } from "../../../wailsjs/go/models";
import { BulkArchiveDialog } from "./PhraseParts";
import { ListDialog, LimitsDialog, YearCleanupDialog } from "./RecordDialogs";
import type { RecordsView } from "./RecordsPage";

/** 활동 명단·글자 수 한도·학년도 기록 정리·한꺼번에 보관 창. */
export function RecordsPageDialogs({ page }: { page: RecordsView }) {
  const {
    book,
    setBook,
    setNotice,
    year,
    setTargetValue,
    setSelectedKey,
    listDialog,
    setListDialog,
    limitsOpen,
    setLimitsOpen,
    cleanupOpen,
    setCleanupOpen,
    bulkYear,
    setBulkYear,
    reload,
    onSaved,
    onDeleted,
    bulkCandidates,
    everyName,
  } = page;
  return (
    <>
      {listDialog && (
        <ListDialog
          list={listDialog}
          onClose={() => setListDialog(null)}
          onSaved={(saved) => {
            setBook((current) => {
              if (!current) return current;
              const lists = current.lists.filter((list) => list.id !== saved.id);
              lists.push(saved);
              return new models.RecordBook({ ...current, lists });
            });
            setTargetValue(`list:${saved.id}`);
            setSelectedKey("");
            setListDialog(null);
            setNotice(`활동 명단 '${saved.name}'(${saved.members.length}명)을 저장했습니다.`);
          }}
          onDeleted={async (name) => {
            setListDialog(null);
            setTargetValue("");
            setNotice(`활동 명단 '${name}'과 그 명단의 기록을 지웠습니다.`);
            await reload();
          }}
        />
      )}
      {limitsOpen && book && (
        <LimitsDialog
          limits={book.limits}
          onClose={() => setLimitsOpen(false)}
          onSaved={(limits) => {
            setBook(new models.RecordBook({ ...book, limits }));
            setLimitsOpen(false);
            setNotice("글자 수 한도를 저장했습니다.");
          }}
        />
      )}
      {cleanupOpen && book && (
        <YearCleanupDialog
          book={book}
          onClose={() => setCleanupOpen(false)}
          onBulk={(forYear) => {
            setCleanupOpen(false);
            setBulkYear(forYear);
          }}
          onDone={async (deletedYear, removed) => {
            setCleanupOpen(false);
            setNotice(`${deletedYear}학년도 기록 ${removed}건과 활동 명단을 지웠습니다.`);
            await reload();
          }}
        />
      )}
      {bulkYear && book && (
        <BulkArchiveDialog
          year={bulkYear}
          candidates={bulkCandidates(bulkYear)}
          existingTexts={new Set(book.phrases.map((phrase) => phrase.text))}
          names={everyName}
          onClose={() => setBulkYear(null)}
          onDone={async (added, skipped) => {
            setBulkYear(null);
            setNotice(
              `문장 보관함에 ${added}개를 넣었습니다.${skipped ? ` 이미 있던 ${skipped}개는 건너뛰었습니다.` : ""}`,
            );
            await reload();
          }}
        />
      )}
    </>
  );
}
