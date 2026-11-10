import { useEffect, useRef, useState } from "react";
import { GetSurveyImage, SaveSurveyImage } from "../../../bindings/TeacherNote/app";
import { errorMessage } from "../shared/format";
import { MAX_IMAGE_BYTES, dataURLBytes, fitImageSize } from "./surveyMediaState";

// 설문 그림 화면 부품: 그림 고르기(줄여서 암호화 저장)와 그림 보이기.
// 같은 그림을 여러 곳(문항 카드·미리보기·결과)에서 보이므로 한 번 읽은 그림은 화면이 열려 있는 동안 기억한다.

const cache = new Map<string, Promise<string>>();

function loadImage(id: string) {
  let pending = cache.get(id);
  if (!pending) {
    pending = GetSurveyImage(id);
    pending.catch(() => cache.delete(id));
    cache.set(id, pending);
  }
  return pending;
}

/** 저장된 설문 그림 한 장. 파일을 못 찾으면 안내 글을 보인다. */
export function SurveyImage({ imageId, alt, className }: { imageId: string; alt: string; className?: string }) {
  const [state, setState] = useState<{ id: string; url: string; failed: boolean }>({ id: "", url: "", failed: false });
  useEffect(() => {
    let alive = true;
    loadImage(imageId).then(
      (url) => alive && setState({ id: imageId, url, failed: false }),
      () => alive && setState({ id: imageId, url: "", failed: true }),
    );
    return () => { alive = false; };
  }, [imageId]);
  if (state.id !== imageId) return <span className={`survey-image loading ${className || ""}`} aria-label="그림 여는 중" />;
  if (state.failed) return <span className={`survey-image missing ${className || ""}`}>그림 파일 없음</span>;
  return <img className={`survey-image ${className || ""}`} src={state.url} alt={alt} />;
}

/** 고른 그림 파일을 긴 변 1280px JPEG로 줄인다(투명한 곳은 흰 바탕). */
async function shrinkImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("그림 파일을 열지 못했습니다. JPG·PNG·WEBP 그림을 골라 주세요.");
  });
  const size = fitImageSize(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("그림을 줄이지 못했습니다.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size.width, size.height);
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  for (const quality of [0.85, 0.7, 0.55]) {
    const dataURL = canvas.toDataURL("image/jpeg", quality);
    if (dataURLBytes(dataURL) <= MAX_IMAGE_BYTES) return dataURL;
  }
  throw new Error("그림이 너무 큽니다. 더 작은 그림을 골라 주세요.");
}

type PickProps = {
  label: string;
  ariaLabel: string;
  disabled: boolean;
  imagesLeft: number;
  className?: string;
  onPicked: (imageId: string) => void;
  onNotice: (message: string) => void;
};

/** "그림 넣기" 버튼: 파일을 고르면 줄여서 보관함에 암호화 저장하고 그림 번호를 넘긴다. */
export function ImagePickButton({ label, ariaLabel, disabled, imagesLeft, className, onPicked, onNotice }: PickProps) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    if (imagesLeft <= 0) {
      onNotice("그림은 설문 하나에 20장까지 넣을 수 있습니다.");
      return;
    }
    setBusy(true);
    onNotice("");
    try {
      const id = await SaveSurveyImage(await shrinkImage(file));
      onPicked(id);
    } catch (error) {
      onNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={className || "text-button"} disabled={disabled || busy} aria-label={ariaLabel} onClick={() => input.current?.click()}>
        {busy ? "그림 넣는 중…" : label}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void pick(file);
        }}
      />
    </>
  );
}
