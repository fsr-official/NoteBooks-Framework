export const READER_CHAT_STORAGE_PREFIX = "notebooks:reader-chat:v1:";

export function clearReaderChatHistory(): number {
  const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
    .filter((key): key is string => key?.startsWith(READER_CHAT_STORAGE_PREFIX) === true);
  for (const key of keys) localStorage.removeItem(key);
  return keys.length;
}
