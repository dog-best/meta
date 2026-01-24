export function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function ok(body: unknown) {
  return json(200, body);
}

export function bad(message: string, extra: any = {}) {
  return json(400, { error: message, ...extra });
}

export function unauth() {
  return json(401, { error: "Unauthorized" });
}

export function methodNotAllowed() {
  return new Response("Method not allowed", { status: 405 });
}

export function requireFields(obj: any, fields: string[]) {
  for (const f of fields) {
    if (obj?.[f] === undefined || obj?.[f] === null || obj?.[f] === "") {
      throw new Error(`Missing field: ${f}`);
    }
  }
}
