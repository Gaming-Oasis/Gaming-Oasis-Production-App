/** Parse a JSON response without buffering more than maximumBytes, whether or not a length is declared. */
export async function readBoundedJson(response, { maximumBytes, abort = () => {}, message = "Response is too large" }) {
  const declaredLength = Number.parseInt(response.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    abort();
    throw new Error(message);
  }
  const chunks = [];
  let receivedBytes = 0;
  if (response.body) {
    const reader = response.body.getReader();
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      receivedBytes += chunk.byteLength;
      if (receivedBytes > maximumBytes) {
        abort();
        throw new Error(message);
      }
      chunks.push(chunk);
    }
  }
  const bytes = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
