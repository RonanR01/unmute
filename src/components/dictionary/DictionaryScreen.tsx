import React, { useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { notify } from "@/stores/noticeStore";
import { useSettings } from "../../hooks/useSettings";
import { isComposingKeyEvent } from "../../lib/utils/keyboard";

const MAX_WORD_LENGTH = 50;

const normalizeWord = (word: string) =>
  word
    .replace(/[<>"']/g, "")
    .replace(/\s+/g, " ")
    .trim();

const FIELD =
  "min-h-11 px-3.5 rounded-[10px] bg-background border border-line-strong text-[15px] text-text placeholder:text-ink-3 focus:outline-2 focus:outline-text";
const ICON_BUTTON =
  "size-11 shrink-0 flex items-center justify-center rounded-[10px] text-ink-3 cursor-pointer transition-colors hover:text-text hover:bg-surface-raised disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-text";

export const DictionaryScreen: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting, updateSetting, isUpdating } = useSettings();
  const words: string[] = getSetting("custom_words") || [];
  const busy = isUpdating("custom_words");
  const [newWord, setNewWord] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  /** `word` cleaned up, or `null` (with a notice) when it can't be saved. */
  const validate = (word: string, replacing?: string) => {
    const normalized = normalizeWord(word);
    if (!normalized || normalized.length > MAX_WORD_LENGTH) return null;
    if (normalized !== replacing && words.includes(normalized)) {
      notify({
        title: t("settings.advanced.customWords.duplicate", {
          word: normalized,
        }),
      });
      return null;
    }
    return normalized;
  };

  const add = () => {
    const word = validate(newWord);
    if (!word) return;
    updateSetting("custom_words", [...words, word]);
    setNewWord("");
  };

  const saveEdit = () => {
    if (editing === null) return;
    const word = validate(draft, editing);
    if (!word) return;
    updateSetting(
      "custom_words",
      words.map((existing) => (existing === editing ? word : existing)),
    );
    setEditing(null);
  };

  const remove = (word: string) =>
    updateSetting(
      "custom_words",
      words.filter((existing) => existing !== word),
    );

  const onEnter =
    (action: () => void, cancel?: () => void) =>
    (event: React.KeyboardEvent) => {
      if (isComposingKeyEvent(event.nativeEvent)) return;
      if (event.key === "Enter") {
        event.preventDefault();
        action();
      } else if (event.key === "Escape" && cancel) {
        cancel();
      }
    };

  return (
    <div className="flex flex-col w-full max-w-3xl gap-7 px-8 py-8">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[28px] font-bold tracking-tight">
          {t("dictionary.title")}
        </h1>
        <p className="text-[15px] text-ink-3">{t("dictionary.subtitle")}</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex-1 min-w-52 flex flex-col gap-1.5 text-sm text-ink-3">
          {t("dictionary.newWord")}
          <input
            type="text"
            value={newWord}
            maxLength={MAX_WORD_LENGTH}
            onChange={(event) => setNewWord(event.target.value)}
            onKeyDown={onEnter(add)}
            placeholder={t("settings.advanced.customWords.placeholder")}
            disabled={busy}
            className={FIELD}
          />
        </label>
        <button
          type="button"
          onClick={add}
          disabled={busy || !normalizeWord(newWord)}
          className="min-h-11 px-5 rounded-[10px] bg-signal text-on-signal text-sm font-semibold cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
        >
          {t("settings.advanced.customWords.add")}
        </button>
      </div>

      {words.length === 0 ? (
        <p className="p-6 bg-surface border border-edge rounded-[14px] text-[15px] text-ink-3">
          {t("dictionary.empty")}
        </p>
      ) : (
        <ul className="flex flex-col bg-surface border border-edge rounded-[14px]">
          {words.map((word) => (
            <li
              key={word}
              className="flex items-center gap-2 ps-5 pe-2 py-1.5 border-t border-edge first:border-t-0"
            >
              {editing === word ? (
                <>
                  <input
                    type="text"
                    autoFocus
                    value={draft}
                    maxLength={MAX_WORD_LENGTH}
                    aria-label={t("dictionary.edit", { word })}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={onEnter(saveEdit, () => setEditing(null))}
                    className={`flex-1 min-w-0 ${FIELD}`}
                  />
                  <button
                    type="button"
                    onClick={saveEdit}
                    disabled={busy}
                    aria-label={t("dictionary.save")}
                    title={t("dictionary.save")}
                    className={ICON_BUTTON}
                  >
                    <Check size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    aria-label={t("dictionary.cancel")}
                    title={t("dictionary.cancel")}
                    className={ICON_BUTTON}
                  >
                    <X size={18} />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 min-w-0 truncate text-[15px] select-text">
                    {word}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(word);
                      setDraft(word);
                    }}
                    disabled={busy}
                    aria-label={t("dictionary.edit", { word })}
                    title={t("dictionary.edit", { word })}
                    className={ICON_BUTTON}
                  >
                    <Pencil size={17} />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(word)}
                    disabled={busy}
                    aria-label={t("settings.advanced.customWords.remove", {
                      word,
                    })}
                    title={t("settings.advanced.customWords.remove", { word })}
                    className={ICON_BUTTON}
                  >
                    <Trash2 size={17} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
