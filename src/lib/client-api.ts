export async function readApiError(
  response: Response,
  fallback: string
): Promise<string> {
  const payload = await response.json().catch(() => null);

  if (payload && typeof payload === "object") {
    const error = (payload as { error?: unknown; message?: unknown }).error;
    const message = (payload as { error?: unknown; message?: unknown }).message;

    if (typeof error === "string" && error.trim()) {
      return error;
    }
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return fallback;
}
