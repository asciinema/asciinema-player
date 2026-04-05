function toErrorPayload(error) {
  return {
    name: typeof error?.name === "string" ? error.name : "Error",
    message: typeof error?.message === "string" ? error.message : String(error),
  };
}

function fromErrorPayload(payload) {
  const error = new Error(
    typeof payload?.message === "string" ? payload.message : "Unknown error",
  );
  error.name = typeof payload?.name === "string" ? payload.name : "Error";

  return error;
}

export { toErrorPayload, fromErrorPayload };
