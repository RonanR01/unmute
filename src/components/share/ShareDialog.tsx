import React, { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Download, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { commands } from "@/bindings";
import { notify } from "@/stores/noticeStore";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  renderShareCard,
  type ShareCard,
} from "@/lib/shareCard";
import { Dialog } from "../ui/Dialog";

/** LinkedIn's composer; it takes no image by link, so the user attaches it. */
const LINKEDIN_COMPOSER = "https://www.linkedin.com/feed/?shareActive=true";

const ACTION =
  "min-h-11 px-4 flex items-center justify-center gap-2 rounded-[10px] text-sm font-semibold cursor-pointer transition-opacity disabled:opacity-50 disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text";

interface ShareDialogProps {
  /** The card to share; `null` keeps the dialog closed. */
  card: ShareCard | null;
  /** The saved file's name, without extension. */
  fileName: string;
  onClose: () => void;
}

/** Previews a share card, saves it, and opens LinkedIn to post it. */
export const ShareDialog: React.FC<ShareDialogProps> = ({
  card,
  fileName,
  onClose,
}) => {
  const { t } = useTranslation();
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setImage(null);
    setSavedPath(null);
    if (!card) return;
    let cancelled = false;
    let url: string | null = null;
    renderShareCard(card)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setImage({ blob, url });
      })
      .catch((error) => {
        console.error("Failed to draw the share card:", error);
        if (!cancelled) notify({ title: t("share.drawFailed") });
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [card, t]);

  const save = async (): Promise<string | null> => {
    if (!image) return null;
    if (savedPath) return savedPath;
    setSaving(true);
    try {
      const bytes = Array.from(new Uint8Array(await image.blob.arrayBuffer()));
      const result = await commands.saveShareCard(bytes, fileName);
      if (result.status !== "ok") {
        notify({ title: t("share.saveFailed"), detail: result.error });
        return null;
      }
      setSavedPath(result.data);
      return result.data;
    } finally {
      setSaving(false);
    }
  };

  const postOnLinkedIn = async () => {
    if (!(await save())) return;
    await commands.recordCardShared();
    await openUrl(LINKEDIN_COMPOSER);
  };

  return (
    <Dialog
      open={card !== null}
      title={t("share.title")}
      description={t("share.description")}
      closeLabel={t("common.close")}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={save}
            disabled={!image || saving}
            className={`${ACTION} border border-line-strong text-text hover:opacity-80`}
          >
            <Download size={16} />
            {t("share.save")}
          </button>
          <button
            type="button"
            onClick={postOnLinkedIn}
            disabled={!image || saving}
            className={`${ACTION} bg-signal text-on-signal hover:opacity-90`}
          >
            <ExternalLink size={16} />
            {t("share.linkedin")}
          </button>
        </div>
      }
    >
      <div className="flex flex-col items-center gap-3">
        <div
          className="w-full max-w-[280px] overflow-hidden rounded-xl border border-edge bg-surface"
          style={{ aspectRatio: `${CARD_WIDTH} / ${CARD_HEIGHT}` }}
        >
          {image && (
            <img
              src={image.url}
              alt={t("share.previewAlt")}
              className="size-full"
            />
          )}
        </div>
        <p aria-live="polite" className="text-center text-[13px] text-ink-3">
          {savedPath ? t("share.saved") : t("share.hint")}
        </p>
      </div>
    </Dialog>
  );
};
