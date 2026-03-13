export function getErrorMessage(exception: unknown, fallback: string) {
  if (exception instanceof Error) {
    return exception.message;
  }

  if (exception && typeof exception === "object" && "message" in exception) {
    const message = (exception as { message?: unknown }).message;

    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return fallback;
}
