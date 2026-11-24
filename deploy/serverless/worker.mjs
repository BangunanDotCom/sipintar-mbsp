// Deliberately inert. The D1 lab has no identity provider or production routes.
export default {
  fetch() {
    return new Response("STAYLink MBSP serverless lab: portal access unavailable.", {
      status: 503,
      headers: { "Cache-Control": "private, no-store", "Content-Type": "text/plain; charset=utf-8" },
    });
  },
};
