const SCOPE = "channel:manage:broadcast";

export class TwitchError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

// Only fixed Twitch endpoints receive credentials. Never serialize this client.
export function createTwitchClient(accessToken, fetcher = fetch) {
  const token = String(accessToken).trim().replace(/^oauth:/i, "");
  async function request(url, options = {}) {
    let response;
    try {
      response = await fetcher(url, { ...options, signal: AbortSignal.timeout(12000), cache: "no-store" });
    } catch {
      throw new TwitchError("Twitch could not be reached. Check your connection and reload channel details before retrying an update.");
    }
    if (!response.ok) {
      const messages = {
        400: "Twitch rejected the update. Check the title and selected category.",
        401: "Twitch authorization expired or was revoked. Connect again with a new access token.",
        403: "Twitch denied access. Use the broadcaster’s token with channel:manage:broadcast permission.",
        429: "Twitch is rate limiting requests. Wait a moment and try again.",
      };
      throw new TwitchError(messages[response.status] || "Twitch could not complete the request. Reload channel details before retrying.", response.status);
    }
    return response.status === 204 ? null : response.json();
  }
  async function validate() {
    if (!token) throw new TwitchError("Enter a Twitch user access token.");
    const user = await request("https://id.twitch.tv/oauth2/validate", { headers: { Authorization: `OAuth ${token}` } });
    if (!user.user_id || !user.client_id || !user.scopes?.includes(SCOPE)) {
      throw new TwitchError("Use the broadcaster’s user access token with channel:manage:broadcast permission.", 403);
    }
    return user;
  }
  async function helix(user, route, options = {}) {
    return request(`https://api.twitch.tv/helix/${route}`, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, "Client-Id": user.client_id, "Content-Type": "application/json" },
    });
  }
  return {
    validate,
    async load() {
      const user = await validate();
      const result = await helix(user, `channels?broadcaster_id=${encodeURIComponent(user.user_id)}`);
      const channel = result.data?.[0];
      if (!channel) throw new TwitchError("Twitch returned no channel details.");
      return channel;
    },
    async search(query) {
      if (!query.trim()) throw new TwitchError("Enter a category to search for.");
      const user = await validate();
      const result = await helix(user, `search/categories?query=${encodeURIComponent(query.trim())}&first=50`);
      return result.data || [];
    },
    async update(broadcasterId, title, categoryId) {
      if (!title.trim() || Array.from(title.trim()).length > 140) throw new TwitchError("Enter a stream title between 1 and 140 characters.");
      if (categoryId !== "" && !/^\d+$/.test(categoryId)) throw new TwitchError("Select a category from the search results.");
      const user = await validate();
      if (user.user_id !== broadcasterId) throw new TwitchError("The connected broadcaster changed. Reconnect before updating.", 403);
      await helix(user, `channels?broadcaster_id=${encodeURIComponent(user.user_id)}`, {
        method: "PATCH",
        body: JSON.stringify({ title: title.trim(), game_id: categoryId }),
      });
    },
  };
}
