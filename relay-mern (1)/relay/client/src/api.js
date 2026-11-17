export const getToken = () => localStorage.getItem("relay_token");
export const setToken = t => (t ? localStorage.setItem("relay_token", t) : localStorage.removeItem("relay_token"));
export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch("/api" + path, {
    method, body: body && JSON.stringify(body),
    headers: { "content-type": "application/json", ...(getToken() && { authorization: "Bearer " + getToken() }) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}
