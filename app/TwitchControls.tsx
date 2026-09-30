"use client";

import { useEffect, useRef, useState } from "react";
import { createTwitchClient, TwitchError } from "../lib/twitch.mjs";

type Category = { id: string; name: string };
type Channel = { broadcaster_id: string; broadcaster_name: string; title: string; game_id: string; game_name: string };
type Client = ReturnType<typeof createTwitchClient>;

export function TwitchControls({ visible, enabled }: { visible: boolean; enabled: boolean }) {
  const [token, setToken] = useState("");
  const [client, setClient] = useState<Client | null>(null);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<Category>({ id: "", name: "No category" });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Category[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Connect the broadcaster’s Twitch account to edit its stream details.");
  const [error, setError] = useState(false);
  const working = useRef(false);
  const generation = useRef(0);

  useEffect(() => () => { generation.current += 1; }, []);

  useEffect(() => {
    if (!client) return;
    let active = true;
    const interval = setInterval(() => {
      void client.validate().catch((err: unknown) => {
        if (!active) return;
        if (err instanceof TwitchError && [401, 403].includes(err.status)) {
          generation.current += 1;
          setClient(null); setChannel(null); setToken("");
        }
        setError(true);
        setStatus(err instanceof Error ? err.message : "Twitch validation failed.");
      });
    }, 60 * 60 * 1000);
    return () => { active = false; clearInterval(interval); };
  }, [client]);

  async function run(action: () => Promise<void>) {
    if (working.current || !enabled) return;
    working.current = true; setBusy(true); setError(false);
    try { await action(); }
    catch (err) {
      if (err instanceof TwitchError && [401, 403].includes(err.status)) {
        generation.current += 1;
        setClient(null); setChannel(null); setToken("");
      }
      setError(true); setStatus(err instanceof Error ? err.message : "Twitch request failed.");
    } finally { working.current = false; setBusy(false); }
  }

  async function load(connection: Client) {
    const current = generation.current;
    const value: Channel = await connection.load();
    if (current !== generation.current) return;
    setClient(connection); setToken(""); setChannel(value); setTitle(value.title);
    setCategory({ id: value.game_id, name: value.game_name || "No category" });
    setResults([]); setQuery("");
    setStatus(`Loaded current stream details for ${value.broadcaster_name}.`);
  }

  const changed = channel && (title.trim() !== channel.title || category.id !== channel.game_id);
  return <div hidden={!visible} className="twitch-container">
    <section className="panel-card form-grid" aria-labelledby="twitch-heading" aria-busy={busy}>
      <div className="card-title-row"><div><h2 id="twitch-heading">Twitch stream</h2><p>{channel ? `Connected channel: ${channel.broadcaster_name}` : "Stream title and category"}</p></div></div>
      {!client ? <>
        <label className="field"><span className="field-label">Broadcaster user access token</span><input type="password" autoComplete="off" spellCheck={false} value={token} disabled={busy || !enabled} onChange={(event) => setToken(event.target.value)} /></label>
        <p className="twitch-help">Use a user access token with <code>channel:manage:broadcast</code> permission. The token stays in memory for this open page and is never exported. <a href="https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/" target="_blank" rel="noreferrer">Twitch token setup</a></p>
        <details className="twitch-token-guide twitch-help">
          <summary>How to get a Twitch token</summary>
          <ol>
            <li>Keep this tool running. Open the <a href="https://dev.twitch.tv/console/apps" target="_blank" rel="noreferrer">Twitch Developer Console</a>. Verify your email and enable two-factor authentication if prompted.</li>
            <li>Select <strong>Register Your Application</strong>. Enter a unique name, add <code>http://localhost:3000</code> as the OAuth Redirect URL, and choose an application category. If asked for a client type, select <strong>Confidential</strong> for this flow. Create the app.</li>
            <li>Open <strong>Manage</strong> for that app and copy its <strong>Client ID</strong>. You do not need to generate a client secret.</li>
            <li>Copy the address below into a new browser tab. Replace <code>YOUR_CLIENT_ID</code> with your Client ID and <code>YOUR_RANDOM_STATE</code> with a new random string that you keep for step 6.
              <code className="twitch-token-url">https://id.twitch.tv/oauth2/authorize?response_type=token&amp;client_id=YOUR_CLIENT_ID&amp;redirect_uri=http%3A%2F%2Flocalhost%3A3000&amp;scope=channel%3Amanage%3Abroadcast&amp;force_verify=true&amp;state=YOUR_RANDOM_STATE</code>
            </li>
            <li>Sign in as the <strong>channel owner</strong> whose stream you want to edit, then select <strong>Authorize</strong>.</li>
            <li>Twitch returns to the local tool. In that tab’s address bar, check that <code>state=</code> matches your random string. Copy only the text after <code>#access_token=</code> and before the next <code>&amp;</code>. Do not copy the entire address.</li>
            <li>Paste that value into <strong>Broadcaster user access token</strong> here, select <strong>Connect Twitch</strong>, and verify the displayed channel. Close the callback tab after copying the token.</li>
          </ol>
          <p>Keep the token and callback address private. If Twitch reports a redirect mismatch, use exactly <code>http://localhost:3000</code> in both the app registration and request. If your tool uses another port, change both addresses to match. For an expired token, repeat steps 4–7 with a new random state. A stream key, Client ID, or client secret cannot be used as the token.</p>
          <p>Official instructions: <a href="https://dev.twitch.tv/docs/authentication/register-app/" target="_blank" rel="noreferrer">Register an app</a> · <a href="https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#implicit-grant-flow" target="_blank" rel="noreferrer">Get a user token</a>.</p>
        </details>
        <div className="twitch-actions"><button className="button secondary" type="button" disabled={busy || !enabled || !token.trim()} onClick={() => void run(() => load(createTwitchClient(token)))}>Connect Twitch</button></div>
      </> : <>
        <label className="field"><span className="field-label">Stream title · {Array.from(title).length}/140</span><input value={title} maxLength={140} disabled={busy || !enabled} onChange={(event) => { setTitle(event.target.value); setStatus("Stream changes are not applied yet."); }} /></label>
        <div className="form-grid two">
          <form className="form-grid" onSubmit={(event) => { event.preventDefault(); void run(async () => {
            const current = generation.current;
            const matches = await client.search(query);
            if (current !== generation.current) return;
            setResults(matches); setStatus(matches.length ? "Choose a category from the results, then update the stream." : "No categories found. Try another search.");
          }); }}>
            <label className="field"><span className="field-label">Search Twitch categories</span><input value={query} disabled={busy || !enabled} onChange={(event) => { setQuery(event.target.value); setResults([]); }} placeholder="Rocket League" /></label>
            <div className="twitch-actions"><button className="button secondary" type="submit" disabled={busy || !enabled || !query.trim()}>Search categories</button></div>
          </form>
          <label className="field"><span className="field-label">Selected category</span><select value={category.id} disabled={busy || !enabled} onChange={(event) => {
            const selected = results.find((item) => item.id === event.target.value);
            if (selected) { setCategory(selected); setStatus("Stream changes are not applied yet."); }
          }}><option value={category.id}>{category.name}</option>{results.filter((item) => item.id !== category.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        </div>
        <div className="twitch-actions">
          <button className="button primary" type="button" disabled={busy || !enabled || !changed || !title.trim()} onClick={() => void run(async () => {
            if (!channel) return;
            const current = generation.current;
            await client.update(channel.broadcaster_id, title, category.id);
            if (current !== generation.current) return;
            setChannel({ ...channel, title: title.trim(), game_id: category.id, game_name: category.name });
            setTitle(title.trim()); setStatus(`Stream title and category updated on ${channel.broadcaster_name}.`);
          })}>Update Twitch stream</button>
          <button className="button secondary" type="button" disabled={busy || !enabled} onClick={() => void run(() => load(client))}>Reload channel details</button>
          <button className="button secondary" type="button" disabled={busy || !enabled} onClick={() => { generation.current += 1; setClient(null); setChannel(null); setToken(""); setError(false); setStatus("Twitch disconnected. The access token has been cleared from this page."); }}>Disconnect Twitch</button>
        </div>
        <p className="twitch-help">Updates apply to the connected Twitch channel only. Reloading replaces unsaved edits with current Twitch details.</p>
      </>}
      <p className="twitch-help" role={error ? "alert" : "status"}>{busy ? "Contacting Twitch…" : status}</p>
    </section>
  </div>;
}
