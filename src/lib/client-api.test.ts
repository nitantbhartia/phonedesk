import { describe, expect, it } from "vitest";

import { readApiError } from "./client-api";

describe("client-api", () => {
  it("prefers the error field, then message, then fallback", async () => {
    const errorResponse = new Response(JSON.stringify({ error: "Bad request" }));
    const messageResponse = new Response(JSON.stringify({ message: "Try again" }));
    const emptyResponse = new Response("not json");

    await expect(readApiError(errorResponse, "Fallback")).resolves.toBe("Bad request");
    await expect(readApiError(messageResponse, "Fallback")).resolves.toBe("Try again");
    await expect(readApiError(emptyResponse, "Fallback")).resolves.toBe("Fallback");
  });
});
